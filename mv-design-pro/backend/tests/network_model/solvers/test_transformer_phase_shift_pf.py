"""SM-2 (V12K-180): transformer vector-group phase displacement in the power flow.

The vector group (Dyn11, Dyn1, Dyn5, ...) rotates the positive-sequence voltage
angle of every bus behind the transformer. In a balanced power flow this changes
ONLY the angles — magnitudes |V| and, for a radial network, branch P/Q flows are
invariant (the shift is a rotation of the downstream reference frame).

Convention (from = HV/tapped side, to = LV side): the LV node leads the HV node
by θ = normalise(−k·30°), k = clock number. Dyn11 → +30°, Dyn1 → −30°,
Dyn5 → −150°, Yy0 → 0°.
"""

from __future__ import annotations

import math

import pytest
from network_model.core.branch import BranchType, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_newton_internal import (
    transformer_clock_number,
    transformer_phase_shift_rad,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)


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


def _transformer(
    branch_id: str, from_node: str, to_node: str, vector_group: str
) -> TransformerBranch:
    return TransformerBranch(
        id=branch_id,
        name=branch_id,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node,
        to_node_id=to_node,
        rated_power_mva=25.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=15.0,
        uk_percent=12.0,
        pk_kw=100.0,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group=vector_group,
        tap_position=0,
        tap_step_percent=2.5,
    )


def _solve_single(vector_group: str, load_mw: float = 0.0):
    graph = NetworkGraph()
    graph.add_node(_slack("HV", 110.0))
    graph.add_node(_pq("LV", 15.0))
    graph.add_branch(_transformer("T1", "HV", "LV", vector_group))
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id="HV", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="LV", p_mw=load_mw, q_mvar=load_mw * 0.4)],
        options=PowerFlowOptions(flat_start=True),
    )
    return PowerFlowNewtonSolver().solve(pf_input)


# --------------------------------------------------------------------------- #
# Vector-group → clock number → phase shift helpers
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "vector_group,expected_clock",
    [("Dyn11", 11), ("Dyn1", 1), ("Dyn5", 5), ("Yy0", 0), ("Dyn0", 0), ("Yd11", 11)],
)
def test_clock_number_parsed(vector_group: str, expected_clock: int) -> None:
    assert transformer_clock_number(vector_group) == expected_clock


def test_clock_number_absent_returns_none() -> None:
    assert transformer_clock_number("Dyn") is None
    assert transformer_clock_number("") is None
    assert transformer_clock_number(None) is None


@pytest.mark.parametrize(
    "vector_group,expected_deg",
    [("Dyn11", 30.0), ("Dyn1", -30.0), ("Dyn5", -150.0), ("Dyn7", 150.0), ("Yy0", 0.0)],
)
def test_phase_shift_rad_matches_iec(vector_group: str, expected_deg: float) -> None:
    assert math.degrees(transformer_phase_shift_rad(vector_group)) == pytest.approx(expected_deg)


def test_phase_shift_undefined_group_is_zero() -> None:
    assert transformer_phase_shift_rad("Dyn") == 0.0


# --------------------------------------------------------------------------- #
# Core invariant: phase shift moves angles only, never magnitudes
# --------------------------------------------------------------------------- #


def test_dyn11_shifts_lv_angle_by_plus_30_no_load() -> None:
    """Card unit test: for Dyn11 the LV node angle = HV node angle + 30° at no
    load, with |V| unchanged (== 1.0 pu)."""
    result = _solve_single("Dyn11", load_mw=0.0)
    assert result.converged
    angle_hv = math.degrees(result.node_angle["HV"])
    angle_lv = math.degrees(result.node_angle["LV"])
    assert angle_lv - angle_hv == pytest.approx(30.0, abs=1e-6)
    assert result.node_u_mag["HV"] == pytest.approx(1.0, abs=1e-9)
    assert result.node_u_mag["LV"] == pytest.approx(1.0, abs=1e-9)


