"""ADR-011 §5b: cross-solver parity for the inverter U/f source model (NR/GS/FD).

On the same inverter network all three solvers must converge to the same voltage
for realistic volt-var slopes (system-pu). Steep system-pu slopes (a source whose
rating approaches the system base) are stiff: NR (full Jacobian) stays robust while
GS (fixed-point) / FD (constant B'') may not converge — an inherent property of
those methods, characterised in test_inverter_stiff_slope_nr_robust.
"""

from __future__ import annotations

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_fast_decoupled import PowerFlowFastDecoupledSolver
from network_model.solvers.power_flow_gauss_seidel import PowerFlowGaussSeidelSolver
from network_model.solvers.power_flow_inverter import inverter_control_from_params
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)


def _net() -> NetworkGraph:
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


def _inp(ctrl, f_hz: float = 50.0) -> PowerFlowInput:
    return PowerFlowInput(
        graph=_net(),
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=-2.0, q_mvar=0.0, inverter_control=ctrl)],
        options=PowerFlowOptions(max_iter=200, tolerance=1e-9),
        base_frequency_hz=f_hz,
    )


def _v_all(ctrl, f_hz: float = 50.0) -> tuple[float, float, float]:
    nr = solve_power_flow_physics(_inp(ctrl, f_hz))
    gs = PowerFlowGaussSeidelSolver().solve(_inp(ctrl, f_hz))
    fd = PowerFlowFastDecoupledSolver().solve(_inp(ctrl, f_hz))
    assert nr.converged and gs.converged and fd.converged
    return nr.node_u_mag["B"], gs.node_u_mag["B"], fd.node_u_mag["B"]


def test_qu_volt_var_parity() -> None:
    ctrl = inverter_control_from_params(
        {
            "control_mode": "Q(U)",
            "qu_deadband_low_pu": 0.98,
            "qu_deadband_high_pu": 1.005,
            "qu_slope_pu_per_pu": 2.0,
            "qu_q_min_mvar": -5.0,
            "qu_q_max_mvar": 5.0,
        },
        10.0,
    )
    nr, gs, fd = _v_all(ctrl)
    assert gs == pytest.approx(nr, abs=1e-4)
    assert fd == pytest.approx(nr, abs=1e-4)


def test_cosphi_const_parity() -> None:
    ctrl = inverter_control_from_params(
        {"control_mode": "COSPHI_CONST", "cosphi": 0.95, "q_absorbing": True}, 10.0
    )
    nr, gs, fd = _v_all(ctrl)
    assert gs == pytest.approx(nr, abs=1e-4)
    assert fd == pytest.approx(nr, abs=1e-4)


def test_lfsm_frequency_parity() -> None:
    ctrl = inverter_control_from_params(
        {"control_mode": "Q_CONST", "lfsm_droop_pct": 5.0, "lfsm_deadband_hz": 0.2, "f0_hz": 50.0},
        10.0,
    )
    nr, gs, fd = _v_all(ctrl, f_hz=51.0)
    assert gs == pytest.approx(nr, abs=1e-4)
    assert fd == pytest.approx(nr, abs=1e-4)


def test_inverter_stiff_slope_nr_robust() -> None:
    """Honest characterisation: at a very steep system-pu volt-var slope (source
    rating ~ system base) NR stays robust. GS/FD are not required to converge here
    (fixed-point / constant-B methods lack the volt-var Jacobian feedback)."""
    ctrl = inverter_control_from_params(
        {
            "control_mode": "Q(U)",
            "qu_deadband_low_pu": 0.98,
            "qu_deadband_high_pu": 1.005,
            "qu_slope_pu_per_pu": 8.0,
            "qu_q_min_mvar": -5.0,
            "qu_q_max_mvar": 5.0,
        },
        10.0,
    )
    nr = solve_power_flow_physics(_inp(ctrl))
    assert nr.converged
