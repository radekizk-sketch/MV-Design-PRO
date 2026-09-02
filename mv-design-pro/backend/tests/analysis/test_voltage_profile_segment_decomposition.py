"""P0.4 (nN): testy dekompozycji ΔU per odcinek (analysis/voltage_profile).

Sieć testowa = sieć ze scenariusza (b) karty P0.4
(``tests/network_model/solvers/test_power_flow_lv.py``): slack 15 kV -> kabel
SN -> TR 15/0,4 (tap neutralny) -> 3 odcinki nN -> odbiory. Solver PF
(FROZEN) uruchamiany raz per test, wynik zawijany do ``PowerFlowResultV1``
(frozen Result API) — dekompozycja czyta WYŁĄCZNIE ten wynik + topologię
grafu, zero fizyki.
"""

from __future__ import annotations

import math

import pytest
from analysis.voltage_profile.segment_decomposition import (
    PASMO_NN_MAX_KV,
    VoltageProfileSegmentBuilder,
    VoltageProfileSegmentPathError,
    find_worst_nn_bus,
    find_worst_nn_path,
)
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_result import PowerFlowResultV1, build_power_flow_result_v1
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

COS_PHI = 0.93
SIN_PHI = math.sqrt(1.0 - COS_PHI**2)
YAKY_4X35_R_OHM_PER_KM = 0.868
YAKY_4X35_X_OHM_PER_KM = 0.082
LOAD_P_MW = 0.020
LOAD_Q_MVAR = LOAD_P_MW * SIN_PHI / COS_PHI


def _slack(node_id: str, kv: float) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.SLACK,
        voltage_level=kv,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def _pq(node_id: str, kv: float) -> Node:
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=kv,
        active_power=0.0,
        reactive_power=0.0,
    )


def _cable(branch_id: str, from_node: str, to_node: str, length_km: float) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.CABLE,
        from_node_id=from_node,
        to_node_id=to_node,
        r_ohm_per_km=YAKY_4X35_R_OHM_PER_KM,
        x_ohm_per_km=YAKY_4X35_X_OHM_PER_KM,
        b_us_per_km=0.0,
        length_km=length_km,
        rated_current_a=125.0,
    )


def _transformer(branch_id: str, from_node: str, to_node: str) -> TransformerBranch:
    return TransformerBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node,
        to_node_id=to_node,
        rated_power_mva=0.4,
        voltage_hv_kv=15.0,
        voltage_lv_kv=0.4,
        uk_percent=4.0,
        pk_kw=4.6,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="Dyn11",
        tap_position=0,
        tap_step_percent=2.5,
    )


def _build_mv_lv_network_b() -> NetworkGraph:
    """Sieć ze scenariusza (b) karty P0.4 — patrz `test_power_flow_lv.py`."""
    graph = NetworkGraph()
    graph.add_node(_slack("MVSLACK", 15.0))
    graph.add_node(_pq("MVBUS", 15.0))
    graph.add_node(_pq("LVBUS", 0.4))
    graph.add_node(_pq("LV1", 0.4))
    graph.add_node(_pq("LV2", 0.4))
    graph.add_node(_pq("LV3", 0.4))

    graph.add_branch(_cable("C_MV", "MVSLACK", "MVBUS", 2.0))
    graph.add_branch(_transformer("TR1", "MVBUS", "LVBUS"))
    graph.add_branch(_cable("L_LV1", "LVBUS", "LV1", 0.05))
    graph.add_branch(_cable("L_LV2", "LV1", "LV2", 0.05))
    graph.add_branch(_cable("L_LV3", "LV2", "LV3", 0.05))
    return graph


def _solve_network_b() -> tuple[NetworkGraph, PowerFlowResultV1]:
    graph = _build_mv_lv_network_b()
    pq = [
        PQSpec(node_id="LV1", p_mw=LOAD_P_MW, q_mvar=LOAD_Q_MVAR),
        PQSpec(node_id="LV2", p_mw=LOAD_P_MW, q_mvar=LOAD_Q_MVAR),
        PQSpec(node_id="LV3", p_mw=LOAD_P_MW, q_mvar=LOAD_Q_MVAR),
        PQSpec(node_id="MVBUS", p_mw=0.0, q_mvar=0.0),
        PQSpec(node_id="LVBUS", p_mw=0.0, q_mvar=0.0),
    ]
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=1.0,
        slack=SlackSpec(node_id="MVSLACK", u_pu=1.0, angle_rad=0.0),
        pq=pq,
        options=PowerFlowOptions(max_iter=100, tolerance=1e-10, flat_start=True),
    )
    solution = PowerFlowNewtonSolver().solve(pf_input)
    assert solution.converged is True
    result_v1 = build_power_flow_result_v1(
        converged=solution.converged,
        iterations_count=solution.iterations,
        tolerance_used=pf_input.options.tolerance,
        base_mva=pf_input.base_mva,
        slack_bus_id=pf_input.slack.node_id,
        node_u_mag=solution.node_u_mag,
        node_angle=solution.node_angle,
        node_p_injected_pu={},
        node_q_injected_pu={},
        branch_s_from_mva=solution.branch_s_from_mva,
        branch_s_to_mva=solution.branch_s_to_mva,
        losses_total=solution.losses_total,
        slack_power_pu=solution.slack_power,
    )
    return graph, result_v1


