from __future__ import annotations

from collections.abc import Callable

from api.dependencies import get_uow_factory
from application.analyses.run_reader import read_run_envelope
from application.analyses.run_registry import get_run_envelope_adapter
from fastapi import APIRouter, Depends, HTTPException, Path, status
from infrastructure.persistence.unit_of_work import UnitOfWork

router = APIRouter(prefix="/analysis-runs", tags=["analysis-runs"])


@router.get("/{analysis_type}/{run_id}")
def get_analysis_run_envelope(
    analysis_type: str,
    run_id: str = Path(..., min_length=1),
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict:
    if not run_id.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="run_id must be non-empty",
        )
    if get_run_envelope_adapter(analysis_type) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unsupported analysis_type",
        )
    try:
        envelope = read_run_envelope(analysis_type, run_id, uow_factory=uow_factory)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return envelope.to_dict()
