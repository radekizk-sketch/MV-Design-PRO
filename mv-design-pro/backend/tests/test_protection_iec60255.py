"""
Tests for IEC 60255 Protection Curve Solver.

Verifies:
- NI (Normal Inverse) curve accuracy against known values
- VI (Very Inverse) curve accuracy
- EI (Extremely Inverse) curve accuracy
- RI (RI/Definite Inverse) curve accuracy
- DT (Definite Time) curve behaviour
- WhiteBox trace completeness
- Edge cases (M <= 1, validation errors)
- Deterministic signature reproducibility

Karta AB-1a Pakiet L (2026-09-23): testy selektywnosci pary przekaznikow, energii
I^2t i pelnej koordynacji zeszly RAZEM z kasowanym kodem (`SelectivityVerdict`,
`check_selectivity_pair`, `run_protection_coordination`, `compute_i2t_thermal_energy`
— LEGACY_USUNAC A2: brak konsumenta produkcyjnego, zaszyte marginesy 0,3/0,2 s,
„zaden nie wyzwala -> PASS"). Silnik IDMT (ten plik) zostaje.

Reference values computed from IEC 60255-151:2009:
    NI: t = TMS * 0.14 / ((I/Is)^0.02 - 1)
    VI: t = TMS * 13.5 / ((I/Is) - 1)
    EI: t = TMS * 80 / ((I/Is)^2 - 1)
    RI: t = TMS * 120 / ((I/Is) - 1)
    DT: t = TMS
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.protection_iec60255 import (
    IEC60255CurveType,
    compute_curve_trip_time,
)

# =============================================================================
# HELPERS
# =============================================================================


def _expected_ni(i: float, is_: float, tms: float) -> float:
    """Reference NI calculation: t = TMS * 0.14 / ((I/Is)^0.02 - 1)."""
    M = i / is_
    return tms * 0.14 / (math.pow(M, 0.02) - 1.0)


def _expected_vi(i: float, is_: float, tms: float) -> float:
    """Reference VI calculation: t = TMS * 13.5 / ((I/Is) - 1)."""
    M = i / is_
    return tms * 13.5 / (M - 1.0)


def _expected_ei(i: float, is_: float, tms: float) -> float:
    """Reference EI calculation: t = TMS * 80 / ((I/Is)^2 - 1)."""
    M = i / is_
    return tms * 80.0 / (math.pow(M, 2.0) - 1.0)


def _expected_ri(i: float, is_: float, tms: float) -> float:
    """Reference RI calculation: t = TMS * 120 / ((I/Is) - 1)."""
    M = i / is_
    return tms * 120.0 / (M - 1.0)


# =============================================================================
# TEST: NI CURVE ACCURACY
# =============================================================================


class TestNICurveAccuracy:
    """Verify NI (Normal Inverse) curve against known reference values."""

    def test_ni_at_2x_pickup(self) -> None:
        """NI at M=2, TMS=1 -> t = 0.14 / (2^0.02 - 1) ~ 10.023 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=200.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_ni(200.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - expected) < 0.01

    def test_ni_at_5x_pickup(self) -> None:
        """NI at M=5, TMS=1."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_ni(500.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - expected) < 0.01

    def test_ni_at_10x_pickup(self) -> None:
        """NI at M=10, TMS=1."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=1000.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_ni(1000.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - expected) < 0.01

    def test_ni_at_20x_pickup_tms_05(self) -> None:
        """NI at M=20, TMS=0.5 — scales linearly with TMS."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=2000.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        expected = _expected_ni(2000.0, 100.0, 0.5)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - expected) < 0.01

    def test_ni_tms_scaling(self) -> None:
        """NI trip time scales linearly with TMS."""
        r1 = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        r2 = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        assert r1.calculated_time_s is not None
        assert r2.calculated_time_s is not None
        assert abs(r1.calculated_time_s / r2.calculated_time_s - 2.0) < 0.001

    def test_ni_no_trip_below_pickup(self) -> None:
        """NI should not trip when I < Is."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=80.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        assert result.will_trip is False
        assert result.calculated_time_s is None

    def test_ni_curve_type_in_result(self) -> None:
        """Verify curve type is correctly stored."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=200.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        assert result.curve_type == IEC60255CurveType.NI
        assert result.A == 0.14
        assert result.B == 0.02


# =============================================================================
# TEST: VI CURVE ACCURACY
# =============================================================================


class TestVICurveAccuracy:
    """Verify VI (Very Inverse) curve against known reference values."""

    def test_vi_at_2x_pickup(self) -> None:
        """VI at M=2, TMS=1 -> t = 13.5 / (2 - 1) = 13.5 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.VI,
            i_fault_a=200.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_vi(200.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - 13.5) < 0.001
        assert abs(result.calculated_time_s - expected) < 0.001

    def test_vi_at_5x_pickup(self) -> None:
        """VI at M=5, TMS=1 -> t = 13.5 / (5 - 1) = 3.375 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.VI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_vi(500.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - 3.375) < 0.001
        assert abs(result.calculated_time_s - expected) < 0.001

    def test_vi_at_10x_pickup(self) -> None:
        """VI at M=10, TMS=1 -> t = 13.5 / (10 - 1) = 1.5 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.VI,
            i_fault_a=1000.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_vi(1000.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - 1.5) < 0.001
        assert abs(result.calculated_time_s - expected) < 0.001

    def test_vi_no_trip_at_pickup(self) -> None:
        """VI should not trip when I == Is (M == 1)."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.VI,
            i_fault_a=100.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        assert result.will_trip is False
        assert result.calculated_time_s is None


# =============================================================================
# TEST: EI CURVE ACCURACY
# =============================================================================


class TestEICurveAccuracy:
    """Verify EI (Extremely Inverse) curve against known reference values."""

    def test_ei_at_2x_pickup(self) -> None:
        """EI at M=2, TMS=1 -> t = 80 / (2^2 - 1) = 80/3 ~ 26.667 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.EI,
            i_fault_a=200.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_ei(200.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - expected) < 0.01
        assert abs(result.calculated_time_s - 80.0 / 3.0) < 0.01

    def test_ei_at_5x_pickup(self) -> None:
        """EI at M=5, TMS=1 -> t = 80 / (25 - 1) = 80/24 ~ 3.333 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.EI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_ei(500.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - expected) < 0.01
        assert abs(result.calculated_time_s - 80.0 / 24.0) < 0.01

    def test_ei_at_10x_pickup(self) -> None:
        """EI at M=10, TMS=1 -> t = 80 / (100 - 1) = 80/99 ~ 0.808 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.EI,
            i_fault_a=1000.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_ei(1000.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - expected) < 0.01
        assert abs(result.calculated_time_s - 80.0 / 99.0) < 0.01

    def test_ei_faster_than_vi_at_high_multiple(self) -> None:
        """EI should be faster than VI at high current multiples."""
        ei_result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.EI,
            i_fault_a=1000.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        vi_result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.VI,
            i_fault_a=1000.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        assert ei_result.calculated_time_s is not None
        assert vi_result.calculated_time_s is not None
        assert ei_result.calculated_time_s < vi_result.calculated_time_s


