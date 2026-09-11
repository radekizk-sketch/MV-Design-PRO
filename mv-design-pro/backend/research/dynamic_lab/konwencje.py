"""Jednostki, bazy i konwencje znaków laboratorium dynamicznego.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

Ten moduł istnieje, bo brak jawnych konwencji był jedną z przyczyn defektów
wykrytych w audycie: model używał ``Pe = V·sin(delta)`` bez zdefiniowanej ramy
odniesienia, bez reaktancji i bez kąta napięcia szyny, więc nie dało się nawet
stwierdzić, w jakim układzie liczy. Tutaj każda konwencja jest zapisana i
przetestowana.

KONWENCJE OBOWIĄZUJĄCE W CAŁYM LABORATORIUM
-------------------------------------------

1. **Jednostki względne (p.u.)** dla wielkości elektrycznych, z jedną bazą mocy
   ``S_base`` [MVA] wspólną dla całej sieci i bazą napięcia per szyna.
   Impedancje/admitancje w p.u. na bazie sieci. Parametry maszyny podawane są na
   bazie MASZYNY i przeliczane na bazę sieci jawnie (``na_baze_sieci``).

2. **Czas** w sekundach. Częstotliwość bazowa ``F_BAZOWA_HZ = 50.0``,
   pulsacja synchroniczna ``OMEGA_S = 2*pi*50`` [rad/s].

3. **Prędkość** ``omega`` w p.u. prędkości synchronicznej: stan ustalony = 1.0.
   Odchyłka ``omega - 1`` jest bezwymiarowa. Częstotliwość [Hz] = ``omega * 50``.

4. **Kąt wirnika** ``delta`` w radianach, mierzony względem ramy wirującej z
   prędkością synchroniczną (rama sieci).

5. **Znak mocy — konwencja GENERATOROWA.** Dodatnie ``P``/``Q`` oznaczają moc
   WSTRZYKIWANĄ do sieci przez urządzenie. Odbiór ma ``P < 0``.
   (Uwaga: produkcyjny ``power_flow_newton`` używa konwencji odbiorczej dla
   ``PQSpec``; przeliczenie jest jawne w adapterze, nie domyślne.)

6. **Prąd** ``I`` zespolony, w p.u., WSTRZYKIWANY do szyny (ta sama konwencja
   co moc). Równanie sieci: ``Ybus @ V = I_wstrzyk``.

7. **Transformacja maszyna↔sieć.** Osie ``dq`` maszyny są związane z ramą sieci
   kątem ``delta - pi/2``:

       V_d + j*V_q = V_siec * exp(-j*(delta - pi/2))
       I_siec      = (I_d + j*I_q) * exp(+j*(delta - pi/2))

   Ta konwencja daje dla modelu klasycznego (E' za X'd, Ra=0, X'd=X'q)
   kanoniczne ``Pe = E'*|V|*sin(delta - theta)/X'd`` — sprawdzone testem
   ``test_konwencja_dq_daje_kanoniczne_pe``.
   Równoważnie: ``V_d = |V|*sin(delta - theta)``, ``V_q = |V|*cos(delta - theta)``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

F_BAZOWA_HZ: float = 50.0
"""Częstotliwość bazowa sieci [Hz]."""

OMEGA_S: float = 2.0 * math.pi * F_BAZOWA_HZ
"""Pulsacja synchroniczna [rad/s]."""


def czestotliwosc_hz(omega_pu: float) -> float:
    """Częstotliwość [Hz] z prędkości w p.u. prędkości synchronicznej."""
    return omega_pu * F_BAZOWA_HZ


def dq_z_sieci(v_siec: complex, delta_rad: float) -> tuple[float, float]:
    """Napięcie zaciskowe w osiach dq maszyny.

    ``V_d + j*V_q = V_siec * exp(-j*(delta - pi/2))``

    Args:
        v_siec: napięcie zespolone szyny w ramie sieci [p.u.].
        delta_rad: kąt wirnika [rad].

    Returns:
        ``(V_d, V_q)`` [p.u.].
    """
    obrot = complex(math.cos(delta_rad - math.pi / 2.0), -math.sin(delta_rad - math.pi / 2.0))
    v_dq = v_siec * obrot
    return v_dq.real, v_dq.imag


def siec_z_dq(i_d: float, i_q: float, delta_rad: float) -> complex:
    """Prąd w ramie sieci z prądów w osiach dq maszyny.

    ``I_siec = (I_d + j*I_q) * exp(+j*(delta - pi/2))``
    """
    obrot = complex(math.cos(delta_rad - math.pi / 2.0), math.sin(delta_rad - math.pi / 2.0))
    return complex(i_d, i_q) * obrot


@dataclass(frozen=True)
class BazyMocy:
    """Bazy przeliczeniowe między bazą urządzenia a bazą sieci.

    Parametry maszyn i falowników podaje się na bazie URZĄDZENIA (tak są w kartach
    katalogowych). Sieć liczy na jednej bazie wspólnej. Przeliczenie musi być
    jawne — cicha zmiana bazy jest klasycznym źródłem wyników „wyglądających
    wiarygodnie, a fizycznie błędnych".
    """

    s_bazowa_sieci_mva: float
    s_bazowa_urzadzenia_mva: float

    def __post_init__(self) -> None:
        if self.s_bazowa_sieci_mva <= 0.0:
            raise ValueError("s_bazowa_sieci_mva musi być > 0")
        if self.s_bazowa_urzadzenia_mva <= 0.0:
            raise ValueError("s_bazowa_urzadzenia_mva musi być > 0")

    @property
    def wspolczynnik(self) -> float:
        """S_sieci / S_urzadzenia."""
        return self.s_bazowa_sieci_mva / self.s_bazowa_urzadzenia_mva

    def impedancja_na_baze_sieci(self, z_pu_urzadzenia: float) -> float:
        """Impedancja z bazy urządzenia na bazę sieci: ``Z_s = Z_u * S_s/S_u``."""
        return z_pu_urzadzenia * self.wspolczynnik

    def moc_na_baze_sieci(self, p_pu_urzadzenia: float) -> float:
        """Moc z bazy urządzenia na bazę sieci: ``P_s = P_u * S_u/S_s``."""
        return p_pu_urzadzenia / self.wspolczynnik

    def bezwladnosc_na_baze_sieci(self, h_s_urzadzenia: float) -> float:
        """Stała bezwładności H [s] z bazy urządzenia na bazę sieci.

        ``H`` jest energią kinetyczną odniesioną do mocy bazowej, więc skaluje się
        jak moc: ``H_s = H_u * S_u/S_s``.
        """
        return h_s_urzadzenia / self.wspolczynnik


#: Jednostka zwracana, gdy model NIE zadeklarował jednostki swojego stanu.
#: Fail-closed: „nieznana" jest uczciwym meldunkiem braku, a poprzednia wspólna
#: etykieta ``"p.u./rad"`` była TWIERDZENIEM — i to fałszywym dla ``soc`` (liczba
#: niemianowana), ``efd_pu`` (p.u.) i ``delta_rad`` (rad) naraz.
JEDNOSTKA_NIEZNANA = "nieznana"


def jednostki_stanow(urzadzenie: object) -> tuple[str, ...]:
    """Jednostki stanów urządzenia — Z MODELU, nie zgadywane z nazwy.

    Model wie, co liczy, więc to model deklaruje jednostki swoich stanów przez
    metodę ``jednostki_stanow()``. Centralna mapa „nazwa stanu -> jednostka"
    byłaby drugą prawdą: nowy model z nazwą spoza mapy dostawałby jednostkę
    cudzej wielkości, a nikt by tego nie zauważył.

    Model, który jednostek nie deklaruje, dostaje ``JEDNOSTKA_NIEZNANA`` dla
    każdego stanu — brak deklaracji jest widoczny w wyniku zamiast być zastąpiony
    wspólnym napisem sugerującym, że jednostka jest znana.
    """
    nazwy = tuple(urzadzenie.nazwy_stanow())  # type: ignore[attr-defined]
    deklaracja = getattr(urzadzenie, "jednostki_stanow", None)
    if deklaracja is None:
        return tuple(JEDNOSTKA_NIEZNANA for _ in nazwy)
    zadeklarowane = tuple(deklaracja())
    if len(zadeklarowane) != len(nazwy):
        raise ValueError(
            f"{type(urzadzenie).__name__}: zadeklarowano {len(zadeklarowane)} jednostek "
            f"dla {len(nazwy)} stanów — deklaracja niespójna z modelem."
        )
    return zadeklarowane


def stany_zasobowe(urzadzenie: object) -> frozenset[str]:
    """Stany ZASOBOWE urządzenia — wolnozmienne, nieobjęte warunkiem równowagi.

    Stan zasobowy to zmienna opisująca zapas energii (SOC magazynu, poziom
    zbiornika, ilość paliwa), której pochodna jest NIEZEROWA z samej definicji
    pracy urządzenia. Magazyn oddający 0,5 p.u. przy 100 MVA i 10 MWh ma
    ``d(soc)/dt = 1,4e-3 1/s`` — o trzy rzędy więcej niż tolerancja równowagi
    elektromechanicznej, i nie jest to żaden błąd, tylko bilans energii.

    DLACZEGO TO JEST POTRZEBNE. Silnik sprawdzał ``max|f(x0)|`` po WSZYSTKICH
    stanach, więc BESS pracujący z niezerową mocą nie mógł być punktem startowym
    symulacji krótkookresowej — a to jest jego normalny punkt pracy. Podniesienie
    tolerancji „żeby przeszło" byłoby gorsze niż defekt: uciszyłoby również realny
    brak równowagi toru elektrycznego. Rozwiązaniem jest ROZRÓŻNIENIE, nie
    rozluźnienie: stany szybkie muszą spełniać ``f = 0``, zasobowe mogą dryfować
    i ich pochodna jest raportowana OSOBNO.

    Model, który nic nie deklaruje, ma zbiór pusty — czyli wszystkie jego stany
    podlegają warunkowi równowagi. Domyślna odpowiedź jest więc OSTRZEJSZA,
    a nie łagodniejsza: nowy model nie może przypadkiem wymknąć się kontroli.
    """
    deklaracja = getattr(urzadzenie, "stany_zasobowe", None)
    if deklaracja is None:
        return frozenset()
    nazwy = set(urzadzenie.nazwy_stanow())  # type: ignore[attr-defined]
    zadeklarowane = frozenset(deklaracja())
    nieznane = zadeklarowane - nazwy
    if nieznane:
        raise ValueError(
            f"{type(urzadzenie).__name__}: zadeklarowano jako zasobowe stany, "
            f"których model nie ma: {sorted(nieznane)}."
        )
    return zadeklarowane
