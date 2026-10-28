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

from collections.abc import Mapping, Sequence
from typing import Any

from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult


def prad_netto_galezi_z_wkladow(wklady: Sequence[Mapping[str, Any]], branch_id: str) -> float:
    """Prąd netto gałęzi [A] w kierunku from→to z wkładów źródeł (wiersze rozpływu biegu).

    JEDNA reguła znakowania kierunku (from_to dodatnio, to_from ujemnie) dla obu postaci
    wkładów: obiektów ``ShortCircuitBranchContribution`` (``prad_zwarciowy_galezi``) i
    wierszy słownikowych rozpływu zapisanego biegu (``pobierz_rozplyw_biegu`` — ocena
    nadprądowa, ``protection/ocena_nadpradowa.py``). Znak zachowany: bilans klastra węzłów
    potrzebuje kierunku, moduł bierze wołający.

    Wkład bez prądu albo z kierunkiem spoza słownika solvera (``from_to``/``to_from``) nie
    jest pomijany ani zastępowany zerem — to błąd kontraktu wyniku (``KeyError`` /
    ``ValueError``), nie brak przepływu.
    """
    netto = 0.0
    for wklad in wklady:
        if str(wklad["branch_id"]) != branch_id:
            continue
        prad = float(wklad["i_contrib_a"])
        kierunek = wklad["direction"]
        if kierunek not in ("from_to", "to_from"):
            # Kierunek spoza słownika to naruszenie kontraktu wyniku rdzenia IEC 60909 (błąd
            # programu), nie odmowa danych projektanta.
            raise AssertionError(f"Kierunek wkładu gałęzi {branch_id} spoza słownika: {kierunek!r}")
        netto += prad if kierunek == "from_to" else -prad
    return netto


def prad_zwarciowy_galezi(sc_result: ShortCircuitResult, branch_id: str) -> float | None:
    """Prad zwarciowy [A] przypisany galezi.

    Suma udzialow zrodel (``branch_contributions``) dla danej galezi, netto wg
    kierunku (from_to dodatnio, to_from ujemnie), modul sumy.

    Zwraca ``None``, gdy solver NIE policzyl rozbicia na galezie
    (``branch_contributions is None``) - brak danych, nie przyblizenie.
    Zwraca ``0.0``, gdy rozbicie ISTNIEJE, ale galaz nie ma zadnego wpisu - kazdy
    wklad zrodla do tej galezi jest „wkladem pominietym na podstawie tolerancji
    numerycznej (|I| < 1e-6 A)” (karta PROG-ZERA-WKLADOW; surowa wartosc w zestawieniu
    ``ShortCircuitResult.wklady_pominiete``). ``0.0`` to suma wkladow OPUBLIKOWANYCH,
    nie zmierzony prad zerowy: wolajacy, ktory pokazuje prad uzytkownikowi, podaje
    granice progu, nie zero (``wytrzymalosc_cieplna_przewodow``).
    """
    if sc_result.branch_contributions is None:
        return None

    return abs(
        prad_netto_galezi_z_wkladow(
            [c.to_dict() for c in sc_result.branch_contributions], branch_id
        )
    )


def galaz_bez_opublikowanego_wkladu(sc_result: ShortCircuitResult, branch_id: str) -> bool:
    """Czy rozbicie ISTNIEJE, a galaz nie ma na liscie wkladow zadnego wpisu.

    Karta PROG-ZERA-WKLADOW: taki stan znaczy, ze kazdy wklad zrodla do tej galezi jest
    „wkladem pominietym na podstawie tolerancji numerycznej (|I| < 1e-6 A)” — rdzen
    odlozyl go do zestawienia ``wklady_pominiete`` z surowa wartoscia. JEDEN predykat dla
    wszystkich wolajacych, ktorzy pokazuja prad galezi uzytkownikowi (kryterium cieplne,
    czas wylaczenia): wolajacy nie wykazuje wtedy pradu 0 A, tylko nazywa wklad pominiety
    i granice progu. Para z ``prad_zwarciowy_galezi``: ten sam zbior wpisow, ten sam klucz
    galezi — ``True`` dokladnie wtedy, gdy tamta funkcja zwraca ``0.0`` z braku wpisow.
    """
    if sc_result.branch_contributions is None:
        return False
    return not any(str(c.branch_id) == branch_id for c in sc_result.branch_contributions)
