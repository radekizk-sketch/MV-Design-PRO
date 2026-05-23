"""PR-6: Unified analysis dispatch endpoints.

Provides a consistent API surface for all analysis kinds:
- POST /runs/short-circuit
- POST /runs/power-flow
- POST /runs/protection

Each returns an AnalysisRunSummary with identical shape.

Backward compatible: existing per-type endpoints remain untouched.
"""

from __future__ import annotations

from collections.abc import Callable
from infrastructure.persistence.unit_of_work import UnitOfWork

from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.analysis_dispatch.summary import AnalysisRunSummary
from application.unified_run_dispatch import UnifiedRunDispatchService
from application.analysis_run.read_model import canonicalize_json
from domain.analysis_kind import AnalysisKind
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/runs", tags=["unified-runs"])


# =============================================================================
# Request Models
# =============================================================================


class ShortCircuitDispatchRequest(BaseModel):
    """Request for dispatching a short-circuit analysis."""

    project_id: UUID
    study_case_id: UUID | None = Field(
        default=None,
        description="Study case ID. If None, uses Active Case.",
    )
    fault_spec: dict[str, Any] = Field(
        ...,
        description="Fault specification (fault_type, node_id, c_factor, etc.)",
    )
    options: dict[str, Any] | None = Field(
        default=None,
        description="Solver options",
    )


class PowerFlowDispatchRequest(BaseModel):
    """Request for dispatching a power flow analysis."""

    project_id: UUID
    study_case_id: UUID | None = Field(
        default=None,
        description="Study case ID. If None, uses Active Case.",
    )
    options: dict[str, Any] | None = Field(
        default=None,
        description="Solver options (tolerance, max_iter, trace_level, etc.)",
    )


class ProtectionDispatchRequest(BaseModel):
    """Request for dispatching a protection analysis."""

    project_id: UUID
    sc_run_id: str = Field(
        ...,
        description="Source short-circuit run ID (must be FINISHED)",
    )
    protection_case_id: UUID = Field(
        ...,
        description="Study case ID with ProtectionConfig",
    )
    options: dict[str, Any] | None = Field(
        default=None,
        description="Protection analysis options",
    )


# =============================================================================
# Response helpers
# =============================================================================


def _summary_response(
    summary: AnalysisRunSummary,
    status_code: int = 200,
) -> dict[str, Any]:
    """Build a deterministically sorted response from AnalysisRunSummary."""
    payload = summary.to_dict()
    result_location = payload.get("result_location")
    if isinstance(result_location, str) and result_location.startswith("/analysis-runs/"):
        payload["result_location"] = f"/api{result_location}"
    # Add run_summary wrapper for backward-compat envelope
    return canonicalize_json({"run_summary": payload})


# =============================================================================
# Endpoints
# =============================================================================


@router.post("/short-circuit", status_code=status.HTTP_201_CREATED)
def dispatch_short_circuit(
    request: ShortCircuitDispatchRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Dispatch short-circuit analysis through unified pipeline.

    Returns AnalysisRunSummary with consistent shape.
    """
    service = UnifiedRunDispatchService(uow_factory)
    opts = dict(request.options or {})
    opts["fault_spec"] = request.fault_spec
    try:
        summary = service.dispatch(
            analysis_kind=AnalysisKind.SHORT_CIRCUIT,
            project_id=request.project_id,
            study_case_id=request.study_case_id,
            options=opts,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return _summary_response(summary)


@router.post("/power-flow", status_code=status.HTTP_201_CREATED)
def dispatch_power_flow(
    request: PowerFlowDispatchRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Dispatch power flow analysis through unified pipeline.

    Returns AnalysisRunSummary with consistent shape.
    """
    service = UnifiedRunDispatchService(uow_factory)
    try:
        summary = service.dispatch(
            analysis_kind=AnalysisKind.POWER_FLOW,
            project_id=request.project_id,
            study_case_id=request.study_case_id,
            options=request.options,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return _summary_response(summary)


@router.post("/protection", status_code=status.HTTP_201_CREATED)
def dispatch_protection(
    request: ProtectionDispatchRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Dispatch protection analysis through unified pipeline.

    Returns AnalysisRunSummary with consistent shape.
    """
    service = UnifiedRunDispatchService(uow_factory)
    opts = dict(request.options or {})
    opts["sc_run_id"] = request.sc_run_id
    opts["protection_case_id"] = str(request.protection_case_id)
    try:
        summary = service.dispatch(
            analysis_kind=AnalysisKind.PROTECTION,
            project_id=request.project_id,
            study_case_id=None,
            options=opts,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return _summary_response(summary)
