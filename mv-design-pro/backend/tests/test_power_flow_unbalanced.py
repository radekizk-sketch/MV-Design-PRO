"""Tests for unbalanced Backward/Forward Sweep PF solver."""

from __future__ import annotations

import math

import pytest

from network_model.solvers.power_flow_unbalanced import (
    UnbalancedBranchSpec,
    UnbalancedLoadSpec,
    UnbalancedNetworkInput,
    UnbalancedPowerFlowResult,
    solve_unbalanced_backward_forward_sweep,
)


def _balanced_2bus_network() -> UnbalancedNetworkInput:
    """Slack -- 1 km cable -- load 1 MVA balanced 3-phase."""
    return UnbalancedNetworkInput(
        base_mva=10.0,
        base_kv=15.0,
        slack_bus_id="SLACK",
        bus_ids=("SLACK", "BUS-1"),
        branches=(
            UnbalancedBranchSpec(
                branch_id="L1",
                from_bus_id="SLACK",
                to_bus_id="BUS-1",
                r_self_ohm=0.2,
                x_self_ohm=0.1,
            ),
        ),
        loads=(
            UnbalancedLoadSpec(
                bus_id="BUS-1",
                p_mw_a=0.333,
                p_mw_b=0.333,
                p_mw_c=0.333,
                q_mvar_a=0.1,
                q_mvar_b=0.1,
                q_mvar_c=0.1,
            ),
        ),
    )


def _unbalanced_2bus_network() -> UnbalancedNetworkInput:
    """Slack -- 1 km cable -- asymmetric load (B-phase higher than A,C)."""
    return UnbalancedNetworkInput(
        base_mva=10.0,
        base_kv=15.0,
        slack_bus_id="SLACK",
        bus_ids=("SLACK", "BUS-1"),
        branches=(
            UnbalancedBranchSpec(
                branch_id="L1",
                from_bus_id="SLACK",
                to_bus_id="BUS-1",
                r_self_ohm=0.2,
                x_self_ohm=0.1,
            ),
        ),
        loads=(
            UnbalancedLoadSpec(
                bus_id="BUS-1",
                p_mw_a=0.2,
                p_mw_b=0.5,  # B-phase 2.5× higher
                p_mw_c=0.2,
                q_mvar_a=0.05,
                q_mvar_b=0.15,
                q_mvar_c=0.05,
            ),
        ),
    )


def _radial_3bus_network() -> UnbalancedNetworkInput:
    """SLACK - BUS-1 - BUS-2 radial, balanced loads at both downstream buses."""
    return UnbalancedNetworkInput(
        base_mva=10.0,
        base_kv=15.0,
        slack_bus_id="SLACK",
        bus_ids=("SLACK", "BUS-1", "BUS-2"),
        branches=(
            UnbalancedBranchSpec("L1", "SLACK", "BUS-1", 0.2, 0.1),
            UnbalancedBranchSpec("L2", "BUS-1", "BUS-2", 0.15, 0.08),
        ),
        loads=(
            UnbalancedLoadSpec("BUS-1", 0.1, 0.1, 0.1, 0.03, 0.03, 0.03),
            UnbalancedLoadSpec("BUS-2", 0.2, 0.2, 0.2, 0.06, 0.06, 0.06),
        ),
    )


class TestBfsConvergence:
    """Algorithm should converge for radial topologies."""

    def test_balanced_2bus_converges(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_balanced_2bus_network())
        assert result.converged is True
        assert result.iterations <= 10
        assert result.max_voltage_mismatch_pu < 1e-6

    def test_unbalanced_2bus_converges(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_unbalanced_2bus_network())
        assert result.converged is True
        assert result.iterations <= 15

    def test_radial_3bus_converges(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_radial_3bus_network())
        assert result.converged is True
        assert result.iterations <= 15


class TestBalancedCaseProducesSymmetricResults:
    """For balanced inputs, output voltages should be symmetric (VUF ≈ 0)."""

    def test_balanced_voltages_have_low_vuf(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_balanced_2bus_network())
        bus_1 = next(b for b in result.bus_results if b.bus_id == "BUS-1")
        assert bus_1.voltage_unbalance_factor_pct < 0.1

    def test_balanced_phase_magnitudes_equal(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_balanced_2bus_network())
        bus_1 = next(b for b in result.bus_results if b.bus_id == "BUS-1")
        assert abs(bus_1.voltage_pu_magnitude_a - bus_1.voltage_pu_magnitude_b) < 1e-6
        assert abs(bus_1.voltage_pu_magnitude_b - bus_1.voltage_pu_magnitude_c) < 1e-6

    def test_balanced_phase_angles_separated_120deg(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_balanced_2bus_network())
        bus_1 = next(b for b in result.bus_results if b.bus_id == "BUS-1")
        # Allow small tolerance for numerical precision
        assert abs((bus_1.angle_deg_b - bus_1.angle_deg_a) - (-120.0)) < 0.5
        assert abs((bus_1.angle_deg_c - bus_1.angle_deg_a) - (120.0)) < 0.5


