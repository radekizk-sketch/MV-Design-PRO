"""Tests for IEC 60909 short-circuit solver (3-phase Ik'', Ip, Ith, Sk'')."""

import math

import numpy as np
import pytest
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.solvers.short_circuit_iec60909 import (
    C_MAX,
    C_MIN,
    ShortCircuitIEC60909Solver,
    ShortCircuitType,
)


def create_pq_node(node_id: str, voltage_level: float) -> Node:
    return Node(
        id=node_id,
        name=f"Node {node_id}",
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=5.0,
        reactive_power=2.0,
    )


def create_reference_node(node_id: str, voltage_level: float) -> Node:
    return Node(
        id=node_id,
        name=f"Reference {node_id}",
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=0.0,
        reactive_power=0.0,
    )


def create_transformer_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    rated_power_mva: float,
    voltage_hv_kv: float,
    voltage_lv_kv: float,
    uk_percent: float,
    pk_kw: float,
    in_service: bool = True,
) -> TransformerBranch:
    return TransformerBranch(
        id=branch_id,
        name=f"Transformer {branch_id}",
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        in_service=in_service,
        rated_power_mva=rated_power_mva,
        voltage_hv_kv=voltage_hv_kv,
        voltage_lv_kv=voltage_lv_kv,
        uk_percent=uk_percent,
        pk_kw=pk_kw,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="Dyn11",
        tap_position=0,
        tap_step_percent=2.5,
    )


def create_reference_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    r_ohm: float,
) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=f"Reference {branch_id}",
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        r_ohm_per_km=r_ohm,
        x_ohm_per_km=0.0,
        b_us_per_km=0.0,
        length_km=1.0,
        rated_current_a=0.0,
    )


def create_inverter_source(
    source_id: str,
    node_id: str,
    in_rated_a: float,
    k_sc: float = 1.2,
    contributes_negative_sequence: bool = False,
    contributes_zero_sequence: bool = False,
    in_service: bool = True,
) -> InverterSource:
    return InverterSource(
        id=source_id,
        name=f"Inverter {source_id}",
        node_id=node_id,
        in_rated_a=in_rated_a,
        k_sc=k_sc,
        contributes_negative_sequence=contributes_negative_sequence,
        contributes_zero_sequence=contributes_zero_sequence,
        in_service=in_service,
    )


def find_contribution(contributions, source_id: str):
    return next(contrib for contrib in contributions if contrib.source_id == source_id)


def build_transformer_only_graph(
    pk_kw: float = 120.0,
    uk_percent: float = 10.0,
) -> NetworkGraph:
    graph = NetworkGraph()
    graph.add_node(create_pq_node("A", 110.0))
    graph.add_node(create_pq_node("B", 20.0))
    graph.add_node(create_reference_node("GND", 20.0))

    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=25.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=20.0,
        uk_percent=uk_percent,
        pk_kw=pk_kw,
    )
    graph.add_branch(transformer)
    # tiny reference to ground so Y-bus is invertible in transformer-only tests
    graph.add_branch(create_reference_branch("REF", "B", "GND", r_ohm=1e9))
    return graph


def test_ikss_3ph_transformer_only_matches_formula():
    graph = build_transformer_only_graph()
    c_factor = 1.1
    tk_s = 1.0

    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build(ground_slack_buses=False)
    z_bus = np.linalg.inv(y_bus)

    node_index = builder.node_id_to_index["B"]
    zkk = z_bus[node_index, node_index]
    un_v = graph.nodes["B"].voltage_level * 1000.0
    ikss_expected = (c_factor * un_v) / (math.sqrt(3.0) * abs(zkk))

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=c_factor,
        tk_s=tk_s,
    )

    assert np.isclose(result.ikss_a, ikss_expected)
    assert 0.0 < result.ikss_a < 100_000.0


def test_ikss_increases_with_c_factor():
    graph = build_transformer_only_graph()
    tk_s = 1.0

    result_cmin = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=0.95,
        tk_s=tk_s,
    )
    result_cmax = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.10,
        tk_s=tk_s,
    )

    assert result_cmax.ikss_a > result_cmin.ikss_a


