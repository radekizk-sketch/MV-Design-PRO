from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.analysis_run_exports import (
    build_analysis_run_trace_export_payload,
    export_run_report_docx_response,
    export_run_report_json_response,
    export_run_report_pdf_response,
    export_run_trace_pdf_response,
)
from api.canonical_run_views import (
    build_analysis_run_detail,
    build_analysis_run_summary,
    build_automation_trace_results_response,
    build_branch_results_response,
    build_bus_results_response,
    build_dynamic_stability_results_response,
    build_dynamic_stability_time_series_response,
    build_extended_trace_response,
    build_phase_state_results_response,
    build_result_items,
    build_results_index_response,
    build_run_trace_payload,
    build_short_circuit_results_response,
    build_sld_overlay,
    build_source_compliance_results_response,
)
from api.dependencies import get_uow_factory
from application.analysis_run.read_model import build_trace_summary, canonicalize_json
from enm.canonical_analysis import (
    CanonicalRun,
)
from enm.canonical_analysis import (
    get_run as get_canonical_run,
)
from enm.canonical_analysis import (
    list_runs_for_project as list_canonical_runs_for_project,
)
from enm.catalog_completion import complete_catalog_defaults
from enm.models import EnergyNetworkModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from infrastructure.persistence.unit_of_work import UnitOfWork
from pydantic import ValidationError

router = APIRouter()


def _require_canonical_run(run_id: UUID) -> CanonicalRun:
    run = get_canonical_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono obliczenia {run_id}",
        )
    return run


