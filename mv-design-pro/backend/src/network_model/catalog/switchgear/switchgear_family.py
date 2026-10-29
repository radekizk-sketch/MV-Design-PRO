"""SwitchgearFamily — rodzina rozdzielnicy SN producenta.

Goal §11A.2: rodzina to konkretna seria produktów producenta (np. "Rotoblok",
"Safevap", "UniGear ZS1", "8DJH"). Każda ma:
- konstrukcję (RMU / jednoczłonowa / wysuwna / GIS / kontenerowa),
- układ szyn (single / sectionalized / double / ring main),
- izolację (powietrzna / stało-powietrzna / gazowa bez gazów fluorowanych / SF₆) i medium
  łączników (SF₆ / próżnia / powietrze / aparat z katalogu aparatów) — z obu osi wynika gaz
  fluorowany rodziny (`gaz_fluorowany`, dyrektywa właściciela 2026-10-28),
- listę dopuszczonych napięć i prądów,
- listę dopuszczonych typów pól (`allowed_bay_kinds`).

DWA POLA NAPIĘCIOWE, DWIE RÓŻNE WIELKOŚCI (karta K-J, 2026-08-14). Rodzina
deklaruje osobno `network_voltages_kv` (napięcia SIECI, dla których producent
oferuje wyrób) i `um_classes_kv` (klasy napięciowe URZĄDZENIA — napięcie
znamionowe / najwyższe napięcie urządzenia wg PN-EN 62271-1). To NIE są
synonimy: karta Rotobloka podaje sieć 15/20 kV przy klasach 17,5/24 kV.
Jedno pole `voltage_levels` mieszało obie wielkości, więc porównanie
„napięcie szyny ∈ lista" raz znaczyło zgodność z siecią, a raz z izolacją —
i dlatego walidacja napięciowa musiała być wyłączona. Reguła dopasowania
jest JEDNA i mieszka w `family_validation.czy_rodzina_obsluguje_napiecie`.

Reguła: rodzina jest pełnoprawna TYLKO gdy producent ma `status='verified'`
i podpięte oficjalne `source_refs`. Inaczej rodzina jest `requires_catalog`.
"""

from __future__ import annotations

from typing import Literal, get_args

from network_model.catalog.gazy_fluorowane import odmowa_gazu_fluorowanego_pl
from pydantic import BaseModel, Field, computed_field

#: Izolacja rodziny rozdzielnicy — JEDYNE źródło medium izolacyjnego pola (pole czyta je przez
#: `Bay.switchgear_family_ref`; szablony pól NIE niosą medium): ``air`` — izolacja powietrzna
#: (AIS), ``ssis`` — izolacja stało-powietrzna (aparaty w osłonach z izolacji stałej),
#: ``gaz_bez_f`` — izolacja gazowa bez gazów fluorowanych (suche powietrze albo azot pod
#: nadciśnieniem), ``sf6`` — izolacja gazowa SF₆, ``unknown`` — karta nie rozstrzyga.
InsulationType = Literal["air", "ssis", "gaz_bez_f", "sf6", "unknown"]

NAZWY_IZOLACJI_RODZINY_PL: dict[str, str] = {
    "air": "izolacja powietrzna",
    "ssis": "izolacja stało-powietrzna",
    "gaz_bez_f": "izolacja gazowa bez gazów fluorowanych",
    "sf6": "izolacja gazowa SF₆",
    "unknown": "izolacja nieustalona",
}

#: Medium gaszenia łuku w aparatach łączeniowych rodziny (druga oś gazu fluorowanego, obok
#: izolacji): ``SF6`` — łączniki w SF₆ (także w rozdzielnicy powietrznej, np. SM6, Rotoblok),
#: ``PROZNIA`` — łączniki próżniowe, ``POWIETRZE`` — łączniki powietrzne, ``KATALOG_APARATOW``
#: — rodzina nie ma własnych łączników: aparat jest pozycją katalogu aparatów (człon wysuwny,
#: wyłącznik stały), więc medium rozstrzyga aparat (`SwitchEquipmentType.medium`). ``None`` —
#: karta nie rozstrzyga.
MediumLacznikowRodziny = Literal["SF6", "PROZNIA", "POWIETRZE", "KATALOG_APARATOW"]

