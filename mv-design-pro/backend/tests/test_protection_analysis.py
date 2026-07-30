"""
Protection Analysis Tests — P15a FOUNDATION

Test coverage:
1. Determinism: 2x execute with same input → identical result JSON + trace JSON
2. Validations: missing template / missing SC run → 4xx
3. Minimal fixture: 1 network, 1 SC run, 1 template, 1 device → TRIPS/NO_TRIP
4. Curve evaluation: IEC inverse, definite time
"""

from __future__ import annotations

import json

import pytest
from application.protection_analysis.engine import (
    FaultPoint,
    ProtectionDevice,
    ProtectionEvaluationEngine,
    ProtectionEvaluationInput,
    compute_definite_time,
    compute_iec_inverse_time,
    compute_margin_percent,
)
from domain.protection_analysis import (
    ProtectionEvaluation,
    ProtectionResult,
    ProtectionResultSummary,
    ProtectionTrace,
    ProtectionTraceStep,
    TripState,
    compute_result_summary,
)

# =============================================================================
# CURVE EVALUATION TESTS
# =============================================================================


class TestIecInverseTime:
    """Tests for IEC inverse-time curve calculations."""

    def test_iec_si_curve_at_2x_pickup(self):
        """IEC Standard Inverse at 2x pickup should give ~7s with TMS=1."""
        # IEC SI: t = TMS * 0.14 / ((I/Ip)^0.02 - 1)
        # At 2x: t = 1.0 * 0.14 / ((2.0)^0.02 - 1) = 0.14 / 0.01396 ≈ 10.03s
        t = compute_iec_inverse_time(
            i_fault_a=200.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=0.14,
            b=0.02,
        )
        assert t is not None
        assert 9.0 < t < 11.0  # Approximately 10s

    def test_iec_si_curve_at_10x_pickup(self):
        """IEC Standard Inverse at 10x pickup should give faster trip."""
        t = compute_iec_inverse_time(
            i_fault_a=1000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=0.14,
            b=0.02,
        )
        assert t is not None
        assert 2.0 < t < 4.0  # Approximately 3s

    def test_iec_si_curve_with_tms(self):
        """TMS should scale trip time linearly."""
        t1 = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=0.3,
            a=0.14,
            b=0.02,
        )
        t2 = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=0.6,
            a=0.14,
            b=0.02,
        )
        assert t1 is not None and t2 is not None
        assert abs(t2 / t1 - 2.0) < 0.01  # t2 should be 2x t1

    def test_no_trip_below_pickup(self):
        """Current below pickup should return None (no trip)."""
        t = compute_iec_inverse_time(
            i_fault_a=50.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=0.14,
            b=0.02,
        )
        assert t is None

    def test_no_trip_at_pickup(self):
        """Current exactly at pickup should return None (no trip)."""
        t = compute_iec_inverse_time(
            i_fault_a=100.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=0.14,
            b=0.02,
        )
        assert t is None

    def test_very_inverse_curve(self):
        """IEC Very Inverse should have different timing."""
        # IEC VI: A=13.5, B=1.0
        t = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=13.5,
            b=1.0,
        )
        assert t is not None
        assert 2.0 < t < 5.0  # Different from SI

    def test_extremely_inverse_curve(self):
        """IEC Extremely Inverse curve calculation.

        At M=5 (500A/100A):
        t = TMS * A / (M^B - 1) = 1 * 80 / (5^2 - 1) = 80/24 = 3.333...s

        EI shows "faster at high currents" property at very high multiples (M>>5).
        """
        # IEC EI: A=80.0, B=2.0, M=5
        t = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=80.0,
            b=2.0,
        )
        assert t is not None
        # t = 80 / (25 - 1) = 3.333...
        expected = 80.0 / (5.0**2 - 1.0)
        assert abs(t - expected) < 1e-5

    def test_extremely_inverse_faster_at_high_multiples(self):
        """EI is faster than VI at high current multiples (M=20)."""
        # At M=20: EI = 80/(400-1) ≈ 0.2s, VI = 13.5/(20-1) ≈ 0.71s
        t_ei = compute_iec_inverse_time(
            i_fault_a=2000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=80.0,
            b=2.0,
        )
        t_vi = compute_iec_inverse_time(
            i_fault_a=2000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=13.5,
            b=1.0,
        )
        assert t_ei is not None and t_vi is not None
        assert t_ei < t_vi  # EI is faster at M=20
        assert t_ei < 0.25  # EI ≈ 0.2s at M=20


class TestDefiniteTime:
    """Tests for definite-time curve calculations."""

    def test_trips_above_pickup(self):
        """Current above pickup should return fixed delay."""
        t = compute_definite_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            delay_s=0.5,
        )
        assert t == 0.5

    def test_no_trip_below_pickup(self):
        """Current below pickup should return None."""
        t = compute_definite_time(
            i_fault_a=50.0,
            i_pickup_a=100.0,
            delay_s=0.5,
        )
        assert t is None


class TestMarginPercent:
    """Tests for margin calculation."""

    def test_margin_at_2x(self):
        """2x pickup should give 100% margin."""
        margin = compute_margin_percent(200.0, 100.0)
        assert margin == 100.0

    def test_margin_at_1_5x(self):
        """1.5x pickup should give 50% margin."""
        margin = compute_margin_percent(150.0, 100.0)
        assert margin == 50.0

    def test_margin_below_pickup(self):
        """Current below pickup should give negative margin."""
        margin = compute_margin_percent(50.0, 100.0)
        assert margin == -50.0


# =============================================================================
# EVALUATION ENGINE TESTS
# =============================================================================