class TestSegmentDecompositionNetworkB:
    def test_segments_sum_to_source_minus_node_voltage(self) -> None:
        graph, result_v1 = _solve_network_b()
        path = VoltageProfileSegmentBuilder(graph).build_path(result_v1, "LV3")

        assert path.source_id == "MVSLACK"
        assert path.node_id == "LV3"
        # 4 gałęzie na trasie: C_MV, TR1, L_LV1, L_LV2, L_LV3 -> 5 segmentów.
        assert [segment.branch_id for segment in path.segments] == [
            "C_MV",
            "TR1",
            "L_LV1",
            "L_LV2",
            "L_LV3",
        ]

        total_delta_u_kv = sum(segment.delta_u_kv for segment in path.segments)
        assert total_delta_u_kv == pytest.approx(path.u_source_kv - path.u_node_kv, abs=1e-6)

    def test_segments_chain_endpoints_match_adjacent_bus_voltages(self) -> None:
        """`to_bus` napięcie segmentu i == `from_bus` napięcie segmentu i+1
        (spójny łańcuch, żaden bus nie jest pominięty/zdublowany)."""
        graph, result_v1 = _solve_network_b()
        path = VoltageProfileSegmentBuilder(graph).build_path(result_v1, "LV3")

        assert path.segments[0].from_bus == "MVSLACK"
        assert path.segments[0].u_from_kv == pytest.approx(path.u_source_kv)
        assert path.segments[-1].to_bus == "LV3"
        assert path.segments[-1].u_to_kv == pytest.approx(path.u_node_kv)
        for earlier, later in zip(path.segments, path.segments[1:], strict=False):
            assert earlier.to_bus == later.from_bus
            assert earlier.u_to_kv == pytest.approx(later.u_from_kv)

    def test_worst_nn_path_points_to_end_of_feeder(self) -> None:
        graph, result_v1 = _solve_network_b()
        worst = find_worst_nn_bus(graph, result_v1)
        assert worst is not None
        worst_bus_id, worst_v_pu = worst
        assert worst_bus_id == "LV3"

        # Weryfikacja niezależna: LV3 rzeczywiście ma najniższe |V| pu wśród
        # szyn nN (LVBUS/LV1/LV2/LV3).
        nn_bus_ids = ["LVBUS", "LV1", "LV2", "LV3"]
        v_map = {bus.bus_id: bus.v_pu for bus in result_v1.bus_results}
        assert worst_v_pu == min(v_map[b] for b in nn_bus_ids)

        worst_path = find_worst_nn_path(graph, result_v1)
        assert worst_path is not None
        assert worst_path.node_id == "LV3"

    def test_double_invocation_is_deterministic(self) -> None:
        graph, result_v1 = _solve_network_b()
        builder = VoltageProfileSegmentBuilder(graph)
        first = builder.build_path(result_v1, "LV3").to_dict()
        second = builder.build_path(result_v1, "LV3").to_dict()
        assert first == second

        first_worst = find_worst_nn_path(graph, result_v1)
        second_worst = find_worst_nn_path(graph, result_v1)
        assert first_worst is not None and second_worst is not None
        assert first_worst.to_dict() == second_worst.to_dict()

    def test_intermediate_node_path_is_prefix_of_longer_path(self) -> None:
        graph, result_v1 = _solve_network_b()
        builder = VoltageProfileSegmentBuilder(graph)
        path_lv1 = builder.build_path(result_v1, "LV1")
        path_lv3 = builder.build_path(result_v1, "LV3")

        assert [s.branch_id for s in path_lv1.segments] == ["C_MV", "TR1", "L_LV1"]
        assert [s.branch_id for s in path_lv3.segments][: len(path_lv1.segments)] == [
            s.branch_id for s in path_lv1.segments
        ]

    def test_unknown_node_raises(self) -> None:
        graph, result_v1 = _solve_network_b()
        with pytest.raises(VoltageProfileSegmentPathError):
            VoltageProfileSegmentBuilder(graph).build_path(result_v1, "NIE_ISTNIEJE")

    def test_source_defaults_to_slack(self) -> None:
        graph, result_v1 = _solve_network_b()
        explicit = VoltageProfileSegmentBuilder(graph).build_path(
            result_v1, "LV3", source_id="MVSLACK"
        )
        implicit = VoltageProfileSegmentBuilder(graph).build_path(result_v1, "LV3")
        assert explicit.to_dict() == implicit.to_dict()