NAZWY_MEDIUM_LACZNIKOW_PL: dict[str, str] = {
    "SF6": "łączniki w SF₆",
    "PROZNIA": "łączniki próżniowe",
    "POWIETRZE": "łączniki powietrzne",
    "KATALOG_APARATOW": "aparat łączeniowy z katalogu aparatów",
}

ConstructionType = Literal[
    "RMU",
    "jednoczlonowa",
    "dwuczlonowa",
    "wysuwna",
    "GIS",
    "wnetrzowa",
    "kontenerowa",
    "prefabrykowana",
    "unknown",
]
BusbarSystem = Literal[
    "single",
    "sectionalized_single",
    "double",
    "auxiliary",
    "ring_main",
    "unknown",
]
SwitchgearFamilyStatus = Literal[
    "verified",
    "repo_verified",
    "standard_osd",
    "user_defined",
    "requires_catalog",
    "deprecated",
]

LifecycleStatus = Literal["current", "legacy", "archived", "unknown"]

CompartmentModel = Literal[
    "cable_compartment",
    "busbar_compartment",
    "apparatus_compartment",
    "lv_control_compartment",
    "metering_compartment",
]

TorKonfiguracji = Literal["MODULARNY", "BLOK_RMU"]

#: Tor konfiguracji rodziny → nazwa w treści dla projektanta (karta #142). Słowa = kreator
#: stacji (``ui2/kreatory/stacja/strings.ts::torModularnyTytul``/``torBlokTytul``).
NAZWY_TOROW_KONFIGURACJI_PL: dict[str, str] = {
    "MODULARNY": "Tor modułowy — rozdzielnica składana z pól",
    "BLOK_RMU": "Tor blokowy (RMU) — blok fabryczny",
}

#: Status rodziny, który wyklucza budowanie konfiguracji → powód dla projektanta (karta
#: #142). Słowa = przeglądarka rodzin frontu
#: (``ui/catalog/SwitchgearFamilyPicker.tsx::POWOD_BLOKADY_PL``); kod statusu zostaje w danych.
#: Statusy rodziny, przy których katalog uznaje dane za potwierdzone źródłem
#: i pozwala BUDOWAĆ na rodzinie konfigurację (polityka
#: `SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`). `requires_catalog` i `deprecated`
#: są poza tym zbiorem — rodzina istnieje w katalogu (nie niszczymy wiedzy o
#: realnym portfolio producenta), ale konfigurator jej NIE oferuje.
POTWIERDZONE_STATUSY_RODZINY: frozenset[str] = frozenset({"verified", "repo_verified"})

#: Statusy, przy których na rodzinie wolno budować: potwierdzone źródłem producenta ORAZ
#: ``standard_osd`` — typ ogólny rozdzielnicy wg standardu operatora (ENEA Operator, Zeszyt 1,
#: §13) bez producenta: wartości robocze (jakość ESTIMATED, ZASADA NR 4), dopóki projektant nie
#: wskaże wyrobu. Rodzina ``standard_osd`` nie produkuje szablonów pól rodziny (nie ma celek
#: producenta) — pola budują szablony kanoniczne (`canonical_fallback`).
STATUSY_DOPUSZCZONE_DO_BUDOWANIA: frozenset[str] = POTWIERDZONE_STATUSY_RODZINY | {"standard_osd"}

POWODY_BLOKADY_RODZINY_PL: dict[str, str] = {
    "requires_catalog": (
        "wymaga karty katalogowej producenta — brak potwierdzonych klas znamionowych"
    ),
    "deprecated": "rodzina wycofana z oferty producenta",
    "user_defined": "rodzina zdefiniowana przez użytkownika bez potwierdzonej karty katalogowej",
}