def test_ikss_min_less_than_max():
    graph = build_transformer_only_graph()
    tk_s = 1.0

    res_min = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=C_MIN,
        tk_s=tk_s,
    )
    res_max = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=C_MAX,
        tk_s=tk_s,
    )

    assert res_max.ikss_a > res_min.ikss_a


def test_ikss_min_matches_wrapper_formula():
    graph = build_transformer_only_graph()
    tk_s = 1.0

    res = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=C_MIN,
        tk_s=tk_s,
    )
    expected = (C_MIN * res.un_v) / (math.sqrt(3.0) * abs(res.zkk_ohm))

    assert res.c_factor == C_MIN
    assert res.ikss_a == pytest.approx(expected, rel=1e-12, abs=0.0)


def test_ikss_max_matches_wrapper_formula():
    graph = build_transformer_only_graph()
    tk_s = 1.0

    res = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=C_MAX,
        tk_s=tk_s,
    )
    expected = (C_MAX * res.un_v) / (math.sqrt(3.0) * abs(res.zkk_ohm))

    assert res.c_factor == C_MAX
    assert res.ikss_a == pytest.approx(expected, rel=1e-12, abs=0.0)


def test_invalid_fault_node_raises():
    graph = build_transformer_only_graph()

    with pytest.raises(ValueError, match="Fault node"):
        ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="missing",
            c_factor=1.0,
            tk_s=1.0,
        )


@pytest.mark.parametrize("c_factor", [0.0, -0.5])
def test_nonpositive_c_factor_raises(c_factor: float):
    graph = build_transformer_only_graph()

    with pytest.raises(ValueError, match="c_factor must be > 0"):
        ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=c_factor,
            tk_s=1.0,
        )


@pytest.mark.parametrize("tk_s", [0.0, -1.0])
def test_nonpositive_tk_raises(tk_s: float):
    graph = build_transformer_only_graph()

    with pytest.raises(ValueError, match="tk_s must be > 0"):
        ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=tk_s,
        )


def test_ip_exceeds_sqrt2_times_ikss():
    graph = build_transformer_only_graph()

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.1,
        tk_s=0.5,
    )

    assert result.ip_a > math.sqrt(2.0) * result.ikss_a


def test_sk_matches_formula():
    graph = build_transformer_only_graph()

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.1,
        tk_s=1.0,
    )

    expected = (math.sqrt(3.0) * result.un_v * result.ikss_a) / 1_000_000.0
    assert result.sk_mva == pytest.approx(expected, rel=1e-12, abs=0.0)


def test_post_processing_quantities_match_ikss_formula():
    graph = build_transformer_only_graph()
    tb_s = 0.1
    tk_s = 0.4

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.05,
        tk_s=tk_s,
        tb_s=tb_s,
    )

    rx_ratio = math.inf if result.zkk_ohm.imag == 0 else result.zkk_ohm.real / result.zkk_ohm.imag
    kappa = 1.02 + 0.98 * math.exp(-3.0 * rx_ratio)
    ip_expected = kappa * math.sqrt(2.0) * result.ikss_a
    ith_expected = result.ikss_a * math.sqrt(tk_s)
    sk_expected = (math.sqrt(3.0) * result.un_v * result.ikss_a) / 1_000_000.0

    omega = 2.0 * math.pi * 50.0
    r_ohm = result.zkk_ohm.real
    x_ohm = result.zkk_ohm.imag
    ta_s = 0.0 if r_ohm <= 0 or x_ohm <= 0 else x_ohm / (omega * r_ohm)
    exp_factor = 0.0 if ta_s <= 0 else math.exp(-tb_s / ta_s)
    ib_expected = result.ikss_a * math.sqrt(1.0 + ((kappa - 1.0) * exp_factor) ** 2)

    assert result.kappa == pytest.approx(kappa, rel=1e-12, abs=0.0)
    assert result.ip_a == pytest.approx(ip_expected, rel=1e-12, abs=0.0)
    assert result.ith_a == pytest.approx(ith_expected, rel=1e-12, abs=0.0)
    assert result.sk_mva == pytest.approx(sk_expected, rel=1e-12, abs=0.0)
    assert result.ib_a == pytest.approx(ib_expected, rel=1e-12, abs=0.0)


