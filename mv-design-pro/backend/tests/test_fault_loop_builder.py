"""
Tests for FaultLoopInputBuilder — P0.5 step 3 scaffolding.

Verifies that build_fault_loop_input() correctly transforms a flat request
struct into FaultLoopInput object expected by compute_fault_loop().
"""

import pytest
from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    RouteSegmentImpedance,
    build_fault_loop_input,
    refer_upstream_impedance_to_lv_ohm,
    sum_phase_and_return_route,
    zero_sequence_transformer_loop_impedance_ohm,
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


# ---------------------------------------------------------------------------
# P0.6 — RouteSegmentImpedance + sum_phase_and_return_route (ekstrakcja trasy)
# ---------------------------------------------------------------------------


class TestRouteSegmentImpedance:
    def test_rejects_n_parallel_below_one(self) -> None:
        with pytest.raises(ValueError, match="n_parallel"):
            RouteSegmentImpedance(
                label="x",
                branch_ref="c1",
                phase_total_r_ohm=0.1,
                phase_total_x_ohm=0.1,
                return_total_r_ohm=0.1,
                return_total_x_ohm=0.1,
                n_parallel=0,
            )

    def test_rejects_negative_impedance(self) -> None:
        with pytest.raises(ValueError, match="phase_total_r_ohm"):
            RouteSegmentImpedance(
                label="x",
                branch_ref="c1",
                phase_total_r_ohm=-0.1,
                phase_total_x_ohm=0.1,
                return_total_r_ohm=0.1,
                return_total_x_ohm=0.1,
            )


class TestSumPhaseAndReturnRoute:
    def test_three_segment_route_hand_computed(self) -> None:
        """3 odcinki, różne przekroje, n_parallel=2 na jednym — dokładność 1e-9."""
        segments = [
            RouteSegmentImpedance(
                label="s1",
                branch_ref="c1",
                phase_total_r_ohm=0.32 * 0.05,  # 50 m YAKY 4x25 (0.32 Ω/km typ.)
                phase_total_x_ohm=0.08 * 0.05,
                return_total_r_ohm=0.32 * 0.05,
                return_total_x_ohm=0.08 * 0.05,
                n_parallel=1,
            ),
            RouteSegmentImpedance(
                label="s2",
                branch_ref="c2",
                phase_total_r_ohm=0.206 * 0.03,  # 30 m YAKY 4x35, n_parallel=2
                phase_total_x_ohm=0.075 * 0.03,
                return_total_r_ohm=0.206 * 0.03,
                return_total_x_ohm=0.075 * 0.03,
                n_parallel=2,
            ),
            RouteSegmentImpedance(
                label="s3",
                branch_ref="c3",
                phase_total_r_ohm=0.641 * 0.02,  # 20 m YAKY 4x16
                phase_total_x_ohm=0.083 * 0.02,
                return_total_r_ohm=0.641 * 0.02,
                return_total_x_ohm=0.083 * 0.02,
                n_parallel=1,
            ),
        ]
        phase, ret = sum_phase_and_return_route(segments)

        expected_phase_r = (0.32 * 0.05) + (0.206 * 0.03 / 2) + (0.641 * 0.02)
        expected_phase_x = (0.08 * 0.05) + (0.075 * 0.03 / 2) + (0.083 * 0.02)
        expected_return_r = expected_phase_r  # symetryczne dane testowe
        expected_return_x = expected_phase_x

        assert phase.r_ohm == pytest.approx(expected_phase_r, abs=1e-9)
        assert phase.x_ohm == pytest.approx(expected_phase_x, abs=1e-9)
        assert ret.r_ohm == pytest.approx(expected_return_r, abs=1e-9)
        assert ret.x_ohm == pytest.approx(expected_return_x, abs=1e-9)

    def test_empty_route_gives_zero_components(self) -> None:
        """Trasa zerodługościowa (zwarcie na szynie TR) → składowe zerowe."""
        phase, ret = sum_phase_and_return_route([])
        assert phase.r_ohm == 0.0
        assert phase.x_ohm == 0.0
        assert ret.r_ohm == 0.0
        assert ret.x_ohm == 0.0


class TestZeroSequenceTransformerLoopImpedance:
    def test_converts_pu_to_ohm(self) -> None:
        # z0_pu na S_base=100 MVA, U_lv=0.4 kV -> Z_base = 0.4^2/100 = 0.0016 Ω
        result = zero_sequence_transformer_loop_impedance_ohm(
            z0_pu=complex(0.1, 0.5), ulv_kv=0.4, s_base_mva=100.0
        )
        assert result.r_ohm == pytest.approx(0.1 * 0.0016, abs=1e-12)
        assert result.x_ohm == pytest.approx(0.5 * 0.0016, abs=1e-12)

    def test_rejects_non_positive_base(self) -> None:
        with pytest.raises(ValueError):
            zero_sequence_transformer_loop_impedance_ohm(
                z0_pu=complex(0.1, 0.5), ulv_kv=0.0, s_base_mva=100.0
            )


class TestReferUpstreamImpedanceToLv:
    def test_turns_ratio_squared(self) -> None:
        # Z_hv referred to LV: Z_lv = Z_hv * (Ulv/Uhv)^2
        component = refer_upstream_impedance_to_lv_ohm(
            z_hv_ohm=complex(0.1, 0.5), uhv_kv=15.0, ulv_kv=0.4
        )
        ratio_sq = (0.4 / 15.0) ** 2
        assert component.r_ohm == pytest.approx(0.1 * ratio_sq, abs=1e-12)
        assert component.x_ohm == pytest.approx(0.5 * ratio_sq, abs=1e-12)

    def test_rejects_non_positive_voltages(self) -> None:
        with pytest.raises(ValueError):
            refer_upstream_impedance_to_lv_ohm(z_hv_ohm=complex(0.1, 0.5), uhv_kv=0.0, ulv_kv=0.4)
