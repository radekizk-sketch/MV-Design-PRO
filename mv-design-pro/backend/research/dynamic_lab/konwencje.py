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


#: Poniżej tego napięcia rozkład prądu na składową czynną/bierną traci sens
#: (faza napięcia jest nieokreślona) — patrz `ogranicz_prad`.
PROG_NAPIECIA_PU = 1.0e-9


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


# ---------------------------------------------------------------------------
# NASYCENIE PRZEKSZTAŁTNIKA — JEDNO ŹRÓDŁO PRAWDY DLA OBU MODUŁÓW URZĄDZEŃ
# ---------------------------------------------------------------------------
#
# Ta sama fizyka (okrąg mocy pozornej, okrąg prądu z priorytetem składowej) była
# zaimplementowana DWA RAZY: w `urzadzenia.FalownikGFL.wstrzykniecie` i w
# `urzadzenia_oze._ogranicz_prad`. Zgodność obu kopii pilnował test
# (`test_ogranicznik_pradu_zgadza_sie_z_ogranicznikiem_falownika_gfl`), co jest
# lepsze niż nic, ale nie zmienia tego, że to DWIE ścieżki tej samej fizyki:
# poprawka wniesiona do jednej i pominięta w drugiej daje rozjazd, którego test
# złapie dopiero, gdy ktoś go uruchomi na obu. Reguła jest własnością
# przekształtnika, nie rodziny modeli, więc mieszka tutaj — w module, który oba
# moduły urządzeń i tak importują.


def ogranicz_do_przedzialu(wartosc: float, dol: float, gora: float) -> float:
    """``clamp`` z jawnym sprawdzeniem, że przedział nie jest pusty."""
    if dol > gora:
        raise ValueError(f"Pusty przedział ograniczenia: [{dol}, {gora}]")
    return max(dol, min(gora, wartosc))


def ogranicz_okregiem(
    p_pu: float, q_pu: float, s_max_pu: float, *, priorytet_biernej: bool
) -> tuple[float, float]:
    """Ogranicz zadanie ``(P, Q)`` do OKRĘGU ``|S| <= s_max_pu``.

    DLACZEGO OKRĄG, A NIE PROSTOKĄT (decyzja, nie gust). Granicą falownika jest
    prąd zaworów, a ``|I| = |S| / |U|`` — czyli ograniczenie jest z natury na
    MODULE mocy pozornej. Prostokąt (``|P| <= S`` i ``|Q| <= S`` niezależnie)
    dopuszcza punkt ``P = Q = S``, w którym ``|S| = √2 · s_max``: 41 % przeciążenia
    prądowego. To nie byłoby „konserwatywne uproszczenie", tylko przekroczenie
    granicy termicznej zapisane w modelu — czyli wynik dowodzący zdolności,
    której urządzenie nie ma.

    ``priorytet_biernej`` rozstrzyga, która składowa ustępuje przy nasyceniu.

    SKUTEK DLA NIEZMIENNIKA STANU. Wynik zawsze leży w kwadracie
    ``[-s_max, s_max]^2``, więc tor ``dP/dt = (P_cel - P)/T_p`` (i analogicznie Q)
    jest kontrakcją do punktu z tego kwadratu — kwadrat jest zbiorem
    NIEZMIENNICZYM przepływu ścisłego. Na tym opiera się `OgraniczenieStanu`
    deklarowane przez modele przekształtnikowe: wyjście poza kwadrat jest wtedy
    wyłącznie artefaktem dyskretyzacji.
    """
    if s_max_pu <= 0.0:
        raise ValueError("s_max_pu musi być > 0")
    if math.hypot(p_pu, q_pu) <= s_max_pu:
        return p_pu, q_pu
    if priorytet_biernej:
        q_ogr = ogranicz_do_przedzialu(q_pu, -s_max_pu, s_max_pu)
        zapas = math.sqrt(max(s_max_pu**2 - q_ogr**2, 0.0))
        return ogranicz_do_przedzialu(p_pu, -zapas, zapas), q_ogr
    p_ogr = ogranicz_do_przedzialu(p_pu, -s_max_pu, s_max_pu)
    zapas = math.sqrt(max(s_max_pu**2 - p_ogr**2, 0.0))
    return p_ogr, ogranicz_do_przedzialu(q_pu, -zapas, zapas)


