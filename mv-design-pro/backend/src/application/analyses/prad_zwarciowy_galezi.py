"""Prad zwarciowy przypisany GALEZI — jedno odczytanie rozbicia wkladow solvera.

WARSTWA ANALIZ, ZERO FIZYKI: modul wylacznie ODCZYTUJE gotowe wklady gałęziowe
policzone przez solver zwarciowy (``ShortCircuitResult.branch_contributions``) i
sumuje je netto wg kierunku. Zaden wzor fizyczny tutaj nie powstaje.

DLACZEGO OSOBNY MODUL (karta F-K1 faza 5): tego samego odczytu potrzebuja DWIE
analizy — kryterium cieplne przewodu (``wytrzymalosc_cieplna_przewodow``) oraz
czas wylaczenia per galaz (``protection/czas_wylaczenia_galezi``), a ta druga
karmi te pierwsza. Trzymanie odczytu w ktorejkolwiek z nich tworzyloby cykl
importow albo — gorzej — dwie kopie tej samej reguly znakowania kierunku.
"""

from __future__ import annotations

from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult


def prad_zwarciowy_galezi(sc_result: ShortCircuitResult, branch_id: str) -> float | None:
    """Prad zwarciowy [A] przypisany galezi.

    Suma udzialow zrodel (``branch_contributions``) dla danej galezi, netto wg
    kierunku (from_to dodatnio, to_from ujemnie), modul sumy.

    Zwraca ``None``, gdy solver NIE policzyl rozbicia na galezie
    (``branch_contributions is None``) - brak danych, nie przyblizenie.
    Zwraca ``0.0``, gdy rozbicie ISTNIEJE, ale galaz nie ma zadnego wpisu -
    realny brak przeplywu pradu zwarciowego przez ta galaz dla danego zwarcia.
    """
    if sc_result.branch_contributions is None:
        return None

    net_a = 0.0
    for contrib in sc_result.branch_contributions:
        if contrib.branch_id != branch_id:
            continue
        if contrib.direction == "from_to":
            net_a += contrib.i_contrib_a
        else:
            net_a -= contrib.i_contrib_a
    return abs(net_a)
