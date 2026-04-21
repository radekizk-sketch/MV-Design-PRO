from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class RecommendationEffect(str, Enum):
    PASS = "PASS"
    STILL_FAIL = "STILL_FAIL"
    NOT_COMPUTED = "NOT_COMPUTED"


@dataclass(frozen=True)
class RecommendationContext:
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
class RecommendationEntry:
    parameter_id: str
    parameter_label: str
    target_id: str
    source: str
    current_value: float | None
    current_unit: str | None
    required_delta: float | None
    delta_unit: str | None
    expected_effect: RecommendationEffect
    confidence_note: str


@dataclass(frozen=True)
class RecommendationSummary:
    total_entries: int
    not_computed_count: int


@dataclass(frozen=True)
class RecommendationView:
    analysis_id: str
    context: RecommendationContext | None
    primary: RecommendationEntry | None
    alternatives: tuple[RecommendationEntry, ...]
    summary: RecommendationSummary

    def to_dict(self) -> dict[str, Any]:
        from analysis.recommendations.serializer import view_to_dict

        return view_to_dict(self)


def compute_recommendation_id(
    context: RecommendationContext | None,
    primary: RecommendationEntry | None,
    alternatives: Iterable[RecommendationEntry],
) -> str:
    payload = {
        "context": context.to_dict() if context else None,
        "primary": _entry_payload(primary),
        "alternatives": [_entry_payload(entry) for entry in alternatives],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _entry_payload(entry: RecommendationEntry | None) -> dict[str, Any] | None:
    if entry is None:
        return None
    return {
        "parameter_id": entry.parameter_id,
        "parameter_label": entry.parameter_label,
        "target_id": entry.target_id,
        "source": entry.source,
        "current_value": entry.current_value,
        "current_unit": entry.current_unit,
        "required_delta": entry.required_delta,
        "delta_unit": entry.delta_unit,
        "expected_effect": entry.expected_effect.value,
        "confidence_note": entry.confidence_note,
    }
