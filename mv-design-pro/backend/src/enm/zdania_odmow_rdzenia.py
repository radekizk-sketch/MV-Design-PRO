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
(`application/solvers/short_circuit_binding.py`), wkłady zwarciowe pakietu dowodowego
(`api/proof_pack.py`) i estymacja stanu (`application/analyses/state_estimation/service.py`,
macierz admitancji rozpływu) — odwołania do grafu (`RODZAJ_WEZEL`, `RODZAJ_GALAZ`, granica
`nazwy_w_odmowach_rdzenia`). Rdzenie liczące wprost z danych modelu odwołują się do elementu
migawki ENM (`RODZAJ_ELEMENT`): bieg V12.6 (granica `nazwy_w_odmowach_modelu`,
`enm/canonical_analysis._execute_v126`), trasa pętli zwarcia nN i pętla TT/IT (granica
`nazwy_w_odmowach_elementow` z parami identyfikator–nazwa zebranymi przy budowie trasy:
`application/analyses/fault_loop/route.py`, `application/analyses/fault_loop/tt_it.py`).
Odwołanie innego rodzaju niż
obsługuje granica to błąd programu (`AssertionError`), nie cicha utrata „gdzie" (partia
integracji 10).

WARSTWA: interpretacja (zero fizyki, zero mutacji). Importuje liście (`network_model/nazwy.py`,
`network_model/odmowa_danych.py`), typ grafu i słownik opisów rodzaju `enm/nazwy_elementow.py`.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator, Mapping
from contextlib import AbstractContextManager, contextmanager

from enm.nazwy_elementow import NAZWA_ELEMENTU_BEZ_NAZWY, zbuduj_indeks_nazw
from network_model.core.graph import NetworkGraph
from network_model.nazwy import nazwa_nadana
from network_model.odmowa_danych import (
    RODZAJ_ELEMENT,
    RODZAJ_GALAZ,
    RODZAJ_WEZEL,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)
from network_model.solvers.power_flow_newton_internal import odmowy_wejscia
from network_model.solvers.power_flow_types import PowerFlowInput

__all__ = [
    "nazwy_w_odmowach_elementow",
    "nazwy_w_odmowach_modelu",
    "nazwy_w_odmowach_rdzenia",
    "sprawdz_wejscie_rozplywu",
    "zdanie_odmowy",
    "zdanie_odmowy_w_modelu",
]

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


def _nazwa_w_modelu(odwolanie: OdwolanieElementu, indeks: Mapping[str, str]) -> str | None:
    """Nazwa elementu migawki ENM (albo opis rodzaju bez nazwy) albo `None`, gdy elementu
    w migawce nie ma."""
    if odwolanie.rodzaj != RODZAJ_ELEMENT:
        raise AssertionError(
            f"Granica odmów modelu nie rozwiązuje odwołania rodzaju {odwolanie.rodzaj!r} — "
            "odwołanie do grafu składa `nazwy_w_odmowach_rdzenia`."
        )
    return indeks.get(odwolanie.ref)


def _zdanie(rekord: RekordOdmowy, nazwy_odwolan: list[str | None]) -> str:
    """JEDNA reguła zdania: treść rekordu + „Dotyczy: <nazwy>." dla elementów obecnych."""
    nazwy = list(dict.fromkeys(nazwa for nazwa in nazwy_odwolan if nazwa is not None))
    if not nazwy:
        return rekord.tresc
    return f"{rekord.tresc} Dotyczy: {', '.join(nazwy)}."


def zdanie_odmowy(rekord: RekordOdmowy, graph: NetworkGraph) -> str:
    """Zdanie dla projektanta: treść rekordu i nazwy elementów grafu, których odmowa dotyczy."""
    return _zdanie(rekord, [_nazwa_w_grafie(odwolanie, graph) for odwolanie in rekord.odwolania])


def zdanie_odmowy_w_modelu(rekord: RekordOdmowy, indeks: Mapping[str, str]) -> str:
    """Jak `zdanie_odmowy`, dla odwołań do elementów migawki ENM (`RODZAJ_ELEMENT`);
    `indeks` to `ref_id → nazwa` z `enm.nazwy_elementow.zbuduj_indeks_nazw`."""
    return _zdanie(rekord, [_nazwa_w_modelu(odwolanie, indeks) for odwolanie in rekord.odwolania])


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


@contextmanager
def _nazwy_w_odmowach_indeksu(indeks_nazw: Callable[[], Mapping[str, str]]) -> Iterator[None]:
    """JEDNA granica odwołań `RODZAJ_ELEMENT`: indeks nazw powstaje dopiero przy odmowie
    (ścieżka bez odmowy nie płaci za niego); rekordy przechodzą bez zmian; inne wyjątki nie są
    dotykane."""
    try:
        yield
    except OdmowaWejsciaRdzenia as exc:
        indeks = indeks_nazw()
        raise OdmowaWejsciaRdzenia(
            exc.rekordy,
            tresc="; ".join(zdanie_odmowy_w_modelu(rekord, indeks) for rekord in exc.rekordy),
        ) from exc


def nazwy_w_odmowach_modelu(model: object) -> AbstractContextManager[None]:
    """Granica wywołania rdzenia liczącego z danych modelu: odmowa strukturalna wychodzi ze
    zdaniem z nazwami elementów migawki ENM (`model` — słownik migawki albo
    `EnergyNetworkModel`)."""
    return _nazwy_w_odmowach_indeksu(lambda: zbuduj_indeks_nazw(model))


def nazwy_w_odmowach_elementow(elementy: Iterable[tuple[str, str]]) -> AbstractContextManager[None]:
    """Jak `nazwy_w_odmowach_modelu`, gdy wołający ma w ręku tylko elementy, z których składa
    wejście rdzenia (np. gałęzie trasy pętli zwarcia): pary `(ref_id, nazwa pokazywana)` —
    nazwa z `enm.nazwy_elementow.nazwa_elementu`, nigdy identyfikator."""
    pary = tuple(elementy)
    return _nazwy_w_odmowach_indeksu(lambda: dict(pary))


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
