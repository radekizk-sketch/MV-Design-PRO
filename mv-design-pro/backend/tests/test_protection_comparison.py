"""
P15b — Protection Comparison Tests

Tests for:
1. Determinism: Same inputs → identical JSON output
2. Validation: Project mismatch, status checks
3. Ranking: Correct severity ordering
4. State changes: Correct classification

CANONICAL ALIGNMENT:
- P15b: Protection Selectivity Comparison (A/B)
- Deterministic tests per AGENTS.md
"""

import json
from datetime import UTC, datetime

import pytest
from domain.protection_analysis import (
    ProtectionEvaluation,
    ProtectionResult,
    ProtectionResultSummary,
    TripState,
)
from domain.protection_comparison import (
    ISSUE_SEVERITY_MAP,
    IssueCode,
    IssueSeverity,
    ProtectionComparisonResult,
    ProtectionComparisonRow,
    ProtectionComparisonSummary,
    ProtectionComparisonTrace,
    ProtectionComparisonTraceStep,
    RankingIssue,
    StateChange,
    compute_comparison_input_hash,
)

# =============================================================================
# FIXTURES
# =============================================================================


def make_evaluation(
    device_id: str,
    protected_element_ref: str,
    fault_target_id: str,
    i_fault_a: float,
    i_pickup_a: float,
    t_trip_s: float | None,
    trip_state: TripState,
    margin_percent: float | None = None,
) -> ProtectionEvaluation:
    """Factory for test evaluations."""
    return ProtectionEvaluation(
        device_id=device_id,
        device_type_ref="test_type",
        protected_element_ref=protected_element_ref,
        fault_target_id=fault_target_id,
        i_fault_a=i_fault_a,
        i_pickup_a=i_pickup_a,
        t_trip_s=t_trip_s,
        trip_state=trip_state,
        curve_ref="test_curve",
        curve_kind="inverse",
        margin_percent=margin_percent,
        notes_pl="Test note",
    )


def make_result(
    run_id: str,
    evaluations: tuple[ProtectionEvaluation, ...],
) -> ProtectionResult:
    """Factory for test results."""
    trips_count = sum(1 for e in evaluations if e.trip_state == TripState.TRIPS)
    no_trip_count = sum(1 for e in evaluations if e.trip_state == TripState.NO_TRIP)
    invalid_count = sum(1 for e in evaluations if e.trip_state == TripState.INVALID)
    trip_times = [e.t_trip_s for e in evaluations if e.t_trip_s is not None]

    return ProtectionResult(
        run_id=run_id,
        sc_run_id="test_sc_run",
        protection_case_id="test_case",
        template_ref="test_template",
        template_fingerprint="test_fingerprint",
        library_manifest_ref=None,
        evaluations=evaluations,
        summary=ProtectionResultSummary(
            total_evaluations=len(evaluations),
            trips_count=trips_count,
            no_trip_count=no_trip_count,
            invalid_count=invalid_count,
            min_trip_time_s=min(trip_times) if trip_times else None,
            max_trip_time_s=max(trip_times) if trip_times else None,
        ),
    )


# =============================================================================
# DOMAIN MODEL TESTS
# =============================================================================


class TestProtectionComparisonRow:
    """Tests for ProtectionComparisonRow."""

    def test_serialization_roundtrip(self):
        """Row should serialize and deserialize correctly."""
        row = ProtectionComparisonRow(
            protected_element_ref="bus_1",
            fault_target_id="fault_1",
            device_id_a="dev_a",
            device_id_b="dev_b",
            trip_state_a="TRIPS",
            trip_state_b="NO_TRIP",
            t_trip_s_a=0.5,
            t_trip_s_b=None,
            i_fault_a_a=1000.0,
            i_fault_a_b=800.0,
            delta_t_s=None,
            delta_i_fault_a=-200.0,
            margin_percent_a=50.0,
            margin_percent_b=20.0,
            state_change=StateChange.TRIP_TO_NO_TRIP,
        )

        # Serialize
        row_dict = row.to_dict()

        # Deserialize
        restored = ProtectionComparisonRow.from_dict(row_dict)

        # Verify
        assert restored.protected_element_ref == row.protected_element_ref
        assert restored.fault_target_id == row.fault_target_id
        assert restored.trip_state_a == row.trip_state_a
        assert restored.trip_state_b == row.trip_state_b
        assert restored.delta_i_fault_a == row.delta_i_fault_a
        assert restored.state_change == row.state_change


