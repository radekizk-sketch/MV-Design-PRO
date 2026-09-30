"""Indeks typów katalogowych po ``type_id`` — zbiór identyfikatorów typów urządzeń.

Odpowiedź na pytanie „czy ``type_id`` jest typem katalogu statycznego” (strażnik cennika,
karta W10-2a: cennik repozytorium wiąże się z katalogiem statycznym po ``type_id``). Nazwę
pozycji dla projektanta daje jedno źródło reguły nazwy:
``enm.nazwy_elementow.nazwa_nadana_pozycji_katalogu``.

Inwentarz klasy STRUKTURALNY, nie ręczny: każde pole ``<rodzina>_types`` repozytorium
``CatalogRepository`` jest słownikiem typów; nowa rodzina typów wchodzi do indeksu bez zmiany
tego modułu. Poza indeksem zostają krzywe i szablony nastaw zabezpieczeń
(``protection_curves``, ``protection_setting_templates`` — dane nastaw, nie urządzenia), karty
widmowe i certyfikaty PTPiREE (dokumenty, nie typy urządzeń).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import fields
from typing import Any

from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog

__all__ = ["identyfikatory_typow"]


def _slowniki_typow(katalog: CatalogRepository) -> Iterable[Mapping[str, Any]]:
    for pole in fields(katalog):
        if pole.name.endswith("_types"):
            yield getattr(katalog, pole.name)


def identyfikatory_typow(katalog: CatalogRepository | None = None) -> frozenset[str]:
    """Wszystkie ``type_id`` typów urządzeń katalogu."""
    repo = katalog if katalog is not None else get_default_mv_catalog()
    return frozenset(type_id for slownik in _slowniki_typow(repo) for type_id in slownik)
