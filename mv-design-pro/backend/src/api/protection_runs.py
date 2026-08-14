"""
Protection Analysis API — P15a FOUNDATION

Backend-only endpoints for protection analysis runs.

Endpoints:
- POST /projects/{project_id}/protection-runs — Create new protection run
- POST /protection-runs/{run_id}/execute — Execute protection run
- GET /protection-runs/{run_id} — Get run metadata
- GET /protection-runs/{run_id}/results — Get ProtectionResult
- GET /protection-runs/{run_id}/trace — Get ProtectionTrace
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.protection_analysis import ProtectionAnalysisService
from domain.protection_analysis import ProtectionAnalysisRun, ProtectionRunStatus
from fastapi import APIRouter, Depends, HTTPException, Query, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import BaseModel

router = APIRouter(tags=["protection-analysis"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class CreateProtectionRunRequest(BaseModel):
    """Request to create a new protection analysis run."""

    sc_run_id: str
    protection_case_id: str


class ProtectionRunResponse(BaseModel):
    """Response for protection run metadata."""

    id: str
    project_id: str
    sc_run_id: str
    protection_case_id: str
    status: str
    input_hash: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error_message: str | None = None


class ProtectionResultResponse(BaseModel):
    """Response for protection result."""

    run_id: str
    sc_run_id: str
    protection_case_id: str
    template_ref: str | None
    template_fingerprint: str | None
    evaluations: list[dict[str, Any]]
    summary: dict[str, Any]
    created_at: str


class ProtectionTraceResponse(BaseModel):
    """Response for protection trace."""

    run_id: str
    sc_run_id: str
    snapshot_id: str | None
    template_ref: str | None
    overrides: dict[str, Any]
    steps: list[dict[str, Any]]
    created_at: str


# =============================================================================
# SERVICE FACTORY
# =============================================================================


def _build_service(uow_factory: Any) -> ProtectionAnalysisService:
    return ProtectionAnalysisService(uow_factory)


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.post(
    "/projects/{project_id}/protection-runs",
    status_code=status.HTTP_201_CREATED,
    response_model=ProtectionRunResponse,
)
def create_protection_run(
    project_id: UUID,
    request: CreateProtectionRunRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Create a new protection analysis run.

    Requires:
    - A finished short-circuit run (sc_run_id)
    - A study case with ProtectionConfig (protection_case_id)

    Returns:
    - Protection run metadata with status CREATED
    """
    service = _build_service(uow_factory)
    try:
        protection_case_id = UUID(request.protection_case_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowy protection_case_id: {exc}",
        ) from exc

    try:
        run = service.create_run(
            project_id=project_id,
            sc_run_id=request.sc_run_id,
            protection_case_id=protection_case_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return _run_to_response(run)


@router.post(
    "/protection-runs/{run_id}/execute",
    response_model=ProtectionRunResponse,
)
def execute_protection_run(
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Execute a protection analysis run.

    The run must be in CREATED status. This endpoint:
    1. Validates inputs
    2. Runs the protection evaluation engine
    3. Stores results and trace

    Returns:
    - Updated run metadata with status FINISHED or FAILED
    """
    service = _build_service(uow_factory)
    try:
        run = service.execute_run(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return _run_to_response(run)


@router.get(
    "/protection-runs/{run_id}",
    response_model=ProtectionRunResponse,
)
def get_protection_run(
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Get protection run metadata.

    Returns the run status, input hash, timestamps, and error message (if failed).
    """
    service = _build_service(uow_factory)
    try:
        run = service.get_run(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return _run_to_response(run)


@router.get(
    "/protection-runs/{run_id}/results",
    response_model=ProtectionResultResponse,
)
def get_protection_run_results(
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Get protection analysis results.

    Returns the full ProtectionResult including all evaluations and summary.
    Only available for runs with status FINISHED.
    """
    service = _build_service(uow_factory)

    # First check run exists and is FINISHED
    try:
        run = service.get_run(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    if run.status != ProtectionRunStatus.FINISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Przebieg nie jest zakończony (status: {run.status.value})",
        )

    result = service.get_result(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Wynik analizy zabezpieczeń nie znaleziony",
        )

    return {
        "run_id": result.run_id,
        "sc_run_id": result.sc_run_id,
        "protection_case_id": result.protection_case_id,
        "template_ref": result.template_ref,
        "template_fingerprint": result.template_fingerprint,
        "evaluations": [e.to_dict() for e in result.evaluations],
        "summary": result.summary.to_dict(),
        "created_at": result.created_at.isoformat(),
    }


@router.get(
    "/protection-runs/{run_id}/trace",
    response_model=ProtectionTraceResponse,
)
def get_protection_run_trace(
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Get protection analysis trace.

    Returns the full ProtectionTrace including all calculation steps.
    Only available for runs with status FINISHED.
    """
    service = _build_service(uow_factory)

    # First check run exists
    try:
        run = service.get_run(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    if run.status != ProtectionRunStatus.FINISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Przebieg nie jest zakończony (status: {run.status.value})",
        )

    trace = service.get_trace(run_id)
    if trace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ślad analizy zabezpieczeń nie znaleziony",
        )

    return {
        "run_id": trace.run_id,
        "sc_run_id": trace.sc_run_id,
        "snapshot_id": trace.snapshot_id,
        "template_ref": trace.template_ref,
        "overrides": trace.overrides,
        "steps": [s.to_dict() for s in trace.steps],
        "created_at": trace.created_at.isoformat(),
    }


# =============================================================================
# HELPERS
# =============================================================================


@router.get(
    "/projects/{project_id}/sld/{diagram_id}/protection-overlay",
)
def get_protection_sld_overlay(
    project_id: UUID,
    diagram_id: UUID,
    run_id: UUID = Query(..., description="Protection run ID for overlay"),
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    P15c: Get SLD overlay for protection analysis results.

    Maps protection evaluation states to SLD symbols for visualization.
    This is READ-ONLY - does not mutate model or diagram.

    Args:
        project_id: Project UUID
        diagram_id: SLD diagram UUID
        run_id: Protection run UUID to get results from

    Returns:
        Protection overlay with element states mapped to SLD symbols.

    Overlay contains:
    - elements: List of protection elements with trip_state, t_trip_s, margin_percent
    - result_status: FRESH/OUTDATED/NONE — swiezosc wyniku wzgledem modelu
    - result_status_reason (+ _pl): PRZYCZYNA statusu, nigdy domysl

    STATUS Z POROWNANIA ODCISKOW (K-S). Do 2026-08-14 ta koncowka meldowala
    `"FRESH"` LITERALEM („For now, assume FRESH if run is FINISHED") — wynik
    policzony przed edycja modelu wygladal na aktualny. Teraz status pochodzi z
    porownania odciskow modelu zapisanych przy biegu z odciskiem modelu
    biezacego (`application/result_freshness`), a bieg bez zapisanego odcisku
    NIE MOZE zameldowac sie jako aktualny.

    BRAK WYNIKU TO NIE BLAD. Przebieg istniejacy, ale niezakonczony albo bez
    zapisanego wyniku, oddaje `result_status = NONE` z pusta lista elementow —
    dokladnie to, o co pyta warstwa rysujaca („czy jest co nalozyc"). Bledem
    (404) pozostaje wylacznie przebieg NIEISTNIEJACY, a niezgodnosc projektu
    dalej konczy sie 400.

    PRZESTRZEN REFOW. `symbol_id` == `element_id` == `protected_element_ref`,
    bo kanaly nakladek tego systemu adresuja symbole refami elementow modelu
    (ENM `ref_id`) — patrz naglowek `ui/sld/v3/canvas/resultLabels.ts`. Wczesniej
    stal tu znacznik „TODO: Map to actual symbol" sugerujacy osobna przestrzen
    identyfikatorow symboli; taka przestrzen w tym systemie nie istnieje.
    """
    service = _build_service(uow_factory)

    try:
        run = service.get_run(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # Verify project ID matches
    if run.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Przebieg nie należy do tego projektu",
        )

    result = service.get_result(run_id) if run.status == ProtectionRunStatus.FINISHED else None
    verdict = service.result_freshness(run)

    # Build overlay (maps evaluations to elements)
    elements = []
    for evaluation in result.evaluations if result is not None else ():
        elements.append(
            {
                "symbol_id": evaluation.protected_element_ref,
                "element_id": evaluation.protected_element_ref,
                "trip_state": evaluation.trip_state.value,
                "t_trip_s": evaluation.t_trip_s,
                "margin_percent": evaluation.margin_percent,
            }
        )

    # Sort deterministically by element_id
    elements.sort(key=lambda x: x["element_id"])

    return {
        "diagram_id": str(diagram_id),
        "run_id": str(run_id),
        **verdict.to_overlay_fields(),
        "elements": elements,
    }


def _run_to_response(run: ProtectionAnalysisRun) -> dict[str, Any]:
    """Convert ProtectionAnalysisRun to response dict."""
    return {
        "id": str(run.id),
        "project_id": str(run.project_id),
        "sc_run_id": run.sc_run_id,
        "protection_case_id": str(run.protection_case_id),
        "status": run.status.value,
        "input_hash": run.input_hash,
        "created_at": run.created_at.isoformat(),
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "error_message": run.error_message,
    }