def ogranicz_prad(
    i_zadany: complex, v_szyny: complex, i_max_pu: float, *, priorytet_biernej: bool
) -> complex:
    """Ogranicz moduł prądu przekształtnika, z priorytetem zadeklarowanej składowej.

    Rozkład na składową czynną i bierną liczony jest WZGLĘDEM FAZY NAPIĘCIA szyny.
    Przy zaniku napięcia faza jest nieokreślona — wtedy skalowany jest cały wektor,
    bo rozkład na składowe nie ma odniesienia.
    """
    if i_max_pu <= 0.0:
        raise ValueError("i_max_pu musi być > 0")
    modul = abs(i_zadany)
    if modul <= i_max_pu or modul < 1.0e-12:
        return i_zadany
    v_mod = abs(v_szyny)
    if v_mod < PROG_NAPIECIA_PU:
        return i_zadany * (i_max_pu / modul)
    faza = v_szyny / v_mod
    wzgledny = i_zadany / faza
    if priorytet_biernej:
        i_bierny = ogranicz_do_przedzialu(wzgledny.imag, -i_max_pu, i_max_pu)
        zapas = math.sqrt(max(i_max_pu**2 - i_bierny**2, 0.0))
        i_czynny = ogranicz_do_przedzialu(wzgledny.real, -zapas, zapas)
    else:
        i_czynny = ogranicz_do_przedzialu(wzgledny.real, -i_max_pu, i_max_pu)
        zapas = math.sqrt(max(i_max_pu**2 - i_czynny**2, 0.0))
        i_bierny = ogranicz_do_przedzialu(wzgledny.imag, -zapas, zapas)
    return complex(complex(i_czynny, i_bierny) * faza)


