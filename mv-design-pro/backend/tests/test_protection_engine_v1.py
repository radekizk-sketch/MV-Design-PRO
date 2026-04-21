"""
Protection Engine v1 Tests — PR-26

Tests for:
- IEC IDMT curves (golden points)
- Determinism (SHA-256 hash stability)
- Function 50/51 evaluation
- CT ratio conversion
- Full engine execution
- ResultSet mapping

INVARIANTS:
- Golden points verified against IEC 60255-151:2009 manual calculation
- Determinism: identical input → identical output + hash
- No heuristics tested (only explicit parameters)
"""

from __future__ import annotations

import math
import os
import sys

# Ensure backend/src is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from domain.protection_engine_v1 import (
    CTRatio,
    Function50Settings,
    Function51Settings,
    IECCurveTypeV1,
    ProtectionResultSetV1,
    ProtectionStudyInputV1,
    RelayV1,
    TestPoint,
    execute_protection_v1,
    function_50_evaluate,
    function_51_evaluate,
    iec_curve_time_seconds,
)

# =============================================================================
# GOLDEN POINTS — IEC 60255-151:2009
# =============================================================================
# Formula: t = TMS * A / (M^B - 1)
# Manually computed reference values.


class TestIECCurveGoldenPoints:
    """Golden point tests against IEC 60255-151:2009."""

    def test_si_m2_tms1(self):
        """SI curve: M=2, TMS=1 → t = 0.14 / (2^0.02 - 1)."""
        # M=2, B=0.02 → M^B = 2^0.02 = 1.01395...
        # denom = 0.01395...
        # t = 1.0 * 0.14 / 0.01395... ≈ 10.029...
        t, trace = iec_curve_time_seconds(
            i_a_secondary=2.0,
            pickup_a_secondary=1.0,
            tms=1.0,
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
        )
        assert t is not None
        expected = 1.0 * 0.14 / (math.pow(2.0, 0.02) - 1.0)
        assert abs(t - round(expected, 6)) < 1e-4
        assert trace["result"] == "TRIP"
        assert trace["A"] == 0.14
        assert trace["B"] == 0.02

    def test_si_m5_tms03(self):
        """SI curve: M=5, TMS=0.3."""
        t, trace = iec_curve_time_seconds(
            i_a_secondary=5.0,
            pickup_a_secondary=1.0,
            tms=0.3,
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
        )
        assert t is not None
        expected = 0.3 * 0.14 / (math.pow(5.0, 0.02) - 1.0)
        assert abs(t - round(expected, 6)) < 1e-4

    def test_si_m10_tms05(self):
        """SI curve: M=10, TMS=0.5."""
        t, trace = iec_curve_time_seconds(
            i_a_secondary=10.0,
            pickup_a_secondary=1.0,
            tms=0.5,
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
        )
        assert t is not None
        expected = 0.5 * 0.14 / (math.pow(10.0, 0.02) - 1.0)
        assert abs(t - round(expected, 6)) < 1e-4

    def test_vi_m2_tms1(self):
        """VI curve: M=2, TMS=1 → t = 13.5 / (2^1 - 1) = 13.5."""
        t, trace = iec_curve_time_seconds(
            i_a_secondary=2.0,
            pickup_a_secondary=1.0,
            tms=1.0,
            curve_type=IECCurveTypeV1.VERY_INVERSE,
        )
        assert t is not None
        expected = 1.0 * 13.5 / (math.pow(2.0, 1.0) - 1.0)
        assert abs(t - expected) < 1e-4
        assert t == round(13.5, 6)

    def test_vi_m5_tms02(self):
        """VI curve: M=5, TMS=0.2 → t = 0.2 * 13.5 / (5^1 - 1) = 0.675."""
        t, trace = iec_curve_time_seconds(
            i_a_secondary=5.0,
            pickup_a_secondary=1.0,
            tms=0.2,
            curve_type=IECCurveTypeV1.VERY_INVERSE,
        )
        assert t is not None
        expected = 0.2 * 13.5 / (5.0 - 1.0)
        assert abs(t - round(expected, 6)) < 1e-4

    def test_ei_m2_tms1(self):
        """EI curve: M=2, TMS=1 → t = 80 / (2^2 - 1) = 80/3 ≈ 26.667."""
        t, trace = iec_curve_time_seconds(
            i_a_secondary=2.0,
            pickup_a_secondary=1.0,
            tms=1.0,
            curve_type=IECCurveTypeV1.EXTREMELY_INVERSE,
        )
        assert t is not None
        expected = 1.0 * 80.0 / (math.pow(2.0, 2.0) - 1.0)
        assert abs(t - round(expected, 6)) < 1e-3

    def test_ei_m10_tms03(self):
        """EI curve: M=10, TMS=0.3 → t = 0.3 * 80 / (100 - 1) = 24/99 ≈ 0.2424."""
        t, trace = iec_curve_time_seconds(
            i_a_secondary=10.0,
            pickup_a_secondary=1.0,
            tms=0.3,
            curve_type=IECCurveTypeV1.EXTREMELY_INVERSE,
        )
        assert t is not None
        expected = 0.3 * 80.0 / (math.pow(10.0, 2.0) - 1.0)
        assert abs(t - round(expected, 6)) < 1e-4

    def test_no_trip_below_pickup(self):
        """Current below pickup → no trip for all curve types."""
        for ct in IECCurveTypeV1:
            t, trace = iec_curve_time_seconds(
                i_a_secondary=0.5,
                pickup_a_secondary=1.0,
                tms=1.0,
                curve_type=ct,
            )
            assert t is None, f"Expected no trip for {ct.value} at M=0.5"
            assert trace["result"] == "NO_TRIP"

    def test_no_trip_at_pickup(self):
        """Current exactly at pickup → no trip (M=1.0, denominator=0)."""
        t, trace = iec_curve_time_seconds(
            i_a_secondary=1.0,
            pickup_a_secondary=1.0,
            tms=1.0,
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
        )
        assert t is None

    def test_max_time_clamp(self):
        """Trip time clamped by max_time_s."""
        t_unclamped, _ = iec_curve_time_seconds(
            i_a_secondary=1.01,
            pickup_a_secondary=1.0,
            tms=1.0,
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
        )
        assert t_unclamped is not None
        assert t_unclamped > 5.0  # Very slow trip at M≈1.01

        t_clamped, trace = iec_curve_time_seconds(
            i_a_secondary=1.01,
            pickup_a_secondary=1.0,
            tms=1.0,
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
            max_time_s=5.0,
        )
        assert t_clamped == 5.0
        assert trace.get("clamped") is True