#: Tor konfiguracji rodziny WYPROWADZONY z `construction_type` — bez osobnego
#: pola „architektura" (dwa pola o tej samej treści to dwie ścieżki tej samej
#: prawdy; `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §8).
#:
#: * `MODULARNY` — użytkownik SKŁADA rozdzielnicę z pojedynczych pól
#:   (rozdzielnice wnętrzowe, dwuczłonowe, wysuwne, GIS rozdziału pierwotnego);
#: * `BLOK_RMU` — użytkownik wybiera KONFIGURACJĘ FABRYCZNĄ bloku (np. L-L-T),
#:   a dopiero potem doposaża jednostki; RMU nie jest zbiorem luźnych szaf.
#:
#: `None` oznacza rodzinę, która nie zadeklarowała konstrukcji — jawny brak,
#: nigdy domyślny tor. Mapa pokrywa KOMPLET wartości `ConstructionType`
#: (test dwustronny w `test_switchgear_families.py`), więc nowa wartość
#: konstrukcji nie przejdzie po cichu z domyślnym torem.
TOR_KONFIGURACJI_WG_KONSTRUKCJI: dict[str, TorKonfiguracji | None] = {
    "RMU": "BLOK_RMU",
    "jednoczlonowa": "MODULARNY",
    "dwuczlonowa": "MODULARNY",
    "wysuwna": "MODULARNY",
    "GIS": "MODULARNY",
    "wnetrzowa": "MODULARNY",
    "kontenerowa": "MODULARNY",
    "prefabrykowana": "MODULARNY",
    "unknown": None,
}

assert set(TOR_KONFIGURACJI_WG_KONSTRUKCJI) == set(get_args(ConstructionType)), (
    "TOR_KONFIGURACJI_WG_KONSTRUKCJI musi pokrywać komplet wartości "
    "ConstructionType — brak wpisu oznaczałby cichy domyślny tor konfiguracji."
)


def tor_konfiguracji_dla_konstrukcji(construction_type: str) -> TorKonfiguracji | None:
    """Tor konfiguracji dla typu konstrukcji (jedyne miejsce tego odwzorowania)."""
    return TOR_KONFIGURACJI_WG_KONSTRUKCJI[construction_type]