class TestUnbalancedCaseProducesAsymmetricResults:
    """For unbalanced inputs, VUF should be measurable (>0)."""

    def test_unbalanced_vuf_positive(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_unbalanced_2bus_network())
        bus_1 = next(b for b in result.bus_results if b.bus_id == "BUS-1")
        # B-phase carries 2.5× load → measurable VUF (small for light load relative to base)
        assert bus_1.voltage_unbalance_factor_pct > 0.005

    def test_unbalanced_b_phase_voltage_lower(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_unbalanced_2bus_network())
        bus_1 = next(b for b in result.bus_results if b.bus_id == "BUS-1")
        # B-phase has heaviest load → biggest voltage drop on B
        assert bus_1.voltage_pu_magnitude_b < bus_1.voltage_pu_magnitude_a
        assert bus_1.voltage_pu_magnitude_b < bus_1.voltage_pu_magnitude_c


class TestVoltageDropsAlongRadial:
    """In radial topology, voltage drops monotonically from slack to leaf."""

    def test_3bus_voltage_drops_monotonically(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_radial_3bus_network())
        slack = next(b for b in result.bus_results if b.bus_id == "SLACK")
        bus_1 = next(b for b in result.bus_results if b.bus_id == "BUS-1")
        bus_2 = next(b for b in result.bus_results if b.bus_id == "BUS-2")
        # Slack at 1.0, drops along radial
        assert slack.voltage_pu_magnitude_a >= bus_1.voltage_pu_magnitude_a >= bus_2.voltage_pu_magnitude_a


class TestWhiteBoxTrace:
    """Result must include WHITE BOX trace for auditability."""

    def test_trace_step_per_iteration(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_radial_3bus_network())
        assert len(result.white_box_trace) == result.iterations
        for step in result.white_box_trace:
            assert "iteration" in step
            assert "max_mismatch_pu" in step

    def test_trace_mismatch_decreases(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_radial_3bus_network())
        mismatches = [step["max_mismatch_pu"] for step in result.white_box_trace]
        # Last mismatch should be smallest (converged)
        if len(mismatches) >= 2:
            assert mismatches[-1] <= mismatches[0]


class TestResultSerialization:
    """to_dict() must produce JSON-serializable structure."""

    def test_result_to_dict_has_converged_flag(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_radial_3bus_network())
        result_dict = result.to_dict()
        assert "converged" in result_dict
        assert "iterations" in result_dict
        assert "bus_results" in result_dict
        assert "branch_results" in result_dict
        assert "solver_version" in result_dict

    def test_bus_result_to_dict_has_all_phases(self) -> None:
        result = solve_unbalanced_backward_forward_sweep(_radial_3bus_network())
        bus_dict = result.bus_results[0].to_dict()
        assert "voltage_pu_magnitude_a" in bus_dict
        assert "voltage_pu_magnitude_b" in bus_dict
        assert "voltage_pu_magnitude_c" in bus_dict
        assert "voltage_unbalance_factor_pct" in bus_dict


class TestDeterminism:
    """Same input → identical output (frozen dataclass guarantee)."""

    def test_two_runs_identical_results(self) -> None:
        result_1 = solve_unbalanced_backward_forward_sweep(_radial_3bus_network())
        result_2 = solve_unbalanced_backward_forward_sweep(_radial_3bus_network())
        # Compare critical numeric fields
        for bus_1, bus_2 in zip(result_1.bus_results, result_2.bus_results, strict=True):
            assert math.isclose(bus_1.voltage_pu_magnitude_a, bus_2.voltage_pu_magnitude_a, abs_tol=1e-12)
            assert math.isclose(bus_1.voltage_pu_magnitude_b, bus_2.voltage_pu_magnitude_b, abs_tol=1e-12)
            assert math.isclose(bus_1.voltage_pu_magnitude_c, bus_2.voltage_pu_magnitude_c, abs_tol=1e-12)


class TestEdgeCases:
    """Robustness against pathological inputs."""

    def test_no_load_just_slack_returns_unit_voltages(self) -> None:
        empty_net = UnbalancedNetworkInput(
            base_mva=10.0,
            base_kv=15.0,
            slack_bus_id="SLACK",
            bus_ids=("SLACK",),
            branches=(),
            loads=(),
        )
        result = solve_unbalanced_backward_forward_sweep(empty_net)
        assert result.converged is True
        assert len(result.bus_results) == 1
        assert abs(result.bus_results[0].voltage_pu_magnitude_a - 1.0) < 1e-9

    def test_max_iterations_respected_for_oscillation(self) -> None:
        # Extreme R/X might oscillate; check that we don't loop forever
        result = solve_unbalanced_backward_forward_sweep(
            _radial_3bus_network(),
            max_iterations=2,
            tolerance=1e-15,  # impossibly tight
        )
        assert result.iterations <= 2