# =============================================================================
# TEST: RI CURVE ACCURACY
# =============================================================================


class TestRICurveAccuracy:
    """Verify RI (RI/Definite Inverse) curve against known reference values."""

    def test_ri_at_2x_pickup(self) -> None:
        """RI at M=2, TMS=1 -> t = 120 / (2 - 1) = 120 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.RI,
            i_fault_a=200.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_ri(200.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - 120.0) < 0.001
        assert abs(result.calculated_time_s - expected) < 0.001

    def test_ri_at_5x_pickup(self) -> None:
        """RI at M=5, TMS=1 -> t = 120 / (5 - 1) = 30 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.RI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        expected = _expected_ri(500.0, 100.0, 1.0)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - 30.0) < 0.001
        assert abs(result.calculated_time_s - expected) < 0.001

    def test_ri_at_10x_pickup_tms_02(self) -> None:
        """RI at M=10, TMS=0.2 -> t = 0.2 * 120 / (10 - 1) = 2.667 s."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.RI,
            i_fault_a=1000.0,
            is_pickup_a=100.0,
            tms=0.2,
        )
        expected = _expected_ri(1000.0, 100.0, 0.2)
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        assert abs(result.calculated_time_s - expected) < 0.01

    def test_ri_no_trip_below_pickup(self) -> None:
        """RI should not trip below pickup."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.RI,
            i_fault_a=50.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        assert result.will_trip is False
        assert result.calculated_time_s is None


