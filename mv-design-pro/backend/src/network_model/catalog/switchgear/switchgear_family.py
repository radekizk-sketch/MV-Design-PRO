"""SwitchgearFamily — rodzina rozdzielnicy SN producenta.

Goal §11A.2: rodzina to konkretna seria produktów producenta (np. "Rotoblok",
"Safevap", "UniGear ZS1", "8DJH"). Każda ma:
- konstrukcję (RMU / jednoczłonowa / wysuwna / GIS SF6 / kontenerowa),
- układ szyn (single / sectionalized / double / ring main),
- klasę izolacji (air / SF6 / vacuum / mixed),
- listę dopuszczonych napięć i prądów,
- listę dopuszczonych typów pól (`allowed_bay_kinds`).

Reguła: rodzina jest pełnoprawna TYLKO gdy producent ma `status='verified'`
i podpięte oficjalne `source_refs`. Inaczej rodzina jest `requires_catalog`.
"""

from __future__ import annotations

from typing import Literal, get_args

from pydantic import BaseModel, Field, computed_field

InsulationType = Literal["air", "sf6", "vacuum", "mixed", "unknown"]
ConstructionType = Literal[
    "RMU",
    "jednoczlonowa",
    "dwuczlonowa",
    "wysuwna",
    "GIS_SF6",
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
    "GIS_SF6": "MODULARNY",
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
        voltage_levels: dopuszczone napięcia znamionowe [kV].
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
    voltage_levels: list[float] = Field(default_factory=list)
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
