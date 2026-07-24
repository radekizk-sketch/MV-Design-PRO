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
        # IEC 60909-0 §3.3.3 (V12K-177): the SC trace now opens with an explicit
        # K_T correction step per network transformer (KT[<id>]), followed by the
        # canonical fault-quantity steps. Intent preserved: the 7 standard steps
        # appear in order, located by the "Zk" anchor instead of index 0.
        assert any(step["key"] == "KT[T1]" for step in result.white_box_trace)
        zk_index = next(i for i, step in enumerate(result.white_box_trace) if step["key"] == "Zk")
        keys = [step["key"] for step in result.white_box_trace[zk_index : zk_index + 7]]
        assert keys == ["Zk", "Ikss", "kappa", "Ip", "Ib", "Ith", "Sk"]
        for step in result.white_box_trace[zk_index : zk_index + 7]:
            assert {
                "key",
                "title",
                "formula_latex",
                "inputs",
                "substitution",
                "result",
            } <= step.keys()

        z_step = result.white_box_trace[zk_index]
        z_result = z_step["result"]
        assert z_step["key"] == "Zk"
        assert set(z_result) >= {"z_equiv_ohm", "r_ohm", "x_ohm", "z_equiv_abs_ohm"}
        assert z_result["r_ohm"] == pytest.approx(z_result["z_equiv_ohm"].real)
        assert z_result["x_ohm"] == pytest.approx(z_result["z_equiv_ohm"].imag)
        assert z_result["z_equiv_abs_ohm"] == pytest.approx(abs(z_result["z_equiv_ohm"]))

        z_dict = result.to_dict()["white_box_trace"][zk_index]["result"]
        assert z_dict["z_equiv_ohm"]["re"] == pytest.approx(z_result["r_ohm"])
        assert z_dict["z_equiv_ohm"]["im"] == pytest.approx(z_result["x_ohm"])
        assert z_dict["z_equiv_abs_ohm"] == pytest.approx(z_result["z_equiv_abs_ohm"])


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
    # INTENCJA (bez zmian): lista wkładów zawiera sieć + oba falowniki, a udziały
    # sumują się do 1. RE-BASELINE (V12K-184): wkład falownika jest PRZENOSZONY do
    # węzła zwarcia — I_k = I_j·|Z_kj/Z_kk|·(U_j/U_k). Wcześniej wchodził 1:1 w
    # amperach, więc falownik 110 kV oddawał do zwarcia 20 kV tyle samo amperów,
    # co jest złamaniem zasady zachowania mocy.
    # INV-B stoi W węźle zwarcia (B, 20 kV) → współczynnik = 1 (bez zmiany).
    assert contrib_b.i_contrib_a == pytest.approx(inv_b.k_sc * inv_b.in_rated_a, rel=1e-12, abs=0.0)
    # INV-A stoi w węźle A (110 kV); w tej sieci Z_BA/Z_BB ≈ 1 (wspólna gałąź
    # odniesienia 1e9 Ω dominuje), więc przeniesienie to czysta przekładnia
    # 110/20 = 5,5: 1,2·50 A = 60 A (110 kV) → 330 A (20 kV).
    # Dowód niezmienniczości mocy: √3·110 kV·60 A = √3·20 kV·330 A = 11,43 MVA.
    assert contrib_a.i_contrib_a == pytest.approx(
        inv_a.k_sc * inv_a.in_rated_a * (110.0 / 20.0), rel=1e-9, abs=0.0
    )
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