# =============================================================================
# WHITE-BOX TRACE TESTS
# =============================================================================


class TestWhiteBoxTrace:
    """Verify trace contains all required intermediate values."""

    def test_trace_keys_present(self):
        """All WHITE BOX keys present in trace."""
        _, trace = iec_curve_time_seconds(
            i_a_secondary=5.0,
            pickup_a_secondary=1.0,
            tms=0.3,
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
        )
        required_keys = [
            "formula",
            "standard",
            "curve_type",
            "curve_label_pl",
            "A",
            "B",
            "TMS",
            "I_secondary",
            "I_pickup_secondary",
            "M",
            "M_power_B",
            "denominator",
            "base_time_s",
            "trip_time_s",
            "result",
        ]
        for key in required_keys:
            assert key in trace, f"Missing trace key: {key}"

    def test_trace_formula_correct(self):
        """Trace contains correct formula string."""
        _, trace = iec_curve_time_seconds(
            i_a_secondary=5.0,
            pickup_a_secondary=1.0,
            tms=0.3,
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
        )
        assert trace["formula"] == "t = TMS * A / (M^B - 1)"
        assert trace["standard"] == "IEC 60255-151:2009"


# =============================================================================
# CT RATIO TESTS
# =============================================================================


class TestCTRatio:
    """Test CT ratio conversions."""

    def test_to_secondary(self):
        """Primary → secondary conversion."""
        ct = CTRatio(primary_a=400.0, secondary_a=5.0)
        assert ct.to_secondary(400.0) == 5.0
        assert ct.to_secondary(800.0) == 10.0
        assert ct.to_secondary(200.0) == 2.5

    def test_to_primary(self):
        """Secondary → primary conversion."""
        ct = CTRatio(primary_a=400.0, secondary_a=5.0)
        assert ct.to_primary(5.0) == 400.0
        assert ct.to_primary(10.0) == 800.0

    def test_ratio(self):
        """CT ratio property."""
        ct = CTRatio(primary_a=400.0, secondary_a=5.0)
        assert ct.ratio == 80.0

    def test_serialization(self):
        """to_dict / from_dict roundtrip."""
        ct = CTRatio(primary_a=400.0, secondary_a=5.0)
        d = ct.to_dict()
        ct2 = CTRatio.from_dict(d)
        assert ct == ct2


