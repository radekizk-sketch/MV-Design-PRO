"""Rozstrzyganie RODZAJU elementu modelu po jego identyfikatorze (karta F-K4 faza 3).

PO CO: wyniki analiz niosą identyfikatory elementów (``source_id``,
``faulted_element_id``, ``element_id``), ale NIE niosą rodzaju. Warstwa
prezentacji potrzebuje rodzaju, żeby zaznaczyć element w modelu — bez niego
pętla decyzji „od wyniku do przyczyny" nie może istnieć, a zgadywanie rodzaju
z kształtu identyfikatora byłoby fabrykacją (identyfikatory to UUID-y i
dowolne referencje, nie nazwy typów).

WARSTWA: interpretacja snapshotu ENM. ZERO fizyki, zero mutacji — wyłącznie
indeks ``ref_id -> rodzaj`` zbudowany z kolekcji modelu.

BRAK ROZSTRZYGNIĘCIA = ``None``. Identyfikator, którego nie ma w snapshocie,
NIE dostaje rodzaju domyślnego: konsument musi wtedy pokazać brak drogi do
elementu, a nie prowadzić w nikąd.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

# Kanoniczne rodzaje elementu (domena, nie typy UI — mapowanie na typ elementu
# interfejsu należy do warstwy prezentacji, jak w ``werdykt_projektowy``).
RODZAJ_SZYNA = "szyna"
RODZAJ_GALAZ_LINIOWA = "galaz_liniowa"
RODZAJ_TRANSFORMATOR = "transformator"
RODZAJ_ZRODLO = "zrodlo"
RODZAJ_GENERATOR = "generator"
RODZAJ_ODBIOR = "odbior"

#: Kolejność ma znaczenie tylko dla determinizmu przy (niedozwolonym) duplikacie
#: identyfikatora między kolekcjami — pierwsza kolekcja wygrywa.
_KOLEKCJE: tuple[tuple[str, str], ...] = (
    ("buses", RODZAJ_SZYNA),
    ("branches", RODZAJ_GALAZ_LINIOWA),
    ("transformers", RODZAJ_TRANSFORMATOR),
    ("sources", RODZAJ_ZRODLO),
    ("generators", RODZAJ_GENERATOR),
    ("loads", RODZAJ_ODBIOR),
)


def zbuduj_indeks_rodzajow(snapshot: Mapping[str, Any] | None) -> dict[str, str]:
    """Zbuduj indeks ``ref_id -> rodzaj`` ze snapshotu ENM (deterministycznie)."""
    indeks: dict[str, str] = {}
    if not snapshot:
        return indeks
    for klucz, rodzaj in _KOLEKCJE:
        for wpis in snapshot.get(klucz) or []:
            if not isinstance(wpis, Mapping):
                continue
            ref = wpis.get("ref_id")
            if not ref:
                continue
            indeks.setdefault(str(ref), rodzaj)
    return indeks


def rodzaj_elementu(
    element_id: str | None,
    snapshot: Mapping[str, Any] | None = None,
    *,
    indeks: dict[str, str] | None = None,
) -> str | None:
    """Rodzaj elementu o podanym identyfikatorze; ``None`` gdy nie da się ustalić.

    ``indeks`` pozwala uniknąć przebudowy mapy przy wielu odpytaniach tego
    samego snapshotu (widok wyników pyta o kilka identyfikatorów).
    """
    if not element_id:
        return None
    mapa = indeks if indeks is not None else zbuduj_indeks_rodzajow(snapshot)
    return mapa.get(str(element_id))
