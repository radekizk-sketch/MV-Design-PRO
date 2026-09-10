"""Poziom 4 drabiny: zgodność z NIEZALEŻNYM narzędziem dynamicznym (ANDES).

KOD BADAWCZY — patrz `backend/research/README.md`.

Po co ten moduł istnieje
------------------------
Wyrocznia analityczna (`walidacja.WyroczniaWahan`) dowodzi, że równania
laboratorium zgadzają się z linearyzacją, którą sam wyprowadziłem. To mocny,
ale WEWNĘTRZNY dowód: gdyby moje wyprowadzenie i mój model miały ten sam błąd
koncepcyjny, oba byłyby zgodne i oba błędne. Dlatego potrzebny jest wzorzec,
którego autorem nie jest ten kod.

ANDES (https://github.com/CURENT/andes, licencja Apache-2.0) liczy dynamikę RMS
własnym, niezależnym zestawem równań i własnym solverem, a dodatkowo daje
WARTOŚCI WŁASNE — czyli odpowiedź, która nie dzieli z laboratorium żadnego
założenia numerycznego o całkowaniu. Porównanie „nasza trajektoria vs cudze
wartości własne" jest więc mocniejsze niż porównanie dwóch trajektorii.

Co ten moduł WALIDUJE, a czego NIE
----------------------------------
WALIDUJE:
  - rozwiązanie algebraiczne sieci laboratorium (V w węźle maszyny — moduł i kąt),
  - procedurę inicjalizacji maszyny (``delta0``, ``E'``),
  - częstotliwość wahań elektromechanicznych (dynamika + całkowanie).
NIE WALIDUJE:
  - rozpływu z węzłami PV — laboratorium go nie ma (``rozplyw_ustalony`` obsługuje
    PQ + szynę sztywną). Punkt pracy jest zadany mocą zespoloną odczytaną z
    rozwiązania ANDES, a laboratorium musi z niej ODTWORZYĆ to samo napięcie;
  - modeli falownikowych (GFL/GFM) — GENCLS jest maszyną klasyczną,
  - regulatorów (AVR/turbina) — przypadek odniesienia jest bez regulacji,
  - niczego, co dotyczy przydatności DOWODOWEJ. Ten moduł nie nadaje żadnego
    statusu dowodowego; o tym rozstrzyga wyłącznie rejestr proweniencji
    produkcji (``solver_input.provenance``).

PUŁAPKA BAZY CZĘSTOTLIWOŚCI (zmierzona, nie domniemana)
-------------------------------------------------------
ANDES domyślnie pracuje na 60 Hz. ``ss.config.freq = 50.0`` **nie działa** —
ustawienie przed ``setup()`` nie zmienia pulsacji użytej przez model maszyny.
Skuteczny jest wyłącznie parametr ``fn`` PODAWANY PRZY URZĄDZENIU
(``GENCLS(..., fn=50)`` oraz ``Line(..., fn=50)``).

Skutek pominięcia: ``omega_n ~ sqrt(omega_s)``, więc częstotliwość wahań wychodzi
o ``sqrt(60/50) = 1.0954`` (czyli 9,5%) za wysoko. To jest dokładnie ta klasa
błędu, która daje wynik „wiarygodnie wyglądający, a fizycznie z innej sieci".
Dlatego moduł SPRAWDZA bazę jawnie (``_sprawdz_baze_czestotliwosci``) i podnosi
``NiezgodnaBazaCzestotliwosciError`` zamiast po cichu przeskalować wynik.
Przeskalowanie byłoby fabrykacją zgodności: „dopasowaniem" wzorca do modelu
wzorem, który wzorzec ma właśnie sprawdzić.

DŁUG ZAPISANY JAWNIE
--------------------
Testy tego wzorca są w ``tests/research`` bramkowane ``importorskip("andes")``,
bo ANDES nie jest zależnością repozytorium. To JEST ten sam wzorzec „uśpionego
dowodu", który audyt wytknął testom porównawczym z pandapower (istnieją, nigdy
się nie wykonują, a mimo to były opisywane jako „formalny dowód poprawności").
Uczciwa konsekwencja: dopóki ANDES nie jest zależnością deweloperską wpiętą w
CI, ten wzorzec jest NARZĘDZIEM BADAWCZYM, a nie obowiązującą bramką. Wniosek
i rekomendacja są zapisane w pakiecie decyzyjnym (pozycja D-13).
"""

from __future__ import annotations

import contextlib
import io
import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from dynamic_lab.benchmarki import maszyna_klasyczna
from dynamic_lab.konwencje import F_BAZOWA_HZ, OMEGA_S
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import ZespolSynchroniczny
from dynamic_lab.walidacja import WyroczniaWahan, zmierz_czestotliwosc_oscylacji


