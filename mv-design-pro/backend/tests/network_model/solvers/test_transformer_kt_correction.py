"""IEC 60909-0 §3.3.3 — impedance correction factor K_T for network transformers.

SM-1 (V12K-177): hard proof of the K_T correction at source, plus a source+TR+fault
hand-calc case proving direction (K_T < 1 => smaller Z_T => larger Ik'').

K_T = 0.95 * c_max / (1 + 0.6 * x_T),  Z_TK = K_T * (R_T + jX_T)
"""

import math

import numpy as np
from network_model.core.branch import BranchType, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver


def _transformer(
    rated_power_mva: float = 25.0,
    voltage_hv_kv: float = 110.0,
    voltage_lv_kv: float = 20.0,
    uk_percent: float = 10.0,
    pk_kw: float = 120.0,
) -> TransformerBranch:
    return TransformerBranch(
        id="T1",
        name="Transformer T1",
        branch_type=BranchType.TRANSFORMER,
        from_node_id="A",
        to_node_id="B",
        in_service=True,
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


def test_kt_hand_computation_and_zt_correction_identity():
    """Hard proof (card SM-1 §0.5): Z_TK == K_T * Z_T with K_T computed by hand.

    Transformer: S_rT = 25 MVA, 110/20 kV, uk = 10 %, pk = 120 kW.
        r_T = (pk/1000)/S_rT = 0.12/25          = 0.004800  [pu on ratings]
        z_T = uk/100                            = 0.100000  [pu]
        x_T = sqrt(z_T^2 - r_T^2)
            = sqrt(0.01 - 0.004800^2)           = 0.09988473...  [pu]
        c_max (LV 20 kV, IEC 60909 Table 1)     = 1.10
        K_T = 0.95 * 1.10 / (1 + 0.6 * 0.09988473)
            = 1.045 / 1.05993084                = 0.98591339...
        Z_TK = K_T * (0.004800 + j0.09988473)
             = (0.00473238 + j0.09847770)       [pu on ratings]
    """
    trafo = _transformer()

    r_t = (120.0 / 1000.0) / 25.0
    z_t_mag = 10.0 / 100.0
    x_t_hand = math.sqrt(z_t_mag**2 - r_t**2)
    c_max_hand = 1.10
    k_t_hand = 0.95 * c_max_hand / (1.0 + 0.6 * x_t_hand)

    # x_T, c_max exposed and matching first principles.
    assert math.isclose(trafo.get_relative_reactance_xt(), x_t_hand, rel_tol=0, abs_tol=1e-12)
    assert math.isclose(trafo.get_voltage_factor_c_max(), c_max_hand, rel_tol=0, abs_tol=1e-12)

    # K_T equals the hand value (0.98591339...).
    k_t = trafo.get_kt_correction_factor()
    assert math.isclose(k_t, k_t_hand, rel_tol=0, abs_tol=1e-12)
    assert math.isclose(k_t, 0.98591339, rel_tol=0, abs_tol=1e-6)
    assert k_t < 1.0  # this transformer: correction reduces impedance

    # HARD identity: Z_TK == K_T * Z_T exactly (value-for-value).
    z_t = trafo.get_short_circuit_impedance_pu()
    z_tk = trafo.get_short_circuit_impedance_pu_corrected()
    assert z_tk == k_t * z_t
    assert math.isclose(z_tk.real, 0.00473238, rel_tol=0, abs_tol=1e-7)
    assert math.isclose(z_tk.imag, 0.09847770, rel_tol=0, abs_tol=1e-6)


def _source_tr_fault_graph() -> NetworkGraph:
    """External grid (SLACK, 110 kV) — network transformer — LV fault bus (20 kV)."""
    graph = NetworkGraph()
    graph.add_node(
        Node(
            id="A",
            name="Grid",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graph.add_node(
        Node(
            id="B",
            name="LV bus",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_branch(_transformer())
    return graph


def test_kt_direction_increases_ikss_on_lv_fault():
    """Hand-calc case (card SM-1 §WYKONANIE.6): source + TR + fault on LV bus.

    K_T = 0.98591 < 1  =>  Z_TK = K_T * Z_T  <  Z_T  =>  Ik'' larger by ~1/K_T.
    The solver stamps the corrected impedance, so Ik''_corr / Ik''_uncorr = 1/K_T.
    """
    graph = _source_tr_fault_graph()
    c_factor = 1.1
    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph, fault_node_id="B", c_factor=c_factor, tk_s=1.0
    )

    k_t = _transformer().get_kt_correction_factor()

    # Solver Ik'' matches the corrected Y-bus formula (same builder path).
    builder = AdmittanceMatrixBuilder(graph)
    z_bus = np.linalg.inv(builder.build(ground_slack_buses=True))
    idx = builder.node_id_to_index["B"]
    z_base_b = builder.get_zbase_ohm("B")
    z1 = z_bus[idx, idx] * z_base_b
    un_v = 20.0 * 1000.0
    ikss_expected = c_factor * un_v * (1.0 / math.sqrt(3.0)) / abs(z1)
    assert np.isclose(result.ikss_a, ikss_expected)

    # Direction: the same fault WITHOUT the K_T correction would give the smaller
    # current Ik''_uncorr = K_T * Ik''_corr (Z scales by 1/K_T, current by K_T).
    ikss_uncorrected = k_t * result.ikss_a
    assert result.ikss_a > ikss_uncorrected
    assert np.isclose(result.ikss_a / ikss_uncorrected, 1.0 / k_t)


def test_kt_whitebox_trace_entry_present():
    """WHITE BOX (card SM-1 §0.4): the SC trace exposes X_T, U_rT, S_rT, x_T,
    c_max, K_T (formula + substitution), Z_T, Z_TK for the network transformer."""
    graph = _source_tr_fault_graph()
    result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph, fault_node_id="B", c_factor=1.1, tk_s=1.0
    )
    trafo = _transformer()

    kt_steps = [s for s in result.white_box_trace if s.get("key") == "KT[T1]"]
    assert len(kt_steps) == 1
    step = kt_steps[0]

    assert "K_T = 0.95" in step["formula_latex"]
    inputs = step["inputs"]
    assert math.isclose(inputs["s_rt_mva"], 25.0)
    assert math.isclose(inputs["u_rt_hv_kv"], 110.0)
    assert math.isclose(inputs["u_rt_lv_kv"], 20.0)
    assert math.isclose(inputs["x_t_pu"], trafo.get_relative_reactance_xt())
    assert math.isclose(inputs["c_max"], 1.10)

    res = step["result"]
    assert math.isclose(res["k_t"], trafo.get_kt_correction_factor())
    # Z_TK == K_T * Z_T also visible in the raw trace result payload (complex).
    z_t = res["z_t_pu"]
    z_tk = res["z_tk_pu"]
    assert np.isclose(z_tk, res["k_t"] * z_t)
