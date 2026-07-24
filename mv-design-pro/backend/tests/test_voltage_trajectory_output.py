"""Tests for voltage trajectory generation + NC RfG envelope checking."""

from __future__ import annotations

import math

from application.stability.voltage_trajectory import (
    NC_RFG_LVRT_ENVELOPE,
    TrajectoryGenerationParams,
    check_trajectory_against_envelope,
    generate_voltage_trajectory,
    interpolate_envelope,
)


class TestTrajectoryGeneration:
    """U(t) sampling produces sensible 4-phase trajectory."""

    def test_default_params_produce_samples(self) -> None:
        traj = generate_voltage_trajectory(TrajectoryGenerationParams())
        assert len(traj) > 100

    def test_pre_fault_voltage_is_one_pu(self) -> None:
        traj = generate_voltage_trajectory(TrajectoryGenerationParams())
        pre_fault_samples = [p for p in traj if p.t_s < 0.0]
        assert all(abs(p.voltage_pu - 1.0) < 1e-9 for p in pre_fault_samples)

    def test_during_fault_voltage_is_zero(self) -> None:
        params = TrajectoryGenerationParams(during_fault_voltage_pu=0.0)
        traj = generate_voltage_trajectory(params)
        fault_samples = [p for p in traj if 0.0 < p.t_s < (params.clearing_time_ms / 1000.0)]
        assert all(p.voltage_pu < 0.01 for p in fault_samples)

    def test_recovery_phase_approaches_post_fault(self) -> None:
        params = TrajectoryGenerationParams(
            post_fault_voltage_pu=1.0,
            recovery_duration_s=3.0,
        )
        traj = generate_voltage_trajectory(params)
        # Last sample should be close to post_fault
        last = traj[-1]
        assert last.voltage_pu > 0.95

    def test_trajectory_serializes_to_dict(self) -> None:
        traj = generate_voltage_trajectory(TrajectoryGenerationParams())
        first_dict = traj[0].to_dict()
        assert "t_s" in first_dict
        assert "voltage_pu" in first_dict
        assert "frequency_pu" in first_dict


class TestEnvelopeInterpolation:
    """NC RfG envelope linear interpolation."""

    def test_at_envelope_point_returns_exact_values(self) -> None:
        u_min, u_max = interpolate_envelope(0.7)
        assert math.isclose(u_min, 0.70, abs_tol=1e-9)

    def test_between_points_interpolates_linearly(self) -> None:
        # Between 0.7 (0.70) and 1.5 (0.85), at 1.1 (midpoint of 0.7-1.5)
        # alpha = (1.1 - 0.7) / (1.5 - 0.7) = 0.5
        # u_min = 0.70 + 0.5 * (0.85 - 0.70) = 0.775
        u_min, _ = interpolate_envelope(1.1)
        assert math.isclose(u_min, 0.775, abs_tol=1e-6)

    def test_below_first_point_returns_first_limits(self) -> None:
        u_min, u_max = interpolate_envelope(-1.0)
        assert u_min == NC_RFG_LVRT_ENVELOPE[0].voltage_pu_min

    def test_above_last_point_returns_last_limits(self) -> None:
        u_min, u_max = interpolate_envelope(100.0)
        assert u_min == NC_RFG_LVRT_ENVELOPE[-1].voltage_pu_min


class TestEnvelopeChecking:
    """Comparing trajectory vs envelope produces PASS/FAIL per sample."""

    def test_compliant_trajectory_passes(self) -> None:
        # Trajectory always within envelope: 1.0 pu throughout
        params = TrajectoryGenerationParams(
            pre_fault_voltage_pu=1.0,
            during_fault_voltage_pu=0.95,  # not deep fault
            post_fault_voltage_pu=1.0,
            recovery_time_constant_s=0.01,
        )
        traj = generate_voltage_trajectory(params)
        _, all_pass = check_trajectory_against_envelope(traj)
        assert all_pass is True

    def test_non_compliant_trajectory_fails(self) -> None:
        # Slow recovery: voltage stuck at 0.5 even after 1.5s
        params = TrajectoryGenerationParams(
            during_fault_voltage_pu=0.5,
            post_fault_voltage_pu=0.5,  # stays at 50% — violates envelope at 1.5s (req 0.85)
            recovery_time_constant_s=10.0,  # too slow
            recovery_duration_s=2.0,
        )
        traj = generate_voltage_trajectory(params)
        _, all_pass = check_trajectory_against_envelope(traj)
        assert all_pass is False

    def test_per_sample_check_includes_envelope_bounds(self) -> None:
        params = TrajectoryGenerationParams()
        traj = generate_voltage_trajectory(params)
        per_sample, _ = check_trajectory_against_envelope(traj)
        for s in per_sample:
            assert "t_s" in s
            assert "voltage_pu" in s
            assert "u_min" in s
            assert "u_max" in s
            assert "in_envelope" in s

    def test_pre_fault_samples_skipped(self) -> None:
        """Samples at t < 0 should be marked in_envelope=True (no fault yet)."""
        params = TrajectoryGenerationParams()
        traj = generate_voltage_trajectory(params)
        per_sample, _ = check_trajectory_against_envelope(traj)
        pre_fault = [s for s in per_sample if s["t_s"] < 0.0]
        assert all(s["in_envelope"] for s in pre_fault)


class TestEnvelopeShape:
    """NC RfG envelope structure correctness."""

    def test_envelope_is_monotonically_non_decreasing(self) -> None:
        """U_min in envelope grows monotonically over recovery time."""
        prev_min = -1.0
        for point in NC_RFG_LVRT_ENVELOPE:
            if point.t_s > 0.151:  # skip during-fault step
                assert point.voltage_pu_min >= prev_min - 1e-9
                prev_min = point.voltage_pu_min

    def test_envelope_starts_at_zero_during_fault(self) -> None:
        """During first 150ms fault, U_min = 0 (full collapse allowed)."""
        u_min_t0, _ = interpolate_envelope(0.0)
        u_min_t015, _ = interpolate_envelope(0.15)
        assert u_min_t0 == 0.0
        assert u_min_t015 == 0.0

    def test_envelope_at_steady_state_requires_90_pct(self) -> None:
        """After 3s recovery, U_min ≥ 0.90."""
        u_min, _ = interpolate_envelope(3.0)
        assert u_min >= 0.90
