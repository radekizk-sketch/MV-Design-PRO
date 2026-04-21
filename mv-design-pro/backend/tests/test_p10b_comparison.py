"""
P10b Comparison Tests — Deterministic Case A/B Comparison

TESTS:
1. NumericDelta computation determinism
2. ComplexDelta computation determinism
3. ShortCircuitComparison construction
4. PowerFlowComparison construction
5. RunComparisonResult serialization
6. Comparison exceptions
7. Edge cases (zero values, identical values)
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from domain.results import (
    AnalysisTypeMismatchError,
    BusVoltageComparison,
    ComplexDelta,
    NumericDelta,
    PowerFlowComparison,
    ProjectMismatchError,
    ResultNotFoundError,
    RunComparisonResult,
    RunNotFoundError,
    RunResultState,
    ShortCircuitComparison,
)


class TestRunResultState:
    """Test RunResultState enum (P10b)."""

    def test_result_state_values(self):
        """RunResultState must have canonical values."""
        assert RunResultState.NONE.value == "NONE"
        assert RunResultState.FRESH.value == "FRESH"
        assert RunResultState.OUTDATED.value == "OUTDATED"

    def test_result_state_string_conversion(self):
        """RunResultState must be string-convertible."""
        assert str(RunResultState.NONE) == "RunResultState.NONE"
        assert RunResultState.FRESH == "FRESH"


class TestNumericDelta:
    """Test NumericDelta computation (P10b)."""

    def test_positive_delta(self):
        """Positive delta when B > A."""
        delta = NumericDelta.compute(100.0, 150.0)
        assert delta.value_a == 100.0
        assert delta.value_b == 150.0
        assert delta.delta == 50.0
        assert delta.percent == pytest.approx(50.0)
        assert delta.sign == 1

    def test_negative_delta(self):
        """Negative delta when B < A."""
        delta = NumericDelta.compute(100.0, 80.0)
        assert delta.delta == -20.0
        assert delta.percent == pytest.approx(-20.0)
        assert delta.sign == -1

    def test_zero_delta(self):
        """Zero delta when A == B."""
        delta = NumericDelta.compute(100.0, 100.0)
        assert delta.delta == 0.0
        assert delta.percent == pytest.approx(0.0)
        assert delta.sign == 0

    def test_percent_none_when_a_zero(self):
        """Percent should be None when A is zero."""
        delta = NumericDelta.compute(0.0, 50.0)
        assert delta.percent is None
        assert delta.sign == 1

    def test_determinism_same_inputs(self):
        """Same inputs must produce identical results."""
        delta1 = NumericDelta.compute(123.456, 789.012)
        delta2 = NumericDelta.compute(123.456, 789.012)
        assert delta1 == delta2

    def test_to_dict_serialization(self):
        """NumericDelta must serialize to dict."""
        delta = NumericDelta.compute(100.0, 150.0)
        d = delta.to_dict()
        assert d["value_a"] == 100.0
        assert d["value_b"] == 150.0
        assert d["delta"] == 50.0
        assert d["percent"] == pytest.approx(50.0)
        assert d["sign"] == 1


class TestComplexDelta:
    """Test ComplexDelta computation (P10b)."""

    def test_complex_delta_computation(self):
        """ComplexDelta should compute component-wise differences."""
        a = complex(3.0, 4.0)  # magnitude = 5
        b = complex(6.0, 8.0)  # magnitude = 10
        delta = ComplexDelta.compute(a, b)

        assert delta.re_a == 3.0
        assert delta.im_a == 4.0
        assert delta.re_b == 6.0
        assert delta.im_b == 8.0
        assert delta.delta_re == 3.0
        assert delta.delta_im == 4.0
        assert delta.magnitude_a == pytest.approx(5.0)
        assert delta.magnitude_b == pytest.approx(10.0)
        assert delta.delta_magnitude == pytest.approx(5.0)
        assert delta.percent_magnitude == pytest.approx(100.0)

    def test_complex_delta_zero_magnitude_a(self):
        """Percent should be None when magnitude A is zero."""
        a = complex(0.0, 0.0)
        b = complex(1.0, 1.0)
        delta = ComplexDelta.compute(a, b)
        assert delta.percent_magnitude is None

    def test_complex_delta_determinism(self):
        """Same complex inputs must produce identical results."""
        a = complex(1.234, 5.678)
        b = complex(9.012, 3.456)
        delta1 = ComplexDelta.compute(a, b)
        delta2 = ComplexDelta.compute(a, b)
        assert delta1 == delta2

    def test_to_dict_serialization(self):
        """ComplexDelta must serialize to dict."""
        delta = ComplexDelta.compute(complex(3.0, 4.0), complex(6.0, 8.0))
        d = delta.to_dict()
        assert "re_a" in d
        assert "im_a" in d
        assert "delta_magnitude" in d


class TestShortCircuitComparison:
    """Test ShortCircuitComparison construction (P10b)."""

    def test_construction_from_deltas(self):
        """ShortCircuitComparison should be constructable from deltas."""
        ikss = NumericDelta.compute(10000.0, 12000.0)
        sk = NumericDelta.compute(100.0, 120.0)
        zth = ComplexDelta.compute(complex(0.1, 0.5), complex(0.08, 0.4))
        ip = NumericDelta.compute(25000.0, 30000.0)
        ith = NumericDelta.compute(11000.0, 13200.0)

        comp = ShortCircuitComparison(
            ikss_delta=ikss,
            sk_delta=sk,
            zth_delta=zth,
            ip_delta=ip,
            ith_delta=ith,
        )

        assert comp.ikss_delta == ikss
        assert comp.sk_delta == sk
        assert comp.zth_delta == zth

    def test_to_dict_serialization(self):
        """ShortCircuitComparison must serialize to dict."""
        ikss = NumericDelta.compute(10000.0, 12000.0)
        sk = NumericDelta.compute(100.0, 120.0)
        zth = ComplexDelta.compute(complex(0.1, 0.5), complex(0.08, 0.4))
        ip = NumericDelta.compute(25000.0, 30000.0)
        ith = NumericDelta.compute(11000.0, 13200.0)

        comp = ShortCircuitComparison(
            ikss_delta=ikss,
            sk_delta=sk,
            zth_delta=zth,
            ip_delta=ip,
            ith_delta=ith,
        )

        d = comp.to_dict()
        assert "ikss_delta" in d
        assert "sk_delta" in d
        assert "zth_delta" in d
        assert "ip_delta" in d
        assert "ith_delta" in d


class TestPowerFlowComparison:
    """Test PowerFlowComparison construction (P10b)."""

    def test_construction_with_bus_voltages(self):
        """PowerFlowComparison should include per-bus voltages."""
        bus1 = BusVoltageComparison(
            bus_id="bus-1",
            u_kv_delta=NumericDelta.compute(20.0, 19.8),
            u_pu_delta=NumericDelta.compute(1.0, 0.99),
        )
        bus2 = BusVoltageComparison(
            bus_id="bus-2",
            u_kv_delta=NumericDelta.compute(20.0, 20.1),
            u_pu_delta=NumericDelta.compute(1.0, 1.005),
        )

        comp = PowerFlowComparison(
            total_losses_p_delta=NumericDelta.compute(0.01, 0.012),
            total_losses_q_delta=NumericDelta.compute(0.02, 0.025),
            slack_p_delta=NumericDelta.compute(1.0, 1.05),
            slack_q_delta=NumericDelta.compute(0.5, 0.55),
            node_voltages=(bus1, bus2),
            branch_powers=(),
        )

        assert len(comp.node_voltages) == 2
        assert comp.node_voltages[0].bus_id == "bus-1"

    def test_to_dict_serialization(self):
        """PowerFlowComparison must serialize to dict."""
        comp = PowerFlowComparison(
            total_losses_p_delta=NumericDelta.compute(0.01, 0.012),
            total_losses_q_delta=NumericDelta.compute(0.02, 0.025),
            slack_p_delta=NumericDelta.compute(1.0, 1.05),
            slack_q_delta=NumericDelta.compute(0.5, 0.55),
            node_voltages=(),
            branch_powers=(),
        )

        d = comp.to_dict()
        assert "total_losses_p_delta" in d
        assert "node_voltages" in d
        assert "branch_powers" in d


class TestRunComparisonResult:
    """Test RunComparisonResult construction (P10b)."""

    def test_construction_with_short_circuit(self):
        """RunComparisonResult should include short circuit comparison."""
        run_a_id = uuid4()
        run_b_id = uuid4()
        project_id = uuid4()

        sc_comp = ShortCircuitComparison(
            ikss_delta=NumericDelta.compute(10000.0, 12000.0),
            sk_delta=NumericDelta.compute(100.0, 120.0),
            zth_delta=ComplexDelta.compute(complex(0.1, 0.5), complex(0.08, 0.4)),
            ip_delta=NumericDelta.compute(25000.0, 30000.0),
            ith_delta=NumericDelta.compute(11000.0, 13200.0),
        )

        result = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=project_id,
            analysis_type="short_circuit",
            short_circuit=sc_comp,
        )

        assert result.run_a_id == run_a_id
        assert result.run_b_id == run_b_id
        assert result.project_id == project_id
        assert result.short_circuit is not None
        assert result.power_flow is None

    def test_to_dict_serialization(self):
        """RunComparisonResult must serialize to dict."""
        run_a_id = uuid4()
        run_b_id = uuid4()
        project_id = uuid4()

        result = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=project_id,
            analysis_type="short_circuit",
        )

        d = result.to_dict()
        assert d["run_a_id"] == str(run_a_id)
        assert d["run_b_id"] == str(run_b_id)
        assert d["project_id"] == str(project_id)
        assert d["analysis_type"] == "short_circuit"
        assert "compared_at" in d


class TestComparisonExceptions:
    """Test comparison exception classes (P10b)."""

    def test_project_mismatch_error(self):
        """ProjectMismatchError should contain both project IDs."""
        proj_a = uuid4()
        proj_b = uuid4()
        err = ProjectMismatchError(proj_a, proj_b)

        assert err.run_a_project == proj_a
        assert err.run_b_project == proj_b
        assert str(proj_a) in str(err)
        assert str(proj_b) in str(err)

    def test_analysis_type_mismatch_error(self):
        """AnalysisTypeMismatchError should contain both types."""
        err = AnalysisTypeMismatchError("short_circuit", "power_flow")

        assert err.type_a == "short_circuit"
        assert err.type_b == "power_flow"
        assert "short_circuit" in str(err)
        assert "power_flow" in str(err)

    def test_run_not_found_error(self):
        """RunNotFoundError should contain run ID."""
        run_id = uuid4()
        err = RunNotFoundError(run_id)

        assert err.run_id == run_id
        assert str(run_id) in str(err)

    def test_result_not_found_error(self):
        """ResultNotFoundError should contain run ID and result type."""
        run_id = uuid4()
        err = ResultNotFoundError(run_id, "short_circuit")

        assert err.run_id == run_id
        assert err.result_type == "short_circuit"


class TestDeterminismRequirements:
    """Test determinism requirements for comparison (P10b)."""

    def test_numeric_delta_deterministic_across_calls(self):
        """Multiple calls with same inputs must produce identical results."""
        results = [NumericDelta.compute(12345.6789, 98765.4321) for _ in range(10)]
        first = results[0]
        for r in results[1:]:
            assert r == first

    def test_complex_delta_deterministic_across_calls(self):
        """Multiple calls with same complex inputs must produce identical results."""
        a = complex(1.23456789, 9.87654321)
        b = complex(5.55555555, 4.44444444)
        results = [ComplexDelta.compute(a, b) for _ in range(10)]
        first = results[0]
        for r in results[1:]:
            assert r == first

    def test_comparison_result_deterministic_serialization(self):
        """Serialization must be deterministic."""
        run_a_id = uuid4()
        run_b_id = uuid4()
        project_id = uuid4()
        fixed_time = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        sc_comp = ShortCircuitComparison(
            ikss_delta=NumericDelta.compute(10000.0, 12000.0),
            sk_delta=NumericDelta.compute(100.0, 120.0),
            zth_delta=ComplexDelta.compute(complex(0.1, 0.5), complex(0.08, 0.4)),
            ip_delta=NumericDelta.compute(25000.0, 30000.0),
            ith_delta=NumericDelta.compute(11000.0, 13200.0),
        )

        result1 = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=project_id,
            analysis_type="short_circuit",
            compared_at=fixed_time,
            short_circuit=sc_comp,
        )
        result2 = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=project_id,
            analysis_type="short_circuit",
            compared_at=fixed_time,
            short_circuit=sc_comp,
        )

        assert result1.to_dict() == result2.to_dict()


class TestEdgeCases:
    """Test edge cases for comparison (P10b)."""

    def test_identical_values_zero_delta(self):
        """Identical values should produce zero delta."""
        delta = NumericDelta.compute(12345.6789, 12345.6789)
        assert delta.delta == 0.0
        assert delta.sign == 0

    def test_very_small_differences(self):
        """Very small differences should be handled correctly."""
        # Within default tolerance
        delta = NumericDelta.compute(1.0, 1.0 + 1e-10)
        assert delta.sign == 0  # Should be treated as zero

        # Outside default tolerance
        delta = NumericDelta.compute(1.0, 1.0 + 1e-8)
        assert delta.sign == 1  # Should be positive

    def test_negative_values(self):
        """Negative values should be handled correctly."""
        delta = NumericDelta.compute(-100.0, -50.0)
        assert delta.delta == 50.0
        assert delta.sign == 1  # -50 > -100

    def test_mixed_sign_values(self):
        """Mixed positive/negative values should be handled correctly."""
        delta = NumericDelta.compute(-100.0, 100.0)
        assert delta.delta == 200.0
        assert delta.sign == 1
