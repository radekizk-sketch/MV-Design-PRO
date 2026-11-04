"""Czas trwania zwarcia t_k w wymaganiach dowodu doboru aparatury POLA (ADR-022).

Dowód doboru aparatury porównuje energię cieplną wymaganą (I_th, t_k) ze znamionową aparatu.
Dla aparatu pola stacji t_k jest czasem wyłączenia TEGO pola (człon nastawczy sterownika pola
przy prądzie punktu zabudowy + czas własny wyłącznika — ``application.analyses.protection.
czas_wylaczenia_pola``), a nie czasem cieplnym całego biegu zwarciowego (``thermal_time_seconds``
scenariusza, domyślnie 1 s). I_th wymagany jest prądem cieplnym przy TYM SAMYM t_k pola
(I″k·√(m(T_k,pola) + n) — ``network_model.solvers.wytrzymalosc_cieplna_pola``, ślad
w ``ith_zrodlo``), nie I_th biegu przy jego czasie cieplnym: para (I_th, t_k) opisuje jeden stan.
Ten moduł jest JEDYNYM miejscem podmiany: liczby i pochodzenie idą do wymagań razem; czas pola
nieustalony = brak t_k i I_th z powodem, nigdy wartości biegu w zastępstwie. Zero fizyki —
przepisanie liczb policzonych przez solver i ich pochodzenia.
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
    cieplny = czas_pola.get("prad_cieplny_pola")
    ith_pola = cieplny.get("ith_ka") if isinstance(cieplny, Mapping) else None
    if ith_pola is None:
        wynik.pop("ith_ka", None)
    else:
        wynik["ith_ka"] = float(ith_pola)
    wynik["ith_zrodlo"] = dict(cieplny) if isinstance(cieplny, Mapping) else None
    wynik["tk_zrodlo"] = {
        "zrodlo": ZRODLO_TK_CZAS_POLA,
        "pole_ref": czas_pola.get("pole_ref"),
        "czlon_nastawczy_s": czas_pola.get("czlon_nastawczy_s"),
        "czas_wlasny_wylacznika_s": czas_pola.get("czas_wlasny_wylacznika_s"),
        "opis_pl": czas_pola.get("powod_pl"),
    }
    return wynik