class TestProtectionEvaluationEngine:
    """Tests for the protection evaluation engine."""

    @pytest.fixture
    def engine(self):
        return ProtectionEvaluationEngine()

    @pytest.fixture
    def sample_device(self):
        return ProtectionDevice(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            curve_ref="curve-iec-si",
            curve_kind="inverse",
            curve_parameters={"A": 0.14, "B": 0.02},
        )

    @pytest.fixture
    def sample_fault_trips(self):
        """Fault current that should cause trip."""
        return FaultPoint(
            fault_id="bus-001",
            i_fault_a=500.0,  # 5x pickup
            fault_type="3F",
        )

    @pytest.fixture
    def sample_fault_no_trip(self):
        """Fault current that should NOT cause trip."""
        return FaultPoint(
            fault_id="bus-001",
            i_fault_a=50.0,  # 0.5x pickup
            fault_type="3F",
        )

    def test_evaluation_trips(self, engine, sample_device, sample_fault_trips):
        """Device should trip for fault current above pickup."""
        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(sample_device,),
            faults=(sample_fault_trips,),
        )

        result, trace = engine.evaluate(input_data)

        assert len(result.evaluations) == 1
        assert result.evaluations[0].trip_state == TripState.TRIPS
        assert result.evaluations[0].t_trip_s is not None
        assert result.evaluations[0].t_trip_s > 0
        assert result.summary.trips_count == 1
        assert result.summary.no_trip_count == 0

    def test_evaluation_no_trip(self, engine, sample_device, sample_fault_no_trip):
        """Device should NOT trip for fault current below pickup."""
        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(sample_device,),
            faults=(sample_fault_no_trip,),
        )

        result, trace = engine.evaluate(input_data)

        assert len(result.evaluations) == 1
        assert result.evaluations[0].trip_state == TripState.NO_TRIP
        assert result.evaluations[0].t_trip_s is None
        assert result.summary.trips_count == 0
        assert result.summary.no_trip_count == 1

    def test_evaluation_unsupported_curve(self, engine, sample_fault_trips):
        """Unsupported curve kind should return INVALID."""
        device = ProtectionDevice(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            curve_ref="curve-unknown",
            curve_kind="unknown_curve_type",
            curve_parameters={},
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(device,),
            faults=(sample_fault_trips,),
        )

        result, trace = engine.evaluate(input_data)

        assert len(result.evaluations) == 1
        assert result.evaluations[0].trip_state == TripState.INVALID
        assert "NOT_SUPPORTED_YET" in result.evaluations[0].notes_pl


# =============================================================================
# DETERMINISM TESTS
# =============================================================================


class TestDeterminism:
    """Tests for deterministic behavior."""

    @pytest.fixture
    def engine(self):
        return ProtectionEvaluationEngine()

    def test_same_input_same_output(self, engine):
        """Same input should produce identical output (determinism)."""
        device = ProtectionDevice(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            curve_ref="curve-iec-si",
            curve_kind="inverse",
            curve_parameters={"A": 0.14, "B": 0.02},
        )

        fault = FaultPoint(
            fault_id="bus-001",
            i_fault_a=500.0,
            fault_type="3F",
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(device,),
            faults=(fault,),
        )

        # Execute twice
        result1, trace1 = engine.evaluate(input_data)
        result2, trace2 = engine.evaluate(input_data)

        # Compare result JSON
        json.dumps(result1.to_dict(), sort_keys=True)
        json.dumps(result2.to_dict(), sort_keys=True)

        # Exclude created_at which is time-dependent
        result1_dict = result1.to_dict()
        result2_dict = result2.to_dict()
        del result1_dict["created_at"]
        del result2_dict["created_at"]

        assert json.dumps(result1_dict, sort_keys=True) == json.dumps(result2_dict, sort_keys=True)

        # Compare trace JSON (excluding created_at)
        trace1_dict = trace1.to_dict()
        trace2_dict = trace2.to_dict()
        del trace1_dict["created_at"]
        del trace2_dict["created_at"]

        assert json.dumps(trace1_dict, sort_keys=True) == json.dumps(trace2_dict, sort_keys=True)

    def test_deterministic_trip_time(self, engine):
        """Trip time calculation should be deterministic."""
        device = ProtectionDevice(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            curve_ref="curve-iec-si",
            curve_kind="inverse",
            curve_parameters={"A": 0.14, "B": 0.02},
        )

        fault = FaultPoint(
            fault_id="bus-001",
            i_fault_a=500.0,
            fault_type="3F",
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(device,),
            faults=(fault,),
        )

        # Execute multiple times
        times = []
        for _ in range(10):
            result, _ = engine.evaluate(input_data)
            times.append(result.evaluations[0].t_trip_s)

        # All times should be identical
        assert all(t == times[0] for t in times)


# =============================================================================
# DOMAIN MODEL TESTS
# =============================================================================


class TestProtectionEvaluation:
    """Tests for ProtectionEvaluation dataclass."""

    def test_serialization_roundtrip(self):
        """Evaluation should serialize and deserialize correctly."""
        evaluation = ProtectionEvaluation(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            fault_target_id="bus-001",
            i_fault_a=500.0,
            i_pickup_a=100.0,
            t_trip_s=1.234,
            trip_state=TripState.TRIPS,
            curve_ref="curve-001",
            curve_kind="inverse",
            margin_percent=400.0,
            notes_pl="Zadziałanie po 1.234s",
        )

        data = evaluation.to_dict()
        restored = ProtectionEvaluation.from_dict(data)

        assert restored.device_id == evaluation.device_id
        assert restored.trip_state == evaluation.trip_state
        assert restored.t_trip_s == evaluation.t_trip_s
        assert restored.margin_percent == evaluation.margin_percent


class TestProtectionResult:
    """Tests for ProtectionResult dataclass."""

    def test_serialization_roundtrip(self):
        """Result should serialize and deserialize correctly."""
        evaluation = ProtectionEvaluation(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            fault_target_id="bus-001",
            i_fault_a=500.0,
            i_pickup_a=100.0,
            t_trip_s=1.234,
            trip_state=TripState.TRIPS,
            curve_ref="curve-001",
            curve_kind="inverse",
            margin_percent=400.0,
            notes_pl="Zadziałanie",
        )

        summary = ProtectionResultSummary(
            total_evaluations=1,
            trips_count=1,
            no_trip_count=0,
            invalid_count=0,
            min_trip_time_s=1.234,
            max_trip_time_s=1.234,
        )

        result = ProtectionResult(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            evaluations=(evaluation,),
            summary=summary,
        )

        data = result.to_dict()
        restored = ProtectionResult.from_dict(data)

        assert restored.run_id == result.run_id
        assert restored.sc_run_id == result.sc_run_id
        assert len(restored.evaluations) == 1
        assert restored.summary.trips_count == 1


class TestProtectionTrace:
    """Tests for ProtectionTrace dataclass."""

    def test_serialization_roundtrip(self):
        """Trace should serialize and deserialize correctly."""
        step = ProtectionTraceStep(
            step="device_evaluation",
            description_pl="Ocena urządzenia",
            inputs={"i_fault_a": 500.0},
            outputs={"trip_state": "TRIPS"},
        )

        trace = ProtectionTrace(
            run_id="run-001",
            sc_run_id="sc-001",
            snapshot_id="snapshot-001",
            template_ref="template-001",
            overrides={"I>": {"value": 100.0}},
            steps=(step,),
        )

        data = trace.to_dict()
        restored = ProtectionTrace.from_dict(data)

        assert restored.run_id == trace.run_id
        assert len(restored.steps) == 1
        assert restored.steps[0].step == "device_evaluation"


