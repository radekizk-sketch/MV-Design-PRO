from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.kanon_json import canonicalize_json


@dataclass(frozen=True)
class ProtectionInput:
    case_id: str | None
    base_snapshot_id: str | None
    connection_node: dict[str, Any]  # BoundaryNode – węzeł przyłączenia
    fault_levels: dict[str, Any]
    topology_ref: dict[str, Any] | None
    source_run_id: str

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "case_id": self.case_id,
            "base_snapshot_id": self.base_snapshot_id,
            "connection_node": self.connection_node,
            "fault_levels": self.fault_levels,
            "topology_ref": self.topology_ref,
            "source_run_id": self.source_run_id,
        }
        return canonicalize_json(payload)
