"""Konsument regresyjny (na publikowanej topologii) `network_model/solvers/
power_flow_unbalanced.py` po karcie K2 (2026-09-09, §0.4(f), mapa domknięcia 3 #2).

Ten FROZEN solver (B-01) miał w produkcie JEDNEGO konsumenta:
`application/reference_networks/computation.py::_power_flow_unbalanced_bfs`,
budowany z dialektu słownikowego tego samego pakietu (druga prawda o sieci,
skasowana w całości kartą K2). Ten test przenosi TO SAMO ćwiczenie solvera —
obciążenie rozłożone równomiernie po 3 fazach (`_power_flow_unbalanced_bfs`
robił dokładnie to samo: "Distribute load evenly across 3 phases (balanced
approximation per Kersting)", nigdy prawdziwych danych per-fazę) — na TOR
KANONICZNY: sieć budują `tests.golden.enm_builders.ieee_34bus` (operacje
domenowe), a impedancje gałęzi czyta się z `NetworkGraph` przez kanoniczny
mapper `enm.mapping.map_enm_to_network_graph` (baza WŁASNEGO poziomu napięcia
każdej gałęzi — NIE baza systemu jak stary dialekt, który miał udokumentowany
defekt bazy dla sieci wielopoziomowych, patrz
`network_model/catalog/mv_benchmark_catalog.py` docstring: "linia na innym
poziomie stemplowana bazą systemu dostaje impedancję (U_systemu/U_linii)² razy
za dużą").

Tylko `ieee_34bus` (nie `ieee_13bus`): `ieee_34bus` jest CZYSTO liniowa
(20 odcinków magistrali + 9 odgałęzień, jeden poziom napięcia 24,9 kV) — bez
transformatora. `ieee_13bus` niesie transformator obniżający XFM-1 (4,16 →
0,48 kV), a `UnbalancedBranchSpec` (kontrakt solvera) nie ma pola
przekładni/zaczepu — modelowanie transformatora W TYM solverze wymagałoby
NOWEJ derywacji impedancji spoza kontraktu (fizyka w fixture, nie w solverze),
więc `ieee_13bus` zostaje POZA tym testem (świadome ograniczenie zakresu, nie
cichy brak — `ieee_13bus` ma OSOBNĄ, żywą walidację jako aproksymacja
pozytywno-sekwencyjna: `tests/golden/parytet_benchmarkow/
test_wyrocznia_a_expected_json.py::test_ieee_13bus_pf_aproksymacja_pozytywnosekwencyjna`).

KLASA WYROCZNI: REGRESSION_ONLY (`tests/golden/registry.py` §32 — złoty network
≠ dowód fizyki). Rozkład obciążenia po równo na 3 fazy NIE jest prawdziwą
fizyką niesymetryczną Kerstinga (per-fazowe rozdzielenie odbiorów pozostaje
PLANNED, patrz `tests/golden/registry.py::B-BENCH` docstring dla ieee_34bus) —
ten test dowodzi WYŁĄCZNIE, że solver KONWERGUJE i daje fizycznie sensowne
napięcia na REALNEJ topologii publikowanego benchmarku (11+9 gałęzi, 34 węzły)
— nie porównuje z żadną niezależną wyrocznią liczbową. Solver ma też od dawna
niezależny test jednostkowy na syntetycznych fikstywach 2-szynowych
(`tests/test_power_flow_unbalanced.py`, sprzed karty K2, nietknięty) — ten
plik go NIE zastępuje, dokłada ćwiczenie na realnej, publikowanej topologii.
Mapa domknięcia: zapisz „3 #2: solver ma WYŁĄCZNIE konsumentów testowych
(jednostkowy sprzed karty + nowy regresyjny na publikowanej topologii IEEE
34-bus), ZERO konsumenta produkcyjnego, BEZ niezależnej wyroczni fizyki
niesymetrycznej — W5" (dosłowny tekst wiersza w meldunku karty K2).
"""

from __future__ import annotations

from typing import Any

from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.core.branch import LineBranch
from network_model.solvers.power_flow_unbalanced import (
    UnbalancedBranchSpec,
    UnbalancedLoadSpec,
    UnbalancedNetworkInput,
    solve_unbalanced_backward_forward_sweep,
)

_BASE_MVA = 100.0
_BASE_KV = 24.9


