"""D-14: PRODUCTION Newton-Raphson solver vs pandapower (IEEE case9 / 14 / 39).

DOWÓD POPRAWNOŚCI (proof for the PRODUCTION solver, not merely the reference
harness):
    The sibling test ``test_ieee_cases_cross_validation.py`` validates the
    reference-harness NR in ``application/reference_networks/computation.py``.
    THIS test validates the PRIMARY production load-flow solver
    ``network_model.solvers.power_flow_newton.solve_power_flow_physics`` — the
    one a real K-04 must certify. The committed ENM is translated into the frozen
    solver's ``PowerFlowInput`` (see ``frozen_solver_input.py``) so the production
    solver solves the IDENTICAL problem the committed pandapower reference
    encodes (same generator/slack voltage setpoints, off-nominal transformer taps
    and bus shunts honoured on the 100 MVA base). The reference per-bus |V|/angle
    were produced by pandapower's INDEPENDENT NR and are COMMITTED in
    ``expected/ieee_<n>bus.json``; this test loads them and asserts agreement.

B-01 (frozen solver untouched): this test only BUILDS the input and calls the
    solver read-only. ``solver_diff_guard`` must stay green.

ARCHITECTURE (committed reference, NOT live pandapower):
    No pandapower import — the reference values come from the committed JSON.

ACCEPTANCE GATES (THE proof numbers for the production solver):
    - per-bus |V| relative delta  < 0.5 %
    - per-bus angle absolute delta < 0.5 deg
    The observed worst deltas are ~5e-8 % / ~5e-7 deg (reported by
    ``test_report_worst_delta``): the production solver converges to the same
    per-unit solution as pandapower, so K-04 for the production NR is a genuine
    PASS, not a tautology.

SCOPE — SHORT CIRCUIT:
    Out of scope, identical reasoning to the harness test: MATPOWER case9/14/39
    carry no short-circuit data.
"""

from __future__ import annotations

import math

import pytest
from application.reference_networks import (
    get_reference_network,
    load_expected_values_from_json,
)
from application.reference_networks.frozen_solver_input import build_frozen_power_flow_input
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    solve_power_flow_physics,
)
from network_model.solvers.power_flow_types import PowerFlowInput

# Tight solver tolerance, mirroring the reference generation (tolerance_mva=1e-10).
_SOLVER_TOLERANCE = 1e-10

# Published acceptance gates (the committed JSON also advertises rtol=0.5%).
_V_REL_TOL = 5e-3  # 0.5 %
_ANGLE_ABS_TOL_DEG = 0.5

IEEE_CASE_IDS = ["ieee-9bus", "ieee-14bus", "ieee-39bus"]


def _run(network_id: str) -> tuple[object, PowerFlowNewtonSolution]:
    """Load the committed reference + run the PRODUCTION solver on its ENM."""
    net = get_reference_network(network_id)
    expected = load_expected_values_from_json(net.expected_path)
    pf_input = build_frozen_power_flow_input(net.builder_fn(), tolerance=_SOLVER_TOLERANCE)
    solution = solve_power_flow_physics(pf_input)
    return expected, solution