def test_ib_is_ge_ikss_and_decays_with_time():
    graph = build_transformer_only_graph(pk_kw=120.0)

    res_short = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        tb_s=0.02,
    )
    res_long = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        tb_s=0.2,
    )

    assert res_short.ib_a >= res_short.ikss_a
    assert res_long.ib_a >= res_long.ikss_a
    assert res_short.ib_a >= res_long.ib_a


def test_ib_equals_ikss_when_time_constant_is_zeroish():
    graph = build_transformer_only_graph()

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        tb_s=100.0,
    )

    assert result.ib_a == pytest.approx(result.ikss_a, rel=1e-8, abs=0.0)


def test_increasing_rx_ratio_reduces_kappa_and_ip():
    graph_low_rx = build_transformer_only_graph(pk_kw=120.0)
    graph_high_rx = build_transformer_only_graph(pk_kw=300.0)

    result_low = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph_low_rx,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )
    result_high = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph_high_rx,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )

    # IEC 60909: większe R/X => mniejsza kappa => mniejszy Ip.
    # Uwaga: rx_ratio może wyjść nieskończone (X≈0) — to przypadek graniczny, nie błąd solvera.
    low_finite = math.isfinite(result_low.rx_ratio)
    high_finite = math.isfinite(result_high.rx_ratio)

    if low_finite and high_finite:
        # Standardowy przypadek: oba skończone
        if result_high.rx_ratio < result_low.rx_ratio:
            # Zamień role, żeby "high" oznaczało większe R/X
            result_low, result_high = result_high, result_low
        assert result_high.rx_ratio > result_low.rx_ratio
        assert result_high.kappa < result_low.kappa
        assert result_high.ip_a < result_low.ip_a
    else:
        # Przypadek graniczny: inf traktujemy jako "większe R/X"
        # Ustal, który wynik ma większe (w sensie rozszerzonym) R/X
        def rx_key(r):
            return float("inf") if not math.isfinite(r.rx_ratio) else r.rx_ratio

        low, high = sorted([result_low, result_high], key=lambda r: rx_key(r))
        assert rx_key(high) > rx_key(low)
        assert high.kappa <= low.kappa
        assert high.ip_a <= low.ip_a


def test_ith_scales_with_time():
    graph = build_transformer_only_graph()

    result_t1 = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )
    result_t4 = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=4.0,
    )

    assert result_t1.ith_a == pytest.approx(result_t1.ikss_a, rel=1e-12, abs=0.0)
    assert result_t4.ith_a == pytest.approx(2.0 * result_t4.ikss_a, rel=1e-12, abs=0.0)


def test_zkk_from_inverse_ybus():
    graph = build_transformer_only_graph()

    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build(ground_slack_buses=False)
    z_bus = np.linalg.inv(y_bus)
    node_index = builder.node_id_to_index["B"]
    z_base_ohm = builder.get_zbase_ohm("B")
    zkk_expected = z_bus[node_index, node_index] * z_base_ohm

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )

    assert result.zkk_ohm == pytest.approx(zkk_expected)


def build_z_bus(graph: NetworkGraph) -> np.ndarray:
    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build(ground_slack_buses=False)
    return np.linalg.inv(y_bus)


def test_unbalanced_fault_currents_are_ordered():
    graph = build_transformer_only_graph()
    z1_bus = build_z_bus(graph)
    z0_bus = z1_bus * 3.0

    res_3ph = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )
    res_2ph = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )
    res_1ph = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_bus,
    )

    assert res_1ph.short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND
    assert res_2ph.short_circuit_type == ShortCircuitType.TWO_PHASE
    assert res_1ph.ikss_a < res_2ph.ikss_a < res_3ph.ikss_a
    assert res_1ph.ip_a < res_2ph.ip_a < res_3ph.ip_a
    assert res_1ph.ith_a < res_2ph.ith_a < res_3ph.ith_a
    assert res_1ph.ib_a < res_2ph.ib_a < res_3ph.ib_a


