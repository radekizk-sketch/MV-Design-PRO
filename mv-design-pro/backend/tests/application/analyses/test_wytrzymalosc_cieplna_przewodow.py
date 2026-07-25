"""
Testy analizy: wytrzymalosc cieplna przewodow (linie/kable SN) na modelu.

Oczekiwane wartosci pochodza z NIEZALEZNEGO rachunku (wzor + liczby w komentarzu
kazdego testu), NIE z uruchomienia testowanego kodu.
"""

from __future__ import annotations

from application.analyses.wytrzymalosc_cieplna_przewodow import (
    build_conductor_thermal_withstand_view,
)
from network_model.catalog.repository import CatalogRepository
from network_model.catalog.types import CableType
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.short_circuit_contributions import (
    ShortCircuitBranchContribution,
)
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult

# ---------------------------------------------------------------------------
# Wspolne fixtures
# ---------------------------------------------------------------------------


def _graph_with_two_cables(type_ref_b: str | None = "cable_pass") -> NetworkGraph:
    """Graf: BUS1 -[cable_A]-> BUS2 -[cable_B]-> BUS3."""
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="BUS1",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=15.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS2",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS3",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_branch(
        LineBranch(
            id="cable_A",
            name="Kabel A",
            branch_type=BranchType.CABLE,
            from_node_id="BUS1",
            to_node_id="BUS2",
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.1,
            length_km=1.0,
            rated_current_a=300.0,
            type_ref="cable_pass",
        )
    )
    graph.add_branch(
        LineBranch(
            id="cable_B",
            name="Kabel B",
            branch_type=BranchType.CABLE,
            from_node_id="BUS2",
            to_node_id="BUS3",
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.1,
            length_km=1.0,
            rated_current_a=300.0,
            type_ref=type_ref_b,
        )
    )
    return graph


def _catalog_with_cable_type(
    type_id: str = "cable_pass",
    ith_1s_a: float | None = 8000.0,
    jth_1s_a_per_mm2: float | None = 80.0,
    cross_section_mm2: float = 95.0,
) -> CatalogRepository:
    return CatalogRepository(
        line_types={},
        cable_types={
            type_id: CableType(
                id=type_id,
                name="Kabel testowy",
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                rated_current_a=300.0,
                cross_section_mm2=cross_section_mm2,
                ith_1s_a=ith_1s_a,
                jth_1s_a_per_mm2=jth_1s_a_per_mm2,
            )
        },
        transformer_types={},
        switch_equipment_types={},
        converter_types={},
        inverter_types={},
    )


def _sc_result(
    *,
    tk_s: float,
    branch_contributions: list[ShortCircuitBranchContribution] | None,
) -> ShortCircuitResult:
    return ShortCircuitResult(
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        fault_node_id="BUS3",
        c_factor=1.1,
        un_v=15000.0,
        zkk_ohm=complex(0.3, 0.4),
        ikss_a=17000.0,
        ip_a=30000.0,
        ith_a=17000.0,
        sk_mva=100.0,
        rx_ratio=0.75,
        kappa=1.3,
        tk_s=tk_s,
        ib_a=17000.0,
        tb_s=0.1,
        branch_contributions=branch_contributions,
    )


# ---------------------------------------------------------------------------
# Testy
# ---------------------------------------------------------------------------


def test_pass_item_for_branch_with_sufficient_cross_section() -> None:
    """PASS: prad gałęzi <= I_dop(t).

    Rachunek niezalezny: Ith(1s)=8000 A, t=0.25 s -> I_dop=8000/0.5=16000 A.
    Wklad zrodla w galezi cable_A = 15000 A (from_to) -> prad galezi = 15000 A.
    15000 <= 16000 -> PASS. wykorzystanie = 15000/16000 = 0.9375.
    """
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=15000.0,
                direction="from_to",
            ),
        ],
    )

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)
    by_id = {item.branch_id: item for item in view.items}

    assert by_id["cable_A"].status == "PASS"
    assert by_id["cable_A"].i_fault_a == 15000.0
    assert by_id["cable_A"].i_permissible_a == 16000.0
    assert by_id["cable_A"].utilization == 0.9375