class TestIeeeFrozenSolverCrossValidatePandapower:
    """PRODUCTION NR == pandapower NR on IEEE case9/14/39 (committed reference)."""

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_production_solver_converges(self, network_id: str) -> None:
        _expected, solution = _run(network_id)
        assert solution.converged is True, (
            f"{network_id}: production NR did not converge "
            f"(iterations={solution.iterations}, max_mismatch={solution.max_mismatch:.3e})"
        )
        assert (
            not solution.not_solved_nodes
        ), f"{network_id}: production NR left buses unsolved: {solution.not_solved_nodes}"

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_reference_is_independent_pandapower(self, network_id: str) -> None:
        """Provenance guard: reference must come from pandapower, not our solver."""
        net = get_reference_network(network_id)
        expected = load_expected_values_from_json(net.expected_path)
        assert (
            "pandapower" in expected.source.lower()
        ), f"{network_id}: reference source is not pandapower: {expected.source!r}"
        assert expected.has_pf(), f"{network_id}: committed reference has no PF rows"

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_voltage_magnitudes_within_half_percent(self, network_id: str) -> None:
        expected, solution = _run(network_id)
        for row in expected.power_flow:
            assert (
                row.bus_id in solution.node_u_mag
            ), f"{network_id}: bus {row.bus_id} missing from production solver result"
            v_ours = solution.node_u_mag[row.bus_id]
            rel = abs(v_ours - row.v_pu) / max(abs(row.v_pu), 1e-9)
            assert rel < _V_REL_TOL, (
                f"{network_id} {row.bus_id}: |V| production={v_ours:.6f} "
                f"pandapower={row.v_pu:.6f} rel.delta={rel * 100:.5f}% >= 0.5%"
            )

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_angles_within_half_degree(self, network_id: str) -> None:
        expected, solution = _run(network_id)
        for row in expected.power_flow:
            a_ours = math.degrees(solution.node_angle[row.bus_id])
            delta = abs(a_ours - row.angle_deg)
            assert delta < _ANGLE_ABS_TOL_DEG, (
                f"{network_id} {row.bus_id}: angle production={a_ours:.4f}deg "
                f"pandapower={row.angle_deg:.4f}deg delta={delta:.5f}deg >= 0.5deg"
            )

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_report_worst_delta(self, network_id: str) -> None:
        """Emit the worst |V|/angle delta as the concrete proof number for the
        PRODUCTION solver."""
        expected, solution = _run(network_id)
        worst_v = 0.0
        worst_a = 0.0
        for row in expected.power_flow:
            v_ours = solution.node_u_mag[row.bus_id]
            a_ours = math.degrees(solution.node_angle[row.bus_id])
            worst_v = max(worst_v, abs(v_ours - row.v_pu) / max(abs(row.v_pu), 1e-9))
            worst_a = max(worst_a, abs(a_ours - row.angle_deg))
        print(
            f"\n[production NR] {network_id}: worst |V| delta = {worst_v * 100:.3e}% "
            f"(< 0.5%), worst angle delta = {worst_a:.3e}deg (< 0.5deg)"
        )
        assert worst_v < _V_REL_TOL
        assert worst_a < _ANGLE_ABS_TOL_DEG


class TestFrozenInputFidelity:
    """The converter feeds the frozen solver READ-ONLY and represents the network
    faithfully (every bus solved, taps/shunts applied)."""

    def test_input_is_power_flow_input(self) -> None:
        net = get_reference_network("ieee-14bus")
        pf_input = build_frozen_power_flow_input(net.builder_fn())
        assert isinstance(pf_input, PowerFlowInput)

    def test_case14_has_tap_and_shunt(self) -> None:
        """case14 carries 3 off-nominal taps (BR15/16/17) and 1 bus shunt."""
        net = get_reference_network("ieee-14bus")
        pf_input = build_frozen_power_flow_input(net.builder_fn())
        assert len(pf_input.taps) == 3
        assert len(pf_input.shunts) == 1
        solution = solve_power_flow_physics(pf_input)
        # Taps + shunt actually applied by the frozen solver.
        assert len(solution.applied_taps) == 3
        assert len(solution.applied_shunts) == 1

    def test_case39_has_taps(self) -> None:
        """case39 carries 11 off-nominal taps (BR35..BR45)."""
        net = get_reference_network("ieee-39bus")
        pf_input = build_frozen_power_flow_input(net.builder_fn())
        assert len(pf_input.taps) == 11
        solution = solve_power_flow_physics(pf_input)
        assert len(solution.applied_taps) == 11

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_every_bus_listed_or_slack(self, network_id: str) -> None:
        """No bus is dropped: each is slack, PV, or PQ (zero-injection included)."""
        net = get_reference_network(network_id)
        enm = net.builder_fn()
        pf_input = build_frozen_power_flow_input(enm)
        listed = (
            {spec.node_id for spec in pf_input.pq}
            | {spec.node_id for spec in pf_input.pv}
            | {pf_input.slack.node_id}
        )
        all_buses = {str(bus["ref_id"]) for bus in enm["buses"]}
        assert listed == all_buses
