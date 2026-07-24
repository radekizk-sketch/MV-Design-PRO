from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from analysis.normative.models import NormativeStatus


class ITCurveRole(StrEnum):
    PRIMARY = "PRIMARY"
    BACKUP = "BACKUP"


class ITCurveType(StrEnum):
    INVERSE = "INVERSE"
    DEFINITE = "DEFINITE"
    INSTANTANEOUS = "INSTANTANEOUS"
    UNKNOWN = "UNKNOWN"


class ITCurveSource(StrEnum):
    CATALOG = "CATALOG"
    USER = "USER"
    UNKNOWN = "UNKNOWN"


class ITMarkerKind(StrEnum):
    IKSS = "IKSS"
    IP = "IP"
    ITH = "ITH"


@dataclass(frozen=True)
class ITCurvePoint:
    i_a: float
    t_s: float


@dataclass(frozen=True)
class ITCurveSeries:
    series_id: str
    device_id: str
    role: ITCurveRole
    curve_type: ITCurveType
    points: tuple[ITCurvePoint, ...]
    source: ITCurveSource


@dataclass(frozen=True)
class ITMarker:
    kind: ITMarkerKind
    i_a: float
    t_s: float | None
    source_proof_id: str


@dataclass(frozen=True)
class ProtectionCurvesITContext:
    project_name: str | None
    case_name: str | None
    run_timestamp: datetime | None
    snapshot_id: str | None
    trace_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_id": self.snapshot_id,
            "trace_id": self.trace_id,
        }


@dataclass(frozen=True)
class ProtectionCurvesITView:
    context: ProtectionCurvesITContext | None
    bus_id: str
    primary_device_id: str
    backup_device_id: str | None
    series: tuple[ITCurveSeries, ...]
    markers: tuple[ITMarker, ...]
    normative_status: NormativeStatus
    margins_pct: dict[str, float]
    why_pl: str
    missing_data: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        from analysis.protection_curves_it.serializer import view_to_dict

        return view_to_dict(self)
