from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class CoverageScoreContext:
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
class CoverageScoreView:
    analysis_id: str
    context: CoverageScoreContext | None
    total_score: float
    missing_items: tuple[str, ...]
    critical_gaps: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        from analysis.coverage_score.serializer import view_to_dict

        return view_to_dict(self)


def compute_coverage_id(
    context: CoverageScoreContext | None,
    total_score: float,
    missing_items: Iterable[str],
    critical_gaps: Iterable[str],
) -> str:
    payload = {
        "context": context.to_dict() if context else None,
        "total_score": float(total_score),
        "missing_items": list(missing_items),
        "critical_gaps": list(critical_gaps),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