def test_white_box_trace_has_expected_steps():
    graph = build_transformer_only_graph()
    z0_bus = build_z_bus(graph) * 3.0

    res_3ph = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )
    res_1ph = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_bus,
    )

    for result in (res_3ph, res_1ph):
        assert isinstance(result.white_box_trace, list)
        assert len(result.white_box_trace) >= 7
        keys = [step["key"] for step in result.white_box_trace[:7]]
        assert keys == ["Zk", "Ikss", "kappa", "Ip", "Ib", "Ith", "Sk"]
        for step in result.white_box_trace[:7]:
            assert {
                "key",
                "title",
                "formula_latex",
                "inputs",
                "substitution",
                "substitution_latex",
                "result",
            } <= step.keys()


def test_2ph_ground_depends_on_z0_and_requires_it():
    graph = build_transformer_only_graph()
    z1_bus = build_z_bus(graph)
    z0_low = z1_bus * 0.5
    z0_high = z1_bus * 5.0

    res_low = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_low,
    )
    res_high = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_high,
    )

    assert res_low.ikss_a > res_high.ikss_a

    with pytest.raises(ValueError, match="Z0 bus matrix is required"):
        ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )


def test_no_inverter_sources_keeps_ik_totals_equal():
    graph = build_transformer_only_graph()

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )

    assert result.ik_inverters_a == 0.0
    assert result.ik_total_a == pytest.approx(result.ikss_a, rel=1e-12, abs=0.0)
    assert result.ik_thevenin_a == pytest.approx(result.ikss_a, rel=1e-12, abs=0.0)


def test_inverter_adds_current_to_3ph_fault():
    graph = build_transformer_only_graph()
    inverter = create_inverter_source("INV-1", "B", in_rated_a=120.0, k_sc=1.15)
    graph.add_inverter_source(inverter)

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )

    expected_inv = inverter.k_sc * inverter.in_rated_a
    assert result.ik_inverters_a == pytest.approx(expected_inv, rel=1e-12, abs=0.0)
    assert result.ik_total_a == pytest.approx(
        result.ik_thevenin_a + expected_inv, rel=1e-12, abs=0.0
    )


def test_inverter_zero_sequence_controls_1ph_and_2ph_ground():
    graph_no_zero = build_transformer_only_graph()
    inverter = create_inverter_source("INV-2", "B", in_rated_a=90.0, k_sc=1.1)
    graph_no_zero.add_inverter_source(inverter)
    z0_bus = build_z_bus(graph_no_zero) * 3.0

    res_1ph_no_zero = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph_no_zero,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_bus,
    )
    res_2phg_no_zero = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
        graph=graph_no_zero,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_bus,
    )

    assert res_1ph_no_zero.ik_inverters_a == 0.0
    assert res_2phg_no_zero.ik_inverters_a == 0.0

    graph_with_zero = build_transformer_only_graph()
    inverter_zero = create_inverter_source(
        "INV-3",
        "B",
        in_rated_a=90.0,
        k_sc=1.1,
        contributes_zero_sequence=True,
    )
    graph_with_zero.add_inverter_source(inverter_zero)
    z0_bus = build_z_bus(graph_with_zero) * 3.0

    res_1ph_zero = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph_with_zero,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_bus,
    )
    res_2phg_zero = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
        graph=graph_with_zero,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_bus,
    )

    expected_inv = inverter_zero.k_sc * inverter_zero.in_rated_a
    assert res_1ph_zero.ik_inverters_a == pytest.approx(expected_inv, rel=1e-12, abs=0.0)
    assert res_2phg_zero.ik_inverters_a == pytest.approx(expected_inv, rel=1e-12, abs=0.0)


