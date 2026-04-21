from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class SensitivityDecision(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_COMPUTED = "NOT_COMPUTED"


@dataclass(frozen=True)
class SensitivityContext:
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
class SensitivityPerturbation:
    delta_pct: float
    margin: float | None
    delta_margin: float | None
    decision: SensitivityDecision


@dataclass(frozen=True)
class SensitivityEntry:
    parameter_id: str
    parameter_label: str
    target_id: str
    source: str
    base_margin: float | None
    margin_unit: str | None
    base_decision: SensitivityDecision
    minus: SensitivityPerturbation
    plus: SensitivityPerturbation


@dataclass(frozen=True)
class SensitivityDriver:
    parameter_id: str
    parameter_label: str
    target_id: str
    source: str
    score: float
    direction: str
    delta_margin: float


@dataclass(frozen=True)
class SensitivitySummary:
    total_entries: int
    not_computed_count: int


@dataclass(frozen=True)
class SensitivityView:
    analysis_id: str
    context: SensitivityContext | None
    delta_pct: float
    entries: tuple[SensitivityEntry, ...]
    summary: SensitivitySummary
    top_drivers: tuple[SensitivityDriver, ...]

    def to_dict(self) -> dict[str, Any]:
        from analysis.sensitivity.serializer import view_to_dict

        return view_to_dict(self)


def compute_sensitivity_id(
    context: SensitivityContext | None,
    delta_pct: float,
    entries: Iterable[SensitivityEntry],
) -> str:
    payload = {
        "context": context.to_dict() if context else None,
        "delta_pct": float(delta_pct),
        "entries": [
            {
                "parameter_id": entry.parameter_id,
                "parameter_label": entry.parameter_label,
                "target_id": entry.target_id,
                "source": entry.source,
                "base_margin": entry.base_margin,
                "margin_unit": entry.margin_unit,
                "base_decision": entry.base_decision.value,
                "minus": {
                    "delta_pct": entry.minus.delta_pct,
                    "margin": entry.minus.margin,
                    "delta_margin": entry.minus.delta_margin,
                    "decision": entry.minus.decision.value,
                },
                "plus": {
                    "delta_pct": entry.plus.delta_pct,
                    "margin": entry.plus.margin,
                    "delta_margin": entry.plus.delta_margin,
                    "decision": entry.plus.decision.value,
                },
            }
            for entry in entries
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