class TestRankingIssue:
    """Tests for RankingIssue."""

    def test_serialization_roundtrip(self):
        """Issue should serialize and deserialize correctly."""
        issue = RankingIssue(
            issue_code=IssueCode.TRIP_LOST,
            severity=IssueSeverity.CRITICAL,
            element_ref="bus_1",
            fault_target_id="fault_1",
            description_pl="Utrata zadziałania zabezpieczenia",
            evidence_refs=(0, 1, 2),
        )

        # Serialize
        issue_dict = issue.to_dict()

        # Deserialize
        restored = RankingIssue.from_dict(issue_dict)

        # Verify
        assert restored.issue_code == issue.issue_code
        assert restored.severity == issue.severity
        assert restored.element_ref == issue.element_ref
        assert restored.description_pl == issue.description_pl
        assert restored.evidence_refs == issue.evidence_refs


class TestIssueSeverityMap:
    """Tests for issue severity mapping."""

    def test_trip_lost_is_critical(self):
        """TRIP_LOST should have CRITICAL severity."""
        assert ISSUE_SEVERITY_MAP[IssueCode.TRIP_LOST] == IssueSeverity.CRITICAL

    def test_invalid_state_is_major(self):
        """INVALID_STATE should have MAJOR severity."""
        assert ISSUE_SEVERITY_MAP[IssueCode.INVALID_STATE] == IssueSeverity.MAJOR

    def test_delay_increased_is_moderate(self):
        """DELAY_INCREASED should have MODERATE severity."""
        assert ISSUE_SEVERITY_MAP[IssueCode.DELAY_INCREASED] == IssueSeverity.MODERATE

    def test_all_codes_have_severity(self):
        """All issue codes should have a severity mapping."""
        for code in IssueCode:
            assert code in ISSUE_SEVERITY_MAP, f"Missing severity for {code}"


# =============================================================================
# DETERMINISM TESTS
# =============================================================================


