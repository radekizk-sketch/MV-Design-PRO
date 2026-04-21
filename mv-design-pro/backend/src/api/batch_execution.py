"""
Batch Execution & Comparison API — PR-20

REST API endpoints for deterministic batch execution and SC comparison.

Endpoints:
    POST   /api/execution/study-cases/{id}/batches       — Create batch job
    POST   /api/execution/batches/{id}/execute            — Execute batch
    GET    /api/execution/study-cases/{id}/batches        — List batches
    GET    /api/execution/batches/{id}                    — Get batch details
    POST   /api/execution/study-cases/{id}/comparisons    — Create comparison
    GET    /api/execution/comparisons/{id}                — Get comparison

No pagination (v1).
No ResultSet mutation.
All responses use Polish error messages for UI consistency.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.execution_runs import get_engine
from application.batch_execution_service import (
    BatchExecutionService,
    BatchNotFoundError,
    BatchNotPendingError,
)
from application.execution_engine.errors import (
    ResultSetNotFoundError,
    RunNotFoundError,
    StudyCaseNotFoundError,
)
from application.result_mapping.sc_comparison_to_overlay_v1 import (
    compute_delta_overlay_content_hash,
    map_sc_comparison_to_overlay_v1,
)
from application.sc_comparison_service import (
    AnalysisTypeMismatchError,
    ComparisonNotFoundError,
    RunNotDoneError,
    ScComparisonService,
    StudyCaseMismatchError,
)
from domain.execution import ExecutionAnalysisType
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["batch-execution"])

# Singleton services (in-memory for PR-20)
_batch_service: BatchExecutionService | None = None
_comparison_service: ScComparisonService | None = None


def _get_batch_service() -> BatchExecutionService:
    """Get or create the batch execution service singleton."""
    global _batch_service
    if _batch_service is None:
        _batch_service = BatchExecutionService(get_engine())
    return _batch_service


def _get_comparison_service() -> ScComparisonService:
    """Get or create the comparison service singleton."""
    global _comparison_service
    if _comparison_service is None:
        _comparison_service = ScComparisonService(get_engine())
    return _comparison_service


# =============================================================================
# Request/Response Models
# =============================================================================


class ScenarioInput(BaseModel):
    """Input for a single scenario in a batch."""

    scenario_id: str = Field(..., description="UUID scenariusza")
    content_hash: str = Field(..., description="Hash zawartości scenariusza")
    solver_input: dict[str, Any] = Field(
        default_factory=dict,
        description="Wejście solvera dla tego scenariusza",
    )


class CreateBatchRequest(BaseModel):
    """Request to create a batch job."""

    analysis_type: str = Field(
        ...,
        description="Typ analizy: SC_3F, SC_1F, SC_2F",
    )
    scenarios: list[ScenarioInput] = Field(
        ...,
        description="Lista scenariuszy do wykonania",
    )
    readiness: dict[str, Any] | None = Field(
        None,
        description="Wynik sprawdzenia gotowości (opcjonalny)",
    )
    eligibility: dict[str, Any] | None = Field(
        None,
        description="Wynik sprawdzenia uprawnień (opcjonalny)",
    )


class BatchResponse(BaseModel):
    """Batch job response model."""

    batch_id: str
    study_case_id: str
    analysis_type: str
    scenario_ids: list[str]
    created_at: str
    status: str
    batch_input_hash: str
    run_ids: list[str]
    result_set_ids: list[str]
    errors: list[str]


class BatchListResponse(BaseModel):
    """List of batch jobs response."""

    batches: list[BatchResponse]
    count: int


class CreateComparisonRequest(BaseModel):
    """Request to create a comparison."""

    base_run_id: str = Field(..., description="UUID przebiegu bazowego")
    other_run_id: str = Field(..., description="UUID przebiegu porównywanego")
    base_scenario_id: str = Field(..., description="UUID scenariusza bazowego")
    other_scenario_id: str = Field(..., description="UUID scenariusza porównywanego")


class NumericDeltaResponse(BaseModel):
    """Numeric delta response."""

    base: float
    other: float
    abs: float
    rel: float | None


class ComparisonResponse(BaseModel):
    """Comparison response model."""

    comparison_id: str
    study_case_id: str
    analysis_type: str
    base_scenario_id: str
    other_scenario_id: str
    created_at: str
    input_hash: str
    deltas_global: dict[str, NumericDeltaResponse]
    deltas_by_source: list[dict[str, Any]]
    deltas_by_branch: list[dict[str, Any]]


class ErrorResponse(BaseModel):
    """Error response model."""

    detail: str
    code: str | None = None


# =============================================================================
# Helper Functions
# =============================================================================


def _parse_uuid(value: str, field_name: str = "id") -> UUID:
    """Parse and validate a UUID string."""
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} musi być poprawnym UUID",
        ) from exc


def _parse_analysis_type(value: str) -> ExecutionAnalysisType:
    """Parse and validate an analysis type string."""
    try:
        return ExecutionAnalysisType(value)
    except ValueError as exc:
        valid = ", ".join(t.value for t in ExecutionAnalysisType)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy typ analizy: {value}. Dozwolone: {valid}",
        ) from exc


# =============================================================================
# Batch Endpoints
# =============================================================================


@router.post(
    "/api/execution/study-cases/{case_id}/batches",
    response_model=BatchResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_batch(
    case_id: str,
    request: CreateBatchRequest,
) -> dict[str, Any]:
    """
    Utwórz nowe zadanie wsadowe.

    POST /api/execution/study-cases/{case_id}/batches
    """
    parsed_case_id = _parse_uuid(case_id, "case_id")
    analysis_type = _parse_analysis_type(request.analysis_type)
    service = _get_batch_service()

    scenario_ids = [_parse_uuid(s.scenario_id, "scenario_id") for s in request.scenarios]
    content_hashes = [s.content_hash for s in request.scenarios]
    solver_inputs = [s.solver_input for s in request.scenarios]

    try:
        batch = service.create_batch_job(
            study_case_id=parsed_case_id,
            analysis_type=analysis_type,
            scenario_ids=scenario_ids,
            scenario_content_hashes=content_hashes,
            solver_inputs=solver_inputs,
            readiness=request.readiness,
            eligibility=request.eligibility,
        )
        return batch.to_dict()
    except StudyCaseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/api/execution/batches/{batch_id}/execute",
    response_model=BatchResponse,
)
def execute_batch(batch_id: str) -> dict[str, Any]:
    """
    Wykonaj zadanie wsadowe.

    Sekwencyjna egzekucja wszystkich scenariuszy.
    Brak retry, brak partial success.

    POST /api/execution/batches/{batch_id}/execute
    """
    parsed_batch_id = _parse_uuid(batch_id, "batch_id")
    service = _get_batch_service()

    try:
        batch = service.execute_batch(parsed_batch_id)
        return batch.to_dict()
    except BatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except BatchNotPendingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get(
    "/api/execution/study-cases/{case_id}/batches",
    response_model=BatchListResponse,
)
def list_batches(case_id: str) -> dict[str, Any]:
    """
    Lista zadań wsadowych dla przypadku obliczeniowego.

    GET /api/execution/study-cases/{case_id}/batches
    """
    parsed_case_id = _parse_uuid(case_id, "case_id")
    service = _get_batch_service()

    batches = service.list_batches(parsed_case_id)
    return {
        "batches": [b.to_dict() for b in batches],
        "count": len(batches),
    }


@router.get(
    "/api/execution/batches/{batch_id}",
    response_model=BatchResponse,
)
def get_batch(batch_id: str) -> dict[str, Any]:
    """
    Pobierz szczegóły zadania wsadowego.

    GET /api/execution/batches/{batch_id}
    """
    parsed_batch_id = _parse_uuid(batch_id, "batch_id")
    service = _get_batch_service()

    try:
        batch = service.get_batch(parsed_batch_id)
        return batch.to_dict()
    except BatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# =============================================================================
# Comparison Endpoints
# =============================================================================


@router.post(
    "/api/execution/study-cases/{case_id}/comparisons",
    response_model=ComparisonResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_comparison(
    case_id: str,
    request: CreateComparisonRequest,
) -> dict[str, Any]:
    """
    Utwórz porównanie wyników dwóch scenariuszy.

    POST /api/execution/study-cases/{case_id}/comparisons
    """
    parsed_case_id = _parse_uuid(case_id, "case_id")
    parsed_base_run_id = _parse_uuid(request.base_run_id, "base_run_id")
    parsed_other_run_id = _parse_uuid(request.other_run_id, "other_run_id")
    parsed_base_scenario_id = _parse_uuid(request.base_scenario_id, "base_scenario_id")
    parsed_other_scenario_id = _parse_uuid(request.other_scenario_id, "other_scenario_id")
    service = _get_comparison_service()

    try:
        comparison = service.compute_comparison(
            study_case_id=parsed_case_id,
            base_run_id=parsed_base_run_id,
            other_run_id=parsed_other_run_id,
            base_scenario_id=parsed_base_scenario_id,
            other_scenario_id=parsed_other_scenario_id,
        )
        return comparison.to_dict()
    except RunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except RunNotDoneError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except AnalysisTypeMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except StudyCaseMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except ResultSetNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/api/execution/comparisons/{comparison_id}",
    response_model=ComparisonResponse,
)
def get_comparison(comparison_id: str) -> dict[str, Any]:
    """
    Pobierz wyniki porównania.

    GET /api/execution/comparisons/{comparison_id}
    """
    parsed_comparison_id = _parse_uuid(comparison_id, "comparison_id")
    service = _get_comparison_service()

    try:
        comparison = service.get_comparison(parsed_comparison_id)
        return comparison.to_dict()
    except ComparisonNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# =============================================================================
# SLD Delta Overlay Endpoint (PR-21)
# =============================================================================


@router.get(
    "/api/execution/comparisons/{comparison_id}/sld-delta-overlay",
)
def get_sld_delta_overlay(comparison_id: str) -> dict[str, Any]:
    """
    Pobierz overlay delta SLD dla porownania.

    Mapuje ShortCircuitComparison na OverlayPayloadV1 zgodny z PR-16.
    Deterministyczny: ten sam comparison_id -> identyczny payload + hash.

    GET /api/execution/comparisons/{comparison_id}/sld-delta-overlay
    """
    parsed_comparison_id = _parse_uuid(comparison_id, "comparison_id")
    service = _get_comparison_service()

    try:
        comparison = service.get_comparison(parsed_comparison_id)
    except ComparisonNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    overlay = map_sc_comparison_to_overlay_v1(comparison)
    content_hash = compute_delta_overlay_content_hash(overlay)

    payload = overlay.model_dump(mode="json")
    payload["content_hash"] = content_hash
    # Serialize run_id (UUID) to string for JSON
    payload["run_id"] = str(payload["run_id"])

    return payload


@router.get(
    "/api/execution/study-cases/{case_id}/comparisons",
)
def list_comparisons(case_id: str) -> dict[str, Any]:
    """
    Lista porownan dla przypadku obliczeniowego.

    GET /api/execution/study-cases/{case_id}/comparisons
    """
    parsed_case_id = _parse_uuid(case_id, "case_id")
    service = _get_comparison_service()

    comparisons = service.list_comparisons(parsed_case_id)
    return {
        "comparisons": [c.to_dict() for c in comparisons],
        "count": len(comparisons),
    }
