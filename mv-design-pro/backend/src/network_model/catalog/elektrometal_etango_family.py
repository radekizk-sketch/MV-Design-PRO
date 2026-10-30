"""Indeks rodziny Elektrometal e²TANGO: źródła ≠ instancja ≠ nastawy.

Pełna lista danych producenta: data/e2tango_rodzina_2026.json.
Pozycje WN, detektor 50 i profile automatyki nie są typami przekaźnika pola SN.
Nie wymyślamy danych CT/VT, funkcji aktywnych, nastaw ani numerów SKU.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parent / "data" / "e2tango_rodzina_2026.json"
_ALREADY_IN_CATALOG: frozenset[str] = frozenset({"EM_E2TANGO_250", "EM_E2TANGO_450"})


def list_etango_family_references() -> list[dict[str, Any]]:
    """Zwróć świeży indeks; klient nie modyfikuje trwałych danych katalogu."""
    family = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(family, list):
        raise ValueError("Nieprawidłowy format indeksu rodziny e²TANGO")
    return sorted(family, key=lambda row: row["id"])


def get_etango_sn_catalog_additions() -> list[dict[str, Any]]:
    """Dodaj typy SN bez dopisywania możliwości/aktywacji funkcji EAZ."""
    result: list[dict[str, Any]] = []
    for row in list_etango_family_references():
        if row["integracja"] != "SELECTABLE_SN" or row["id"] in _ALREADY_IN_CATALOG:
            continue
        note = row["uwagi"] + " Funkcje producenta nie są aktywowane automatycznie."
        result.append(
            {
                "id": row["id"],
                "name_pl": "Elektrometal " + row["model"],
                "params": {
                    "vendor": "ELEKTROMETAL",
                    "series": "e2TANGO",
                    "revision": None,
                    "rated_current_a": None,
                    "analytical_library_ref": None,
                    "notes_pl": note,
                    "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                    "source_reference": row["zrodlo"]["wydanie"] + "; " + row["zrodlo"]["url"],
                    "catalog_status": "REFERENCYJNY_V1",
                    "contract_version": "2.0",
                    "verification_note": (
                        "Producent potwierdza rodzinę i zastosowanie; wariant sprzętowy, "
                        "czynne funkcje, przekładniki i nastawy wymagają dowodu z DTR "
                        "i konfiguracji konkretnej instancji."
                    ),
                },
            }
        )
    return result
