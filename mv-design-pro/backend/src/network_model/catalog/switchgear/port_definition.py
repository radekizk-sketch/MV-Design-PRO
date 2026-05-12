"""PortDefinitionTemplate — port w szablonie pola SN (§11A.2).

Port to logiczne miejsce przyłączenia w polu producenta — przez port łączy
się odcinek, transformator, DER albo kabel głowicowy. Szablon pola określa
typy portów, ich poziom napięciowy, dopuszczone połączenia i wizualny anchor.

Reguła architektoniczna: każde połączenie w SLD MUSI kończyć się w
kompatybilnym porcie zgodnie z non-negotiable #3 goal. Port o `port_kind` =
`transformer_sn_port` może przyjmować tylko transformator SN/nN.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PortKind = Literal[
    "busbar_port",
    "line_port",
    "cable_port",
    "transformer_sn_port",
    "transformer_nn_port",
    "metering_port",
    "der_pcc_port",
    "earthing_port",
    "coupler_port",
]

DirectionHint = Literal["input", "output", "bidirectional", "side"]


class PortDefinitionTemplate(BaseModel):
    """Port w szablonie pola SN producenta.

    Pola:
        port_template_ref: stabilny identyfikator (np.
            "ZPUE__ROTOBLOK__LINE_OUT__PORT__LINE").
        port_kind: kanon §11A.2 typów portów.
        voltage_level_ref: ref do poziomu napięciowego (np. "BUS_15KV_S1").
        visual_anchor: kierunek anchor punktu wizualnego ("top", "bottom",
            "left", "right" lub konkretne offsety dla CAD).
        compatible_connection_kinds: lista typów elementów które wolno
            przyłączyć (np. ["cable_sn", "overhead_line_sn"]).
        occupancy_rules: reguły zajmowania portu — `single` (jedno
            połączenie), `multi` (np. busbar może mieć wiele pól),
            `none` (port informacyjny).
        direction_hint: kierunek operacyjny (wejście / wyjście / boczny /
            dwukierunkowy).
        lod_visibility: lista LOD-ów w których port jest widoczny
            (np. ["LOD3", "LOD4"] — przy LOD0/1 nie pokazujemy portów).
        notes_pl: dodatkowe wyjaśnienie.
    """

    port_template_ref: str
    port_kind: PortKind
    voltage_level_ref: str | None = None
    visual_anchor: str = "bottom"
    compatible_connection_kinds: list[str] = Field(default_factory=list)
    occupancy_rules: Literal["single", "multi", "none"] = "single"
    direction_hint: DirectionHint = "output"
    lod_visibility: list[str] = Field(default_factory=lambda: ["LOD3", "LOD4", "LOD5"])
    notes_pl: str | None = None
