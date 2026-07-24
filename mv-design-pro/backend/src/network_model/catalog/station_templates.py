"""
StationTemplate — kanoniczne szablony stacji SN/nN (PR-3 rebuild SLD).

9 szablonów stacji z briefa 2 §3 + STATION_INTERNAL_SLD §3.

Każdy szablon definiuje:
- typ topologiczny (końcowa/przelotowa/odgałęźna/sekcyjna),
- listę pól SN do utworzenia (z BayTemplate),
- konfigurację transformatora SN/nN (jeśli dotyczy),
- poziomy nN (multi-voltage support, brief §13).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class StationTemplateBay(BaseModel):
    """Element szablonu stacji — pole SN do utworzenia z BayTemplate."""

    bay_template_id: str  # ref do BayTemplate w bay_templates.py
    designation: str  # oznaczenie pola w stacji (np. "Pole 1", "F01", "LS")
    order: int


class StationTemplateTransformer(BaseModel):
    """Element szablonu stacji — transformator SN/nN."""

    designation: str  # "TR1", "TR2"
    nominal_power_kva: float | None = None  # opcjonalne, użytkownik wypełni
    lv_voltage_kv: float = 0.4  # domyślnie 0,4 kV (multi-voltage support)


class StationTemplateNnSwitchgear(BaseModel):
    """Element szablonu stacji — rozdzielnica nN."""

    designation: str  # "RnN-1"
    nn_voltage_kv: float = 0.4
    feeders_count: int = 4  # liczba odpływów nN (default)


class StationTemplate(BaseModel):
    """Kanoniczny szablon stacji SN/nN (PR-3 rebuild SLD).

    Reużywany przy wstawianiu stacji na ciągu (Scenariusz D briefa).
    """

    template_id: str
    name: str  # PL: "Stacja końcowa", "Stacja przelotowa", ...
    topological_type: Literal["końcowa", "przelotowa", "odgałęźna", "sekcyjna"]
    description: str
    bays: list[StationTemplateBay] = Field(default_factory=list)
    transformers: list[StationTemplateTransformer] = Field(default_factory=list)
    nn_switchgears: list[StationTemplateNnSwitchgear] = Field(default_factory=list)
    construction_type_default: (
        Literal["wnetrzowa", "kontenerowa", "slupowa", "prefabrykowana", "inna"] | None
    ) = None


# ---------------------------------------------------------------------------
# 9 kanonicznych szablonów stacji
# ---------------------------------------------------------------------------

STATION_TEMPLATE_TERMINAL = StationTemplate(
    template_id="station_template_terminal",
    name="Stacja końcowa",
    topological_type="końcowa",
    description="Stacja kończąca ciąg — 1 wejście SN, 1 transformator SN/nN, rozdzielnica nN.",
    bays=[
        StationTemplateBay(bay_template_id="bay_template_line_in", designation="Pole 1", order=0),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR", order=1
        ),
    ],
    transformers=[StationTemplateTransformer(designation="TR1", lv_voltage_kv=0.4)],
    nn_switchgears=[StationTemplateNnSwitchgear(designation="RnN-1", nn_voltage_kv=0.4)],
    construction_type_default="kontenerowa",
)

STATION_TEMPLATE_INLINE = StationTemplate(
    template_id="station_template_inline",
    name="Stacja przelotowa",
    topological_type="przelotowa",
    description="Stacja na ciągu — 1 wejście + 1 wyjście SN, transformator + rozdzielnica nN.",
    bays=[
        StationTemplateBay(bay_template_id="bay_template_line_in", designation="Pole 1", order=0),
        StationTemplateBay(bay_template_id="bay_template_line_out", designation="Pole 2", order=1),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR", order=2
        ),
    ],
    transformers=[StationTemplateTransformer(designation="TR1", lv_voltage_kv=0.4)],
    nn_switchgears=[StationTemplateNnSwitchgear(designation="RnN-1", nn_voltage_kv=0.4)],
    construction_type_default="kontenerowa",
)

STATION_TEMPLATE_BRANCH = StationTemplate(
    template_id="station_template_branch",
    name="Stacja odgałęźna",
    topological_type="odgałęźna",
    description="Stacja z odgałęzieniem — wejście + wyjście + odgałęzienie + transformator.",
    bays=[
        StationTemplateBay(bay_template_id="bay_template_line_in", designation="Pole 1", order=0),
        StationTemplateBay(bay_template_id="bay_template_line_out", designation="Pole 2", order=1),
        StationTemplateBay(
            bay_template_id="bay_template_line_out", designation="Pole 3 (odgałęzienie)", order=2
        ),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR", order=3
        ),
    ],
    transformers=[StationTemplateTransformer(designation="TR1", lv_voltage_kv=0.4)],
    nn_switchgears=[StationTemplateNnSwitchgear(designation="RnN-1", nn_voltage_kv=0.4)],
    construction_type_default="kontenerowa",
)

STATION_TEMPLATE_SECTIONAL = StationTemplate(
    template_id="station_template_sectional",
    name="Stacja sekcyjna",
    topological_type="sekcyjna",
    description="Stacja sekcyjna — 2 wejścia SN + sprzęgło/NOP, opcjonalnie transformator.",
    bays=[
        StationTemplateBay(
            bay_template_id="bay_template_line_in", designation="Pole 1 (sekcja A)", order=0
        ),
        StationTemplateBay(bay_template_id="bay_template_coupler", designation="Sprzęgło", order=1),
        StationTemplateBay(
            bay_template_id="bay_template_line_in", designation="Pole 2 (sekcja B)", order=2
        ),
    ],
    transformers=[],
    nn_switchgears=[],
    construction_type_default="kontenerowa",
)

STATION_TEMPLATE_PV = StationTemplate(
    template_id="station_template_pv",
    name="Stacja z PV",
    topological_type="końcowa",
    description="Stacja przyłączeniowa farmy PV — pole DER PV + transformator blokowy.",
    bays=[
        StationTemplateBay(
            bay_template_id="bay_template_line_in", designation="Pole 1 (przyłączeniowe)", order=0
        ),
        StationTemplateBay(bay_template_id="bay_template_der_pv", designation="Pole PV", order=1),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR-blok", order=2
        ),
    ],
    transformers=[StationTemplateTransformer(designation="TR-blok-PV", lv_voltage_kv=0.4)],
    nn_switchgears=[StationTemplateNnSwitchgear(designation="RnN-PV", nn_voltage_kv=0.4)],
    construction_type_default="prefabrykowana",
)

STATION_TEMPLATE_BESS = StationTemplate(
    template_id="station_template_bess",
    name="Stacja z BESS",
    topological_type="końcowa",
    description="Stacja przyłączeniowa magazynu BESS — pole DER BESS + transformator blokowy.",
    bays=[
        StationTemplateBay(
            bay_template_id="bay_template_line_in", designation="Pole 1 (przyłączeniowe)", order=0
        ),
        StationTemplateBay(
            bay_template_id="bay_template_der_bess", designation="Pole BESS", order=1
        ),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR-blok", order=2
        ),
    ],
    transformers=[StationTemplateTransformer(designation="TR-blok-BESS", lv_voltage_kv=0.4)],
    nn_switchgears=[StationTemplateNnSwitchgear(designation="RnN-BESS", nn_voltage_kv=0.4)],
    construction_type_default="prefabrykowana",
)

STATION_TEMPLATE_FW = StationTemplate(
    template_id="station_template_fw",
    name="Stacja z FW (farma wiatrowa)",
    topological_type="końcowa",
    description="Stacja przyłączeniowa farmy wiatrowej — pole DER FW + transformator główny + sieć kolektorowa.",
    bays=[
        StationTemplateBay(
            bay_template_id="bay_template_line_in", designation="Pole 1 (przyłączeniowe)", order=0
        ),
        StationTemplateBay(bay_template_id="bay_template_der_fw", designation="Pole FW", order=1),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR-głowny", order=2
        ),
        StationTemplateBay(
            bay_template_id="bay_template_measurement", designation="Pole pomiarowe", order=3
        ),
    ],
    transformers=[StationTemplateTransformer(designation="TR-glowny-FW", lv_voltage_kv=0.69)],
    nn_switchgears=[StationTemplateNnSwitchgear(designation="RnN-Aux-FW", nn_voltage_kv=0.4)],
    construction_type_default="kontenerowa",
)

STATION_TEMPLATE_CONSUMER = StationTemplate(
    template_id="station_template_consumer",
    name="Stacja odbiorcza",
    topological_type="końcowa",
    description="Stacja odbiorcza SN/nN — wejście + transformator + duża rozdzielnica nN.",
    bays=[
        StationTemplateBay(bay_template_id="bay_template_line_in", designation="Pole 1", order=0),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR", order=1
        ),
    ],
    transformers=[
        StationTemplateTransformer(designation="TR1", nominal_power_kva=630.0, lv_voltage_kv=0.4)
    ],
    nn_switchgears=[
        StationTemplateNnSwitchgear(designation="RnN-1", nn_voltage_kv=0.4, feeders_count=12)
    ],
    construction_type_default="wnetrzowa",
)

STATION_TEMPLATE_INDUSTRIAL_CUSTOM_NN = StationTemplate(
    template_id="station_template_industrial_custom_nn",
    name="Stacja przemysłowa (nN niestandardowe)",
    topological_type="przelotowa",
    description="Stacja przemysłowa — wielouzwojeniowy transformator + wiele szyn nN (np. 6 kV + 0,69 kV + 0,4 kV).",
    bays=[
        StationTemplateBay(bay_template_id="bay_template_line_in", designation="Pole 1", order=0),
        StationTemplateBay(bay_template_id="bay_template_line_out", designation="Pole 2", order=1),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR1", order=2
        ),
        StationTemplateBay(
            bay_template_id="bay_template_transformer", designation="Pole TR2", order=3
        ),
        StationTemplateBay(
            bay_template_id="bay_template_aux", designation="Pole potrzeb własnych", order=4
        ),
    ],
    transformers=[
        StationTemplateTransformer(designation="TR1", lv_voltage_kv=6.0),
        StationTemplateTransformer(designation="TR2", lv_voltage_kv=0.4),
    ],
    nn_switchgears=[
        StationTemplateNnSwitchgear(designation="RnN-6kV", nn_voltage_kv=6.0, feeders_count=8),
        StationTemplateNnSwitchgear(designation="RnN-0.4kV", nn_voltage_kv=0.4, feeders_count=12),
    ],
    construction_type_default="wnetrzowa",
)


STATION_TEMPLATE_REGISTRY: dict[str, StationTemplate] = {
    t.template_id: t
    for t in [
        STATION_TEMPLATE_TERMINAL,
        STATION_TEMPLATE_INLINE,
        STATION_TEMPLATE_BRANCH,
        STATION_TEMPLATE_SECTIONAL,
        STATION_TEMPLATE_PV,
        STATION_TEMPLATE_BESS,
        STATION_TEMPLATE_FW,
        STATION_TEMPLATE_CONSUMER,
        STATION_TEMPLATE_INDUSTRIAL_CUSTOM_NN,
    ]
}


def get_station_template(template_id: str) -> StationTemplate:
    """Pobiera kanoniczny szablon stacji po ID. Raises KeyError if not found."""

    if template_id not in STATION_TEMPLATE_REGISTRY:
        available = ", ".join(sorted(STATION_TEMPLATE_REGISTRY.keys()))
        raise KeyError(f"Unknown station_template_id: {template_id}. Available: {available}")
    return STATION_TEMPLATE_REGISTRY[template_id]


def list_station_templates() -> list[StationTemplate]:
    """Lista wszystkich kanonicznych szablonów stacji (deterministyczna kolejność)."""

    return sorted(STATION_TEMPLATE_REGISTRY.values(), key=lambda t: t.template_id)
