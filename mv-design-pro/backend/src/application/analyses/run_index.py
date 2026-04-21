from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from application.analyses.run_envelope import AnalysisRunEnvelope


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


def index_run(
    envelope: AnalysisRunEnvelope,
    *,
    primary_artifact_type: str,
    primary_artifact_id: str,
    base_snapshot_id: str | None,
    case_id: str | None,
    status: str = "SUCCEEDED",
    meta: dict[str, Any] | None = None,
) -> AnalysisRunIndexEntry:
    return AnalysisRunIndexEntry(
        run_id=envelope.run_id,
        analysis_type=envelope.analysis_type,
        case_id=case_id or envelope.case_id,
        base_snapshot_id=base_snapshot_id,
        primary_artifact_type=primary_artifact_type,
        primary_artifact_id=primary_artifact_id,
        fingerprint=envelope.fingerprint,
        created_at_utc=_parse_created_at_utc(envelope.created_at_utc),
        status=status,
        meta_json=meta,
    )


def _parse_created_at_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