# =============================================================================
# FUNCTION 50 TESTS
# =============================================================================


class TestFunction50:
    """Test ANSI 50 instantaneous overcurrent."""

    def test_trip_above_pickup(self):
        """Current above pickup → trip."""
        settings = Function50Settings(enabled=True, pickup_a_secondary=10.0, t_trip_s=0.05)
        result, trace = function_50_evaluate(i_a_secondary=15.0, settings=settings)
        assert result.picked_up is True
        assert result.t_trip_s == 0.05

    def test_no_trip_below_pickup(self):
        """Current below pickup → no trip."""
        settings = Function50Settings(enabled=True, pickup_a_secondary=10.0, t_trip_s=0.05)
        result, trace = function_50_evaluate(i_a_secondary=5.0, settings=settings)
        assert result.picked_up is False
        assert result.t_trip_s is None

    def test_disabled(self):
        """Disabled function → no trip regardless of current."""
        settings = Function50Settings(enabled=False, pickup_a_secondary=10.0, t_trip_s=0.05)
        result, trace = function_50_evaluate(i_a_secondary=100.0, settings=settings)
        assert result.picked_up is False
        assert trace["result"] == "DISABLED"

    def test_no_trip_time(self):
        """Function 50 without explicit trip time → picked_up=True, t_trip_s=None."""
        settings = Function50Settings(enabled=True, pickup_a_secondary=10.0)
        result, trace = function_50_evaluate(i_a_secondary=15.0, settings=settings)
        assert result.picked_up is True
        assert result.t_trip_s is None


# =============================================================================
# FUNCTION 51 TESTS
# =============================================================================


class TestFunction51:
    """Test ANSI 51 time overcurrent IDMT."""

    def test_trip_si(self):
        """SI curve → correct trip time."""
        settings = Function51Settings(
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
            pickup_a_secondary=1.0,
            tms=0.3,
        )
        result, trace = function_51_evaluate(i_a_secondary=5.0, settings=settings)
        assert result is not None
        expected = 0.3 * 0.14 / (math.pow(5.0, 0.02) - 1.0)
        assert abs(result.t_trip_s - round(expected, 6)) < 1e-4
        assert result.curve_type == "IEC_STANDARD_INVERSE"

    def test_no_trip_below_pickup(self):
        """Current below pickup → None."""
        settings = Function51Settings(
            curve_type=IECCurveTypeV1.STANDARD_INVERSE,
            pickup_a_secondary=5.0,
            tms=0.3,
        )
        result, trace = function_51_evaluate(i_a_secondary=3.0, settings=settings)
        assert result is None


# =============================================================================
# FULL ENGINE EXECUTION TESTS
# =============================================================================


