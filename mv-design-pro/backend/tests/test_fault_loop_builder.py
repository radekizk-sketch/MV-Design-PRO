"""
Tests for FaultLoopInputBuilder — P0.5 step 3 scaffolding.

Verifies that build_fault_loop_input() correctly transforms a flat request
struct into FaultLoopInput object expected by compute_fault_loop().
"""

import pytest
from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    build_fault_loop_input,
)
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)


def _make_basic_request(
    *,
    with_upstream: bool = False,
) -> FaultLoopBuildRequest:
    """Typical TN-S MVP request: 400 kVA TR + 30 m kabel."""
    return FaultLoopBuildRequest(
        fault_node_id="bus_LV_main",
        u_nom_v=230.0,
        network_type=NetworkType.TN_S,
        protection_arrangement=ProtectionArrangement.PE,
        phase_conductor_r_ohm=0.0157,
        phase_conductor_x_ohm=0.0023,
        return_conductor_r_ohm=0.0157,
        return_conductor_x_ohm=0.0023,
        transformer_r_ohm=0.005,
        transformer_x_ohm=0.015,
        upstream_r_ohm=0.001 if with_upstream else None,
        upstream_x_ohm=0.010 if with_upstream else None,
    )


class TestBuildFaultLoopInput:
    def test_builds_full_input_without_upstream(self) -> None:
        req = _make_basic_request()
        result = build_fault_loop_input(req)
        assert isinstance(result, FaultLoopInput)
        assert result.fault_node_id == "bus_LV_main"
        assert result.u_nom_v == 230.0
        assert result.network_type == NetworkType.TN_S
        assert result.protection_arrangement == ProtectionArrangement.PE
        assert result.phase_conductor.r_ohm == 0.0157
        assert result.return_conductor.r_ohm == 0.0157
        assert result.transformer_impedance.r_ohm == 0.005
        assert result.upstream_impedance is None

    def test_builds_with_upstream(self) -> None:
        req = _make_basic_request(with_upstream=True)
        result = build_fault_loop_input(req)
        assert result.upstream_impedance is not None
        assert result.upstream_impedance.r_ohm == 0.001
        assert result.upstream_impedance.x_ohm == 0.010

    def test_partial_upstream_rejected_r_only(self) -> None:
        """Tylko upstream_r_ohm bez upstream_x_ohm → ValueError."""
        bad = FaultLoopBuildRequest(
            fault_node_id="x",
            u_nom_v=230.0,
            network_type=NetworkType.TN_S,
            protection_arrangement=ProtectionArrangement.PE,
            phase_conductor_r_ohm=0.01,
            phase_conductor_x_ohm=0.001,
            return_conductor_r_ohm=0.01,
            return_conductor_x_ohm=0.001,
            transformer_r_ohm=0.005,
            transformer_x_ohm=0.015,
            upstream_r_ohm=0.001,
            upstream_x_ohm=None,
        )
        with pytest.raises(ValueError, match=r"MUSZĄ być oba None"):
            build_fault_loop_input(bad)

    def test_partial_upstream_rejected_x_only(self) -> None:
        bad = FaultLoopBuildRequest(
            fault_node_id="x",
            u_nom_v=230.0,
            network_type=NetworkType.TN_S,
            protection_arrangement=ProtectionArrangement.PE,
            phase_conductor_r_ohm=0.01,
            phase_conductor_x_ohm=0.001,
            return_conductor_r_ohm=0.01,
            return_conductor_x_ohm=0.001,
            transformer_r_ohm=0.005,
            transformer_x_ohm=0.015,
            upstream_r_ohm=None,
            upstream_x_ohm=0.010,
        )
        with pytest.raises(ValueError, match=r"MUSZĄ być oba None"):
            build_fault_loop_input(bad)

    def test_polish_labels_default(self) -> None:
        """Default labels po polsku per V12.xx canon."""
        result = build_fault_loop_input(_make_basic_request())
        assert "Przewód fazowy" in result.phase_conductor.label
        assert "PE/PEN" in result.return_conductor.label
        assert "SN/NN" in result.transformer_impedance.label

    def test_custom_labels_used(self) -> None:
        req = FaultLoopBuildRequest(
            fault_node_id="x",
            u_nom_v=230.0,
            network_type=NetworkType.TN_S,
            protection_arrangement=ProtectionArrangement.PE,
            phase_conductor_r_ohm=0.01,
            phase_conductor_x_ohm=0.001,
            return_conductor_r_ohm=0.01,
            return_conductor_x_ohm=0.001,
            transformer_r_ohm=0.005,
            transformer_x_ohm=0.015,
            phase_label="Custom L label",
            return_label="Custom PE label",
            transformer_label="Custom TR label",
        )
        result = build_fault_loop_input(req)
        assert result.phase_conductor.label == "Custom L label"
        assert result.return_conductor.label == "Custom PE label"
        assert result.transformer_impedance.label == "Custom TR label"


class TestEndToEndIntegration:
    """Integration: builder → solver pipeline."""

    def test_end_to_end_solver_call(self) -> None:
        """Builder result jest gotowy dla compute_fault_loop()."""
        req = _make_basic_request()
        input_obj = build_fault_loop_input(req)
        result = compute_fault_loop(input_obj)
        # Z ≈ 0.041 Ω → Ik_min ≈ 5290 A (per typical 400 kVA + 30m kabel)
        assert result.z_loop_magnitude_ohm == pytest.approx(0.0413, abs=1e-3)
        assert result.ik_min_a > 5000
        assert result.ik_max_a > 5500

    def test_end_to_end_with_upstream(self) -> None:
        req = _make_basic_request(with_upstream=True)
        input_obj = build_fault_loop_input(req)
        result = compute_fault_loop(input_obj)
        # Upstream zwiększa Z → mniej Ik niż bez upstream
        # Bez upstream: ~0.041 Ω; z 0.001 + j0.010 → trochę więcej
        assert result.z_loop_magnitude_ohm > 0.041


class TestDeterminism:
    def test_same_request_same_input(self) -> None:
        """Builder jest deterministyczny — same input → identical FaultLoopInput."""
        req = _make_basic_request()
        a = build_fault_loop_input(req)
        b = build_fault_loop_input(req)
        # Frozen dataclasses → equality works by value
        assert a == b