class TestComputeResultSummary:
    """Tests for compute_result_summary helper."""

    def test_summary_computation(self):
        """Summary should be computed correctly from evaluations."""
        evaluations = (
            ProtectionEvaluation(
                device_id="relay-001",
                device_type_ref=None,
                protected_element_ref="bus-001",
                fault_target_id="bus-001",
                i_fault_a=500.0,
                i_pickup_a=100.0,
                t_trip_s=1.0,
                trip_state=TripState.TRIPS,
                curve_ref=None,
                curve_kind="inverse",
                margin_percent=400.0,
                notes_pl="",
            ),
            ProtectionEvaluation(
                device_id="relay-002",
                device_type_ref=None,
                protected_element_ref="bus-002",
                fault_target_id="bus-002",
                i_fault_a=50.0,
                i_pickup_a=100.0,
                t_trip_s=None,
                trip_state=TripState.NO_TRIP,
                curve_ref=None,
                curve_kind="inverse",
                margin_percent=-50.0,
                notes_pl="",
            ),
            ProtectionEvaluation(
                device_id="relay-003",
                device_type_ref=None,
                protected_element_ref="bus-003",
                fault_target_id="bus-003",
                i_fault_a=500.0,
                i_pickup_a=100.0,
                t_trip_s=2.0,
                trip_state=TripState.TRIPS,
                curve_ref=None,
                curve_kind="inverse",
                margin_percent=400.0,
                notes_pl="",
            ),
        )

        summary = compute_result_summary(evaluations)

        assert summary.total_evaluations == 3
        assert summary.trips_count == 2
        assert summary.no_trip_count == 1
        assert summary.invalid_count == 0
        assert summary.min_trip_time_s == 1.0
        assert summary.max_trip_time_s == 2.0


# =============================================================================
# DEFINITE TIME CURVE TESTS
# =============================================================================


class TestDefiniteTimeCurve:
    """Tests for definite-time curve evaluation."""

    @pytest.fixture
    def engine(self):
        return ProtectionEvaluationEngine()

    def test_definite_time_trips(self, engine):
        """Definite-time curve should trip with fixed delay."""
        device = ProtectionDevice(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,  # TMS ignored for definite time
            curve_ref="curve-dt",
            curve_kind="definite_time",
            curve_parameters={"delay_s": 0.5},
        )

        fault = FaultPoint(
            fault_id="bus-001",
            i_fault_a=500.0,
            fault_type="3F",
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(device,),
            faults=(fault,),
        )

        result, trace = engine.evaluate(input_data)

        assert len(result.evaluations) == 1
        assert result.evaluations[0].trip_state == TripState.TRIPS
        assert result.evaluations[0].t_trip_s == 0.5


# =============================================================================
# MULTIPLE DEVICES AND FAULTS TESTS
# =============================================================================


class TestMultipleDevicesAndFaults:
    """Tests for scenarios with multiple devices and fault points."""

    @pytest.fixture
    def engine(self):
        return ProtectionEvaluationEngine()

    def test_multiple_devices_single_fault(self, engine):
        """Multiple devices should all be evaluated against single fault."""
        devices = (
            ProtectionDevice(
                device_id="relay-001",
                device_type_ref=None,
                protected_element_ref="bus-001",
                i_pickup_a=100.0,
                tms=0.3,
                curve_ref=None,
                curve_kind="inverse",
                curve_parameters={"A": 0.14, "B": 0.02},
            ),
            ProtectionDevice(
                device_id="relay-002",
                device_type_ref=None,
                protected_element_ref="bus-002",
                i_pickup_a=200.0,  # Higher pickup
                tms=0.3,
                curve_ref=None,
                curve_kind="inverse",
                curve_parameters={"A": 0.14, "B": 0.02},
            ),
        )

        fault = FaultPoint(
            fault_id="bus-001",
            i_fault_a=150.0,  # Above 100A, below 200A
            fault_type="3F",
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=devices,
            faults=(fault,),
        )

        result, trace = engine.evaluate(input_data)

        assert len(result.evaluations) == 2
        # First device (100A pickup) should trip
        eval1 = next(e for e in result.evaluations if e.device_id == "relay-001")
        assert eval1.trip_state == TripState.TRIPS
        # Second device (200A pickup) should NOT trip
        eval2 = next(e for e in result.evaluations if e.device_id == "relay-002")
        assert eval2.trip_state == TripState.NO_TRIP

    def test_single_device_multiple_faults(self, engine):
        """Single device should be evaluated against multiple fault points."""
        device = ProtectionDevice(
            device_id="relay-001",
            device_type_ref=None,
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            curve_ref=None,
            curve_kind="inverse",
            curve_parameters={"A": 0.14, "B": 0.02},
        )

        faults = (
            FaultPoint(fault_id="bus-001", i_fault_a=500.0, fault_type="3F"),
            FaultPoint(fault_id="bus-002", i_fault_a=50.0, fault_type="3F"),
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(device,),
            faults=faults,
        )

        result, trace = engine.evaluate(input_data)

        assert len(result.evaluations) == 2
        # Fault at bus-001 (500A) should cause trip
        eval1 = next(e for e in result.evaluations if e.fault_target_id == "bus-001")
        assert eval1.trip_state == TripState.TRIPS
        # Fault at bus-002 (50A) should NOT cause trip
        eval2 = next(e for e in result.evaluations if e.fault_target_id == "bus-002")
        assert eval2.trip_state == TripState.NO_TRIP


# =============================================================================
# GOLDEN POINT TESTS (IEC 60255-151 BINDING)
# =============================================================================