@pytest.mark.parametrize(
    "vector_group,expected_deg",
    [("Dyn11", 30.0), ("Dyn1", -30.0), ("Dyn5", -150.0), ("Yy0", 0.0)],
)
def test_group_angle_shift_no_load(vector_group: str, expected_deg: float) -> None:
    result = _solve_single(vector_group, load_mw=0.0)
    assert result.converged
    shift = math.degrees(result.node_angle["LV"] - result.node_angle["HV"])
    assert shift == pytest.approx(expected_deg, abs=1e-6)
    # Invariant: magnitudes untouched by the phase shift.
    assert result.node_u_mag["LV"] == pytest.approx(1.0, abs=1e-9)


def test_phase_shift_leaves_magnitudes_and_flows_invariant_under_load() -> None:
    """The proof core (stronger invariant): under load, a Dyn11 transformer and
    a Yy0 transformer produce identical |V| and identical branch P/Q — only the
    LV angle differs, by exactly 30°."""
    r_shift = _solve_single("Dyn11", load_mw=10.0)
    r_ref = _solve_single("Yy0", load_mw=10.0)
    assert r_shift.converged and r_ref.converged

    assert r_shift.node_u_mag["LV"] == pytest.approx(r_ref.node_u_mag["LV"], abs=1e-9)
    assert r_shift.branch_s_from_mva["T1"].real == pytest.approx(
        r_ref.branch_s_from_mva["T1"].real, abs=1e-6
    )
    assert r_shift.branch_s_from_mva["T1"].imag == pytest.approx(
        r_ref.branch_s_from_mva["T1"].imag, abs=1e-6
    )

    angle_diff = math.degrees(r_shift.node_angle["LV"] - r_ref.node_angle["LV"])
    assert angle_diff == pytest.approx(30.0, abs=1e-6)


def test_cascaded_transformers_accumulate_shift() -> None:
    """Two Dyn11 transformers in series (HV → MV → LV) accumulate to +60°."""
    graph = NetworkGraph()
    graph.add_node(_slack("HV", 110.0))
    graph.add_node(_pq("MV", 15.0))
    graph.add_node(_pq("LV", 0.4))
    graph.add_branch(_transformer("T1", "HV", "MV", "Dyn11"))
    t2 = _transformer("T2", "MV", "LV", "Dyn11")
    t2.voltage_hv_kv = 15.0
    t2.voltage_lv_kv = 0.4
    graph.add_branch(t2)
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id="HV", u_pu=1.0, angle_rad=0.0),
        pq=[PQSpec(node_id="MV", p_mw=0.0, q_mvar=0.0), PQSpec(node_id="LV", p_mw=0.0, q_mvar=0.0)],
        options=PowerFlowOptions(flat_start=True),
    )
    result = PowerFlowNewtonSolver().solve(pf_input)
    assert result.converged
    assert math.degrees(result.node_angle["MV"] - result.node_angle["HV"]) == pytest.approx(
        30.0, abs=1e-6
    )
    assert math.degrees(result.node_angle["LV"] - result.node_angle["HV"]) == pytest.approx(
        60.0, abs=1e-6
    )


# --------------------------------------------------------------------------- #
# White-box trace
# --------------------------------------------------------------------------- #


def test_white_box_trace_records_phase_shift() -> None:
    result = _solve_single("Dyn11", load_mw=5.0)
    shifts = result.ybus_trace["applied_phase_shifts"]
    assert isinstance(shifts, list) and len(shifts) == 1
    entry = shifts[0]
    assert entry["branch_id"] == "T1"
    assert entry["vector_group"] == "Dyn11"
    assert entry["clock_number"] == 11
    assert entry["phase_shift_deg"] == pytest.approx(30.0)
    assert entry["phase_shift_rad"] == pytest.approx(math.radians(30.0))
    assert entry["tap_abs"] == pytest.approx(1.0)
    # complex tap t = |t|·e^{-jθ} = 1·(cos30° - j sin30°)
    assert entry["tap_complex_real"] == pytest.approx(math.cos(math.radians(30.0)))
    assert entry["tap_complex_imag"] == pytest.approx(-math.sin(math.radians(30.0)))


def test_yy0_emits_no_phase_shift_entry() -> None:
    result = _solve_single("Yy0", load_mw=5.0)
    assert result.ybus_trace["applied_phase_shifts"] == []
