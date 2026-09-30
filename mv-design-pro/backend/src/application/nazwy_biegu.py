"""Nazwa projektu i przypadku obliczeniowego biegu w nagłówkach dokumentów (karta #144).

PO CO: nagłówki dowodów (LaTeX/PDF pakietów przebiegu, nastaw, doboru aparatury, spadków
napięć) nazywały projekt i przypadek IDENTYFIKATORAMI — `case_name=str(run.case_id)`,
`project_name=proof_input.project_id`, zapas `str(run.project_id)` przy braku nazwy modelu.
Projektant czytał w dowodzie „Przypadek: 3f1c…" zamiast nazwy przypadku z projektu.

SKĄD NAZWY:
  * projekt — nagłówek migawki modelu biegu (`snapshot["header"]["name"]`), zamrożony
    razem z biegiem, więc ten sam bieg daje zawsze ten sam nagłówek (determinizm dowodu);
  * przypadek — wyłącznie baza (`StudyCase.name`): migawka biegu nie niesie przypadku.
    Czyta ją wołający, który ma fabrykę `UnitOfWork` (granica API) — bieg sam bazy nie
    otwiera (CV-4.2b). Dokument wydany po zmianie nazwy przypadku niesie nazwę bieżącą.
Brak nazwy to polski opis braku, nigdy identyfikator ani jego fragment.

WARSTWA: aplikacja (odczyt i mapowanie, zero fizyki).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any
from uuid import UUID

from network_model.nazwy import nazwa_nadana

#: Model biegu bez nazwy w nagłówku migawki.
PROJEKT_BEZ_NAZWY = "Projekt bez nazwy"
#: Przypadek istnieje w bazie, ale jego nazwa jest pusta.
PRZYPADEK_BEZ_NAZWY = "Przypadek bez nazwy"
#: Bieg wskazuje przypadek, którego baza nie zna (usunięty albo spoza projektu).
PRZYPADEK_NIEOBECNY = "Przypadek nieobecny w projekcie"


def nazwa_projektu_z_migawki(snapshot: Mapping[str, Any] | None) -> str:
    """Nazwa projektu = nazwa modelu z nagłówka migawki biegu albo opis braku."""
    naglowek = (snapshot or {}).get("header") or {}
    nazwa = nazwa_nadana(naglowek.get("name")) if isinstance(naglowek, Mapping) else None
    return nazwa or PROJEKT_BEZ_NAZWY


def nazwa_przypadku_z_bazy(case_id: object, uow_factory: Callable[[], Any]) -> str:
    """Nazwa przypadku obliczeniowego z bazy; nigdy identyfikator przypadku."""
    try:
        identyfikator = UUID(str(case_id))
    except (TypeError, ValueError):
        return PRZYPADEK_NIEOBECNY
    with uow_factory() as uow:
        przypadek = uow.cases.get_study_case(identyfikator)
    if przypadek is None:
        return PRZYPADEK_NIEOBECNY
    return nazwa_nadana(przypadek.name) or PRZYPADEK_BEZ_NAZWY