def test_fail_item_for_branch_with_insufficient_cross_section() -> None:
    """FAIL: prad gałęzi > I_dop(t).

    Rachunek niezalezny: Ith(1s)=8000 A, t=0.25 s -> I_dop=16000 A.
    Wklad w galezi cable_A = 17000 A -> 17000 > 16000 -> FAIL.
    """
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=17000.0,
                direction="from_to",
            ),
        ],
    )

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)
    by_id = {item.branch_id: item for item in view.items}

    assert by_id["cable_A"].status == "FAIL"


def test_unavailable_when_branch_contributions_is_none() -> None:
    """UNAVAILABLE: solver zwarciowy uruchomiony bez include_branch_contributions.

    branch_contributions=None -> KAZDA galaz dostaje conductor.fault_current_missing.
    """
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(tk_s=0.25, branch_contributions=None)

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)

    assert len(view.items) == 2
    for item in view.items:
        assert item.status == "UNAVAILABLE"
        assert item.missing_codes == ("conductor.fault_current_missing",)


def test_unavailable_when_fault_duration_overridden_to_none() -> None:
    """UNAVAILABLE: tk_s_by_branch nadpisuje czas na None -> fault_duration_missing."""
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=15000.0,
                direction="from_to",
            ),
        ],
    )

    view = build_conductor_thermal_withstand_view(
        sc_result, graph, catalog, tk_s_by_branch={"cable_A": None}
    )
    by_id = {item.branch_id: item for item in view.items}

    assert by_id["cable_A"].status == "UNAVAILABLE"
    assert by_id["cable_A"].missing_codes == ("conductor.fault_duration_missing",)


def test_unavailable_when_catalog_thermal_data_missing() -> None:
    """UNAVAILABLE: galaz odwoluje sie do typu, ktorego nie ma w katalogu.

    cable_B ma type_ref="brakujacy_typ", ktorego nie ma w cable_types katalogu ->
    resolve_thermal_params zwraca None -> conductor.thermal_data_missing.
    """
    graph = _graph_with_two_cables(type_ref_b="brakujacy_typ")
    catalog = _catalog_with_cable_type()  # zawiera tylko "cable_pass"
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_B",
                from_node_id="BUS2",
                to_node_id="BUS3",
                i_contrib_a=15000.0,
                direction="from_to",
            ),
        ],
    )

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)
    by_id = {item.branch_id: item for item in view.items}

    assert by_id["cable_B"].status == "UNAVAILABLE"
    assert by_id["cable_B"].missing_codes == ("conductor.thermal_data_missing",)


def test_summary_does_not_count_unavailable_as_pass() -> None:
    """Podsumowanie: UNAVAILABLE liczone osobno, NIGDY jako PASS.

    cable_A: PASS (15000 <= 16000). cable_B: UNAVAILABLE (brak typu w katalogu).
    """
    graph = _graph_with_two_cables(type_ref_b="brakujacy_typ")
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=15000.0,
                direction="from_to",
            ),
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_B",
                from_node_id="BUS2",
                to_node_id="BUS3",
                i_contrib_a=15000.0,
                direction="from_to",
            ),
        ],
    )

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)

    assert view.summary.pass_count == 1
    assert view.summary.fail_count == 0
    assert view.summary.unavailable_count == 1
    # Suma statusow = liczba pozycji; UNAVAILABLE NIE wchodzi do pass_count.
    assert view.summary.pass_count + view.summary.fail_count + view.summary.unavailable_count == 2