class BrakWzorcaError(RuntimeError):
    """Narzędzie wzorcowe nie jest zainstalowane — brak porównania, nie „zgodność"."""


class NiezgodnaBazaCzestotliwosciError(RuntimeError):
    """Wzorzec liczy na innej częstotliwości bazowej niż laboratorium."""


def czy_wzorzec_dostepny() -> bool:
    """Czy da się wykonać porównanie z narzędziem zewnętrznym."""
    try:
        import andes  # noqa: F401
    except Exception:  # noqa: BLE001 - każdy powód braku znaczy to samo
        return False
    return True


def wersja_wzorca() -> str:
    import andes

    return f"ANDES {andes.__version__}"


@dataclass(frozen=True)
class PrzypadekSMIB:
    """Wspólna specyfikacja przypadku dla OBU narzędzi.

    Jedna struktura karmi ANDES i laboratorium, więc nie da się porównać dwóch
    RÓŻNYCH układów i uznać rozbieżności za błąd modelu (albo — gorzej — zgodności
    za dowód).
    """

    xd_prim_pu: float = 0.30
    h_s: float = 4.0
    d_tlumienie: float = 0.0
    x_linii_pu: float = 0.15
    p_gen_pu: float = 0.50
    v_gen_pu: float = 1.00
    v_sys_pu: float = 1.00
    s_bazowa_mva: float = 100.0
    u_znamionowe_kv: float = 110.0

    @property
    def x_calkowite_pu(self) -> float:
        return self.xd_prim_pu + self.x_linii_pu


@dataclass(frozen=True)
class WynikWzorca:
    """Wielkości porównywalne między narzędziami — z jawnym źródłem i metodą."""

    zrodlo: str
    metoda: str
    delta0_rad: float
    e_prim_pu: float
    v_gen_modul_pu: float
    v_gen_kat_rad: float
    q_gen_pu: float
    f_oscylacji_hz: float
    baza_czestotliwosci_hz: float


@dataclass(frozen=True)
class PorownanieWzorca:
    """Wynik porównania trzech niezależnych dróg do tej samej liczby."""

    wzorzec: WynikWzorca
    laboratorium: WynikWzorca
    analityczne: WynikWzorca

    @staticmethod
    def _blad_wzgledny(odniesienie: float, badane: float) -> float:
        if abs(odniesienie) < 1.0e-12:
            return abs(badane)
        return abs(badane - odniesienie) / abs(odniesienie)

    @property
    def blad_delta0(self) -> float:
        return self._blad_wzgledny(self.wzorzec.delta0_rad, self.laboratorium.delta0_rad)

    @property
    def blad_e_prim(self) -> float:
        return self._blad_wzgledny(self.wzorzec.e_prim_pu, self.laboratorium.e_prim_pu)

    @property
    def blad_napiecia_modul(self) -> float:
        return self._blad_wzgledny(self.wzorzec.v_gen_modul_pu, self.laboratorium.v_gen_modul_pu)

    @property
    def blad_napiecia_kat(self) -> float:
        return self._blad_wzgledny(self.wzorzec.v_gen_kat_rad, self.laboratorium.v_gen_kat_rad)

    @property
    def blad_czestotliwosci_lab(self) -> float:
        return self._blad_wzgledny(self.wzorzec.f_oscylacji_hz, self.laboratorium.f_oscylacji_hz)

    @property
    def blad_czestotliwosci_analitycznej(self) -> float:
        return self._blad_wzgledny(self.wzorzec.f_oscylacji_hz, self.analityczne.f_oscylacji_hz)

    def raport(self) -> str:
        w, lab, ana = self.wzorzec, self.laboratorium, self.analityczne
        return "\n".join(
            [
                f"WZORZEC       : {w.zrodlo} ({w.metoda}), baza {w.baza_czestotliwosci_hz:g} Hz",
                f"  delta0      : {w.delta0_rad:.9f} rad  | lab {lab.delta0_rad:.9f}"
                f"  | blad {self.blad_delta0:.3e}",
                f"  E'          : {w.e_prim_pu:.9f} pu   | lab {lab.e_prim_pu:.9f}"
                f"  | blad {self.blad_e_prim:.3e}",
                f"  |V_gen|     : {w.v_gen_modul_pu:.9f} pu | lab {lab.v_gen_modul_pu:.9f}"
                f"  | blad {self.blad_napiecia_modul:.3e}",
                f"  arg(V_gen)  : {w.v_gen_kat_rad:.9f} rad | lab {lab.v_gen_kat_rad:.9f}"
                f"  | blad {self.blad_napiecia_kat:.3e}",
                f"  f_oscylacji : {w.f_oscylacji_hz:.6f} Hz | lab {lab.f_oscylacji_hz:.6f}"
                f"  | blad {self.blad_czestotliwosci_lab:.3e}",
                f"                {' ' * 14}| wzor analityczny {ana.f_oscylacji_hz:.6f}"
                f" | blad {self.blad_czestotliwosci_analitycznej:.3e}",
            ]
        )


