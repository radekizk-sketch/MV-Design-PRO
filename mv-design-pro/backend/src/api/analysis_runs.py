from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.canonical_run_views import (
    build_analysis_run_detail,
    build_analysis_run_summary,
    build_branch_results_response,
    build_bus_results_response,
    build_extended_trace_response,
    build_result_items,
    build_results_index_response,
    build_run_trace_payload,
    build_short_circuit_results_response,
    build_sld_overlay,
)
from api.dependencies import get_uow_factory
from application.analysis_run.read_model import canonicalize_json, build_trace_summary
from enm.canonical_analysis import (
    CanonicalRun,
    get_run as get_canonical_run,
    list_runs_for_project as list_canonical_runs_for_project,
)


router = APIRouter(prefix="/api", tags=["analysis-runs"])


def _require_canonical_run(run_id: UUID) -> CanonicalRun:
    run = get_canonical_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run {run_id} not found",
        )
    return run


@router.get("/projects/{project_id}/analysis-runs")
def list_analysis_runs(
    project_id: UUID,
    analysis_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    items = [
        build_analysis_run_summary(run)
        for run in list_canonical_runs_for_project(
            str(project_id),
            analysis_type=analysis_type,
        )
        if status_filter is None or run.status == status_filter
    ]
    sliced_items = items[offset : offset + limit]
    return canonicalize_json({"items": sliced_items, "count": len(items)})


@router.get("/analysis-runs/{run_id}")
def get_analysis_run(run_id: str) -> dict[str, Any]:
    try:
        parsed_run_id = UUID(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run {run_id} not found",
        ) from exc
    return canonicalize_json(build_analysis_run_detail(_require_canonical_run(parsed_run_id)))


@router.get("/analysis-runs/{run_id}/results")
def get_analysis_run_results(run_id: UUID) -> dict[str, Any]:
    canonical_run = _require_canonical_run(run_id)
    if canonical_run.status != "FINISHED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Wyniki przebiegu {run_id} są niedostępne (status={canonical_run.status})",
        )
    return canonicalize_json(build_result_items(canonical_run))


@router.get("/analysis-runs/{run_id}/snapshot")
def get_analysis_run_snapshot(run_id: UUID) -> dict[str, Any]:
    canonical_run = _require_canonical_run(run_id)
    return canonicalize_json(canonical_run.snapshot or {})


@router.get("/analysis-runs/{run_id}/overlay")
def get_analysis_run_overlay(
    run_id: UUID,
    diagram_id: UUID = Query(...),
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    canonical_run = _require_canonical_run(run_id)
    with uow_factory() as uow:
        diagram = uow.sld.get(diagram_id)
    if diagram is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SLD diagram not found",
        )
    diagram_project_id = (
        str(diagram.get("project_id")) if diagram.get("project_id") is not None else None
    )
    if canonical_run.project_id is not None and diagram_project_id not in {
        None,
        str(canonical_run.project_id),
    }:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run does not belong to this project",
        )
    overlay = build_sld_overlay(
        canonical_run,
        diagram_id=diagram_id,
        sld_payload=diagram.get("payload", {}),
    )
    return canonicalize_json(
        {
            "bus_overlays": overlay.get("nodes", []),
            "branch_overlays": overlay.get("branches", []),
        }
    )


@router.get("/analysis-runs/{run_id}/trace")
def get_analysis_run_trace(run_id: UUID) -> dict[str, Any]:
    trace_payload = build_run_trace_payload(_require_canonical_run(run_id))
    if trace_payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ślad obliczeniowy niedostępny dla tego przebiegu analizy",
        )
    return canonicalize_json({"trace": trace_payload})


@router.get("/analysis-runs/{run_id}/trace/summary")
def get_analysis_run_trace_summary(run_id: UUID) -> dict[str, Any]:
    trace_payload = build_run_trace_payload(_require_canonical_run(run_id))
    if trace_payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ślad obliczeniowy niedostępny dla tego przebiegu analizy",
        )
    summary = build_trace_summary(trace_payload)
    return canonicalize_json(
        {
            "count": summary.get("count", 0),
            "first_step": summary.get("first_step"),
            "last_step": summary.get("last_step"),
            "phases": summary.get("phases", []),
            "duration_ms": summary.get("duration_ms"),
            "warnings": summary.get("warnings", []),
        }
    )


@router.get("/projects/{project_id}/analysis-runs/{run_id}/export/docx")
def export_analysis_run_docx(project_id: UUID, run_id: UUID) -> dict[str, Any]:
    _ = project_id, run_id
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Eksport DOCX dla ogólnego endpointu /analysis-runs został wycofany z toru "
            "produkcyjnego. Użyj kanonicznych endpointów execution/power-flow."
        ),
    )


@router.get("/projects/{project_id}/analysis-runs/{run_id}/export/pdf")
def export_analysis_run_pdf(project_id: UUID, run_id: UUID) -> dict[str, Any]:
    _ = project_id, run_id
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Eksport PDF dla ogólnego endpointu /analysis-runs został wycofany z toru "
            "produkcyjnego. Użyj kanonicznych endpointów execution/power-flow."
        ),
    )


@router.get("/analysis-runs/{run_id}/results/index")
def get_results_index(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(build_results_index_response(_require_canonical_run(run_id)))


@router.get("/analysis-runs/{run_id}/results/buses")
def get_bus_results(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(build_bus_results_response(_require_canonical_run(run_id)))


@router.get("/analysis-runs/{run_id}/results/branches")
def get_branch_results(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(build_branch_results_response(_require_canonical_run(run_id)))


@router.get("/analysis-runs/{run_id}/results/short-circuit")
def get_short_circuit_results(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(
        build_short_circuit_results_response(_require_canonical_run(run_id))
    )


@router.get("/analysis-runs/{run_id}/results/trace")
def get_extended_trace(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(build_extended_trace_response(_require_canonical_run(run_id)))
