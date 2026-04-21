"""PR-6: Canonical AnalysisRunSummary — stable response contract.

Every analysis dispatch (SC, PF, Protection) returns this shape.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


def _format_dt(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


@dataclass(frozen=True)
class AnalysisRunSummary:
    """Unified summary returned by AnalysisDispatchService.dispatch().

    Stable contract — all fields are present for every analysis kind.
    """

    run_id: str
    analysis_kind: str
    status: str
    created_at: datetime | None
    finished_at: datetime | None = None
    input_hash: str = ""
    enm_hash: str = ""
    results_valid: bool = True
    deduplicated: bool = False
    result_location: str | None = None
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "analysis_kind": self.analysis_kind,
            "status": self.status,
            "created_at": _format_dt(self.created_at),
            "finished_at": _format_dt(self.finished_at),
            "input_hash": self.input_hash,
            "enm_hash": self.enm_hash,
            "results_valid": self.results_valid,
            "deduplicated": self.deduplicated,
            "result_location": self.result_location,
            "error_message": self.error_message,
        }
