"""Końcówki API analiz interpretacyjnych OZE dla gotowych przebiegów.

- ``GET /api/oze-analysis/grid-strength?run_id=`` — siła sieci SCR/WSCR na bazie
  przebiegu zwarciowego (``short_circuit_sn``),
- ``GET /api/oze-analysis/reactive-adequacy?run_id=`` — adekwatność mocy biernej
  na bazie przebiegu rozpływu (``PF``),
- ``GET /api/oze-analysis/hosting-capacity?run_id=`` — zdolność przyłączeniowa
  sieci (ile jeszcze OZE zmieści węzeł) jako deterministyczny przegląd scenariuszy
  rozpływu na modelu przebiegu (``PF``),
- ``GET /api/oze-analysis/pq-area?run_id=&bus_ref=`` — obszar bezpiecznej pracy
  P–Q wskazanego węzła jako deterministyczna siatka scenariuszy rozpływu (``PF``),
- ``GET /api/oze-analysis/osd-response?run_id=&source_ref=&command=`` — symulacja
  odpowiedzi źródła na polecenie OSD jako porównanie dwóch biegów rozpływu
  (bazowy + z poleceniem) na modelu przebiegu (``PF``),
- ``GET /api/oze-analysis/compensation-sizing?run_id=&bus_ref=&cos_phi_min=&uwzglednij_noc=``
  — dobór kompensacji mocy biernej z katalogu baterii kondensatorów jako
  deterministyczny przegląd rekordów katalogu (rosnąco po mocy) na modelu przebiegu
  (``PF``).

Warstwa PREZENTACJI/API: ładuje przebieg (404 gdy brak), deleguje mapowanie do
serwisów aplikacyjnych (ZERO fizyki) i zwraca zserializowany widok 1:1 z buildera
interpretacji. Zły rodzaj przebiegu → 422 z komunikatem w języku polskim.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.analyses.dobor_kompensacji import build_compensation_sizing_view
from application.analyses.frt_trajektorie import build_frt_trajectories_view
from application.analyses.grid_strength import build_grid_strength_view
from application.analyses.hosting_capacity import (
    DEFAULT_MAX_STEPS,
    DEFAULT_STEP_MW,
    build_hosting_capacity_view,
)
from application.analyses.odpowiedz_osd import (
    DEFAULT_DEADBAND_HZ,
    DEFAULT_F0_HZ,
    build_osd_response_view,
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


@router.get("/api/oze-analysis/compensation-sizing")
def get_compensation_sizing(
    run_id: UUID = Query(...),
    bus_ref: str = Query(...),
    cos_phi_min: float = Query(...),
    uwzglednij_noc: bool = Query(default=False),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_compensation_sizing_view(
            run,
            bus_ref=bus_ref,
            cos_phi_min=cos_phi_min,
            uwzglednij_noc=uwzglednij_noc,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/oze-analysis/frt-trajectories")
def get_frt_trajectories(
    der_ref: str = Query(...),
    operator_id: str = Query(...),
    test_kind: str = Query(...),
) -> dict[str, Any]:
    converter = get_default_mv_catalog().get_converter_type(der_ref)
    if converter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Moduł DER '{der_ref}' nie istnieje w katalogu przekształtników.",
        )
    try:
        profile = load_nc_rfg_profile(operator_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    try:
        return build_frt_trajectories_view(converter, profile, test_kind)
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


@router.get("/api/oze-analysis/osd-response")
def get_osd_response(
    run_id: UUID = Query(...),
    source_ref: str = Query(...),
    command: str = Query(...),
    p_limit_pct: float | None = Query(default=None),
    q_mvar: float | None = Query(default=None),
    cos_phi: float | None = Query(default=None),
    q_charakter: str | None = Query(default=None),
    frequency_hz: float | None = Query(default=None),
    droop_pct: float | None = Query(default=None),
    deadband_hz: float = Query(default=DEFAULT_DEADBAND_HZ),
    f0_hz: float = Query(default=DEFAULT_F0_HZ),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_osd_response_view(
            run,
            source_ref=source_ref,
            command=command,
            p_limit_pct=p_limit_pct,
            q_mvar=q_mvar,
            cos_phi=cos_phi,
            q_charakter=q_charakter,
            frequency_hz=frequency_hz,
            droop_pct=droop_pct,
            deadband_hz=deadband_hz,
            f0_hz=f0_hz,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
