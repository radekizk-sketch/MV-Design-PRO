"""Zaleznosc FastAPI: tlumaczenie `case_id` (parametr sciezki) na klucz Canonical
Project Twin (CV-1-W).

KONTRAKT (docs/architecture/CANONICAL_DIGITAL_TWIN.md par 2, `enm/klucz_twin.py`,
`application/twin_key.py`): magazyn ENM jest kluczowany kluczem projektu
(`projekt:<uuid>`), nie `case_id`. `application.twin_key.klucz_twin_dla_przypadku`
jest JEDYNYM miejscem tlumaczenia `case_id -> klucz`; ten modul jest JEDYNYM
miejscem mapowania jej bledu (`PrzypadekBezProjektuError`) na odpowiedz HTTP w
warstwie API — kazdy handler uzywa tej samej funkcji, zeby komunikat 404 i
warunek wejscia byly wspolne (zakaz drugiego miejsca tlumaczenia, SS0 pkt 7).

`klucz_twin_z_sciezki` dziala W DWOJAKI SPOSOB:
  * jako zaleznosc FastAPI (`Depends(klucz_twin_z_sciezki)`) — `case_id` jest
    wtedy rozwiazywany z parametru sciezki `{case_id}` trasy, bo tak dziala
    wstrzykiwanie sub-zaleznosci FastAPI (nazwa parametru = nazwa segmentu
    sciezki biezacej trasy);
  * jako zwykle wywolanie funkcji z jawnym `case_id` (cialo zadania, parametr
    zapytania, identyfikator wyprowadzony z rekordu domenowego) — patrz karty
    `api/nn_proof.py`, `api/fault_scenarios.py`, `api/oze_analysis_runs.py`.

`klucz_twin_z_uow` jest niskopoziomowym rdzeniem obu sciezek — uzywany
BEZPOSREDNIO tam, gdzie `uow_factory` jest juz dostepny inaczej niz przez
`request.app.state` (np. wstrzykniety `Depends(get_uow_factory)`).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated, Any

from application.twin_key import klucz_twin_dla_przypadku
from enm.klucz_twin import PrzypadekBezProjektuError
from fastapi import Depends, HTTPException, Request


def klucz_twin_z_uow(case_id: str, uow_factory: Callable[[], Any] | None) -> str:
    """Rdzen tlumaczenia: `case_id` + `uow_factory` -> klucz magazynu ENM.

    Podnosi `HTTPException(404)` z polskim komunikatem, gdy przypadek nie
    nalezy do zadnego projektu (nie istnieje w bazie, `case_id` nie jest UUID,
    albo warstwa bazy jest niedostepna) — mapowanie `PrzypadekBezProjektuError`
    dzieje sie WYLACZNIE tutaj, zeby tresc komunikatu byla jedna dla calego API.
    """
    try:
        return klucz_twin_dla_przypadku(case_id, uow_factory)
    except PrzypadekBezProjektuError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Przypadek {case_id} nie należy do żadnego projektu",
        ) from exc


def klucz_twin_z_sciezki(case_id: str, request: Request) -> str:
    """Zaleznosc FastAPI: `case_id` z parametru sciezki -> klucz magazynu ENM.

    Wolna tez WPROST (poza `Depends`) dla `case_id` pochodzacego z ciala
    zadania, parametru zapytania albo rekordu domenowego — patrz docstring
    modulu.
    """
    uow_factory = getattr(request.app.state, "uow_factory", None)
    return klucz_twin_z_uow(case_id, uow_factory)


#: Adnotacja do uzycia w podpisach handlerow: `klucz: KluczTwin`. Dziala dla
#: KAZDEJ trasy z parametrem sciezki `{case_id}` — FastAPI rozwiazuje `case_id`
#: zaleznosci z tego samego segmentu adresu, ktory widzi handler.
KluczTwin = Annotated[str, Depends(klucz_twin_z_sciezki)]