# =============================================================================
# TEST: DT CURVE
# =============================================================================


class TestDTCurve:
    """Verify DT (Definite Time) curve behaviour."""

    def test_dt_trip_above_pickup(self) -> None:
        """DT should trip with t = TMS when I > Is."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.DT,
            i_fault_a=200.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        assert result.will_trip is True
        assert result.calculated_time_s == 0.5

    def test_dt_no_trip_below_pickup(self) -> None:
        """DT should not trip when I <= Is."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.DT,
            i_fault_a=50.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        assert result.will_trip is False
        assert result.calculated_time_s is None

    def test_dt_time_independent_of_current(self) -> None:
        """DT trip time is always TMS regardless of current magnitude."""
        r1 = compute_curve_trip_time(
            curve_type=IEC60255CurveType.DT,
            i_fault_a=200.0,
            is_pickup_a=100.0,
            tms=0.3,
        )
        r2 = compute_curve_trip_time(
            curve_type=IEC60255CurveType.DT,
            i_fault_a=5000.0,
            is_pickup_a=100.0,
            tms=0.3,
        )
        assert r1.calculated_time_s == r2.calculated_time_s == 0.3


# =============================================================================
# TEST: WHITEBOX TRACE COMPLETENESS
# =============================================================================


class TestWhiteBoxTraceCompleteness:
    """Verify that WHITE BOX traces contain all required fields."""

    REQUIRED_TRACE_KEYS = {
        "step",
        "standard",
        "curve_type",
        "curve_label_pl",
        "formula_latex",
        "I_fault_A",
        "Is_pickup_A",
        "TMS",
        "M",
        "will_trip",
        "calculated_time_s",
        "substitution",
    }

    REQUIRED_IDMT_KEYS = REQUIRED_TRACE_KEYS | {
        "A",
        "B",
        "M_power_B",
        "denominator",
        "base_time_s",
        "result",
    }

    def test_ni_trace_completeness(self) -> None:
        """NI trace should have all required IDMT fields."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        trace = result.white_box_trace
        missing = self.REQUIRED_IDMT_KEYS - set(trace.keys())
        assert not missing, f"Missing trace keys: {missing}"

    def test_vi_trace_completeness(self) -> None:
        """VI trace should have all required IDMT fields."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.VI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        trace = result.white_box_trace
        missing = self.REQUIRED_IDMT_KEYS - set(trace.keys())
        assert not missing, f"Missing trace keys: {missing}"

    def test_ei_trace_completeness(self) -> None:
        """EI trace should have all required IDMT fields."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.EI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        trace = result.white_box_trace
        missing = self.REQUIRED_IDMT_KEYS - set(trace.keys())
        assert not missing, f"Missing trace keys: {missing}"

    def test_ri_trace_completeness(self) -> None:
        """RI trace should have all required IDMT fields."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.RI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        trace = result.white_box_trace
        missing = self.REQUIRED_IDMT_KEYS - set(trace.keys())
        assert not missing, f"Missing trace keys: {missing}"

    def test_dt_trace_completeness(self) -> None:
        """DT trace should have basic required fields."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.DT,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        trace = result.white_box_trace
        missing = self.REQUIRED_TRACE_KEYS - set(trace.keys())
        assert not missing, f"Missing trace keys: {missing}"

    def test_no_trip_trace_completeness(self) -> None:
        """No-trip result should still have a complete trace."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=50.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        trace = result.white_box_trace
        assert trace["will_trip"] is False
        assert trace["result"] == "NO_TRIP"
        assert "M" in trace
        assert "substitution" in trace

    def test_trace_contains_latex_formula(self) -> None:
        """All traces must contain LaTeX formula for proof engine."""
        for ct in IEC60255CurveType:
            result = compute_curve_trip_time(
                curve_type=ct,
                i_fault_a=500.0,
                is_pickup_a=100.0,
                tms=0.5,
            )
            assert result.formula_latex, f"No LaTeX formula for {ct.value}"
            assert result.substitution_latex, f"No substitution for {ct.value}"
            assert "formula_latex" in result.white_box_trace

    def test_trace_contains_standard_reference(self) -> None:
        """All traces must reference IEC 60255-151:2009."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        assert result.white_box_trace["standard"] == "IEC 60255-151:2009"

    def test_result_to_dict_roundtrip(self) -> None:
        """to_dict should produce a complete, serializable dictionary."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        d = result.to_dict()
        assert d["curve_type"] == "NI"
        assert d["i_fault_a"] == 500.0
        assert d["is_pickup_a"] == 100.0
        assert d["tms"] == 0.5
        assert d["will_trip"] is True
        assert d["calculated_time_s"] is not None
        assert isinstance(d["white_box_trace"], dict)


