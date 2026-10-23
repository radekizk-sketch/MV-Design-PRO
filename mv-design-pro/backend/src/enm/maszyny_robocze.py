"""Wartości robocze parametrów maszyn wirujących w punkcie zwarcia (karta PODSTAWA-Q, rozstrz. 3).

PO CO. Mapowanie ENM → graf (``enm.mapping``) rozstrzyga parametry każdej maszyny wirującej
(projektant > tabliczka > propozycja rejestru ``network_model.catalog.wartosci_robocze``) i zapisuje
wartości robocze w ``graph.wartosci_robocze_maszyn``. Prąd zwarciowy punktu zależy od maszyn
JEGO wyspy (macierz admitancyjna łączy tylko węzły połączone aktywnymi gałęziami), więc dane
przyjęte werdyktu opartego na prądzie punktu to wpisy maszyn tej wyspy — ten moduł jest jedynym
miejscem tego doboru: wiersz biegu (``canonical_analysis``), wkłady punktu i pakiet dowodowy SC3F
czytają go stąd (predykaty parami).

Zero fizyki: odczyt metadanych grafu i topologii (składowe spójne) — bez liczb solvera.
"""

from __future__ import annotations

from typing import Any

from network_model.catalog.wartosci_robocze import WIELKOSC_TYLKO_IB
from network_model.core.graph import NetworkGraph
from network_model.core.machine import AsynchronousMachineSource, SynchronousMachineSource
from network_model.solvers.short_circuit_core import ShortCircuitType


def wyspy_wezlow_grafu(graph: NetworkGraph) -> dict[str, frozenset[str]]:
    """Węzeł → zbiór węzłów jego wyspy (składowa spójna po aktywnych gałęziach i łącznikach)."""
    wynik: dict[str, frozenset[str]] = {}
    for wyspa in graph.find_islands():
        zbior = frozenset(wyspa)
        for wezel in wyspa:
            wynik[wezel] = zbior
    return wynik


def parametry_robocze_maszyn_punktu(
    graph: NetworkGraph,
    node_id: str,
    short_circuit_type: ShortCircuitType,
    *,
    wyspy: dict[str, frozenset[str]] | None = None,
) -> list[dict[str, Any]]:
    """Wpisy wartości roboczych maszyn wyspy punktu zwarcia (kolejność: id maszyny, parametr).

    Zwarcie niesymetryczne ma I_b = I″k (IEC 60909-0:2016 rozdz. 9 — zanik strumienia maszyn
    nie jest uwzględniany), więc parametr wpływający WYŁĄCZNIE na krzywą zaniku (liczba par
    biegunów poza progiem R_M/X_M) nie jest daną przyjętą takiego punktu.
    """
    if not graph.wartosci_robocze_maszyn:
        return []
    mapa_wysp = wyspy if wyspy is not None else wyspy_wezlow_grafu(graph)
    wyspa = mapa_wysp.get(node_id, frozenset({node_id}))
    maszyny: dict[str, SynchronousMachineSource | AsynchronousMachineSource] = {
        **graph.synchronous_machine_sources,
        **graph.asynchronous_machine_sources,
    }
    wynik: list[dict[str, Any]] = []
    for id_maszyny in sorted(graph.wartosci_robocze_maszyn):
        maszyna = maszyny.get(id_maszyny)
        if maszyna is None or not maszyna.in_service or maszyna.node_id not in wyspa:
            continue
        for wpis in graph.wartosci_robocze_maszyn[id_maszyny]:
            if (
                short_circuit_type != ShortCircuitType.THREE_PHASE
                and tuple(wpis["wielkosci"]) == WIELKOSC_TYLKO_IB
            ):
                continue
            wynik.append(dict(wpis))
    return wynik


def parametry_robocze_impedancji_maszyn(
    graph: NetworkGraph, node_id: str
) -> tuple[dict[str, Any], ...]:
    """Wpisy maszyn wyspy węzła, które wpływają na impedancję Thevenina w węźle (Z-bus z maszynami
    jako admitancjami bocznikowymi, ``core.ybus``) — konsumenci impedancji sieci zasilającej
    (pętla zwarcia nN, kotwica SN domeny nN). Parametr wpływający WYŁĄCZNIE na krzywą zaniku
    (``wielkosci`` = tylko I_b) nie zmienia impedancji i nie jest daną przyjętą tych wyników;
    każdy inny wpis zmienia Z_M maszyny (a więc I″k) — to ten sam zbiór co dla I″k punktu."""
    return tuple(
        wpis
        for wpis in parametry_robocze_maszyn_punktu(graph, node_id, ShortCircuitType.THREE_PHASE)
        if "ikss" in wpis["wielkosci"]
    )
