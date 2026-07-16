"""Końcówki API analiz interpretacyjnych OZE dla gotowych przebiegów.

- ``GET /api/oze-analysis/grid-strength?run_id=`` — siła sieci SCR/WSCR na bazie
  przebiegu zwarciowego (``short_circuit_sn``),
- ``GET /api/oze-analysis/reactive-adequacy?run_id=`` — adekwatność mocy biernej
  na bazie przebiegu rozpływu (``PF``),
- ``GET /api/oze-analysis/hosting-capacity?run_id=`` — zdolność przyłączeniowa
  sieci (ile jeszcze OZE zmieści węzeł) jako deterministyczny przegląd scenariuszy
  rozpływu na modelu przebiegu (``PF``),
- ``GET /api/oze-analysis/pq-area?run_id=&bus_ref=`` — obszar bezpiecznej pracy
  P–Q wskazanego węzła jako deterministyczna siatka scenariuszy rozpływu (``PF``).

Warstwa PREZENTACJI/API: ładuje przebieg (404 gdy brak), deleguje mapowanie do
serwisów aplikacyjnych (ZERO fizyki) i zwraca zserializowany widok 1:1 z buildera
interpretacji. Zły rodzaj przebiegu → 422 z komunikatem w języku polskim.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.analyses.grid_strength import build_grid_strength_view
from application.analyses.hosting_capacity import (
    DEFAULT_MAX_STEPS,
    DEFAULT_STEP_MW,
    build_hosting_capacity_view,
)
from application.analyses.pq_area import (
    DEFAULT_MAX_STEPS_P,
    DEFAULT_MAX_STEPS_Q,
    DEFAULT_STEP_P_MW,
    DEFAULT_STEP_Q_MVAR,
    build_pq_area_view,
)
from application.analyses.pq_coverage import build_pq_coverage_view
from application.analyses.reactive_adequacy import build_reactive_adequacy_view
from catalog.profiles.nc_rfg.loader import load_nc_rfg_profile
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, HTTPException, Query, status
from network_model.catalog.repository import get_default_mv_catalog

router = APIRouter(tags=["oze-analysis"])


def _require_run(run_id: UUID) -> CanonicalRun:
    run = get_canonical_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przebieg {run_id} nie istnieje.",
        )
    return run


@router.get("/api/oze-analysis/grid-strength")
def get_grid_strength(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_grid_strength_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/reactive-adequacy")
def get_reactive_adequacy(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_reactive_adequacy_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/hosting-capacity")
def get_hosting_capacity(
    run_id: UUID = Query(...),
    candidate_bus_refs: list[str] | None = Query(default=None),
    step_mw: float = Query(default=DEFAULT_STEP_MW),
    max_steps: int = Query(default=DEFAULT_MAX_STEPS),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_hosting_capacity_view(
            run,
            candidate_bus_refs=candidate_bus_refs,
            step_mw=step_mw,
            max_steps=max_steps,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/pq-area")
def get_pq_area(
    run_id: UUID = Query(...),
    bus_ref: str = Query(...),
    step_p_mw: float = Query(default=DEFAULT_STEP_P_MW),
    step_q_mvar: float = Query(default=DEFAULT_STEP_Q_MVAR),
    max_steps_p: int = Query(default=DEFAULT_MAX_STEPS_P),
    max_steps_q: int = Query(default=DEFAULT_MAX_STEPS_Q),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_pq_area_view(
            run,
            bus_ref=bus_ref,
            step_p_mw=step_p_mw,
            step_q_mvar=step_q_mvar,
            max_steps_p=max_steps_p,
            max_steps_q=max_steps_q,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/pq-coverage")
def get_pq_coverage(
    catalog_item_id: str = Query(...),
    operator_id: str = Query(...),
) -> dict[str, Any]:
    converter = get_default_mv_catalog().get_converter_type(catalog_item_id)
    if converter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Typ katalogowy '{catalog_item_id}' nie istnieje w katalogu przekształtników.",
        )
    try:
        profile = load_nc_rfg_profile(operator_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    try:
        return build_pq_coverage_view(converter, profile)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