# =============================================================================
# TEST: EDGE CASES AND VALIDATION
# =============================================================================


class TestEdgeCases:
    """Verify edge cases and input validation."""

    def test_zero_pickup_raises(self) -> None:
        """Zero pickup current should raise ValueError."""
        with pytest.raises(ValueError, match="positive"):
            compute_curve_trip_time(
                curve_type=IEC60255CurveType.NI,
                i_fault_a=100.0,
                is_pickup_a=0.0,
                tms=1.0,
            )

    def test_negative_pickup_raises(self) -> None:
        """Negative pickup current should raise ValueError."""
        with pytest.raises(ValueError, match="positive"):
            compute_curve_trip_time(
                curve_type=IEC60255CurveType.NI,
                i_fault_a=100.0,
                is_pickup_a=-50.0,
                tms=1.0,
            )

    def test_zero_tms_raises(self) -> None:
        """Zero TMS should raise ValueError."""
        with pytest.raises(ValueError, match="positive"):
            compute_curve_trip_time(
                curve_type=IEC60255CurveType.NI,
                i_fault_a=100.0,
                is_pickup_a=50.0,
                tms=0.0,
            )

    def test_negative_fault_current_raises(self) -> None:
        """Negative fault current should raise ValueError."""
        with pytest.raises(ValueError, match="negative"):
            compute_curve_trip_time(
                curve_type=IEC60255CurveType.NI,
                i_fault_a=-100.0,
                is_pickup_a=50.0,
                tms=1.0,
            )

    def test_very_close_to_pickup(self) -> None:
        """Current just barely above pickup should produce large trip time."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=100.01,
            is_pickup_a=100.0,
            tms=1.0,
        )
        assert result.will_trip is True
        assert result.calculated_time_s is not None
        # Very high trip time expected near M = 1
        assert result.calculated_time_s > 100.0

    def test_zero_fault_current_no_trip(self) -> None:
        """Zero fault current should not cause a trip."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=0.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
        assert result.will_trip is False
        assert result.calculated_time_s is None

    def test_all_curve_types_deterministic(self) -> None:
        """Same inputs should always produce the same output."""
        for ct in IEC60255CurveType:
            r1 = compute_curve_trip_time(
                curve_type=ct,
                i_fault_a=500.0,
                is_pickup_a=100.0,
                tms=0.5,
            )
            r2 = compute_curve_trip_time(
                curve_type=ct,
                i_fault_a=500.0,
                is_pickup_a=100.0,
                tms=0.5,
            )
            assert r1.calculated_time_s == r2.calculated_time_s
            assert r1.white_box_trace == r2.white_box_trace


# =============================================================================
# TEST: FROZEN DATACLASS IMMUTABILITY
# =============================================================================


class TestFrozenImmutability:
    """Verify that all result dataclasses are truly frozen."""

    def test_curve_trip_time_result_frozen(self) -> None:
        """CurveTripTimeResult should be immutable."""
        result = compute_curve_trip_time(
            curve_type=IEC60255CurveType.NI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=0.5,
        )
        with pytest.raises(AttributeError):
            result.calculated_time_s = 999.0  # type: ignore[misc]