@dataclass(frozen=True)
class BazyMocy:
    """Bazy przeliczeniowe między bazą urządzenia a bazą sieci.

    Parametry maszyn i falowników podaje się na bazie URZĄDZENIA (tak są w kartach
    katalogowych). Sieć liczy na jednej bazie wspólnej. Przeliczenie musi być
    jawne — cicha zmiana bazy jest klasycznym źródłem wyników „wyglądających
    wiarygodnie, a fizycznie błędnych".

    WYPROWADZENIE WYMIAROWE (przed jakimkolwiek mnożeniem)
    ------------------------------------------------------
    Układ trójfazowy, ``S`` trójfazowe, ``V`` międzyfazowe::

        Z_bazowa = V_b^2 / S_b            [Ω]
        I_bazowa = S_b / (sqrt(3) * V_b)  [A]

    Stąd, dla wielkości ``q`` wyrażonej w p.u. na bazie urządzenia (indeks ``u``)
    i przeliczanej na bazę sieci (indeks ``s``)::

        Z_pu = Z_Ω / Z_b          →  Z_s = Z_u * (S_s/S_u) * (V_u/V_s)^2
        Y_pu = Y_S * Z_b          →  Y_s = Y_u * (S_u/S_s) * (V_s/V_u)^2
        S_pu = S / S_b            →  S_s = S_u_pu * (S_u/S_s)          [bez V]
        V_pu = V / V_b            →  V_s = V_u_pu * (V_u/V_s)          [bez S]
        I_pu = I / I_b            →  I_s = I_u_pu * (S_u/S_s) * (V_s/V_u)
        H [s] = E_kin / S_b       →  H_s = H_u * (S_u/S_s)             [bez V]
        D = ΔT_pu / Δω_pu         →  D_s = D_u * (S_u/S_s)             [bez V]
        T [s]                     →  bez zmian (czas nie ma bazy)

    Spójność jest sprawdzalna: ``S_pu = V_pu * I_pu`` daje
    ``(V_u/V_s) * (S_u/S_s) * (V_s/V_u) = S_u/S_s`` ✓, a ``Z_pu = V_pu / I_pu``
    daje ``(V_u/V_s) / [(S_u/S_s)*(V_s/V_u)] = (S_s/S_u)*(V_u/V_s)^2`` ✓.

    CO BYŁO ŹLE. Poprzednia wersja liczyła ``Z_s = Z_u * S_s/S_u``, czyli pomijała
    człon ``(V_u/V_s)^2``. Jest to prawdziwe WYŁĄCZNIE przy zgodnych bazach
    napięciowych i nie było nigdzie zapisane ani przetestowane. Klasyczny przypadek
    rozbieżności: generator o napięciu znamionowym 15,75 kV na szynie o bazie
    15 kV — człon pominięty wynosi ``(15,75/15)^2 = 1,1025``, czyli 10,25 % błędu
    reaktancji, wprost przenoszące się na prąd zwarciowy i na moduł kąta wirnika.
    Brakowało też przeliczeń dla tłumienia ``D`` i dla limitów prądowych —
    a limit prądu, w odróżnieniu od mocy i bezwładności, ZALEŻY od bazy napięcia.

    Bazy napięciowe są polami WYMAGANYMI. Wartość domyślna („zakładam zgodność")
    przywróciłaby dokładnie ten cichy błąd; dla częstego przypadku wspólnej bazy
    napięcia jest nazwany konstruktor `zgodne_napieciowo`.
    """

    s_bazowa_sieci_mva: float
    s_bazowa_urzadzenia_mva: float
    v_bazowa_sieci_kv: float
    v_bazowa_urzadzenia_kv: float

    def __post_init__(self) -> None:
        if self.s_bazowa_sieci_mva <= 0.0:
            raise ValueError("s_bazowa_sieci_mva musi być > 0")
        if self.s_bazowa_urzadzenia_mva <= 0.0:
            raise ValueError("s_bazowa_urzadzenia_mva musi być > 0")
        if self.v_bazowa_sieci_kv <= 0.0:
            raise ValueError("v_bazowa_sieci_kv musi być > 0")
        if self.v_bazowa_urzadzenia_kv <= 0.0:
            raise ValueError("v_bazowa_urzadzenia_kv musi być > 0")

    @classmethod
    def zgodne_napieciowo(
        cls, s_bazowa_sieci_mva: float, s_bazowa_urzadzenia_mva: float, v_bazowa_kv: float
    ) -> BazyMocy:
        """Bazy o WSPÓLNEJ bazie napięcia — założenie nazwane, nie domyślne."""
        return cls(
            s_bazowa_sieci_mva=s_bazowa_sieci_mva,
            s_bazowa_urzadzenia_mva=s_bazowa_urzadzenia_mva,
            v_bazowa_sieci_kv=v_bazowa_kv,
            v_bazowa_urzadzenia_kv=v_bazowa_kv,
        )

    @property
    def stosunek_mocy(self) -> float:
        """``S_sieci / S_urzadzenia``."""
        return self.s_bazowa_sieci_mva / self.s_bazowa_urzadzenia_mva

    @property
    def stosunek_napiec(self) -> float:
        """``V_urzadzenia / V_sieci``."""
        return self.v_bazowa_urzadzenia_kv / self.v_bazowa_sieci_kv

    @property
    def zgodne_bazy_napiecia(self) -> bool:
        """Czy obie strony liczą na tej samej bazie napięcia."""
        return self.v_bazowa_sieci_kv == self.v_bazowa_urzadzenia_kv

    @property
    def wspolczynnik_impedancji(self) -> float:
        """``(S_s/S_u) * (V_u/V_s)^2`` — pełny mnożnik impedancji."""
        return self.stosunek_mocy * self.stosunek_napiec**2

    def impedancja_na_baze_sieci(self, z_pu_urzadzenia: float) -> float:
        """``Z_s = Z_u * (S_s/S_u) * (V_u/V_s)^2`` [p.u.]."""
        return z_pu_urzadzenia * self.wspolczynnik_impedancji

    def admitancja_na_baze_sieci(self, y_pu_urzadzenia: float) -> float:
        """``Y_s = Y_u / [(S_s/S_u) * (V_u/V_s)^2]`` [p.u.] — odwrotność impedancji."""
        return y_pu_urzadzenia / self.wspolczynnik_impedancji

    def moc_na_baze_sieci(self, p_pu_urzadzenia: float) -> float:
        """``P_s = P_u * S_u/S_s`` [p.u.]. NIE zależy od bazy napięcia."""
        return p_pu_urzadzenia / self.stosunek_mocy

    def bezwladnosc_na_baze_sieci(self, h_s_urzadzenia: float) -> float:
        """Stała bezwładności ``H`` [s]: ``H_s = H_u * S_u/S_s``.

        ``H`` jest energią kinetyczną odniesioną do mocy bazowej, więc skaluje się
        jak moc i NIE zależy od bazy napięcia.
        """
        return h_s_urzadzenia / self.stosunek_mocy

    def tlumienie_na_baze_sieci(self, d_pu_urzadzenia: float) -> float:
        """Tłumienie ``D`` [p.u. momentu / p.u. prędkości]: ``D_s = D_u * S_u/S_s``.

        ``D`` mnoży odchyłkę prędkości (bezwymiarową na wspólnej bazie
        częstotliwości) i daje moment w p.u., więc skaluje się jak moc.
        NIE zależy od bazy napięcia. Przy różnej bazie CZĘSTOTLIWOŚCI to
        przeliczenie nie obowiązuje — całe laboratorium ma jedną
        ``F_BAZOWA_HZ``, więc takiego przypadku tu nie ma.
        """
        return d_pu_urzadzenia / self.stosunek_mocy

    def prad_na_baze_sieci(self, i_pu_urzadzenia: float) -> float:
        """Prąd (także LIMIT prądu): ``I_s = I_u * (S_u/S_s) * (V_s/V_u)`` [p.u.].

        W odróżnieniu od mocy i bezwładności prąd ZALEŻY od bazy napięcia, bo
        ``I_b = S_b / (sqrt(3) * V_b)``. Limit prądu falownika przeliczony samym
        stosunkiem mocy jest błędny dokładnie o ``V_s/V_u``.
        """
        return i_pu_urzadzenia / self.stosunek_mocy / self.stosunek_napiec

    def napiecie_na_baze_sieci(self, v_pu_urzadzenia: float) -> float:
        """Napięcie: ``V_s = V_u * V_u_baza/V_s_baza`` [p.u.]. NIE zależy od bazy mocy."""
        return v_pu_urzadzenia * self.stosunek_napiec


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