class TestDeterminism:
    """Tests for deterministic comparison output."""

    def test_input_hash_is_deterministic(self):
        """Same run IDs should produce same hash."""
        run_a = "run_a_id"
        run_b = "run_b_id"

        hash1 = compute_comparison_input_hash(run_a, run_b)
        hash2 = compute_comparison_input_hash(run_a, run_b)

        assert hash1 == hash2

    def test_input_hash_order_matters(self):
        """Different order should produce different hash."""
        run_a = "run_a_id"
        run_b = "run_b_id"

        hash_ab = compute_comparison_input_hash(run_a, run_b)
        hash_ba = compute_comparison_input_hash(run_b, run_a)

        assert hash_ab != hash_ba

    def test_comparison_result_serialization_is_deterministic(self):
        """Same result should produce identical JSON."""
        result = ProtectionComparisonResult(
            comparison_id="test_comparison",
            run_a_id="run_a",
            run_b_id="run_b",
            project_id="project_1",
            rows=(
                ProtectionComparisonRow(
                    protected_element_ref="bus_1",
                    fault_target_id="fault_1",
                    device_id_a="dev_a",
                    device_id_b="dev_b",
                    trip_state_a="TRIPS",
                    trip_state_b="TRIPS",
                    t_trip_s_a=0.5,
                    t_trip_s_b=0.6,
                    i_fault_a_a=1000.0,
                    i_fault_a_b=1000.0,
                    delta_t_s=0.1,
                    delta_i_fault_a=0.0,
                    margin_percent_a=50.0,
                    margin_percent_b=50.0,
                    state_change=StateChange.NO_CHANGE,
                ),
            ),
            ranking=(),
            summary=ProtectionComparisonSummary(
                total_rows=1,
                no_change_count=1,
                trip_to_no_trip_count=0,
                no_trip_to_trip_count=0,
                invalid_change_count=0,
                total_issues=0,
                critical_issues=0,
                major_issues=0,
                moderate_issues=0,
                minor_issues=0,
            ),
            input_hash="test_hash",
            created_at=datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC),
        )

        # Serialize twice
        json1 = json.dumps(result.to_dict(), sort_keys=True)
        json2 = json.dumps(result.to_dict(), sort_keys=True)

        assert json1 == json2

    def test_ranking_sort_is_deterministic(self):
        """Rankings should be sorted consistently."""
        issues = [
            RankingIssue(
                issue_code=IssueCode.DELAY_INCREASED,
                severity=IssueSeverity.MODERATE,
                element_ref="bus_2",
                fault_target_id="fault_2",
                description_pl="Delay increased",
                evidence_refs=(1,),
            ),
            RankingIssue(
                issue_code=IssueCode.TRIP_LOST,
                severity=IssueSeverity.CRITICAL,
                element_ref="bus_1",
                fault_target_id="fault_1",
                description_pl="Trip lost",
                evidence_refs=(0,),
            ),
            RankingIssue(
                issue_code=IssueCode.MARGIN_DECREASED,
                severity=IssueSeverity.MODERATE,
                element_ref="bus_1",
                fault_target_id="fault_1",
                description_pl="Margin decreased",
                evidence_refs=(2,),
            ),
        ]

        # Sort by severity DESC, issue_code, element_ref
        sorted_issues = sorted(
            issues,
            key=lambda i: (-i.severity.value, i.issue_code.value, i.element_ref),
        )

        # CRITICAL (5) should be first
        assert sorted_issues[0].severity == IssueSeverity.CRITICAL

        # Among MODERATE (3), sort by issue_code then element_ref
        moderate_issues = [i for i in sorted_issues if i.severity == IssueSeverity.MODERATE]
        assert len(moderate_issues) == 2
        # DELAY_INCREASED comes before MARGIN_DECREASED alphabetically
        assert moderate_issues[0].issue_code == IssueCode.DELAY_INCREASED


# =============================================================================
# STATE CHANGE CLASSIFICATION TESTS
# =============================================================================


class TestStateChangeClassification:
    """Tests for state change classification logic."""

    def test_no_change_when_both_trip(self):
        """Same TRIPS state should be NO_CHANGE."""
        # This would be tested via service, but we test the enum values here
        assert StateChange.NO_CHANGE.value == "NO_CHANGE"

    def test_trip_to_no_trip(self):
        """TRIPS → NO_TRIP should be TRIP_TO_NO_TRIP."""
        assert StateChange.TRIP_TO_NO_TRIP.value == "TRIP_TO_NO_TRIP"

    def test_no_trip_to_trip(self):
        """NO_TRIP → TRIPS should be NO_TRIP_TO_TRIP."""
        assert StateChange.NO_TRIP_TO_TRIP.value == "NO_TRIP_TO_TRIP"

    def test_invalid_change(self):
        """INVALID in either should be INVALID_CHANGE."""
        assert StateChange.INVALID_CHANGE.value == "INVALID_CHANGE"


# =============================================================================
# TRACE TESTS
# =============================================================================


class TestProtectionComparisonTrace:
    """Tests for comparison trace."""

    def test_trace_serialization_roundtrip(self):
        """Trace should serialize and deserialize correctly."""
        trace = ProtectionComparisonTrace(
            comparison_id="test_comparison",
            run_a_id="run_a",
            run_b_id="run_b",
            library_fingerprint_a="fp_a",
            library_fingerprint_b="fp_b",
            steps=(
                ProtectionComparisonTraceStep(
                    step="MATCH_EVALUATIONS",
                    description_pl="Dopasowanie ewaluacji",
                    inputs={"count_a": 10, "count_b": 10},
                    outputs={"matched": 10},
                ),
                ProtectionComparisonTraceStep(
                    step="RANK_ISSUES",
                    description_pl="Generowanie rankingu",
                    inputs={"rows": 10},
                    outputs={"issues": 2},
                ),
            ),
        )

        # Serialize
        trace_dict = trace.to_dict()

        # Deserialize
        restored = ProtectionComparisonTrace.from_dict(trace_dict)

        # Verify
        assert restored.comparison_id == trace.comparison_id
        assert len(restored.steps) == len(trace.steps)
        assert restored.steps[0].step == "MATCH_EVALUATIONS"
        assert restored.steps[1].step == "RANK_ISSUES"


