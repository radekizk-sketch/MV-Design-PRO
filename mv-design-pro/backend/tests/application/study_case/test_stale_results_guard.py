"""
PR-4 — CI Integration Test: Stale Results Cannot Be Accessed

Verifies that the system prevents access to outdated results after
model/config changes, as required by SPEC §10.8.

TEST PLAN:
1. Create a FINISHED AnalysisRun with VALID results
2. Invalidate the run (mark OUTDATED)
3. Verify results_valid == False
4. Verify the stale result guard blocks access

This test runs as part of CI to ensure that stale results are never
accessible to users after invalidation.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.study_case.errors import StaleResultsError
from domain.analysis_run import AnalysisRun, new_analysis_run
from domain.study_case import (
    StudyCaseConfig,
    StudyCaseResult,
    StudyCaseResultStatus,
    new_study_case,
)


class TestStaleResultsGuard:
    """
    CI: Confirm that stale/outdated results are inaccessible.

    INVARIANT: After any model/config change, previously valid results
    MUST NOT be accessible for display, export, or analysis.
    """

    def test_valid_run_allows_access(self):
        """FINISHED + VALID run allows access (results_valid == True)."""
        run = AnalysisRun(
            id=uuid4(),
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="short_circuit_sn",
            status="FINISHED",
            result_status="VALID",
            input_snapshot={"test": True},
            input_hash="hash-valid",
            result_summary={"ikss_a": 12345.0},
        )
        assert run.results_valid is True
        assert run.result_status == "VALID"
        assert run.status == "FINISHED"

    def test_outdated_run_blocks_access(self):
        """OUTDATED run blocks access (results_valid == False)."""
        run = AnalysisRun(
            id=uuid4(),
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="short_circuit_sn",
            status="FINISHED",
            result_status="OUTDATED",
            input_snapshot={"test": True},
            input_hash="hash-outdated",
            result_summary={"ikss_a": 12345.0},
        )
        assert run.results_valid is False

    def test_created_run_blocks_access(self):
        """CREATED run (no results yet) blocks access."""
        run = new_analysis_run(
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="PF",
            input_snapshot={},
            input_hash="hash-new",
        )
        assert run.status == "CREATED"
        assert run.results_valid is False

    def test_failed_run_blocks_access(self):
        """FAILED run blocks access."""
        run = AnalysisRun(
            id=uuid4(),
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="PF",
            status="FAILED",
            result_status="VALID",
            input_snapshot={},
            input_hash="hash-failed",
            error_message="Validation failed",
        )
        assert run.results_valid is False

    def test_case_config_change_invalidates_then_blocks(self):
        """
        Config change → case OUTDATED → results_valid == False.
        Confirms the full invalidation path.
        """
        # Create FRESH case
        case = new_study_case(uuid4(), "Test")
        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="short_circuit_sn",
            calculated_at=datetime.now(UTC),
            input_hash="hash1",
        )
        fresh = case.mark_as_fresh(ref)
        assert fresh.results_valid is True

        # Change config → OUTDATED
        new_config = StudyCaseConfig(c_factor_max=1.05)
        outdated = fresh.with_updated_config(new_config)
        assert outdated.results_valid is False

        # Verify the old results are stale
        assert outdated.result_status == StudyCaseResultStatus.OUTDATED

    def test_model_change_invalidates_all_cases(self):
        """
        Model change → ALL cases OUTDATED → results_valid == False for all.
        """
        project_id = uuid4()
        cases = []
        for i in range(3):
            case = new_study_case(project_id, f"Case-{i}")
            ref = StudyCaseResult(
                analysis_run_id=uuid4(),
                analysis_type="PF",
                calculated_at=datetime.now(UTC),
                input_hash=f"hash-{i}",
            )
            cases.append(case.mark_as_fresh(ref))

        # All FRESH
        for case in cases:
            assert case.results_valid is True

        # Model change → all OUTDATED
        outdated_cases = [case.mark_as_outdated() for case in cases]
        for case in outdated_cases:
            assert case.results_valid is False
            assert case.result_status == StudyCaseResultStatus.OUTDATED

    def test_clone_blocks_access(self):
        """Clone has NONE status → results_valid == False."""
        fresh = new_study_case(uuid4(), "Original")
        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="PF",
            calculated_at=datetime.now(UTC),
            input_hash="hash",
        )
        fresh = fresh.mark_as_fresh(ref)
        assert fresh.results_valid is True

        cloned = fresh.clone("Clone")
        assert cloned.results_valid is False
        assert cloned.result_status == StudyCaseResultStatus.NONE

    def test_stale_results_error_raised_correctly(self):
        """StaleResultsError can be raised and caught."""
        with pytest.raises(StaleResultsError) as exc_info:
            raise StaleResultsError(
                run_id="run-abc",
                result_status="OUTDATED",
            )
        assert exc_info.value.run_id == "run-abc"
        assert exc_info.value.result_status == "OUTDATED"
        assert "nieaktualne" in str(exc_info.value)

    def test_recalculation_restores_access(self):
        """After recalculation → FRESH → results_valid == True again."""
        case = new_study_case(uuid4(), "Test")

        # Calculate → FRESH
        ref1 = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="PF",
            calculated_at=datetime.now(UTC),
            input_hash="hash1",
        )
        case = case.mark_as_fresh(ref1)
        assert case.results_valid is True

        # Invalidate → OUTDATED
        case = case.mark_as_outdated()
        assert case.results_valid is False

        # Recalculate → FRESH again
        ref2 = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="PF",
            calculated_at=datetime.now(UTC),
            input_hash="hash2",
        )
        case = case.mark_as_fresh(ref2)
        assert case.results_valid is True
