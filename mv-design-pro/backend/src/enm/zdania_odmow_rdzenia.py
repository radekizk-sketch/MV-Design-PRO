"""Zdanie odmowy rdzenia obliczeniowego z nazwami elementów z modelu (decyzja O-59, §12.2 (k)).

PO CO. Rdzenie zwarć IEC 60909 (`short_circuit_iec60909.py`) i rozpływu NR
(`power_flow_newton_internal.py`) odmawiają wejścia rekordem strukturalnym
(`network_model.odmowa_danych.RekordOdmowy`: kod, zdanie po polsku BEZ identyfikatorów,
odwołania do węzłów i gałęzi grafu). Projektant czyta komunikat, żeby wiedzieć, CO jest nie tak
i GDZIE — rdzeń mówi „co", ten moduł dokłada „gdzie" nazwami z modelu (nazwa węzła albo gałęzi
grafu; mapowanie ENM → graf nadaje ją przez `nazwa_elementu`). Identyfikator nie trafia do
treści nigdy: zostaje w `rekordy` wyjątku (wzorzec O-56 pkt 2).

JEDNA REGUŁA ZDANIA: `zdanie_odmowy` — treść rekordu, a gdy odwołania wskazują elementy
obecne w grafie, zdanie „Dotyczy: <nazwy>." (nazwa nadana albo polski opis rodzaju bez nazwy).
Odwołanie do elementu, którego w grafie nie ma, niczego nie dokłada — treść rdzenia już mówi,
że elementu nie ma w grafie sieci.

WPIĘCIE (każde wywołanie rdzeni na drodze do projektanta): bieg kanoniczny zwarć i rozpływu
(`enm/canonical_analysis.py`), wiązanie zwarcia ze stanem modelu
(`application/solvers/short_circuit_binding.py`) i estymacja stanu
(`application/analyses/state_estimation/service.py`, macierz admitancji rozpływu).

WARSTWA: interpretacja (zero fizyki, zero mutacji). Importuje liście (`network_model/nazwy.py`,
`network_model/odmowa_danych.py`), typ grafu i słownik opisów rodzaju `enm/nazwy_elementow.py`.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from enm.nazwy_elementow import NAZWA_ELEMENTU_BEZ_NAZWY
from network_model.core.graph import NetworkGraph
from network_model.nazwy import nazwa_nadana
from network_model.odmowa_danych import (
    RODZAJ_GALAZ,
    RODZAJ_WEZEL,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)
from network_model.solvers.power_flow_newton_internal import odmowy_wejscia
from network_model.solvers.power_flow_types import PowerFlowInput

__all__ = ["nazwy_w_odmowach_rdzenia", "sprawdz_wejscie_rozplywu", "zdanie_odmowy"]

#: Opis elementu grafu bez nazwy wg rodzaju odwołania (słownik jednego źródła nazw).
_OPIS_BEZ_NAZWY: dict[str, str] = {
    RODZAJ_WEZEL: NAZWA_ELEMENTU_BEZ_NAZWY["buses"],
    RODZAJ_GALAZ: NAZWA_ELEMENTU_BEZ_NAZWY["branches"],
}


def _nazwa_w_grafie(odwolanie: OdwolanieElementu, graph: NetworkGraph) -> str | None:
    """Nazwa elementu grafu wskazanego odwołaniem albo `None`, gdy elementu w grafie nie ma."""
    if odwolanie.rodzaj == RODZAJ_WEZEL:
        element: object = graph.nodes.get(odwolanie.ref)
    elif odwolanie.rodzaj == RODZAJ_GALAZ:
        element = graph.branches.get(odwolanie.ref)
    else:
        raise AssertionError(f"Nieznany rodzaj odwołania rekordu odmowy: {odwolanie.rodzaj!r}")
    if element is None:
        return None
    return nazwa_nadana(getattr(element, "name", None)) or _OPIS_BEZ_NAZWY[odwolanie.rodzaj]


def zdanie_odmowy(rekord: RekordOdmowy, graph: NetworkGraph) -> str:
    """Zdanie dla projektanta: treść rekordu i nazwy elementów grafu, których odmowa dotyczy."""
    nazwy = list(
        dict.fromkeys(
            nazwa
            for odwolanie in rekord.odwolania
            if (nazwa := _nazwa_w_grafie(odwolanie, graph)) is not None
        )
    )
    if not nazwy:
        return rekord.tresc
    return f"{rekord.tresc} Dotyczy: {', '.join(nazwy)}."


def _odmowa_z_nazwami(
    rekordy: tuple[RekordOdmowy, ...], graph: NetworkGraph
) -> OdmowaWejsciaRdzenia:
    return OdmowaWejsciaRdzenia(
        rekordy, tresc="; ".join(zdanie_odmowy(rekord, graph) for rekord in rekordy)
    )


@contextmanager
def nazwy_w_odmowach_rdzenia(graph: NetworkGraph) -> Iterator[None]:
    """Granica wywołania rdzenia: odmowa strukturalna wychodzi ze zdaniem z nazwami z grafu.

    Rekordy (kody, odwołania) przechodzą bez zmian; zmienia się wyłącznie treść wyjątku.
    Inne wyjątki nie są dotykane.
    """
    try:
        yield
    except OdmowaWejsciaRdzenia as exc:
        raise _odmowa_z_nazwami(exc.rekordy, graph) from exc


def sprawdz_wejscie_rozplywu(pf_input: PowerFlowInput) -> None:
    """Walidacja wejścia rozpływu PRZED biegiem, z rekordami i zdaniem z nazwami z modelu.

    Solvery NR, Gaussa–Seidla i szybki rozprzężony (rdzenie B-01) wołają ten sam walidator
    (`validate_input`) i przy odmowie podnoszą goły `ValueError` z treściami rekordów — bez
    rekordów i bez nazw. Warstwa aplikacji woła walidator strukturalny (`odmowy_wejscia`,
    te same predykaty) przed solverem, więc projektant dostaje nazwaną odmowę z nazwami
    elementów, a rekordy zostają w wyjątku. Przy `options.validate = False` solver też nie
    waliduje — ta funkcja również.
    """
    if not pf_input.options.validate:
        return
    _ostrzezenia, odmowy = odmowy_wejscia(pf_input)
    if odmowy:
        raise _odmowa_z_nazwami(tuple(odmowy), pf_input.typed_graph())