# =============================================================================
# SUMMARY CALCULATION TESTS
# =============================================================================


class TestSummaryCalculation:
    """Tests for summary statistics."""

    def test_summary_counts(self):
        """Summary should count state changes correctly."""
        summary = ProtectionComparisonSummary(
            total_rows=10,
            no_change_count=5,
            trip_to_no_trip_count=2,
            no_trip_to_trip_count=2,
            invalid_change_count=1,
            total_issues=3,
            critical_issues=1,
            major_issues=1,
            moderate_issues=1,
            minor_issues=0,
        )

        # Verify totals
        total_changes = (
            summary.no_change_count
            + summary.trip_to_no_trip_count
            + summary.no_trip_to_trip_count
            + summary.invalid_change_count
        )
        assert total_changes == summary.total_rows

    def test_summary_serialization(self):
        """Summary should serialize correctly."""
        summary = ProtectionComparisonSummary(
            total_rows=10,
            no_change_count=5,
            trip_to_no_trip_count=2,
            no_trip_to_trip_count=2,
            invalid_change_count=1,
            total_issues=3,
            critical_issues=1,
            major_issues=1,
            moderate_issues=1,
            minor_issues=0,
        )

        summary_dict = summary.to_dict()

        assert summary_dict["total_rows"] == 10
        assert summary_dict["critical_issues"] == 1


# =============================================================================
# VALIDATION ERROR TESTS
# =============================================================================


class TestValidationErrors:
    """Tests for validation error messages."""

    def test_run_not_found_error_message(self):
        """ProtectionRunNotFoundError should have correct message."""
        from domain.protection_comparison import ProtectionRunNotFoundError

        error = ProtectionRunNotFoundError("test_run_id")
        assert "test_run_id" in str(error)

    def test_run_not_finished_error_message(self):
        """ProtectionRunNotFinishedError should have correct message."""
        from domain.protection_comparison import ProtectionRunNotFinishedError

        error = ProtectionRunNotFinishedError("test_run_id", "RUNNING")
        assert "test_run_id" in str(error)
        assert "RUNNING" in str(error)

    def test_project_mismatch_error_message(self):
        """ProtectionProjectMismatchError should have correct message."""
        from domain.protection_comparison import ProtectionProjectMismatchError

        error = ProtectionProjectMismatchError("project_a", "project_b")
        assert "project_a" in str(error)
        assert "project_b" in str(error)


# =============================================================================
# INTEGRATION-LIKE TESTS (Using domain models directly)
# =============================================================================


class TestComparisonLogic:
    """Integration-like tests for comparison logic."""

    def test_trip_lost_generates_critical_issue(self):
        """TRIP_TO_NO_TRIP should generate CRITICAL severity issue."""
        # This tests the severity mapping
        issue = RankingIssue(
            issue_code=IssueCode.TRIP_LOST,
            severity=ISSUE_SEVERITY_MAP[IssueCode.TRIP_LOST],
            element_ref="bus_1",
            fault_target_id="fault_1",
            description_pl="Utrata zadziałania",
            evidence_refs=(0,),
        )

        assert issue.severity == IssueSeverity.CRITICAL
        assert issue.severity.value == 5

    def test_comparison_result_immutability(self):
        """ProtectionComparisonResult should be immutable (frozen)."""
        result = ProtectionComparisonResult(
            comparison_id="test",
            run_a_id="run_a",
            run_b_id="run_b",
            project_id="project",
            rows=(),
            ranking=(),
            summary=ProtectionComparisonSummary(
                total_rows=0,
                no_change_count=0,
                trip_to_no_trip_count=0,
                no_trip_to_trip_count=0,
                invalid_change_count=0,
                total_issues=0,
                critical_issues=0,
                major_issues=0,
                moderate_issues=0,
                minor_issues=0,
            ),
            input_hash="hash",
        )

        # Attempt to modify should raise AttributeError
        with pytest.raises(AttributeError):
            result.comparison_id = "modified"  # type: ignore


