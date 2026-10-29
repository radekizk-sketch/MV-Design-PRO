"""Uziemienie punktu neutralnego sekcji SN — JEDYNA prawda wyprowadzana z elementów fizycznych
modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, rozstrzygnięcie §0 pkt 1).

Sposób uziemienia punktu neutralnego galwanicznie połączonej sieci SN (sekcja szyn GPZ razem
z odpływami; dwie sekcje przy zamkniętym łączniku szyn są JEDNĄ siecią) wynika wyłącznie z:

* zespołów uziemiających (``EnergyNetworkModel.zespoly_uziemiajace``) przyłączonych do szyn
  tej sieci — transformator uziemiający ZN i elementy w jego punkcie neutralnym (dławik
  gaszący, rezystor wymuszający AWSC, rezystor uziemiający; ENEA Zeszyt 1 §16, rysunki
  Z.13/Z.14/Z.15). Stan wyłącznika pola ZU wynika z topologii (zespół za otwartym łącznikiem
  nie leży w sieci), stan odłączników gałęzi punktu neutralnego — z rekordu urządzenia, stan
  automatyki AWSC — z przypadku obliczeniowego (``stan_awsc``, Case Immutability Rule);
* punktów neutralnych uzwojeń transformatorów, których zacisk leży w tej sieci i których
  model składowej zerowej (``enm.zero_sequence_transformer``, ten sam co w solverze) daje
  drogę prądu zerowego po tej stronie.

Czytelnicy (jedna funkcja, wiele miejsc): walidator (reguły zespołu i E-W5-01), mapowanie
składowej zerowej (bocznik Z_0,TU + 3·Z_N i klasyfikacja przyczyn braku wyniku), dowód
przekładników napięciowych, ładunek DER, analizy V12.6, ``BayEarthFaultPath`` i SLD.

Fizyka Z_N (X_L = U_f/I_L, R = U_f/I_R, Z_a‖Z_b, Z_0,TU + 3·Z_N, I_C = √3·U·B_0) mieszka
w ``network_model/pochodne/punkt_neutralny.py`` — ten moduł tylko ją woła.

Brak parametru urządzenia nie blokuje obliczeń (zasada nr 4): wartość robocza z podstawą
(pozycja typowa katalogu §16, środek zakresu dławika, środek przedziału prądu AWSC), jakość
``ESTIMATED``, wpis ``dane_przyjete``, kompletność ``NIEPELNY``. Brak samego zespołu w sieci
nie jest daną do zaproponowania — sieć jest wtedy izolowana albo uziemiona przez uzwojenie
transformatora, a brak drogi prądu zerowego jest nazwaną przyczyną braku wyniku zerowego.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from typing import Any, Literal

from network_model.catalog.governance import Poziom, brakuje_wymaganej_referencji
from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_earthing_transformer_records,
    get_all_neutral_earthing_resistor_records,
)
from network_model.catalog.wartosci_robocze import (
    ETYKIETA_B0,
    KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU,
    POLE_B0,
    dana_przyjeta_z0,
    wartosc_projektanta,
)
from network_model.core.uziemienie import (
    ETYKIETA_PL_WARIANTU_UZIEMIENIA,
    TRYBY_IEC60909,
    TYP_PUNKTU_NEUTRALNEGO_WARIANTU,
    StanAwsc,
    TrybDoziemienia,
    TypPunktuNeutralnego,
    WariantUziemieniaSekcji,
    tryb_doziemienia_wariantu,
)
from network_model.core.ybus import S_BASE_MVA
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import (
    impedancja_punktu_neutralnego_ohm,
    impedancja_rownolegla_ohm,
    impedancja_z_napiecia_i_mocy_ohm,
    impedancja_zerowa_zespolu_ohm,
    prad_elementu_punktu_neutralnego_a,
    prad_pojemnosciowy_doziemienia_a,
    reaktancja_dlawika_ohm,
    rezystancja_z_pradu_ohm,
)
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from network_model.solvers.doziemienie_sn import (
    DaneDoziemienia,
    PunktNeutralnyDoziemienia,
    WynikDoziemienia,
    oblicz_doziemienie,
)
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc
from werdykt.proweniencja import FieldQuality

from .bateria_kondensatorow import admitancja_zerowa_baterii_s
from .models import (
    Cable,
    DlawikGaszacy,
    EnergyNetworkModel,
    GroundingConfig,
    OverheadLine,
    RezystorUziemiajacy,
    ShuntCapacitor,
    Transformer,
    ZespolUziemiajacy,
)
from .nazwy_elementow import nazwa_elementu
from .skladowa_zerowa_galezi import napiecia_szyn_kv, skladowa_zerowa_galezi
from .topology import derive
from .zero_sequence_transformer import ZeroSeqConnection, build_transformer_zero_seq_model

#: Źródło wartości parametru urządzenia punktu neutralnego.
#: ``MODEL`` — wartość projektanta w rekordzie elementu; ``KATALOG`` — dana pozycji katalogu
#: (nieoznaczona jako robocza); ``KATALOG_ROBOCZA`` — pozycja typowa katalogu oznaczona
#: w ``wartosci_robocze``; ``PROPOZYCJA`` — wartość robocza tego modułu (zasada nr 4);
#: ``WYPROWADZONA`` — wynika z innej danej modelu (np. R z prądu znamionowego).
ZrodloParametru = Literal["MODEL", "KATALOG", "KATALOG_ROBOCZA", "PROPOZYCJA", "WYPROWADZONA"]
_ZRODLA_ROBOCZE: frozenset[str] = frozenset({"KATALOG_ROBOCZA", "PROPOZYCJA"})

RodzajGalezi = Literal["dlawik", "rezystor", "rezystor_awsc", "bezposrednie"]
RodzajPunktu = Literal["zespol_uziemiajacy", "uzwojenie_transformatora"]

#: Przyczyny braku wyniku składowej zerowej — trzy nazwane (wiersz §C SKLADOWA-ZEROWA).
#: ``brak_drogi`` — fizycznie brak drogi prądu zerowego do ziemi (status NIE_DOTYCZY: zwarcie
#: doziemne nie płynie; doziemienie ocenia analiza doziemień); ``poza_zakresem_iec60909`` —
#: sieć izolowana albo skompensowana (droga wyłącznie przez pojemności doziemne i/lub
#: dławik — IEC 60909-0 liczy zwarcia w sieciach uziemionych przez małą impedancję;
#: założenie jawne, tekstu normy brak w repo); ``brak_danych`` — węzeł odcięty od uziemienia
#: brakiem danych składowej zerowej gałęzi (R′0/X′0), którą model ma, albo leżący w sieci
#: zerowej źródła 110 kV / nN bez impedancji zerowej (Z0 sieci zasilającej nieznane).
PrzyczynaBrakuZerowej = Literal["brak_drogi", "poza_zakresem_iec60909", "brak_danych"]

#: Status maszynowy przyczyny (kontrakt werdyktu — wyłącznie z wyjaśnieniem).
STATUS_PRZYCZYNY_BRAKU_ZEROWEJ: Mapping[str, str] = {
    "brak_drogi": "NIE_DOTYCZY",
    "poza_zakresem_iec60909": "NIE_DOTYCZY",
    "brak_danych": "BRAK_PODSTAWY",
}

#: Kody przyczyn braku wyniku zerowego (rodzina ``fault.zero_sequence_*``).
KOD_PRZYCZYNY_BRAKU_ZEROWEJ: Mapping[str, str] = {
    "brak_drogi": "fault.zero_sequence_no_path",
    "poza_zakresem_iec60909": "fault.zero_sequence_outside_iec60909",
    "brak_danych": "fault.zero_sequence_missing_data",
}


def impedancja_zerowa_zrodla_dozwolona(napiecie_kv: float) -> bool:
    """Czy źródło na szynie o napięciu ``napiecie_kv`` może nieść impedancję zerową (Z0).

    JEDEN predykat dla walidatora (E-W5-01) i mapowania składowej zerowej (karta
    UX-04/POLE-ZU-SKLADOWA-ZEROWA, §0 pkt 3): uziemienie punktu neutralnego sieci SN opisuje
    wyłącznie zespół uziemiający albo punkt neutralny uzwojenia transformatora — źródło
    w paśmie SN nie. Źródło WN (sieć 110 kV z jej punktem neutralnym) i nN — tak. Napięcie
    nieznane nie leży w żadnym paśmie (``pasmo_napieciowe`` → None) — dozwolone, bo brak
    napięcia zgłasza osobna reguła, a odmowa tutaj ukryłaby tamten brak.
    """
    return pasmo_napieciowe(napiecie_kv) != "SN"


def czesci_zespolu_bez_katalogu(zu: ZespolUziemiajacy, poziom: Poziom) -> tuple[str, ...]:
    """Części zespołu uziemiającego bez pozycji katalogu, której oś ``poziom`` wymaga
    (``catalog.governance.wymagalnosc_katalogu("zespol_uziemiajacy")``).

    JEDEN predykat dla walidatora (E009), gotowości zwarciowej i bram importu ZIP/CGMES
    (Catalog Binding Rule): transformator uziemiający zawsze, dławik gaszący i rezystor —
    gdy są w punkcie neutralnym. Zwraca polskie nazwy części w stałej kolejności.
    """
    czesci: list[str] = []
    if brakuje_wymaganej_referencji(poziom, zu.catalog_ref):
        czesci.append("transformator uziemiający")
    if zu.dlawik is not None and brakuje_wymaganej_referencji(poziom, zu.dlawik.catalog_ref):
        czesci.append("dławik gaszący")
    if zu.rezystor is not None and brakuje_wymaganej_referencji(poziom, zu.rezystor.catalog_ref):
        czesci.append("rezystor uziemiający")
    return tuple(czesci)


#: Zakres dławika przyjmowany, gdy ani rekord, ani katalog go nie podaje.
PROPOZYCJA_ZAKRESU_DLAWIKA_A: tuple[float, float] = (40.0, 400.0)
_PODSTAWA_ZAKRESU_DLAWIKA = (
    "ENEA Zeszyt 1 §16 s. 29: parametry dławika minimum 40–400 A (wartość robocza)"
)
#: Prąd czynny wymuszany przez AWSC po stronie pierwotnej — środek przedziału 20–40 A.
PROPOZYCJA_PRADU_AWSC_A = 30.0
_PODSTAWA_PRADU_AWSC = (
    "ENEA Zeszyt 1 §16 s. 30: AWSC wymusza po stronie pierwotnej prądy 20–40 A; przyjęto "
    "środek przedziału 30 A (wartość robocza)"
)
_PODSTAWA_NASTAWY_DLAWIKA = (
    "środek zakresu regulacji dławika (I_min + I_max)/2 — wartość robocza do zastąpienia "
    "nastawą regulatora albo położeniem zaczepu"
)
#: Rozstrojenie, poniżej którego nastawa dławika jest uznana za pracę w punkcie
#: rezonansowym (Zeszyt 1 §16 s. 30: „nie dopuszcza się pracy … w punkcie rezonansowym … IL
#: = IC”). Próg 0,1 % jest założeniem jawnym: równość prądów z dokładnością zaokrąglenia
#: nastawy.
PROG_REZONANSU = 1e-3


@dataclass(frozen=True)
class ParametrPunktuNeutralnego:
    """Jeden parametr urządzenia punktu neutralnego z pochodzeniem i podstawą."""

    nazwa: str
    etykieta_pl: str
    wartosc: float
    jednostka: str
    zrodlo: ZrodloParametru
    podstawa_pl: str

    @property
    def roboczy(self) -> bool:
        return self.zrodlo in _ZRODLA_ROBOCZE

    def to_dict(self) -> dict[str, Any]:
        return {
            "nazwa": self.nazwa,
            "etykieta_pl": self.etykieta_pl,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "zrodlo": self.zrodlo,
            "podstawa_pl": self.podstawa_pl,
        }


def _zespolona(z: complex | None) -> dict[str, float] | None:
    return None if z is None else {"r_ohm": z.real, "x_ohm": z.imag}


@dataclass(frozen=True)
class GalazPunktuNeutralnego:
    """Gałąź punktu neutralnego zespołu (dławik, rezystor, rezystor AWSC, połączenie wprost).

    ``z_ohm`` — impedancja gałęzi [Ω] (bez mnożnika 3 obwodu zerowego); ``w_ruchu`` — gałąź
    przewodzi w danym stanie: odłącznik zamknięty (AWSC: wyłącznie w stanie załączonym).
    """

    rodzaj: RodzajGalezi
    z_ohm: complex
    prad_a: float | None
    odlacznik_zamkniety: bool
    tylko_awsc_zalaczony: bool = False
    #: Parametry, z których wynika ``z_ohm`` (dławik: nastawa, a zakres tylko wtedy, gdy
    #: nastawa jest jego środkiem; rezystor: R; AWSC: prąd wymuszany) — podstawa danych
    #: przyjętych WYNIKU z tą gałęzią (``PunktUziemienia.dane_przyjete_bocznika``).
    parametry_z: tuple[ParametrPunktuNeutralnego, ...] = ()

    def w_ruchu(self, stan_awsc: StanAwsc) -> bool:
        if not self.odlacznik_zamkniety:
            return False
        return not self.tylko_awsc_zalaczony or stan_awsc == "zalaczony"

    def to_dict(self) -> dict[str, Any]:
        return {
            "rodzaj": self.rodzaj,
            "z_ohm": _zespolona(self.z_ohm),
            "prad_a": self.prad_a,
            "odlacznik_zamkniety": self.odlacznik_zamkniety,
            "tylko_awsc_zalaczony": self.tylko_awsc_zalaczony,
        }


def _dana_przyjeta_parametru(p: ParametrPunktuNeutralnego, nazwa_punktu: str) -> DanaPrzyjeta:
    """Dana przyjęta ``ESTIMATED`` z parametru roboczego urządzenia punktu neutralnego."""
    return DanaPrzyjeta(
        nazwa_pl=f"{p.etykieta_pl} ({nazwa_punktu})",
        wartosc=Wielkosc(wartosc=p.wartosc, jednostka=p.jednostka),
        powod_pl=(
            f"{p.podstawa_pl}. Zmień wartość: {p.etykieta_pl} w parametrach zespołu "
            "uziemiającego (dane producenta albo nastawa)."
        ),
        jakosc=FieldQuality.ESTIMATED,
    )


@dataclass(frozen=True)
class RezystorPunktuNeutralnego:
    """Rezystor w punkcie neutralnym sieci SN — dane do sprawdzenia rezystora (projekt
    uziemienia V12.6): R, prąd znamionowy I_n i dopuszczalny czas jego przepływu t_n.

    R i I_n to TE SAME rozstrzygnięcia co gałąź bocznika składowej zerowej (``_galaz_rezystora``
    — jedno miejsce pierwszeństwa projekt > katalog > wartość robocza); t_n wchodzi wyłącznie
    do sprawdzenia cieplnego rezystora, więc nie należy do danych przyjętych zwarcia.
    """

    element_ref: str
    nazwa_pl: str
    r: ParametrPunktuNeutralnego
    i_n: ParametrPunktuNeutralnego
    t_n: ParametrPunktuNeutralnego
    #: Impedancja zerowa w szeregu z rezystorem [Ω/fazę] (droga prądu rezystora przy
    #: doziemieniu: Z_0/3 + R — sprawdzenie cieplne rezystora wg IEC 60909-0 i prąd
    #: doziemienia ``doziemienie_sn``): transformator uziemiający zespołu Z_0,TU albo — dla
    #: rezystora w punkcie neutralnym uzwojenia transformatora sieci — impedancja zerowa
    #: transformatora Z_T0 (ten sam model co stempel mapowania, ``z0_uzwojenia_ohm``).
    z0_tu_ohm: complex | None = None
    #: Parametry Z_0,TU (R0, X0) zespołu — dane przyjęte sprawdzenia cieplnego, gdy robocze.
    parametry_tu: tuple[ParametrPunktuNeutralnego, ...] = ()

    def dane_przyjete(self) -> tuple[DanaPrzyjeta, ...]:
        return tuple(
            _dana_przyjeta_parametru(p, self.nazwa_pl)
            for p in (self.r, self.i_n, self.t_n, *self.parametry_tu)
            if p.roboczy
        )


@dataclass(frozen=True)
class PunktUziemienia:
    """Punkt uziemienia sieci SN: zespół uziemiający albo punkt neutralny uzwojenia TR."""

    rodzaj: RodzajPunktu
    element_ref: str
    bus_ref: str
    nazwa_pl: str
    galezie: tuple[GalazPunktuNeutralnego, ...] = ()
    #: Impedancja zerowa transformatora uziemiającego Z_0,TU [Ω/fazę]; ``None`` dla uzwojenia
    #: transformatora (jego składową zerową stampuje model transformatora w mapowaniu).
    z0_tu_ohm: complex | None = None
    #: Typ uziemienia punktu neutralnego uzwojenia transformatora (tylko ``uzwojenie_…``).
    typ_uzwojenia: TypPunktuNeutralnego | None = None
    parametry: tuple[ParametrPunktuNeutralnego, ...] = ()
    #: Parametry Z_0,TU transformatora uziemiającego (R0, X0) — część ``parametry``.
    parametry_tu: tuple[ParametrPunktuNeutralnego, ...] = ()
    #: Odmowa nazwana (brak elementu w punkcie neutralnym, sprzeczna deklaracja).
    odmowa_pl: str | None = None
    #: Zespół ma rezystor wymuszający AWSC (Z.13).
    ma_awsc: bool = False
    #: Dławik z regulacją płynną (regulacja nadążna, §16) — ``None`` gdy brak dławika.
    regulacja_ciagla: bool | None = None
    #: Rezystor punktu neutralnego (gałąź rezystora zespołu albo rezystor uzwojenia TR
    #: uziemionego przez rezystor) — ``None`` bez rezystora.
    rezystor: RezystorPunktuNeutralnego | None = None
    #: Punkt neutralny uzwojenia transformatora: Z_N z konfiguracji uzwojenia [Ω] (0 —
    #: bezpośrednio) i impedancja zerowa transformatora Z_T0 [Ω] na napięciu sieci — te same
    #: wielkości, z których mapowanie stampuje bocznik Z_T0 + 3·Z_N
    #: (``build_transformer_zero_seq_model``); ``droga_szeregowa`` — obie gwiazdy uziemione
    #: (YNyn), droga prądu zerowego biegnie dalej przez sieć drugiej strony.
    z_n_uzwojenia_ohm: complex | None = None
    z0_uzwojenia_ohm: complex | None = None
    droga_szeregowa: bool = False

    def rezystor_w_ruchu(self, stan_awsc: StanAwsc) -> RezystorPunktuNeutralnego | None:
        """Rezystor punktu, gdy przewodzi w stanie ``stan_awsc`` (odłącznik gałęzi zamknięty)."""
        if self.rezystor is None or self.odmowa_pl is not None:
            return None
        if self.rodzaj == "uzwojenie_transformatora":
            return self.rezystor
        if any(g.rodzaj == "rezystor" for g in self.galezie_w_ruchu(stan_awsc)):
            return self.rezystor
        return None

    def galezie_w_ruchu(self, stan_awsc: StanAwsc) -> tuple[GalazPunktuNeutralnego, ...]:
        return tuple(g for g in self.galezie if g.w_ruchu(stan_awsc))

    def wariant(self, stan_awsc: StanAwsc = "spoczynek") -> WariantUziemieniaSekcji:
        """Wariant punktu w danym stanie AWSC (po stanach odłączników)."""
        if self.odmowa_pl is not None:
            return "izolowany"
        if self.rodzaj == "uzwojenie_transformatora":
            return _WARIANT_TYPU_UZWOJENIA[self.typ_uzwojenia or "directly_grounded"]
        rodzaje = {g.rodzaj for g in self.galezie_w_ruchu(stan_awsc)}
        if "bezposrednie" in rodzaje:
            return "bezposrednie"
        if "dlawik" in rodzaje and "rezystor" in rodzaje:
            return "dlawik_rezystor"
        if "dlawik" in rodzaje:
            return "dlawik_awsc" if self.ma_awsc else "dlawik"
        if "rezystor" in rodzaje:
            return "rezystor"
        return "izolowany"

    def z_n_ohm(self, stan_awsc: StanAwsc) -> complex | None:
        """Z_N punktu neutralnego zespołu [Ω] (gałęzie w ruchu równolegle); ``None`` = brak
        drogi (wszystkie gałęzie odłączone, odmowa) albo punkt uzwojenia TR."""
        if self.rodzaj != "zespol_uziemiajacy" or self.odmowa_pl is not None:
            return None
        galezie = self.galezie_w_ruchu(stan_awsc)
        if not galezie:
            return None
        if any(g.rodzaj == "bezposrednie" for g in galezie):
            return complex(0.0, 0.0)
        wynik = galezie[0].z_ohm
        for galaz in galezie[1:]:
            wynik = impedancja_rownolegla_ohm(wynik, galaz.z_ohm)
        return wynik

    def z0_bocznika_ohm(self, stan_awsc: StanAwsc) -> complex | None:
        """Bocznik składowej zerowej zespołu Z_0 = Z_0,TU + 3·Z_N [Ω] albo ``None``."""
        z_n = self.z_n_ohm(stan_awsc)
        if z_n is None or self.z0_tu_ohm is None:
            return None
        return impedancja_zerowa_zespolu_ohm(self.z0_tu_ohm, z_n)

    def tryb_doziemienia(self, stan_awsc: StanAwsc) -> TrybDoziemienia:
        """Tryb doziemienia punktu (``network_model.core.uziemienie`` — jedno odwzorowanie)."""
        return tryb_doziemienia_wariantu(self.wariant(stan_awsc))

    def bocznik_rezystancyjny(self, stan_awsc: StanAwsc) -> bool:
        """Bocznik uziemia sieć przez małą impedancję w zakresie IEC 60909 (rezystor, Z.14,
        wprost). Dławik — także z rezystorem wymuszającym AWSC w stanie załączonym (Z.13) —
        nie: sieć skompensowana, prąd doziemny to prąd resztkowy, nie zwarciowy. Ten sam
        predykat ``TRYBY_IEC60909`` co tryb doziemienia sieci."""
        return self.tryb_doziemienia(stan_awsc) in TRYBY_IEC60909

    def impedancje_doziemienia(self, stan_awsc: StanAwsc) -> tuple[complex, complex | None] | None:
        """(Z_N, Z_0 w szeregu) punktu w ruchu do prądu doziemienia ``doziemienie_sn``:
        zespół — Z_N gałęzi w ruchu i Z_0,TU; uzwojenie — Z_N konfiguracji i Z_T0. ``None`` —
        punkt bez drogi (odmowa, gałęzie odłączone, uzwojenie izolowane)."""
        if self.odmowa_pl is not None:
            return None
        if self.rodzaj == "uzwojenie_transformatora":
            if self.z_n_uzwojenia_ohm is None:
                return None
            return self.z_n_uzwojenia_ohm, self.z0_uzwojenia_ohm
        z_n = self.z_n_ohm(stan_awsc)
        if z_n is None:
            return None
        return z_n, self.z0_tu_ohm

    def dane_przyjete(self) -> tuple[DanaPrzyjeta, ...]:
        """Wszystkie parametry robocze urządzeń punktu (kompletność danych zespołu)."""
        return tuple(
            _dana_przyjeta_parametru(p, self.nazwa_pl) for p in self.parametry if p.roboczy
        )

    def dane_przyjete_bocznika(self, stan_awsc: StanAwsc) -> tuple[DanaPrzyjeta, ...]:
        """Dane przyjęte, które WCHODZĄ do bocznika składowej zerowej w stanie ``stan_awsc``:
        Z_0,TU oraz parametry gałęzi w ruchu (``parametry_z``) — wynik zwarcia doziemnego
        nie niesie założenia parametru, który go nie kształtuje (np. prąd AWSC w spoczynku,
        zakres dławika przy nastawie projektanta). Bez bocznika (odmowa, gałęzie odłączone,
        uzwojenie TR) — pusto."""
        if self.z0_bocznika_ohm(stan_awsc) is None:
            return ()
        parametry = [*self.parametry_tu] + [
            p for g in self.galezie_w_ruchu(stan_awsc) for p in g.parametry_z
        ]
        return tuple(_dana_przyjeta_parametru(p, self.nazwa_pl) for p in parametry if p.roboczy)

    def to_dict(self, stan_awsc: StanAwsc = "spoczynek") -> dict[str, Any]:
        return {
            "rodzaj": self.rodzaj,
            "element_ref": self.element_ref,
            "bus_ref": self.bus_ref,
            "nazwa_pl": self.nazwa_pl,
            "wariant": self.wariant(stan_awsc),
            "z0_tu_ohm": _zespolona(self.z0_tu_ohm),
            "z_n_spoczynek_ohm": _zespolona(self.z_n_ohm("spoczynek")),
            "z_n_awsc_zalaczony_ohm": _zespolona(self.z_n_ohm("zalaczony")),
            "typ_uzwojenia": self.typ_uzwojenia,
            "galezie": [g.to_dict() for g in self.galezie],
            "parametry": [p.to_dict() for p in self.parametry],
            "odmowa_pl": self.odmowa_pl,
        }


_WARIANT_TYPU_UZWOJENIA: Mapping[str, WariantUziemieniaSekcji] = {
    "directly_grounded": "bezposrednie",
    "resistor_grounded": "rezystor",
    "petersen_coil": "dlawik",
    "isolated": "izolowany",
}


@dataclass(frozen=True)
class UziemienieSekcji:
    """Uziemienie punktu neutralnego galwanicznie połączonej sieci SN."""

    szyny: tuple[str, ...]
    napiecie_kv: float
    punkty: tuple[PunktUziemienia, ...]
    #: Σ B_0 linii i kabli w ruchu (B′0 z modelu albo z wartości roboczej odcinka SN — jedno
    #: źródło ``enm.skladowa_zerowa_galezi``) i baterii kondensatorów w gwieździe uziemionej
    #: tej sieci [S]; gałęzie bez podstawy B′0 (B′1 nieznane) wymienione obok.
    b0_s: float
    galezie_bez_b0: tuple[str, ...]
    ostrzezenia: tuple[str, ...] = field(default=())
    #: Baterie kondensatorów załączone na szynach tej sieci z drogą zerową (gwiazda uziemiona,
    #: Y0 = Y1) i ich B_0 [S] — składnik ``b0_s`` (karta UX-04/POLE-BKR-MODEL; przynależność
    #: do sieci tym samym predykatem co gałęzie: szyna baterii w składowej galwanicznej).
    baterie_b0: tuple[tuple[str, float], ...] = field(default=())
    #: Odcinki tej sieci, których B′0 jest wartością roboczą (zasada nr 4): (ref, nazwa,
    #: B′0 [S/km], założenie) — dana przyjęta ``ESTIMATED`` każdego wyniku opartego na I_C.
    galezie_b0_robocze: tuple[tuple[str, str, float, str], ...] = field(default=())

    @property
    def punkty_w_ruchu(self) -> tuple[PunktUziemienia, ...]:
        return tuple(p for p in self.punkty if p.odmowa_pl is None)

    @property
    def odmowy(self) -> tuple[str, ...]:
        return tuple(p.odmowa_pl for p in self.punkty if p.odmowa_pl is not None)

    def wariant(self, stan_awsc: StanAwsc = "spoczynek") -> WariantUziemieniaSekcji:
        warianty = {p.wariant(stan_awsc) for p in self.punkty_w_ruchu} - {"izolowany"}
        if not warianty:
            return "izolowany"
        if "bezposrednie" in warianty:
            return "bezposrednie"
        z_dlawikiem = warianty & {"dlawik", "dlawik_awsc", "dlawik_rezystor"}
        z_rezystorem = warianty & {"rezystor", "dlawik_rezystor"}
        if z_dlawikiem and z_rezystorem:
            return "dlawik_rezystor"
        if z_rezystorem:
            return "rezystor"
        return "dlawik_awsc" if "dlawik_awsc" in warianty else "dlawik"

    def typ_punktu_neutralnego(self, stan_awsc: StanAwsc = "spoczynek") -> TypPunktuNeutralnego:
        return TYP_PUNKTU_NEUTRALNEGO_WARIANTU[self.wariant(stan_awsc)]  # type: ignore[return-value]

    @property
    def prad_pojemnosciowy_a(self) -> float | None:
        """I_C = √3·U_n·B_0 [A]; ``None`` gdy żadna gałąź ani bateria nie wnosi B_0 albo gdy
        choć jeden odcinek sieci nie ma podstawy B′0 — suma bez niego zaniżałaby I_C (wynik
        częściowy nie jest wynikiem; ``galezie_bez_b0`` nazywa odcinki)."""
        if self.b0_s <= 0.0 or self.galezie_bez_b0:
            return None
        return prad_pojemnosciowy_doziemienia_a(self.napiecie_kv, self.b0_s)

    def dane_przyjete_pojemnosci(self) -> tuple[DanaPrzyjeta, ...]:
        """Dane przyjęte ``ESTIMATED`` B′0 odcinków z wartości roboczej — jedna na (założenie,
        wartość) z listą odcinków (rozmiar rośnie z liczbą TYPÓW odcinków, nie ich liczbą)."""
        grupy: dict[tuple[str, float], list[str]] = {}
        for _, nazwa, b0, zalozenie in self.galezie_b0_robocze:
            grupy.setdefault((zalozenie, b0), []).append(nazwa)
        return tuple(
            dana_przyjeta_z0(
                pole=POLE_B0,
                etykieta=ETYKIETA_B0,
                zalozenie=zalozenie,
                wartosc=b0,
                miejsce_pl=", ".join(sorted(nazwy)),
            )
            for (zalozenie, b0), nazwy in sorted(grupy.items())
        )

    def prad_dlawikow_a(self) -> float | None:
        """Σ I_L dławików w ruchu [A] (nastawa albo wartość robocza)."""
        prady = [
            g.prad_a
            for p in self.punkty_w_ruchu
            for g in p.galezie_w_ruchu("spoczynek")
            if g.rodzaj == "dlawik" and g.prad_a is not None
        ]
        return sum(prady) if prady else None

    def tryb_doziemienia(self, stan_awsc: StanAwsc = "spoczynek") -> TrybDoziemienia:
        """Tryb doziemienia sieci (``network_model.core.uziemienie`` — jedno odwzorowanie)."""
        return tryb_doziemienia_wariantu(self.wariant(stan_awsc))

    def dane_doziemienia(
        self,
        stan_awsc: StanAwsc = "spoczynek",
        *,
        z1_ohm: complex | None = None,
        z2_ohm: complex | None = None,
        z0_ohm: complex | None = None,
        ikss_iec_a: float | None = None,
        z_f_ohm: complex | None = None,
    ) -> DaneDoziemienia:
        """Wejście solvera doziemienia tej sieci w stanie AWSC ``stan_awsc``: B_0 sieci (ten
        sam co ``prad_pojemnosciowy_a``; odcinki bez podstawy B′0 — ``None`` z nazwą) i punkty
        neutralne w ruchu (Z_N, Z_0 w szeregu); impedancje składowych i Ik1 punktu zwarcia —
        z rdzenia IEC 60909 (tryby uziemione przez małą impedancję)."""
        brak_b0 = (
            "odcinki sieci bez susceptancji zerowej B′0 i bez podstawy wartości roboczej "
            f"(susceptancja zgodna B′1 nieznana): {', '.join(self.galezie_bez_b0)}"
            if self.galezie_bez_b0
            else None
        )
        punkty: list[PunktNeutralnyDoziemienia] = []
        for punkt in self.punkty_w_ruchu:
            impedancje = punkt.impedancje_doziemienia(stan_awsc)
            if impedancje is None:
                continue
            punkty.append(
                PunktNeutralnyDoziemienia(
                    nazwa_pl=punkt.nazwa_pl, z_n_ohm=impedancje[0], z0_tu_ohm=impedancje[1]
                )
            )
        return DaneDoziemienia(
            tryb=self.tryb_doziemienia(stan_awsc),
            napiecie_kv=self.napiecie_kv,
            b0_s=None if brak_b0 else self.b0_s,
            punkty=tuple(punkty),
            brak_b0_pl=brak_b0,
            dlawik_w_ruchu=any(
                g.rodzaj == "dlawik"
                for p in self.punkty_w_ruchu
                for g in p.galezie_w_ruchu(stan_awsc)
            )
            or any(
                p.rodzaj == "uzwojenie_transformatora" and p.typ_uzwojenia == "petersen_coil"
                for p in self.punkty_w_ruchu
            ),
            droga_szeregowa=any(p.droga_szeregowa for p in self.punkty_w_ruchu),
            z1_ohm=z1_ohm,
            z2_ohm=z2_ohm,
            z0_ohm=z0_ohm,
            ikss_iec_a=ikss_iec_a,
            z_f_ohm=z_f_ohm,
        )

    def doziemienie(self, stan_awsc: StanAwsc = "spoczynek") -> WynikDoziemienia:
        """Doziemienie metaliczne sieci bez impedancji składowych punktu zwarcia (prąd sieci
        izolowanej, skompensowanej i rezystorowej nie zależy od miejsca doziemienia)."""
        return oblicz_doziemienie(self.dane_doziemienia(stan_awsc))

    def dane_przyjete_doziemienia(
        self, stan_awsc: StanAwsc = "spoczynek"
    ) -> tuple[DanaPrzyjeta, ...]:
        """Dane przyjęte ESTIMATED, które kształtują prąd doziemienia w stanie ``stan_awsc``:
        B′0 odcinków z wartości roboczej (I_C) i parametry gałęzi punktów neutralnych w ruchu
        z Z_0,TU (te same, co bocznik składowej zerowej)."""
        return (
            *self.dane_przyjete_pojemnosci(),
            *(d for p in self.punkty_w_ruchu for d in p.dane_przyjete_bocznika(stan_awsc)),
        )

    @property
    def rozstrojenie(self) -> float | None:
        """v = (I_C − I_L)/I_C w stanie normalnym (AWSC w spoczynku) — z solvera doziemienia
        (I_L = −Im I_N: prąd dławików przy U0 = U_f z impedancją zerową transformatora
        uziemiającego); ``None`` bez dławika w ruchu albo bez I_C."""
        return self.doziemienie("spoczynek").rozstrojenie

    def rezystory_w_ruchu(
        self, stan_awsc: StanAwsc = "spoczynek"
    ) -> tuple[RezystorPunktuNeutralnego, ...]:
        """Rezystory punktów neutralnych sieci przewodzące w stanie ``stan_awsc``."""
        return tuple(
            r for p in self.punkty_w_ruchu if (r := p.rezystor_w_ruchu(stan_awsc)) is not None
        )

    @property
    def regulacja_nadazna(self) -> bool:
        """Każdy dławik w ruchu ma regulację płynną (praca nadążna §16)."""
        dlawiki = [p for p in self.punkty_w_ruchu if p.regulacja_ciagla is not None]
        return bool(dlawiki) and all(p.regulacja_ciagla for p in dlawiki)

    def dane_przyjete(self) -> tuple[DanaPrzyjeta, ...]:
        return tuple(d for p in self.punkty_w_ruchu for d in p.dane_przyjete())

    @property
    def kompletnosc(self) -> Literal["PELNY", "NIEPELNY"]:
        """Kompletność danych sieci: punkty uziemienia ORAZ pojemność doziemna (I_C liczone
        z B′0 roboczego nie jest potwierdzonym dowodem — kontrakt werdyktu §3)."""
        if self.dane_przyjete() or self.galezie_b0_robocze:
            return "NIEPELNY"
        return "PELNY"

    def opis_pl(self, stan_awsc: StanAwsc = "spoczynek") -> str:
        wariant = self.wariant(stan_awsc)
        etykieta = ETYKIETA_PL_WARIANTU_UZIEMIENIA[wariant]
        if not self.punkty_w_ruchu:
            return f"Punkt neutralny sieci {self.napiecie_kv:g} kV: {etykieta} (brak uziemienia)."
        punkty = "; ".join(
            f"{p.nazwa_pl}: {ETYKIETA_PL_WARIANTU_UZIEMIENIA[p.wariant(stan_awsc)]}"
            for p in self.punkty_w_ruchu
        )
        return f"Punkt neutralny sieci {self.napiecie_kv:g} kV: {etykieta} ({punkty})."

    @property
    def ma_awsc(self) -> bool:
        """Choć jeden punkt uziemienia w ruchu ma automatykę wymuszania składowej czynnej."""
        return any(p.ma_awsc for p in self.punkty_w_ruchu)

    def to_dict(self, stan_awsc: StanAwsc = "spoczynek") -> dict[str, Any]:
        return {
            "szyny": list(self.szyny),
            "napiecie_kv": self.napiecie_kv,
            "wariant": self.wariant(stan_awsc),
            "wariant_awsc_zalaczony": self.wariant("zalaczony"),
            "typ_punktu_neutralnego": self.typ_punktu_neutralnego(stan_awsc),
            "punkty": [p.to_dict(stan_awsc) for p in self.punkty],
            "b0_s": self.b0_s,
            "galezie_bez_b0": list(self.galezie_bez_b0),
            "baterie_b0": [{"ref": ref, "b0_s": b0} for ref, b0 in self.baterie_b0],
            "prad_pojemnosciowy_a": self.prad_pojemnosciowy_a,
            "dane_przyjete_pojemnosci": [
                d.model_dump(mode="json") for d in self.dane_przyjete_pojemnosci()
            ],
            "prad_dlawikow_a": self.prad_dlawikow_a(),
            "rozstrojenie": self.rozstrojenie,
            "tryb_doziemienia": self.tryb_doziemienia(stan_awsc),
            "doziemienie": self.doziemienie(stan_awsc).to_dict(),
            # Z.13: automatyka wymuszania składowej czynnej — doziemienie także po jej
            # załączeniu (sieć nadal skompensowana: rośnie składowa czynna I_w); bez AWSC None.
            "ma_awsc": self.ma_awsc,
            "doziemienie_awsc_zalaczony": (
                self.doziemienie("zalaczony").to_dict() if self.ma_awsc else None
            ),
            "ostrzezenia": list(self.ostrzezenia),
            "odmowy": list(self.odmowy),
            "kompletnosc": self.kompletnosc,
            "opis_pl": self.opis_pl(stan_awsc),
        }


# ---------------------------------------------------------------------------
# Rozstrzygnięcie parametrów (projekt > katalog > wartość robocza)
# ---------------------------------------------------------------------------


def _rozstrzygnij(
    nazwa: str,
    etykieta_pl: str,
    jednostka: str,
    wartosc_elementu: float | None,
    params: Mapping[str, Any] | None,
    *,
    nazwa_w_katalogu: str | None = None,
    propozycja: tuple[float, str] | None = None,
) -> ParametrPunktuNeutralnego | None:
    """Jedno miejsce pierwszeństwa: wartość projektanta > katalog > wartość robocza.

    Wartość elementu równa katalogowej jest wartością katalogu (z jej założeniem) — ten sam
    predykat ``wartosc_projektanta`` co uzupełnienie katalogu i dane przyjęte gałęzi.
    """
    klucz = nazwa_w_katalogu or nazwa
    params = params or {}
    katalogowa = params.get(klucz)
    katalogowa = float(katalogowa) if isinstance(katalogowa, int | float) else None
    if wartosc_elementu is not None and (
        katalogowa is None or wartosc_projektanta(wartosc_elementu, katalogowa)
    ):
        return ParametrPunktuNeutralnego(
            nazwa, etykieta_pl, float(wartosc_elementu), jednostka, "MODEL", "wartość projektanta"
        )
    if katalogowa is not None:
        robocze = params.get(KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU)
        zalozenie = robocze.get(klucz) if isinstance(robocze, Mapping) else None
        if isinstance(zalozenie, str):
            return ParametrPunktuNeutralnego(
                nazwa, etykieta_pl, katalogowa, jednostka, "KATALOG_ROBOCZA", zalozenie
            )
        return ParametrPunktuNeutralnego(
            nazwa, etykieta_pl, katalogowa, jednostka, "KATALOG", "dana pozycji katalogu"
        )
    if propozycja is not None:
        return ParametrPunktuNeutralnego(
            nazwa, etykieta_pl, propozycja[0], jednostka, "PROPOZYCJA", propozycja[1]
        )
    return None


def _najblizsza_pozycja(rekordy: list[dict], u_kv: float) -> dict:
    return min(rekordy, key=lambda r: (abs(float(r["params"]["u_n_kv"]) - u_kv), r["id"]))


def _propozycja_z0_tu(u_kv: float) -> tuple[tuple[float, str], tuple[float, str]]:
    pozycja = _najblizsza_pozycja(get_all_earthing_transformer_records(), u_kv)
    p = pozycja["params"]
    podstawa = (
        f"pozycja typowa katalogu „{pozycja['name']}” (U_n {p['u_n_kv']:g} kV) — "
        f"{p[KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU]['r0_ohm']}"
    )
    return (float(p["r0_ohm"]), podstawa), (float(p["x0_ohm"]), podstawa)


def _propozycja_pradu_rezystora(u_kv: float) -> tuple[float, str]:
    pozycja = _najblizsza_pozycja(get_all_neutral_earthing_resistor_records(), u_kv)
    p = pozycja["params"]
    return float(p["i_n_a"]), (
        f"prąd znamionowy pozycji typowej katalogu „{pozycja['name']}” — "
        f"{p[KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU]['i_n_a']}"
    )


def _propozycja_czasu_rezystora(u_kv: float) -> tuple[float, str]:
    pozycja = _najblizsza_pozycja(get_all_neutral_earthing_resistor_records(), u_kv)
    p = pozycja["params"]
    return float(p["t_s"]), (
        f"dopuszczalny czas przepływu prądu znamionowego pozycji typowej katalogu "
        f"„{pozycja['name']}” — {p[KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU]['t_s']}"
    )


_ETYKIETA_R = "Rezystancja rezystora uziemiającego"
_ETYKIETA_I_N = "Prąd znamionowy rezystora uziemiającego"
_ETYKIETA_T_N = "Dopuszczalny czas przepływu prądu znamionowego rezystora"


def _zamkniety(stan: str) -> bool:
    return stan == "zamkniety"


def _galaz_dlawika(
    dlawik: DlawikGaszacy, u_kv: float, parametry: list[ParametrPunktuNeutralnego]
) -> tuple[GalazPunktuNeutralnego, ...]:
    mp = dlawik.materialized_params
    i_min = _rozstrzygnij(
        "dlawik.i_min_a",
        "Prąd minimalny zakresu dławika",
        "A",
        dlawik.i_min_a,
        mp,
        nazwa_w_katalogu="i_min_a",
        propozycja=(PROPOZYCJA_ZAKRESU_DLAWIKA_A[0], _PODSTAWA_ZAKRESU_DLAWIKA),
    )
    i_max = _rozstrzygnij(
        "dlawik.i_max_a",
        "Prąd maksymalny zakresu dławika",
        "A",
        dlawik.i_max_a,
        mp,
        nazwa_w_katalogu="i_max_a",
        propozycja=(PROPOZYCJA_ZAKRESU_DLAWIKA_A[1], _PODSTAWA_ZAKRESU_DLAWIKA),
    )
    assert i_min is not None and i_max is not None
    if dlawik.i_nastawy_a is not None:
        nastawa = ParametrPunktuNeutralnego(
            "dlawik.i_nastawy_a",
            "Prąd nastawy dławika",
            float(dlawik.i_nastawy_a),
            "A",
            "MODEL",
            "nastawa projektanta",
        )
    else:
        robocza_zakresu = i_min.roboczy or i_max.roboczy
        nastawa = ParametrPunktuNeutralnego(
            "dlawik.i_nastawy_a",
            "Prąd nastawy dławika",
            (i_min.wartosc + i_max.wartosc) / 2.0,
            "A",
            "PROPOZYCJA",
            _PODSTAWA_NASTAWY_DLAWIKA
            + (" (zakres z wartości roboczej)" if robocza_zakresu else ""),
        )
    parametry.extend((i_min, i_max, nastawa))
    galezie = [
        GalazPunktuNeutralnego(
            rodzaj="dlawik",
            z_ohm=impedancja_punktu_neutralnego_ohm(
                None, reaktancja_dlawika_ohm(u_kv, nastawa.wartosc)
            ),
            prad_a=nastawa.wartosc,
            odlacznik_zamkniety=_zamkniety(dlawik.stan_odlacznika),
            parametry_z=(nastawa,) if nastawa.zrodlo == "MODEL" else (i_min, i_max, nastawa),
        )
    ]
    if dlawik.awsc is not None:
        i_w = _rozstrzygnij(
            "awsc.i_wymuszany_a",
            "Prąd czynny wymuszany przez AWSC (strona pierwotna)",
            "A",
            dlawik.awsc.i_wymuszany_a,
            None,
            propozycja=(PROPOZYCJA_PRADU_AWSC_A, _PODSTAWA_PRADU_AWSC),
        )
        assert i_w is not None
        parametry.append(i_w)
        galezie.append(
            GalazPunktuNeutralnego(
                rodzaj="rezystor_awsc",
                z_ohm=impedancja_punktu_neutralnego_ohm(
                    rezystancja_z_pradu_ohm(u_kv, i_w.wartosc), None
                ),
                prad_a=i_w.wartosc,
                # Rezystor AWSC jest przyłączony do uzwojenia wtórnego dławika — przewodzi
                # tylko przez dławik, więc odłącznik dławika odłącza także jego.
                odlacznik_zamkniety=_zamkniety(dlawik.stan_odlacznika),
                tylko_awsc_zalaczony=True,
                parametry_z=(i_w,),
            )
        )
    return tuple(galezie)


def _galaz_rezystora(
    rezystor: RezystorUziemiajacy,
    u_kv: float,
    parametry: list[ParametrPunktuNeutralnego],
    element_ref: str,
    nazwa_pl: str,
) -> tuple[GalazPunktuNeutralnego, RezystorPunktuNeutralnego]:
    mp = rezystor.materialized_params
    r = _rozstrzygnij(
        "rezystor.r_ohm", _ETYKIETA_R, "Ω", rezystor.r_ohm, mp, nazwa_w_katalogu="r_ohm"
    )
    i_n = _rozstrzygnij(
        "rezystor.i_n_a", _ETYKIETA_I_N, "A", rezystor.i_n_a, mp, nazwa_w_katalogu="i_n_a"
    )
    if r is None:
        if i_n is None:
            prad, podstawa = _propozycja_pradu_rezystora(u_kv)
            i_n = ParametrPunktuNeutralnego(
                "rezystor.i_n_a", _ETYKIETA_I_N, prad, "A", "PROPOZYCJA", podstawa
            )
        r = ParametrPunktuNeutralnego(
            "rezystor.r_ohm",
            _ETYKIETA_R,
            rezystancja_z_pradu_ohm(u_kv, i_n.wartosc),
            "Ω",
            "PROPOZYCJA" if i_n.roboczy else "WYPROWADZONA",
            f"R = U_n/(√3·I_n) z prądu znamionowego {i_n.wartosc:g} A ({i_n.podstawa_pl})",
        )
    parametry.append(r)
    if i_n is not None:
        parametry.append(i_n)
    z = impedancja_punktu_neutralnego_ohm(r.wartosc, None)
    galaz = GalazPunktuNeutralnego(
        rodzaj="rezystor",
        z_ohm=z,
        prad_a=prad_elementu_punktu_neutralnego_a(u_kv, z),
        odlacznik_zamkniety=_zamkniety(rezystor.stan_odlacznika),
        parametry_z=(r,),
    )
    t_n = _rozstrzygnij(
        "rezystor.t_s",
        _ETYKIETA_T_N,
        "s",
        rezystor.t_s,
        mp,
        nazwa_w_katalogu="t_s",
        propozycja=_propozycja_czasu_rezystora(u_kv),
    )
    assert t_n is not None
    return galaz, RezystorPunktuNeutralnego(
        element_ref=element_ref,
        nazwa_pl=nazwa_pl,
        r=r,
        i_n=i_n if i_n is not None else _prad_z_rezystancji(u_kv, r),
        t_n=t_n,
    )


def _prad_z_rezystancji(u_kv: float, r: ParametrPunktuNeutralnego) -> ParametrPunktuNeutralnego:
    """I_n = U_n/(√3·R) — prąd rezystora przy pełnym U_f, gdy model podaje tylko R."""
    return ParametrPunktuNeutralnego(
        "rezystor.i_n_a",
        _ETYKIETA_I_N,
        prad_elementu_punktu_neutralnego_a(u_kv, complex(r.wartosc, 0.0)),
        "A",
        "PROPOZYCJA" if r.roboczy else "WYPROWADZONA",
        f"I_n = U_n/(√3·R) z rezystancji {r.wartosc:g} Ω ({r.podstawa_pl})",
    )


def _rezystor_uzwojenia(
    cfg: GroundingConfig | None, u_kv: float, element_ref: str, nazwa_pl: str
) -> RezystorPunktuNeutralnego | None:
    """Rezystor punktu neutralnego uzwojenia TR uziemionego przez rezystor (R z konfiguracji
    uzwojenia — wartość projektanta; I_n wyprowadzony z R; t_n — wartość robocza)."""
    if cfg is None or cfg.type != "resistor_grounded" or not cfg.r_ohm or cfg.r_ohm <= 0:
        return None
    r = ParametrPunktuNeutralnego(
        "rezystor.r_ohm", _ETYKIETA_R, float(cfg.r_ohm), "Ω", "MODEL", "wartość projektanta"
    )
    t_s, podstawa = _propozycja_czasu_rezystora(u_kv)
    return RezystorPunktuNeutralnego(
        element_ref=element_ref,
        nazwa_pl=nazwa_pl,
        r=r,
        i_n=_prad_z_rezystancji(u_kv, r),
        t_n=ParametrPunktuNeutralnego(
            "rezystor.t_s", _ETYKIETA_T_N, t_s, "s", "PROPOZYCJA", podstawa
        ),
    )


def punkt_zespolu(zu: ZespolUziemiajacy, u_kv: float) -> PunktUziemienia:
    """Punkt uziemienia z rekordu zespołu przy napięciu sieci ``u_kv`` [kV]."""
    nazwa = nazwa_elementu(zu, "zespoly_uziemiajace")
    parametry: list[ParametrPunktuNeutralnego] = []
    mp = zu.materialized_params
    propozycja_r0, propozycja_x0 = _propozycja_z0_tu(u_kv)
    r0 = _rozstrzygnij(
        "r0_ohm",
        "Rezystancja zerowa transformatora uziemiającego R0",
        "Ω",
        zu.r0_ohm,
        mp,
        propozycja=propozycja_r0,
    )
    x0 = _rozstrzygnij(
        "x0_ohm",
        "Reaktancja zerowa transformatora uziemiającego X0",
        "Ω",
        zu.x0_ohm,
        mp,
        propozycja=propozycja_x0,
    )
    assert r0 is not None and x0 is not None
    parametry.extend((r0, x0))
    z0_tu = complex(r0.wartosc, x0.wartosc)

    galezie: list[GalazPunktuNeutralnego] = []
    rezystor: RezystorPunktuNeutralnego | None = None
    if zu.dlawik is not None:
        galezie.extend(_galaz_dlawika(zu.dlawik, u_kv, parametry))
    if zu.rezystor is not None:
        galaz_r, rezystor = _galaz_rezystora(zu.rezystor, u_kv, parametry, zu.ref_id, nazwa)
        rezystor = replace(rezystor, z0_tu_ohm=z0_tu, parametry_tu=(r0, x0))
        galezie.append(galaz_r)
    odmowa: str | None = None
    if zu.uziemienie_bezposrednie:
        if galezie:
            odmowa = (
                f"Zespół uziemiający {nazwa}: zadeklarowano uziemienie bezpośrednie punktu "
                "neutralnego razem z dławikiem lub rezystorem — sprzeczne (punkt neutralny "
                "połączony wprost z ziemią zwiera element w punkcie neutralnym)."
            )
        else:
            galezie.append(
                GalazPunktuNeutralnego(
                    rodzaj="bezposrednie",
                    z_ohm=complex(0.0, 0.0),
                    prad_a=None,
                    odlacznik_zamkniety=True,
                )
            )
    elif not galezie:
        odmowa = (
            f"Zespół uziemiający {nazwa}: brak elementu w punkcie neutralnym transformatora "
            "uziemiającego (dławika gaszącego, rezystora albo deklaracji uziemienia "
            "bezpośredniego) — sposób uziemienia sieci nieokreślony."
        )
    return PunktUziemienia(
        rodzaj="zespol_uziemiajacy",
        element_ref=zu.ref_id,
        bus_ref=zu.bus_ref,
        nazwa_pl=nazwa,
        galezie=tuple(galezie),
        z0_tu_ohm=z0_tu,
        parametry=tuple(parametry),
        parametry_tu=(r0, x0),
        odmowa_pl=odmowa,
        ma_awsc=zu.dlawik is not None and zu.dlawik.awsc is not None,
        regulacja_ciagla=(None if zu.dlawik is None else _regulacja_dlawika(zu.dlawik) == "ciagla"),
        rezystor=rezystor,
    )


def _regulacja_dlawika(dlawik: DlawikGaszacy) -> str:
    if dlawik.regulacja is not None:
        return dlawik.regulacja
    z_katalogu = (dlawik.materialized_params or {}).get("regulacja")
    # Zeszyt 1 §16 s. 31: dławik z automatyczną, płynną regulacją — rozwiązanie wymagane;
    # zaczepy są wyłącznie wtedy, gdy rekord albo katalog je podaje.
    return str(z_katalogu) if isinstance(z_katalogu, str) else "ciagla"


def _punkty_uzwojen(
    transformatory: list[Transformer], szyny: frozenset[str], u_kv: float
) -> list[PunktUziemienia]:
    """Punkty neutralne uzwojeń transformatorów z drogą prądu zerowego po stronie tej sieci.

    Ten sam model połączeń co solver (``build_transformer_zero_seq_model``): bocznik po
    stronie leżącej w sieci albo połączenie szeregowe (obie gwiazdy uziemione — droga do ziemi
    przez sieć drugiej strony). Transformator, którego modelu nie da się zbudować, zgłaszają
    jego kody (E-W5-02/03) — tu nie jest punktem uziemienia.
    """
    wynik: list[PunktUziemienia] = []
    for trafo in sorted(transformatory, key=lambda t: t.ref_id):
        strony = [
            s for s, szyna in (("HV", trafo.hv_bus_ref), ("LV", trafo.lv_bus_ref)) if szyna in szyny
        ]
        if not strony:
            continue
        try:
            model = build_transformer_zero_seq_model(trafo)
        except (OdmowaDanychError, ValueError):
            continue
        for strona in strony:
            droga = model.connection == ZeroSeqConnection.SERIES_THROUGH or (
                model.connection
                == (
                    ZeroSeqConnection.HV_SHUNT_GROUND
                    if strona == "HV"
                    else ZeroSeqConnection.LV_SHUNT_GROUND
                )
            )
            if not droga:
                continue
            cfg = trafo.hv_neutral if strona == "HV" else trafo.lv_neutral
            typ = (cfg or GroundingConfig(type="directly_grounded")).type
            nazwa = (
                f"{nazwa_elementu(trafo, 'transformers')}, uzwojenie "
                f"{'górne' if strona == 'HV' else 'dolne'}"
            )
            # Z_T0 [Ω] na napięciu sieci — ta sama baza co stempel bocznika w mapowaniu
            # (Y0 = Z_base(U_n szyny)/Z0: z0_pu na S_base przeliczone bazą szyny).
            assert model.z_t0_pu is not None
            z0_uzwojenia = model.z_t0_pu * impedancja_z_napiecia_i_mocy_ohm(u_kv, S_BASE_MVA)
            rezystor = _rezystor_uzwojenia(cfg, u_kv, trafo.ref_id, nazwa)
            wynik.append(
                PunktUziemienia(
                    rodzaj="uzwojenie_transformatora",
                    element_ref=trafo.ref_id,
                    bus_ref=trafo.hv_bus_ref if strona == "HV" else trafo.lv_bus_ref,
                    nazwa_pl=nazwa,
                    typ_uzwojenia=typ,
                    rezystor=(
                        None if rezystor is None else replace(rezystor, z0_tu_ohm=z0_uzwojenia)
                    ),
                    z_n_uzwojenia_ohm=model.zn_hv_ohm if strona == "HV" else model.zn_lv_ohm,
                    z0_uzwojenia_ohm=z0_uzwojenia,
                    droga_szeregowa=model.connection == ZeroSeqConnection.SERIES_THROUGH,
                )
            )
    return wynik


def galezie_sieci_sn(
    enm: EnergyNetworkModel, szyny: frozenset[str]
) -> tuple[OverheadLine | Cable, ...]:
    """Linie i kable w ruchu połączonej sieci SN o szynach ``szyny`` (sortowane po ``ref_id``).

    JEDYNY predykat przynależności gałęzi do sieci SN: z niego idzie suma B0 tej prawdy
    (``UziemienieSekcji.b0_s`` → I_C) i zakres gałęzi analiz V12.6 (``galezie_sieci`` —
    projekt uziemienia, ferrorezonans), żeby oba zbiory nie rozjechały się na gałęzi otwartej
    albo na granicy sieci."""
    return tuple(
        galaz
        for galaz in sorted(enm.branches, key=lambda g: g.ref_id)
        if isinstance(galaz, OverheadLine | Cable)
        and galaz.status == "closed"
        and galaz.from_bus_ref in szyny
    )


def b0_baterii_s(enm: EnergyNetworkModel, bateria: ShuntCapacitor) -> float:
    """Susceptancja zerowa fazy baterii względem ziemi B_0 [S] przy częstotliwości studium.

    JEDNO źródło B_0 baterii dla prawdy o uziemieniu sieci (I_C, rozstrojenie) i dla wejścia
    V12.6 (``V126ShuntCapacitorInput.b0_siemens``): gwiazda uziemiona B_0 = B (Y0 = Y1),
    pozostałe układy 0 (``enm.bateria_kondensatorow.admitancja_zerowa_baterii_s``). Częstotliwość
    z nagłówka modelu — to samo pole, z którego mapowanie Y0 liczy admitancję baterii."""
    return admitancja_zerowa_baterii_s(
        bateria.model_dump(mode="json"), float(enm.header.defaults.frequency_hz)
    ).imag


def baterie_sieci_sn(enm: EnergyNetworkModel, szyny: frozenset[str]) -> tuple[ShuntCapacitor, ...]:
    """Baterie kondensatorów załączone na szynach połączonej sieci SN o szynach ``szyny``
    (sortowane po ``ref_id``) — JEDYNY predykat przynależności baterii do sieci (suma B_0 tej
    prawdy i zakres baterii analiz V12.6)."""
    return tuple(
        bateria
        for bateria in sorted(enm.shunt_capacitors, key=lambda b: b.ref_id)
        if bateria.status == "closed" and bateria.bus_ref in szyny
    )


def _b0_sieci(enm: EnergyNetworkModel, szyny: frozenset[str]) -> tuple[
    float,
    tuple[str, ...],
    tuple[tuple[str, float], ...],
    tuple[tuple[str, str, float, str], ...],
]:
    b0 = 0.0
    brak: list[str] = []
    robocze: list[tuple[str, str, float, str]] = []
    napiecia = napiecia_szyn_kv(enm)
    for galaz in galezie_sieci_sn(enm, szyny):
        # B′0 z modelu albo wartość robocza odcinka SN — ten sam predykat co bocznik pojemności
        # w sieci zerowej zwarć (``enm.mapping``) i wejście V12.6.
        skladowa = skladowa_zerowa_galezi(galaz, napiecia.get(galaz.from_bus_ref))
        if skladowa.b0_s_per_km is None:
            brak.append(galaz.ref_id)
            continue
        b0 += skladowa.b0_s_per_km * galaz.length_km
        robocze.extend(
            (galaz.ref_id, nazwa_elementu(galaz, "branches"), wartosc, zalozenie)
            for _, _, zalozenie, wartosc in skladowa.robocze_b0
        )
    baterie: list[tuple[str, float]] = []
    for bateria in baterie_sieci_sn(enm, szyny):
        b0_baterii = b0_baterii_s(enm, bateria)
        if b0_baterii > 0.0:
            baterie.append((bateria.ref_id, b0_baterii))
            b0 += b0_baterii
    return b0, tuple(brak), tuple(baterie), tuple(robocze)


def _ostrzezenia(sekcja: UziemienieSekcji) -> tuple[str, ...]:
    wynik: list[str] = []
    zespoly = [p for p in sekcja.punkty_w_ruchu if p.rodzaj == "zespol_uziemiajacy"]
    if len(zespoly) > 1:
        wynik.append(
            "Na połączoną sieć SN pracuje więcej niż jeden zespół uziemiający "
            f"({len(zespoly)}: {', '.join(p.nazwa_pl for p in zespoly)}) — "
            "ENEA Zeszyt 1 §16 s. 29 dobiera zespół na pracę jednego zespołu na sieć sekcji A+B; "
            "§26.10.7 s. 56: przy zamkniętym łączniku szyn AWSCz blokowane w jednej sekcji."
        )
    v = sekcja.rozstrojenie
    if v is not None and abs(v) < PROG_REZONANSU:
        wynik.append(
            "Nastawa dławików równa prądowi pojemnościowemu sieci (rozstrojenie "
            f"{v * 100:.2f} %) — ENEA Zeszyt 1 §16 s. 30 zakazuje pracy w punkcie rezonansowym "
            "I_L = I_C."
        )
    return tuple(wynik)


def tor_odlaczonego_pola_zu(enm: EnergyNetworkModel, szyny: Iterable[str]) -> bool:
    """Czy zbiór szyn to wyłącznie zaciski torów pól zespołu uziemiającego (rola ``ZU``).

    JEDEN predykat dla uziemienia sieci (zespół za otwartym wyłącznikiem pola nie jest
    siecią SN i nie uziemia niczego) i walidatora (E003: tor odłączonego pola ZU nie jest
    „wyspą odciętą od zasilania”, tylko zespołem wyłączonym z ruchu — stan ruchowy, nie
    błąd modelu). Pusty zbiór — ``False``."""
    zaciski = {b.terminal_bus_ref for b in enm.bays if b.bay_role == "ZU" and b.terminal_bus_ref}
    lista = list(szyny)
    return bool(lista) and all(s in zaciski for s in lista)


def uziemienie_sieci(enm: EnergyNetworkModel) -> tuple[UziemienieSekcji, ...]:
    """Uziemienie każdej galwanicznie połączonej sieci SN modelu (kolejność ``derive``)."""
    napiecie = {b.ref_id: b.voltage_kv for b in enm.buses}
    wynik: list[UziemienieSekcji] = []
    for skladowa in derive(enm).sekcje:
        napiecia = [napiecie[s] for s in skladowa if napiecie.get(s)]
        if not napiecia:
            continue
        if tor_odlaczonego_pola_zu(enm, skladowa):
            # Zespół odłączony od sieci (otwarty łącznik pola ZU): sam zacisk toru pola ZU
            # nie jest siecią SN — nie uziemia niczego i nie jest osobną siecią (inaczej V12.6
            # widziałby „drugą sieć” o innym sposobie uziemienia, a dowód przekładników —
            # sekcję bez szyn stacji).
            continue
        u_kv = max(napiecia)
        if pasmo_napieciowe(u_kv) != "SN":
            continue
        szyny = frozenset(skladowa)
        punkty: list[PunktUziemienia] = [
            punkt_zespolu(zu, u_kv)
            for zu in sorted(enm.zespoly_uziemiajace, key=lambda z: z.ref_id)
            if zu.bus_ref in szyny
        ]
        punkty.extend(_punkty_uzwojen(list(enm.transformers), szyny, u_kv))
        b0, bez_b0, baterie_b0, b0_robocze = _b0_sieci(enm, szyny)
        sekcja = UziemienieSekcji(
            szyny=tuple(sorted(szyny)),
            napiecie_kv=u_kv,
            punkty=tuple(punkty),
            b0_s=b0,
            galezie_bez_b0=bez_b0,
            baterie_b0=baterie_b0,
            galezie_b0_robocze=b0_robocze,
        )
        wynik.append(
            UziemienieSekcji(
                szyny=sekcja.szyny,
                napiecie_kv=sekcja.napiecie_kv,
                punkty=sekcja.punkty,
                b0_s=sekcja.b0_s,
                galezie_bez_b0=sekcja.galezie_bez_b0,
                ostrzezenia=_ostrzezenia(sekcja),
                baterie_b0=sekcja.baterie_b0,
                galezie_b0_robocze=sekcja.galezie_b0_robocze,
            )
        )
    return tuple(wynik)


def uziemienie_szyny(enm: EnergyNetworkModel, bus_ref: str) -> UziemienieSekcji | None:
    """Uziemienie sieci SN, do której należy szyna ``bus_ref`` (``None`` poza pasmem SN)."""
    for sekcja in uziemienie_sieci(enm):
        if bus_ref in sekcja.szyny:
            return sekcja
    return None