def test_branch_contributions_option_does_not_change_existing_fields():
    """ZWARCIA-PRO F4 (karta W-C): opcja wkładów gałęziowych jest CZYSTO addytywna.

    Włączenie include_branch_contributions nie może zmienić ŻADNEJ istniejącej
    wielkości wyniku ani śladu White Box (determinizm istniejących pól) —
    inaczej tor kanoniczny nie mógłby jej włączyć bez naruszenia FROZEN.
    """
    graph_off = build_transformer_only_graph()
    graph_on = build_transformer_only_graph()
    for graph in (graph_off, graph_on):
        graph.add_inverter_source(create_inverter_source("INV-BC", "A", in_rated_a=50.0, k_sc=1.1))

    base = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph_off,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
    ).to_dict()
    with_bc = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph_on,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    ).to_dict()

    assert base.pop("branch_contributions") is None
    assert with_bc.pop("branch_contributions"), "opcja włączona → niepusta lista wkładów"
    # V12K-132 (pkt 7): ślad WHITE BOX rozpływu Thevenina jest SPRZĘŻONY z opcją
    # wkładów gałęziowych (obecny WYŁĄCZNIE gdy je liczymy) — addytywny, jak
    # branch_contributions. Poza tą parą payload musi być bajt-w-bajt identyczny.
    assert "branch_flow_trace" not in base
    assert with_bc.pop("branch_flow_trace"), "opcja włączona → niepusty ślad rozpływu"
    assert with_bc == base


def test_branch_contributions_with_closed_switch_merged_nodes():
    """Regresja (karta W-C, Zero-Debt): zamknięty łącznik scala węzły — wektor
    iniekcji wkładów gałęziowych MUSI mieć wymiar macierzy Z-bus (liczba
    reprezentantów), nie liczbę wszystkich węzłów. Przed naprawą: matmul
    mismatch dla KAŻDEJ sieci z zamkniętym łącznikiem przy
    include_branch_contributions=True.
    """
    from network_model.core.switch import Switch, SwitchState

    graph = build_transformer_only_graph()
    # Węzeł scalony z "B" zamkniętym łącznikiem: len(node_id_to_index) > wymiar Z-bus.
    graph.add_node(create_pq_node("B2", 20.0))
    graph.add_switch(
        Switch(
            id="SW1",
            name="Łącznik B-B2",
            from_node_id="B",
            to_node_id="B2",
            state=SwitchState.CLOSED,
        )
    )
    graph.add_inverter_source(create_inverter_source("INV-SW", "A", in_rated_a=50.0, k_sc=1.1))

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="B",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    )

    assert result.branch_contributions is not None
    assert len(result.branch_contributions) > 0


# -----------------------------------------------------------------------------
# V12K-132 (pkt 7 karty właściciela): rozpływ prądu zwarciowego od źródła
# zastępczego (Thevenin / sieć nadrzędna) w gałęziach — WHITE BOX.
# -----------------------------------------------------------------------------

THEVENIN_GRID_SOURCE_ID = "THEVENIN_GRID"


def create_slack_node(node_id: str, voltage_level: float) -> Node:
    return Node(
        id=node_id,
        name=f"Slack {node_id}",
        node_type=NodeType.SLACK,
        voltage_level=voltage_level,
        active_power=0.0,
        reactive_power=0.0,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def create_line_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    r_ohm_per_km: float,
    x_ohm_per_km: float,
    length_km: float = 1.0,
) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=f"Line {branch_id}",
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        r_ohm_per_km=r_ohm_per_km,
        x_ohm_per_km=x_ohm_per_km,
        b_us_per_km=0.0,
        length_km=length_km,
        rated_current_a=0.0,
    )


def build_slack_radial_graph() -> NetworkGraph:
    """Sieć promieniowa z realnym źródłem zastępczym (SLACK): A(110) → TX → B(20)
    → linia → C(20). Węzeł zwarcia C jest zwykłą szyną (bez bocznika) — bilans
    rozpływu Thevenina domyka się dokładnie."""
    graph = NetworkGraph()
    graph.add_node(create_slack_node("A", 110.0))
    graph.add_node(create_pq_node("B", 20.0))
    graph.add_node(create_pq_node("C", 20.0))
    graph.add_branch(
        create_transformer_branch(
            "T1",
            "A",
            "B",
            rated_power_mva=25.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=20.0,
            uk_percent=10.0,
            pk_kw=120.0,
        )
    )
    graph.add_branch(create_line_branch("L1", "B", "C", r_ohm_per_km=0.5, x_ohm_per_km=0.4))
    return graph


def build_z_bus_local(graph: NetworkGraph) -> np.ndarray:
    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()
    return np.linalg.inv(y_bus)