# ---------------------------------------------------------------------------
# Wzorzec zewnętrzny
# ---------------------------------------------------------------------------


def _sprawdz_baze_czestotliwosci(uzyta_hz: float) -> None:
    """Wzorzec MUSI liczyć na tej samej częstotliwości bazowej co laboratorium."""
    if abs(uzyta_hz - F_BAZOWA_HZ) > 1.0e-9:
        raise NiezgodnaBazaCzestotliwosciError(
            f"Wzorzec liczy na {uzyta_hz:g} Hz, laboratorium na {F_BAZOWA_HZ:g} Hz. "
            f"Czestotliwosc wahan skaluje sie jak sqrt(omega_s), wiec porownanie "
            f"bylo by obarczone czynnikiem sqrt({uzyta_hz:g}/{F_BAZOWA_HZ:g}) = "
            f"{math.sqrt(uzyta_hz / F_BAZOWA_HZ):.4f}. Ustaw `fn` PRZY URZADZENIU "
            f"(ss.config.freq NIE dziala) — przeskalowanie wyniku jest zakazane."
        )


def _zbuduj_andes(przypadek: PrzypadekSMIB, *, fn_hz: float) -> Any:
    """Zbuduj i rozwiąż SMIB w ANDES. ``fn_hz`` jest jawny, żeby dało się go zepsuć w teście."""
    import andes

    ss = andes.System()
    ss.add(
        "Bus", {"idx": 1, "Vn": przypadek.u_znamionowe_kv, "v0": przypadek.v_gen_pu, "name": "GEN"}
    )
    ss.add(
        "Bus",
        {
            "idx": 2,
            "Vn": przypadek.u_znamionowe_kv,
            "v0": przypadek.v_sys_pu,
            "a0": 0.0,
            "name": "SYS",
        },
    )
    ss.add(
        "Line",
        {
            "idx": 1,
            "bus1": 1,
            "bus2": 2,
            "r": 0.0,
            "x": przypadek.x_linii_pu,
            "b": 0.0,
            "fn": fn_hz,
            "Sn": przypadek.s_bazowa_mva,
        },
    )
    ss.add(
        "PV",
        {
            "idx": 1,
            "bus": 1,
            "p0": przypadek.p_gen_pu,
            "v0": przypadek.v_gen_pu,
            "Sn": przypadek.s_bazowa_mva,
            "qmax": 99.0,
            "qmin": -99.0,
        },
    )
    ss.add(
        "Slack",
        {
            "idx": 2,
            "bus": 2,
            "v0": przypadek.v_sys_pu,
            "a0": 0.0,
            "Sn": przypadek.s_bazowa_mva,
            "qmax": 99.0,
            "qmin": -99.0,
        },
    )
    ss.add(
        "GENCLS",
        {
            "idx": 1,
            "bus": 1,
            "gen": 1,
            "Sn": przypadek.s_bazowa_mva,
            "Vn": przypadek.u_znamionowe_kv,
            "fn": fn_hz,
            "D": przypadek.d_tlumienie,
            "M": 2.0 * przypadek.h_s,
            "ra": 0.0,
            "xd1": przypadek.xd_prim_pu,
            "xl": 0.0,
        },
    )
    # ANDES pisze obszerny log na stdout — ucisz go, ale NIE ukrywaj wyjątków.
    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        ss.setup()
        if not ss.PFlow.run():
            raise BrakWzorcaError("ANDES: rozpływ mocy nie zbiegł — brak punktu odniesienia")
        ss.TDS.init()
        ss.EIG.run()
    return ss


