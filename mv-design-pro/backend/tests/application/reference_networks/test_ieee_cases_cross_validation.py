"""
D-14 cross-validation: OUR Newton-Raphson vs pandapower (IEEE case9 / 14 / 39).

DOWÓD POPRAWNOŚCI (proof of accuracy, not merely non-absurdity):
    The reference per-bus voltages and angles were produced by pandapower's
    independent Newton-Raphson solver on the canonical MATPOWER case9/14/39
    networks. They are COMMITTED in ``expected/ieee_<n>bus.json`` with full
    provenance. This test loads that committed reference, runs OUR solver on the
    committed (structurally identical) ENM, and asserts agreement. If two
    independent implementations agree on the canonical IEEE benchmarks to well
    within engineering tolerance, our solver is accurate.

ARCHITECTURE (committed reference, NOT live pandapower):
    pandapower runs ONLY in ``scripts/generate_ieee_references.py`` (offline).
    This test does NOT import pandapower, so CI/runtime never needs it.

ACCEPTANCE GATES:
    - per-bus |V| relative delta  < 0.5 %
    - per-bus angle absolute delta < 0.5 deg
    (the actual deltas are ~1e-9 because both solvers converge to the same
    per-unit solution; the worst delta is reported by ``test_report_worst_delta``).

SCOPE — SHORT CIRCUIT:
    SC cross-validation against the IEEE cases is intentionally NOT covered here:
    MATPOWER case9/14/39 carry no short-circuit data (no external-grid
    ``s_sc_max_mva``, no sub-transient machine reactances), so pandapower's
    ``calc_sc`` cannot run on them without fabricating machine data. A real
    pandapower-sourced SC reference is validated separately by the
    ``pandapower-iec60909-radial`` fixture.
"""

from __future__ import annotations

import pytest
from application.reference_networks import (
    get_reference_network,
    load_expected_values_from_json,
)
from application.reference_networks.computation import _power_flow_newton_raphson

# Tight numerical tolerance for the solver run itself (mirrors the reference
# generation, which used tolerance_mva=1e-10).
_SOLVER_TOLERANCE = 1e-10

# Published acceptance gates (the committed JSON also advertises rtol=0.5%).
_V_REL_TOL = 5e-3  # 0.5 %
_ANGLE_ABS_TOL_DEG = 0.5

IEEE_CASE_IDS = ["ieee-9bus", "ieee-14bus", "ieee-39bus"]


def _run(network_id: str):
    """Load the committed reference + run OUR NR on the committed ENM."""
    net = get_reference_network(network_id)
    expected = load_expected_values_from_json(net.expected_path)
    enm = net.builder_fn()
    result = _power_flow_newton_raphson(enm, tolerance=_SOLVER_TOLERANCE, max_iterations=60)
    return expected, result


class TestIeeeCasesCrossValidatePandapower:
    """OUR NR == pandapower NR on IEEE case9/14/39 (committed reference)."""

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_solver_converges(self, network_id: str) -> None:
        _expected, result = _run(network_id)
        assert result["converged"] is True, (
            f"{network_id}: our NR did not converge " f"(iterations={result['iterations']})"
        )

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
        expected, result = _run(network_id)
        for row in expected.power_flow:
            assert (
                row.bus_id in result["buses"]
            ), f"{network_id}: bus {row.bus_id} missing from solver result"
            v_ours = result["buses"][row.bus_id]["v_pu"]
            v_ref = row.v_pu
            rel = abs(v_ours - v_ref) / max(abs(v_ref), 1e-9)
            assert rel < _V_REL_TOL, (
                f"{network_id} {row.bus_id}: |V| ours={v_ours:.6f} "
                f"pandapower={v_ref:.6f} rel.delta={rel * 100:.5f}% >= 0.5%"
            )

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_angles_within_half_degree(self, network_id: str) -> None:
        expected, result = _run(network_id)
        for row in expected.power_flow:
            a_ours = result["buses"][row.bus_id]["angle_deg"]
            a_ref = row.angle_deg
            delta = abs(a_ours - a_ref)
            assert delta < _ANGLE_ABS_TOL_DEG, (
                f"{network_id} {row.bus_id}: angle ours={a_ours:.4f}deg "
                f"pandapower={a_ref:.4f}deg delta={delta:.5f}deg >= 0.5deg"
            )

    @pytest.mark.parametrize("network_id", IEEE_CASE_IDS)
    def test_report_worst_delta(self, network_id: str) -> None:
        """Emit the worst |V|/angle delta as the concrete proof number."""
        expected, result = _run(network_id)
        worst_v = 0.0
        worst_a = 0.0
        for row in expected.power_flow:
            v_ours = result["buses"][row.bus_id]["v_pu"]
            a_ours = result["buses"][row.bus_id]["angle_deg"]
            worst_v = max(worst_v, abs(v_ours - row.v_pu) / max(abs(row.v_pu), 1e-9))
            worst_a = max(worst_a, abs(a_ours - row.angle_deg))
        print(
            f"\n{network_id}: worst |V| delta = {worst_v * 100:.6f}% "
            f"(< 0.5%), worst angle delta = {worst_a:.6f}deg (< 0.5deg)"
        )
        assert worst_v < _V_REL_TOL
        assert worst_a < _ANGLE_ABS_TOL_DEG
