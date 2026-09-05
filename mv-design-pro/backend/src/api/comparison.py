"""
P10b Comparison API — Run A/B Result Comparison

REST API endpoint for comparing two Study Run results.
100% read-only — no physics calculations, no state mutations.

CANONICAL ALIGNMENT:
- P10b: Result State + Case A/B Comparison (BACKEND ONLY)
- Read-only comparison endpoint
- Deterministic response
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.comparison import ComparisonService
from domain.results import (
    AnalysisTypeMismatchError,
    ProjectMismatchError,
    ResultNotFoundError,
    RunNotFoundError,
)
from fastapi import APIRouter, Depends, HTTPException, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/comparison", tags=["comparison"])


# =============================================================================
# Request/Response Models
# =============================================================================


class CompareRunsRequest(BaseModel):
    """Request to compare two study runs."""

    run_a_id: str = Field(..., description="UUID pierwszego Run (baseline)")
    run_b_id: str = Field(..., description="UUID drugiego Run (porównanie)")


class NumericDeltaResponse(BaseModel):
    """Numeric delta response."""

    value_a: float
    value_b: float
    delta: float
    percent: float | None
    sign: int


class ComplexDeltaResponse(BaseModel):
    """Complex delta response."""

    re_a: float
    im_a: float
    re_b: float
    im_b: float
    delta_re: float
    delta_im: float
    magnitude_a: float
    magnitude_b: float
    delta_magnitude: float
    percent_magnitude: float | None


class ShortCircuitComparisonResponse(BaseModel):
    """Short circuit comparison response.

    FAB-E (E1): pola delt to ``| None`` — brak wartości w payloadzie run A LUB
    run B (niekompletny/starszy zapis wyniku) daje ``None``, nigdy fabrykowaną
    deltę liczoną od milczącego 0.
    """

    ikss_delta: NumericDeltaResponse | None = None
    sk_delta: NumericDeltaResponse | None = None
    zth_delta: ComplexDeltaResponse | None = None
    ip_delta: NumericDeltaResponse | None = None
    ith_delta: NumericDeltaResponse | None = None
    # Karta S-C (2026-07-22): addytywne delty pełnego bilansu IEC 60909;
    # None dla starszych wyników bez rx_ratio / ith_a+tk_s (uczciwy brak).
    xr_ratio_delta: NumericDeltaResponse | None = None
    i2t_delta: NumericDeltaResponse | None = None


class BusVoltageComparisonResponse(BaseModel):
    """Bus voltage comparison response.

    FAB-E (E1): ``None`` gdy szyna nie ma wartości w run A LUB run B.
    """

    bus_id: str
    u_kv_delta: NumericDeltaResponse | None = None
    u_pu_delta: NumericDeltaResponse | None = None


# Backward-compat alias
NodeVoltageComparisonResponse = BusVoltageComparisonResponse


class BranchPowerComparisonResponse(BaseModel):
    """Branch power comparison response.

    FAB-E (E1): ``None`` gdy gałąź nie ma wartości w run A LUB run B.
    """

    branch_id: str
    p_mw_delta: NumericDeltaResponse | None = None
    q_mvar_delta: NumericDeltaResponse | None = None


class PowerFlowComparisonResponse(BaseModel):
    """Power flow comparison response.

    FAB-E (E1): agregaty to ``| None`` — brak klucza w payloadzie run A LUB
    run B daje ``None``, nigdy fabrykowane 0.0.
    """

    total_losses_p_delta: NumericDeltaResponse | None = None
    total_losses_q_delta: NumericDeltaResponse | None = None
    slack_p_delta: NumericDeltaResponse | None = None
    slack_q_delta: NumericDeltaResponse | None = None
    bus_voltages: list[BusVoltageComparisonResponse]
    branch_powers: list[BranchPowerComparisonResponse]


class ProtectionEvaluationComparisonResponse(BaseModel):
    """Protection evaluation comparison response."""

    element_id: str
    trip_state_a: str
    trip_state_b: str
    state_change: str
    t_trip_delta: NumericDeltaResponse | None = None
    margin_delta: NumericDeltaResponse | None = None


class ProtectionComparisonResponse(BaseModel):
    """Protection comparison response.

    FAB-E (E1): count-delty to ``| None`` — brak klucza "summary" w payloadzie
    run A LUB run B daje ``None``, nigdy fabrykowane 0.
    """

    evaluations: list[ProtectionEvaluationComparisonResponse]
    trip_count_delta: NumericDeltaResponse | None = None
    no_trip_count_delta: NumericDeltaResponse | None = None
    invalid_count_delta: NumericDeltaResponse | None = None


class RunComparisonResponse(BaseModel):
    """
    Full run comparison response.

    P10b/P15c: Top-level comparison result combining all analysis types.
    """

    run_a_id: str
    run_b_id: str
    project_id: str
    analysis_type: str
    compared_at: str
    short_circuit: ShortCircuitComparisonResponse | None = None
    power_flow: PowerFlowComparisonResponse | None = None
    protection: ProtectionComparisonResponse | None = None


# =============================================================================
# Endpoints
# =============================================================================


@router.post(
    "/runs",
    response_model=RunComparisonResponse,
    summary="Compare two study runs",
    description="P10b: Read-only comparison of two run results. No physics, no mutations.",
)
def compare_runs(
    request: CompareRunsRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Compare two Study Run results.

    P10b: Main comparison endpoint.

    INVARIANTS:
    - Read-only: Zero physics calculations, zero state mutations
    - Same Project: Both runs must belong to the same project
    - Same Analysis Type: Both runs must have the same analysis type
    - Deterministic: Same inputs produce identical comparison output

    Returns:
        RunComparisonResponse with all computed deltas

    Raises:
        404: Run not found
        400: Project mismatch or analysis type mismatch
        404: Results not found for run
    """
    try:
        run_a_id = UUID(request.run_a_id)
        run_b_id = UUID(request.run_b_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy format UUID: {e}",
        )

    service = ComparisonService(uow_factory)

    try:
        result = service.compare_runs(run_a_id, run_b_id)
        return result.to_dict()

    except RunNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run nie znaleziony: {e.run_id}",
        )
    except ProjectMismatchError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Runs należą do różnych projektów: {e.run_a_project} vs {e.run_b_project}",
        )
    except AnalysisTypeMismatchError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Runs mają różne typy analiz: {e.type_a} vs {e.type_b}",
        )
    except ResultNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wyniki typu {e.result_type} nie znalezione dla run: {e.run_id}",
        )