def wynik_wzorca(
    przypadek: PrzypadekSMIB | None = None, *, fn_hz: float | None = None
) -> WynikWzorca:
    """Rozwiązanie wzorcowe z ANDES: punkt pracy + częstotliwość z WARTOŚCI WŁASNYCH."""
    if not czy_wzorzec_dostepny():
        raise BrakWzorcaError(
            "ANDES nie jest zainstalowany. Brak wzorca to BRAK PORÓWNANIA — "
            "nie wolno tego raportować jako zgodności."
        )
    przypadek = przypadek or PrzypadekSMIB()
    uzyte_fn = F_BAZOWA_HZ if fn_hz is None else fn_hz
    ss = _zbuduj_andes(przypadek, fn_hz=uzyte_fn)
    _sprawdz_baze_czestotliwosci(float(ss.GENCLS.fn.v[0]))

    v_modul = float(ss.Bus.v.v[0])
    v_kat = float(ss.Bus.a.v[0])
    i_d = float(ss.GENCLS.Id.v[0])
    i_q = float(ss.GENCLS.Iq.v[0])
    v_d = float(ss.GENCLS.vd.v[0])
    v_q = float(ss.GENCLS.vq.v[0])
    q_gen = v_q * i_d - v_d * i_q

    czestotliwosci = sorted(
        abs(w.imag) / (2.0 * math.pi) for w in ss.EIG.mu if abs(w.imag) > 1.0e-9
    )
    if not czestotliwosci:
        raise BrakWzorcaError(
            "ANDES nie zwrócił żadnej pary oscylacyjnej — brak wielkości do porównania"
        )
    return WynikWzorca(
        zrodlo=wersja_wzorca(),
        metoda="wartości własne linearyzacji (EIG)",
        delta0_rad=float(ss.GENCLS.delta.v[0]),
        e_prim_pu=float(ss.GENCLS.vf.v[0]),
        v_gen_modul_pu=v_modul,
        v_gen_kat_rad=v_kat,
        q_gen_pu=q_gen,
        f_oscylacji_hz=czestotliwosci[0],
        baza_czestotliwosci_hz=float(ss.GENCLS.fn.v[0]),
    )


# ---------------------------------------------------------------------------
# Laboratorium na TYM SAMYM przypadku
# ---------------------------------------------------------------------------


def _model_laboratorium(
    przypadek: PrzypadekSMIB,
) -> tuple[ModelDynamiczny, ZespolSynchroniczny]:
    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[Galaz("GEN", "SYS", r_pu=0.0, x_pu=przypadek.x_linii_pu)],
        szyny_sztywne={"SYS": complex(przypadek.v_sys_pu, 0.0)},
    )
    zespol = ZespolSynchroniczny(
        maszyna=maszyna_klasyczna(
            x_pu=przypadek.xd_prim_pu,
            h_s=przypadek.h_s,
            d_tlumienie=przypadek.d_tlumienie,
        ),
        avr=None,
        governor=None,
    )
    return ModelDynamiczny(topologia=topo, urzadzenia=[zespol]), zespol


def wynik_laboratorium(
    przypadek: PrzypadekSMIB,
    *,
    q_gen_pu: float,
    krok_s: float = 0.0005,
    czas_koncowy_s: float = 8.0,
    zaburzenie_stopni: float = 0.5,
) -> WynikWzorca:
    """Ten sam przypadek policzony laboratorium — częstotliwość z TRAJEKTORII.

    ``q_gen_pu`` pochodzi z rozwiązania wzorca: laboratorium nie ma węzła PV,
    więc dostaje moc zespoloną i musi ODTWORZYĆ napięcie zespolone wzorca.
    To czyni porównanie napięcia realnym sprawdzianem warstwy algebraicznej,
    a nie tautologią.

    ``zaburzenie_stopni`` jest MAŁE (0,5°) świadomie: wzorcem jest WARTOŚĆ WŁASNA,
    czyli częstotliwość w granicy amplitudy dążącej do zera. Przy 5° trajektoria
    jest już zauważalnie nieliniowa (wahadło o skończonej amplitudzie wolnieje) i
    różni się od wartości własnej o ~5e-4 — to FIZYKA, nie błąd modelu.
    Zmierzoną zależność zwraca ``zaleznosc_od_amplitudy``; porównywanie dużej
    amplitudy z wartością własną i nazywanie różnicy błędem byłoby porównaniem
    dwóch różnych wielkości.
    """
    model, _ = _model_laboratorium(przypadek)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=krok_s)
    moce = {"G1": complex(przypadek.p_gen_pu, q_gen_pu)}
    x0 = silnik.inicjalizuj(moce)
    v0 = silnik.rozwiaz_siec(x0)
    v_gen = complex(v0[model.topologia.indeks["GEN"]])

    x_start = x0.copy()
    x_start[0] += math.radians(zaburzenie_stopni)
    wynik = silnik.symuluj(x_start, czas_koncowy_s=czas_koncowy_s)
    czas = np.array(wynik.czas_s)
    delta = np.array(wynik.sygnal("delta_rad", "G1").wartosci)
    f_osc = zmierz_czestotliwosc_oscylacji(czas, delta)
    if f_osc is None:
        raise BrakWzorcaError(
            "Laboratorium nie wytworzyło mierzalnej oscylacji — brak wielkości do porównania"
        )
    return WynikWzorca(
        zrodlo="dynamic_lab (prototyp badawczy)",
        metoda=f"trajektoria RK4, krok {krok_s:g} s",
        delta0_rad=float(x0[0]),
        e_prim_pu=float(x0[2]),
        v_gen_modul_pu=abs(v_gen),
        v_gen_kat_rad=math.atan2(v_gen.imag, v_gen.real),
        q_gen_pu=q_gen_pu,
        f_oscylacji_hz=f_osc,
        baza_czestotliwosci_hz=F_BAZOWA_HZ,
    )


