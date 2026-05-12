"""BayDeviceInstanceTemplate — pojedynczy aparat w szablonie pola SN (§11A.2).

Szablon pola (`CompleteMvBayTemplate`) zawiera listę aparatów w określonej
kolejności (`device_order`). Każdy aparat ma rolę, dopuszczalne stany,
zależności od katalogu i (opcjonalnie) zależność od zabezpieczenia/pomiaru.

Reguła architektoniczna: aparaty kanoniczne mają stałe oznaczenia
(wyłącznik=kwadrat, rozłącznik=romb, odłącznik=kółko, uziemnik=boczny,
bezpiecznik=pionowy, CT/VT, transformator). Producent może mieć swoje
warianty tych symboli (np. ZPUE Rotoblok ma uziemnik z innym anchorem niż
ABB UniGear) — wtedy `symbol_ref` wskazuje konkretny katalog wizualny.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ApparatusKind = Literal[
    "circuit_breaker",
    "switch_disconnector",
    "disconnector_busbar",
    "disconnector_line",
    "earthing_switch",
    "fuse_set",
    "current_transformer",
    "voltage_transformer",
    "surge_arrester",
    "cable_head",
    "busbar",
    "bus_coupler",
    "voltage_indicator",
    "protection_relay",
    "meter",
    "transformer",
    "lv_breaker",
    "interlock",
]

ElectricalSide = Literal[
    "busbar_side",
    "line_side",
    "transformer_side",
    "metering_branch",
    "earthing_branch",
    "lv_side",
]


class BayDeviceInstanceTemplate(BaseModel):
    """Aparat w szablonie pola SN producenta.

    Pola:
        device_template_ref: stabilny identyfikator (np.
            "ZPUE__ROTOBLOK__LINE_OUT__CB__001").
        apparatus_kind: kanon §11A.2 (circuit_breaker, switch_disconnector ...).
        label: oznaczenie operatorskie (np. "Q1", "Q2", "Q9 (E)").
        symbol_ref: ref do katalogu wizualnego — None gdy używa kanonicznego
            symbolu (`wyłącznik=kwadrat`, `rozłącznik=romb` ...).
        default_state: domyślny stan po wstawieniu pola.
        allowed_states: lista dopuszczonych stanów wg §11A.8.
        position_in_bay: 1-based pozycja w kolumnie pola (góra→dół).
        anchor_refs: lista anchor pointów dla połączeń (`top`, `bottom`,
            `side`, `earth`).
        electrical_side: po której stronie pola się znajduje (szynowa /
            liniowa / transformatorowa / pomiarowa / uziemiająca / nN).
        is_required: True gdy aparat jest obowiązkowy w polu (np. CB w polu
            transformatorowym).
        is_optional: True gdy aparat jest opcjonalny (np. dodatkowy CT
            pomiarowy).
        catalog_ref_required: True gdy operator MUSI wskazać konkretną pozycję
            katalogową (np. CB konkretnego producenta z parametrami).
        protection_dependency: ref do `protection_requirements` w szablonie
            pola (np. CB pola transformatorowego wymaga zabezpieczenia 50/51).
        measurement_dependency: ref do `measurement_requirements` (np. CT
            wymaga pomiaru prądu).
        notes_pl: dodatkowe wyjaśnienie po polsku.
    """

    device_template_ref: str
    apparatus_kind: ApparatusKind
    label: str
    symbol_ref: str | None = None
    default_state: str | None = None
    allowed_states: list[str] = Field(default_factory=list)
    position_in_bay: int = 1
    anchor_refs: list[str] = Field(default_factory=list)
    electrical_side: ElectricalSide = "line_side"
    is_required: bool = False
    is_optional: bool = False
    catalog_ref_required: bool = True
    protection_dependency: str | None = None
    measurement_dependency: str | None = None
    notes_pl: str | None = None