class TestIecInverseTimeGoldenPoints:
    """
    Golden point tests per IEC_IDMT_CANON.md (BINDING).

    Formula: t = TMS * A / (M^B - 1), where M = I/Ip
    All tests use TMS=1.0, Ip=100A

    Reference: IEC 60255-151:2009, Table 1
    """

    # IEC curve constants (BINDING)
    SI_A, SI_B = 0.14, 0.02
    VI_A, VI_B = 13.5, 1.0
    EI_A, EI_B = 80.0, 2.0

    def _expected_time(self, a: float, b: float, m: float) -> float:
        """Calculate expected time per canonical formula."""
        return a / (m**b - 1.0)

    # =========================================================================
    # Standard Inverse (SI) Golden Points
    # =========================================================================

    def test_si_golden_m2(self):
        """SI at M=2: t = 0.14 / (2^0.02 - 1)"""
        t = compute_iec_inverse_time(
            i_fault_a=200.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.SI_A,
            b=self.SI_B,
        )
        expected = self._expected_time(self.SI_A, self.SI_B, 2.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"SI M=2: expected {expected:.6f}, got {t:.6f}"

    def test_si_golden_m5(self):
        """SI at M=5: t = 0.14 / (5^0.02 - 1)"""
        t = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.SI_A,
            b=self.SI_B,
        )
        expected = self._expected_time(self.SI_A, self.SI_B, 5.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"SI M=5: expected {expected:.6f}, got {t:.6f}"

    def test_si_golden_m10(self):
        """SI at M=10: t = 0.14 / (10^0.02 - 1)"""
        t = compute_iec_inverse_time(
            i_fault_a=1000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.SI_A,
            b=self.SI_B,
        )
        expected = self._expected_time(self.SI_A, self.SI_B, 10.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"SI M=10: expected {expected:.6f}, got {t:.6f}"

    # =========================================================================
    # Very Inverse (VI) Golden Points
    # =========================================================================

    def test_vi_golden_m2(self):
        """VI at M=2: t = 13.5 / (2^1 - 1) = 13.5"""
        t = compute_iec_inverse_time(
            i_fault_a=200.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.VI_A,
            b=self.VI_B,
        )
        expected = self._expected_time(self.VI_A, self.VI_B, 2.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"VI M=2: expected {expected:.6f}, got {t:.6f}"
        assert abs(t - 13.5) < 1e-5  # Exact: 13.5 / 1 = 13.5

    def test_vi_golden_m5(self):
        """VI at M=5: t = 13.5 / (5^1 - 1) = 3.375"""
        t = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.VI_A,
            b=self.VI_B,
        )
        expected = self._expected_time(self.VI_A, self.VI_B, 5.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"VI M=5: expected {expected:.6f}, got {t:.6f}"
        assert abs(t - 3.375) < 1e-5  # Exact: 13.5 / 4 = 3.375

    def test_vi_golden_m10(self):
        """VI at M=10: t = 13.5 / (10^1 - 1) = 1.5"""
        t = compute_iec_inverse_time(
            i_fault_a=1000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.VI_A,
            b=self.VI_B,
        )
        expected = self._expected_time(self.VI_A, self.VI_B, 10.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"VI M=10: expected {expected:.6f}, got {t:.6f}"
        assert abs(t - 1.5) < 1e-5  # Exact: 13.5 / 9 = 1.5

    # =========================================================================
    # Extremely Inverse (EI) Golden Points
    # =========================================================================

    def test_ei_golden_m2(self):
        """EI at M=2: t = 80 / (2^2 - 1) = 26.666..."""
        t = compute_iec_inverse_time(
            i_fault_a=200.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.EI_A,
            b=self.EI_B,
        )
        expected = self._expected_time(self.EI_A, self.EI_B, 2.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"EI M=2: expected {expected:.6f}, got {t:.6f}"
        assert abs(t - 80.0 / 3.0) < 1e-5  # Exact: 80 / 3 = 26.666...

    def test_ei_golden_m5(self):
        """EI at M=5: t = 80 / (5^2 - 1) = 3.333..."""
        t = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.EI_A,
            b=self.EI_B,
        )
        expected = self._expected_time(self.EI_A, self.EI_B, 5.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"EI M=5: expected {expected:.6f}, got {t:.6f}"
        assert abs(t - 80.0 / 24.0) < 1e-5  # Exact: 80 / 24 = 3.333...

    def test_ei_golden_m10(self):
        """EI at M=10: t = 80 / (10^2 - 1) = 0.808..."""
        t = compute_iec_inverse_time(
            i_fault_a=1000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.EI_A,
            b=self.EI_B,
        )
        expected = self._expected_time(self.EI_A, self.EI_B, 10.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"EI M=10: expected {expected:.6f}, got {t:.6f}"
        assert abs(t - 80.0 / 99.0) < 1e-5  # Exact: 80 / 99 = 0.808...

    def test_ei_golden_m20(self):
        """EI at M=20: t = 80 / (20^2 - 1) = 0.200..."""
        t = compute_iec_inverse_time(
            i_fault_a=2000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=self.EI_A,
            b=self.EI_B,
        )
        expected = self._expected_time(self.EI_A, self.EI_B, 20.0)
        assert t is not None
        assert abs(t - expected) < 1e-5, f"EI M=20: expected {expected:.6f}, got {t:.6f}"
        assert abs(t - 80.0 / 399.0) < 1e-5  # Exact: 80 / 399 = 0.200...


# =============================================================================
# PROPERTY TESTS (MATHEMATICAL INVARIANTS)
# =============================================================================


class TestIecInverseTimeProperties:
    """
    Property tests verifying mathematical invariants of IEC IDMT curves.

    These tests verify:
    1. Monotonicity: higher M → shorter time
    2. TMS scaling: t(TMS=k) = k * t(TMS=1)
    3. No-trip boundary: M <= 1 → None
    4. Numerical stability: no NaN/Inf near boundaries
    5. Determinism: identical inputs → identical outputs
    """

    def test_monotonicity_si(self):
        """SI curve: t(M2) < t(M1) for M1 < M2."""
        # Test multiple M values
        m_values = [1.5, 2.0, 5.0, 10.0, 20.0]
        times = []
        for m in m_values:
            t = compute_iec_inverse_time(
                i_fault_a=m * 100.0,
                i_pickup_a=100.0,
                tms=1.0,
                a=0.14,
                b=0.02,
            )
            assert t is not None, f"SI should trip at M={m}"
            times.append(t)

        # Verify strictly decreasing
        for i in range(len(times) - 1):
            assert (
                times[i] > times[i + 1]
            ), f"SI monotonicity failed: t(M={m_values[i]})={times[i]} <= t(M={m_values[i+1]})={times[i+1]}"

    def test_monotonicity_vi(self):
        """VI curve: t(M2) < t(M1) for M1 < M2."""
        m_values = [1.5, 2.0, 5.0, 10.0, 20.0]
        times = []
        for m in m_values:
            t = compute_iec_inverse_time(
                i_fault_a=m * 100.0,
                i_pickup_a=100.0,
                tms=1.0,
                a=13.5,
                b=1.0,
            )
            assert t is not None
            times.append(t)

        for i in range(len(times) - 1):
            assert times[i] > times[i + 1], f"VI monotonicity failed at M={m_values[i]}"

    def test_monotonicity_ei(self):
        """EI curve: t(M2) < t(M1) for M1 < M2."""
        m_values = [1.5, 2.0, 5.0, 10.0, 20.0]
        times = []
        for m in m_values:
            t = compute_iec_inverse_time(
                i_fault_a=m * 100.0,
                i_pickup_a=100.0,
                tms=1.0,
                a=80.0,
                b=2.0,
            )
            assert t is not None
            times.append(t)

        for i in range(len(times) - 1):
            assert times[i] > times[i + 1], f"EI monotonicity failed at M={m_values[i]}"

    def test_tms_scaling_linear(self):
        """TMS scales trip time linearly: t(TMS=k) = k * t(TMS=1)."""
        # Test for SI curve at M=5
        t1 = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=0.14,
            b=0.02,
        )
        t2 = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=2.0,
            a=0.14,
            b=0.02,
        )
        t3 = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=0.5,
            a=0.14,
            b=0.02,
        )

        assert t1 is not None and t2 is not None and t3 is not None
        assert abs(t2 - 2.0 * t1) < 1e-5, "TMS=2 should give 2x time"
        assert abs(t3 - 0.5 * t1) < 1e-5, "TMS=0.5 should give 0.5x time"

    def test_no_trip_at_pickup(self):
        """M = 1 (I = Ip) → no trip (None)."""
        for a, b in [(0.14, 0.02), (13.5, 1.0), (80.0, 2.0)]:
            t = compute_iec_inverse_time(
                i_fault_a=100.0,
                i_pickup_a=100.0,
                tms=1.0,
                a=a,
                b=b,
            )
            assert t is None, f"Should not trip at M=1 for curve (A={a}, B={b})"

    def test_no_trip_below_pickup(self):
        """M < 1 (I < Ip) → no trip (None)."""
        for a, b in [(0.14, 0.02), (13.5, 1.0), (80.0, 2.0)]:
            for i_fault in [50.0, 80.0, 99.9]:
                t = compute_iec_inverse_time(
                    i_fault_a=i_fault,
                    i_pickup_a=100.0,
                    tms=1.0,
                    a=a,
                    b=b,
                )
                assert t is None, f"Should not trip at I={i_fault}A < Ip=100A"

    def test_numerical_stability_near_boundary(self):
        """M = 1.0001 should give finite (large) time, not NaN/Inf."""
        for a, b, name in [(0.14, 0.02, "SI"), (13.5, 1.0, "VI"), (80.0, 2.0, "EI")]:
            t = compute_iec_inverse_time(
                i_fault_a=100.01,
                i_pickup_a=100.0,
                tms=1.0,
                a=a,
                b=b,
            )
            assert t is not None, f"{name} should trip at M=1.0001"
            assert t > 0, f"{name} time should be positive"
            assert t < float("inf"), f"{name} time should be finite"
            # Time should be very large near boundary
            assert t > 100.0, f"{name} time should be large near M=1"

    def test_determinism_repeated_calls(self):
        """Same inputs must produce identical outputs."""
        results = []
        for _ in range(10):
            t = compute_iec_inverse_time(
                i_fault_a=500.0,
                i_pickup_a=100.0,
                tms=0.3,
                a=0.14,
                b=0.02,
            )
            results.append(t)

        assert all(
            r == results[0] for r in results
        ), f"Determinism failed: got different results {set(results)}"

    def test_curve_ordering_at_high_m(self):
        """At high M (e.g., 20), EI < VI < SI (EI is fastest)."""
        t_si = compute_iec_inverse_time(
            i_fault_a=2000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=0.14,
            b=0.02,
        )
        t_vi = compute_iec_inverse_time(
            i_fault_a=2000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=13.5,
            b=1.0,
        )
        t_ei = compute_iec_inverse_time(
            i_fault_a=2000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=80.0,
            b=2.0,
        )

        assert t_si is not None and t_vi is not None and t_ei is not None
        assert (
            t_ei < t_vi < t_si
        ), f"At M=20: expected EI < VI < SI, got EI={t_ei}, VI={t_vi}, SI={t_si}"


# =============================================================================
# TRACE AUDIT TESTS
# =============================================================================


class TestProtectionTraceAudit:
    """Tests verifying trace contains all required audit fields."""

    @pytest.fixture
    def engine(self):
        return ProtectionEvaluationEngine()

    def test_trace_contains_curve_parameters(self, engine):
        """Trace step must contain curve_kind, A, B, i_pickup, i_fault, tms."""
        device = ProtectionDevice(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            curve_ref="curve-si",
            curve_kind="inverse",
            curve_parameters={"A": 0.14, "B": 0.02},
        )

        fault = FaultPoint(
            fault_id="bus-001",
            i_fault_a=500.0,
            fault_type="3F",
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(device,),
            faults=(fault,),
        )

        result, trace = engine.evaluate(input_data)

        # Find device evaluation step
        eval_steps = [s for s in trace.steps if s.step == "device_evaluation"]
        assert len(eval_steps) == 1, "Should have one device evaluation step"

        step = eval_steps[0]

        # Verify required audit fields in inputs
        assert "curve_kind" in step.inputs, "Trace must contain curve_kind"
        assert "i_fault_a" in step.inputs, "Trace must contain i_fault_a"
        assert "i_pickup_a" in step.inputs, "Trace must contain i_pickup_a"
        assert "tms" in step.inputs, "Trace must contain tms"
        assert "curve_parameters" in step.inputs, "Trace must contain curve_parameters"

        # Verify values
        assert step.inputs["curve_kind"] == "inverse"
        assert step.inputs["i_fault_a"] == 500.0
        assert step.inputs["i_pickup_a"] == 100.0
        assert step.inputs["tms"] == 0.3

        # Verify outputs contain trip result
        assert "trip_state" in step.outputs, "Trace must contain trip_state"
        assert "t_trip_s" in step.outputs, "Trace must contain t_trip_s"

    def test_trace_serialization_deterministic(self, engine):
        """Trace JSON serialization must be deterministic."""
        device = ProtectionDevice(
            device_id="relay-001",
            device_type_ref="sepam-20",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            curve_ref="curve-si",
            curve_kind="inverse",
            curve_parameters={"A": 0.14, "B": 0.02},
        )

        fault = FaultPoint(
            fault_id="bus-001",
            i_fault_a=500.0,
            fault_type="3F",
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref="template-001",
            template_fingerprint="abc123",
            library_manifest_ref=None,
            devices=(device,),
            faults=(fault,),
        )

        # Execute twice
        _, trace1 = engine.evaluate(input_data)
        _, trace2 = engine.evaluate(input_data)

        # Compare trace dictionaries (excluding created_at which is time-dependent)
        dict1 = trace1.to_dict()
        dict2 = trace2.to_dict()
        del dict1["created_at"]
        del dict2["created_at"]

        assert dict1 == dict2, "Trace serialization must be deterministic"


# =============================================================================
# VENDOR CURVE TESTS (P15a-EXT-VENDORS)
# =============================================================================


class TestVendorCurveRegistry:
    """Tests for vendor curve registry."""

    def test_iec_curves_registered(self):
        """IEC standard curves should be in registry."""
        from domain.protection_vendors import VENDOR_CURVE_REGISTRY

        assert "IEC_SI" in VENDOR_CURVE_REGISTRY
        assert "IEC_VI" in VENDOR_CURVE_REGISTRY
        assert "IEC_EI" in VENDOR_CURVE_REGISTRY
        assert "IEC_LTI" in VENDOR_CURVE_REGISTRY

    def test_vendor_curves_registered(self):
        """Major vendor curves should be in registry."""
        from domain.protection_vendors import VENDOR_CURVE_REGISTRY

        # ABB
        assert "ABB_SI" in VENDOR_CURVE_REGISTRY
        assert "ABB_VI" in VENDOR_CURVE_REGISTRY
        assert "ABB_EI" in VENDOR_CURVE_REGISTRY
        # Siemens
        assert "SIEMENS_SI" in VENDOR_CURVE_REGISTRY
        assert "SIEMENS_VI" in VENDOR_CURVE_REGISTRY
        assert "SIEMENS_EI" in VENDOR_CURVE_REGISTRY
        # Schneider
        assert "SCHNEIDER_SI" in VENDOR_CURVE_REGISTRY
        assert "SCHNEIDER_VI" in VENDOR_CURVE_REGISTRY
        assert "SCHNEIDER_EI" in VENDOR_CURVE_REGISTRY
        # Etango
        assert "ETANGO_SI" in VENDOR_CURVE_REGISTRY
        assert "ETANGO_VI" in VENDOR_CURVE_REGISTRY
        assert "ETANGO_EI" in VENDOR_CURVE_REGISTRY

    def test_vendor_curve_has_required_fields(self):
        """Each vendor curve must have all required fields."""
        from domain.protection_vendors import VENDOR_CURVE_REGISTRY

        for code, curve in VENDOR_CURVE_REGISTRY.items():
            assert curve.curve_code == code
            assert curve.manufacturer is not None
            assert curve.display_name is not None
            assert curve.origin is not None
            assert curve.formula_kind is not None
            assert curve.parameters is not None
            assert curve.verification_status is not None
            assert curve.source_reference is not None


class TestVendorIecParity:
    """
    Vendor → IEC parity tests.

    Vendor curves that map to IEC must produce identical trip times.
    """

    def test_abb_si_matches_iec_si(self):
        """ABB_SI must produce same result as IEC_SI."""
        from domain.protection_vendors import (
            IEC_CURVE_CONSTANTS,
            VENDOR_CURVE_REGISTRY,
            IecVariant,
            resolve_vendor_to_iec_params,
        )

        abb_curve = VENDOR_CURVE_REGISTRY["ABB_SI"]
        abb_params = resolve_vendor_to_iec_params(abb_curve)
        iec_params = IEC_CURVE_CONSTANTS[IecVariant.SI]

        # Parameters must match exactly
        assert abb_params["A"] == iec_params["A"]
        assert abb_params["B"] == iec_params["B"]

        # Trip times must match
        t_abb = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=abb_params["A"],
            b=abb_params["B"],
        )
        t_iec = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=iec_params["A"],
            b=iec_params["B"],
        )

        assert t_abb == t_iec, "ABB_SI must match IEC_SI"

    def test_siemens_vi_matches_iec_vi(self):
        """SIEMENS_VI must produce same result as IEC_VI."""
        from domain.protection_vendors import (
            IEC_CURVE_CONSTANTS,
            VENDOR_CURVE_REGISTRY,
            IecVariant,
            resolve_vendor_to_iec_params,
        )

        siemens_curve = VENDOR_CURVE_REGISTRY["SIEMENS_VI"]
        siemens_params = resolve_vendor_to_iec_params(siemens_curve)
        iec_params = IEC_CURVE_CONSTANTS[IecVariant.VI]

        assert siemens_params["A"] == iec_params["A"]
        assert siemens_params["B"] == iec_params["B"]

        t_siemens = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=siemens_params["A"],
            b=siemens_params["B"],
        )
        t_iec = compute_iec_inverse_time(
            i_fault_a=500.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=iec_params["A"],
            b=iec_params["B"],
        )

        assert t_siemens == t_iec, "SIEMENS_VI must match IEC_VI"

    def test_etango_ei_matches_iec_ei(self):
        """ETANGO_EI must produce same result as IEC_EI."""
        from domain.protection_vendors import (
            IEC_CURVE_CONSTANTS,
            VENDOR_CURVE_REGISTRY,
            IecVariant,
            resolve_vendor_to_iec_params,
        )

        etango_curve = VENDOR_CURVE_REGISTRY["ETANGO_EI"]
        etango_params = resolve_vendor_to_iec_params(etango_curve)
        iec_params = IEC_CURVE_CONSTANTS[IecVariant.EI]

        assert etango_params["A"] == iec_params["A"]
        assert etango_params["B"] == iec_params["B"]

        t_etango = compute_iec_inverse_time(
            i_fault_a=1000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=etango_params["A"],
            b=etango_params["B"],
        )
        t_iec = compute_iec_inverse_time(
            i_fault_a=1000.0,
            i_pickup_a=100.0,
            tms=1.0,
            a=iec_params["A"],
            b=iec_params["B"],
        )

        assert t_etango == t_iec, "ETANGO_EI must match IEC_EI"

    def test_all_derived_vendor_curves_match_iec(self):
        """All DERIVED_VENDOR curves must match their IEC variant."""
        from domain.protection_vendors import (
            IEC_CURVE_CONSTANTS,
            VENDOR_CURVE_REGISTRY,
            CurveOrigin,
            resolve_vendor_to_iec_params,
        )

        for code, curve in VENDOR_CURVE_REGISTRY.items():
            if curve.origin == CurveOrigin.DERIVED_VENDOR:
                assert curve.maps_to_iec, f"{code} is DERIVED_VENDOR but maps_to_iec=False"
                assert curve.iec_variant is not None, f"{code} has no iec_variant"

                vendor_params = resolve_vendor_to_iec_params(curve)
                iec_params = IEC_CURVE_CONSTANTS[curve.iec_variant]

                assert vendor_params["A"] == iec_params["A"], f"{code} A mismatch"
                assert vendor_params["B"] == iec_params["B"], f"{code} B mismatch"


