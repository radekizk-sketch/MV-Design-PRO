from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any


class ProtectionSelectivityStatus(StrEnum):
    OK = "OK"
    NOT_SELECTIVE = "NOT_SELECTIVE"
    NOT_EVALUATED = "NOT_EVALUATED"


@dataclass(frozen=True)
class ProtectionInsightContext:
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
class ProtectionInsightItem:
    rule_id: str
    primary_device_id: str
    backup_device_id: str | None
    ikss_ka: float | None
    ip_ka: float | None
    ith_ka2s: float | None
    icu_ka: float | None
    idyn_ka: float | None
    ith_limit_ka2s: float | None
    breaking_margin_pct: float | None
    dynamic_margin_pct: float | None
    thermal_margin_pct: float | None
    selectivity_status: ProtectionSelectivityStatus
    why_pl: str


@dataclass(frozen=True)
class ProtectionInsightSummary:
    count_ok: int
    count_warning: int
    count_fail: int
    count_not_evaluated: int


@dataclass(frozen=True)
class ProtectionInsightView:
    context: ProtectionInsightContext | None
    items: tuple[ProtectionInsightItem, ...]
    summary: ProtectionInsightSummary

    def to_dict(self) -> dict[str, Any]:
        from analysis.protection_insight.serializer import view_to_dict

        return view_to_dict(self)
