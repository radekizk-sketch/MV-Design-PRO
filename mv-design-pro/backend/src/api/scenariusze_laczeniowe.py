"""Końcówki scenariuszy łączeniowych — stan łącznika bez zmiany modelu bazowego (W5-C).

PO CO. Model bazowy niesie bieżące położenie łącznika (``status``, operacje
``open_switch``/``close_switch``) i pozycję normalną (``normal_state``,
``set_normal_open_point``). Analiza wariantu łączeniowego („co, jeśli otworzę łącznik
sekcyjny") nie może przestawiać modelu projektu — robi to scenariusz roboczy
``OperatingScenario.switch_states``, stosowany przez ``apply_scenario`` do migawki
efektywnej, którą czyta assembler rozpływu i zwarć. Te końcówki dają scenariuszowi tok
pracy, reużywając istniejących mechanizmów:

* ``GET  /api/scenariusze-laczeniowe/study-cases/{case_id}`` — scenariusze nazwane projektu
  ze stanami łączników (kolejność magazynu);
* ``POST /api/scenariusze-laczeniowe/study-cases/{case_id}`` — zapis scenariusza nazwanego
  (nowy albo nowa rewizja istniejącego) po kontroli przystawania do modelu
  (``apply_scenario`` — łącznik musi istnieć i być łącznikiem albo bezpiecznikiem).

Bieg ze scenariuszem tworzy ISTNIEJĄCA końcówka ``POST /api/execution/study-cases/{case_id}/runs``
z polem ``scenario_id`` (migawka efektywna, koperta rewizji ze scenariuszem) — bez nowej kolejki.
"""

from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from api.klucz_twin_dep import KluczTwin
from enm.scenariusze import (
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszNieistniejeError,
    ScenariuszNieprzystajeError,
    apply_scenario,
    lista_scenariuszy,
    wczytaj_scenariusz,
    zapisz_scenariusz,
)
from enm.slownik_komunikatow import opis_elementu
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/scenariusze-laczeniowe", tags=["scenariusze-laczeniowe"])


class ZapisScenariuszaLaczeniowego(BaseModel):
    """Scenariusz nazwany ze stanami łączników — nowy (``scenario_id`` pominięte) albo nowa
    rewizja istniejącego (``scenario_id`` podane)."""

    scenario_id: str | None = Field(None, description="Identyfikator istniejącego scenariusza")
    name: str = Field(..., min_length=1, description="Nazwa scenariusza")
    switch_states: dict[str, Literal["closed", "open"]] = Field(
        ..., min_length=1, description="Łącznik (ref_id) → położenie w scenariuszu"
    )


def _wpis_scenariusza(scenariusz: OperatingScenario) -> dict[str, Any]:
    return {
        "scenario_id": scenariusz.scenario_id,
        "name": scenariusz.name,
        "revision": scenariusz.revision,
        "hash": scenariusz.hash,
        "switch_states": dict(sorted(scenariusz.switch_states.items())),
    }


@router.get("/study-cases/{case_id}")
def get_scenariusze_laczeniowe(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Scenariusze nazwane projektu ze stanami łączników (kolejność magazynu)."""
    wpisy = [_wpis_scenariusza(s) for s in lista_scenariuszy(klucz) if s.switch_states]
    return {"scenariusze": wpisy, "count": len(wpisy)}


@router.post("/study-cases/{case_id}", status_code=status.HTTP_201_CREATED)
def post_scenariusz_laczeniowy(
    case_id: str, klucz: KluczTwin, zadanie: ZapisScenariuszaLaczeniowego
) -> dict[str, Any]:
    """Zapisz scenariusz nazwany ze stanami łączników.

    422 — stan wskazuje element, którego model nie ma, albo element niebędący łącznikiem;
    404 — ``scenario_id`` nieistniejące. Nowa rewizja istniejącego scenariusza zachowuje
    jego pozostałe nadpisania (harmonogram dynamiki, nastawy) — zmienia nazwę i stany.
    """
    poprzedni: OperatingScenario | None = None
    if zadanie.scenario_id is not None:
        try:
            poprzedni = wczytaj_scenariusz(klucz, zadanie.scenario_id)
        except ScenariuszNieistniejeError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    scenariusz = (
        poprzedni.model_copy(update={"name": zadanie.name, "switch_states": zadanie.switch_states})
        if poprzedni is not None
        else OperatingScenario(
            scenario_id=str(uuid4()),
            name=zadanie.name,
            kind=RodzajScenariusza.CUSTOM,
            switch_states=zadanie.switch_states,
        )
    )
    enm = get_enm(klucz)
    try:
        apply_scenario(enm, scenariusz)
    except ScenariuszNieprzystajeError as exc:
        migawka = enm.model_dump(mode="json")
        istnieje = any(g.get("ref_id") == exc.ref_id for g in migawka.get("branches", []))
        # Element spoza modelu nie ma nazwy do pokazania — zdanie nazywa rolę wskazania.
        opis = opis_elementu(migawka, exc.ref_id, "element") if istnieje else "wskazany łącznik"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[
                {
                    "pole": f"switch_states.{exc.ref_id}",
                    "komunikat": f"Scenariusz nie przystaje do modelu: {opis} — {exc.powod}.",
                }
            ],
        ) from exc
    return _wpis_scenariusza(zapisz_scenariusz(klucz, scenariusz))


__all__ = ["router"]
