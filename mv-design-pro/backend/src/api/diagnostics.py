"""
API diagnostyki inżynierskiej ENM (v4.2).

Endpointy read-only, case-bound. Brak side-effects.

Endpoints:
    GET /api/cases/{case_id}/diagnostics
    GET /api/cases/{case_id}/diagnostics/preflight
    GET /api/cases/{case_id}/enm/diff
"""

from __future__ import annotations

import logging
from typing import Any

from diagnostics.diff import compute_enm_diff
from diagnostics.engine import DiagnosticEngine
from diagnostics.preflight import build_preflight_from_diagnostic_report
from fastapi import APIRouter, HTTPException, Query, Request
from network_model.core.graph import NetworkGraph
from network_model.core.snapshot import NetworkSnapshot

logger = logging.getLogger("mv_design_pro.api.diagnostics")

router = APIRouter(prefix="/api", tags=["diagnostics"])


def _get_graph_for_case(request: Request, case_id: str) -> NetworkGraph:
    """
    Resolve network graph for a given case.

    Attempts to load from UoW (persistence layer).
    Falls back to in-memory demo graph if UoW is not available.
    """
    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is not None:
        try:
            with uow_factory() as uow:
                # Try to load the snapshot for this case
                snapshot = uow.snapshots.get_by_case_id(case_id)
                if snapshot is not None:
                    return snapshot.graph
                # Try to load the latest project snapshot
                case = uow.study_cases.get(case_id)
                if case is not None:
                    snapshot = uow.snapshots.get_latest(case.project_id)
                    if snapshot is not None:
                        return snapshot.graph
        except Exception as exc:
            logger.warning(
                "Nie udało się załadować grafu z UoW dla case_id=%s: %s",
                case_id,
                exc,
            )

    raise HTTPException(
        status_code=404,
        detail=f"Nie znaleziono modelu sieci dla przypadku '{case_id}'",
    )


def _get_snapshot_for_case(request: Request, case_id: str) -> NetworkSnapshot:
    """Resolve network snapshot for a given case."""
    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is not None:
        try:
            with uow_factory() as uow:
                snapshot = uow.snapshots.get_by_case_id(case_id)
                if snapshot is not None:
                    return snapshot
                case = uow.study_cases.get(case_id)
                if case is not None:
                    snapshot = uow.snapshots.get_latest(case.project_id)
                    if snapshot is not None:
                        return snapshot
        except Exception as exc:
            logger.warning(
                "Nie udało się załadować snapshotu dla case_id=%s: %s",
                case_id,
                exc,
            )

    raise HTTPException(
        status_code=404,
        detail=f"Nie znaleziono snapshotu dla przypadku '{case_id}'",
    )


@router.get("/cases/{case_id}/diagnostics")
async def get_diagnostics(
    case_id: str,
    request: Request,
) -> dict[str, Any]:
    """
    Uruchom diagnostykę inżynierską ENM dla danego przypadku.

    Returns:
        DiagnosticReport jako JSON z listą problemów i macierzą analiz.
    """
    graph = _get_graph_for_case(request, case_id)
    engine = DiagnosticEngine()
    report = engine.run(graph)
    return report.to_dict()


@router.get("/cases/{case_id}/diagnostics/preflight")
async def get_preflight(
    case_id: str,
    request: Request,
) -> dict[str, Any]:
    """
    Uruchom pre-flight checks — macierz dostępności analiz przed RUN.

    Returns:
        PreflightReport jako JSON z tabelą analiz i ich statusami.
    """
    graph = _get_graph_for_case(request, case_id)
    engine = DiagnosticEngine()
    report = engine.run(graph)
    preflight = build_preflight_from_diagnostic_report(report)
    return preflight.to_dict()


@router.get("/cases/{case_id}/enm/diff")
async def get_enm_diff(
    case_id: str,
    request: Request,
    from_snapshot: str = Query(alias="from", description="ID snapshotu źródłowego"),
    to_snapshot: str = Query(alias="to", description="ID snapshotu docelowego"),
) -> dict[str, Any]:
    """
    Porównaj dwie rewizje ENM (techniczny diff).

    Query params:
        from: ID snapshotu źródłowego (starszego).
        to: ID snapshotu docelowego (nowszego).

    Returns:
        EnmDiffReport jako JSON z listą zmian.
    """
    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is None:
        raise HTTPException(status_code=503, detail="Brak dostępu do bazy danych")

    try:
        with uow_factory() as uow:
            snap_a = uow.snapshots.get(from_snapshot)
            snap_b = uow.snapshots.get(to_snapshot)
    except Exception as exc:
        logger.warning("Błąd ładowania snapshotów: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    if snap_a is None:
        raise HTTPException(
            status_code=404,
            detail=f"Nie znaleziono snapshotu '{from_snapshot}'",
        )
    if snap_b is None:
        raise HTTPException(
            status_code=404,
            detail=f"Nie znaleziono snapshotu '{to_snapshot}'",
        )

    diff_report = compute_enm_diff(snap_a, snap_b)
    return diff_report.to_dict()
