"""Czas trwania zwarcia t_k w wymaganiach dowodu doboru aparatury POLA (ADR-022).

Dowód doboru aparatury porównuje energię cieplną wymaganą (I_th, t_k) ze znamionową aparatu.
Dla aparatu pola stacji t_k jest czasem wyłączenia TEGO pola (człon nastawczy sterownika pola
przy prądzie punktu zabudowy + czas własny wyłącznika — ``application.analyses.protection.
czas_wylaczenia_pola``), a nie czasem cieplnym całego biegu zwarciowego (``thermal_time_seconds``
scenariusza, domyślnie 1 s). I_th wymagany jest prądem cieplnym przy TYM SAMYM t_k pola
(I″k·√(m(T_k,pola) + n) — ``network_model.solvers.wytrzymalosc_cieplna_pola``, ślad
w ``ith_zrodlo``), nie I_th biegu przy jego czasie cieplnym: para (I_th, t_k) opisuje jeden stan.
Ten moduł jest JEDYNYM miejscem podmiany: liczby i pochodzenie idą do wymagań razem. Czas pola
nie jest nigdy pusty (karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN pakiet 8,
``czas_trwania_zwarcia_pola``): wartość projektanta > nastawy pola > wartość robocza 1 s
(IEC 62271-1 §4.7) — źródło, podstawa i dana przyjęta wartości roboczej idą do ``tk_zrodlo``,
a dowód dokłada daną przyjętą do swoich danych przyjętych (kompletność ``NIEPELNY``). Zero
fizyki — przepisanie liczb policzonych przez solver i ich pochodzenia.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

#: Pochodzenie t_k w wymaganiach dowodu: czas trwania zwarcia pola (źródło w ``zrodlo_czasu``).
ZRODLO_TK_CZAS_POLA = "czas_wylaczenia_pola"


def wymagania_z_czasem_pola(
    wymagane: Mapping[str, Any], czas_pola: Mapping[str, Any]
) -> dict[str, Any]:
    """Wymagania dowodu z t_k = czas trwania zwarcia pola (``czas_trwania_zwarcia_pola`` —
    nigdy pusty: projektant, nastawy albo wartość robocza 1 s z daną przyjętą)."""
    wynik = dict(wymagane)
    wynik["tk_s"] = float(czas_pola["t_clearing_s"])
    cieplny = czas_pola.get("prad_cieplny_pola")
    ith_pola = cieplny.get("ith_ka") if isinstance(cieplny, Mapping) else None
    if ith_pola is None:
        wynik.pop("ith_ka", None)
    else:
        wynik["ith_ka"] = float(ith_pola)
    wynik["ith_zrodlo"] = dict(cieplny) if isinstance(cieplny, Mapping) else None
    wynik["tk_zrodlo"] = {
        "zrodlo": ZRODLO_TK_CZAS_POLA,
        "zrodlo_czasu": czas_pola.get("zrodlo"),
        "podstawa_pl": czas_pola.get("podstawa_pl"),
        "dana_przyjeta": czas_pola.get("dana_przyjeta"),
        "pole_ref": czas_pola.get("pole_ref"),
        "czlon_nastawczy_s": czas_pola.get("czlon_nastawczy_s"),
        "czas_wlasny_wylacznika_s": czas_pola.get("czas_wlasny_wylacznika_s"),
        "opis_pl": czas_pola.get("powod_pl"),
    }
    return wynik
