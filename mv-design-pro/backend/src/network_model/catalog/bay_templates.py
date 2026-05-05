"""
BayTemplate — kanoniczne szablony pól rozdzielczych SN (PR-3 rebuild SLD).

Każdy szablon definiuje:
- kanoniczną sekwencję aparatury (Q-szynowy → CB → Q-liniowy → CT → ES → głowica),
- listę portów technicznych (Port) wymaganych dla pola,
- bay_role mapping na PortKind.

Brief 2 §6/9 + plan rebuild §3 + STATION_INTERNAL_SLD.md.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class BayDeviceTemplate(BaseModel):
    """Szablon aparatu w polu — kanoniczna pozycja i typ."""

    kind: Literal[
        "CB",  # wyłącznik
        "DS_BUS",  # odłącznik szynowy
        "DS_LINE",  # odłącznik liniowy
        "ES",  # uziemnik (boczny)
        "CT",  # przekładnik prądowy (w osi)
        "VT",  # przekładnik napięciowy (boczny)
        "FUSE",
        "SURGE_ARRESTER",  # ogranicznik przepięć
        "CABLE_HEAD",  # głowica kablowa (trójkąt)
        "TRANSFORMER_DEVICE",  # transformator pola
    ]
    designation_q: str  # oznaczenie Q (Q1, Q2, ...)
    position: int  # 0..n od góry do dołu
    placement: Literal[
        "UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "OFF_PATH", "GROUND_BRANCH"
    ]
    optional: bool = False


class BayPortTemplate(BaseModel):
    """Szablon portu pola — wnioskowany z roli."""

    kind: Literal[
        "sn_input",
        "sn_output",
        "sn_branch",
        "sn_transformer",
        "sn_measurement",
        "sn_der_pv",
        "sn_der_bess",
        "sn_der_fw",
        "sn_coupler",
        "sn_reserve",
        "nn_feeder",
        "nn_load",
        "nn_der_pv",
        "nn_der_bess",
        "nn_der_fw",
    ]
    suffix: str  # sufiks dla port_id (np. "in", "out", "trafo")


class BayTemplate(BaseModel):
    """Kanoniczny szablon pola SN (PR-3 rebuild SLD).

    Reużywany przez Builder przy tworzeniu nowego pola w stacji / GPZ.
    """

    template_id: str
    name: str  # PL: "Pole liniowe wejściowe", "Pole transformatorowe", ...
    bay_role: Literal[
        "IN", "OUT", "TR", "COUPLER", "FEEDER", "MEASUREMENT", "OZE"
    ]
    description: str
    devices: list[BayDeviceTemplate] = Field(default_factory=list)
    ports: list[BayPortTemplate] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Kanoniczne 10 szablonów BayTemplate (brief 2 §3 + STATION_INTERNAL_SLD §3)
# ---------------------------------------------------------------------------

BAY_TEMPLATE_LINE_IN = BayTemplate(
    template_id="bay_template_line_in",
    name="Pole liniowe wejściowe",
    bay_role="IN",
    description="Pole liniowe wejściowe SN — kabel/linia od ciągu nadrzędnego.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q2", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(kind="CABLE_HEAD", designation_q="GK", position=5, placement="DOWNSTREAM"),
    ],
    ports=[BayPortTemplate(kind="sn_input", suffix="in")],
)

BAY_TEMPLATE_LINE_OUT = BayTemplate(
    template_id="bay_template_line_out",
    name="Pole liniowe wyjściowe",
    bay_role="OUT",
    description="Pole liniowe wyjściowe SN — kabel/linia do ciągu podrzędnego.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q2", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(kind="CABLE_HEAD", designation_q="GK", position=5, placement="DOWNSTREAM"),
    ],
    ports=[BayPortTemplate(kind="sn_output", suffix="out")],
)

BAY_TEMPLATE_TRANSFORMER = BayTemplate(
    template_id="bay_template_transformer",
    name="Pole transformatorowe",
    bay_role="TR",
    description="Pole transformatorowe SN — przyłączenie transformatora SN/nN.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q2", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(kind="TRANSFORMER_DEVICE", designation_q="TR", position=5, placement="DOWNSTREAM"),
    ],
    ports=[BayPortTemplate(kind="sn_transformer", suffix="trafo")],
)

BAY_TEMPLATE_MEASUREMENT = BayTemplate(
    template_id="bay_template_measurement",
    name="Pole pomiarowe",
    bay_role="MEASUREMENT",
    description="Pole pomiarowe SN — boczny tor pomiarowy z przekładnikami napięciowymi.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="VT", designation_q="T2", position=1, placement="OFF_PATH"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=2, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_measurement", suffix="meas")],
)

BAY_TEMPLATE_COUPLER = BayTemplate(
    template_id="bay_template_coupler",
    name="Pole sprzęgłowe",
    bay_role="COUPLER",
    description="Sprzęgło sekcyjne — łącznik dwóch sekcji szyny SN.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q2", position=2, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=3, placement="GROUND_BRANCH"),
    ],
    ports=[
        BayPortTemplate(kind="sn_coupler", suffix="left"),
        BayPortTemplate(kind="sn_coupler", suffix="right"),
    ],
)

BAY_TEMPLATE_DER_PV = BayTemplate(
    template_id="bay_template_der_pv",
    name="Pole źródłowe PV",
    bay_role="OZE",
    description="Pole źródłowe SN dla farmy PV — przyłączenie inwerterów + transformatora.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="VT", designation_q="T2", position=3, placement="OFF_PATH"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q2", position=4, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=5, placement="GROUND_BRANCH"),
        BayDeviceTemplate(kind="CABLE_HEAD", designation_q="GK", position=6, placement="DOWNSTREAM"),
    ],
    ports=[BayPortTemplate(kind="sn_der_pv", suffix="pv")],
)

BAY_TEMPLATE_DER_BESS = BayTemplate(
    template_id="bay_template_der_bess",
    name="Pole źródłowe BESS",
    bay_role="OZE",
    description="Pole źródłowe SN dla magazynu energii BESS — PCS + transformator.",
    devices=BAY_TEMPLATE_DER_PV.devices.copy(),
    ports=[BayPortTemplate(kind="sn_der_bess", suffix="bess")],
)

BAY_TEMPLATE_DER_FW = BayTemplate(
    template_id="bay_template_der_fw",
    name="Pole źródłowe FW",
    bay_role="OZE",
    description="Pole źródłowe SN dla farmy wiatrowej — kable kolektorowe + transformator główny.",
    devices=BAY_TEMPLATE_DER_PV.devices.copy(),
    ports=[BayPortTemplate(kind="sn_der_fw", suffix="fw")],
)

BAY_TEMPLATE_RESERVE = BayTemplate(
    template_id="bay_template_reserve",
    name="Pole rezerwowe",
    bay_role="FEEDER",
    description="Pole rezerwowe — przygotowane miejsce dla przyszłego przyłączenia.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=1, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_reserve", suffix="reserve")],
)

BAY_TEMPLATE_AUX = BayTemplate(
    template_id="bay_template_aux",
    name="Pole potrzeb własnych",
    bay_role="FEEDER",
    description="Pole potrzeb własnych stacji — zasilanie urządzeń pomocniczych.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="FUSE", designation_q="F1", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=2, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_reserve", suffix="aux")],
)


BAY_TEMPLATE_REGISTRY: dict[str, BayTemplate] = {
    t.template_id: t
    for t in [
        BAY_TEMPLATE_LINE_IN,
        BAY_TEMPLATE_LINE_OUT,
        BAY_TEMPLATE_TRANSFORMER,
        BAY_TEMPLATE_MEASUREMENT,
        BAY_TEMPLATE_COUPLER,
        BAY_TEMPLATE_DER_PV,
        BAY_TEMPLATE_DER_BESS,
        BAY_TEMPLATE_DER_FW,
        BAY_TEMPLATE_RESERVE,
        BAY_TEMPLATE_AUX,
    ]
}


def get_bay_template(template_id: str) -> BayTemplate:
    """Pobiera kanoniczny szablon pola po ID. Raises KeyError if not found."""

    if template_id not in BAY_TEMPLATE_REGISTRY:
        available = ", ".join(sorted(BAY_TEMPLATE_REGISTRY.keys()))
        raise KeyError(
            f"Unknown bay_template_id: {template_id}. Available: {available}"
        )
    return BAY_TEMPLATE_REGISTRY[template_id]


def list_bay_templates() -> list[BayTemplate]:
    """Lista wszystkich kanonicznych szablonów pola (deterministyczna kolejność)."""

    return sorted(BAY_TEMPLATE_REGISTRY.values(), key=lambda t: t.template_id)
