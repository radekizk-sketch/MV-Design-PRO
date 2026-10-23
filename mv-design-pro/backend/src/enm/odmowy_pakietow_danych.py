"""Nazwane odmowy braku pakietu danych właściciela na elementach modelu (karta OD-17a).

Fabryki ``network_model.odmowa_pakietu`` znają pakiet i treść; ten moduł dopasowuje je do
ELEMENTÓW MODELU (nazwa z modelu, typ katalogowy nazwą z katalogu, dane tabliczki) — JEDNO
miejsce rozpoznania braku dla wszystkich konsumentów danego elementu (gotowość modelu, most
zgodności NC RfG, most V12.6, materializacja dynamiki), żeby gotowość i wykonanie rozpoznawały
ten sam brak jednakowo (predykaty parami, reguła KLASA §3).

Element może być słownikiem migawki albo obiektem modelu (``enm.models``) — odczyt pól przez
``nazwy_elementow`` jest wspólny dla obu postaci.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from network_model.catalog.mv_ptpiree_catalog import certyfikat_niewskazany
from network_model.nazwy import nazwa_nadana
from network_model.odmowa_pakietu import OdmowaBrakuPakietuDanych, brak_certyfikatu_wipwc

from .nazwy_elementow import nazwa_elementu
from .slownik_komunikatow import opis_pozycji_katalogu

__all__ = ["odmowa_braku_certyfikatu", "tabliczka_elementu"]


def tabliczka_elementu(element: object) -> Mapping[str, Any]:
    """``materialized_params`` elementu (słownik migawki albo obiekt modelu); brak → ``{}``."""
    if isinstance(element, Mapping):
        tabliczka = element.get("materialized_params")
    else:
        tabliczka = getattr(element, "materialized_params", None)
    return tabliczka if isinstance(tabliczka, Mapping) else {}


def _pole(element: object, klucz: str) -> object:
    if isinstance(element, Mapping):
        return element.get(klucz)
    return getattr(element, klucz, None)


def odmowa_braku_certyfikatu(generator: object) -> OdmowaBrakuPakietuDanych | None:
    """P1: odmowa ``BRAK_CERTYFIKATU_WIPWC:<model>`` dla źródła, którego tabliczka nie wskazuje
    certyfikatu z wykazu PTPiREE (``certyfikat_niewskazany``); ``None`` — tabliczka wskazuje
    certyfikat (jego spójność z rejestrem ocenia most zgodności NC RfG).

    Identyfikator w kodzie: model producenta z tabliczki, gdy ją niesie; inaczej pozycja
    katalogu typu (``catalog_item_id`` tabliczki albo ``catalog_ref`` elementu); źródło bez
    typu katalogowego — ``typ_nieprzypisany``. Zdanie nazywa typ nazwą z katalogu.
    """
    tabliczka = tabliczka_elementu(generator)
    if not certyfikat_niewskazany(tabliczka):
        return None
    model = nazwa_nadana(tabliczka.get("model"))
    pozycja_surowa = tabliczka.get("catalog_item_id") or _pole(generator, "catalog_ref")
    pozycja = nazwa_nadana(pozycja_surowa) if isinstance(pozycja_surowa, str) else None
    if model is not None:
        opis_typu = f"typ przekształtnika „{model}”"
    else:
        opis_typu = opis_pozycji_katalogu(pozycja, None, "typ przekształtnika")
    return brak_certyfikatu_wipwc(
        model or pozycja or "typ_nieprzypisany",
        nazwa_elementu=nazwa_elementu(generator, "generators"),
        opis_typu_pl=opis_typu,
    )