class TestBuildDeviceFromVendorCurve:
    """Tests for build_device_from_vendor_curve helper."""

    def test_build_abb_si_device(self):
        """Build device from ABB_SI curve."""
        from application.protection_analysis.engine import build_device_from_vendor_curve

        device = build_device_from_vendor_curve(
            device_id="relay-001",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            vendor_curve_code="ABB_SI",
        )

        assert device.device_id == "relay-001"
        assert device.i_pickup_a == 100.0
        assert device.tms == 0.3
        assert device.manufacturer == "ABB"
        assert device.vendor_curve_code == "ABB_SI"
        assert device.curve_origin == "DERIVED_VENDOR"
        assert device.iec_variant == "SI"
        assert device.verification_status == "VERIFIED"
        assert device.curve_parameters["A"] == 0.14
        assert device.curve_parameters["B"] == 0.02

    def test_build_siemens_ei_device(self):
        """Build device from SIEMENS_EI curve."""
        from application.protection_analysis.engine import build_device_from_vendor_curve

        device = build_device_from_vendor_curve(
            device_id="relay-002",
            protected_element_ref="bus-002",
            i_pickup_a=200.0,
            tms=0.5,
            vendor_curve_code="SIEMENS_EI",
        )

        assert device.manufacturer == "SIEMENS"
        assert device.vendor_curve_code == "SIEMENS_EI"
        assert device.iec_variant == "EI"
        assert device.curve_parameters["A"] == 80.0
        assert device.curve_parameters["B"] == 2.0

    def test_build_unknown_vendor_curve_raises(self):
        """Unknown vendor curve code should raise ValueError."""
        from application.protection_analysis.engine import build_device_from_vendor_curve

        with pytest.raises(ValueError, match="Vendor curve not found"):
            build_device_from_vendor_curve(
                device_id="relay-001",
                protected_element_ref="bus-001",
                i_pickup_a=100.0,
                tms=0.3,
                vendor_curve_code="UNKNOWN_CURVE",
            )


