"""Walidacja MAPOWANIA parametrów na PRZYPADKACH AUTORSTWA ANDES.

KOD BADAWCZY — patrz `backend/research/README.md`.

PROBLEM, KTÓRY TEN MODUŁ ROZWIĄZUJE
-----------------------------------
``wzorzec_zewnetrzny.py`` porównuje nasz wynik z ANDES na przypadku, który
**my zbudowaliśmy**: to my przypisujemy ``M = 2H``, ``xd1 = X'd``, ``fn``,
to my konstruujemy ``PV``/``Slack``/``Line``. ANDES jest niezależną
IMPLEMENTACJĄ, ale adapter jest nasz — więc wspólny błąd INTERPRETACJI WEJŚCIA
skaziłby obie strony porównania i zgodność do 1e-9 by go nie wykryła.
Zgodność dwóch programów nie zastępuje sprawdzenia, czy karmimy je tym samym.

CO ROBI TEN MODUŁ
-----------------
Bierze przypadek **dostarczony z ANDES** (``cases/smib/SMIB.xlsx`` — parametry
napisane przez autorów ANDES, nie przez nas), odczytuje jego pola i sprawdza,
czy NASZA interpretacja tych pól odtwarza WARTOŚĆ WŁASNĄ, którą ANDES sam
policzył. Jeżeli ``M`` nie znaczyłoby ``2H``, ``xd1`` nie byłoby reaktancją
przejściową, ``fn`` nie byłoby bazą, a ``D`` nie wchodziłoby jako ``D(ω−1)`` —
liczba by nie wyszła.

To jest walidacja MAPOWANIA, nie fizyki: sprawdzamy, czy rozumiemy wejście.
Fizykę sprawdzają ``WyroczniaWahan`` (małosygnałowo) i ``WyroczniaRownychPol``
(dużosygnałowo).

DLACZEGO TU NIE OBOWIĄZUJE STRAŻNIK BAZY 50 Hz
----------------------------------------------
Przypadek natywny jest 60-hercowy i tak ma zostać — nie wolno go „poprawiać".
Nie porównujemy tu naszej TRAJEKTORII z ANDES (tam baza musi się zgadzać), tylko
nasz WZÓR, do którego pulsacja wchodzi jako parametr odczytany z przypadku.
Zmiana bazy jest wtedy sprawdzianem, a nie zagrożeniem: gdyby nasza
interpretacja ``fn`` była błędna, wynik rozjechałby się o ``√(60/50)``.

ZMIERZONY WYNIK (SMIB.xlsx, ANDES 2.0.0)
----------------------------------------
Odczytane z przypadku: ``M = 5,7512`` (⇒ ``H = 2,8756 s``), ``D = 1,0``,
``xd1 = 0,245``, ``fn = 60 Hz``; sieć ``0,15 + (0,4 ∥ 0,4) = 0,35``;
punkt pracy ``δ₀ = 0,490487621 rad``, ``E' = 1,136807303 pu``.

| Wielkość | Wartość |
|---|---|
| ``f`` z naszego wzoru, bez tłumienia | 1,672827 Hz |
| ``f`` z naszego wzoru, z tłumieniem ``ζ = 0,008271`` | **1,672770 Hz** |
| ``f`` z WARTOŚCI WŁASNEJ ANDES | **1,672770 Hz** |
| błąd względny (z tłumieniem) | **6,5e-08** |
| błąd względny (gdyby pominąć tłumienie) | 3,4e-05 |

Poprawa o trzy rzędy wielkości po uwzględnieniu tłumienia jest osobną
informacją: potwierdza, że ``D`` w ANDES wchodzi do równania wahań tak samo
jak u nas (``D(ω−1)``), a nie np. jako tłumienie asynchroniczne.
"""

from __future__ import annotations

import contextlib
import io
import math
from dataclasses import dataclass
from typing import Any

#: Przypadek dostarczany z ANDES. Parametry NIE są nasze — to jest cała wartość.
PRZYPADEK_SMIB = "smib/SMIB.xlsx"


class BrakPrzypadkuNatywnegoError(RuntimeError):
    """Nie da się wczytać przypadku wzorcowego — brak porównania, nie zgodność."""


@dataclass(frozen=True)
class ParametryNatywne:
    """Pola odczytane z przypadku ANDES + nasza interpretacja tych pól."""

    zrodlo: str
    m_pu: float
    """Pole ``M`` maszyny. NASZA interpretacja: ``M = 2H``."""
    d_tlumienie: float
    xd_prim_pu: float
    fn_hz: float
    delta0_rad: float
    e_prim_pu: float
    x_zewnetrzna_pu: float
    f_wlasna_andes_hz: float

    @property
    def h_s(self) -> float:
        return self.m_pu / 2.0

    @property
    def omega_s(self) -> float:
        return 2.0 * math.pi * self.fn_hz

    @property
    def x_calkowite_pu(self) -> float:
        return self.xd_prim_pu + self.x_zewnetrzna_pu

    @property
    def moc_synchronizujaca(self) -> float:
        return self.e_prim_pu * math.cos(self.delta0_rad) / self.x_calkowite_pu

    @property
    def f_wlasna_nietlumiona_hz(self) -> float:
        return math.sqrt(self.omega_s * self.moc_synchronizujaca / self.m_pu) / (2.0 * math.pi)

    @property
    def wspolczynnik_tlumienia(self) -> float:
        return self.d_tlumienie / (
            2.0 * math.sqrt(self.m_pu * self.omega_s * self.moc_synchronizujaca)
        )

    @property
    def f_tlumiona_hz(self) -> float:
        """Częstotliwość TŁUMIONA — to ją zwraca wartość własna z ``D > 0``."""
        zeta = self.wspolczynnik_tlumienia
        if zeta >= 1.0:
            raise ValueError(
                f"Tłumienie krytyczne lub nadkrytyczne (ζ = {zeta:.4f}) — "
                "nie ma częstotliwości oscylacji do porównania."
            )
        return self.f_wlasna_nietlumiona_hz * math.sqrt(1.0 - zeta**2)

    @property
    def blad_wzgledny(self) -> float:
        return abs(self.f_tlumiona_hz - self.f_wlasna_andes_hz) / self.f_wlasna_andes_hz

    @property
    def blad_gdyby_pominac_tlumienie(self) -> float:
        return abs(self.f_wlasna_nietlumiona_hz - self.f_wlasna_andes_hz) / self.f_wlasna_andes_hz


