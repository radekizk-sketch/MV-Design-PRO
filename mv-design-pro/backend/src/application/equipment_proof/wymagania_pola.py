"""Czas trwania zwarcia t_k w wymaganiach dowodu doboru aparatury POLA (ADR-022).

Dowód doboru aparatury porównuje energię cieplną wymaganą (I_th, t_k) ze znamionową aparatu.
Dla aparatu pola stacji t_k jest czasem wyłączenia TEGO pola (człon nastawczy sterownika pola
przy prądzie punktu zabudowy + czas własny wyłącznika — ``application.analyses.protection.
czas_wylaczenia_pola``), a nie czasem cieplnym całego biegu zwarciowego (``thermal_time_seconds``
scenariusza, domyślnie 1 s). Ten moduł jest JEDYNYM miejscem podmiany: liczba i pochodzenie t_k
idą do wymagań razem; czas pola nieustalony = brak t_k z powodem, nigdy czas biegu w zastępstwie.
Zero fizyki — przepisanie liczby i jej pochodzenia.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

#: Pochodzenie t_k w wymaganiach dowodu: czas wyłączenia pola z nastaw jego sterownika.
ZRODLO_TK_CZAS_POLA = "czas_wylaczenia_pola"


def wymagania_z_czasem_pola(
    wymagane: Mapping[str, Any], czas_pola: Mapping[str, Any]
) -> dict[str, Any]:
    """Wymagania dowodu z t_k = czas wyłączenia pola (albo bez t_k z powodem braku)."""
    wynik = dict(wymagane)
    t_k = czas_pola.get("t_clearing_s")
    if t_k is None:
        wynik.pop("tk_s", None)
    else:
        wynik["tk_s"] = float(t_k)
    wynik["tk_zrodlo"] = {
        "zrodlo": ZRODLO_TK_CZAS_POLA,
        "pole_ref": czas_pola.get("pole_ref"),
        "czlon_nastawczy_s": czas_pola.get("czlon_nastawczy_s"),
        "czas_wlasny_wylacznika_s": czas_pola.get("czas_wlasny_wylacznika_s"),
        "opis_pl": czas_pola.get("powod_pl"),
    }
    return wynik