def _wejscie_z_enm(enm_dict: dict[str, Any]) -> UnbalancedNetworkInput:
    """Zbuduj `UnbalancedNetworkInput` z sieci referencyjnej budowanej torem
    kanonicznym (operacje domenowe -> ENM -> `map_enm_to_network_graph`)."""
    validated = EnergyNetworkModel.model_validate(enm_dict)
    graph = map_enm_to_network_graph(validated)
    slack_ids = graph.get_slack_node_ids()
    assert (
        len(slack_ids) == 1
    ), f"oczekiwano dokładnie jednej szyny SLACK, jest {len(slack_ids)}: {slack_ids}"

    branch_specs: list[UnbalancedBranchSpec] = []
    for branch_id in sorted(graph.branches):
        branch = graph.branches[branch_id]
        assert isinstance(branch, LineBranch), (
            f"{branch_id}: oczekiwano WYŁĄCZNIE LineBranch (ieee_34bus jest czysto "
            f"liniowa) — {type(branch).__name__} sygnalizuje zmianę topologii buildera, "
            "wymaga ponownej oceny zakresu tego testu"
        )
        branch_specs.append(
            UnbalancedBranchSpec(
                branch_id=branch_id,
                from_bus_id=branch.from_node_id,
                to_bus_id=branch.to_node_id,
                r_self_ohm=branch.r_ohm_per_km * branch.length_km,
                x_self_ohm=branch.x_ohm_per_km * branch.length_km,
            )
        )

    load_specs: list[UnbalancedLoadSpec] = []
    for node_id in sorted(graph.nodes):
        node = graph.nodes[node_id]
        # `active_power`/`reactive_power` to NETTO wstrzyknięcie (dodatnie = generacja) —
        # ieee_34bus nie ma generatorów (has_der=False), więc wartość ujemna/None
        # jest w całości odbiorem. Rozkład równo po 3 fazach — jak stary dialekt.
        p_odbior_mw = -(node.active_power or 0.0)
        q_odbior_mvar = -(node.reactive_power or 0.0)
        if p_odbior_mw == 0.0 and q_odbior_mvar == 0.0:
            continue
        load_specs.append(
            UnbalancedLoadSpec(
                bus_id=node_id,
                p_mw_a=p_odbior_mw / 3.0,
                p_mw_b=p_odbior_mw / 3.0,
                p_mw_c=p_odbior_mw / 3.0,
                q_mvar_a=q_odbior_mvar / 3.0,
                q_mvar_b=q_odbior_mvar / 3.0,
                q_mvar_c=q_odbior_mvar / 3.0,
            )
        )

    return UnbalancedNetworkInput(
        base_mva=_BASE_MVA,
        base_kv=_BASE_KV,
        slack_bus_id=slack_ids[0],
        bus_ids=tuple(sorted(graph.nodes)),
        branches=tuple(branch_specs),
        loads=tuple(load_specs),
    )


def _zbuduj_ieee34_enm() -> dict[str, Any]:
    from tests.golden.enm_builders.ieee_34bus import build_ieee_34bus_enm

    return build_ieee_34bus_enm().enm


def test_ieee34_bfs_niesymetryczny_konwerguje() -> None:
    wejscie = _wejscie_z_enm(_zbuduj_ieee34_enm())
    assert len(wejscie.branches) >= 20, "ieee_34bus powinna mieć >= 20 gałęzi liniowych"
    assert len(wejscie.loads) >= 10, "ieee_34bus powinna mieć odbiory na wielu szynach"

    wynik = solve_unbalanced_backward_forward_sweep(wejscie)

    assert wynik.converged, "BFS niesymetryczny nie zbiegł na topologii ieee_34bus"


def test_ieee34_bfs_napiecia_fizycznie_sensowne() -> None:
    wejscie = _wejscie_z_enm(_zbuduj_ieee34_enm())
    wynik = solve_unbalanced_backward_forward_sweep(wejscie)
    assert wynik.converged

    for bus in wynik.bus_results:
        for magnitude in (
            bus.voltage_pu_magnitude_a,
            bus.voltage_pu_magnitude_b,
            bus.voltage_pu_magnitude_c,
        ):
            assert (
                0.80 <= magnitude <= 1.05
            ), f"{bus.bus_id}: |V|={magnitude} p.u. poza pasmem fizycznym [0.80, 1.05]"


def test_ieee34_bfs_biala_skrzynka_niepusta() -> None:
    wejscie = _wejscie_z_enm(_zbuduj_ieee34_enm())
    wynik = solve_unbalanced_backward_forward_sweep(wejscie)
    assert wynik.converged
    assert wynik.white_box_trace, "ślad WHITE BOX pusty — solver musi ujawniać kroki obliczeń"


def test_ieee34_bfs_deterministyczny() -> None:
    enm_dict = _zbuduj_ieee34_enm()
    pierwszy = solve_unbalanced_backward_forward_sweep(_wejscie_z_enm(enm_dict))
    drugi = solve_unbalanced_backward_forward_sweep(_wejscie_z_enm(enm_dict))

    assert pierwszy.converged and drugi.converged
    pierwsze_napiecia = [
        (b.bus_id, b.voltage_pu_magnitude_a, b.voltage_pu_magnitude_b, b.voltage_pu_magnitude_c)
        for b in sorted(pierwszy.bus_results, key=lambda b: b.bus_id)
    ]
    drugie_napiecia = [
        (b.bus_id, b.voltage_pu_magnitude_a, b.voltage_pu_magnitude_b, b.voltage_pu_magnitude_c)
        for b in sorted(drugi.bus_results, key=lambda b: b.bus_id)
    ]
    assert pierwsze_napiecia == drugie_napiecia