def _wczytaj(nazwa_przypadku: str) -> Any:
    try:
        import andes
        from andes.utils.paths import get_case
    except Exception as wyjatek:  # noqa: BLE001 - każdy powód braku znaczy to samo
        raise BrakPrzypadkuNatywnegoError(
            "ANDES nie jest zainstalowany — brak przypadku wzorcowego. "
            "Brak porównania NIE jest zgodnością."
        ) from wyjatek
    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        system = andes.load(get_case(nazwa_przypadku), setup=True, no_output=True)
        if not system.PFlow.run():
            raise BrakPrzypadkuNatywnegoError(
                f"{nazwa_przypadku}: rozpływ nie zbiegł — brak punktu odniesienia"
            )
        system.TDS.init()
        system.EIG.run()
    return system


def _indeks_maszyny_rzeczywistej(model: Any) -> int:
    """Wskaż maszynę FIZYCZNĄ, odrzucając zastępnik szyny nieskończonej.

    Przypadek SMIB modeluje szynę sztywną jako drugą maszynę o ogromnej
    bezwładności (``M ≈ 6e7``) i zerowej reaktancji. Wybór „pierwszej z brzegu"
    działałby przypadkiem; wybór po NAJMNIEJSZEJ bezwładności jest kryterium.
    """
    bezwladnosci = [float(v) for v in model.M.v]
    return min(range(len(bezwladnosci)), key=lambda i: bezwladnosci[i])


def parametry_smib_natywnego(*, x_zewnetrzna_pu: float = 0.35) -> ParametryNatywne:
    """Odczytaj przypadek SMIB dostarczony z ANDES i jego wartość własną.

    ``x_zewnetrzna_pu`` jest liczone z topologii przypadku:
    ``0,15`` szeregowo plus dwie równoległe gałęzie ``0,4`` (``0,4 ∥ 0,4 = 0,2``).
    Podane jawnie jako parametr, bo to JEDYNA wielkość, którą tu wyprowadzamy z
    topologii ręcznie — i gdyby przypadek się zmienił, ma to być widoczne
    założenie, a nie ukryta stała.
    """
    system = _wczytaj(PRZYPADEK_SMIB)
    maszyny = system.GENCLS
    if maszyny.n < 1:
        raise BrakPrzypadkuNatywnegoError("Przypadek nie zawiera maszyny GENCLS")
    i = _indeks_maszyny_rzeczywistej(maszyny)
    oscylacyjne = [w for w in system.EIG.mu if abs(w.imag) > 1.0e-9]
    if not oscylacyjne:
        raise BrakPrzypadkuNatywnegoError(
            "Przypadek nie ma pary oscylacyjnej — brak wielkości do porównania"
        )
    return ParametryNatywne(
        zrodlo=PRZYPADEK_SMIB,
        m_pu=float(maszyny.M.v[i]),
        d_tlumienie=float(maszyny.D.v[i]),
        xd_prim_pu=float(maszyny.xd1.v[i]),
        fn_hz=float(maszyny.fn.v[i]),
        delta0_rad=float(maszyny.delta.v[i]),
        e_prim_pu=float(maszyny.vf.v[i]),
        x_zewnetrzna_pu=x_zewnetrzna_pu,
        f_wlasna_andes_hz=min(abs(w.imag) / (2.0 * math.pi) for w in oscylacyjne),
    )


def raport() -> str:
    """Tabela do meldunku — liczby, nie przymiotniki."""
    p = parametry_smib_natywnego()
    return "\n".join(
        [
            f"PRZYPADEK NATYWNY: {p.zrodlo} (parametry autorstwa ANDES)",
            f"  M = {p.m_pu:g}  ->  H = {p.h_s:.4f} s     D = {p.d_tlumienie:g}",
            f"  xd1 = {p.xd_prim_pu:g}   fn = {p.fn_hz:g} Hz   X_calk = {p.x_calkowite_pu:.4f}",
            f"  delta0 = {p.delta0_rad:.9f} rad     E' = {p.e_prim_pu:.9f} pu",
            f"  f nasz wzor (bez tlumienia) = {p.f_wlasna_nietlumiona_hz:.6f} Hz",
            f"  f nasz wzor (z tlumieniem)  = {p.f_tlumiona_hz:.6f} Hz  (zeta={p.wspolczynnik_tlumienia:.6f})",
            f"  f wartosc wlasna ANDES      = {p.f_wlasna_andes_hz:.6f} Hz",
            f"  blad wzgledny               = {p.blad_wzgledny:.3e}",
            f"  blad gdyby pominac tlumienie= {p.blad_gdyby_pominac_tlumienie:.3e}",
        ]
    )