class TestSegmentDecompositionSwitchOnPath:
    """Sieć z ŁĄCZNIKIEM (bez równoległej gałęzi) na trasie źródło->węzeł —
    wymusza przejście BFS przez krawędź typu switch (pomijaną w segmentach),
    dowodząc niezmiennika sumy mimo znikomego (nie dokładnie zerowego)
    spadku na łączniku (patrz docstring `segment_decomposition.py`)."""

    def _network_with_switch(self) -> tuple[NetworkGraph, PowerFlowResultV1]:
        graph = NetworkGraph()
        graph.add_node(_slack("A", 0.4))
        graph.add_node(_pq("B", 0.4))
        graph.add_node(_pq("C", 0.4))
        graph.add_switch(
            Switch(
                id="SW_AB",
                name="SW_AB",
                switch_type=SwitchType.BREAKER,
                from_node_id="A",
                to_node_id="B",
                state=SwitchState.CLOSED,
            )
        )
        graph.add_branch(_cable("L_BC", "B", "C", 0.05))
        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=1.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[
                PQSpec(node_id="B", p_mw=0.0, q_mvar=0.0),
                PQSpec(node_id="C", p_mw=0.010, q_mvar=0.004),
            ],
            options=PowerFlowOptions(max_iter=100, tolerance=1e-10, flat_start=True),
        )
        solution = PowerFlowNewtonSolver().solve(pf_input)
        assert solution.converged is True
        result_v1 = build_power_flow_result_v1(
            converged=solution.converged,
            iterations_count=solution.iterations,
            tolerance_used=pf_input.options.tolerance,
            base_mva=pf_input.base_mva,
            slack_bus_id=pf_input.slack.node_id,
            node_u_mag=solution.node_u_mag,
            node_angle=solution.node_angle,
            node_p_injected_pu={},
            node_q_injected_pu={},
            branch_s_from_mva=solution.branch_s_from_mva,
            branch_s_to_mva=solution.branch_s_to_mva,
            losses_total=solution.losses_total,
            slack_power_pu=solution.slack_power,
        )
        return graph, result_v1

    def test_switch_hop_omitted_from_segments_but_invariant_holds(self) -> None:
        graph, result_v1 = self._network_with_switch()
        path = VoltageProfileSegmentBuilder(graph).build_path(result_v1, "C")

        # Łącznik SW_AB NIE pojawia się jako segment (zerowa impedancja do
        # zdekomponowania) — jedyny segment to kabel L_BC.
        assert [segment.branch_id for segment in path.segments] == ["L_BC"]
        # `from_bus` pierwszego (jedynego) segmentu to B, NIE A — bo A i B są
        # połączone przez łącznik, który jest hopem BFS, ale nie segmentem.
        assert path.segments[0].from_bus == "B"

        total_delta_u_kv = sum(segment.delta_u_kv for segment in path.segments)
        # Niezmiennik trzyma się mimo pominięcia hopa łącznika — bo spadek na
        # zamkniętym łączniku jest numerycznie znikomy (patrz tolerancja
        # `segment_decomposition._TELESCOPING_TOLERANCE_KV`), NIE dlatego że
        # jest dokładnie zero.
        assert total_delta_u_kv == pytest.approx(path.u_source_kv - path.u_node_kv, abs=1e-4)

    def test_unreachable_node_raises(self) -> None:
        graph, result_v1 = self._network_with_switch()
        graph.add_node(_pq("ISOLATED", 0.4))
        with pytest.raises(VoltageProfileSegmentPathError):
            VoltageProfileSegmentBuilder(graph).build_path(result_v1, "ISOLATED")


def test_pasmo_nn_threshold_matches_enm_validator_band() -> None:
    """`PASMO_NN_MAX_KV` lokalny musi zgadzać się z granicą pasma nN, którą
    faktycznie stosuje `enm.validator._voltage_band` (jedna prawda progu
    pasma — patrz uzasadnienie braku importu stałej w
    `segment_decomposition.py`, gdzie próg jest prywatny w `enm.validator`)."""
    from enm.validator import _voltage_band

    assert _voltage_band(PASMO_NN_MAX_KV - 0.001) == "nN"
    assert _voltage_band(PASMO_NN_MAX_KV) == "SN"


def test_find_worst_nn_bus_returns_none_without_nn_buses() -> None:
    """Sieć czysto SN (bez żadnej szyny nN) -> uczciwy `None`, zero fabrykacji."""
    graph = NetworkGraph()
    graph.add_node(_slack("A", 15.0))
    graph.add_node(_pq("B", 15.0))
    graph.add_branch(_cable("L1", "A", "B", 1.0))
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=1.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=1.0, q_mvar=0.4)],
        options=PowerFlowOptions(max_iter=50, tolerance=1e-9),
    )
    solution = PowerFlowNewtonSolver().solve(pf_input)
    assert solution.converged is True
    result_v1 = build_power_flow_result_v1(
        converged=solution.converged,
        iterations_count=solution.iterations,
        tolerance_used=pf_input.options.tolerance,
        base_mva=pf_input.base_mva,
        slack_bus_id=pf_input.slack.node_id,
        node_u_mag=solution.node_u_mag,
        node_angle=solution.node_angle,
        node_p_injected_pu={},
        node_q_injected_pu={},
        branch_s_from_mva=solution.branch_s_from_mva,
        branch_s_to_mva=solution.branch_s_to_mva,
        losses_total=solution.losses_total,
        slack_power_pu=solution.slack_power,
    )
    assert find_worst_nn_bus(graph, result_v1) is None
    assert find_worst_nn_path(graph, result_v1) is None
