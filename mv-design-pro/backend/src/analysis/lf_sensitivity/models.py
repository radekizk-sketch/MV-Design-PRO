from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class LFSensitivityContext:
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
class LFSensitivityDriver:
    bus_id: str
    parameter: str
    perturbation: str
    delta_delta_pct: float
    delta_margin_pct: float | None
    why_pl: str


@dataclass(frozen=True)
class LFSensitivityEntry:
    bus_id: str
    base_delta_pct: float | None
    threshold_warn_pct: float | None
    threshold_fail_pct: float | None
    drivers: tuple[LFSensitivityDriver, ...]
    missing_data: tuple[str, ...]


@dataclass(frozen=True)
class LFSensitivitySummary:
    total_entries: int
    not_computed_count: int


@dataclass(frozen=True)
class LFSensitivityView:
    analysis_id: str
    context: LFSensitivityContext | None
    delta_pct: float
    entries: tuple[LFSensitivityEntry, ...]
    summary: LFSensitivitySummary
    top_drivers: tuple[LFSensitivityDriver, ...]

    def to_dict(self) -> dict[str, Any]:
        from analysis.lf_sensitivity.serializer import view_to_dict

        return view_to_dict(self)


def compute_lf_sensitivity_id(
    context: LFSensitivityContext | None,
    delta_pct: float,
    entries: Iterable[LFSensitivityEntry],
) -> str:
    payload = {
        "context": context.to_dict() if context else None,
        "delta_pct": float(delta_pct),
        "entries": [
            {
                "bus_id": entry.bus_id,
                "base_delta_pct": entry.base_delta_pct,
                "threshold_warn_pct": entry.threshold_warn_pct,
                "threshold_fail_pct": entry.threshold_fail_pct,
                "drivers": [
                    {
                        "bus_id": driver.bus_id,
                        "parameter": driver.parameter,
                        "perturbation": driver.perturbation,
                        "delta_delta_pct": driver.delta_delta_pct,
                        "delta_margin_pct": driver.delta_margin_pct,
                        "why_pl": driver.why_pl,
                    }
                    for driver in entry.drivers
                ],
                "missing_data": list(entry.missing_data),
            }
            for entry in entries
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