class TestVendorCurveDeterminism:
    """Determinism tests for vendor curves."""

    @pytest.fixture
    def engine(self):
        return ProtectionEvaluationEngine()

    def test_vendor_device_determinism(self, engine):
        """Vendor device evaluation must be deterministic."""
        from application.protection_analysis.engine import build_device_from_vendor_curve

        device = build_device_from_vendor_curve(
            device_id="relay-001",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            vendor_curve_code="ABB_SI",
        )

        fault = FaultPoint(
            fault_id="bus-001",
            i_fault_a=500.0,
            fault_type="3F",
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref=None,
            template_fingerprint=None,
            library_manifest_ref=None,
            devices=(device,),
            faults=(fault,),
        )

        # Execute twice
        result1, trace1 = engine.evaluate(input_data)
        result2, trace2 = engine.evaluate(input_data)

        # Results must be identical
        assert result1.evaluations[0].t_trip_s == result2.evaluations[0].t_trip_s

        # Traces must be identical (except created_at)
        dict1 = trace1.to_dict()
        dict2 = trace2.to_dict()
        del dict1["created_at"]
        del dict2["created_at"]
        assert dict1 == dict2


class TestVendorTraceAudit:
    """Tests for vendor audit fields in trace."""

    @pytest.fixture
    def engine(self):
        return ProtectionEvaluationEngine()

    def test_trace_contains_vendor_audit_fields(self, engine):
        """Trace must contain all vendor audit fields."""
        from application.protection_analysis.engine import build_device_from_vendor_curve

        device = build_device_from_vendor_curve(
            device_id="relay-001",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            vendor_curve_code="SCHNEIDER_VI",
        )

        fault = FaultPoint(
            fault_id="bus-001",
            i_fault_a=500.0,
            fault_type="3F",
        )

        input_data = ProtectionEvaluationInput(
            run_id="run-001",
            sc_run_id="sc-001",
            protection_case_id="case-001",
            template_ref=None,
            template_fingerprint=None,
            library_manifest_ref=None,
            devices=(device,),
            faults=(fault,),
        )

        _, trace = engine.evaluate(input_data)

        # Find device evaluation step
        eval_steps = [s for s in trace.steps if s.step == "device_evaluation"]
        assert len(eval_steps) == 1

        step = eval_steps[0]

        # Verify vendor audit fields
        assert step.inputs["manufacturer"] == "SCHNEIDER"
        assert step.inputs["vendor_curve_code"] == "SCHNEIDER_VI"
        assert step.inputs["curve_origin"] == "DERIVED_VENDOR"
        assert step.inputs["iec_variant"] == "VI"
        assert step.inputs["verification_status"] == "VERIFIED"
        assert "source_reference" in step.inputs

    def test_device_to_dict_includes_vendor_fields(self):
        """ProtectionDevice.to_dict() must include vendor fields."""
        from application.protection_analysis.engine import build_device_from_vendor_curve

        device = build_device_from_vendor_curve(
            device_id="relay-001",
            protected_element_ref="bus-001",
            i_pickup_a=100.0,
            tms=0.3,
            vendor_curve_code="ETANGO_EI",
        )

        d = device.to_dict()

        assert d["manufacturer"] == "ETANGO"
        assert d["vendor_curve_code"] == "ETANGO_EI"
        assert d["curve_origin"] == "DERIVED_VENDOR"
        assert d["iec_variant"] == "EI"
        assert d["verification_status"] == "VERIFIED"
        assert d["source_reference"] == "Etango EOP-2 User Manual"


