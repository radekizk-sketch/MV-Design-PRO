from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any


class VoltageProfileStatus(StrEnum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"
    NOT_COMPUTED = "NOT_COMPUTED"


@dataclass(frozen=True)
class VoltageProfileRow:
    bus_id: str
    bus_name: str | None
    u_nom_kv: float | None
    u_kv: float | None
    u_pu: float | None
    delta_pct: float | None
    status: VoltageProfileStatus
    p_mw: float | None
    q_mvar: float | None
    case_name: str | None
    run_timestamp: datetime | None


@dataclass(frozen=True)
class VoltageProfileSummary:
    worst_bus_id: str | None
    worst_delta_pct_abs: float | None
    pass_count: int
    warning_count: int
    fail_count: int
    not_computed_count: int


@dataclass(frozen=True)
class VoltageProfileContext:
    project_name: str | None
    case_name: str | None
    run_timestamp: datetime | None
    snapshot_id: str | None
    trace_id: str | None
    #: Identyfikator PRZEBIEGU (V12K-269). Osobne pole, bo `trace_id` jest
    #: identyfikatorem ARTEFAKTU dowodowego — dwa rozne pojecia nie moga
    #: dzielic jednej nazwy. NIE wchodzi do odcisku analizy.
    run_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_id": self.snapshot_id,
            "trace_id": self.trace_id,
            "run_id": self.run_id,
        }


@dataclass(frozen=True)
class VoltageProfileView:
    context: VoltageProfileContext | None
    thresholds: dict[str, float]
    rows: tuple[VoltageProfileRow, ...]
    summary: VoltageProfileSummary

    def to_dict(self) -> dict[str, Any]:
        from analysis.voltage_profile.serializer import view_to_dict

        return view_to_dict(self)
