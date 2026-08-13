"""ADR-011 §5b: inverter/converter U/f source model in Newton-Raphson power flow.

A source is the generation counterpart of the ZIP load: Q(U) volt-var, P(f)/LFSM,
and cosφ modes (NC RfG §8.7), recomputed in the same solve. Cross-solver parity
(NR/GS/FD) lives in test_power_flow_inverter_parity.py. The central guarantee is
reduce-to-NR: a passive (constant-PQ, f=f0) source is byte-identical to a plain
PQ injection.
"""

from __future__ import annotations

import math

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_inverter import (
    InverterControl,
    InverterMode,
    inverter_control_from_params,
    lfsm_factor,
    qu_dq_dv,
    qu_q,
    validate_inverter_control,
)
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)


def _gen_net() -> NetworkGraph:
    g = NetworkGraph()
    g.add_node(
        Node(
            id="A",
            name="A",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="L",
            name="L",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="B",
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=3.0,
            rated_current_a=400.0,
        )
    )
    return g


def _solve(ctrl: InverterControl | None, f_hz: float = 50.0, trace: str = "summary"):
    # p_mw < 0 => generation (injection), per the load-convention spec builder.
    pf = PowerFlowInput(
        graph=_gen_net(),
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=-2.0, q_mvar=0.0, inverter_control=ctrl)],
        options=PowerFlowOptions(max_iter=60, tolerance=1e-10, trace_level=trace),
        base_frequency_hz=f_hz,
    )
    return solve_power_flow_physics(pf)


def _qu(**kw):
    base = {
        "control_mode": "Q(U)",
        "qu_deadband_low_pu": 0.98,
        "qu_deadband_high_pu": 1.005,
        "qu_slope_pu_per_pu": 8.0,
        "qu_q_min_mvar": -5.0,
        "qu_q_max_mvar": 5.0,
    }
    base.update(kw)
    return inverter_control_from_params(base, 10.0)


# ---- reduce-to-NR (the safety gate) -----------------------------------------


def test_passive_source_is_none() -> None:
    assert inverter_control_from_params({"control_mode": "Q_CONST"}, 10.0) is None
    assert inverter_control_from_params(None, 10.0) is None


def test_reduce_to_nr_passive_byte_identical() -> None:
    """A source with no active control must match a plain PQ injection exactly."""
    base = _solve(None)
    passive = _solve(InverterControl(mode=InverterMode.Q_CONST))
    assert base.converged and passive.converged
    assert passive.node_u_mag["B"] == base.node_u_mag["B"]
    assert complex(passive.slack_power) == complex(base.slack_power)
    assert passive.iterations == base.iterations


def test_qu_inside_deadband_is_noop() -> None:
    """When the converged |V| stays inside the deadband, Q(U) does nothing."""
    base = _solve(None)
    # base V_B ~ 1.0103, inside [0.98, 1.02]
    wide = _qu(qu_deadband_high_pu=1.02)
    s = _solve(wide)
    assert s.node_u_mag["B"] == base.node_u_mag["B"]


# ---- inverter physics -------------------------------------------------------


def test_qu_absorbs_above_deadband_and_lowers_voltage() -> None:
    base = _solve(None)
    s = _solve(_qu())  # deadband_high 1.005 < base => active
    assert s.converged
    assert s.node_u_mag["B"] < base.node_u_mag["B"]
    assert complex(s.slack_power) != complex(base.slack_power)


def test_cosphi_const_absorbing_lowers_voltage() -> None:
    base = _solve(None)
    cc = inverter_control_from_params(
        {"control_mode": "COSPHI_CONST", "cosphi": 0.95, "q_absorbing": True}, 10.0
    )
    s = _solve(cc)
    assert s.converged and s.node_u_mag["B"] < base.node_u_mag["B"]


def test_cosphi_p_ratio_varies_with_output() -> None:
    # ratio 0 at low P, inductive (absorbing) at high P
    cp = inverter_control_from_params(
        {
            "control_mode": "COSPHI(P)",
            "cosphi_p_points": [[0.0, 1.0], [0.5, 1.0], [1.0, 0.95]],
            "q_absorbing": True,
            "pmax_mw": 2.0,
        },
        10.0,
    )
    s = _solve(cp)
    assert s.converged  # at full output (P=2=pmax) it absorbs => lower V than unity
    assert s.node_u_mag["B"] < _solve(None).node_u_mag["B"]


def test_lfsm_reduces_generation_above_threshold() -> None:
    base = _solve(None)
    lf = inverter_control_from_params(
        {"control_mode": "Q_CONST", "lfsm_droop_pct": 5.0, "lfsm_deadband_hz": 0.2, "f0_hz": 50.0},
        10.0,
    )
    over = _solve(lf, f_hz=51.0)  # above f0+deadband => P curtailed
    at_nom = _solve(lf, f_hz=50.0)  # at nominal => no change
    assert over.node_u_mag["B"] < base.node_u_mag["B"]
    assert at_nom.node_u_mag["B"] == base.node_u_mag["B"]