def test_zero_current_branch_not_on_fault_path_is_real_zero_not_missing() -> None:
    """Galaz obecna w grafie, ale bez wpisu w branch_contributions (gdy pole
    NIE jest None) oznacza realny brak przeplywu - prad = 0.0 A, PASS (0 <= I_dop),
    NIE UNAVAILABLE."""
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=15000.0,
                direction="from_to",
            ),
            # Brak wpisu dla cable_B (solver pominal i_contrib_a <= 0).
        ],
    )

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)
    by_id = {item.branch_id: item for item in view.items}

    assert by_id["cable_B"].i_fault_a == 0.0
    assert by_id["cable_B"].status == "PASS"


def test_net_current_by_direction_opposing_contributions() -> None:
    """Prad gałęzi = netto wg kierunku (from_to dodatnio, to_from ujemnie).

    20000 A (from_to) - 5000 A (to_from) = 15000 A netto -> jak w tescie PASS.
    """
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=20000.0,
                direction="from_to",
            ),
            ShortCircuitBranchContribution(
                source_id="INV",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=5000.0,
                direction="to_from",
            ),
        ],
    )

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)
    by_id = {item.branch_id: item for item in view.items}

    assert by_id["cable_A"].i_fault_a == 15000.0


def test_items_sorted_deterministically_by_branch_id() -> None:
    """Pozycje wyniku posortowane wg branch_id (determinizm)."""
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(tk_s=0.25, branch_contributions=None)

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)

    assert [item.branch_id for item in view.items] == ["cable_A", "cable_B"]


def test_determinism_two_calls_identical_result() -> None:
    """Ten sam input -> identyczny wynik (dwa niezalezne wywolania)."""
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=15000.0,
                direction="from_to",
            ),
        ],
    )

    view_1 = build_conductor_thermal_withstand_view(sc_result, graph, catalog)
    view_2 = build_conductor_thermal_withstand_view(sc_result, graph, catalog)

    assert view_1.to_dict() == view_2.to_dict()


def test_galaz_poza_droga_zwarcia_ma_jawne_uzasadnienie_statusu() -> None:
    """PASS z zerowego pradu MUSI byc odroznialny od PASS z rachunku kryterium.

    Rozstrzygniecie warstwy interpretacji: prad 0 A jest dla solvera fazy 1 brakiem
    danej (zero nie jest wielkoscia fizyczna tam, gdzie zwarcie liczymy), ale analiza
    WIE, ze zero jest realne — solver pomija wklady i_contrib_a <= 0, a lista wkladow
    istnieje. Status jest wiec PASS, lecz z jawnym uzasadnieniem i bez wielkosci
    kryterialnych (nie ma czego porownywac).
    """
    graph = _graph_with_two_cables()
    catalog = _catalog_with_cable_type()
    sc_result = _sc_result(
        tk_s=0.25,
        branch_contributions=[
            ShortCircuitBranchContribution(
                source_id="GRID",
                branch_id="cable_A",
                from_node_id="BUS1",
                to_node_id="BUS2",
                i_contrib_a=15000.0,
                direction="from_to",
            ),
        ],
    )

    view = build_conductor_thermal_withstand_view(sc_result, graph, catalog)
    by_id = {item.branch_id: item for item in view.items}

    poza_droga = by_id["cable_B"]
    assert poza_droga.status == "PASS"
    assert poza_droga.i_fault_a == 0.0
    assert poza_droga.uzasadnienie_pl is not None
    assert "poza droga zwarcia" in poza_droga.uzasadnienie_pl
    # Brak wielkosci kryterialnych — nie udajemy, ze cokolwiek policzono.
    assert poza_droga.i_permissible_a is None
    assert poza_droga.utilization is None
    assert poza_droga.missing_codes == ()

    # Galaz NA drodze zwarcia ma odwrotnie: wielkosci sa, uzasadnienia nie ma.
    na_drodze = by_id["cable_A"]
    assert na_drodze.uzasadnienie_pl is None
    assert na_drodze.i_permissible_a is not None