class TestProtectionEngineV1:
    """Test full Protection Engine v1 execution."""

    def _make_study_input(self) -> ProtectionStudyInputV1:
        """Build a standard test input."""
        relay = RelayV1(
            relay_id="relay-001",
            attached_cb_id="cb-001",
            ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.STANDARD_INVERSE,
                pickup_a_secondary=1.0,
                tms=0.3,
            ),
            f50=Function50Settings(
                enabled=True,
                pickup_a_secondary=25.0,
                t_trip_s=0.05,
            ),
        )

        test_points = (
            TestPoint(point_id="tp-01", i_a_primary=1000.0),
            TestPoint(point_id="tp-02", i_a_primary=4000.0),
            TestPoint(point_id="tp-03", i_a_primary=200.0),
        )

        return ProtectionStudyInputV1(
            relays=(relay,),
            test_points=test_points,
        )

    def test_execution_produces_results(self):
        """Engine produces results for all relay × test_point pairs."""
        study_input = self._make_study_input()
        result = execute_protection_v1(study_input)

        assert isinstance(result, ProtectionResultSetV1)
        assert result.analysis_type == "PROTECTION"
        assert len(result.relay_results) == 1
        assert len(result.relay_results[0].per_test_point) == 3

    def test_results_sorted_by_point_id(self):
        """Test point results sorted lexicographically by point_id."""
        study_input = self._make_study_input()
        result = execute_protection_v1(study_input)

        point_ids = [tp.point_id for tp in result.relay_results[0].per_test_point]
        assert point_ids == sorted(point_ids)

    def test_ct_ratio_applied(self):
        """CT ratio correctly converts primary to secondary current."""
        study_input = self._make_study_input()
        result = execute_protection_v1(study_input)

        # CT ratio: 400/5 = 80
        # tp-01: 1000A primary → 12.5A secondary
        tp1 = next(tp for tp in result.relay_results[0].per_test_point if tp.point_id == "tp-01")
        assert abs(tp1.i_a_secondary - 12.5) < 1e-6

    def test_function_50_triggers_above_threshold(self):
        """Function 50 triggers when secondary current > pickup."""
        study_input = self._make_study_input()
        result = execute_protection_v1(study_input)

        # tp-02: 4000A primary → 50A secondary > 25A pickup → should trip
        tp2 = next(tp for tp in result.relay_results[0].per_test_point if tp.point_id == "tp-02")
        assert tp2.function_results.f50 is not None
        assert tp2.function_results.f50.picked_up is True
        assert tp2.function_results.f50.t_trip_s == 0.05

    def test_function_50_no_trip_below_threshold(self):
        """Function 50 does not trip when secondary current < pickup."""
        study_input = self._make_study_input()
        result = execute_protection_v1(study_input)

        # tp-03: 200A primary → 2.5A secondary < 25A pickup → no trip
        tp3 = next(tp for tp in result.relay_results[0].per_test_point if tp.point_id == "tp-03")
        assert tp3.function_results.f50 is not None
        assert tp3.function_results.f50.picked_up is False

    def test_function_51_produces_time(self):
        """Function 51 produces trip time for current above pickup."""
        study_input = self._make_study_input()
        result = execute_protection_v1(study_input)

        # tp-01: 1000A primary → 12.5A secondary > 1.0A pickup → should have time
        tp1 = next(tp for tp in result.relay_results[0].per_test_point if tp.point_id == "tp-01")
        assert tp1.function_results.f51 is not None
        assert tp1.function_results.f51.t_trip_s > 0

    def test_function_51_no_trip_below_pickup(self):
        """Function 51 returns None for current below pickup (after CT)."""
        relay = RelayV1(
            relay_id="relay-low",
            attached_cb_id="cb-low",
            ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.STANDARD_INVERSE,
                pickup_a_secondary=100.0,  # Very high pickup
                tms=0.3,
            ),
        )
        test_points = (TestPoint(point_id="tp-low", i_a_primary=100.0),)
        # 100A primary → 1.25A secondary < 100A pickup

        study_input = ProtectionStudyInputV1(relays=(relay,), test_points=test_points)
        result = execute_protection_v1(study_input)

        tp = result.relay_results[0].per_test_point[0]
        assert tp.function_results.f51 is None

    def test_trace_present_in_results(self):
        """Each test point result has a trace dict."""
        study_input = self._make_study_input()
        result = execute_protection_v1(study_input)

        for tp in result.relay_results[0].per_test_point:
            assert isinstance(tp.trace, dict)
            assert "relay_id" in tp.trace
            assert "f51" in tp.trace

    def test_deterministic_signature_present(self):
        """Result has a non-empty deterministic signature."""
        study_input = self._make_study_input()
        result = execute_protection_v1(study_input)

        assert result.deterministic_signature != ""
        assert len(result.deterministic_signature) == 64  # SHA-256 hex


