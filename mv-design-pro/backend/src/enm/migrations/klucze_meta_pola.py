"""Dawne klucze `meta` wpisu pola — JEDNO źródło dla pisarza i migracji (karta W5-B).

Zbiór, którego pisarz rekordu pola (`enm.pola.waliduj_rekord_pola`) ODMAWIA w `Bay.meta`, i
zbiór, który migracja przy wczytaniu (`enm.migrations.field_specs_promocja`) PRZENOSI na pola
typowane albo kasuje jako martwy, to ten sam zbiór (reguła „predykaty parami": warunek wejścia
i wyjścia z jednego źródła). Gdyby żył w dwóch miejscach, klucz dopisany do migracji, a
pominięty w pisarzu, wracałby do `meta` operacją po migracji — i odwrotnie.

Moduł-LIŚĆ: bez importów, żeby `enm.pola` (liść warstwy ENM) mógł go czytać bez cyklu.
"""

from __future__ import annotations

#: Klucze `meta` wpisu przenoszone na pole typowane (`meta.<klucz>` → `Bay.<pole>`).
KLUCZE_META_NA_POLE: dict[str, str] = {
    "field_role": "field_role",
    "terminal_bus_ref": "terminal_bus_ref",
    "field_terminal_bus_ref": "terminal_bus_ref",
    "gpz_section_id": "gpz_section_id",
    "catalog_bindings": "catalog_bindings",
    "apparatus_catalog_ref": "apparatus_catalog_ref",
}

#: Klucze `meta` wpisu kasowane jako martwe (dubel `ref_id`/`bay_ref`, dawny rekord szablonu).
KLUCZE_META_MARTWE: frozenset[str] = frozenset({"bay_ref", "field_ref", "sn_field_template"})

#: Klucze, których NIE wolno pisać do `Bay.meta` — dokładnie te, które migracja zdejmuje.
KLUCZE_META_ZAKAZANE: frozenset[str] = frozenset(KLUCZE_META_NA_POLE) | KLUCZE_META_MARTWE
