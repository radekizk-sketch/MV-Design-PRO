"""
Katalogi audytu 2 — pozycje, ktore projektant wybiera w konfiguracji stacji.

7 katalogow:
  - BESS_OPERATION_MODES (eng.10): tryby pracy magazynu (peak shaving / FCR / aFRR / etc.)
  - TAP_CHANGERS (eng.13): przelaczniki zaczepow OLTC/DETC
  - HV_FUSES (eng.17): wkladki topikowe SN
  - DEVICE_WITHSTAND (eng.18): wytrzymalosc zwarciowa aparatury (IEC 62271-1 / IEC 60909)
  - PF_CURVES (eng.9): nastawy trybu czestotliwosciowego LFSM-O / FSM (NC RfG)
  - BLOCK_TRANSFORMERS (B.5): transformatory dedykowane DER (PV/BESS/FW)
  - MV_NEUTRAL_GROUNDINGS (B.1): warianty uziemienia punktu neutralnego SN

AUTORYTET DANYCH I PROWENIENCJA (karta K-Q, 2026-08-14) — REGULA TEGO PLIKU
==========================================================================
Ten modul jest ZRODLEM danych dla `/api/v1/catalog/audit2` i dla mirrorow we
frontendzie, wiec obowiazuje go ostrzejsza regula niz warstwe prezentacji:

1. LICZBA BEZ ZRODLA NIE ISTNIEJE. Kazda wartosc liczbowa jest albo (a)
   parametrem DEFINIUJACYM wariant, ktory projektant wybiera i ktory widnieje
   w nazwie pozycji (jak R rezystora uziemiajacego), albo (b) danina z
   nazwanego zrodla: normy z podanym artykulem/tablica albo karty producenta z
   adresem http(s). Wartosc, ktora nie jest ani jednym, ani drugim, zostaje
   USUNIETA — nigdy zastapiona przyblizeniem.
2. BRAK JEST JAWNY. Usunieta dana zostawia jawny stan braku z powodem po polsku
   (wzorzec `BRAK_PASMA_BEZPIECZNIKA` z karty N-D5-FUSE), a nie ciche zero i nie
   zniknieta pozycja — ciche zniknieciu to inne klamstwo niz zmyslona liczba.
3. ZERO CUDZEJ TOZSAMOSCI. Do wlasnych liczb nie doklejamy cudzego nazwiska:
   ani producenta (ABB / Siemens / Schneider), ani operatora (PSE / Energa /
   Tauron), ani wymagania normy, ktorego nie da sie wskazac w jej tekscie.

Historia: karta K-O usunela te sama klase fabrykacji z frontendu
(`frontend/src/ui/network-build/station-der/`), a karta K-E z katalogu wkladek
SN. Ten plik niosl ja dalej — z tymi samymi identyfikatorami pozycji i tymi
samymi liczbami — i serwowal ja przez API.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

#: Wersja katalogow audytu 2 = DATA PRZEGLADU PROWENIENCJI (ISO-8601).
#:
#: Do karty K-Q pozycje deklarowaly `catalog_version = "2024.1"` — numer, ktory
#: nie odpowiadal zadnemu wydaniu zadnego zrodla i ktorego nie dalo sie z niczym
#: skonfrontowac. Wersja jest teraz MIERZALNA: to dzien, w ktorym kazda pozycja
#: zostala zestawiona ze swoim zrodlem (albo z niego usunieta). Kolejna zmiana
#: danych podnosi te date razem z wpisem, skad dana pochodzi.
AUDIT2_CATALOG_VERSION = "2026-08-14"

# =============================================================================
# 1. BESS Operation Mode Catalog (eng.10)
# =============================================================================
#
# PROWENIENCJA (karta K-Q, 2026-08-14). Pozycja tego katalogu opisuje USLUGE,
# ktora magazyn ma swiadczyc — jej nazwe, sens i wymagania wobec przeksztaltnika.
# To sa dane definicyjne i one zostaja. USUNIETE zostaly cztery pola, ktore
# udawaly dane, a byly zgadniete:
#
#   * `reserved_capacity_percent` — ile mocy magazyn trzyma w rezerwie. To
#     DECYZJA PROJEKTOWA konkretnego projektu (i przedmiot umowy rynkowej), a nie
#     wlasnosc trybu pracy. Liczba wchodzila do modelu: warstwa `solver_input`
#     ustawiala z niej `inverter_source.reserved_capacity_percent` przed
#     rozplywem — czyli zgadniete 30 % / 50 % / 100 % zmienialo wynik obliczen.
#   * `max_duration_h` — czas podtrzymania (0,25-8 h) wynika z POJEMNOSCI
#     konkretnego magazynu, nie z nazwy uslugi.
#   * `response_time_s` — czas reakcji dla uslug bilansujacych okresla regulamin
#     rynku operatora systemu przesylowego; dla „peak shaving" czy autokonsumpcji
#     nikt go nie okresla wcale. Zadnego z tych dokumentow nie dalo sie wskazac
#     przy zadnej z pozycji, wiec wszystkie wartosci byly wpisane z reki.
#   * `required_for_nc_rfg_modules` — deklaracja, ze rozporzadzenie NC RfG WYMAGA
#     danej uslugi od modulu typu C / D. Sprawdzone na tekscie rozporzadzenia
#     2016/631: ono nie nakazuje modulom wytworczym swiadczenia FCR-N, FCR-D,
#     aFRR ani mFRR — to produkty rynku bilansujacego, a nie wymagania przylaczenia.
#     Fabrykacja normatywna: werdykt „brakuje wymaganego trybu dla modulu D"
#     trafial do PAKIETU DOWODOWEGO jako niezgodnosc z norma, ktorej nie ma.
#
# Zostaja `requires_four_quadrant` / `requires_grid_forming`: to nie cudza dana,
# tylko wlasnosc samej uslugi (rezerwa symetryczna wymaga pracy w czterech
# cwiartkach; praca wyspowa wymaga przeksztaltnika tworzacego napiecie).

BessModeCode = Literal[
    "peak_shaving",
    "arbitrage",
    "fcr_n",
    "fcr_d_up",
    "fcr_d_down",
    "afrr",
    "mfrr",
    "voltage_support",
    "island_backup",
    "self_consumption",
]


@dataclass(frozen=True)
class BessOperationModeItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    description_pl: str
    mode_code: BessModeCode
    requires_four_quadrant: bool
    requires_grid_forming: bool

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "description_pl": self.description_pl,
            "mode_code": self.mode_code,
            "requires_four_quadrant": self.requires_four_quadrant,
            "requires_grid_forming": self.requires_grid_forming,
        }


BESS_OPERATION_MODE_CATALOG: tuple[BessOperationModeItem, ...] = (
    BessOperationModeItem(
        id="mode_peak_shaving",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Peak shaving (redukcja szczytu)",
        description_pl=(
            "Wyladowanie BESS podczas szczytow obciazenia odbiorcy w celu redukcji "
            "mocy szczytowej i oplat dystrybucyjnych (taryfa BD/CD)."
        ),
        mode_code="peak_shaving",
        requires_four_quadrant=False,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_arbitrage",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Arbitraz cenowy (energy time-shift)",
        description_pl=(
            "Ladowanie w godzinach niskich cen energii, wyladowanie w godzinach "
            "wysokich. Oplacalnosc zalezy od cennika rynku, ktory nie jest dana "
            "katalogowa."
        ),
        mode_code="arbitrage",
        requires_four_quadrant=False,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_fcr_n",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="FCR-N (rezerwa pierwotna normalna)",
        description_pl=(
            "Symetryczna rezerwa pierwotna: magazyn zmienia moc czynna w obie "
            "strony wokol czestotliwosci znamionowej. Wymagany czas reakcji, "
            "wielkosc rezerwy i statyzm okresla regulamin rynku bilansujacego "
            "operatora systemu przesylowego — nie ten katalog."
        ),
        mode_code="fcr_n",
        requires_four_quadrant=True,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_fcr_d_up",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="FCR-D (rezerwa awaryjna w gore)",
        description_pl=(
            "Rezerwa pierwotna asymetryczna w gore, uruchamiana przy zaklocenu "
            "podczestotliwosciowym. Prog uruchomienia i profil narastania mocy "
            "okresla regulamin rynku bilansujacego, nie ten katalog."
        ),
        mode_code="fcr_d_up",
        requires_four_quadrant=True,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_afrr",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="aFRR (rezerwa wtorna automatyczna)",
        description_pl=(
            "Rezerwa wtorna sterowana automatycznie sygnalem operatora systemu "
            "przesylowego, symetryczna w obie strony. Czasy aktywacji okresla "
            "regulamin rynku bilansujacego, nie ten katalog."
        ),
        mode_code="afrr",
        requires_four_quadrant=True,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_mfrr",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="mFRR (rezerwa wtorna reczna)",
        description_pl=(
            "Rezerwa uruchamiana recznie komenda dyspozytora operatora systemu "
            "przesylowego. Czas aktywacji i wymagany czas podtrzymania okresla "
            "regulamin rynku bilansujacego, nie ten katalog."
        ),
        mode_code="mfrr",
        requires_four_quadrant=False,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_voltage_support",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Wsparcie napieciowe Q(U)",
        description_pl=(
            "Regulacja mocy biernej w funkcji napiecia w punkcie przylaczenia "
            "(charakterystyka Q(U)). Wymaga przeksztaltnika pracujacego w czterech "
            "cwiartkach; zakres regulacji wynika z karty przeksztaltnika i z "
            "warunkow przylaczenia, nie z tego katalogu."
        ),
        mode_code="voltage_support",
        requires_four_quadrant=True,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_island_backup",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Tryb wyspowy (grid-forming backup)",
        description_pl=(
            "Tworzenie napiecia po awarii zasilania. Wymaga grid-forming PCS. "
            "Synchronizacja z siecia po powrocie zasilania (synchrocheck 25)."
        ),
        mode_code="island_backup",
        requires_four_quadrant=True,
        requires_grid_forming=True,
    ),
    BessOperationModeItem(
        id="mode_self_consumption",
        catalog_namespace="bess_operation_mode",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Autokonsumpcja PV+BESS (self-consumption)",
        description_pl=(
            "Maksymalizacja autokonsumpcji PV. Ladowanie nadwyzek dziennej generacji, "
            "wyladowanie wieczorne. Typowe dla DER po nN."
        ),
        mode_code="self_consumption",
        requires_four_quadrant=False,
        requires_grid_forming=False,
    ),
)


def get_bess_operation_mode(mode_id: str) -> BessOperationModeItem | None:
    return next((m for m in BESS_OPERATION_MODE_CATALOG if m.id == mode_id), None)


# =============================================================================
# 2. Tap Changer Catalog (eng.13)
# =============================================================================
#
# PROWENIENCJA (karta K-Q, 2026-08-14). Pozycja przelacznika zaczepow jest
# WARIANTEM REGULACJI, ktory projektant zadaje: liczba zaczepow, skok i zakres
# widnieja w jej nazwie i sa ze soba spojne (zakres = (liczba-1)/2 * skok — pin
# w `tests/network_model/test_tap_changer_model.py`). To parametry definiujace,
# nie cudza zmierzona wlasnosc, wiec zostaja.
#
# USUNIETE jako dane eksploatacyjne KONKRETNEGO WYROBU bez zadnego zrodla:
#   * `switching_time_s` — czas przelaczenia (5 / 4 / 3 s) podaje karta
#     przelacznika (np. mechanizm napedowy producenta), nie wariant regulacji;
#   * `operations_before_maintenance_thousand` — resurs miedzy przegladami
#     (100 / 80 / 50 tys. operacji) to gwarancja producenta, a nie liczba, ktora
#     wolno zgadnac. Zaden konsument produkcyjny jej nie czytal (pomiar karty:
#     `tap_changer_fields_from_catalog` bierze tylko typ, liczbe zaczepow,
#     pozycje neutralna, skok, strone regulacji i obsluge AVR).


@dataclass(frozen=True)
class TapChangerItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    type: Literal["oltc", "detc"]
    neutral_position: int
    tap_count: int
    step_percent: float
    range_percent: float
    regulated_side: Literal["hv", "lv"]
    supports_avr: bool
    applicable_to: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "type": self.type,
            "neutral_position": self.neutral_position,
            "tap_count": self.tap_count,
            "step_percent": self.step_percent,
            "range_percent": self.range_percent,
            "regulated_side": self.regulated_side,
            "supports_avr": self.supports_avr,
            "applicable_to": list(self.applicable_to),
        }


TAP_CHANGER_CATALOG: tuple[TapChangerItem, ...] = (
    TapChangerItem(
        id="tc_oltc_110sn_19_125",
        catalog_namespace="tap_changer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="OLTC 110/SN · 19 zaczepów · ±11,25% · AVR",
        type="oltc",
        neutral_position=0,
        tap_count=19,
        step_percent=1.25,
        range_percent=11.25,
        regulated_side="hv",
        supports_avr=True,
        applicable_to=("transformer_110_15", "transformer_110_20"),
    ),
    TapChangerItem(
        id="tc_oltc_110sn_17_125",
        catalog_namespace="tap_changer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="OLTC 110/SN · 17 zaczepów · ±10% · AVR",
        type="oltc",
        neutral_position=0,
        tap_count=17,
        step_percent=1.25,
        range_percent=10.0,
        regulated_side="hv",
        supports_avr=True,
        applicable_to=("transformer_110_15", "transformer_110_20"),
    ),
    TapChangerItem(
        id="tc_detc_snnn_5_25",
        catalog_namespace="tap_changer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="DETC SN/nN · 5 zaczepów · ±5% (off-load)",
        type="detc",
        neutral_position=0,
        tap_count=5,
        step_percent=2.5,
        range_percent=5.0,
        regulated_side="hv",
        supports_avr=False,
        applicable_to=("transformer_15_04", "block_transformer"),
    ),
    TapChangerItem(
        id="tc_oltc_snnn_9_15",
        catalog_namespace="tap_changer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="OLTC SN/nN · 9 zaczepów · ±6% · AVR (przemysłowe)",
        type="oltc",
        neutral_position=0,
        tap_count=9,
        step_percent=1.5,
        range_percent=6.0,
        regulated_side="hv",
        supports_avr=True,
        applicable_to=("transformer_15_04", "block_transformer"),
    ),
)


def get_tap_changer(tc_id: str) -> TapChangerItem | None:
    return next((tc for tc in TAP_CHANGER_CATALOG if tc.id == tc_id), None)


def tap_changer_fields_from_catalog(
    item: TapChangerItem, *, current_position: int | None = None
) -> dict:
    """Materialize canonical TapChanger fields from a catalog type (V12K-045).

    Returns a plain dict compatible with both the ENM and domain ``TapChanger``
    constructors (reuse, no duplication). Positions are symmetric around the
    neutral position: ``+/-(tap_count - 1) // 2`` steps.

    Returns a pure dict (no import of the model layer) to avoid an import cycle.
    """
    half_span = (item.tap_count - 1) // 2
    neutral = item.neutral_position
    is_oltc = item.type == "oltc"
    return {
        "regulation_type": "OLTC" if is_oltc else "DETC",
        "regulated_winding": "HV" if item.regulated_side == "hv" else "LV",
        "neutral_position": neutral,
        "current_position": neutral if current_position is None else current_position,
        "min_position": neutral - half_span,
        "max_position": neutral + half_span,
        "step_percent": item.step_percent,
        "control_mode": "AUTOMATIC" if (is_oltc and item.supports_avr) else "MANUAL",
        "catalog_ref": item.id,
    }


# =============================================================================
# 3. HV Fuse Catalog (eng.17)
# =============================================================================
#
# PROWENIENCJA (karta K-Q, 2026-08-14) — domkniecie klasy po stronie autorytetu.
# Pozycje tego katalogu nioslly komplet danych wyrobu BEZ ZADNEGO zrodla:
# producenta (ABB / Siemens / Schneider), prad najmniejszy i najwiekszy
# wylaczalny, calke I2t oraz DWA punkty pasma czasowo-pradowego przy 6xIn.
# Karta K-E zmierzyla to na zrodle: producenci publikuja charakterystyki t-I
# wkladek SN WYLACZNIE jako wykresy log-log (karta ETI VV THERMO mowi wprost
# „I/t Characteristics According to the curves"), wiec punkt pasma spisany
# „z glowy" nie istnieje. Wyprowadzenie czasu z calki I2t tez odpada: zaleznosc
# t = I2t/I^2 obowiazuje wylacznie w adiabatycznym zakresie topienia, a calka
# wylaczania zawiera energie luku — odtworzony czas bylby fabrykacja fizyki.
#
# Rozstrzygniecie identyczne jak w karcie K-O na froncie: WARTOSC BEZ ZRODLA NIE
# ISTNIEJE. Pola wyrobu usuniete, pozycja zostala tym, czym naprawde jest —
# OZNACZENIEM ZNAMIONOWYM wg IEC 60282-1 (napiecie / prad / klasa /
# zastosowanie), ktore projektant wybiera do pola. Pasmo jest jawnym brakiem
# (`pasmo_tcc = None`) wzorem `BRAK_PASMA_BEZPIECZNIKA`: pozycja NIE znika z
# katalogu (ciche zniknieciu to inne klamstwo), tylko mowi wprost, czego brakuje
# i skad to wziac. Wkladki z realna proweniencja zyja osobno — `SWITCH_FUSES`
# w `mv_switch_catalog.py` (ETI VV, nr kodowy + wymiar e + adres karty).

#: Powod braku pasma — jezyk wspolny z `BRAK_PASMA_BEZPIECZNIKA` warstwy analizy
#: (`application/analyses/protection/coordination/analyzer.py`, karta N-D5-FUSE).
POWOD_BRAK_PASMA_WKLADKI_PL = (
    "Pasmo topikowe (krzywa przedłukowa i krzywa wyłączania) odczytuje się z karty "
    "katalogowej producenta wg IEC 60282-1. Ta pozycja katalogowa nie niesie punktów "
    "pasma, więc czasu zadziałania nie wyznaczono — nie zastąpiono go żadnym "
    "przybliżeniem."
)

#: Krotka etykieta stanu do tabel i kart.
ETYKIETA_BRAK_PASMA_WKLADKI_PL = "pasmo wymaga karty producenta"


@dataclass(frozen=True)
class HvFusePasmoTcc:
    """Pasmo czasowo-pradowe wkladki.

    Typ WYMUSZA pare: punkty istnieja wylacznie razem z adresem tabeli
    producenta, z ktorej je przepisano. Dzieki temu nie da sie dopisac punktow
    bez proweniencji, nie zmieniajac typu.
    """

    #: Adres (http/https) tabeli producenta z punktami pasma.
    zrodlo_url: str
    #: Pary (prad [A], czas [s]) przepisane z tej tabeli.
    punkty: tuple[tuple[float, float], ...]

    def __post_init__(self) -> None:
        if not self.zrodlo_url.startswith(("http://", "https://")):
            raise ValueError("Pasmo wkladki wymaga adresu http(s) tabeli producenta.")
        if not self.punkty:
            raise ValueError("Pasmo bez punktow nie jest pasmem — uzyj `pasmo_tcc = None`.")

    def to_dict(self) -> dict:
        return {
            "zrodlo_url": self.zrodlo_url,
            "punkty": [{"prad_a": p, "czas_s": t} for p, t in self.punkty],
        }


@dataclass(frozen=True)
class HvFuseItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    nominal_voltage_kv: float
    nominal_current_a: float
    fuse_class: Literal["general_purpose", "full_range", "back_up"]
    application: Literal["transformer", "feeder", "motor", "capacitor"]
    #: Pasmo t-I albo `None`, gdy pozycja go nie niesie. Dzis KAZDA pozycja ma
    #: `None` — patrz nota proweniencji powyzej.
    pasmo_tcc: HvFusePasmoTcc | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "nominal_voltage_kv": self.nominal_voltage_kv,
            "nominal_current_a": self.nominal_current_a,
            "class": self.fuse_class,
            "application": self.application,
            "pasmo_tcc": self.pasmo_tcc.to_dict() if self.pasmo_tcc is not None else None,
            "pasmo_brak_powod_pl": (
                None if self.pasmo_tcc is not None else POWOD_BRAK_PASMA_WKLADKI_PL
            ),
            "pasmo_brak_etykieta_pl": (
                None if self.pasmo_tcc is not None else ETYKIETA_BRAK_PASMA_WKLADKI_PL
            ),
        }


HV_FUSE_CATALOG: tuple[HvFuseItem, ...] = (
    HvFuseItem(
        id="fuse_15kv_50a_full",
        catalog_namespace="hv_fuse",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Bezpiecznik SN 15 kV / 50 A · full-range · pole transformatorowe",
        nominal_voltage_kv=15,
        nominal_current_a=50,
        fuse_class="full_range",
        application="transformer",
    ),
    HvFuseItem(
        id="fuse_15kv_100a_full",
        catalog_namespace="hv_fuse",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Bezpiecznik SN 15 kV / 100 A · full-range · pole transformatorowe",
        nominal_voltage_kv=15,
        nominal_current_a=100,
        fuse_class="full_range",
        application="transformer",
    ),
    HvFuseItem(
        id="fuse_20kv_25a_gp",
        catalog_namespace="hv_fuse",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Bezpiecznik SN 20 kV / 25 A · general-purpose · pole odpływowe",
        nominal_voltage_kv=20,
        nominal_current_a=25,
        fuse_class="general_purpose",
        application="feeder",
    ),
    HvFuseItem(
        id="fuse_15kv_160a_backup",
        catalog_namespace="hv_fuse",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Bezpiecznik SN 15 kV / 160 A · back-up · bateria kondensatorów",
        nominal_voltage_kv=15,
        nominal_current_a=160,
        fuse_class="back_up",
        application="capacitor",
    ),
)


def get_hv_fuse(fuse_id: str) -> HvFuseItem | None:
    return next((f for f in HV_FUSE_CATALOG if f.id == fuse_id), None)


# =============================================================================
# 4. Device Withstand Catalog (eng.18)
# =============================================================================
#
# PROWENIENCJA (karta K-Q, 2026-08-14). Ten katalog NIE opisuje wyrobu zadnego
# producenta — opisuje KLASE WYTRZYMALOSCI, ktora projektant zadaje aparaturze
# pola, i dlatego jego liczby maja zrodlo normatywne, a nie karte katalogowa:
#
#   * `i_th_ka` — znamionowy prad krotkotrwaly wytrzymywany, WYLACZNIE z
#     znormalizowanego szeregu (6,3 - 8 - 10 - 12,5 - 16 - 20 - 25 - 31,5 - 40 -
#     50 - 63 kA);
#   * `i_th_duration_s` — znamionowy czas trwania zwarcia: wartosc standardowa
#     1 s, wartosci zalecane 0,5 / 2 / 3 s;
#   * `i_dyn_ka` — NIE JEST WPISYWANY RECZNIE. Wynika ze szczytowej wartosci
#     pradu krotkotrwalego: I_dyn = 2,5 * I_th dla 50 Hz (IEC 62271-1 § 4.6).
#     Jedno zrodlo prawdy: `_i_dyn_z_i_th()`. Do tej karty pozycje nioslly
#     wartosci wpisane z reki (63 kA przy 25 kA, 80 kA przy 31,5 kA), ktorych
#     nie dawalo sie wyprowadzic ani z normy (62,5 i 78,75 kA), ani z karty
#     zadnego producenta — a werdykt „aparatura wytrzymala" trafia z nich do
#     PAKIETU DOWODOWEGO. Wartosc normatywna jest przy tym ZACHOWAWCZA: nizszy
#     limit moze werdykt tylko zaostrzyc, nigdy falszywie zaliczyc.
#
# Zrodlo publiczne, na ktorym zmierzono obie reguly (§ 4.6 i § 4.7 IEC 62271-1
# zacytowane wprost, wraz z szeregiem znormalizowanym): Schneider Electric,
# „Medium Voltage technical guide" AMTED300014EN, s. 50 —
# https://www.cablejoints.co.uk/upload/Schneider--Medium-Voltage-Equipment-Design-Guide.pdf

#: Adres publicznego przewodnika, na ktorym zweryfikowano regule 2,5 x I_th.
IEC_62271_1_PRZEWODNIK_URL = (
    "https://www.cablejoints.co.uk/upload/Schneider--Medium-Voltage-Equipment-Design-Guide.pdf"
)

#: Znormalizowany szereg znamionowych pradow krotkotrwalych wytrzymywanych [kA].
IEC_62271_1_SZEREG_I_TH_KA = (6.3, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 31.5, 40.0, 50.0, 63.0)

#: Znormalizowane czasy trwania zwarcia [s]: 1 s standardowy, reszta zalecana.
IEC_62271_1_CZASY_ZWARCIA_S = (0.5, 1.0, 2.0, 3.0)

#: Mnoznik szczytu wg IEC 62271-1 § 4.6 dla czestotliwosci znamionowej 50 Hz.
IEC_62271_1_MNOZNIK_SZCZYTU_50HZ = 2.5


def _i_dyn_z_i_th(i_th_ka: float) -> float:
    """Znamionowy prad szczytowy wytrzymywany z pradu krotkotrwalego (50 Hz).

    JEDNO ZRODLO PRAWDY dla wszystkich pozycji katalogu — para (I_th, I_dyn) nie
    moze rozjechac sie na jednej pozycji, bo obie liczby powstaja tutaj.
    """
    return round(i_th_ka * IEC_62271_1_MNOZNIK_SZCZYTU_50HZ, 3)


@dataclass(frozen=True)
class DeviceWithstandItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    device_type: str
    nominal_voltage_kv: float
    nominal_current_a: float
    #: Znamionowy prad krotkotrwaly wytrzymywany [kA] — z szeregu normatywnego.
    i_th_1s_ka: float
    #: Znamionowy czas trwania zwarcia [s] — z szeregu normatywnego.
    i_th_duration_s: float

    def __post_init__(self) -> None:
        if self.i_th_1s_ka not in IEC_62271_1_SZEREG_I_TH_KA:
            raise ValueError(
                f"{self.id}: I_th = {self.i_th_1s_ka} kA jest spoza znormalizowanego "
                f"szeregu IEC 62271-1 {IEC_62271_1_SZEREG_I_TH_KA}."
            )
        if self.i_th_duration_s not in IEC_62271_1_CZASY_ZWARCIA_S:
            raise ValueError(
                f"{self.id}: czas trwania zwarcia {self.i_th_duration_s} s jest spoza "
                f"znormalizowanego szeregu IEC 62271-1 {IEC_62271_1_CZASY_ZWARCIA_S}."
            )

    @property
    def i_dyn_ka(self) -> float:
        """Znamionowy prad szczytowy wytrzymywany [kA] — wyprowadzony, nie wpisany."""
        return _i_dyn_z_i_th(self.i_th_1s_ka)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "device_type": self.device_type,
            "nominal_voltage_kv": self.nominal_voltage_kv,
            "nominal_current_a": self.nominal_current_a,
            "i_dyn_ka": self.i_dyn_ka,
            "i_th_1s_ka": self.i_th_1s_ka,
            "i_th_duration_s": self.i_th_duration_s,
            "zrodlo_pl": (
                "IEC 62271-1 § 4.6 (I_dyn = 2,5 · I_th dla 50 Hz) i § 4.7 "
                f"(czas trwania zwarcia); {IEC_62271_1_PRZEWODNIK_URL}"
            ),
        }


DEVICE_WITHSTAND_CATALOG: tuple[DeviceWithstandItem, ...] = (
    DeviceWithstandItem(
        id="wstd_breaker_vacuum_15_25",
        catalog_namespace="device_withstand",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Wyłącznik próżniowy 15 kV · I_th=25 kA/1s · I_dyn=62,5 kA",
        device_type="breaker_vacuum_15",
        nominal_voltage_kv=15,
        nominal_current_a=1250,
        i_th_1s_ka=25,
        i_th_duration_s=1,
    ),
    DeviceWithstandItem(
        id="wstd_breaker_sf6_15_31_5",
        catalog_namespace="device_withstand",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Wyłącznik SF6 15 kV · I_th=31,5 kA/3s · I_dyn=78,75 kA",
        device_type="breaker_sf6_15",
        nominal_voltage_kv=15,
        nominal_current_a=1250,
        i_th_1s_ka=31.5,
        i_th_duration_s=3,
    ),
    DeviceWithstandItem(
        id="wstd_busbar_15_2000_50",
        catalog_namespace="device_withstand",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Szyna SN 15 kV · 2000 A · I_th=50 kA/1s · I_dyn=125 kA",
        device_type="busbar_15_2000",
        nominal_voltage_kv=15,
        nominal_current_a=2000,
        i_th_1s_ka=50,
        i_th_duration_s=1,
    ),
    DeviceWithstandItem(
        id="wstd_busbar_15_1250_25",
        catalog_namespace="device_withstand",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Szyna SN 15 kV · 1250 A · I_th=25 kA/1s · I_dyn=62,5 kA",
        device_type="busbar_15_1250",
        nominal_voltage_kv=15,
        nominal_current_a=1250,
        i_th_1s_ka=25,
        i_th_duration_s=1,
    ),
    DeviceWithstandItem(
        id="wstd_switch_load_15_25",
        catalog_namespace="device_withstand",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Rozłącznik z bezpiecznikami 15 kV · I_th=25 kA/1s · I_dyn=62,5 kA",
        device_type="switch_load_15",
        nominal_voltage_kv=15,
        nominal_current_a=630,
        i_th_1s_ka=25,
        i_th_duration_s=1,
    ),
)


def get_device_withstand(device_id: str) -> DeviceWithstandItem | None:
    return next((d for d in DEVICE_WITHSTAND_CATALOG if d.id == device_id), None)


# =============================================================================
# 5. PF Curve Catalog (eng.9)
# =============================================================================


#
# PROWENIENCJA (karta K-Q, 2026-08-14) — co zostalo zmierzone w zrodle.
# Pozycje tego katalogu przypisywaly KONKRETNE NASTAWY imiennie wskazanym
# operatorom i typom modulu NC RfG: „PSE NC RfG, modul B (droop 5%)",
# „Energa-Operator, modul B", „Tauron Dystrybucja, modul B". Rozporzadzenie
# 2016/631 (NC RfG) sprawdzono na tekscie zrodlowym i ono TAKICH NASTAW NIE
# PRZYPISUJE:
#   * art. 13 ust. 2 podaje statyzm jako NASTAWIALNY W PRZEDZIALE 2-12 % oraz
#     prog czestotliwosci nastawialny miedzy 50,2 Hz a 50,5 Hz — zadnej wartosci
#     „dla modulu B / C / D" tam nie ma;
#   * zalacznik II tab. 2 (obszar Europy kontynentalnej) podaje zakres pracy
#     47,5-51,5 Hz — i to jest jedyna liczba z tej piatki, ktora naprawde
#     pochodzila ze wskazanego zrodla.
# Nastawy 4 % i 3 % „dla modulu C i D" byly zgadniete, a strefy nieczulosci
# 0,15 Hz i 0,10 Hz byly PONIZEJ normatywnego minimum (prog 50,2 Hz = 0,2 Hz),
# czyli sprzeczne z norma, na ktora pozycja sie powolywala. Dwie pozycje
# operatorskie (`pf_energa_b`, `pf_tauron_b`) nie roznily sie od trzeciej ANI
# JEDNA liczba — istnialy wylacznie po to, zeby niesc cudze imie; usuniete.
#
# Stan po naprawie: pozycja jest WARIANTEM NASTAWY, ktory projektant wybiera
# (statyzm widnieje w jej nazwie — jak R rezystora uziemiajacego), a granice
# dopuszczalnosci pochodzia z rozporzadzenia i sa EGZEKWOWANE w `__post_init__`.
# Identyfikatory nazywaja teraz parametr definiujacy, a nie operatora.
#
# Zrodlo (zweryfikowane na tekscie): rozporzadzenie Komisji (UE) 2016/631 —
# https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0631

#: Adres tekstu rozporzadzenia NC RfG, na ktorym zweryfikowano ponizsze zakresy.
NC_RFG_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0631"

#: Art. 13 ust. 2: statyzm nastawialny w przedziale 2-12 %.
NC_RFG_STATYZM_ZAKRES_PROCENT = (2.0, 12.0)

#: Art. 13 ust. 2: prog czestotliwosci nastawialny miedzy 50,2 a 50,5 Hz, czyli
#: strefa nieczulosci od 0,2 do 0,5 Hz wzgledem 50 Hz.
NC_RFG_STREFA_NIECZULOSCI_ZAKRES_HZ = (0.2, 0.5)

#: Zalacznik II tab. 2, obszar Europy kontynentalnej: zakres pracy 47,5-51,5 Hz.
NC_RFG_ZAKRES_PRACY_HZ = (47.5, 51.5)


@dataclass(frozen=True)
class PfCurveItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    f_ref_hz: float
    #: Statyzm [%] — parametr DEFINIUJACY wariant, w granicach art. 13 ust. 2.
    droop_percent: float
    f_min_hz: float
    f_max_hz: float
    #: Strefa nieczulosci [Hz] — w granicach progu z art. 13 ust. 2.
    deadband_hz: float

    def __post_init__(self) -> None:
        statyzm_min, statyzm_max = NC_RFG_STATYZM_ZAKRES_PROCENT
        if not statyzm_min <= self.droop_percent <= statyzm_max:
            raise ValueError(
                f"{self.id}: statyzm {self.droop_percent} % jest poza przedzialem "
                f"nastawialnym {statyzm_min}-{statyzm_max} % (NC RfG art. 13 ust. 2)."
            )
        strefa_min, strefa_max = NC_RFG_STREFA_NIECZULOSCI_ZAKRES_HZ
        if not strefa_min <= self.deadband_hz <= strefa_max:
            raise ValueError(
                f"{self.id}: strefa nieczulosci {self.deadband_hz} Hz jest poza "
                f"przedzialem {strefa_min}-{strefa_max} Hz (NC RfG art. 13 ust. 2)."
            )
        if (self.f_min_hz, self.f_max_hz) != NC_RFG_ZAKRES_PRACY_HZ:
            raise ValueError(
                f"{self.id}: zakres pracy {self.f_min_hz}-{self.f_max_hz} Hz nie jest "
                f"zakresem z zalacznika II tab. 2 {NC_RFG_ZAKRES_PRACY_HZ}."
            )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "f_ref_hz": self.f_ref_hz,
            "droop_percent": self.droop_percent,
            "f_min_hz": self.f_min_hz,
            "f_max_hz": self.f_max_hz,
            "deadband_hz": self.deadband_hz,
            "zrodlo_pl": (
                "Rozporzadzenie (UE) 2016/631 (NC RfG): art. 13 ust. 2 (statyzm "
                "nastawialny 2-12 %, prog 50,2-50,5 Hz) oraz zalacznik II tab. 2 "
                f"(zakres pracy 47,5-51,5 Hz); {NC_RFG_URL}"
            ),
        }


_ZAKRES_MIN_HZ, _ZAKRES_MAX_HZ = NC_RFG_ZAKRES_PRACY_HZ

PF_CURVE_CATALOG: tuple[PfCurveItem, ...] = (
    PfCurveItem(
        id="pf_droop_5",
        catalog_namespace="p_f_curve",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="P(f) · statyzm 5% · strefa nieczułości 0,2 Hz",
        f_ref_hz=50.0,
        droop_percent=5.0,
        f_min_hz=_ZAKRES_MIN_HZ,
        f_max_hz=_ZAKRES_MAX_HZ,
        deadband_hz=0.2,
    ),
    PfCurveItem(
        id="pf_droop_4",
        catalog_namespace="p_f_curve",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="P(f) · statyzm 4% · strefa nieczułości 0,2 Hz",
        f_ref_hz=50.0,
        droop_percent=4.0,
        f_min_hz=_ZAKRES_MIN_HZ,
        f_max_hz=_ZAKRES_MAX_HZ,
        deadband_hz=0.2,
    ),
    PfCurveItem(
        id="pf_droop_3",
        catalog_namespace="p_f_curve",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="P(f) · statyzm 3% · strefa nieczułości 0,2 Hz",
        f_ref_hz=50.0,
        droop_percent=3.0,
        f_min_hz=_ZAKRES_MIN_HZ,
        f_max_hz=_ZAKRES_MAX_HZ,
        deadband_hz=0.2,
    ),
    PfCurveItem(
        id="pf_droop_2",
        catalog_namespace="p_f_curve",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="P(f) · statyzm 2% · strefa nieczułości 0,2 Hz (najostrzejszy nastawialny)",
        f_ref_hz=50.0,
        droop_percent=2.0,
        f_min_hz=_ZAKRES_MIN_HZ,
        f_max_hz=_ZAKRES_MAX_HZ,
        deadband_hz=0.2,
    ),
    PfCurveItem(
        id="pf_droop_12",
        catalog_namespace="p_f_curve",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="P(f) · statyzm 12% · strefa nieczułości 0,5 Hz (najłagodniejszy nastawialny)",
        f_ref_hz=50.0,
        droop_percent=12.0,
        f_min_hz=_ZAKRES_MIN_HZ,
        f_max_hz=_ZAKRES_MAX_HZ,
        deadband_hz=0.5,
    ),
)


def get_pf_curve(curve_id: str) -> PfCurveItem | None:
    return next((c for c in PF_CURVE_CATALOG if c.id == curve_id), None)


# =============================================================================
# 6. Block Transformer Catalog (B.5)
# =============================================================================
#
# PROWENIENCJA (karta K-Q, 2026-08-14) — naprawa przez USUNIECIE DRUGIEJ KOPII.
# Pozycje tego katalogu nioslly wlasny komplet danych elektrycznych transformatora
# (uk %, straty obciazeniowe i jalowe, prad biegu jalowego, grupa polaczen) oraz
# imie producenta (ABB / Siemens / Schneider) doklejone do liczb, ktorych zadna
# karta katalogowa nie potwierdzala. Byla to DRUGA KOPIA danych transformatora w
# systemie — obok `mv_transformer_catalog.py`, ktory jest zrodlem prawdy o
# transformatorach i ktory kazda pozycje opisuje z proweniencja
# (`source_reference`, `verification_status`, `catalog_status`).
#
# Rozstrzygniecie: transformator dedykowany DER przestaje byc osobna dana i staje
# sie WYBOREM POZYCJI z katalogu transformatorow. `BlockTransformerItem` niesie
# `transformer_type_ref`, a wszystkie liczby czyta z tej pozycji — jedno zrodlo
# prawdy, zero miejsca na rozjazd. Identyfikatory pozycji zostaly bez zmian, wiec
# zapisane konfiguracje stacji wskazuja dalej to samo.
#
# USUNIETE POZYCJE (nie mialy odpowiednika z proweniencja):
#   * `btr_fw_15_069_3450` — 3450 kVA; katalog transformatorow ma 3,15 MVA i
#     4,0 MVA, a podstawienie sasiedniej mocy byloby falszowaniem znamionu;
#   * `btr_fw_30_15_30000` — 30/15 kV 30 MVA; katalog nie ma zadnego typu na
#     napiecie 30 kV.
# W ich miejsce wchodza pozycje SN/SN i wiekszych mocy oparte na REALNYCH typach
# (patrz nizej), wiec farma wiatrowa nie traci ani transformatora blokowego, ani
# wariantu SN/SN — traci tylko dwie pozycje bez pokrycia.


@dataclass(frozen=True)
class BlockTransformerItem:
    """Transformator dedykowany DER = WYBOR POZYCJI z katalogu transformatorow.

    Ta klasa nie przechowuje ANI JEDNEJ liczby elektrycznej — wszystkie czyta z
    typu wskazanego przez `transformer_type_ref` (`mv_transformer_catalog.py`).
    Dzieki temu para (katalog audytu 2, katalog transformatorow) nie moze sie
    rozjechac: nie ma czego rozjezdzac.
    """

    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    #: Identyfikator typu w `mv_transformer_catalog` — JEDYNE zrodlo danych.
    transformer_type_ref: str
    applicable_der_kinds: tuple[str, ...]

    def _typ(self) -> dict:
        from network_model.catalog.mv_transformer_catalog import get_all_transformer_types

        for record in get_all_transformer_types():
            if record["id"] == self.transformer_type_ref:
                return record
        raise KeyError(
            f"{self.id}: typ '{self.transformer_type_ref}' nie istnieje w katalogu "
            "transformatorow — pozycja transformatora dedykowanego bez pokrycia."
        )

    @property
    def _params(self) -> dict:
        return self._typ()["params"]

    @property
    def sn_kva(self) -> float:
        return float(self._params["rated_power_mva"]) * 1000.0

    @property
    def hv_kv(self) -> float:
        return float(self._params["voltage_hv_kv"])

    @property
    def lv_kv(self) -> float:
        return float(self._params["voltage_lv_kv"])

    @property
    def uk_percent(self) -> float:
        return float(self._params["uk_percent"])

    @property
    def pk_kw(self) -> float:
        return float(self._params["pk_kw"])

    @property
    def p0_kw(self) -> float:
        return float(self._params["p0_kw"])

    @property
    def i0_percent(self) -> float:
        return float(self._params["i0_percent"])

    @property
    def vector_group(self) -> str:
        return str(self._params["vector_group"])

    @property
    def is_mv_to_mv(self) -> bool:
        """Transformator SN/SN — strona dolna powyzej 1 kV (a nie deklaracja)."""
        return self.lv_kv > 1.0

    @property
    def galvanic_isolation(self) -> bool:
        """Izolacja galwaniczna wynika z GRUPY POLACZEN, nie z osobnego pola.

        Uzwojenia polaczone w gwiazde/trojkat bez punktu wspolnego (Dyn, Yd,
        YNyn z osobnymi uzwojeniami) daja izolacje galwaniczna; autotransformator
        (grupa zaczynajaca sie od „a") jej nie daje.
        """
        return not self.vector_group.lower().startswith("a")

    @property
    def source_reference(self) -> str:
        """Proweniencja danych — wprost z pozycji katalogu transformatorow."""
        return str(self._params["source_reference"])

    @property
    def verification_status(self) -> str:
        return str(self._params["verification_status"])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "transformer_type_ref": self.transformer_type_ref,
            "sn_kva": self.sn_kva,
            "hv_kv": self.hv_kv,
            "lv_kv": self.lv_kv,
            "uk_percent": self.uk_percent,
            "pk_kw": self.pk_kw,
            "p0_kw": self.p0_kw,
            "i0_percent": self.i0_percent,
            "vector_group": self.vector_group,
            "is_mv_to_mv": self.is_mv_to_mv,
            "applicable_der_kinds": list(self.applicable_der_kinds),
            "galvanic_isolation": self.galvanic_isolation,
            "source_reference": self.source_reference,
            "verification_status": self.verification_status,
        }


#: Typoszereg transformatorow blokowych w katalogu transformatorow nosi nazwe
#: „TR ... Dyn11 PV/BESS/FW", czyli sam deklaruje, ze sluzy wszystkim trzem
#: rodzajom zrodel. Ograniczanie pozycji do PV+BESS bylo wymyslone.
_DER_WSZYSTKIE: tuple[str, ...] = ("PV", "BESS", "FW")

BLOCK_TRANSFORMER_CATALOG: tuple[BlockTransformerItem, ...] = (
    BlockTransformerItem(
        id="btr_pv_15_069_800",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany 15/0,69 kV · 800 kVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-0p69-0p8mva-dyn11-inverter",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
    BlockTransformerItem(
        id="btr_pv_15_069_1000",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany 15/0,69 kV · 1000 kVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-0p69-1mva-dyn11-inverter",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
    BlockTransformerItem(
        id="btr_pv_15_069_1250",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany 15/0,69 kV · 1250 kVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-0p69-1p25mva-dyn11-inverter",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
    BlockTransformerItem(
        id="btr_pv_15_069_1600",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany 15/0,69 kV · 1600 kVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-0p69-1p6mva-dyn11-inverter",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
    BlockTransformerItem(
        id="btr_pv_15_069_2500",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany 15/0,69 kV · 2500 kVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-0p69-2p5mva-dyn11-inverter",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
    BlockTransformerItem(
        id="btr_pv_15_04_1000",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany 15/0,4 kV · 1000 kVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-04-1000kva-dyn11",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
    BlockTransformerItem(
        id="btr_bess_15_04_1600",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany 15/0,4 kV · 1600 kVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-04-1600kva-dyn11",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
    BlockTransformerItem(
        id="btr_der_15_069_4000",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany 15/0,69 kV · 4000 kVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-0p69-4mva-dyn11-inverter",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
    BlockTransformerItem(
        id="btr_der_15_063_10000",
        catalog_namespace="block_transformer",
        catalog_version=AUDIT2_CATALOG_VERSION,
        label_pl="Transformator dedykowany SN/SN 15/6,3 kV · 10 MVA · Dyn11",
        transformer_type_ref="tr-sn-nn-15-6p3-10mva-dyn11-inverter",
        applicable_der_kinds=_DER_WSZYSTKIE,
    ),
)


def get_block_transformer(btr_id: str) -> BlockTransformerItem | None:
    return next((b for b in BLOCK_TRANSFORMER_CATALOG if b.id == btr_id), None)


# =============================================================================
# 7. MV Neutral Grounding Catalog (B.1)
# =============================================================================
#
# PROWENIENCJA (karta K-Q, 2026-08-14) — domkniecie klasy po stronie autorytetu.
# Karta K-O usunela z frontendu dwa pola tego katalogu; backend niosl je dalej i
# serwowal przez `/api/v1/catalog/audit2/mv-neutral-groundings`:
#
#   * `typical_ik1_a_range` — ZAKRES PRADU ZWARCIA DOZIEMNEGO bez zrodla.
#     Prad I_k1 konkretnej sieci wylicza solver SC1F z realnej impedancji Z0
#     modelu; tabela „typowych" zakresow konkurowala z wynikiem obliczen i nie
#     miala czym wygrac. Gorzej: warstwa ENM brala z tego zakresu MEDIANE i
#     podawala ja solverowi `phase_state_sn` jako domyslny prad zwarcia
#     (`_phase_state_default_fault_current_from_grounding`) — zmyslona liczba
#     wchodzila do fizyki. Usuniete razem z tym konsumentem.
#   * `typical_operators_pl` — przypisanie praktyki ruchowej imiennie wskazanym
#     operatorom bez cytatu z IRiESD; czesc byla wprost nieprawdziwa (PSE jest
#     operatorem systemu przesylowego, nie prowadzi rozdzielni SN). Imiona
#     operatorow usuniete takze z `description_pl`.
#
# Wartosc I_k1 znikla rowniez z `label_pl` — nazwa wariantu jest widoczna w
# rozwijanej liscie, wiec fabrykacja w nazwie jest GORZEJ widoczna niz w polu
# danych, nie lepiej. Zostaje `r_ohm` / `x_ohm`: to parametr DEFINIUJACY wariant
# (widnieje w jego nazwie), czyli wybor projektanta, a nie cudza zmierzona
# wlasnosc. Teksty sa dokladnym odpowiednikiem stanu frontendu po karcie K-O —
# parytet obu warstw pilnuje `tests/network_model/test_audit2_katalogi_parytet.py`.


GroundingType = Literal["isolated", "petersen_coil", "resistor_grounded", "directly_grounded"]


@dataclass(frozen=True)
class MvNeutralGroundingItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    grounding_type: GroundingType
    label_pl: str
    description_pl: str
    #: Rezystancja uziemienia [Ohm] definiujaca wariant (gdy resistor_grounded).
    r_ohm: float | None = None
    #: Reaktancja uziemienia [Ohm] definiujaca wariant (petersen_coil).
    x_ohm: float | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "grounding_type": self.grounding_type,
            "label_pl": self.label_pl,
            "description_pl": self.description_pl,
            "r_ohm": self.r_ohm,
            "x_ohm": self.x_ohm,
        }


MV_NEUTRAL_GROUNDING_CATALOG: tuple[MvNeutralGroundingItem, ...] = (
    MvNeutralGroundingItem(
        id="mng_isolated",
        catalog_namespace="mv_neutral_grounding",
        catalog_version=AUDIT2_CATALOG_VERSION,
        grounding_type="isolated",
        label_pl="Sieć izolowana (bez uziemienia neutralnego)",
        description_pl=(
            "Punkt neutralny transformatora 110/SN nie jest uziemiony. Prąd zwarcia "
            "1-fazowego doziemnego jest ograniczony tylko pojemnością sieci."
        ),
    ),
    MvNeutralGroundingItem(
        id="mng_petersen",
        catalog_namespace="mv_neutral_grounding",
        catalog_version=AUDIT2_CATALOG_VERSION,
        grounding_type="petersen_coil",
        label_pl="Sieć skompensowana (cewka Petersena PCK)",
        description_pl=(
            "Punkt neutralny uziemiony przez dławik kompensacyjny (cewkę Petersena). "
            "Lp = 1 / (3·ω·C₀) gdzie C₀ jest pojemnością sieci. W stanie kompensacji "
            "prąd zwarcia doziemnego jest bliski zeru."
        ),
    ),
    MvNeutralGroundingItem(
        id="mng_resistor_low",
        catalog_namespace="mv_neutral_grounding",
        catalog_version=AUDIT2_CATALOG_VERSION,
        grounding_type="resistor_grounded",
        label_pl="Sieć uziemiona przez rezystor — niski (R≈7 Ω)",
        description_pl=(
            "Punkt neutralny uziemiony przez rezystor 7 Ω — ogranicza prąd zwarcia "
            "doziemnego na tyle, by pozostał wykrywalny przez 51N. Stosowane "
            "w sieciach kablowych miejskich."
        ),
        r_ohm=7,
    ),
    MvNeutralGroundingItem(
        id="mng_resistor_medium",
        catalog_namespace="mv_neutral_grounding",
        catalog_version=AUDIT2_CATALOG_VERSION,
        grounding_type="resistor_grounded",
        label_pl="Sieć uziemiona przez rezystor — średni (R≈40 Ω)",
        description_pl=(
            "Punkt neutralny uziemiony przez rezystor 40 Ω. Kompromis między "
            "wykrywalnością zwarć a ochroną sprzętu. Stosowane w sieciach "
            "mieszanych kabel/napowietrzna."
        ),
        r_ohm=40,
    ),
    MvNeutralGroundingItem(
        id="mng_directly",
        catalog_namespace="mv_neutral_grounding",
        catalog_version=AUDIT2_CATALOG_VERSION,
        grounding_type="directly_grounded",
        label_pl="Sieć uziemiona bezpośrednio (Z=0)",
        description_pl=(
            "Punkt neutralny uziemiony bezpośrednio. Prąd zwarcia doziemnego jest "
            "porównywalny z prądem zwarcia 3-fazowego. Rzadko stosowane w SN — "
            "głównie w przemysłowych sieciach specjalnych. Zwiększa wymagania na "
            "zabezpieczenia i sprzęt."
        ),
    ),
)


def get_mv_neutral_grounding(grounding_id: str) -> MvNeutralGroundingItem | None:
    return next((g for g in MV_NEUTRAL_GROUNDING_CATALOG if g.id == grounding_id), None)


# =============================================================================
# Helpers — selektory uzywane przez solver_input + proof_engine
# =============================================================================


def select_bess_modes_for_pcs(
    *, four_quadrant: bool, grid_forming_capable: bool
) -> tuple[BessOperationModeItem, ...]:
    """Naprawa eng.10: filtr trybow BESS dostepnych dla danego PCS."""
    return tuple(
        m
        for m in BESS_OPERATION_MODE_CATALOG
        if (not m.requires_four_quadrant or four_quadrant)
        and (not m.requires_grid_forming or grid_forming_capable)
    )


# USUNIETY (karta K-Q, 2026-08-14): `select_required_bess_modes_for_module`.
#
# Funkcja zwracala tryby pracy magazynu, ktore rzekomo SA WYMAGANE dla danego
# typu modulu wytworczego NC RfG, na podstawie pola `required_for_nc_rfg_modules`.
# Rozporzadzenie 2016/631 sprawdzone na tekscie zrodlowym: nie nakazuje modulom
# wytworczym swiadczenia FCR-N, FCR-D, aFRR ani mFRR — to produkty rynku
# bilansujacego, kupowane w aukcjach, a nie warunek przylaczenia. Generator
# dowodu na tej podstawie oglaszal niezgodnosc („brakuje wymaganego trybu dla
# modulu D") z norma, ktorej nie ma. Sprawdzenie ZDOLNOSCI przeksztaltnika
# (praca w czterech cwiartkach, tworzenie napiecia) zostalo — ono wynika z samej
# definicji uslugi i jest weryfikowalne.


def select_block_transformers_for_der(
    *, der_kind: Literal["PV", "BESS", "FW"], hv_kv: float | None = None, lv_kv: float | None = None
) -> tuple[BlockTransformerItem, ...]:
    """Naprawa B.5: filtruje block-trafo dla kombinacji DER + napiec."""
    result: list[BlockTransformerItem] = []
    for btr in BLOCK_TRANSFORMER_CATALOG:
        if der_kind not in btr.applicable_der_kinds:
            continue
        if hv_kv is not None and abs(btr.hv_kv - hv_kv) > 0.5:
            continue
        if lv_kv is not None and abs(btr.lv_kv - lv_kv) > 0.05:
            continue
        result.append(btr)
    return tuple(result)


def is_vt_voltage_factor_valid_for_grounding(
    voltage_factor: float, grounding_type: GroundingType
) -> tuple[bool, str]:
    """Walidacja F_v przekladnika napieciowego wobec uziemienia sieci (IEC 61869-3 tab. 2).

    JEDNA REGULA, NIE DWIE (V12K-256). Ta funkcja miala wlasna, LAGODNIEJSZA wersje
    wymagan: dopuszczala 1,5 w sieci uziemionej przez rezystor i 1,2 w bezposrednio
    uziemionej. Siec uziemiona przez rezystor NIE jest siecia skutecznie uziemiona —
    przy zwarciu doziemnym napiecie faz zdrowych rosnie praktycznie do miedzyfazowego,
    wiec wymaganie 1,5 bylo zanizone; a 1,2 (ciagle) dotyczy przekladnika pracujacego
    MIEDZY FAZAMI, nie faza-ziemia. Rozjazd byl grozny, bo ta funkcja zasila PAKIET
    DOWODOWY — nizsze wymaganie trafialoby do dokumentu jako werdykt zgodnosci.

    ZALOZENIE JAWNE: pytanie „czy F_v pasuje do uziemienia" ma sens WYLACZNIE dla
    uzwojenia pierwotnego pracujacego miedzy faza a ziemia (miedzyfazowe nie widzi
    wzrostu napiecia przy doziemieniu), dlatego regula jest wolana z tym ukladem.
    """
    from domain.dobor_przekladnika import wymagany_wspolczynnik_napieciowy

    tryb = {
        "isolated": "izolowany",
        "petersen_coil": "cewka_petersena",
        "resistor_grounded": "rezystor",
        "directly_grounded": "bezposrednio_uziemiony",
    }.get(grounding_type)
    wymagany = wymagany_wspolczynnik_napieciowy(tryb, "faza_ziemia")
    if wymagany is None:
        return False, f"Nieznany typ uziemienia: {grounding_type}"
    if voltage_factor < wymagany:
        etykieta = {
            "isolated": "izolowana",
            "petersen_coil": "skompensowana (Petersena)",
            "resistor_grounded": "uziemiona przez rezystor",
            "directly_grounded": "bezposrednio uziemiona",
        }[grounding_type]
        return False, (
            f"Siec {etykieta} wymaga VT (faza-ziemia) z U_th >= {wymagany} wg IEC 61869-3. "
            f"Wybrany VT ma U_th = {voltage_factor}."
        )
    return True, ""


def ocen_wytrzymalosc_aparatu(
    *,
    etykieta_pl: str,
    i_dyn_ka: float | None,
    i_th_ka: float | None,
    i_th_duration_s: float | None,
    i_peak_calculated_ka: float,
    i_thermal_calculated_ka: float,
    t_clearing_s: float | None,
) -> dict:
    """JĄDRO WERDYKTU wytrzymałości (I_dyn / I_th) — jedno na cały system.

    Wydzielone z ``validate_device_withstand`` w karcie KD-6 (poz. 2), bo ten sam
    rachunek musi obsłużyć DWA źródła znamion: pozycję katalogu wytrzymałości
    wskazaną ręcznie w konfiguracji stacji ORAZ pozycję APARAT_SN, którą pole
    stacji ma w MODELU. Kopiowanie porównania do warstwy aplikacji zrobiłoby
    drugą fizykę — jest jedna, tutaj.

    KRYTERIA (IEC 60909 / IEC 62271-1):
      dynamiczne:  i_p ≤ I_dyn
      cieplne:     I_th ≤ I_th_zn · √(t_zn / t_wyl)

    BRAK DANEJ NIE JEST WERDYKTEM: nieznane znamiona albo nieznany czas
    wyłączenia dają ``None`` przy odpowiednim kryterium (a nie ``False``) —
    „nie da się sprawdzić" to inny stan niż „nie wytrzymuje".
    """
    import math

    i_dyn_ok: bool | None = None
    util_dyn: float | None = None
    if i_dyn_ka is not None and i_dyn_ka > 0:
        i_dyn_ok = i_dyn_ka >= i_peak_calculated_ka
        util_dyn = (i_peak_calculated_ka / i_dyn_ka) * 100

    i_th_ok: bool | None = None
    util_th: float | None = None
    i_th_effective: float | None = None
    if (
        i_th_ka is not None
        and i_th_ka > 0
        and i_th_duration_s is not None
        and i_th_duration_s > 0
        and t_clearing_s is not None
        and t_clearing_s > 0
    ):
        i_th_effective = i_th_ka * math.sqrt(i_th_duration_s / max(t_clearing_s, 0.01))
        i_th_ok = i_th_effective >= i_thermal_calculated_ka
        util_th = (i_thermal_calculated_ka / i_th_effective) * 100

    braki: list[str] = []
    if i_dyn_ok is None:
        braki.append("prądu dynamicznego znamionowego")
    if i_th_ok is None:
        if i_th_ka is None or i_th_duration_s is None:
            braki.append("prądu cieplnego znamionowego")
        else:
            braki.append("czasu wyłączenia")

    niezaliczone: list[str] = []
    if i_dyn_ok is False and util_dyn is not None and i_dyn_ka is not None:
        niezaliczone.append(
            f"I_dyn {i_peak_calculated_ka:.1f} kA > {i_dyn_ka:.1f} kA (limit) — "
            "przekroczenie wytrzymałości dynamicznej"
        )
    if i_th_ok is False and i_th_effective is not None and t_clearing_s is not None:
        niezaliczone.append(
            f"I_th {i_thermal_calculated_ka:.1f} kA > {i_th_effective:.1f} kA "
            f"(limit przy t={t_clearing_s:.2f} s) — przekroczenie wytrzymałości cieplnej"
        )

    if niezaliczone:
        message = f"BLOKER: {'; '.join(niezaliczone)}."
    elif braki:
        zaliczone = []
        if i_dyn_ok is True and util_dyn is not None:
            zaliczone.append(f"I_dyn {util_dyn:.0f}%")
        if i_th_ok is True and util_th is not None:
            zaliczone.append(f"I_th {util_th:.0f}%")
        czesc_zaliczona = f" Sprawdzone: {', '.join(zaliczone)}." if zaliczone else ""
        message = (
            f"NIEUSTALONE: aparatura „{etykieta_pl}” — brak {', '.join(braki)}."
            f"{czesc_zaliczona}"
        )
    else:
        message = (
            f"OK: aparatura „{etykieta_pl}” wytrzymała "
            f"(wykorzystanie I_dyn {util_dyn:.0f}%, I_th {util_th:.0f}%)."  # type: ignore[str-format]
        )

    return {
        "ok": i_dyn_ok is True and i_th_ok is True,
        "i_dyn_ok": i_dyn_ok,
        "i_th_ok": i_th_ok,
        "message_pl": message,
        "utilization_dyn_percent": util_dyn,
        "utilization_th_percent": util_th,
        "i_th_effective_ka": i_th_effective,
    }


def validate_device_withstand(
    *,
    device_id: str,
    i_peak_calculated_ka: float,
    i_thermal_calculated_ka: float,
    t_clearing_s: float,
) -> dict:
    """Naprawa eng.18: walidacja I_dyn / I_th aparatury (IEC 60909).

    JEDYNE ZRODLO WERDYKTU (K7-B, 2026-07-31). Do tej karty rownolegly rachunek
    zyl w warstwie prezentacji (`frontend/src/ui/network-build/station-der/
    protection-catalogs.ts::validateDeviceWithstand` + wlasna kopia katalogu
    `DEVICE_WITHSTAND_CATALOG`) i to ON zasilal karte zabezpieczen. Ekran mowil
    „wytrzymala" na podstawie liczb, ktorych zaden solver nie widzial i ktorych
    nie obejmowal zaden slad. Karta zabezpieczen wola teraz to wyliczenie przez
    `POST /api/v1/catalog/audit2/validate-device-withstand`, a `message_pl` jest
    tekstem POKAZYWANYM UZYTKOWNIKOWI — stad pelna polszczyzna z diakrytykami.

    KONTRAKT ODPOWIEDZI NIEZMIENIONY (KD-6): ta koncowka zawsze dostaje komplet
    znamion z katalogu wytrzymalosci i jawny czas wylaczenia, wiec `i_dyn_ok` /
    `i_th_ok` pozostaja logiczne, a pola dodane przez jadro (`i_th_effective_ka`)
    sa ADDYTYWNE.
    """
    device = get_device_withstand(device_id)
    if device is None:
        return {
            "ok": False,
            "i_dyn_ok": False,
            "i_th_ok": False,
            "message_pl": f"Brak aparatury w katalogu (id={device_id}).",
            "utilization_dyn_percent": 0,
            "utilization_th_percent": 0,
        }
    return ocen_wytrzymalosc_aparatu(
        etykieta_pl=device.label_pl,
        i_dyn_ka=device.i_dyn_ka,
        i_th_ka=device.i_th_1s_ka,
        i_th_duration_s=device.i_th_duration_s,
        i_peak_calculated_ka=i_peak_calculated_ka,
        i_thermal_calculated_ka=i_thermal_calculated_ka,
        t_clearing_s=t_clearing_s,
    )


# =============================================================================
# Lookup VT -> wspolczynnik napieciowy — USUNIETY (V12K-258)
# =============================================================================
#
# `VT_CATALOG_FOR_FACTOR` byl CZWARTA kopia danych o przekladnikach napieciowych:
# odwzorowywal cztery SYNTETYCZNE identyfikatory z rownoleglego katalogu frontu
# (usunietego w V12K-257) na wspolczynnik napieciowy. Wolajacy dopelnial go wartoscia
# domyslna 1,9 dla kazdego nieznanego typu — czyli brak danej stawal sie liczba, na
# ktorej PAKIET DOWODOWY oglaszal zgodnosc.
#
# Zrodlem tej danej jest teraz katalog VT (`VTType.rated_voltage_factor`, V12K-255);
# brak typu albo brak danej w karcie daje `None`, a generator dowodu zamienia to
# w dowod NIEZALICZONY z nazwanym powodem.


def estimate_der_power_kw(
    *, der_kind: str, block_transformer_catalog_ref: str | None = None
) -> float:
    """
    Estymuje moc DER na podstawie block-trafo (gdy dedicated_transformer)
    lub typowych wartosci dla der_kind.

    Phase 15: zastepuje hardcoded 1MW placeholder.

    Logika:
    1. Jesli block_transformer wskazany, uzywamy sn_kva (deterministic, real catalog).
    2. W przeciwnym wypadku typowe wartosci per kind (PV: 500 kW, BESS: 1000, FW: 2300).

    Te typowe wartosci bazuja na medianie z PV_INVERTER_CATALOG / BESS_PCS_CATALOG /
    WIND_TURBINE_CATALOG (frontendowe staticki). Brak mozliwosci znania konkretnego
    device_catalog z poziomu audit2 (DER specs nie ma device_ref) — uzywamy median.
    """
    if block_transformer_catalog_ref:
        btr = get_block_transformer(block_transformer_catalog_ref)
        if btr is not None:
            return float(btr.sn_kva)
    # Median per kind based on typowe katalogowe wartosci.
    if der_kind == "PV":
        return 500.0
    if der_kind == "BESS":
        return 1000.0
    if der_kind == "FW":
        return 2300.0
    return 0.0


def validate_hosting_capacity_export(
    *, station_id: str, p_export_kw: float, p_import_kw: float
) -> dict:
    """Naprawa eng.15: walidacja kierunku przeplywu mocy w stacji."""
    net = p_export_kw - p_import_kw
    ratio = (p_export_kw / p_import_kw) if p_import_kw > 0 else float("inf")

    if net < 0 or ratio < 0.8:
        status = "no_export"
        message = (
            f"Lokalna autokonsumpcja: {p_export_kw:.0f} kW DER vs {p_import_kw:.0f} kW odbiorow. "
            "Brak eksportu netto do OSD."
        )
    elif ratio <= 1.5:
        status = "normal_export"
        message = (
            f"Eksport normalny: {net:.0f} kW eksportowanych do OSD "
            f"(stosunek {ratio:.2f}x w granicach standardowej hosting capacity)."
        )
    elif ratio <= 3.0:
        status = "high_export_warning"
        message = (
            f"Wysoki eksport: {net:.0f} kW (stosunek {ratio:.2f}x). "
            "Zalecane curtailment 70% w godzinach poludniowych."
        )
    else:
        status = "requires_ramp_down"
        message = (
            f"Krytyczny eksport: {net:.0f} kW (stosunek {ratio:.2f}x). "
            "WYMAGANE: studium NC RfG ramp-down + curtailment + uzgodnienie z OSD."
        )
    return {
        "station_id": station_id,
        "p_export_kw": p_export_kw,
        "p_import_kw": p_import_kw,
        "p_net_export_kw": net,
        "export_to_import_ratio": ratio,
        "status": status,
        "message_pl": message,
    }


# =============================================================================
# Aggregator (uzywany przez solver_input + proof_engine + report)
# =============================================================================


@dataclass(frozen=True)
class Audit2CatalogSnapshot:
    """Snapshot wszystkich katalogow audytu 2 — uzywany przez solvery i raporty."""

    bess_operation_modes: tuple[BessOperationModeItem, ...] = field(
        default=BESS_OPERATION_MODE_CATALOG
    )
    tap_changers: tuple[TapChangerItem, ...] = field(default=TAP_CHANGER_CATALOG)
    hv_fuses: tuple[HvFuseItem, ...] = field(default=HV_FUSE_CATALOG)
    device_withstand: tuple[DeviceWithstandItem, ...] = field(default=DEVICE_WITHSTAND_CATALOG)
    pf_curves: tuple[PfCurveItem, ...] = field(default=PF_CURVE_CATALOG)
    block_transformers: tuple[BlockTransformerItem, ...] = field(default=BLOCK_TRANSFORMER_CATALOG)
    mv_neutral_groundings: tuple[MvNeutralGroundingItem, ...] = field(
        default=MV_NEUTRAL_GROUNDING_CATALOG
    )

    def to_dict(self) -> dict:
        return {
            "bess_operation_modes": [m.to_dict() for m in self.bess_operation_modes],
            "tap_changers": [tc.to_dict() for tc in self.tap_changers],
            "hv_fuses": [f.to_dict() for f in self.hv_fuses],
            "device_withstand": [d.to_dict() for d in self.device_withstand],
            "pf_curves": [c.to_dict() for c in self.pf_curves],
            "block_transformers": [b.to_dict() for b in self.block_transformers],
            "mv_neutral_groundings": [g.to_dict() for g in self.mv_neutral_groundings],
        }


def get_audit2_catalog_snapshot() -> Audit2CatalogSnapshot:
    return Audit2CatalogSnapshot()