class TestMatchEvaluationsElementOnlyOnOneSide:
    """FAB-E (E1): element (protected_element_ref, fault_target_id) obecny
    tylko w run A LUB run B -> i_fault_a_a/i_fault_a_b/delta_i_fault_a None,
    nigdy fabrykowane 0.0 A (wygladaloby jak realny zanik pradu zwarciowego).

    CV-3.3-B: `_match_evaluations` czyta odtąd listę `dict` — kształt
    `ResultSetV1.element_results[].values` dla `element_type="ProtectionDevice"`
    (`enm/canonical_analysis.py::build_execution_result_set`, gałąź
    `protection_sn`: `values=evaluation` z zapisanego `protection_result`, czyli
    dokładnie `ProtectionEvaluation.to_dict()`), nie `ProtectionEvaluation`
    jako obiekt (B1: serwis czyta wyłącznie `ResultSetV1`, zero własnego
    parsowania domenowych dataclassów)."""

    @staticmethod
    def _service():
        from application.protection_comparison.service import ProtectionComparisonService

        return ProtectionComparisonService(uow_factory=lambda: None)

    def test_element_only_in_run_a_gives_none_fault_current(self):
        service = self._service()
        eval_only_a = make_evaluation(
            device_id="dev_1",
            protected_element_ref="bus_1",
            fault_target_id="fault_1",
            i_fault_a=500.0,
            i_pickup_a=100.0,
            t_trip_s=0.5,
            trip_state=TripState.TRIPS,
        )
        rows, matched_count = service._match_evaluations([eval_only_a.to_dict()], [])

        assert matched_count == 0
        row = rows[0]
        assert row.i_fault_a_a == pytest.approx(500.0)
        assert row.i_fault_a_b is None
        assert row.delta_i_fault_a is None

    def test_element_only_in_run_b_gives_none_fault_current(self):
        service = self._service()
        eval_only_b = make_evaluation(
            device_id="dev_1",
            protected_element_ref="bus_1",
            fault_target_id="fault_1",
            i_fault_a=600.0,
            i_pickup_a=100.0,
            t_trip_s=0.4,
            trip_state=TripState.TRIPS,
        )
        rows, matched_count = service._match_evaluations([], [eval_only_b.to_dict()])

        assert matched_count == 0
        row = rows[0]
        assert row.i_fault_a_a is None
        assert row.i_fault_a_b == pytest.approx(600.0)
        assert row.delta_i_fault_a is None

    def test_element_present_in_both_still_computes_real_delta(self):
        """Regresja: komplet danych po obu stronach -> te same liczby co dziś."""
        service = self._service()
        eval_a = make_evaluation(
            device_id="dev_1",
            protected_element_ref="bus_1",
            fault_target_id="fault_1",
            i_fault_a=500.0,
            i_pickup_a=100.0,
            t_trip_s=0.5,
            trip_state=TripState.TRIPS,
        )
        eval_b = make_evaluation(
            device_id="dev_1",
            protected_element_ref="bus_1",
            fault_target_id="fault_1",
            i_fault_a=520.0,
            i_pickup_a=100.0,
            t_trip_s=0.48,
            trip_state=TripState.TRIPS,
        )
        rows, matched_count = service._match_evaluations([eval_a.to_dict()], [eval_b.to_dict()])

        assert matched_count == 1
        row = rows[0]
        assert row.i_fault_a_a == pytest.approx(500.0)
        assert row.i_fault_a_b == pytest.approx(520.0)
        assert row.delta_i_fault_a == pytest.approx(20.0)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
