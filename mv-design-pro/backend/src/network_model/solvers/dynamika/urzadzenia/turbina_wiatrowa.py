"""Turbina wiatrowa IEC 61400-27-1: wirnik, regulacja kata lopat, crowbar, przeksztaltnik.

CO KONTRAKT PARAMETRYZUJE, A CZEGO NIE — to rozstrzyga zakres tego modulu, nie
wygoda implementacji.

**Typ 3 (DFIG) i typ 4 (przeksztaltnik pelnej mocy) SA zlozalne.** Ich sprzezenie
z siecia idzie przez przeksztaltnik, ktorego kontrakt niesie w calosci (blok
`PrzeksztaltnikGFL` z wlasna moca znamionowa, ogranicznikiem pradu, PLL, FRT i
statyzmami). Uzywamy DOKLADNIE tego samego rdzenia `RdzenGFL`, ktory obsluguje
przeksztaltnik samodzielny i magazyn — zero trzeciej kopii regulacji.

**Typ 1 (SCIG) i typ 2 (WRIG) NIE SA zlozalne z tego kontraktu** i koncza sie
odmowa `dynamika.wariant_regulatora_bez_parametrow`. Powod jest twardy, nie
ostroznosciowy: maszyna indukcyjna przylaczona WPROST do sieci wymaga swojego
schematu zastepczego (Rs, Xs, Rr, Xr, Xm) oraz mocy znamionowej, zeby w ogole
mial powstac prad wezlowy. Kontrakt `TurbinaWiatrowa` nie niesie ANI JEDNEJ z
tych wielkosci (moc znamionowa jest tylko w bloku `przeksztaltnik`, ktorego typy
1/2 mieć NIE MOGA — waliduje to kontrakt ENM). Zbudowanie typu 1/2 wymagaloby
wymyslenia calego obwodu elektrycznego; nazwana odmowa mowi projektantowi PRAWDE
zamiast liczyc przebieg z parametrow, ktorych nikt nie podal.

TOR MECHANICZNY — JEDNA MASA, i to jest UCZCIWY zakres danych. Model dwumasowy
IEC 61400-27-1 jest sparametryzowany czterema wielkosciami: `H_WTR` (bezwladnosc
wirnika turbiny), `H_gen` (bezwladnosc wirnika generatora), `k_drt` i `c_drt`.
Kontrakt ENM scala obie bezwladnosci w JEDNA (`h_calkowite_s`), a bez podzialu
czestotliwosc drgan skretnych `f = sqrt(K w_0 (1/2H_WTR + 1/2H_gen))/2pi` NIE
JEST wyznaczona — kazdy podzial daje inna. Dlatego tor mechaniczny jest tu
jednomasowy (wariant, ktory norma rowniez definiuje):

    2 H_calk d(omega)/dt = P_aero - P_el

a `sztywnosc_walu_pu` i `tlumienie_walu_pu` pozostaja NIESKONSUMOWANE. Nie jest
to przeoczenie: jest to zapisane w inwentarzu pol (`fabryka.INWENTARZ_POL`) z
powodem i przypiete testem, zeby pole kontraktu nie mogło po cichu zniknac z
rachunku. Dobranie podzialu bezwladnosci „na oko" byloby fabrykacja — zmienialoby
czestotliwosc modu skretnego, czyli jedna z glownych wielkosci wynikowych badania.

REGULACJA KATA LOPAT. Kat `beta` jest calka przesterowania predkosci z
OGRANICZENIEM SZYBKOSCI i ZAKRESU wprost z kontraktu:

    d(beta)/dt = tempo * ogranicz(omega - 1, -1, +1),   beta w [beta_min, beta_max]

Wzmocnienie regulatora nie jest osobnym polem kontraktu; jedyna wielkoscia o
wymiarze „stopnie na sekunde na jednostke przesterowania" jest samo `tempo`,
wiec to ono jest wzmocnieniem. Ogranicznik jest NIENAWROTNY, wiec kat nigdy nie
wychodzi poza zakres i nie „odrabia" calki po zejsciu z ogranicznika.

Moc aerodynamiczna maleje LINIOWO od wartosci punktu pracy przy kacie minimalnym
do ZERA przy kacie maksymalnym:

    P_aero = P_aero_odniesienia * (beta_max - beta) / (beta_max - beta_min)

Oba konce sa fizycznie dokladne (kat minimalny = praca z maksymalnym odbiorem
mocy z wiatru; kat maksymalny = chorągiewka, zerowy moment aerodynamiczny), a
przebieg miedzy nimi wymagalby charakterystyki `Cp(lambda, beta)`, ktorej
kontrakt nie niesie. Interpolacja liniowa jest tu JEDYNA postacia bez dodatkowego
parametru — i jest nazwana wprost, a nie schowana.

CROWBAR (WYLACZNIE typ 3 — tak jak waliduje kontrakt ENM). Zabezpieczenie
wirnika DFIG zwiera obwod wirnika przy przekroczeniu pradu, co w modelu RMS
oznacza ZABLOKOWANIE przeksztaltnika: okno mocy czynnej zamyka sie na czas
dzialania. Model jest CIAGLY (stan `crowbar_pu` w przedziale 0..1), bo protokol
`Urzadzenie` nie zna czasu bezwzglednego ani zdarzen wewnetrznych — zatrzask
dyskretny wymagalby rozszerzenia rdzenia o zdarzenia generowane przez urzadzenie.
Zwloka i czas trwania sa stalymi czasowymi zalaczenia i zaniku; przy zerowej
zwloce zalaczenie jest natychmiastowe (sygnal `max(stan, wyzwolenie)`), a stan
odpowiada wtedy wylacznie za podtrzymanie przez czas trwania.

PROG PRADU CROWBAR odnosi sie w normie do pradu WIRNIKA. Model nie ma obwodu
wirnika (patrz wyzej), wiec prog jest stosowany do modulu pradu PRZEKSZTALTNIKA
— jedynego pradu, ktory w tym modelu istnieje. Jest to nazwane tutaj i w
inwentarzu pol, zeby nikt nie czytal tej liczby jako pradu wirnika.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from ..kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
    KOD_WARIANT_BEZ_PARAMETROW,
    OdmowaDynamiki,
)
from ..konwencje import pulsacja_bazowa_rad_s
from .okno_mocy import OknoMocy
from .pochodne_kierunkowe import Dual, Zespolona, kwadrat, maksimum, ogranicz, pierwiastek
from .przeksztaltnik_gfl import (
    STAN_PRADU_BIERNEGO,
    STAN_PRADU_CZYNNEGO,
    RdzenGFL,
)
from .regulatory import pochodna_z_ogranicznikiem_nienawrotnym
from .uklad_stanow import UkladStanow

STAN_PREDKOSCI_WIRNIKA = "omega_wirnika_pu"
STAN_KATA_LOPAT = "pitch_rad"
STAN_MOCY_AERODYNAMICZNEJ = "p_aerodynamiczna_odniesienia_pu"
STAN_CROWBAR = "crowbar_pu"

#: Typy turbiny, ktore kontrakt ENM parametryzuje w calosci (maja przeksztaltnik).
TYPY_ZLOZALNE: tuple[str, ...] = ("wiatr_typ_3", "wiatr_typ_4")
#: Typy turbiny bez modelu elektrycznego w kontrakcie (maszyna indukcyjna wprost
#: na sieci — brak schematu zastepczego i brak mocy znamionowej).
TYPY_BEZ_MODELU_ELEKTRYCZNEGO: tuple[str, ...] = ("wiatr_typ_1", "wiatr_typ_2")
#: Typ, dla ktorego crowbar ma sens fizyczny (obwod wirnika DFIG).
TYP_Z_CROWBAR = "wiatr_typ_3"


@dataclass(frozen=True)
class Crowbar:
    """Zabezpieczenie wirnika DFIG — prog pradu, zwloka zalaczenia, czas trwania."""

    prog_pradu_pu: float
    czas_zwloki_s: float
    czas_trwania_s: float

    @property
    def zalacza_sie_natychmiast(self) -> bool:
        return self.czas_zwloki_s <= 0.0

    def wyzwolenie(self, modul_pradu: Dual) -> float:
        """1 gdy prad przekracza prog, 0 w przeciwnym razie (sygnal dwustanowy)."""
        return 1.0 if modul_pradu.wartosc > self.prog_pradu_pu else 0.0

    def sygnal(self, stan: Dual, modul_pradu: Dual) -> Dual:
        """Sygnal zadzialania crowbar (0..1) uzyty do zamkniecia okna mocy."""
        if self.zalacza_sie_natychmiast:
            return maksimum(stan, self.wyzwolenie(modul_pradu))
        return stan

    def pochodna(self, stan: Dual, modul_pradu: Dual) -> Dual:
        """Zalaczenie ze zwloka, zanik ze stala czasu trwania.

        O WYBORZE STALEJ CZASOWEJ decyduje SYGNAL WYZWALAJACY (czy prad przekracza
        prog), a nie znak roznicy `wyzwolenie - stan`. Ten drugi warunek stawialby
        punkt przelaczenia dokladnie tam, gdzie stan siedzi w rownowadze (zero), i
        pochodna nie istnialaby w punkcie pracy — jedyna nieciaglosc tego bloku ma
        byc PRZEKROCZENIEM PROGU PRADU, bo tylko ono jest zdarzeniem fizycznym.
        """
        wyzwolenie = self.wyzwolenie(modul_pradu)
        if self.zalacza_sie_natychmiast:
            return (self.sygnal(stan, modul_pradu) - stan) / self.czas_trwania_s
        stala = self.czas_zwloki_s if wyzwolenie > 0.0 else self.czas_trwania_s
        return (Dual(wyzwolenie) - stan) / stala


@dataclass(frozen=True)
class TorMechaniczny:
    """Jednomasowy wirnik z regulacja kata lopat — parametry w bazie UKLADU."""

    h_calkowite_s: float
    pitch_tempo_rad_s: float
    pitch_min_rad: float
    pitch_max_rad: float

    def udzial_mocy(self, kat: Dual) -> Dual:
        """`(beta_max - beta)/(beta_max - beta_min)` — udzial mocy aerodynamicznej."""
        return (self.pitch_max_rad - kat) / (self.pitch_max_rad - self.pitch_min_rad)

    def moc_aerodynamiczna(self, stany: dict[str, Dual]) -> Dual:
        return stany[STAN_MOCY_AERODYNAMICZNEJ] * self.udzial_mocy(stany[STAN_KATA_LOPAT])

    def pochodna_predkosci(self, moc_aero: Dual, moc_elektryczna: Dual) -> Dual:
        return (moc_aero - moc_elektryczna) / (2.0 * self.h_calkowite_s)

    def pochodna_kata(self, predkosc: Dual, kat: Dual) -> Dual:
        """Calka przesterowania z ogranicznikiem SZYBKOSCI i NIENAWROTNYM zakresu."""
        pochodna = ogranicz(predkosc - 1.0, -1.0, 1.0) * self.pitch_tempo_rad_s
        return pochodna_z_ogranicznikiem_nienawrotnym(
            pochodna, kat, self.pitch_min_rad, self.pitch_max_rad
        )


@dataclass(frozen=True)
class TurbinaWiatrowa:
    """Turbina wiatrowa typu 3 albo 4: wirnik + kat lopat + przeksztaltnik (+ crowbar)."""

    ident: str
    wezel: str
    typ: str
    rdzen: RdzenGFL
    tor: TorMechaniczny
    crowbar: Crowbar | None
    okno_mocy: OknoMocy
    omega_bazowa_rad_s: float
    uklad: UkladStanow = field(compare=False)

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return self.uklad.nazwy

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Kazdy stan turbiny MUSI byc rownowaga w punkcie pracy."""
        return ()

    @property
    def _opis(self) -> str:
        return f"turbina wiatrowa {self.ident}"

    def _modul_pradu(self, stany: dict[str, Dual]) -> Dual:
        return pierwiastek(
            kwadrat(stany[STAN_PRADU_CZYNNEGO]) + kwadrat(stany[STAN_PRADU_BIERNEGO])
        )

    def _okno(self, stany: dict[str, Dual]) -> OknoMocy:
        """Okno mocy domykane przez crowbar — Z GRADIENTEM po stanie crowbar.

        Domkniecie musi byc liczba dualna, a nie mnoznikiem liczbowym: stan
        crowbar wplywa na zadanie mocy czynnej, wiec bez tej sciezki blok `df/dx`
        rozminalby sie z wlasna funkcja (pomiar roznicy skonczonej przed
        naprawa: 2,1e+01 przy tolerancji 1e-5).
        """
        if self.crowbar is None:
            return self.okno_mocy
        sygnal = self.crowbar.sygnal(stany[STAN_CROWBAR], self._modul_pradu(stany))
        return self.okno_mocy.z_domknieciem(1.0 - sygnal)

    def _pochodne_dual(self, stany: dict[str, Dual], napiecie: Zespolona) -> list[Dual]:
        pochodne = self.rdzen.rownania(stany, napiecie, self._okno(stany), self._opis)
        moc_aero = self.tor.moc_aerodynamiczna(stany)
        moc_elektryczna = self.rdzen.moc_czynna(stany, napiecie)
        pochodne[STAN_PREDKOSCI_WIRNIKA] = self.tor.pochodna_predkosci(moc_aero, moc_elektryczna)
        pochodne[STAN_KATA_LOPAT] = self.tor.pochodna_kata(
            stany[STAN_PREDKOSCI_WIRNIKA], stany[STAN_KATA_LOPAT]
        )
        pochodne[STAN_MOCY_AERODYNAMICZNEJ] = Dual(0.0)
        if self.crowbar is not None:
            pochodne[STAN_CROWBAR] = self.crowbar.pochodna(
                stany[STAN_CROWBAR], self._modul_pradu(stany)
            )
        return self.uklad.uporzadkuj(pochodne)

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        wartosci = self.rdzen.stany_rownowagi(napiecie_pu, moc_pu, self.okno_mocy, self._opis)
        if moc_pu.real < 0.0:
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"{self._opis}: punkt pracy z ujemna moca czynna ({moc_pu.real} pu) "
                "nie jest praca turbiny wiatrowej",
                urzadzenie=self.ident,
                p_pu=moc_pu.real,
            )
        wartosci[STAN_PREDKOSCI_WIRNIKA] = 1.0
        wartosci[STAN_KATA_LOPAT] = self.tor.pitch_min_rad
        wartosci[STAN_MOCY_AERODYNAMICZNEJ] = moc_pu.real
        if self.crowbar is not None:
            wartosci[STAN_CROWBAR] = 0.0
        return self.uklad.wektor(wartosci)

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.bez_gradientu(stan, napiecie_pu)
        return np.array(
            [wielkosc.wartosc for wielkosc in self._pochodne_dual(stany, napiecie)],
            dtype=float,
        )

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        return self.uklad.blok_po_stanach(self._pochodne_dual(stany, napiecie))

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        return self.uklad.blok_po_napieciu(self._pochodne_dual(stany, napiecie))

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        stany, napiecie = self.uklad.bez_gradientu(stan, napiecie_pu)
        return self.rdzen.prad_siec(stany, napiecie).wartosc

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        prad = self.rdzen.prad_siec(stany, napiecie)
        return self.uklad.blok_po_napieciu([prad.re, prad.im])

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        prad = self.rdzen.prad_siec(stany, napiecie)
        return self.uklad.blok_po_stanach([prad.re, prad.im])

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        stany, _ = self.uklad.bez_gradientu(stan, 0j)
        return self.rdzen.napiecie_wewnetrzne(stany).wartosc

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        stany, _ = self.uklad.zaszczep(stan, 0j)
        napiecie = self.rdzen.napiecie_wewnetrzne(stany)
        return self.uklad.blok_po_stanach([napiecie.re, napiecie.im])