# =============================================================================
# DETERMINISM TESTS
# =============================================================================


class TestDeterminism:
    """Verify deterministic behavior: same input → same output."""

    def _make_study_input(self) -> ProtectionStudyInputV1:
        relay = RelayV1(
            relay_id="relay-det",
            attached_cb_id="cb-det",
            ct_ratio=CTRatio(primary_a=600.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.VERY_INVERSE,
                pickup_a_secondary=2.0,
                tms=0.5,
            ),
            f50=Function50Settings(
                enabled=True,
                pickup_a_secondary=30.0,
                t_trip_s=0.08,
            ),
        )
        test_points = (
            TestPoint(point_id="det-01", i_a_primary=3000.0),
            TestPoint(point_id="det-02", i_a_primary=6000.0),
        )
        return ProtectionStudyInputV1(relays=(relay,), test_points=test_points)

    def test_same_input_same_hash(self):
        """Identical inputs produce identical canonical hash."""
        input1 = self._make_study_input()
        input2 = self._make_study_input()
        assert input1.canonical_hash() == input2.canonical_hash()

    def test_same_input_same_result(self):
        """Identical inputs produce identical result signature."""
        input1 = self._make_study_input()
        input2 = self._make_study_input()

        result1 = execute_protection_v1(input1)
        result2 = execute_protection_v1(input2)

        assert result1.deterministic_signature == result2.deterministic_signature

    def test_same_input_same_json(self):
        """Identical inputs produce identical JSON output."""
        import json

        input1 = self._make_study_input()
        input2 = self._make_study_input()

        result1 = execute_protection_v1(input1)
        result2 = execute_protection_v1(input2)

        json1 = json.dumps(result1.to_dict(), sort_keys=True)
        json2 = json.dumps(result2.to_dict(), sort_keys=True)
        assert json1 == json2

    def test_different_input_different_hash(self):
        """Different inputs produce different canonical hash."""
        input1 = self._make_study_input()
        relay_diff = RelayV1(
            relay_id="relay-det",
            attached_cb_id="cb-det",
            ct_ratio=CTRatio(primary_a=600.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.VERY_INVERSE,
                pickup_a_secondary=2.0,
                tms=0.6,  # Different TMS
            ),
        )
        input2 = ProtectionStudyInputV1(
            relays=(relay_diff,),
            test_points=input1.test_points,
        )
        assert input1.canonical_hash() != input2.canonical_hash()


# =============================================================================
# SERIALIZATION ROUNDTRIP TESTS
# =============================================================================


