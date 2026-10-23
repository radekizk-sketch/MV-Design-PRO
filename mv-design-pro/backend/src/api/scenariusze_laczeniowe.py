"""Końcówki scenariuszy łączeniowych — stan łącznika i wyłączenie elementu bez zmiany modelu
bazowego (W5-C, karta GPZ-H5).

PO CO. Model bazowy niesie bieżące położenie łącznika (``status``, operacje
``open_switch``/``close_switch``) i pozycję normalną (``normal_state``,
``set_normal_open_point``). Analiza wariantu łączeniowego („co, jeśli otworzę łącznik
sekcyjny”, „utrata linii zasilającej L1”, „utrata transformatora TR1 i zamknięty łącznik
szyn SN”) nie może przestawiać modelu projektu — robi to scenariusz roboczy: położenia
``OperatingScenario.switch_states`` i elementy wyłączone z eksploatacji
``OperatingScenario.out_of_service`` (N-1: element nieobecny w migawce), stosowane przez
``apply_scenario`` do migawki efektywnej (ADR-017), którą czyta assembler rozpływu i zwarć.
Te końcówki dają scenariuszowi tok pracy, reużywając istniejących mechanizmów:

* ``GET  /api/scenariusze-laczeniowe/study-cases/{case_id}`` — scenariusze nazwane projektu
  ze stanami łączników albo wyłączeniami (kolejność magazynu);
* ``POST /api/scenariusze-laczeniowe/study-cases/{case_id}`` — zapis scenariusza nazwanego
  (nowy albo nowa rewizja istniejącego) po kontroli przystawania do modelu
  (``apply_scenario`` — łącznik musi istnieć i być łącznikiem albo bezpiecznikiem, element
  wyłączany — należeć do kolekcji ``KOLEKCJE_WYLACZALNE``).

Bieg ze scenariuszem tworzy ISTNIEJĄCA końcówka ``POST /api/execution/study-cases/{case_id}/runs``
z polem ``scenario_id`` (migawka efektywna, koperta rewizji ze scenariuszem) — bez nowej kolejki.
"""

