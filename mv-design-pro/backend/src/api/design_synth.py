from __future__ import annotations

from collections.abc import Callable
from infrastructure.persistence.unit_of_work import UnitOfWork

from typing import Any

from api.dependencies import get_uow_factory
from api.schemas.design_synth import (
    ConnectionStudyRequest,
    ConnectionStudyResponse,
)
from application.analyses.design_synth.envelope_adapter import to_run_envelope
from application.analyses.design_synth.pipeline import run_connection_study
from application.analyses.run_index import index_run
from fastapi import APIRouter, Depends, HTTPException, status

router = APIRouter(prefix="/analyses/design-synth", tags=["design-synth"])


@router.post("/connection-study", response_model=ConnectionStudyResponse)
def create_connection_study(
    payload: ConnectionStudyRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    try:
        result = run_connection_study(
            payload.case_id,
            payload.base_snapshot_id,
            payload.spec_payload,
            uow_factory=uow_factory,
        )
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    _index_design_synth_run(result, uow_factory=uow_factory)
    return result.to_dict()


def _index_design_synth_run(result, *, uow_factory) -> None:
    with uow_factory() as uow:
        evidence = uow.design_evidence.get(result.design_evidence_id)
        evidence_payload = (
            evidence.evidence_json
            if evidence and isinstance(evidence.evidence_json, dict)
            else None
        )
        envelope = to_run_envelope(result, evidence_payload=evidence_payload)
        entry = index_run(
            envelope,
            primary_artifact_type="design_evidence",
            primary_artifact_id=str(result.design_evidence_id),
            base_snapshot_id=result.base_snapshot_id,
            case_id=str(result.case_id) if result.case_id else None,
        )
        if uow.analysis_runs_index.get(entry.run_id) is None:
            uow.analysis_runs_index.add(entry)