def _thevenin_entries(result):
    return [
        bc for bc in (result.branch_contributions or []) if bc.source_id == THEVENIN_GRID_SOURCE_ID
    ]


def _net_inflow_to_fault(result, fault_node_id: str) -> float:
    """Suma (netto) prądów gałęziowych Thevenina WCHODZĄCYCH do węzła zwarcia."""
    total = 0.0
    for bc in _thevenin_entries(result):
        into_fault = (bc.to_node_id == fault_node_id and bc.direction == "from_to") or (
            bc.from_node_id == fault_node_id and bc.direction == "to_from"
        )
        out_of_fault = (bc.from_node_id == fault_node_id and bc.direction == "from_to") or (
            bc.to_node_id == fault_node_id and bc.direction == "to_from"
        )
        if into_fault:
            total += bc.i_contrib_a
        elif out_of_fault:
            total -= bc.i_contrib_a
    return total


def test_thevenin_branch_flow_present_for_grid_source():
    """Sieć z realnym źródłem zastępczym → rozpływ Thevenina obecny w gałęziach."""
    graph = build_slack_radial_graph()
    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="C",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    )
    thev = _thevenin_entries(result)
    assert thev, "sieć ze SLACK musi nieść rozpływ prądu zastępczego (Thevenin)"
    # Kierunek fizyczny: prąd płynie DO węzła zwarcia (L1: B→C).
    l1 = next(bc for bc in thev if bc.branch_id == "L1")
    assert l1.direction == "from_to"


@pytest.mark.parametrize("fault_node_id", ["B", "C"])
def test_thevenin_branch_flow_balances_with_ik_thevenin(fault_node_id):
    """SUMA KONTROLNA (§0): rozpływ Thevenina bilansuje się z Ik''(Thevenin) w
    punkcie zwarcia — Σ prądów gałęziowych wchodzących do węzła = ik_thevenin_a.
    Tolerancja numeryczna jawna (KCL domyka się do precyzji maszynowej)."""
    graph = build_slack_radial_graph()
    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id=fault_node_id,
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    )
    assert result.ik_thevenin_a > 0
    inflow = _net_inflow_to_fault(result, fault_node_id)
    assert inflow == pytest.approx(result.ik_thevenin_a, rel=1e-9, abs=1e-6)


@pytest.mark.parametrize(
    "compute",
    [
        lambda g, n: ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=g,
            fault_node_id=n,
            c_factor=1.0,
            tk_s=1.0,
            include_branch_contributions=True,
        ),
        lambda g, n: ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
            graph=g,
            fault_node_id=n,
            c_factor=1.0,
            tk_s=1.0,
            include_branch_contributions=True,
        ),
        lambda g, n: ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=g,
            fault_node_id=n,
            c_factor=1.0,
            tk_s=1.0,
            z0_bus=build_z_bus_local(g) * 3.0,
            include_branch_contributions=True,
        ),
        lambda g, n: ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
            graph=g,
            fault_node_id=n,
            c_factor=1.0,
            tk_s=1.0,
            z0_bus=build_z_bus_local(g) * 3.0,
            include_branch_contributions=True,
        ),
    ],
)
def test_thevenin_branch_flow_all_fault_types_balance(compute):
    """Wszystkie 4 typy zwarcia obsługiwane w torze kanonicznym niosą rozpływ
    Thevenina bilansujący się z Ik''(Thevenin) danego typu."""
    graph = build_slack_radial_graph()
    result = compute(graph, "C")
    assert result.ik_thevenin_a > 0
    assert _thevenin_entries(result), "każdy typ zwarcia musi nieść rozpływ Thevenina"
    inflow = _net_inflow_to_fault(result, "C")
    assert inflow == pytest.approx(result.ik_thevenin_a, rel=1e-9, abs=1e-6)


def test_thevenin_branch_flow_deterministic():
    """Determinizm (§0): dwa biegi na identycznym wejściu → identyczne rozpływy
    Thevenina i ślad WHITE BOX (bajt-w-bajt po serializacji)."""
    r1 = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=build_slack_radial_graph(),
        fault_node_id="C",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    ).to_dict()
    r2 = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=build_slack_radial_graph(),
        fault_node_id="C",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    ).to_dict()
    assert r1["branch_contributions"] == r2["branch_contributions"]
    assert r1["branch_flow_trace"] == r2["branch_flow_trace"]