from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from api.klucz_twin_dep import KluczTwin
from enm.scenariusze import (
    KOLEKCJE_WYLACZALNE,
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
    """Scenariusz nazwany ze stanami łączników i wyłączeniami elementów — nowy
    (``scenario_id`` pominięte) albo nowa rewizja istniejącego (``scenario_id`` podane).

    Pole pominięte (``None``) w nowej rewizji zachowuje wartość poprzedniej rewizji, w nowym
    scenariuszu oznacza brak nadpisań tego rodzaju; scenariusz po zapisie musi zmieniać stan
    łączeniowy (choć jeden stan łącznika albo jedno wyłączenie)."""

    scenario_id: str | None = Field(None, description="Identyfikator istniejącego scenariusza")
    name: str = Field(..., min_length=1, description="Nazwa scenariusza")
    switch_states: dict[str, Literal["closed", "open"]] | None = Field(
        None, description="Łącznik (ref_id) → położenie w scenariuszu"
    )
    out_of_service: list[str] | None = Field(
        None,
        description=(
            "Elementy wyłączone z eksploatacji w scenariuszu (ref_id; gałąź, transformator, "
            "źródło, wytwórca, odbiór, bateria kondensatorów) — nieobecne w migawce efektywnej"
        ),
    )


def _wpis_scenariusza(scenariusz: OperatingScenario) -> dict[str, Any]:
    return {
        "scenario_id": scenariusz.scenario_id,
        "name": scenariusz.name,
        "revision": scenariusz.revision,
        "hash": scenariusz.hash,
        "switch_states": dict(sorted(scenariusz.switch_states.items())),
        "out_of_service": list(scenariusz.out_of_service),
    }


def _odmowa(pole: str, komunikat: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=[{"pole": pole, "komunikat": komunikat}],
    )


@router.get("/study-cases/{case_id}")
def get_scenariusze_laczeniowe(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Scenariusze nazwane projektu ze stanami łączników albo wyłączeniami elementów
    (kolejność magazynu)."""
    wpisy = [
        _wpis_scenariusza(s)
        for s in lista_scenariuszy(klucz)
        if s.switch_states or s.out_of_service
    ]
    return {"scenariusze": wpisy, "count": len(wpisy)}


@router.post("/study-cases/{case_id}", status_code=status.HTTP_201_CREATED)
def post_scenariusz_laczeniowy(
    case_id: str, klucz: KluczTwin, zadanie: ZapisScenariuszaLaczeniowego
) -> dict[str, Any]:
    """Zapisz scenariusz nazwany ze stanami łączników i wyłączeniami elementów.

    422 — stan wskazuje element, którego model nie ma, albo element niebędący łącznikiem;
    wyłączenie wskazuje element spoza kolekcji wyłączalnych albo powtarza element; scenariusz
    bez żadnego stanu i wyłączenia. 404 — ``scenario_id`` nieistniejące. Nowa rewizja
    istniejącego scenariusza zachowuje jego pozostałe nadpisania (harmonogram dynamiki,
    nastawy) i pola pominięte w żądaniu. Lista wyłączeń jest zapisywana w kolejności
    ``ref_id`` — ta sama treść scenariusza daje ten sam odcisk niezależnie od kolejności
    zaznaczeń w formularzu (determinizm).
    """
    poprzedni: OperatingScenario | None = None
    if zadanie.scenario_id is not None:
        try:
            poprzedni = wczytaj_scenariusz(klucz, zadanie.scenario_id)
        except ScenariuszNieistniejeError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if zadanie.out_of_service is not None:
        powtorzone = sorted(
            {r for r in zadanie.out_of_service if zadanie.out_of_service.count(r) > 1}
        )
        if powtorzone:
            raise _odmowa(
                f"out_of_service.{powtorzone[0]}",
                "Scenariusz nie przystaje do modelu: element wyłączony z eksploatacji jest "
                "wskazany więcej niż raz — wskaż każdy element jeden raz.",
            )
    stany = (
        zadanie.switch_states
        if zadanie.switch_states is not None
        else (dict(poprzedni.switch_states) if poprzedni is not None else {})
    )
    wylaczone = (
        tuple(sorted(zadanie.out_of_service))
        if zadanie.out_of_service is not None
        else (poprzedni.out_of_service if poprzedni is not None else ())
    )
    if not stany and not wylaczone:
        raise _odmowa(
            "switch_states",
            "Scenariusz łączeniowy nie zmienia stanu sieci — wskaż położenie choć jednego "
            "łącznika albo choć jeden element wyłączony z eksploatacji.",
        )
    scenariusz = OperatingScenario.model_validate(
        {
            **(
                poprzedni.model_dump(mode="json")
                if poprzedni is not None
                else {
                    "scenario_id": str(uuid4()),
                    "kind": RodzajScenariusza.CUSTOM.value,
                }
            ),
            "name": zadanie.name,
            "switch_states": stany,
            "out_of_service": list(wylaczone),
        }
    )
    enm = get_enm(klucz)
    try:
        apply_scenario(enm, scenariusz)
    except ScenariuszNieprzystajeError as exc:
        migawka = enm.model_dump(mode="json")
        istnieje = any(
            isinstance(e, dict) and e.get("ref_id") == exc.ref_id
            for kolekcja in KOLEKCJE_WYLACZALNE
            for e in migawka.get(kolekcja) or []
        )
        wylaczenie = exc.ref_id in wylaczone and exc.ref_id not in stany
        # Element spoza modelu nie ma nazwy do pokazania — zdanie nazywa rolę wskazania.
        opis = (
            opis_elementu(migawka, exc.ref_id, "element")
            if istnieje
            else ("element wskazany do wyłączenia" if wylaczenie else "wskazany łącznik")
        )
        raise _odmowa(
            f"{'out_of_service' if wylaczenie else 'switch_states'}.{exc.ref_id}",
            f"Scenariusz nie przystaje do modelu: {opis} — {exc.powod}.",
        ) from exc
    return _wpis_scenariusza(zapisz_scenariusz(klucz, scenariusz))


__all__ = ["router"]
