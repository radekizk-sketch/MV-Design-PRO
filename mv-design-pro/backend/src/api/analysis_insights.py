"""Końcówki API widoków interpretacji (karta ROUTERY-4A — łańcuch router→UI).

Domykają cztery zdolności rejestru z gotowym modułem analizy i brakiem routera
(rewizja G-09 macierzy pokrycia, V12K-326):

- ``GET /api/insights/sensitivity?run_id=`` — wrażliwość wyników rozpływu
  (LF: czynniki wpływu na profil napięć; ogólna: wrażliwość marginesów) na
  bazie przebiegu rozpływu (``PF``),
- ``GET /api/insights/analysis-coverage?case_id=`` — pokrycie analizami
  przypadku (punktacja kompletności pakietu analiz + lista braków po polsku),
- ``GET /api/insights/network-boundary?case_id=`` — granica sieci (węzeł
  przyłączenia) z BIEŻĄCEGO modelu przypadku (interpretacja modelu, nie biegu),
- ``GET /api/insights/n-1-contingency?run_id=[&element_refs=]`` — macierz skutków
  kontyngencji N-1 (decyzja D8): dla każdego kwalifikowanego elementu (linia,
  kabel, transformator) wariant wejścia bez tego elementu + bieg ISTNIEJĄCEGO
  solvera rozpływu, a w wyniku przeciążenia, odchylenia napięć, odbiory bez
  zasilania i ranking dotkliwości. ``element_refs`` (wielokrotny) zawęża
  enumerację; bez niego liczone są wszystkie kwalifikowane elementy modelu,
- ``GET /api/insights/n-1-contingency/scope?run_id=`` — ZAPOWIEDŹ zakresu tej
  enumeracji: lista kwalifikowanych elementów do wyboru zakresu i koszt biegu
  wyrażony liczbą kontyngencji i liczbą biegów solvera. Czyta wyłącznie migawkę
  (zero biegów solvera), więc odpowiada natychmiast — po to, żeby inżynier
  decydował o kosztownym biegu N-1 ZNAJĄC jego rozmiar.

Warstwa PREZENTACJI/API: ładuje przebieg (404 gdy brak), deleguje mapowanie
i serializację do serwisów aplikacyjnych (ZERO fizyki) i zwraca zserializowany
widok. Zły rodzaj przebiegu / błąd danych → 422 z komunikatem po polsku.
Rozpływ niesymetryczny (S6) świadomie NIE ma tu końcówki — jego droga to
istniejący tor sieci referencyjnych (``/api/v1/reference-networks``).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from api.klucz_twin_dep import KluczTwin
from application.analyses.granice_sieci import build_granice_view
from application.analyses.kontyngencje_n1 import (
    build_kontyngencje_n1_view,
    build_kontyngencje_n1_zakres_view,
)
from application.analyses.pokrycie_analiz import build_pokrycie_view
from application.analyses.wrazliwosc_rozplywu import build_wrazliwosc_view
from enm.canonical_analysis import CanonicalRun
from enm.canonical_analysis import get_run as get_canonical_run
from fastapi import APIRouter, Depends, HTTPException, Query, status
from infrastructure.persistence.unit_of_work import UnitOfWork

router = APIRouter(tags=["analysis-insights"])


def _require_run(run_id: UUID) -> CanonicalRun:
    run = get_canonical_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Przebieg {run_id} nie istnieje.",
        )
    return run


@router.get("/api/insights/sensitivity")
def get_sensitivity(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_wrazliwosc_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/insights/analysis-coverage")
def get_analysis_coverage(case_id: str = Query(...)) -> dict[str, Any]:
    try:
        return build_pokrycie_view(case_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/insights/network-boundary")
def get_network_boundary(klucz: KluczTwin, case_id: str = Query(...)) -> dict[str, Any]:
    try:
        return build_granice_view(case_id, klucz)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/insights/n-1-contingency/scope")
def get_n_1_contingency_scope(run_id: UUID = Query(...)) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_kontyngencje_n1_zakres_view(run)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/api/insights/n-1-contingency")
def get_n_1_contingency(
    run_id: UUID = Query(...),
    element_refs: list[str] | None = Query(default=None),
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    run = _require_run(run_id)
    try:
        return build_kontyngencje_n1_view(run, element_refs=element_refs, uow_factory=uow_factory)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
