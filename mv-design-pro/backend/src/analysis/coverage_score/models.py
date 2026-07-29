from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from analysis.odcisk_kontekstu import odcisk_kontekstu


@dataclass(frozen=True)
class CoverageScoreContext:
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
        "context": odcisk_kontekstu(context),
        "total_score": float(total_score),
        "missing_items": list(missing_items),
        "critical_gaps": list(critical_gaps),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
