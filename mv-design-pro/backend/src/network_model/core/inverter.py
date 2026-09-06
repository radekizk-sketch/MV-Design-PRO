"""
Definicje źródeł falownikowych (OZE) dla obliczeń zwarciowych IEC 60909.
"""

import uuid
from dataclasses import dataclass, field
from typing import Literal

from network_model.catalog.types import ConverterKind
from network_model.ir_fields import wymagany_float


@dataclass
class InverterSource:
    """
    Źródło falownikowe modelowane jako ograniczone źródło prądowe IEC 60909.

    Model uproszczony: wkład tylko jako prąd RMS w punkcie zwarcia,
    bez modelowania impedancji wewnętrznej.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = field(default="")
    node_id: str = field(default="")
    type_ref: str | None = field(default=None)
    converter_kind: ConverterKind | None = field(default=None)
    in_rated_a: float = field(default=0.0)
    k_sc: float = field(default=1.1)
    # Proweniencja k_sc (karta FAB-H): "KATALOG" — wartość z karty producenta
    # konwertera (ConverterType.k_sc/PVInverterType.k_sc/BESSInverterType.k_sc);
    # "ZALOZENIE" — karta nie niesie k_sc, przyjęto domyślne IEC 1,1
    # (enm/mapping.py rejestruje to ZAŁOŻENIE w śladzie WHITE BOX i w gotowości,
    # patrz `inverter.k_sc_assumed`). Solver CZYTA WYŁĄCZNIE `k_sc` — to pole
    # jest metadaną proweniencji, nie wejściem fizyki.
    k_sc_zrodlo: Literal["KATALOG", "ZALOZENIE"] = field(default="ZALOZENIE")
    contributes_negative_sequence: bool = field(default=False)
    contributes_zero_sequence: bool = field(default=False)
    in_service: bool = field(default=True)

    @property
    def ik_sc_a(self) -> float:
        """
        Zwraca RMS wkład prądowy do zwarcia: Ik = k_sc * In.
        """
        return self.k_sc * self.in_rated_a

    def to_dict(self) -> dict:
        """
        Serializes inverter source to a dictionary.
        """
        return {
            "id": self.id,
            "name": self.name,
            "node_id": self.node_id,
            "type_ref": self.type_ref,
            "converter_kind": self.converter_kind.value if self.converter_kind else None,
            "in_rated_a": self.in_rated_a,
            "k_sc": self.k_sc,
            "k_sc_zrodlo": self.k_sc_zrodlo,
            "contributes_negative_sequence": self.contributes_negative_sequence,
            "contributes_zero_sequence": self.contributes_zero_sequence,
            "in_service": self.in_service,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "InverterSource":
        """
        Deserializes inverter source from a dictionary.
        """
        return cls(
            id=str(data.get("id", str(uuid.uuid4()))),
            name=str(data.get("name", "")),
            node_id=str(data.get("node_id", "")),
            type_ref=data.get("type_ref"),
            converter_kind=(
                ConverterKind(str(data.get("converter_kind")).upper())
                if data.get("converter_kind") is not None
                else None
            ),
            in_rated_a=wymagany_float(data, "in_rated_a", context="InverterSource"),
            k_sc=wymagany_float(data, "k_sc", context="InverterSource"),
            # Proweniencja jest metadaną (nie wejściem fizyki solvera): snapshoty
            # zapisane przed karta FAB-H nie niosą tego klucza. Brak => "ZALOZENIE",
            # co jest ZGODNE z ówczesną rzeczywistością (katalog nigdy nie niósł
            # k_sc przed tą kartą, więc każde takie źródło było założeniem).
            k_sc_zrodlo=(
                data["k_sc_zrodlo"]
                if data.get("k_sc_zrodlo") in ("KATALOG", "ZALOZENIE")
                else "ZALOZENIE"
            ),
            contributes_negative_sequence=bool(data.get("contributes_negative_sequence", False)),
            contributes_zero_sequence=bool(data.get("contributes_zero_sequence", False)),
            in_service=bool(data.get("in_service", True)),
        )
