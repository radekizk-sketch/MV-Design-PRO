"""
Protection Comparison API — P15b SELECTIVITY (A/B)

REST API endpoints for comparing two protection analysis runs.
100% read-only — no physics calculations, no state mutations.

Endpoints:
- POST /protection-comparisons — Create/execute comparison
- GET /protection-comparisons/{id} — Get comparison metadata
- GET /protection-comparisons/{id}/results — Get comparison results
- GET /protection-comparisons/{id}/trace — Get comparison trace

CANONICAL ALIGNMENT:
- P15b: Protection Selectivity Comparison (A/B)
- Read-only comparison endpoint
- Deterministic response
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from api.dependencies import get_uow_factory
from application.protection_comparison import ProtectionComparisonService
from domain.protection_comparison import (
    ProtectionComparisonError,
    ProtectionComparisonNotFoundError,
    ProtectionProjectMismatchError,
    ProtectionRunNotFinishedError,
    ProtectionRunNotFoundError,
    ProtectionRunWrongTypeError,
)
from fastapi import APIRouter, Depends, HTTPException, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import BaseModel, Field

router = APIRouter(prefix="/protection-comparisons", tags=["protection-comparison"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class CreateProtectionComparisonRequest(BaseModel):
    """Request to create a protection comparison."""

    protection_run_id_a: str = Field(
        ...,
        description="UUID pierwszego ProtectionRun (baseline)",
    )
    protection_run_id_b: str = Field(
        ...,
        description="UUID drugiego ProtectionRun (porównanie)",
    )


class ComparisonRowResponse(BaseModel):
    """Single comparison row.

    FAB-E (E1): i_fault_a_a/i_fault_a_b/delta_i_fault_a to `| None` — element
    nieobecny w run A LUB run B daje None, nigdy fabrykowane 0.0 A.
    """

    protected_element_ref: str
    fault_target_id: str
    device_id_a: str
    device_id_b: str
    trip_state_a: str
    trip_state_b: str
    t_trip_s_a: float | None
    t_trip_s_b: float | None
    i_fault_a_a: float | None
    i_fault_a_b: float | None
    delta_t_s: float | None
    delta_i_fault_a: float | None
    margin_percent_a: float | None
    margin_percent_b: float | None
    state_change: str


class RankingIssueResponse(BaseModel):
    """Single ranking issue."""

    issue_code: str
    severity: int
    element_ref: str
    fault_target_id: str
    description_pl: str
    evidence_refs: list[int]


class ComparisonSummaryResponse(BaseModel):
    """Comparison summary statistics."""

    total_rows: int
    no_change_count: int
    trip_to_no_trip_count: int
    no_trip_to_trip_count: int
    invalid_change_count: int
    total_issues: int
    critical_issues: int
    major_issues: int
    moderate_issues: int
    minor_issues: int


class RunProvenanceResponse(BaseModel):
    """Proweniencja jednego biegu R1 wewnątrz odpowiedzi porównania (B1, karta
    CV-3.3-B): porównanie bez tego jest porównaniem bez dowodu CO było
    porównywane. `envelope` bywa `None` dla biegów sprzed CV-2 (uczciwy brak)."""

    run_id: str
    analysis_type: str
    status: str
    snapshot_hash: str
    input_hash: str
    finished_at: str | None
    envelope: dict[str, Any] | None


class ProtectionComparisonResultResponse(BaseModel):
    """Full comparison result response."""

    comparison_id: str
    run_a_id: str
    run_b_id: str
    project_id: str
    rows: list[ComparisonRowResponse]
    ranking: list[RankingIssueResponse]
    summary: ComparisonSummaryResponse
    input_hash: str
    provenance_a: RunProvenanceResponse
    provenance_b: RunProvenanceResponse
    created_at: str


class TraceStepResponse(BaseModel):
    """Single trace step."""

    step: str
    description_pl: str
    inputs: dict[str, Any]
    outputs: dict[str, Any]


class ProtectionComparisonTraceResponse(BaseModel):
    """Full comparison trace response."""

    comparison_id: str
    run_a_id: str
    run_b_id: str
    library_fingerprint_a: str | None
    library_fingerprint_b: str | None
    steps: list[TraceStepResponse]
    created_at: str


class ProtectionComparisonMetadataResponse(BaseModel):
    """Comparison metadata (without full results)."""

    comparison_id: str
    run_a_id: str
    run_b_id: str
    project_id: str
    summary: ComparisonSummaryResponse
    input_hash: str
    created_at: str


# =============================================================================
# SERVICE FACTORY
# =============================================================================


def _build_service(uow_factory: Any) -> ProtectionComparisonService:
    return ProtectionComparisonService(uow_factory)


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ProtectionComparisonResultResponse,
    summary="Utwórz porównanie dwóch analiz zabezpieczeń",
    description="""
