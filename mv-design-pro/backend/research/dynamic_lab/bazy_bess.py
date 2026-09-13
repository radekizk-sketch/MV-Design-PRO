"""Łańcuch baz magazynu energii — JEDNA droga od znamionowej mocy do SOC.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

PO CO TO ISTNIEJE (plan pre-Fable §2: „pełny audyt baz urządzenie–sieć"). Bilans
energii magazynu był sprawdzany równaniem SOC — i to jest za mało. Równanie SOC
może być poprawne, a mimo to przelicznik między bazą urządzenia a bazą sieci
może siedzieć w kilku miejscach naraz, każde z własnym mnożnikiem. Wtedy zmiana
bazy sieci zmienia TRAJEKTORIĘ FIZYCZNĄ, czyli ta sama bateria zachowuje się
inaczej dlatego, że ktoś wybrał inne ``S_bazowa``. Taki defekt nie rusza równania
SOC ani o jotę i żaden test tego równania go nie zobaczy.

ŁAŃCUCH, KTÓRY TEN MODUŁ CZYNI JEDYNYM

    moc znamionowa urządzenia [MVA]
        ↓ (÷ S_bazowa_sieci)
    moc znamionowa w p.u. na bazie SIECI
        ↓ (nastawy, regulacja, ograniczniki — w p.u. sieci)
    moc na zaciskach w p.u.
        ↓ (× S_bazowa_sieci)
    moc na zaciskach [MW]
        ↓ (× waga sprawności, ÷ 3600)
    strumień energii zasobu [MWh/s]
        ↓ (÷ pojemność [MWh])
    d(SOC)/dt [1/s]

WYPROWADZENIE WYMIAROWE (przed jakimkolwiek mnożeniem). Układ trójfazowy, ``S``
trójfazowe, ``V`` międzyfazowe::

    I_bazowy [kA] = S_b [MVA] / (sqrt(3) * V_b [kV])
    P [MW]        = P_pu * S_b [MVA]
    E [MWh]       = SOC * E_pojemnosc [MWh]
    dE/dt [MWh/s] = -P [MW] * w(P) / 3600
    dSOC/dt [1/s] = dE/dt / E_pojemnosc

Liczba ``3600`` nie jest stałą modelu, tylko przelicznikiem godziny na sekundę —
i jest w JEDNYM miejscu (`SEKUND_W_GODZINIE`), bo powielona zamienia się w
pytanie „która kopia jest prawdziwa".

NIEZMIENNIK, KTÓRY Z TEGO WYNIKA I KTÓRY JEST PRZYPIĘTY TESTEM. ``dSOC/dt``
wyrażone przez moc FIZYCZNĄ nie zawiera ``S_bazowa`` w ogóle. Zatem trajektoria
``SOC(t)`` i ``P(t) [MW]`` są NIEZALEŻNE od wyboru bazy mocy sieci, o ile
wszystkie wielkości p.u. przeliczono na nową bazę. To jest testowalna postać
zdania „baza jest umową rachunkową, nie fizyką".

CZEGO TEN MODUŁ NIE ROBI. Nie liczy fizyki magazynu — robi to
`urzadzenia_oze.MagazynEnergiiBESS`. Tutaj jest wyłącznie przelicznik i jego
kontrola. Rozdział jest celowy: gdyby przelicznik mieszkał w modelu, nie dałoby
się sprawdzić modelu PRZECIWKO niemu.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

#: Przelicznik godziny na sekundy — JEDNO miejsce w całym łańcuchu.
SEKUND_W_GODZINIE: float = 3600.0

#: ``sqrt(3)`` dla przeliczenia mocy trójfazowej na prąd przewodowy.
PIERWIASTEK_Z_TRZECH: float = math.sqrt(3.0)


class NiespojnaBazaError(ValueError):
    """Dane bazy nie tworzą spójnego układu jednostek."""


@dataclass(frozen=True)
class LancuchBazBESS:
    """Komplet baz magazynu — od karty katalogowej do SOC.

    Pola są WYMAGANE (poza pojemnością nie ma tu wartości domyślnych), bo każda
    wartość domyślna bazy jest cichym założeniem o tym, na czym liczy sieć.
    """

    #: Baza mocy SIECI [MVA] — wspólna dla całego modelu.
    s_bazowa_sieci_mva: float
    #: Baza napięcia SIECI [kV] — potrzebna wyłącznie do bazy prądu.
    v_bazowa_sieci_kv: float
    #: Moc znamionowa PRZEKSZTAŁTNIKA magazynu [MVA] — z karty katalogowej.
    s_znamionowa_urzadzenia_mva: float
    #: Napięcie znamionowe urządzenia [kV] — z karty katalogowej.
    v_znamionowe_urzadzenia_kv: float
    #: Pojemność użyteczna zasobu [MWh] — wielkość FIZYCZNA, bez bazy.
    e_pojemnosc_mwh: float

    def __post_init__(self) -> None:
        for nazwa in (
            "s_bazowa_sieci_mva",
            "v_bazowa_sieci_kv",
            "s_znamionowa_urzadzenia_mva",
            "v_znamionowe_urzadzenia_kv",
            "e_pojemnosc_mwh",
        ):
            wartosc = getattr(self, nazwa)
            if not math.isfinite(wartosc) or wartosc <= 0.0:
                raise NiespojnaBazaError(f"{nazwa} musi być skończone i > 0 (jest {wartosc!r})")

    # -- bazy wyprowadzone ---------------------------------------------------

    @property
    def i_bazowy_sieci_ka(self) -> float:
        """``I_b = S_b / (sqrt(3) · V_b)`` [kA]."""
        return self.s_bazowa_sieci_mva / (PIERWIASTEK_Z_TRZECH * self.v_bazowa_sieci_kv)

    @property
    def i_bazowy_urzadzenia_ka(self) -> float:
        return self.s_znamionowa_urzadzenia_mva / (
            PIERWIASTEK_Z_TRZECH * self.v_znamionowe_urzadzenia_kv
        )

    @property
    def z_bazowa_sieci_ohm(self) -> float:
        """``Z_b = V_b² / S_b`` [Ω]."""
        return self.v_bazowa_sieci_kv**2 / self.s_bazowa_sieci_mva

    @property
    def s_falownika_pu(self) -> float:
        """Moc znamionowa przekształtnika W P.U. NA BAZIE SIECI.

        To jest jedyne miejsce, w którym karta katalogowa spotyka bazę sieci.
        Model dostaje stąd liczbę i już jej nie przelicza — przeliczenie w dwóch
        miejscach to dokładnie ten defekt, przed którym ten moduł broni.
        """
        return self.s_znamionowa_urzadzenia_mva / self.s_bazowa_sieci_mva

    # -- moc -----------------------------------------------------------------

    def moc_mw(self, p_pu: float) -> float:
        """p.u. (baza sieci) → MW."""
        return p_pu * self.s_bazowa_sieci_mva

    def moc_pu(self, p_mw: float) -> float:
        """MW → p.u. (baza sieci)."""
        return p_mw / self.s_bazowa_sieci_mva

    # -- energia i SOC -------------------------------------------------------

    def energia_mwh(self, soc: float) -> float:
        """SOC (bezwymiarowy) → zapas energii [MWh]."""
        return soc * self.e_pojemnosc_mwh

    def de_dt_mwh_na_s(self, p_mw: float, waga_sprawnosci: float) -> float:
        """Strumień energii ZASOBU [MWh/s] z mocy na zaciskach [MW].

        Znak: konwencja generatorowa, ``P > 0`` to rozładowanie, więc zasobu
        UBYWA i pochodna jest ujemna.
        """
        return -p_mw * waga_sprawnosci / SEKUND_W_GODZINIE

    def dsoc_dt_z_mocy_mw(self, p_mw: float, waga_sprawnosci: float) -> float:
        """``dSOC/dt`` [1/s] licząc od mocy FIZYCZNEJ — bez udziału bazy mocy."""
        return self.de_dt_mwh_na_s(p_mw, waga_sprawnosci) / self.e_pojemnosc_mwh

    def dsoc_dt_z_mocy_pu(self, p_pu: float, waga_sprawnosci: float) -> float:
        """``dSOC/dt`` [1/s] licząc od mocy w p.u. — DRUGIE wejście, ta sama droga.

        Świadomie zaimplementowane przez `moc_mw`, a nie własnym wzorem. Dwa
        niezależne wzory dla tej samej wielkości to dwie okazje do rozjazdu; że
        oba wejścia dają tę samą liczbę, jest mimo to PRZYPIĘTE testem, bo
        deklaracja bez testu jest fałszywą pewnością.
        """
        return self.dsoc_dt_z_mocy_mw(self.moc_mw(p_pu), waga_sprawnosci)

    # -- przeliczenie całego magazynu na inną bazę ---------------------------

    def na_baze_sieci(self, s_bazowa_sieci_mva: float) -> LancuchBazBESS:
        """TEN SAM układ fizyczny wyrażony na innej bazie mocy sieci.

        Zmienia się WYŁĄCZNIE baza; moc znamionowa [MVA], napięcia [kV] i
        pojemność [MWh] to wielkości fizyczne i zostają bez zmian. Dokładnie tego
        wymaga test niezmienniczości: gdyby cokolwiek fizycznego zmieniało się
        razem z bazą, porównywalibyśmy dwa różne magazyny.
        """
        return LancuchBazBESS(
            s_bazowa_sieci_mva=s_bazowa_sieci_mva,
            v_bazowa_sieci_kv=self.v_bazowa_sieci_kv,
            s_znamionowa_urzadzenia_mva=self.s_znamionowa_urzadzenia_mva,
            v_znamionowe_urzadzenia_kv=self.v_znamionowe_urzadzenia_kv,
            e_pojemnosc_mwh=self.e_pojemnosc_mwh,
        )


def waga_sprawnosci(
    p_pu: float, *, sprawnosc_rozladowania: float, sprawnosc_ladowania: float
) -> float:
    """``w(P)`` — mnożnik strat między zaciskami a zasobem.

    ``P > 0`` (rozładowanie): z ogniw ubywa WIĘCEJ, niż trafia na zaciski, więc
    ``w = 1/η_roz``. ``P <= 0`` (ładowanie): do ogniw trafia MNIEJ, niż pobrano z
    sieci, więc ``w = η_ład``. To jest ta sama konwencja, którą stosuje
    `MagazynEnergiiBESS`; funkcja istnieje po to, żeby dało się ją sprawdzić
    NIEZALEŻNIE od modelu, a nie po to, żeby model miał drugą kopię.
    """
    if p_pu > 0.0:
        return 1.0 / sprawnosc_rozladowania
    return sprawnosc_ladowania


@dataclass(frozen=True)
class NiespojnoscKroku:
    """Jeden krok, w którym wielkości łańcucha się nie zgadzają."""

    indeks: int
    czas_s: float
    wielkosc: str
    z_lancucha: float
    z_modelu: float

    @property
    def roznica(self) -> float:
        return abs(self.z_lancucha - self.z_modelu)


def audytuj_spojnosc_krokow(
    lancuch: LancuchBazBESS,
    *,
    czasy_s: list[float],
    p_pu: list[float],
    soc: list[float],
    sprawnosc_rozladowania: float,
    sprawnosc_ladowania: float,
    tolerancja_wzgledna: float = 1.0e-6,
) -> tuple[NiespojnoscKroku, ...]:
    """Czy ``P_sieci``, ``P_urządzenia``, ``dE/dt`` i ``dSOC/dt`` opisują to samo.

    Dla KAŻDEGO kroku liczy ``dSOC/dt`` dwiema drogami — z mocy p.u. i z mocy w
    MW — oraz porównuje pochodną SOC odtworzoną z przebiegu (różnica wsteczna) z
    wartością wynikającą z łańcucha. Różnica wsteczna ma błąd rzędu ``O(dt)``,
    więc tolerancja jest WZGLĘDNA wobec większej z porównywanych wartości i
    świadomie luźna: ten audyt szuka POMYLONEGO MNOŻNIKA (czynnik 2, 1000, 3600),
    a nie błędu dyskretyzacji.
    """
    niespojnosci: list[NiespojnoscKroku] = []
    for i in range(len(czasy_s)):
        waga = waga_sprawnosci(
            p_pu[i],
            sprawnosc_rozladowania=sprawnosc_rozladowania,
            sprawnosc_ladowania=sprawnosc_ladowania,
        )
        z_pu = lancuch.dsoc_dt_z_mocy_pu(p_pu[i], waga)
        z_mw = lancuch.dsoc_dt_z_mocy_mw(lancuch.moc_mw(p_pu[i]), waga)
        if abs(z_pu - z_mw) > tolerancja_wzgledna * max(1.0, abs(z_pu)):
            niespojnosci.append(NiespojnoscKroku(i, czasy_s[i], "dSOC/dt (p.u. vs MW)", z_pu, z_mw))
        if i == 0:
            continue
        dt = czasy_s[i] - czasy_s[i - 1]
        if dt <= 0.0:
            continue
        zmierzone = (soc[i] - soc[i - 1]) / dt
        odniesienie = max(abs(z_pu), abs(zmierzone), 1.0e-12)
        if abs(z_pu - zmierzone) > 0.05 * odniesienie:
            niespojnosci.append(
                NiespojnoscKroku(i, czasy_s[i], "dSOC/dt (łańcuch vs przebieg)", z_pu, zmierzone)
            )
    return tuple(niespojnosci)