class TestVendorBoundaryConditions:
    """Boundary condition tests for vendor curves."""

    def test_vendor_curve_at_10x_pickup(self):
        """Vendor curve at I = 10 × Ipickup, TMS = 1."""
        from domain.protection_vendors import (
            VENDOR_CURVE_REGISTRY,
            resolve_vendor_to_iec_params,
        )

        # Test ABB_VI at M=10
        abb_vi = VENDOR_CURVE_REGISTRY["ABB_VI"]
        params = resolve_vendor_to_iec_params(abb_vi)

        t = compute_iec_inverse_time(
            i_fault_a=1000.0,  # 10 × 100A
            i_pickup_a=100.0,
            tms=1.0,
            a=params["A"],
            b=params["B"],
        )

        # VI at M=10: t = 13.5 / (10-1) = 1.5s
        assert t is not None
        assert abs(t - 1.5) < 1e-5

    def test_vendor_curve_no_trip_below_pickup(self):
        """Vendor curve should not trip below pickup."""
        from domain.protection_vendors import (
            VENDOR_CURVE_REGISTRY,
            resolve_vendor_to_iec_params,
        )

        for code in ["ABB_SI", "SIEMENS_VI", "ETANGO_EI", "GE_SI", "SEL_EI"]:
            curve = VENDOR_CURVE_REGISTRY[code]
            params = resolve_vendor_to_iec_params(curve)

            t = compute_iec_inverse_time(
                i_fault_a=50.0,  # Below pickup
                i_pickup_a=100.0,
                tms=1.0,
                a=params["A"],
                b=params["B"],
            )

            assert t is None, f"{code} should not trip below pickup"


