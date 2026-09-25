"""Końcówki toku pracy dynamiki czasowej `dynamika_rms` (karta AB-P1).

Bieg kanoniczny ma od karty W6-3B wykonawcę, zapis i odczyt wyniku, ale nie miał toku pracy
w interfejsie: nikt nie opisywał edytorowi rodzajów zdarzeń, nie było gdzie zapisać
nazwanego scenariusza z harmonogramem i nie było jak zobaczyć, dlaczego bieg odmówi.
Te końcówki domykają łańcuch, reużywając istniejących mechanizmów:

* `GET  /api/dynamika/opis-scenariusza` — rodzaje zdarzeń, pola, role referencji, zdolność
  rdzenia i nastawy solvera WPROST z kontraktów (`application.dynamika.opis_scenariusza`);
* `GET  /api/dynamika/study-cases/{case_id}/gotowosc` — bramka gotowości, braki modelu,
  stan modelu dynamicznego każdego wytwórcy z akcją naprawczą i biegi rozpływu tej samej
  migawki (`application.dynamika.gotowosc`);
* `GET/POST /api/dynamika/study-cases/{case_id}/scenariusze` — scenariusze NAZWANE z blokiem
  `dynamika` w istniejącym magazynie scenariuszy projektu (`enm.scenariusze.zapisz_scenariusz`);
  bieg z takiego scenariusza tworzy `POST /api/execution/study-cases/{case_id}/runs` z polem
  `scenario_id` — projekcja `opcje_biegu_ze_scenariusza` niesie harmonogram do opcji biegu.

Uruchomienie biegu, jego wykonanie i odpytywanie stanu idą ISTNIEJĄCĄ ścieżką wykonania
(`api/execution_runs.py`) — bez nowej kolejki.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from api.klucz_twin_dep import KluczTwin
from application.dynamika.gotowosc import gotowosc_dynamiki
from application.dynamika.opis_scenariusza import (
    opis_scenariusza_dynamicznego,
    pola_stanowiska_ustawione,
    tryb_sieci,
)
from enm.canonical_analysis import list_runs_for_case
from enm.scenariusze import (
    SCENARIUSZ_NORMALNY,
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszDynamiczny,
    ScenariuszNieistniejeError,
    ScenariuszNieprzystajeError,
    apply_scenario,
    lista_scenariuszy,
    wczytaj_scenariusz,
    zapisz_scenariusz,
)
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, ValidationError

router = APIRouter(prefix="/api/dynamika", tags=["dynamika"])


class ZapisScenariuszaDynamiki(BaseModel):
    """Scenariusz nazwany z harmonogramem zdarzeń — nowy (`scenario_id` pominięte) albo
    nowa rewizja istniejącego (`scenario_id` podane)."""

    scenario_id: str | None = Field(None, description="Identyfikator istniejącego scenariusza")
    name: str = Field(..., min_length=1, description="Nazwa scenariusza")
    dynamika: dict[str, Any] = Field(..., description="Harmonogram: ScenariuszDynamiczny")


def _wpis_scenariusza(scenariusz: OperatingScenario) -> dict[str, Any]:
    assert scenariusz.dynamika is not None
    return {
        "scenario_id": scenariusz.scenario_id,
        "name": scenariusz.name,
        "revision": scenariusz.revision,
        "hash": scenariusz.hash,
        "dynamika": scenariusz.dynamika.model_dump(mode="json"),
    }


@router.get("/opis-scenariusza")
def get_opis_scenariusza() -> dict[str, Any]:
    """Opis rodzajów zdarzeń i nastaw solvera dla edytora scenariusza (z kontraktów)."""
    return opis_scenariusza_dynamicznego()


@router.get("/study-cases/{case_id}/gotowosc")
def get_gotowosc_dynamiki(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Gotowość biegu `dynamika_rms` dla modelu przypadku (patrz docstring modułu)."""
    enm = get_enm(klucz)
    migawka_hash = apply_scenario(enm, SCENARIUSZ_NORMALNY).snapshot_hash
    biegi = [
        {
            "run_id": str(bieg.id),
            "created_at": bieg.created_at.isoformat(),
            "finished_at": bieg.finished_at.isoformat() if bieg.finished_at else None,
        }
        for bieg in list_runs_for_case(case_id)
        if bieg.analysis_type == "PF"
        and bieg.status == "FINISHED"
        and bieg.snapshot_hash == migawka_hash
    ]
    biegi.sort(key=lambda wpis: (wpis["created_at"], wpis["run_id"]), reverse=True)
    return gotowosc_dynamiki(enm, biegi)


@router.get("/study-cases/{case_id}/scenariusze")
def get_scenariusze_dynamiki(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Scenariusze nazwane projektu niosące harmonogram zdarzeń w trybie SIECI (kolejność
    magazynu) — scenariusz stanowiska badawczego nie należy do tego ekranu (`tryb_sieci`)."""
    wpisy = [
        _wpis_scenariusza(s)
        for s in lista_scenariuszy(klucz)
        if s.dynamika is not None and tryb_sieci(s.dynamika)
    ]
    return {"scenariusze": wpisy, "count": len(wpisy)}


@router.post("/study-cases/{case_id}/scenariusze", status_code=status.HTTP_201_CREATED)
def post_scenariusz_dynamiki(
    case_id: str, klucz: KluczTwin, zadanie: ZapisScenariuszaDynamiki
) -> dict[str, Any]:
    """Zapisz scenariusz nazwany z harmonogramem (walidacja kontraktu i ról referencji).

    422 — harmonogram niezgodny z kontraktem `ScenariuszDynamiczny`, w trybie stanowiska
    badawczego (ekran pracuje w trybie sieci — `tryb_sieci`) albo wskazujący element, którego
    model nie ma (lub ma w innej roli); 404 — `scenario_id` nieistniejące.
    """
    try:
        harmonogram = ScenariuszDynamiczny.model_validate(zadanie.dynamika)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[
                {"pole": ".".join(str(c) for c in blad["loc"]), "komunikat": blad["msg"]}
                for blad in exc.errors(include_url=False, include_context=False)
            ],
        ) from exc
    if pola_stanowiska := pola_stanowiska_ustawione(harmonogram):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[
                {
                    "pole": f"dynamika.{pole}",
                    "komunikat": (
                        "Stanowisko badawcze (źródło testowe o profilu U/f/faza) nie jest "
                        "scenariuszem sieci — ekran dynamiki czasowej zapisuje wyłącznie "
                        "zakłócenia sieci projektu."
                    ),
                }
                for pole in pola_stanowiska
            ],
        )
    if zadanie.scenario_id is not None:
        try:
            wczytaj_scenariusz(klucz, zadanie.scenario_id)
        except ScenariuszNieistniejeError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    scenariusz = OperatingScenario(
        scenario_id=zadanie.scenario_id or str(uuid4()),
        name=zadanie.name,
        kind=RodzajScenariusza.CUSTOM,
        dynamika=harmonogram,
    )
    try:
        apply_scenario(get_enm(klucz), scenariusz)
    except ScenariuszNieprzystajeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"pole": exc.ref_id, "komunikat": str(exc)}],
        ) from exc
    return _wpis_scenariusza(zapisz_scenariusz(klucz, scenariusz))


__all__ = ["router"]