P15b: Porównuje dwa ProtectionAnalysisRun i generuje deterministyczny ranking problemów.

**Walidacje:**
- Oba runy muszą istnieć
- Oba runy muszą mieć status FINISHED
- Oba runy muszą należeć do tego samego projektu

**Zwraca:**
- ProtectionComparisonResult z:
  - rows: porównanie per (element, punkt zwarcia)
  - ranking: lista problemów posortowana wg severity (5→1)
  - summary: statystyki porównania
  - trace_id: ID śladu do audytu

**Cache:**
- Ta sama para (A, B) → ten sam comparison_id
""",
)
def create_protection_comparison(
    request: CreateProtectionComparisonRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Create a protection comparison between two runs.

    P15b: Main comparison endpoint.

    INVARIANTS:
    - Read-only: Zero physics calculations, zero state mutations
    - Same Project: Both runs must belong to the same project
    - Finished Only: Both runs must be FINISHED
    - Deterministic: Same inputs produce identical comparison output
    """
    service = _build_service(uow_factory)

    try:
        result = service.compare(
            run_a_id=request.protection_run_id_a,
            run_b_id=request.protection_run_id_b,
        )
        return result.to_dict()

    except ProtectionRunNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Protection run nie znaleziony: {e.run_id}",
        ) from e
    except ProtectionRunWrongTypeError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bieg {e.run_id} nie jest biegiem zabezpieczeń (rodzaj: {e.analysis_type})",
        ) from e
    except ProtectionRunNotFinishedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Protection run nie zakończony (status: {e.status}): {e.run_id}",
        ) from e
    except ProtectionProjectMismatchError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Runs należą do różnych projektów: {e.run_a_project} vs {e.run_b_project}",
        ) from e
    except ProtectionComparisonError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.get(
    "/{comparison_id}",
    response_model=ProtectionComparisonMetadataResponse,
    summary="Pobierz metadane porównania",
)
def get_protection_comparison(
    comparison_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Get protection comparison metadata.

    Returns comparison ID, run IDs, summary statistics, and timestamps.
    Does not include full rows/ranking (use /results endpoint for that).
    """
    service = _build_service(uow_factory)

    try:
        result = service.get_comparison(comparison_id)
        return {
            "comparison_id": result.comparison_id,
            "run_a_id": result.run_a_id,
            "run_b_id": result.run_b_id,
            "project_id": result.project_id,
            "summary": result.summary.to_dict(),
            "input_hash": result.input_hash,
            "created_at": result.created_at.isoformat(),
        }

    except ProtectionComparisonNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Protection comparison nie znalezione: {e.comparison_id}",
        ) from e


@router.get(
    "/{comparison_id}/results",
    response_model=ProtectionComparisonResultResponse,
    summary="Pobierz pełne wyniki porównania",
)
def get_protection_comparison_results(
    comparison_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Get full protection comparison results.

    Returns all rows, ranking issues, and summary.
    """
    service = _build_service(uow_factory)

    try:
        result = service.get_comparison(comparison_id)
        return result.to_dict()

    except ProtectionComparisonNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Protection comparison nie znalezione: {e.comparison_id}",
        ) from e


@router.get(
    "/{comparison_id}/trace",
    response_model=ProtectionComparisonTraceResponse,
    summary="Pobierz ślad porównania (audyt)",
)
def get_protection_comparison_trace(
    comparison_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Get protection comparison trace for audit.

    Returns all comparison steps with inputs/outputs for reproducibility.
    """
    service = _build_service(uow_factory)

    try:
        trace = service.get_comparison_trace(comparison_id)
        return trace.to_dict()

    except ProtectionComparisonNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Protection comparison nie znalezione: {e.comparison_id}",
        ) from e
