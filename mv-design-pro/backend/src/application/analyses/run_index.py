from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class AnalysisRunIndexEntry:
    run_id: str
    analysis_type: str
    case_id: str | None
    base_snapshot_id: str | None
    primary_artifact_type: str
    primary_artifact_id: str
    fingerprint: str
    created_at_utc: datetime
    status: str
    meta_json: dict[str, Any] | None