def _catalog_completed_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Return a catalog-complete ENM snapshot for legacy analysis runs."""
    try:
        enm = EnergyNetworkModel.model_validate(snapshot)
    except ValidationError:
        return snapshot

    completed, changed = complete_catalog_defaults(enm)
    if not changed:
        return snapshot
    return completed.model_dump(mode="json")


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
            detail=f"Nie znaleziono obliczenia {run_id}",
        ) from exc
    return canonicalize_json(build_analysis_run_detail(_require_canonical_run(parsed_run_id)))


@router.get("/analysis-runs/{run_id}/snapshot")
def get_analysis_run_snapshot(run_id: UUID) -> dict[str, Any]:
    canonical_run = _require_canonical_run(run_id)
    snapshot = _catalog_completed_snapshot(canonical_run.snapshot)
    return canonicalize_json(
        {
            "run_id": str(canonical_run.id),
            "snapshot_id": canonical_run.snapshot_hash,
            "snapshot": snapshot,
        }
    )


@router.get("/analysis-runs/{run_id}/results")
def get_analysis_run_results(run_id: UUID) -> dict[str, Any]:
    canonical_run = _require_canonical_run(run_id)
    if canonical_run.status != "FINISHED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Wyniki obliczenia {run_id} są niedostępne (status={canonical_run.status})",
        )
    return canonicalize_json(build_result_items(canonical_run))


@router.get("/analysis-runs/{run_id}/overlay")
def get_analysis_run_overlay(
    run_id: UUID,
    diagram_id: UUID = Query(...),
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
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
            detail="Ślad obliczeniowy niedostępny dla tego obliczenia",
        )
    return canonicalize_json({"trace": trace_payload})


@router.get("/analysis-runs/{run_id}/trace/summary")
def get_analysis_run_trace_summary(run_id: UUID) -> dict[str, Any]:
    trace_payload = build_run_trace_payload(_require_canonical_run(run_id))
    if trace_payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ślad obliczeniowy niedostępny dla tego obliczenia",
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


def _analysis_run_filename_stem(run: CanonicalRun, suffix: str) -> str:
    analysis_label = str(run.analysis_type).replace("_", "-")
    return f"{suffix}-{analysis_label}"


def _latex_escape(value: object) -> str:
    text = str(value)
    return (
        text.replace("\\", r"\textbackslash{}")
        .replace("&", r"\&")
        .replace("%", r"\%")
        .replace("$", r"\$")
        .replace("#", r"\#")
        .replace("_", r"\_")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace("~", r"\textasciitilde{}")
        .replace("^", r"\textasciicircum{}")
    )


def _proof_latex_response(run: CanonicalRun) -> Response:
    payload = build_analysis_run_trace_export_payload(run)
    trace = payload.get("white_box_trace") or []
    lines = [
        r"\documentclass[11pt]{article}",
        r"\usepackage[utf8]{inputenc}",
        r"\usepackage[T1]{fontenc}",
        r"\usepackage[polish]{babel}",
        r"\usepackage{longtable}",
        r"\usepackage{geometry}",
        r"\geometry{margin=20mm}",
        r"\begin{document}",
        r"\section*{Uzasadnienie inżynierskie obliczeń}",
        rf"\textbf{{Obliczenie:}} {_latex_escape(run.id)}\\",
        rf"\textbf{{Typ analizy:}} {_latex_escape(run.analysis_type)}\\",
        rf"\textbf{{Wersja modelu użyta do obliczeń:}} {_latex_escape(payload.get('snapshot_id') or 'brak danych')}\\",
        rf"\textbf{{Skrót danych wejściowych:}} {_latex_escape(payload.get('input_hash') or 'brak danych')}\\",
        r"\section*{Kroki obliczeniowe}",
    ]
    proof_currents = payload.get("short_circuit_proof_currents") or {}
    if proof_currents:
        lines.extend(
            [
                r"\section*{Prady charakterystyczne SC3F}",
                r"\begin{longtable}{llll}",
                r"Obiekt & \verb|I_dyn| [kA] & \verb|I_th| [kA] & Norma \\",
                r"\hline",
            ]
        )
        for row in (proof_currents.get("rows") or [])[:100]:
            i_dyn = (row.get("I_dyn") or {}).get("value_ka")
            i_th = (row.get("I_th") or {}).get("value_ka")
            lines.append(
                " & ".join(
                    [
                        _latex_escape(
                            row.get("target_name") or row.get("target_id") or "brak danych"
                        ),
                        _latex_escape(
                            f"{i_dyn:.4g}" if isinstance(i_dyn, int | float) else "brak danych"
                        ),
                        _latex_escape(
                            f"{i_th:.4g}" if isinstance(i_th, int | float) else "brak danych"
                        ),
                        "IEC 60909",
                    ]
                )
                + r" \\"
            )
        lines.append(r"\end{longtable}")
    if not trace:
        lines.append("Brak danych śladu obliczeń.")
    for index, step in enumerate(trace, start=1):
        title = step.get("title") or step.get("description") or step.get("key") or f"Krok {index}"
        lines.extend(
            [
                rf"\subsection*{{{index}. {_latex_escape(title)}}}",
                rf"\textbf{{Faza:}} {_latex_escape(step.get('phase') or 'brak danych')}\\",
                rf"\textbf{{Obiekt:}} {_latex_escape(step.get('element_id') or step.get('target_id') or 'brak danych')}\\",
            ]
        )
        if step.get("formula_latex"):
            lines.append(r"\[")
            lines.append(str(step["formula_latex"]))
            lines.append(r"\]")
        if step.get("substitution"):
            lines.append(rf"\textbf{{Podstawienie:}} {_latex_escape(step['substitution'])}\\")
        if step.get("result") is not None:
            lines.append(rf"\textbf{{Wynik:}} {_latex_escape(canonicalize_json(step['result']))}\\")
        if step.get("unit_check"):
            lines.append(rf"\textbf{{Kontrola jednostek:}} {_latex_escape(step['unit_check'])}\\")
    lines.append(r"\end{document}")
    return Response(
        content="\n".join(lines),
        media_type="application/x-tex",
        headers={
            "Content-Disposition": f'attachment; filename="uzasadnienie_{run.id}.tex"',
        },
    )


@router.get("/analysis-runs/{run_id}/export/report/json")
def export_analysis_run_report_json(run_id: UUID) -> Response:
    run = _require_canonical_run(run_id)
    return export_run_report_json_response(
        run,
        filename_stem=_analysis_run_filename_stem(run, "raport"),
    )


@router.get("/analysis-runs/{run_id}/export/report/docx")
def export_analysis_run_report_docx(run_id: UUID) -> Response:
    run = _require_canonical_run(run_id)
    try:
        return export_run_report_docx_response(
            run,
            filename_stem=_analysis_run_filename_stem(run, "raport"),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


@router.get("/analysis-runs/{run_id}/export/report/pdf")
def export_analysis_run_report_pdf(run_id: UUID) -> Response:
    run = _require_canonical_run(run_id)
    try:
        return export_run_report_pdf_response(
            run,
            filename_stem=_analysis_run_filename_stem(run, "raport"),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


@router.get("/analysis-runs/{run_id}/export/proof/json")
def export_analysis_run_proof_json(run_id: UUID) -> Response:
    run = _require_canonical_run(run_id)
    payload = canonicalize_json(build_analysis_run_trace_export_payload(run))
    return Response(
        content=(
            payload
            if isinstance(payload, str)
            else json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
        ),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="uzasadnienie_{run.id}.json"',
        },
    )


@router.get("/analysis-runs/{run_id}/export/proof/latex")
def export_analysis_run_proof_latex(run_id: UUID) -> Response:
    return _proof_latex_response(_require_canonical_run(run_id))


@router.get("/analysis-runs/{run_id}/export/proof/pdf")
def export_analysis_run_proof_pdf(run_id: UUID) -> Response:
    run = _require_canonical_run(run_id)
    try:
        return export_run_trace_pdf_response(run, filename_stem="uzasadnienie")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


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
    return canonicalize_json(build_short_circuit_results_response(_require_canonical_run(run_id)))


@router.get("/analysis-runs/{run_id}/results/phase-state")
def get_phase_state_results(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(build_phase_state_results_response(_require_canonical_run(run_id)))


@router.get("/analysis-runs/{run_id}/results/dynamic-stability")
def get_dynamic_stability_results(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(
        build_dynamic_stability_results_response(_require_canonical_run(run_id))
    )


@router.get("/analysis-runs/{run_id}/results/dynamic-stability/time-series")
def get_dynamic_stability_time_series(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(
        build_dynamic_stability_time_series_response(_require_canonical_run(run_id))
    )


@router.get("/analysis-runs/{run_id}/results/automation-trace")
def get_automation_trace_results(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(
        build_automation_trace_results_response(_require_canonical_run(run_id))
    )


@router.get("/analysis-runs/{run_id}/results/source-compliance")
def get_source_compliance_results(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(
        build_source_compliance_results_response(_require_canonical_run(run_id))
    )


@router.get("/analysis-runs/{run_id}/results/trace")
def get_extended_trace(run_id: UUID) -> dict[str, Any]:
    return canonicalize_json(build_extended_trace_response(_require_canonical_run(run_id)))
