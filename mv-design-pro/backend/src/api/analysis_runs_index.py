from __future__ import annotations

from collections.abc import Callable
from datetime import UTC
from typing import Any

from api.dependencies import get_uow_factory
from application.analyses.run_index import AnalysisRunIndexEntry
from fastapi import APIRouter, Depends, Query
from infrastructure.persistence.unit_of_work import UnitOfWork

router = APIRouter(prefix="/analysis-runs", tags=["analysis-runs"])


@router.get("")
def list_analysis_runs_index(
    case_id: str | None = Query(default=None),
    analysis_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    with uow_factory() as uow:
        entries = uow.analysis_runs_index.list(
            case_id=case_id,
            analysis_type=analysis_type,
            limit=limit,
            offset=offset,
        )
    items = [_index_entry_to_dict(entry) for entry in entries]
    return {"items": items, "count": len(entries)}


def _index_entry_to_dict(entry: AnalysisRunIndexEntry) -> dict[str, Any]:
    created_at = entry.created_at_utc
    created_at_utc = (
        created_at.astimezone(UTC).isoformat()
        if created_at.tzinfo
        else created_at.replace(tzinfo=UTC).isoformat()
    )
    return {
        "run_id": entry.run_id,
        "analysis_type": entry.analysis_type,
        "case_id": entry.case_id,
        "base_snapshot_id": entry.base_snapshot_id,
        "primary_artifact_type": entry.primary_artifact_type,
        "primary_artifact_id": entry.primary_artifact_id,
        "fingerprint": entry.fingerprint,
        "created_at_utc": created_at_utc,
        "status": entry.status,
        "meta_json": entry.meta_json,
    }
