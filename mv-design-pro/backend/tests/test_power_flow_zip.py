"""ADR-011 (Z-ZIP-04): ZIP + frequency-dependent load model in power flow.

Covers the Newton-Raphson core (v1 + v2) and the shared helpers. GS/FD ZIP
parity is exercised in test_power_flow_zip_solver_parity.py once those solvers
land the same contract. The central guarantee is the reduce-to-NR invariant:
with a=b=0, c=1, f=f0 the solver is byte-identical to the classic PQ path.
"""

from __future__ import annotations

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    SlackSpec,
)
from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    aggregate_zip,
    frequency_factor,
    validate_zip_coeffs,
    zip_factor,
    zip_factor_derivative,
)

CONST_Z = ZipCoeffs(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
CONST_I = ZipCoeffs(0.0, 1.0, 0.0, 0.0, 1.0, 0.0)
CONST_P = ZipCoeffs(0.0, 0.0, 1.0, 0.0, 0.0, 1.0)


def _two_bus() -> NetworkGraph:
    g = NetworkGraph()
    g.add_node(
        Node(
            id="A",
            name="A",
            node_type=NodeType.SLACK,
            voltage_level=10.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=10.0,
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
            length_km=1.0,
            rated_current_a=300.0,
        )
    )
    return g


def _solve(zip_coeffs: ZipCoeffs | None, f_hz: float = 50.0, trace: str = "summary"):
    pf = PowerFlowInput(
        graph=_two_bus(),
        base_mva=10.0,
        slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="B", p_mw=3.0, q_mvar=1.0, zip_coeffs=zip_coeffs)],
        options=PowerFlowOptions(max_iter=40, tolerance=1e-10, trace_level=trace),
        base_frequency_hz=f_hz,
    )
    return solve_power_flow_physics(pf)


# ---- reduce-to-NR invariant (the safety gate) -------------------------------


def test_reduce_to_nr_explicit_constant_power_byte_identical() -> None:
    """a=b=0,c=1,f=f0 must give a result identical to no ZIP at all (v1 PQ path)."""
    base = _solve(None)
    zipped = _solve(CONST_P)
    assert zipped.converged and base.converged
    assert zipped.iterations == base.iterations
    assert zipped.node_u_mag["B"] == base.node_u_mag["B"]
    assert complex(zipped.slack_power) == complex(base.slack_power)


def test_reduce_to_nr_v2_with_pv_bus_byte_identical() -> None:
    """Same invariant on the v2 (PV/PQ-switching) path."""
    g = _two_bus()
    g.add_node(
        Node(
            id="C",
            name="C",
            node_type=NodeType.PQ,
            voltage_level=10.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="L2",
            name="L2",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="C",
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=300.0,
        )
    )

    def solve(zc: ZipCoeffs | None):
        pf = PowerFlowInput(
            graph=g,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=3.0, q_mvar=1.0, zip_coeffs=zc)],
            pv=[PVSpec(node_id="C", p_mw=1.0, u_pu=1.0, q_min_mvar=-5.0, q_max_mvar=5.0)],
            options=PowerFlowOptions(max_iter=40, tolerance=1e-10),
        )
        return solve_power_flow_physics(pf)

    base = solve(None)
    zipped = solve(CONST_P)
    assert base.converged and zipped.converged
    assert zipped.node_u_mag["B"] == base.node_u_mag["B"]
    assert zipped.node_u_mag["C"] == base.node_u_mag["C"]


def test_v2_zip_physics_and_white_box() -> None:
    """v2 (PV present): const-Z sags less than const-P and ZIP appears in trace."""
    g = _two_bus()
    g.add_node(
        Node(
            id="C",
            name="C",
            node_type=NodeType.PQ,
            voltage_level=10.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="L2",
            name="L2",
            branch_type=BranchType.LINE,
            from_node_id="A",
            to_node_id="C",
            r_ohm_per_km=0.4,
            x_ohm_per_km=0.8,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=300.0,
        )
    )

    def solve(zc: ZipCoeffs | None, trace: str = "summary"):
        pf = PowerFlowInput(
            graph=g,
            base_mva=10.0,
            slack=SlackSpec(node_id="A", u_pu=1.0, angle_rad=0.0),
            pq=[PQSpec(node_id="B", p_mw=3.0, q_mvar=1.0, zip_coeffs=zc)],
            pv=[PVSpec(node_id="C", p_mw=1.0, u_pu=1.0, q_min_mvar=-5.0, q_max_mvar=5.0)],
            options=PowerFlowOptions(max_iter=40, tolerance=1e-10, trace_level=trace),
        )
        return solve_power_flow_physics(pf)

    cp = solve(CONST_P)
    cz = solve(CONST_Z, trace="full")
    assert cp.converged and cz.converged
    assert cz.node_u_mag["B"] > cp.node_u_mag["B"]
    assert any("zip_loads" in e and "B" in e["zip_loads"] for e in cz.nr_trace)


# ---- ZIP physics ------------------------------------------------------------


