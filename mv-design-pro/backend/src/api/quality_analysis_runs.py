"""Końcówki API jakości wyników dla gotowych przebiegów (fundament okna W-607).

- ``GET /api/quality/sanity-bounds?run_id=`` — wiarygodność Ik'' per węzeł na
  bazie przebiegu zwarciowego (``short_circuit_sn``),
- ``GET /api/quality/energy-validation?run_id=`` — walidacja energetyczna
  (obciążenia, odchylenia napięć, budżet strat, bilans Q) na bazie przebiegu
  rozpływu (``PF``).

Warstwa PREZENTACJI/API: ładuje przebieg (404 gdy brak), deleguje mapowanie i
serializację do serwisów aplikacyjnych (ZERO fizyki) i zwraca zserializowany
widok. Zły rodzaj przebiegu → 422 z komunikatem w języku polskim.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.sanity_bounds import build_sanity_bounds_view
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, HTTPException, Query, status

router = APIRouter(tags=["quality-analysis"])


def _require_run(run_id: UUID) -> CanonicalRun:
    run = get_canonical_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przebieg {run_id} nie istnieje.",
        )
    return run


@router.get("/api/quality/sanity-bounds")
def get_sanity_bounds(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_sanity_bounds_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/quality/energy-validation")
def get_energy_validation(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_energy_validation_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