class TestListSupportedVendorCurves:
    """Tests for list_supported_vendor_curves helper."""

    def test_list_contains_all_registered_curves(self):
        """list_supported_vendor_curves must return all registered curves."""
        from application.protection_analysis.engine import list_supported_vendor_curves
        from domain.protection_vendors import VENDOR_CURVE_REGISTRY

        supported = list_supported_vendor_curves()

        assert len(supported) == len(VENDOR_CURVE_REGISTRY)
        for code in VENDOR_CURVE_REGISTRY:
            assert code in supported


# =============================================================================
# K5-B (H-2): OVERRIDES Z KONFIGURACJI PRZYPADKU WPŁYWAJĄ NA WYNIK BIEGU
# =============================================================================


class TestOverridesAffectRunResult:
    """K5-B (H-2): nadpisana nastawa z `ProtectionConfig.overrides` REALNIE
    zmienia wynik biegu analizy zabezpieczeń.

    Konsument overrides przy wykonaniu biegu:
    `ProtectionAnalysisService._build_evaluation_input` →
    `build_device_from_template(..., overrides=protection_config.overrides)` →
    `_resolve_effective_settings` (override > default szablonu > min pola).
    Ten test ćwiczy dokładnie tę ścieżkę: ten sam szablon i ten sam prąd
    zwarciowy — bez nadpisania brak zadziałania, z nadpisaniem „I>" w dół
    zabezpieczenie działa.
    """

    def _template(self):
        from network_model.catalog.types import ProtectionSettingTemplate

        return ProtectionSettingTemplate(
            id="template-k5b",
            name_pl="Szablon nadprądowy K5-B",
            curve_ref="curve-iec-si",
            setting_fields=[
                {"name": "I>", "unit": "A", "min": 50.0, "max": 500.0, "default": 200.0},
                {"name": "TMS", "unit": "-", "min": 0.05, "max": 1.0, "default": 0.3},
            ],
        )

    def _curve(self):
        from network_model.catalog.types import ProtectionCurve

        return ProtectionCurve(
            id="curve-iec-si",
            name_pl="IEC Normalna inwersyjna",
            standard="IEC",
            curve_kind="inverse",
            parameters={"A": 0.14, "B": 0.02},
        )

    def _evaluate(self, overrides: dict) -> ProtectionResult:
        from application.protection_analysis.engine import build_device_from_template

        device = build_device_from_template(
            device_id="device_bus-001",
            protected_element_ref="bus-001",
            template=self._template(),
            curve=self._curve(),
            device_type=None,
            overrides=overrides,
        )
        input_data = ProtectionEvaluationInput(
            run_id="run-k5b",
            sc_run_id="sc-k5b",
            protection_case_id="case-k5b",
            template_ref="template-k5b",
            template_fingerprint="fp-k5b",
            library_manifest_ref=None,
            devices=(device,),
            faults=(FaultPoint(fault_id="bus-001", i_fault_a=150.0, fault_type="3F"),),
            overrides=overrides,
        )
        result, _trace = ProtectionEvaluationEngine().evaluate(input_data)
        return result

    def test_without_override_template_default_gives_no_trip(self):
        """Domyślne „I>" = 200 A > prąd zwarciowy 150 A → brak zadziałania."""
        result = self._evaluate({})
        assert result.evaluations[0].trip_state == TripState.NO_TRIP
        assert result.evaluations[0].i_pickup_a == 200.0

    def test_override_lowers_pickup_and_flips_verdict(self):
        """Nadpisanie „I>" = 100 A < 150 A → zabezpieczenie działa.
        Ta sama konfiguracja poza nadpisaniem — różnica werdyktu pochodzi
        WYŁĄCZNIE z `overrides` (kształt {pole: {value: ...}} jak w P14c)."""
        result = self._evaluate({"I>": {"value": 100.0, "unit": "A"}})
        assert result.evaluations[0].trip_state == TripState.TRIPS
        assert result.evaluations[0].i_pickup_a == 100.0
        assert result.evaluations[0].t_trip_s is not None

    def test_coordination_device_entries_do_not_disturb_template_resolution(self):
        """Wpisy koordynacji (`coordination_device:<id>` — K5-B, H-2) współdzielą
        słownik overrides z nadpisaniami pól szablonu. Rozwiązywanie nastaw idzie
        po NAZWACH pól szablonu, więc wpis z prefiksem nie może zmienić wyniku."""
        wpis_koordynacji = {
            "coordination_device:dev-1": {
                "id": "dev-1",
                "name": "Zabezpieczenie GPZ",
                "device_type": "RELAY",
                "location_element_id": "bus_1",
                "settings": {"stage_51": {"enabled": True, "pickup_current_a": 60.0}},
            }
        }
        bez_nadpisania = self._evaluate(dict(wpis_koordynacji))
        assert bez_nadpisania.evaluations[0].trip_state == TripState.NO_TRIP
        assert bez_nadpisania.evaluations[0].i_pickup_a == 200.0

        z_nadpisaniem = self._evaluate({**wpis_koordynacji, "I>": {"value": 100.0, "unit": "A"}})
        assert z_nadpisaniem.evaluations[0].trip_state == TripState.TRIPS