def test_const_z_sags_less_than_const_p() -> None:
    """A constant-impedance load shrinks as voltage drops, so the bus sags less."""
    cp = _solve(CONST_P)
    cz = _solve(CONST_Z)
    ci = _solve(CONST_I)
    assert cp.converged and cz.converged and ci.converged
    # const-Z highest voltage, const-P lowest, const-I in between
    assert cz.node_u_mag["B"] > ci.node_u_mag["B"] > cp.node_u_mag["B"]
    # const-Z draws less real power from slack
    assert complex(cz.slack_power).real < complex(cp.slack_power).real


def test_const_z_drawn_power_matches_v_squared() -> None:
    """At the converged voltage the const-Z bus draws ~ P0 * (V/V0)^2."""
    cz = _solve(CONST_Z)
    v = cz.node_u_mag["B"]
    expected_p = 3.0 * v * v
    # slack power = load + losses; the load drawn at B is P0*V^2 by construction.
    # Cross-check via the white-box effective spec instead:
    full = _solve(CONST_Z, trace="full")
    last = full.nr_trace[-1]
    # zip_loads recorded in pu (injection convention, negative for load)
    p_spec_pu = last["zip_loads"]["B"]["p_spec_pu"]
    assert p_spec_pu == pytest.approx(-expected_p / 10.0, rel=1e-6)


def test_frequency_dependence_reduces_load_below_nominal() -> None:
    """P(f): f<f0 with k_pf>0 lowers the load (factor 1+k*(f-f0)/f0)."""
    cp = _solve(CONST_P)
    fdep = _solve(ZipCoeffs(0, 0, 1, 0, 0, 1, k_pf=2.0, k_qf=1.0, f0_hz=50.0), f_hz=49.0)
    assert fdep.converged
    assert complex(fdep.slack_power).real < complex(cp.slack_power).real


def test_frequency_at_nominal_is_noop() -> None:
    """k!=0 but f==f0 => factor 1 => identical to constant power."""
    base = _solve(None)
    fnom = _solve(ZipCoeffs(0, 0, 1, 0, 0, 1, k_pf=2.0, k_qf=1.0, f0_hz=50.0), f_hz=50.0)
    assert fnom.node_u_mag["B"] == base.node_u_mag["B"]


# ---- white-box + determinism ------------------------------------------------


def test_white_box_trace_exposes_zip_loads() -> None:
    full = _solve(CONST_Z, trace="full")
    assert any("zip_loads" in entry for entry in full.nr_trace)
    last = full.nr_trace[-1]
    assert "B" in last["zip_loads"]
    assert set(last["zip_loads"]["B"]) == {"p_spec_pu", "q_spec_pu"}


def test_zip_solution_is_deterministic() -> None:
    a = _solve(CONST_Z)
    b = _solve(CONST_Z)
    assert a.node_u_mag["B"] == b.node_u_mag["B"]
    assert a.iterations == b.iterations


# ---- helpers / validation ---------------------------------------------------


def test_zip_factor_and_derivative() -> None:
    # constant power: factor 1, derivative 0
    assert zip_factor(0, 0, 1, 0.9, 1.0) == 1.0
    assert zip_factor_derivative(0, 0, 0.9, 1.0) == 0.0
    # constant Z: factor (V/V0)^2, derivative 2V/V0^2
    assert zip_factor(1, 0, 0, 0.9, 1.0) == pytest.approx(0.81)
    assert zip_factor_derivative(1, 0, 0.9, 1.0) == pytest.approx(1.8)


def test_frequency_factor() -> None:
    assert frequency_factor(0.0, 49.0, 50.0) == 1.0
    assert frequency_factor(2.0, 50.0, 50.0) == 1.0
    assert frequency_factor(2.0, 49.0, 50.0) == pytest.approx(0.96)


def test_validate_rejects_bad_coefficients() -> None:
    with pytest.raises(ValueError):
        validate_zip_coeffs(ZipCoeffs(0.4, 0.3, 0.4, 0, 0, 1))  # P sums to 1.1
    with pytest.raises(ValueError):
        validate_zip_coeffs(ZipCoeffs(0, 0, 1, 0, 0, 1, v0_pu=0.0))
    with pytest.raises(ValueError):
        validate_zip_coeffs(ZipCoeffs(0, 0, 1, 0, 0, 1, f0_hz=0.0))


def test_aggregate_zip_is_power_weighted() -> None:
    # 2 MW const-Z + 1 MW const-P on one bus => a_p = 2/3, c_p = 1/3
    agg = aggregate_zip([(2.0, 0.0, CONST_Z), (1.0, 0.0, CONST_P)])
    assert agg is not None
    assert agg.a_p == pytest.approx(2.0 / 3.0)
    assert agg.c_p == pytest.approx(1.0 / 3.0)
    assert agg.a_p + agg.b_p + agg.c_p == pytest.approx(1.0)


def test_aggregate_all_constant_power_is_none() -> None:
    assert aggregate_zip([(2.0, 1.0, None), (1.0, 0.5, CONST_P)]) is None
