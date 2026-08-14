"""Rodziny rozdzielnic SN i katalogowe jednostki funkcjonalne pol (etap S1).

Dyspozycja wlasciciela 2026-08-14 (dokument BINDING:
``docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md``): pole SN jest KOMPLETNA
jednostka funkcjonalna konkretnej rodziny rozdzielnicy, a aparat laczeniowy
jest tylko jednym z jej elementow. Hierarchia kanoniczna:

    PRODUCENT -> RODZINA -> TYP JEDNOSTKI FUNKCJONALNEJ -> KATALOGOWE POLE
    -> WYPOSAZENIE (fabryczne/opcjonalne) -> PARAMETRY -> BOM -> ENM -> SLD.

REUZYCIE, nie duplikacja: kompozycja aparatow jednostki uzywa kanonicznego
slownika ``bay_templates.BayDeviceTemplate.kind`` (CB, DS_BUS, DS_LINE, ES,
CT, VT, FUSE, SURGE_ARRESTER, CABLE_HEAD, TRANSFORMER_DEVICE) rozszerzonego
o sygnalizacje obecnosci napiecia (VPIS) i rozlacznik (LBS) — dzieki temu
mini-SLD kreatora i globalny SLD renderuja TEN SAM model.

POLITYKA ZERO FABRYKACJI: parametry rodzin to klasowe wartosci znamionowe
z publicznych katalogow producentow (proweniencja w ``source_reference``).
Rodzina bez potwierdzonych parametrow ma ``parametry_potwierdzone=False``
i NIE jest oferowana w konfiguratorze (jawny status, przypiety testem) —
istnieje w katalogu, zeby nie niszczyc informacji o realnym portfolio.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal


class SwitchgearArchitecture(str, Enum):
    """Architektura konstrukcyjna rodziny — rozstrzyga TOR konfiguracji.

    MODULAR_*: uzytkownik SKLADA rozdzielnice z jednostek (pole + pole + ...).
    COMPACT_RMU / BLOCK_RMU: uzytkownik wybiera KONFIGURACJE FABRYCZNA bloku,
    potem doposaza jednostki — trzy pola RMU NIE sa trzema luznymi szafami.
    """

    MODULAR_AIS = "MODULAR_AIS"
    MODULAR_GIS = "MODULAR_GIS"
    COMPACT_RMU = "COMPACT_RMU"
    BLOCK_RMU = "BLOCK_RMU"


class FunctionalRole(str, Enum):
    """Rola funkcjonalna jednostki w rozdzielnicy (nie aparat!)."""

    INCOMING = "INCOMING"
    OUTGOING = "OUTGOING"
    RING = "RING"
    TRANSFORMER = "TRANSFORMER"
    COUPLER = "COUPLER"
    SECTIONALIZER = "SECTIONALIZER"
    METERING = "METERING"
    AUXILIARY = "AUXILIARY"
    GENERATOR_DER = "GENERATOR_DER"


#: Kanoniczny slownik rodzajow aparatow/elementow toru jednostki.
#: Pierwsze dziesiec pozycji = ``bay_templates.BayDeviceTemplate.kind``
#: (jeden slownik dla katalogu, ENM i SLD); LBS i VPIS to rozszerzenie
#: addytywne wymagane przez dyspozycje (rozlacznik i sygnalizacja napiecia
#: sa elementami pola, nie „aparatem pola").
ComponentKind = Literal[
    "CB",
    "DS_BUS",
    "DS_LINE",
    "ES",
    "CT",
    "VT",
    "FUSE",
    "SURGE_ARRESTER",
    "CABLE_HEAD",
    "TRANSFORMER_DEVICE",
    "LBS",
    "VPIS",
]

KANONICZNE_RODZAJE: frozenset[str] = frozenset(
    {
        "CB",
        "DS_BUS",
        "DS_LINE",
        "ES",
        "CT",
        "VT",
        "FUSE",
        "SURGE_ARRESTER",
        "CABLE_HEAD",
        "TRANSFORMER_DEVICE",
        "LBS",
        "VPIS",
    }
)


class ComponentStatus(str, Enum):
    """Status elementu w jednostce katalogowej.

    Rodzina + typ jednostki OKRESLAJA, ktore elementy sa fabryczne, ktore
    opcjonalne, a wszystko spoza listy jest NIEDOPUSZCZALNE — zgodnosc wynika
    z katalogu producenta, nie z dowolnego dropdownu.
    """

    FABRYCZNY = "FABRYCZNY"
    OPCJA = "OPCJA"


@dataclass(frozen=True)
class ComponentSpec:
    """Element wyposazenia jednostki: rodzaj + status + pozycja w torze."""

    kind: ComponentKind
    status: ComponentStatus
    #: Pozycja w torze od szyny (0 = najblizej szyn); elementy OFF_PATH
    #: (VT, VPIS, SURGE_ARRESTER) dostaja pozycje galezi bocznej.
    position: int
    #: Oznaczenie aparatu na schemacie (Q1, Q0, F1, T1...) — dyspozycja pkt 9.
    designation: str = ""
    #: Umiejscowienie w torze — slownik z bay_templates.
    placement: Literal["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "OFF_PATH", "GROUND_BRANCH"] = (
        "MIDSTREAM"
    )

    def __post_init__(self) -> None:
        if self.kind not in KANONICZNE_RODZAJE:
            raise ValueError(
                f"Rodzaj elementu {self.kind!r} spoza kanonicznego slownika "
                f"(dozwolone: {sorted(KANONICZNE_RODZAJE)})."
            )


@dataclass(frozen=True)
class SwitchgearFamily:
    """Rodzina rozdzielnicy SN konkretnego producenta (immutable, katalog).

    Parametry sa KLASAMI znamionowymi z katalogu producenta — pojedyncza
    jednostka moze je zawezac, nigdy rozszerzac (walidator ponizej).
    """

    id: str
    manufacturer: str
    name: str
    architecture: SwitchgearArchitecture
    #: Technologia/medium (opis inzynierski PL, np. "izolacja powietrzna",
    #: "suche powietrze / prozniowa", "SF6").
    technology: str
    rated_voltages_kv: tuple[float, ...]
    rated_busbar_currents_a: tuple[int, ...]
    short_circuit_ik_ka: float
    short_circuit_tk_s: float
    #: Klasa odpornosci lukowej wg IEC 62271-200 (np. "AFLR 20 kA 1 s");
    #: pusty string = brak danych w karcie (jawny brak, nie zero).
    arc_classification: str
    source_reference: str
    #: False = rodzina istnieje w portfolio, ale wartosci nie zostaly
    #: potwierdzone karta katalogowa — konfigurator jej NIE oferuje.
    parametry_potwierdzone: bool = True

    def __post_init__(self) -> None:
        if not self.source_reference.strip():
            raise ValueError(
                f"Rodzina {self.id}: pusta proweniencja (source_reference) — "
                "polityka zero fabrykacji wymaga zrodla katalogowego."
            )
        if self.parametry_potwierdzone:
            if not self.rated_voltages_kv or min(self.rated_voltages_kv) <= 0:
                raise ValueError(f"Rodzina {self.id}: niepoprawne napiecia znamionowe.")
            if not self.rated_busbar_currents_a or min(self.rated_busbar_currents_a) <= 0:
                raise ValueError(f"Rodzina {self.id}: niepoprawne prady szyn.")
            if self.short_circuit_ik_ka <= 0 or self.short_circuit_tk_s <= 0:
                raise ValueError(f"Rodzina {self.id}: niepoprawne parametry zwarciowe.")


@dataclass(frozen=True)
class CatalogFunctionalUnit:
    """Katalogowe pole (jednostka funkcjonalna) rodziny rozdzielnicy."""

    id: str
    family_id: str
    catalog_code: str
    name: str
    role: FunctionalRole
    components: tuple[ComponentSpec, ...]
    rated_current_a: int
    width_mm: int
    #: Typ przylacza kablowego (opis PL; pusty = jednostka bez przedzialu
    #: kablowego, np. pole sprzegla).
    cable_termination: str = ""
    #: Jawna macierz zgodnosci aparatow OEM: identyfikatory typow z katalogu
    #: aparatow (mv_switch_catalog) dopuszczonych w tej jednostce dla aparatu
    #: glownego. Pusta = aparat glowny jest staly (wynika z kodu katalogowego).
    dopuszczone_aparaty_glowne: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.components:
            raise ValueError(
                f"Jednostka {self.id}: pusta kompozycja aparatow — pole nie "
                "moze byc pustym pudelkiem."
            )
        if self.rated_current_a <= 0 or self.width_mm <= 0:
            raise ValueError(f"Jednostka {self.id}: niepoprawne parametry (In/szerokosc).")

    def elementy_fabryczne(self) -> tuple[ComponentSpec, ...]:
        return tuple(c for c in self.components if c.status is ComponentStatus.FABRYCZNY)

    def elementy_opcjonalne(self) -> tuple[ComponentSpec, ...]:
        return tuple(c for c in self.components if c.status is ComponentStatus.OPCJA)


@dataclass(frozen=True)
class FactoryConfiguration:
    """Fabryczna konfiguracja bloku RMU (sekwencja jednostek).

    Dla architektur COMPACT_RMU/BLOCK_RMU uzytkownik NAJPIERW wybiera blok
    (np. K-K-T), a dopiero potem doposaza jednostki — RMU nie jest zbiorem
    luznych szaf.
    """

    id: str
    family_id: str
    code: str
    name: str
    unit_ids: tuple[str, ...]
    total_width_mm: int

    def __post_init__(self) -> None:
        if len(self.unit_ids) < 2:
            raise ValueError(
                f"Konfiguracja {self.id}: blok RMU ma co najmniej dwie " "jednostki funkcjonalne."
            )


class NiezgodnoscKonfiguracjiError(ValueError):
    """Twardy blad zgodnosci: kombinacja spoza katalogu producenta."""


# ---------------------------------------------------------------------------
# DANE: pierwsza transza rodzin (portfolio realne; parametry = klasy z
# publicznych katalogow producentow, proweniencja w source_reference).
# ---------------------------------------------------------------------------

SWITCHGEAR_FAMILIES: tuple[SwitchgearFamily, ...] = (
    # --- ZPUE ------------------------------------------------------------
    SwitchgearFamily(
        id="zpue_rotoblok",
        manufacturer="ZPUE",
        name="Rotoblok",
        architecture=SwitchgearArchitecture.MODULAR_AIS,
        technology="izolacja powietrzna, rozdzielnica z typowych pol",
        rated_voltages_kv=(12.0, 17.5, 24.0),
        rated_busbar_currents_a=(630, 1250),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="klasa lukoochronna wg katalogu ZPUE",
        source_reference="Katalog ZPUE — rozdzielnice SN Rotoblok",
    ),
    SwitchgearFamily(
        id="zpue_rotoblok_vcb",
        manufacturer="ZPUE",
        name="Rotoblok VCB",
        architecture=SwitchgearArchitecture.MODULAR_AIS,
        technology="izolacja powietrzna, wylaczniki prozniowe",
        rated_voltages_kv=(12.0, 17.5, 24.0),
        rated_busbar_currents_a=(630, 1250),
        short_circuit_ik_ka=25.0,
        short_circuit_tk_s=3.0,
        arc_classification="klasa lukoochronna wg katalogu ZPUE",
        source_reference="Katalog ZPUE — rozdzielnice SN Rotoblok VCB",
    ),
    SwitchgearFamily(
        id="zpue_relf",
        manufacturer="ZPUE",
        name="RELF",
        architecture=SwitchgearArchitecture.MODULAR_AIS,
        technology=(
            "rozdzielnica dwuczlonowa w izolacji powietrznej, IP4X, LSC2B "
            "(LSC2 dla 36 kV); do 40 kA/3 s w wariancie 12 kV"
        ),
        rated_voltages_kv=(12.0, 17.5, 24.0, 36.0),
        rated_busbar_currents_a=(630, 1250, 1600, 2000, 2500, 4000),
        short_circuit_ik_ka=31.5,
        short_circuit_tk_s=3.0,
        arc_classification="IAC AFLR; prad szczytowy do 80-100 kA wg wariantu",
        source_reference=(
            "Karta katalogowa ZPUE — RELF (zpue.pl/rozdzielnice-sn, odczyt "
            "2026-08-14; PN-EN 62271-1, PN-EN 62271-200)"
        ),
    ),
    SwitchgearFamily(
        id="zpue_tpm",
        manufacturer="ZPUE",
        name="TPM",
        architecture=SwitchgearArchitecture.COMPACT_RMU,
        technology="RMU w izolacji SF6",
        rated_voltages_kv=(24.0,),
        rated_busbar_currents_a=(630,),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="klasa lukoochronna wg katalogu ZPUE",
        source_reference="Katalog ZPUE — rozdzielnice SN TPM",
    ),
    SwitchgearFamily(
        id="zpue_tpm_air",
        manufacturer="ZPUE",
        name="TPM Air",
        architecture=SwitchgearArchitecture.COMPACT_RMU,
        technology="RMU bez SF6 (suche powietrze), aparatura prozniowa",
        rated_voltages_kv=(24.0,),
        rated_busbar_currents_a=(630,),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="klasa lukoochronna wg katalogu ZPUE",
        source_reference="Katalog ZPUE — rozdzielnice SN TPM Air (bez SF6)",
    ),
    SwitchgearFamily(
        id="zpue_rotoblok_air",
        manufacturer="ZPUE",
        name="Rotoblok Air",
        architecture=SwitchgearArchitecture.MODULAR_AIS,
        technology="izolacja powietrzna, bez SF6",
        rated_voltages_kv=(12.0, 17.5, 24.0),
        rated_busbar_currents_a=(630, 1250),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="klasa lukoochronna wg katalogu ZPUE",
        source_reference="Katalog ZPUE — rozdzielnice SN Rotoblok Air",
    ),
    SwitchgearFamily(
        id="zpue_relf_2s",
        manufacturer="ZPUE",
        name="RELF 2S",
        architecture=SwitchgearArchitecture.MODULAR_AIS,
        technology=(
            "rozdzielnica dwusystemowa (dwa systemy szyn zbiorczych), dwuczlonowa, "
            "izolacja powietrzna, IP4X, czlon wysuwny: wylacznik/stycznik/rozlacznik/"
            "zespol przekladnikow/blok bezpiecznikowy"
        ),
        rated_voltages_kv=(12.0,),
        rated_busbar_currents_a=(630, 1250, 1600, 2000, 2500),
        short_circuit_ik_ka=31.5,
        short_circuit_tk_s=3.0,
        arc_classification="IAC AFLR 31,5 kA 1 s; prad szczytowy 80 kA",
        source_reference=(
            "Karta katalogowa ZPUE — RELF 2S (zpue.pl/rozdzielnice-sn/relf-2s, "
            "odczyt 2026-08-14; PN-EN 62271-200)"
        ),
    ),
    SwitchgearFamily(
        id="zpue_rxd",
        manufacturer="ZPUE",
        name="RXD",
        # KOREKTA po weryfikacji karty (2026-08-14): RXD to rozdzielnica
        # dwuczlonowa w izolacji POWIETRZNEJ (metal-enclosed), nie gazowej —
        # wstepna klasyfikacja GIS z transzy S1 byla bledna.
        architecture=SwitchgearArchitecture.MODULAR_AIS,
        technology=(
            "rozdzielnica dwuczlonowa w izolacji powietrznej (metal-enclosed), "
            "jeden system szyn, manipulacja czlonem przez zamkniete drzwi"
        ),
        rated_voltages_kv=(12.0, 36.0),
        rated_busbar_currents_a=(630, 1250),
        short_circuit_ik_ka=25.0,
        short_circuit_tk_s=3.0,
        arc_classification="IAC AFLR 25 kA 1 s (wariant 12 kV) / 20 kA 1 s (wariant 36 kV); prad szczytowy 63 kA",
        source_reference=(
            "Karta produktu RXD — dane producenta ZPUE za elektro.info "
            "(elektro.info.pl/produkt/rozdzielnice-sn/109592, odczyt 2026-08-14; "
            "PN-EN 62271-1, PN-EN 62271-200)"
        ),
    ),
    # --- ABB -------------------------------------------------------------
    SwitchgearFamily(
        id="abb_safering",
        manufacturer="ABB",
        name="SafeRing",
        architecture=SwitchgearArchitecture.BLOCK_RMU,
        technology="kompaktowe RMU w izolacji SF6, konfiguracje predefiniowane",
        rated_voltages_kv=(12.0, 24.0),
        rated_busbar_currents_a=(630,),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="IAC wg katalogu ABB",
        source_reference="Katalog ABB — SafeRing (RMU dystrybucji wtornej)",
    ),
    SwitchgearFamily(
        id="abb_safeplus",
        manufacturer="ABB",
        name="SafePlus",
        architecture=SwitchgearArchitecture.COMPACT_RMU,
        technology="kompaktowe RMU rozszerzalne, izolacja SF6",
        rated_voltages_kv=(12.0, 24.0),
        rated_busbar_currents_a=(630,),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="IAC wg katalogu ABB",
        source_reference="Katalog ABB — SafePlus",
    ),
    SwitchgearFamily(
        id="abb_unisec",
        manufacturer="ABB",
        name="UniSec",
        architecture=SwitchgearArchitecture.MODULAR_AIS,
        technology="izolacja powietrzna, portfolio jednostek funkcjonalnych",
        rated_voltages_kv=(12.0, 17.5, 24.0),
        rated_busbar_currents_a=(630, 1250, 2000),
        short_circuit_ik_ka=25.0,
        short_circuit_tk_s=3.0,
        arc_classification="IAC AFLR wg katalogu ABB",
        source_reference="Katalog ABB — UniSec (jednostki funkcjonalne SN)",
    ),
    # --- Schneider Electric ---------------------------------------------
    SwitchgearFamily(
        id="se_sm6",
        manufacturer="Schneider Electric",
        name="SM6",
        architecture=SwitchgearArchitecture.MODULAR_AIS,
        technology="rozdzielnica modulowa, aparatura w SF6/prozni",
        rated_voltages_kv=(12.0, 17.5, 24.0),
        rated_busbar_currents_a=(630, 1250),
        short_circuit_ik_ka=25.0,
        short_circuit_tk_s=1.0,
        arc_classification="IAC wg katalogu Schneider Electric",
        source_reference="Katalog Schneider Electric — SM6",
    ),
    SwitchgearFamily(
        id="se_rm6",
        manufacturer="Schneider Electric",
        name="RM6",
        architecture=SwitchgearArchitecture.BLOCK_RMU,
        technology="kompaktowe RMU w izolacji SF6",
        rated_voltages_kv=(12.0, 24.0),
        rated_busbar_currents_a=(630,),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="IAC wg katalogu Schneider Electric",
        source_reference="Katalog Schneider Electric — RM6",
    ),
    SwitchgearFamily(
        id="se_rm_airset",
        manufacturer="Schneider Electric",
        name="RM AirSeT",
        architecture=SwitchgearArchitecture.BLOCK_RMU,
        technology="RMU bez SF6 (czyste powietrze), aparatura prozniowa",
        rated_voltages_kv=(12.0, 24.0),
        rated_busbar_currents_a=(630,),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="IAC wg katalogu Schneider Electric",
        source_reference="Katalog Schneider Electric — RM AirSeT",
    ),
    # --- Siemens ---------------------------------------------------------
    SwitchgearFamily(
        id="siemens_8djh",
        manufacturer="Siemens",
        name="8DJH",
        architecture=SwitchgearArchitecture.COMPACT_RMU,
        technology="rozdzielnica w izolacji gazowej, dystrybucja wtorna",
        rated_voltages_kv=(12.0, 17.5, 24.0),
        rated_busbar_currents_a=(630,),
        short_circuit_ik_ka=20.0,
        short_circuit_tk_s=1.0,
        arc_classification="IAC wg katalogu Siemens",
        source_reference="Katalog Siemens — 8DJH",
    ),
)


def _s(
    kind: ComponentKind,
    status: ComponentStatus,
    position: int,
    designation: str,
    placement: str = "MIDSTREAM",
) -> ComponentSpec:
    return ComponentSpec(
        kind=kind, status=status, position=position, designation=designation, placement=placement
    )  # type: ignore[arg-type]


_F = ComponentStatus.FABRYCZNY
_O = ComponentStatus.OPCJA

CATALOG_FUNCTIONAL_UNITS: tuple[CatalogFunctionalUnit, ...] = (
    # --- ZPUE Rotoblok: pola typowe wg katalogu -------------------------
    CatalogFunctionalUnit(
        id="zpue_rotoblok_rl",
        family_id="zpue_rotoblok",
        catalog_code="RL",
        name="Pole liniowe (rozlacznikowe)",
        role=FunctionalRole.RING,
        components=(
            _s("LBS", _F, 0, "Q1"),
            _s("ES", _F, 1, "Q0", "GROUND_BRANCH"),
            _s("VPIS", _F, 2, "", "OFF_PATH"),
            _s("CABLE_HEAD", _F, 3, "", "DOWNSTREAM"),
            _s("SURGE_ARRESTER", _O, 3, "F2", "OFF_PATH"),
        ),
        rated_current_a=630,
        width_mm=500,
        cable_termination="glowice konektorowe / tradycyjne wg katalogu",
    ),
    CatalogFunctionalUnit(
        id="zpue_rotoblok_rt",
        family_id="zpue_rotoblok",
        catalog_code="RT",
        name="Pole transformatorowe (rozlacznik z bezpiecznikami)",
        role=FunctionalRole.TRANSFORMER,
        components=(
            _s("LBS", _F, 0, "Q1"),
            _s("FUSE", _F, 1, "F1"),
            _s("ES", _F, 2, "Q0", "GROUND_BRANCH"),
            _s("VPIS", _F, 3, "", "OFF_PATH"),
            _s("CABLE_HEAD", _F, 4, "", "DOWNSTREAM"),
            _s("TRANSFORMER_DEVICE", _F, 5, "T1", "DOWNSTREAM"),
        ),
        rated_current_a=200,
        width_mm=500,
        cable_termination="glowice kablowe do transformatora",
    ),
    CatalogFunctionalUnit(
        id="zpue_rotoblok_rw",
        family_id="zpue_rotoblok",
        catalog_code="RW",
        name="Pole wylacznikowe",
        role=FunctionalRole.OUTGOING,
        components=(
            _s("DS_BUS", _F, 0, "Q1"),
            _s("CB", _F, 1, "Q2"),
            _s("CT", _F, 2, "T2"),
            _s("ES", _F, 3, "Q0", "GROUND_BRANCH"),
            _s("VPIS", _F, 4, "", "OFF_PATH"),
            _s("CABLE_HEAD", _F, 5, "", "DOWNSTREAM"),
            _s("SURGE_ARRESTER", _O, 5, "F2", "OFF_PATH"),
        ),
        rated_current_a=630,
        width_mm=700,
        cable_termination="glowice konektorowe / tradycyjne wg katalogu",
    ),
    CatalogFunctionalUnit(
        id="zpue_rotoblok_rp",
        family_id="zpue_rotoblok",
        catalog_code="RP",
        name="Pole pomiarowe",
        role=FunctionalRole.METERING,
        components=(
            _s("DS_BUS", _F, 0, "Q1"),
            _s("VT", _F, 1, "T5", "OFF_PATH"),
            _s("CT", _F, 1, "T2"),
        ),
        rated_current_a=630,
        width_mm=750,
    ),
    # --- ZPUE TPM Air: jednostki bloku RMU ------------------------------
    CatalogFunctionalUnit(
        id="zpue_tpm_air_k",
        family_id="zpue_tpm_air",
        catalog_code="K",
        name="Jednostka kablowa (liniowa)",
        role=FunctionalRole.RING,
        components=(
            _s("LBS", _F, 0, "Q1"),
            _s("ES", _F, 1, "Q0", "GROUND_BRANCH"),
            _s("VPIS", _F, 2, "", "OFF_PATH"),
            _s("CABLE_HEAD", _F, 3, "", "DOWNSTREAM"),
        ),
        rated_current_a=630,
        width_mm=310,
        cable_termination="glowice konektorowe",
    ),
    CatalogFunctionalUnit(
        id="zpue_tpm_air_t",
        family_id="zpue_tpm_air",
        catalog_code="T",
        name="Jednostka transformatorowa (rozlacznik z bezpiecznikami)",
        role=FunctionalRole.TRANSFORMER,
        components=(
            _s("LBS", _F, 0, "Q1"),
            _s("FUSE", _F, 1, "F1"),
            _s("ES", _F, 2, "Q0", "GROUND_BRANCH"),
            _s("VPIS", _F, 3, "", "OFF_PATH"),
            _s("CABLE_HEAD", _F, 4, "", "DOWNSTREAM"),
            _s("TRANSFORMER_DEVICE", _F, 5, "T1", "DOWNSTREAM"),
        ),
        rated_current_a=200,
        width_mm=430,
        cable_termination="glowice konektorowe do transformatora",
    ),
    # --- ABB SafeRing: jednostki konfiguracji fabrycznych ---------------
    CatalogFunctionalUnit(
        id="abb_safering_c",
        family_id="abb_safering",
        catalog_code="C",
        name="Jednostka kablowa (rozlacznik)",
        role=FunctionalRole.RING,
        components=(
            _s("LBS", _F, 0, "Q1"),
            _s("ES", _F, 1, "Q0", "GROUND_BRANCH"),
            _s("VPIS", _F, 2, "", "OFF_PATH"),
            _s("CABLE_HEAD", _F, 3, "", "DOWNSTREAM"),
        ),
        rated_current_a=630,
        width_mm=325,
        cable_termination="glowice konektorowe",
    ),
    CatalogFunctionalUnit(
        id="abb_safering_f",
        family_id="abb_safering",
        catalog_code="F",
        name="Jednostka transformatorowa (switch-fuse)",
        role=FunctionalRole.TRANSFORMER,
        components=(
            _s("LBS", _F, 0, "Q1"),
            _s("FUSE", _F, 1, "F1"),
            _s("ES", _F, 2, "Q0", "GROUND_BRANCH"),
            _s("VPIS", _F, 3, "", "OFF_PATH"),
            _s("CABLE_HEAD", _F, 4, "", "DOWNSTREAM"),
            _s("TRANSFORMER_DEVICE", _F, 5, "T1", "DOWNSTREAM"),
        ),
        rated_current_a=200,
        width_mm=325,
        cable_termination="glowice konektorowe do transformatora",
    ),
    CatalogFunctionalUnit(
        id="abb_safering_v",
        family_id="abb_safering",
        catalog_code="V",
        name="Jednostka wylacznikowa (wylacznik prozniowy)",
        role=FunctionalRole.TRANSFORMER,
        components=(
            _s("DS_LINE", _F, 0, "Q1"),
            _s("CB", _F, 1, "Q2"),
            _s("CT", _F, 2, "T2"),
            _s("ES", _F, 3, "Q0", "GROUND_BRANCH"),
            _s("VPIS", _F, 4, "", "OFF_PATH"),
            _s("CABLE_HEAD", _F, 5, "", "DOWNSTREAM"),
            _s("TRANSFORMER_DEVICE", _F, 6, "T1", "DOWNSTREAM"),
        ),
        rated_current_a=630,
        width_mm=325,
        cable_termination="glowice konektorowe",
    ),
)

FACTORY_CONFIGURATIONS: tuple[FactoryConfiguration, ...] = (
    FactoryConfiguration(
        id="zpue_tpm_air_kkt",
        family_id="zpue_tpm_air",
        code="KKT",
        name="Blok kabel-kabel-transformator",
        unit_ids=("zpue_tpm_air_k", "zpue_tpm_air_k", "zpue_tpm_air_t"),
        total_width_mm=1050,
    ),
    FactoryConfiguration(
        id="zpue_tpm_air_kkk",
        family_id="zpue_tpm_air",
        code="KKK",
        name="Blok kabel-kabel-kabel",
        unit_ids=("zpue_tpm_air_k", "zpue_tpm_air_k", "zpue_tpm_air_k"),
        total_width_mm=930,
    ),
    FactoryConfiguration(
        id="abb_safering_ccf",
        family_id="abb_safering",
        code="CCF",
        name="Blok kabel-kabel-switch-fuse",
        unit_ids=("abb_safering_c", "abb_safering_c", "abb_safering_f"),
        total_width_mm=975,
    ),
    FactoryConfiguration(
        id="abb_safering_ccv",
        family_id="abb_safering",
        code="CCV",
        name="Blok kabel-kabel-wylacznik",
        unit_ids=("abb_safering_c", "abb_safering_c", "abb_safering_v"),
        total_width_mm=975,
    ),
)


# ---------------------------------------------------------------------------
# Rejestr + walidator zgodnosci (jedno zrodlo prawdy)
# ---------------------------------------------------------------------------

_FAMILIES_BY_ID: dict[str, SwitchgearFamily] = {f.id: f for f in SWITCHGEAR_FAMILIES}
_UNITS_BY_ID: dict[str, CatalogFunctionalUnit] = {u.id: u for u in CATALOG_FUNCTIONAL_UNITS}
_CONFIGS_BY_ID: dict[str, FactoryConfiguration] = {c.id: c for c in FACTORY_CONFIGURATIONS}


def get_family(family_id: str) -> SwitchgearFamily:
    try:
        return _FAMILIES_BY_ID[family_id]
    except KeyError as exc:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina rozdzielnicy {family_id!r} nie istnieje w katalogu."
        ) from exc


def get_unit(unit_id: str) -> CatalogFunctionalUnit:
    try:
        return _UNITS_BY_ID[unit_id]
    except KeyError as exc:
        raise NiezgodnoscKonfiguracjiError(
            f"Jednostka funkcjonalna {unit_id!r} nie istnieje w katalogu."
        ) from exc


def rodziny_producenta(manufacturer: str) -> tuple[SwitchgearFamily, ...]:
    return tuple(f for f in SWITCHGEAR_FAMILIES if f.manufacturer == manufacturer)


def rodziny_oferowane() -> tuple[SwitchgearFamily, ...]:
    """Rodziny dopuszczone do konfiguratora (potwierdzone karta katalogowa)."""
    return tuple(f for f in SWITCHGEAR_FAMILIES if f.parametry_potwierdzone)


def jednostki_rodziny(family_id: str) -> tuple[CatalogFunctionalUnit, ...]:
    get_family(family_id)
    return tuple(u for u in CATALOG_FUNCTIONAL_UNITS if u.family_id == family_id)


def konfiguracje_rodziny(family_id: str) -> tuple[FactoryConfiguration, ...]:
    get_family(family_id)
    return tuple(c for c in FACTORY_CONFIGURATIONS if c.family_id == family_id)


def family_supports_unit(family_id: str, unit_id: str) -> None:
    """Twardy walidator: jednostka musi nalezec do rodziny.

    Zakaz skladania fikcyjnego pola „rodzina A + szafa B + aparat C" —
    zgodnosc wynika z katalogu, nie z dropdownu.
    """
    family = get_family(family_id)
    unit = get_unit(unit_id)
    if unit.family_id != family.id:
        raise NiezgodnoscKonfiguracjiError(
            f"Jednostka {unit.catalog_code} ({unit.name}) nalezy do rodziny "
            f"{unit.family_id}, nie do {family.name} — katalog producenta nie "
            "przewiduje takiej kombinacji."
        )
    if not family.parametry_potwierdzone:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.name} ({family.manufacturer}) nie ma potwierdzonych "
            "parametrow karta katalogowa — nie mozna na niej budowac konfiguracji."
        )


def family_supports_voltage(family_id: str, voltage_kv: float) -> None:
    family = get_family(family_id)
    if not family.parametry_potwierdzone or voltage_kv not in family.rated_voltages_kv:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.name} nie obsluguje napiecia {voltage_kv} kV "
            f"(klasy katalogowe: {list(family.rated_voltages_kv)})."
        )


def family_supports_current(family_id: str, current_a: int) -> None:
    family = get_family(family_id)
    if not family.parametry_potwierdzone or current_a > max(family.rated_busbar_currents_a):
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.name} nie obsluguje pradu szyn {current_a} A "
            f"(maksimum katalogowe: {max(family.rated_busbar_currents_a) if family.rated_busbar_currents_a else 'brak danych'} A)."
        )


def family_supports_short_circuit(family_id: str, ik_ka: float) -> None:
    family = get_family(family_id)
    if not family.parametry_potwierdzone or ik_ka > family.short_circuit_ik_ka:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.name} nie obsluguje pradu zwarciowego {ik_ka} kA "
            f"(wytrzymalosc katalogowa: {family.short_circuit_ik_ka} kA)."
        )


def unit_supports_component(unit_id: str, kind: str) -> ComponentStatus:
    """Status elementu w jednostce; element spoza listy = twardy blad."""
    unit = get_unit(unit_id)
    for comp in unit.components:
        if comp.kind == kind:
            return comp.status
    raise NiezgodnoscKonfiguracjiError(
        f"Jednostka {unit.catalog_code} ({unit.name}) nie przewiduje elementu "
        f"{kind!r} — katalog rodziny go nie dopuszcza."
    )


def configuration_supports_family(config_id: str) -> None:
    config = _CONFIGS_BY_ID.get(config_id)
    if config is None:
        raise NiezgodnoscKonfiguracjiError(
            f"Konfiguracja fabryczna {config_id!r} nie istnieje w katalogu."
        )
    for unit_id in config.unit_ids:
        family_supports_unit(config.family_id, unit_id)