class SwitchgearFamily(BaseModel):
    """Rodzina rozdzielnicy SN konkretnego producenta.

    Pola:
        switchgear_family_ref: stabilny identyfikator (np.
            "ZPUE_WLOSZCZOWA__ROTOBLOK", "ABB__UNIGEAR_ZS1").
        manufacturer_ref: ref do `Manufacturer`.
        family_name: nazwa wyświetlana (np. "Rotoblok", "UniGear ZS1").
        series_name: krótszy kod serii (opcjonalny).
        network_voltages_kv: napięcia SIECI [kV], dla których karta producenta
            deklaruje wyrób (wiersz „napięcie nominalne sieci" / „napięcie
            robocze"). Pusta lista = karta takiego wiersza NIE ma; to jawny
            brak danych, nie „żadna sieć nie pasuje".
        um_classes_kv: klasy napięciowe URZĄDZENIA [kV] — wiersz „napięcie
            znamionowe (Ur)" albo „najwyższe napięcie urządzeń (Um)" karty.
            Um wyznacza górną granicę napięcia sieci, w której wolno pracować
            (PN-EN 62271-1). Pusta lista = jawny brak danych w karcie.
        rated_current_options: dopuszczone prądy znamionowe szyny [A].
        short_time_current_options: dopuszczone prądy zwarciowe [kA, 1s].
        insulation_type, construction_type, busbar_system: kanon §11A.2.
        allowed_bay_kinds: lista typów pól dopuszczonych w rodzinie
            (np. ["liniowe_dopływowe", "transformatorowe", "sprzęgłowe"]).
        status: `verified` tylko ze source_refs; `requires_catalog` gdy brak.
        source_refs: lista identyfikatorów źródeł.
    """

    switchgear_family_ref: str
    manufacturer_ref: str
    family_name: str
    series_name: str | None = None
    product_line_code: str | None = None
    network_voltages_kv: list[float] = Field(default_factory=list)
    um_classes_kv: list[float] = Field(default_factory=list)
    rated_current_options: list[int] = Field(default_factory=list)
    short_time_current_options: list[int] = Field(default_factory=list)
    insulation_type: InsulationType = "unknown"
    construction_type: ConstructionType = "unknown"
    busbar_system: BusbarSystem = "unknown"
    compartment_models: list[CompartmentModel] = Field(default_factory=list)
    allowed_bay_kinds: list[str] = Field(default_factory=list)
    allowed_apparatus_kinds: list[str] = Field(default_factory=list)
    allowed_interlocks: list[str] = Field(default_factory=list)
    supported_lod_profiles: list[str] = Field(default_factory=list)
    cad_footprint_ref: str | None = None
    source_document_refs: list[str] = Field(default_factory=list)
    source_version: str | None = None
    verified_at: str | None = None
    lifecycle_status: LifecycleStatus = "unknown"
    status: SwitchgearFamilyStatus = "requires_catalog"
    source_refs: list[str] = Field(default_factory=list)
    notes_pl: str | None = None
    #: Medium łączników rodziny (`MediumLacznikowRodziny`) — druga oś gazu fluorowanego obok
    #: `insulation_type`; każda rodzina rejestru deklaruje je jawnie (pin:
    #: `tests/network_model/catalog/test_gazy_fluorowane.py`).
    medium_lacznikow: MediumLacznikowRodziny | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def tor_konfiguracji(self) -> TorKonfiguracji | None:
        """Tor konfiguracji (MODULARNY / BLOK_RMU) wyprowadzony z konstrukcji.

        Pole WYLICZANE, nie przechowywane: rodzina ma jedno miejsce, w którym
        deklaruje konstrukcję (`construction_type`), a kreator i API czytają
        stąd tor pracy. Rodzina bez zadeklarowanej konstrukcji zwraca `None`
        (jawny brak) — walidator odmawia budowania na takiej rodzinie.
        """
        return tor_konfiguracji_dla_konstrukcji(self.construction_type)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def gaz_fluorowany(self) -> bool | None:
        """Czy rodzina wykorzystuje gaz fluorowany — WYPROWADZONE z izolacji i medium łączników.

        ``True`` — izolacja SF₆ albo łączniki w SF₆; ``False`` — izolacja i łączniki bez gazu
        fluorowanego (łączniki z katalogu aparatów: rozstrzyga aparat, nie rodzina);
        ``None`` — karta nie rozstrzyga którejś z osi (brak potwierdzenia ≠ brak gazu)."""
        if self.insulation_type == "sf6" or self.medium_lacznikow == "SF6":
            return True
        if self.insulation_type == "unknown" or self.medium_lacznikow is None:
            return None
        return False

    @computed_field  # type: ignore[prop-decorator]
    @property
    def powod_blokady_pl(self) -> str | None:
        """Powód, dla którego na rodzinie NIE wolno budować żadnej konfiguracji (status
        rodziny; ``None`` = wolno). Nie zależy od stanu obiektu — rodzina z gazem fluorowanym
        jest dopuszczona do pól istniejących (`powod_odmowy_dla_stanu`)."""
        if self.status not in STATUSY_DOPUSZCZONE_DO_BUDOWANIA:
            return POWODY_BLOKADY_RODZINY_PL.get(
                self.status, "status rodziny nie dopuszcza budowania konfiguracji"
            )
        return None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def dopuszczona_do_budowania(self) -> bool:
        """Czy na rodzinie wolno budować konfigurację (wyprowadzone z `powod_blokady_pl`)."""
        return self.powod_blokady_pl is None

    def powod_odmowy_dla_stanu(self, stan_obiektu: str | None) -> str | None:
        """Powód odmowy rodziny dla pola o danym stanie (``None`` = wolno): status rodziny,
        potem zakaz gazu fluorowanego (`gazy_fluorowane.odmowa_gazu_fluorowanego_pl` — jedna
        reguła z aparatami i walidatorem modelu)."""
        return self.powod_blokady_pl or odmowa_gazu_fluorowanego_pl(
            f"Rodzina {self.family_name}",
            gaz_fluorowany=self.gaz_fluorowany,
            stan_obiektu=stan_obiektu,
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def powod_blokady_nowych_pol_pl(self) -> str | None:
        """Powód odmowy rodziny dla pola PROJEKTOWANEGO — filtr pickera nowych pól z backendu."""
        return self.powod_odmowy_dla_stanu("PROJEKTOWANY")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def dopuszczona_do_nowych_pol(self) -> bool:
        """Czy rodzinę wolno przypisać polu projektowanemu."""
        return self.powod_blokady_nowych_pol_pl is None