class TestSerialization:
    """Test to_dict/from_dict roundtrips."""

    def test_relay_roundtrip(self):
        relay = RelayV1(
            relay_id="relay-ser",
            attached_cb_id="cb-ser",
            ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.STANDARD_INVERSE,
                pickup_a_secondary=1.0,
                tms=0.3,
                max_time_s=10.0,
            ),
            f50=Function50Settings(
                enabled=True,
                pickup_a_secondary=25.0,
                t_trip_s=0.05,
            ),
        )
        d = relay.to_dict()
        relay2 = RelayV1.from_dict(d)
        assert relay == relay2

    def test_study_input_roundtrip(self):
        study_input = ProtectionStudyInputV1(
            relays=(
                RelayV1(
                    relay_id="r1",
                    attached_cb_id="cb1",
                    ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
                    f51=Function51Settings(
                        curve_type=IECCurveTypeV1.STANDARD_INVERSE,
                        pickup_a_secondary=1.0,
                        tms=0.3,
                    ),
                ),
            ),
            test_points=(TestPoint(point_id="t1", i_a_primary=1000.0),),
        )
        d = study_input.to_dict()
        study_input2 = ProtectionStudyInputV1.from_dict(d)
        assert study_input == study_input2

    def test_result_set_roundtrip(self):
        study_input = ProtectionStudyInputV1(
            relays=(
                RelayV1(
                    relay_id="r1",
                    attached_cb_id="cb1",
                    ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
                    f51=Function51Settings(
                        curve_type=IECCurveTypeV1.STANDARD_INVERSE,
                        pickup_a_secondary=1.0,
                        tms=0.3,
                    ),
                ),
            ),
            test_points=(TestPoint(point_id="t1", i_a_primary=1000.0),),
        )
        result = execute_protection_v1(study_input)
        d = result.to_dict()
        result2 = ProtectionResultSetV1.from_dict(d)
        assert result.analysis_type == result2.analysis_type
        assert result.deterministic_signature == result2.deterministic_signature
        assert len(result.relay_results) == len(result2.relay_results)


# =============================================================================
# MULTI-RELAY TESTS
# =============================================================================


class TestMultiRelay:
    """Test engine with multiple relays."""

    def test_two_relays_sorted(self):
        """Two relays are sorted by relay_id in results."""
        relay_b = RelayV1(
            relay_id="relay-B",
            attached_cb_id="cb-B",
            ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.STANDARD_INVERSE,
                pickup_a_secondary=1.0,
                tms=0.3,
            ),
        )
        relay_a = RelayV1(
            relay_id="relay-A",
            attached_cb_id="cb-A",
            ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.VERY_INVERSE,
                pickup_a_secondary=2.0,
                tms=0.5,
            ),
        )
        study_input = ProtectionStudyInputV1(
            relays=(relay_b, relay_a),  # Reverse order
            test_points=(TestPoint(point_id="tp-1", i_a_primary=2000.0),),
        )
        result = execute_protection_v1(study_input)

        # Should be sorted: relay-A before relay-B
        assert result.relay_results[0].relay_id == "relay-A"
        assert result.relay_results[1].relay_id == "relay-B"

    def test_different_curves_different_times(self):
        """Different curve types produce different trip times."""
        relay_si = RelayV1(
            relay_id="relay-SI",
            attached_cb_id="cb-SI",
            ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.STANDARD_INVERSE,
                pickup_a_secondary=1.0,
                tms=1.0,
            ),
        )
        relay_ei = RelayV1(
            relay_id="relay-EI",
            attached_cb_id="cb-EI",
            ct_ratio=CTRatio(primary_a=400.0, secondary_a=5.0),
            f51=Function51Settings(
                curve_type=IECCurveTypeV1.EXTREMELY_INVERSE,
                pickup_a_secondary=1.0,
                tms=1.0,
            ),
        )
        study_input = ProtectionStudyInputV1(
            relays=(relay_si, relay_ei),
            test_points=(TestPoint(point_id="tp-1", i_a_primary=2000.0),),
        )
        result = execute_protection_v1(study_input)

        # Both should trip but at different times
        t_ei = result.relay_results[0].per_test_point[0].function_results.f51
        t_si = result.relay_results[1].per_test_point[0].function_results.f51
        assert t_ei is not None
        assert t_si is not None
        assert t_ei.t_trip_s != t_si.t_trip_s