def wynik_analityczny(
    przypadek: PrzypadekSMIB, *, delta0_rad: float, e_prim_pu: float
) -> WynikWzorca:
    """Trzecia, w pełni niezależna droga: zamknięty wzór na wahania."""
    wyrocznia = WyroczniaWahan(
        e_prim_pu=e_prim_pu,
        v_sys_pu=przypadek.v_sys_pu,
        x_calkowite_pu=przypadek.x_calkowite_pu,
        delta0_rad=delta0_rad,
        h_s=przypadek.h_s,
        d_tlumienie=przypadek.d_tlumienie,
    )
    return WynikWzorca(
        zrodlo="wyrocznia analityczna",
        metoda="omega_n = sqrt(omega_s * Ps / (2H))",
        delta0_rad=delta0_rad,
        e_prim_pu=e_prim_pu,
        v_gen_modul_pu=float("nan"),
        v_gen_kat_rad=float("nan"),
        q_gen_pu=float("nan"),
        f_oscylacji_hz=wyrocznia.czestotliwosc_wlasna_hz,
        baza_czestotliwosci_hz=OMEGA_S / (2.0 * math.pi),
    )


def zaleznosc_od_amplitudy(
    przypadek: PrzypadekSMIB | None = None,
    *,
    amplitudy_stopnie: tuple[float, ...] = (5.0, 2.0, 1.0, 0.5, 0.2),
) -> list[tuple[float, float, float]]:
    """Zmierz, jak częstotliwość wahań zależy od amplitudy zaburzenia.

    Zwraca ``[(amplituda_st, f_hz, blad_wzgledny_vs_wartosc_wlasna), ...]``.

    Ta funkcja istnieje, żeby ODDZIELIĆ dwie rzeczy, których pomylenie jest
    klasycznym źródłem fałszywego alarmu albo fałszywej pewności:
      - rozbieżność z wartością własną rosnąca z amplitudą to POPRAWNA fizyka
        (nieliniowość równania wahań),
      - rozbieżność NIEZNIKAJĄCA przy amplitudzie dążącej do zera byłaby błędem
        modelu albo inicjalizacji.
    """
    przypadek = przypadek or PrzypadekSMIB()
    wzorzec = wynik_wzorca(przypadek)
    pomiary: list[tuple[float, float, float]] = []
    for amplituda in amplitudy_stopnie:
        lab = wynik_laboratorium(przypadek, q_gen_pu=wzorzec.q_gen_pu, zaburzenie_stopni=amplituda)
        blad = abs(lab.f_oscylacji_hz - wzorzec.f_oscylacji_hz) / wzorzec.f_oscylacji_hz
        pomiary.append((amplituda, lab.f_oscylacji_hz, blad))
    return pomiary


def porownaj_z_wzorcem(
    przypadek: PrzypadekSMIB | None = None,
    *,
    krok_s: float = 0.0005,
    czas_koncowy_s: float = 8.0,
) -> PorownanieWzorca:
    """Pełne porównanie trójstronne na jednym przypadku.

    Kolejność jest istotna: punkt pracy USTALA wzorzec, a laboratorium musi go
    odtworzyć. Odwrotna kolejność (wzorzec dostrojony do laboratorium) nie
    byłaby walidacją.
    """
    przypadek = przypadek or PrzypadekSMIB()
    wzorzec = wynik_wzorca(przypadek)
    lab = wynik_laboratorium(
        przypadek,
        q_gen_pu=wzorzec.q_gen_pu,
        krok_s=krok_s,
        czas_koncowy_s=czas_koncowy_s,
    )
    ana = wynik_analityczny(przypadek, delta0_rad=wzorzec.delta0_rad, e_prim_pu=wzorzec.e_prim_pu)
    return PorownanieWzorca(wzorzec=wzorzec, laboratorium=lab, analityczne=ana)