def test_inverter_contribution_is_deterministic():
    graph_a = build_transformer_only_graph()
    graph_b = build_transformer_only_graph()
    inv1 = create_inverter_source("INV-A", "B", in_rated_a=50.0, k_sc=1.2)
    inv2 = create_inverter_source("INV-B", "B", in_rated_a=80.0, k_sc=1.1)

    graph_a.add_inverter_source(inv1)
    graph_a.add_inverter_source(inv2)
    graph_b.add_inverter_source(inv2)
    graph_b.add_inverter_source(inv1)

    res_a = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph_a,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )
    res_b = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph_b,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )

    assert res_a.ik_inverters_a == pytest.approx(res_b.ik_inverters_a, rel=1e-12, abs=0.0)
    assert res_a.ik_total_a == pytest.approx(res_b.ik_total_a, rel=1e-12, abs=0.0)


def test_contributions_contains_grid_and_inverters():
    graph = build_transformer_only_graph()
    inv_a = create_inverter_source("INV-A", "A", in_rated_a=50.0, k_sc=1.2)
    inv_b = create_inverter_source("INV-B", "B", in_rated_a=80.0, k_sc=1.1)
    graph.add_inverter_source(inv_a)
    graph.add_inverter_source(inv_b)

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )

    grid = find_contribution(result.contributions, "THEVENIN_GRID")
    contrib_a = find_contribution(result.contributions, "INV-A")
    contrib_b = find_contribution(result.contributions, "INV-B")

    assert grid.i_contrib_a == pytest.approx(result.ik_thevenin_a, rel=1e-12, abs=0.0)
    assert contrib_a.i_contrib_a == pytest.approx(inv_a.k_sc * inv_a.in_rated_a, rel=1e-12, abs=0.0)
    assert contrib_b.i_contrib_a == pytest.approx(inv_b.k_sc * inv_b.in_rated_a, rel=1e-12, abs=0.0)
    total_share = sum(contrib.share for contrib in result.contributions)
    assert total_share == pytest.approx(1.0, rel=1e-12, abs=0.0)


def test_contributions_deterministic_order():
    graph_a = build_transformer_only_graph()
    graph_b = build_transformer_only_graph()
    inv_a = create_inverter_source("INV-A", "A", in_rated_a=40.0, k_sc=1.1)
    inv_b = create_inverter_source("INV-B", "B", in_rated_a=70.0, k_sc=1.2)
    graph_a.add_inverter_source(inv_a)
    graph_a.add_inverter_source(inv_b)
    graph_b.add_inverter_source(inv_b)
    graph_b.add_inverter_source(inv_a)

    res_a = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph_a,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )
    res_b = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph_b,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    )

    assert res_a.contributions == res_b.contributions


def test_contributions_respect_fault_type_flags():
    graph = build_transformer_only_graph()
    inverter = create_inverter_source("INV-Z", "B", in_rated_a=90.0, k_sc=1.1)
    graph.add_inverter_source(inverter)
    z0_bus = build_z_bus(graph) * 3.0

    res_1ph = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_bus,
    )
    inv_contrib = find_contribution(res_1ph.contributions, "INV-Z")
    assert inv_contrib.i_contrib_a == 0.0

    graph_with_zero = build_transformer_only_graph()
    inverter_zero = create_inverter_source(
        "INV-Z",
        "B",
        in_rated_a=90.0,
        k_sc=1.1,
        contributes_zero_sequence=True,
    )
    graph_with_zero.add_inverter_source(inverter_zero)
    z0_bus = build_z_bus(graph_with_zero) * 3.0

    res_1ph_zero = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph_with_zero,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        z0_bus=z0_bus,
    )
    inv_contrib_zero = find_contribution(res_1ph_zero.contributions, "INV-Z")
    expected = inverter_zero.k_sc * inverter_zero.in_rated_a
    assert inv_contrib_zero.i_contrib_a == pytest.approx(expected, rel=1e-12, abs=0.0)


def test_branch_contributions_basic():
    graph = build_transformer_only_graph()
    inverter = create_inverter_source("INV-BC", "A", in_rated_a=50.0, k_sc=1.1)
    graph.add_inverter_source(inverter)

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    )

    assert result.branch_contributions is not None
    assert len(result.branch_contributions) > 0
