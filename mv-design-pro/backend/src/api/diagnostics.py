"""
API diagnostyki inżynierskiej ENM (v4.2).

Endpointy read-only, case-bound. Brak side-effects.

Endpoints:
    GET /api/cases/{case_id}/diagnostics
    GET /api/cases/{case_id}/diagnostics/preflight
    GET /api/cases/{case_id}/enm/diff
    GET /api/execution/runs/{run_id}/diagnostics

NAPRAWA MARTWEGO ODCZYTU (karta DIAGNOZA-PRZEBIEGU, D7). Do tej karty WSZYSTKIE
trasy tego modułu były trwale nieosiągalne: rozwiązywanie modelu wołało metody
repozytoriów, KTÓRE NIE ISTNIEJĄ — `uow.snapshots.get_by_case_id`,
`uow.snapshots.get_latest`, `uow.snapshots.get` (repozytorium ma
`get_snapshot` / `get_latest_snapshot` / `get_latest_snapshot_for_model`,
`infrastructure/persistence/repositories/snapshot_repository.py:34-61`) oraz
`uow.study_cases` (jednostka pracy wystawia `cases`,
`infrastructure/persistence/unit_of_work.py:60`). Każde takie wołanie kończyło
się `AttributeError`, który połykał blok `except Exception`, więc diagnostyka i
pre-flight zwracały ZAWSZE 404, a diff ZAWSZE 500 — niezależnie od danych.
Defekt przetrwał, bo moduł nie miał ANI JEDNEGO testu trasy (były wyłącznie
testy silnika i diff-a). Model przypadku rozwiązujemy teraz tak, jak robi to
żywa ścieżka tworzenia biegu (`enm/canonical_analysis.py::create_run`):
`enm.store.get_enm(case_id)` + `map_enm_to_network_graph`.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from application.analyses.diagnoza_przebiegu import zbuduj_diagnoze_dla_biegu
from diagnostics.diff import compute_enm_diff
from diagnostics.engine import DiagnosticEngine
from diagnostics.preflight import build_preflight_from_diagnostic_report
from enm.mapping import map_enm_to_network_graph
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, Query, Request
from network_model.core.graph import NetworkGraph

logger = logging.getLogger("mv_design_pro.api.diagnostics")

router = APIRouter(prefix="/api", tags=["diagnostics"])


def _get_graph_for_case(case_id: str) -> NetworkGraph:
    """
    Zbuduj graf sieci dla przypadku z BIEŻĄCEGO modelu ENM.

    Jedno źródło prawdy wspólne ze ścieżką liczenia: `create_run` bierze model
    tą samą funkcją `get_enm(case_id)`, więc diagnostyka opisuje dokładnie ten
    model, który pójdzie do solvera.
    """
    try:
        enm = get_enm(case_id)
    except Exception as exc:
        logger.warning(
            "Nie udało się wczytać modelu ENM dla case_id=%s: %s",
            case_id,
            exc,
        )
        raise HTTPException(
            status_code=404,
            detail=f"Nie znaleziono modelu sieci dla przypadku '{case_id}'",
        ) from exc
    return map_enm_to_network_graph(enm)


@router.get("/cases/{case_id}/diagnostics")
def get_diagnostics(case_id: str) -> dict[str, Any]:
    """
    Uruchom diagnostykę inżynierską ENM dla danego przypadku.

    Returns:
        DiagnosticReport jako JSON z listą problemów i macierzą analiz.
    """
    graph = _get_graph_for_case(case_id)
    engine = DiagnosticEngine()
    report = engine.run(graph)
    return report.to_dict()


@router.get("/cases/{case_id}/diagnostics/preflight")
def get_preflight(case_id: str) -> dict[str, Any]:
    """
    Uruchom pre-flight checks — macierz dostępności analiz przed RUN.

    Returns:
        PreflightReport jako JSON z tabelą analiz i ich statusami.
    """
    graph = _get_graph_for_case(case_id)
    engine = DiagnosticEngine()
    report = engine.run(graph)
    preflight = build_preflight_from_diagnostic_report(report)
    return preflight.to_dict()


@router.get("/cases/{case_id}/enm/diff")
def get_enm_diff(
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
            snap_a = uow.snapshots.get_snapshot(from_snapshot)
            snap_b = uow.snapshots.get_snapshot(to_snapshot)
    except Exception as exc:
        logger.warning("Błąd ładowania snapshotów: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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


@router.get("/execution/runs/{run_id}/diagnostics")
def get_run_diagnostics(run_id: UUID) -> dict[str, Any]:
    """
    Diagnoza pojedynczego biegu — dlaczego solver nie zbiegł (D7).

    Interpretacja ISTNIEJĄCYCH artefaktów biegu (wynik FROZEN + ślad WHITE BOX).
    Zero fizyki, zero ponownego liczenia — zbieżność publikuje solver.

    Returns:
        Kontrakt diagnozy przebiegu (kod diagnozy + dowód liczbowy).
    """
    try:
        return zbuduj_diagnoze_dla_biegu(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