# ---- white-box + determinism ------------------------------------------------


def test_white_box_trace_exposes_inverter_sources() -> None:
    s = _solve(_qu(), trace="full")
    entries = [e for e in s.nr_trace if "inverter_sources" in e]
    assert entries, "no trace entry carried inverter_sources"
    last = entries[-1]
    assert "B" in last["inverter_sources"]
    assert last["inverter_sources"]["B"]["mode"] == "Q_U"
    # Defect B (§2.5): the trace must carry the shaping INPUT (the source's own
    # power) next to the bus value, otherwise a source deriving its Q from the
    # LOAD's power looks exactly like a correct one — which is how defect B
    # survived the audit.
    assert set(last["inverter_sources"]["B"]) == {
        "p_spec_pu",
        "q_spec_pu",
        "p_source_pu",
        "q_source_pu",
        "p_shaped_pu",
        "q_shaped_pu",
        "lfsm_factor",
        "q_volt_var_pu",
        "mode",
    }


def test_white_box_trace_reproduces_cosphi_from_source_power_alone() -> None:
    """§2.5: an auditor reconstructs the shaping from the trace numbers only."""
    cc = inverter_control_from_params(
        {"control_mode": "COSPHI_CONST", "cosphi": 0.95, "lfsm_droop_pct": 5.0}, 10.0
    )
    s = _solve(cc, f_hz=51.0, trace="full")
    rec = [e for e in s.nr_trace if "inverter_sources" in e][-1]["inverter_sources"]["B"]
    assert rec["mode"] == "COSPHI_CONST"  # shaped sources are traced, not only Q(U)
    # p_shaped = p_source * lfsm_factor, q_shaped = q_over_p * |p_shaped|
    assert rec["p_shaped_pu"] == pytest.approx(rec["p_source_pu"] * rec["lfsm_factor"])
    assert rec["q_shaped_pu"] == pytest.approx(math.tan(math.acos(0.95)) * abs(rec["p_shaped_pu"]))
    assert rec["lfsm_factor"] < 1.0  # 51 Hz => LFSM-O curtails the source


def test_inverter_solution_is_deterministic() -> None:
    a = _solve(_qu())
    b = _solve(_qu())
    assert a.node_u_mag["B"] == b.node_u_mag["B"]
    assert a.iterations == b.iterations


# ---- foundation helpers -----------------------------------------------------


def test_lfsm_factor() -> None:
    c = InverterControl(lfsm_droop_pct=5.0, lfsm_deadband_hz=0.2, f0_hz=50.0)
    assert lfsm_factor(c, 50.0) == 1.0
    assert lfsm_factor(c, 50.1) == 1.0  # inside deadband
    assert lfsm_factor(c, 51.0) == pytest.approx(1 - ((1.0 - 0.2) / 50.0) / 0.05)
    assert lfsm_factor(InverterControl(), 55.0) == 1.0  # off


def test_qu_curve_and_derivative() -> None:
    c = InverterControl(
        mode=InverterMode.Q_U,
        qu_deadband_low_pu=0.98,
        qu_deadband_high_pu=1.02,
        qu_slope_pu_per_pu=4.0,
        qu_q_min_pu=-0.3,
        qu_q_max_pu=0.3,
    )
    assert qu_q(c, 1.0) == 0.0 and qu_dq_dv(c, 1.0) == 0.0  # deadband
    assert qu_q(c, 1.04) == pytest.approx(-4.0 * 0.02)  # absorb above
    assert qu_dq_dv(c, 1.04) == pytest.approx(-4.0)
    assert qu_q(c, 0.94) == pytest.approx(4.0 * 0.04)  # inject below
    assert qu_q(c, 2.0) == -0.3 and qu_dq_dv(c, 2.0) == 0.0  # clamped


def test_cosphi_ratio_sign() -> None:
    inj = inverter_control_from_params({"control_mode": "COSPHI_CONST", "cosphi": 0.9}, 10.0)
    absb = inverter_control_from_params(
        {"control_mode": "COSPHI_CONST", "cosphi": 0.9, "q_absorbing": True}, 10.0
    )
    assert inj.q_over_p == pytest.approx(math.tan(math.acos(0.9)))
    assert absb.q_over_p == pytest.approx(-math.tan(math.acos(0.9)))


def test_validate_rejects_bad_control() -> None:
    with pytest.raises(ValueError):
        validate_inverter_control(InverterControl(f0_hz=0.0))
    with pytest.raises(ValueError):
        validate_inverter_control(
            InverterControl(mode=InverterMode.Q_U, qu_deadband_low_pu=1.1, qu_deadband_high_pu=0.9)
        )
