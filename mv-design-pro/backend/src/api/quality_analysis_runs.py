"""Końcówki API jakości wyników dla gotowych przebiegów (fundament okna W-607).

- ``GET /api/quality/sanity-bounds?run_id=`` — wiarygodność Ik'' per węzeł na
  bazie przebiegu zwarciowego (``short_circuit_sn``),
- ``GET /api/quality/energy-validation?run_id=`` — walidacja energetyczna
  (obciążenia, odchylenia napięć, budżet strat, bilans Q) na bazie przebiegu
  rozpływu (``PF``),
- ``GET /api/quality/flicker?run_id=`` — ocena migotania (Pst/Plt) i szybkich
  zmian napięcia źródeł falownikowych wg IEC/TR 61000-3-7 na bazie przebiegu
  zwarciowego (``short_circuit_sn``),
- ``POST /api/quality/as-built-compliance`` — raport zgodności powykonawczej:
  porównanie pomiarów z obiektu (lista JSON lub tekst CSV w body) z wynikiem
  FROZEN rozpływu (``PF``) i jawnymi tolerancjami (POST — jedyna końcówka rodziny
  z body, uzasadnione rozmiarem danych pomiarowych).

Warstwa PREZENTACJI/API: ładuje przebieg (404 gdy brak), deleguje mapowanie i
serializację do serwisów aplikacyjnych (ZERO fizyki) i zwraca zserializowany
widok. Zły rodzaj przebiegu / błąd danych → 422 z komunikatem w języku polskim.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.analyses.arc_flash_view import build_arc_flash_view
from application.analyses.energy_validation.service import build_energy_validation_view
from application.analyses.migotanie import build_migotanie_view
from application.analyses.sanity_bounds import build_sanity_bounds_view
from application.analyses.zgodnosc_powykonawcza import (
    build_zgodnosc_powykonawcza_view,
    parse_measurements_csv,
)
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

router = APIRouter(tags=["quality-analysis"])


class PomiarWejscie(BaseModel):
    """Pojedynczy pomiar z obiektu (rejestrator/pomiar odbiorowy)."""

    element_ref: str
    wielkosc: str
    wartosc: float
    jednostka: str


class TolerancjeWejscie(BaseModel):
    """Jawne tolerancje odbioru [%] (No-Heuristics — bez wartości domyślnych)."""

    napiecie_pct: float | None = None
    moc_pct: float | None = None


class ZgodnoscZadanie(BaseModel):
    """Żądanie raportu zgodności powykonawczej."""

    run_id: UUID
    pomiary: list[PomiarWejscie] | None = None
    csv: str | None = None
    tolerancje: TolerancjeWejscie | None = None


class ArcFlashZadanie(BaseModel):
    """Żądanie analizy Arc Flash (IEEE 1584-2018) dla gotowego przebiegu zwarciowego.

    Ik'' i napięcie węzła pochodzą z przebiegu; parametry projektowe (odległość robocza,
    odstęp elektrod, czas wyłączenia, konfiguracja elektrod, typ obudowy) — z żądania.
    """

    run_id: UUID
    working_distance_mm: float | None = None
    conductor_gap_mm: float | None = None
    arc_time_s: float | None = None
    electrode_config: str = "VCB"
    enclosure_type: str = "Typical"


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


@router.get("/api/quality/flicker")
def get_flicker(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_migotanie_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/api/quality/as-built-compliance")
def post_as_built_compliance(zadanie: ZgodnoscZadanie) -> dict[str, Any]:
    run = _require_run(zadanie.run_id)
    try:
        if zadanie.csv is not None and zadanie.csv.strip():
            pomiary: list[dict[str, Any]] = parse_measurements_csv(zadanie.csv)
        elif zadanie.pomiary:
            pomiary = [pomiar.model_dump() for pomiar in zadanie.pomiary]
        else:
            raise ValueError("Brak pomiarów: podaj listę 'pomiary' albo tekst 'csv' w żądaniu.")
        tolerancje = zadanie.tolerancje.model_dump() if zadanie.tolerancje else {}
        return build_zgodnosc_powykonawcza_view(run, pomiary, tolerancje)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/api/quality/arc-flash")
def post_arc_flash(zadanie: ArcFlashZadanie) -> dict[str, Any]:
    run = _require_run(zadanie.run_id)
    try:
        return build_arc_flash_view(
            run,
            working_distance_mm=zadanie.working_distance_mm,
            conductor_gap_mm=zadanie.conductor_gap_mm,
            arc_time_s=zadanie.arc_time_s,
            electrode_config=zadanie.electrode_config,
            enclosure_type=zadanie.enclosure_type,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
