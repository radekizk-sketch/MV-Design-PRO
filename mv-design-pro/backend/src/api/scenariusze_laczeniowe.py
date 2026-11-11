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
  (``apply_scenario`` — łącznik musi istnieć i być łącznikiem albo bezpiecznikiem). Ten sam
  scenariusz niesie wybór przypadku dla zabezpieczeń (ADR-022, karta OCHRONA-JEDNO-ZRODLO):
  ``protection_groups`` (grupa nastaw 1–4 sterownika) i ``protection_overrides`` (delta nastaw
  funkcji w grupie efektywnej) — model bazowy bez zmian, sprzeczna nastawa = 422.

Bieg ze scenariuszem tworzy ISTNIEJĄCA końcówka ``POST /api/execution/study-cases/{case_id}/runs``
z polem ``scenario_id`` (migawka efektywna, koperta rewizji ze scenariuszem) — bez nowej kolejki.

Wybór zabezpieczeń PRZYPADKU (ADR-022, karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN) — ten sam
kontrakt delty (``protection_groups``/``protection_overrides``), ta sama kontrola przystawania
(``apply_scenario`` → ``bledy_sterownika``), nośnik: scenariusz o identyfikatorze wyprowadzonym
z przypadku (``enm.scenariusze.id_scenariusza_przypadku``), nakładany przez ``create_run`` na
każdy bieg tego przypadku:

* ``GET  /api/scenariusze-laczeniowe/study-cases/{case_id}/zabezpieczenia-przypadku`` — bieżący
  wybór przypadku (pusty, gdy przypadek nie ma wyboru);
* ``PUT  /api/scenariusze-laczeniowe/study-cases/{case_id}/zabezpieczenia-przypadku`` — pełny
  stan wyboru (nowa rewizja; pusty stan zdejmuje wybór nagrobkiem);