def test_thevenin_addition_preserves_inverter_entries_byte_for_byte():
    """ADDYTYWNOŚĆ (§0): dodanie toru Thevenina NIE zmienia wkładów falownikowych
    — wpisy source_id != THEVENIN_GRID są BAJT-W-BAJT identyczne z wynikiem
    dotychczasowej metody `_build_branch_contributions_for_inverters`."""
    graph = build_slack_radial_graph()
    # Falownik w węźle B (≠ węzeł zwarcia C) — jego superpozycja niesie prąd
    # w gałęzi L1 (B→C); zwarcie na C.
    graph.add_inverter_source(create_inverter_source("INV-B", "B", in_rated_a=80.0, k_sc=1.2))

    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="C",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    )
    inverter_entries = [
        bc.to_dict()
        for bc in (result.branch_contributions or [])
        if bc.source_id != THEVENIN_GRID_SOURCE_ID
    ]
    expected = [
        bc.to_dict()
        for bc in ShortCircuitIEC60909Solver._build_branch_contributions_for_inverters(
            graph, "C", ShortCircuitType.THREE_PHASE
        )
    ]
    assert inverter_entries == expected
    # Oba tory obecne: falownikowy ORAZ Thevenina.
    assert inverter_entries, "wkłady falownikowe obecne"
    assert _thevenin_entries(result), "wkłady Thevenina obecne"


def test_thevenin_branch_flow_with_closed_switch_balances():
    """Regresja V12K-120 (rozszerzona na tor Thevenina): zamknięty łącznik scala
    węzły — rozpływ Thevenina MUSI liczyć się (wektor iniekcji o wymiarze Z-bus
    reprezentantów) i wciąż bilansować z Ik''(Thevenin)."""
    from network_model.core.switch import Switch, SwitchState

    graph = build_slack_radial_graph()
    graph.add_node(create_pq_node("C2", 20.0))
    graph.add_switch(
        Switch(
            id="SW1",
            name="Łącznik C-C2",
            from_node_id="C",
            to_node_id="C2",
            state=SwitchState.CLOSED,
        )
    )
    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id="C",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    )
    assert _thevenin_entries(result), "sieć z zamkniętym łącznikiem: rozpływ Thevenina obecny"
    inflow = _net_inflow_to_fault(result, "C")
    assert inflow == pytest.approx(result.ik_thevenin_a, rel=1e-9, abs=1e-6)


def test_branch_flow_trace_is_whitebox():
    """WHITE BOX (§0): ślad rozpływu Thevenina zawiera krok iniekcji, krok per
    gałąź (z napięciami węzłowymi i współczynnikiem podziału) oraz sumę
    kontrolną bilansu (KCL). Obecny WYŁĄCZNIE gdy liczono wkłady gałęziowe."""
    off = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=build_slack_radial_graph(),
        fault_node_id="C",
        c_factor=1.0,
        tk_s=1.0,
    )
    assert off.branch_flow_trace is None
    assert "branch_flow_trace" not in off.to_dict()

    on = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=build_slack_radial_graph(),
        fault_node_id="C",
        c_factor=1.0,
        tk_s=1.0,
        include_branch_contributions=True,
    )
    trace = on.to_dict()["branch_flow_trace"]
    keys = {step["key"] for step in trace}
    assert "thevenin_flow_setup" in keys
    assert "thevenin_flow_balance" in keys
    assert any(k.startswith("thevenin_flow_L1") for k in keys)
    setup = next(s for s in trace if s["key"] == "thevenin_flow_setup")
    v_nodes = setup["result"]["v_nodes_pu"]
    assert isinstance(v_nodes, list) and all("re" in v and "im" in v for v in v_nodes)
    balance = next(s for s in trace if s["key"] == "thevenin_flow_balance")
    assert balance["result"]["sum_into_fault_a"] == pytest.approx(
        on.ik_thevenin_a, rel=1e-9, abs=1e-6
    )
