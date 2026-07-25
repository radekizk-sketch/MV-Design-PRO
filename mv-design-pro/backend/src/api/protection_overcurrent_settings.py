"""Nastawy zabezpieczenia nadpradowego (v0) w postaci PREZENTACYJNEJ.

Karta F-K5, dlug V12K-189. Wynik `protection.overcurrent.v0` konczyl dotad w kopercie
biegu i w doborze aparatu — projektant nie mial gdzie zobaczyc, ze nastawa jest
NIEDOSTEPNA i czego brakuje, zeby ja wyznaczyc. Ta koncowka wystawia gotowa projekcje
z warstwy interpretacji (`settings_presentation`): wartosc albo jawny stan „niedostepna
— uzupelnij dane" wraz z powodem i akcja naprawcza z kanonicznego rejestru kodow.

ZERO fizyki i ZERO doboru: czytamy zapisany wynik biegu, nie liczymy nastaw.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from api.dependencies import get_uow_factory
from application.analyses.protection.overcurrent.settings_presentation import (
    zbuduj_prezentacje_nastaw,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from infrastructure.persistence.unit_of_work import UnitOfWork

router = APIRouter(tags=["protection-overcurrent-settings"])

_TYP_BIEGU = "protection.overcurrent.v0"


def _nastawy_z_biegu(meta_json: dict[str, Any] | None) -> dict[str, Any] | None:
    """Zestaw nastaw z metadanych biegu (raport albo artefakt nastaw)."""
    if not isinstance(meta_json, dict):
        return None
    raport = meta_json.get("protection_report_v0")
    if isinstance(raport, dict):
        nastawy = raport.get("settings")
        if isinstance(nastawy, dict):
            return nastawy
    nastawy = meta_json.get("protection_settings_v0")
    return nastawy if isinstance(nastawy, dict) else None


@router.get("/api/protection/overcurrent-settings")
def get_overcurrent_settings(
    run_id: str | None = Query(default=None),
    case_id: str | None = Query(default=None),
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Nastawy biegu `protection.overcurrent.v0` + projekcja prezentacyjna.

    Wskaz `run_id` (konkretny bieg) albo `case_id` (NAJNOWSZY bieg nastaw przypadku
    — wybor nalezy do backendu, bo to on zna porzadek biegow; UI nie sortuje).
    404 gdy biegu nie ma, 422 gdy bieg jest innego typu albo nie niesie nastaw —
    zamiast pustej struktury, ktora w UI wygladalaby jak „brak naruszen".
    """
    if (run_id is None) == (case_id is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Podaj dokladnie jedno: run_id albo case_id.",
        )

    with uow_factory() as uow:
        if run_id is not None:
            entry = uow.analysis_runs_index.get(run_id)
        else:
            # Repozytorium zwraca biegi od NAJNOWSZEGO (created_at, potem run_id) —
            # kolejnosc jest deterministyczna, wiec pierwszy wpis to wlasciwy bieg.
            biegi = uow.analysis_runs_index.list(
                case_id=case_id, analysis_type=_TYP_BIEGU, limit=1, offset=0
            )
            entry = biegi[0] if biegi else None
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nie znaleziono biegu nastaw zabezpieczen.",
        )
    if entry.analysis_type != _TYP_BIEGU:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bieg {run_id} nie jest analiza nastaw nadpradowych ({_TYP_BIEGU}).",
        )
    nastawy = _nastawy_z_biegu(entry.meta_json)
    if nastawy is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Bieg nie niesie zestawu nastaw — uruchom analize nastaw ponownie.",
        )

    return {
        "run_id": entry.run_id,
        "case_id": entry.case_id,
        "analysis_type": entry.analysis_type,
        "status": entry.status,
        "nastawy": nastawy,
        "prezentacja": zbuduj_prezentacje_nastaw(nastawy),
    }