* ``GET  /api/scenariusze-laczeniowe/study-cases/{case_id}/zabezpieczenia-przypadkow`` — wybory
  WSZYSTKICH przypadków projektu (znacznik „w przypadku X nadpisane" w karcie pola).
"""

from __future__ import annotations

from typing import Annotated, Any, Literal
from uuid import uuid4

from api.klucz_twin_dep import KluczTwin
from enm.models import EnergyNetworkModel
from enm.scenariusze import (
    PREFIKS_SCENARIUSZA_PRZYPADKU,
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszNieistniejeError,
    ScenariuszNieprzystajeError,
    apply_scenario,
    czy_scenariusz_przypadku,
    id_scenariusza_przypadku,
    lista_scenariuszy,
    scenariusz_przypadku,
    usun_scenariusz,
    wczytaj_scenariusz,
    wybor_przypadku,
    zapisz_scenariusz,
)
from enm.slownik_komunikatow import opis_elementu
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

router = APIRouter(prefix="/api/scenariusze-laczeniowe", tags=["scenariusze-laczeniowe"])


class ZapisScenariuszaLaczeniowego(BaseModel):
    """Scenariusz nazwany ze stanami łączników — nowy (``scenario_id`` pominięte) albo nowa
    rewizja istniejącego (``scenario_id`` podane)."""

    scenario_id: str | None = Field(None, description="Identyfikator istniejącego scenariusza")
    name: str = Field(..., min_length=1, description="Nazwa scenariusza")
    switch_states: dict[str, Literal["closed", "open"]] = Field(
        default_factory=dict, description="Łącznik (`ref_id`) → położenie w scenariuszu"
    )
    protection_groups: dict[str, Annotated[int, Field(ge=1, le=4)]] = Field(
        default_factory=dict,
        description="Sterownik zabezpieczeń (identyfikator) → grupa nastaw 1–4 wybrana w przypadku",
    )
    protection_overrides: dict[str, dict[str, dict[str, float | str | bool | None]]] = Field(
        default_factory=dict,
        description=(
            "Delta nastaw przypadku: sterownik (identyfikator) → funkcja (identyfikator) → "
            "nastawa ze schematu rejestru funkcji → wartość (wartość pusta zdejmuje nastawę)"
        ),
    )

    @model_validator(mode="after")
    def _niepusty(self) -> ZapisScenariuszaLaczeniowego:
        # Scenariusz bez żadnej delty nie różni się od stanu normalnego modelu — odmowa
        # kontraktu (422), jak dawniej pusta lista stanów łączników.
        if not (self.switch_states or self.protection_groups or self.protection_overrides):
            # Błąd walidacji kontraktu (422) — nie goły ValueError trasy
            # (`polykanie_wyjatkow_guard`: odmowa trasy nie jest wyjątkiem ogólnym).
            raise PydanticCustomError(
                "scenariusz_bez_delty",
                "scenariusz musi zmieniać stan łącznika albo grupę lub nastawy zabezpieczeń",
            )
        return self


#: Typ delty nastaw przypadku: sterownik (ref_id) → funkcja (ref) → nastawa → wartość.
DeltaNastaw = dict[str, dict[str, dict[str, float | str | bool | None]]]


class ZapisWyboruZabezpieczenPrzypadku(BaseModel):
    """Pełny stan wyboru zabezpieczeń przypadku — grupa nastaw i nadpisania nastaw sterowników.

    Pusty stan (oba słowniki puste) zdejmuje wybór: przypadek liczy na nastawach bazowych."""

    protection_groups: dict[str, Annotated[int, Field(ge=1, le=4)]] = Field(
        default_factory=dict,
        description="Sterownik zabezpieczeń (identyfikator) → grupa nastaw 1–4 wybrana w przypadku",
    )
    protection_overrides: DeltaNastaw = Field(
        default_factory=dict,
        description=(
            "Nadpisania nastaw w przypadku: sterownik (identyfikator) → funkcja (identyfikator) "
            "→ nastawa ze schematu rejestru funkcji → wartość w grupie efektywnej przypadku"
        ),
    )


def _wpis_wyboru(case_id: str, scenariusz: OperatingScenario | None) -> dict[str, Any]:
    """Wybór zabezpieczeń przypadku w kontrakcie HTTP (pusty, gdy przypadek nie ma wyboru)."""
    if scenariusz is None:
        return {
            "case_id": case_id,
            "scenario_id": None,
            "revision": None,
            "hash": None,
            "protection_groups": {},
            "protection_overrides": {},
        }
    return {
        "case_id": case_id,
        "scenario_id": scenariusz.scenario_id,
        "revision": scenariusz.revision,
        "hash": scenariusz.hash,
        "protection_groups": dict(sorted(scenariusz.protection_groups.items())),
        "protection_overrides": scenariusz.tresc().get("protection_overrides", {}),
    }


def _sprawdz_przystawanie(
    enm: EnergyNetworkModel,
    scenariusz: OperatingScenario,
    protection_groups: dict[str, int],
    protection_overrides: DeltaNastaw,
) -> None:
    """Kontrola przystawania delty do modelu — 422 z polem odmowy i nazwą elementu."""
    try:
        apply_scenario(enm, scenariusz)
    except ScenariuszNieprzystajeError as exc:
        migawka = enm.model_dump(mode="json")
        # Rola wskazania z kluczy TEGO żądania (jedno źródło: pole odmowy = pole ładunku).
        if exc.ref_id in protection_groups:
            pole = "protection_groups"
        elif exc.ref_id in protection_overrides:
            pole = "protection_overrides"
        else:
            pole = "switch_states"
        sterownik = pole != "switch_states"
        kolekcja = "protection_assignments" if sterownik else "branches"
        istnieje = any(g.get("ref_id") == exc.ref_id for g in migawka.get(kolekcja, []))
        # Element spoza modelu nie ma nazwy do pokazania — zdanie nazywa rolę wskazania.
        rola = "wskazany sterownik zabezpieczeń" if sterownik else "wskazany łącznik"
        opis = opis_elementu(migawka, exc.ref_id, "element") if istnieje else rola
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[
                {
                    "pole": f"{pole}.{exc.ref_id}",
                    "komunikat": f"Scenariusz nie przystaje do modelu: {opis} — {exc.powod}.",
                }
            ],
        ) from exc


def _wpis_scenariusza(scenariusz: OperatingScenario) -> dict[str, Any]:
    return {
        "scenario_id": scenariusz.scenario_id,
        "name": scenariusz.name,
        "revision": scenariusz.revision,
        "hash": scenariusz.hash,
        "switch_states": dict(sorted(scenariusz.switch_states.items())),
        "protection_groups": dict(sorted(scenariusz.protection_groups.items())),
        "protection_overrides": scenariusz.tresc().get("protection_overrides", {}),
    }


@router.get("/study-cases/{case_id}")
def get_scenariusze_laczeniowe(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Scenariusze nazwane projektu ze stanami łączników (kolejność magazynu)."""
    wpisy = [
        _wpis_scenariusza(s)
        for s in lista_scenariuszy(klucz)
        # Wybór zabezpieczeń przypadku nie jest scenariuszem nazwanym projektu — ma własną
        # końcówkę i sekcję w karcie przypadku.
        if not czy_scenariusz_przypadku(s.scenario_id)
        and (s.switch_states or s.protection_groups or s.protection_overrides)
    ]
    return {"scenariusze": wpisy, "count": len(wpisy)}


@router.post("/study-cases/{case_id}", status_code=status.HTTP_201_CREATED)
def post_scenariusz_laczeniowy(
    case_id: str, klucz: KluczTwin, zadanie: ZapisScenariuszaLaczeniowego
) -> dict[str, Any]:
    """Zapisz scenariusz nazwany ze stanami łączników i wyborem przypadku dla zabezpieczeń.

    422 — stan wskazuje element, którego model nie ma, albo element niebędący łącznikiem;
    wybór grupy albo delta nastaw wskazuje sterownik spoza modelu, funkcję spoza sterownika
    albo nastawę sprzeczną ze schematem rejestru funkcji; 404 — ``scenario_id`` nieistniejące.
    Nowa rewizja istniejącego scenariusza zachowuje jego pozostałe nadpisania (harmonogram
    dynamiki, nastawy źródeł) — zmienia nazwę, stany łączników i deltę zabezpieczeń (żądanie
    niesie ich pełny stan).
    """
    poprzedni: OperatingScenario | None = None
    if zadanie.scenario_id is not None and czy_scenariusz_przypadku(zadanie.scenario_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[
                {
                    "pole": "scenario_id",
                    "komunikat": (
                        "To wybór zabezpieczeń przypadku obliczeniowego — zmienia się go w "
                        "karcie przypadku, nie jako scenariusz nazwany projektu."
                    ),
                }
            ],
        )
    if zadanie.scenario_id is not None:
        try:
            poprzedni = wczytaj_scenariusz(klucz, zadanie.scenario_id)
        except ScenariuszNieistniejeError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    delty = {
        "switch_states": zadanie.switch_states,
        "protection_groups": zadanie.protection_groups,
        "protection_overrides": zadanie.protection_overrides,
    }
    scenariusz = (
        poprzedni.model_copy(update={"name": zadanie.name, **delty})
        if poprzedni is not None
        else OperatingScenario(
            scenario_id=str(uuid4()), name=zadanie.name, kind=RodzajScenariusza.CUSTOM, **delty
        )
    )
    _sprawdz_przystawanie(
        get_enm(klucz), scenariusz, zadanie.protection_groups, zadanie.protection_overrides
    )
    return _wpis_scenariusza(zapisz_scenariusz(klucz, scenariusz))


@router.get("/study-cases/{case_id}/zabezpieczenia-przypadku")
def get_wybor_zabezpieczen_przypadku(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Wybór zabezpieczeń przypadku: grupa nastaw i nadpisania nastaw sterowników (ADR-022).

    Pusty wybór (bez rewizji) — przypadek liczy na nastawach bazowych modelu."""
    return _wpis_wyboru(case_id, scenariusz_przypadku(klucz, case_id))


@router.put("/study-cases/{case_id}/zabezpieczenia-przypadku")
def put_wybor_zabezpieczen_przypadku(
    case_id: str, klucz: KluczTwin, zadanie: ZapisWyboruZabezpieczenPrzypadku
) -> dict[str, Any]:
    """Zapisz pełny stan wyboru zabezpieczeń przypadku (nowa rewizja; model bez zmian).

    422 — sterownik spoza modelu, grupa nieobecna w sterowniku, funkcja spoza sterownika albo
    nastawa sprzeczna ze schematem rejestru funkcji (ta sama reguła co zapis nastaw modelu).
    Pusty stan zdejmuje wybór (nagrobek) — biegi przypadku policzone na wyborze stają się
    nieaktualne, biegi innych przypadków bez zmian.
    """
    if not zadanie.protection_groups and not zadanie.protection_overrides:
        if scenariusz_przypadku(klucz, case_id) is not None:
            usun_scenariusz(klucz, id_scenariusza_przypadku(case_id))
        return _wpis_wyboru(case_id, None)
    wybor = wybor_przypadku(case_id, zadanie.protection_groups, zadanie.protection_overrides)
    _sprawdz_przystawanie(
        get_enm(klucz), wybor, zadanie.protection_groups, zadanie.protection_overrides
    )
    return _wpis_wyboru(case_id, zapisz_scenariusz(klucz, wybor))


@router.get("/study-cases/{case_id}/zabezpieczenia-przypadkow")
def get_wybory_zabezpieczen_przypadkow(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Wybory zabezpieczeń WSZYSTKICH przypadków projektu (kolejność magazynu) — karta pola
    pokazuje przy nastawie, w których przypadkach jest nadpisana."""
    wpisy = [
        _wpis_wyboru(s.scenario_id[len(PREFIKS_SCENARIUSZA_PRZYPADKU) :], s)
        for s in lista_scenariuszy(klucz)
        if czy_scenariusz_przypadku(s.scenario_id)
    ]
    return {"przypadki": wpisy, "count": len(wpisy)}


__all__ = ["router"]