def _uklad_stanow_turbiny(rdzen: RdzenGFL, ma_crowbar: bool) -> UkladStanow:
    nazwy = [
        *rdzen.uklad.nazwy,
        STAN_PREDKOSCI_WIRNIKA,
        STAN_KATA_LOPAT,
        STAN_MOCY_AERODYNAMICZNEJ,
    ]
    if ma_crowbar:
        nazwy.append(STAN_CROWBAR)
    return UkladStanow(tuple(nazwy))


def zbuduj_turbine_wiatrowa(
    *,
    ident: str,
    wezel: str,
    typ: str,
    rdzen: RdzenGFL | None,
    h_calkowite_s: float,
    pitch_tempo_deg_s: float,
    pitch_min_deg: float,
    pitch_max_deg: float,
    crowbar: Crowbar | None,
    okno_mocy: OknoMocy,
    s_n_mva: float,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
) -> TurbinaWiatrowa:
    """Zbuduj turbine typu 3/4 albo ODMOW dla typu bez modelu elektrycznego.

    Zmiana bazy dotyczy WYLACZNIE stalej bezwladnosci (jak moc); kat lopat i jego
    tempo sa wielkosciami geometrycznymi i baza mocy ich nie dotyczy.
    """
    if typ in TYPY_BEZ_MODELU_ELEKTRYCZNEGO:
        raise OdmowaDynamiki(
            KOD_WARIANT_BEZ_PARAMETROW,
            f"Turbina {typ!r} to maszyna indukcyjna przylaczona wprost do sieci. "
            "Kontrakt nie niesie jej schematu zastepczego (Rs, Xs, Rr, Xr, Xm) ani "
            "mocy znamionowej, wiec prad wezlowy nie ma z czego powstac. Zlozalne "
            f"typy: {TYPY_ZLOZALNE}",
            typ=typ,
            zlozalne=TYPY_ZLOZALNE,
        )
    if typ not in TYPY_ZLOZALNE:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Typ turbiny {typ!r} spoza zbioru kontraktu "
            f"{(*TYPY_BEZ_MODELU_ELEKTRYCZNEGO, *TYPY_ZLOZALNE)}",
            typ=typ,
        )
    if rdzen is None:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Turbina {typ!r} wymaga bloku przeksztaltnika — bez niego nie ma "
            "sprzezenia z siecia",
            typ=typ,
        )
    if crowbar is not None and typ != TYP_Z_CROWBAR:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Crowbar dotyczy wylacznie {TYP_Z_CROWBAR} (obwod wirnika DFIG), "
            f"otrzymano {typ!r}",
            typ=typ,
        )
    if pitch_min_deg >= pitch_max_deg:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Zakres kata lopat [{pitch_min_deg}, {pitch_max_deg}] stopni jest pusty",
            pitch_min_deg=pitch_min_deg,
            pitch_max_deg=pitch_max_deg,
        )
    tor = TorMechaniczny(
        h_calkowite_s=h_calkowite_s * (s_n_mva / s_bazowa_mva),
        pitch_tempo_rad_s=math.radians(pitch_tempo_deg_s),
        pitch_min_rad=math.radians(pitch_min_deg),
        pitch_max_rad=math.radians(pitch_max_deg),
    )
    return TurbinaWiatrowa(
        ident=ident,
        wezel=wezel,
        typ=typ,
        rdzen=rdzen,
        tor=tor,
        crowbar=crowbar,
        okno_mocy=okno_mocy,
        omega_bazowa_rad_s=pulsacja_bazowa_rad_s(f_bazowa_hz),
        uklad=_uklad_stanow_turbiny(rdzen, crowbar is not None),
    )


__all__ = [
    "STAN_CROWBAR",
    "STAN_KATA_LOPAT",
    "STAN_MOCY_AERODYNAMICZNEJ",
    "STAN_PREDKOSCI_WIRNIKA",
    "TYPY_BEZ_MODELU_ELEKTRYCZNEGO",
    "TYPY_ZLOZALNE",
    "TYP_Z_CROWBAR",
    "Crowbar",
    "TorMechaniczny",
    "TurbinaWiatrowa",
    "zbuduj_turbine_wiatrowa",
]
