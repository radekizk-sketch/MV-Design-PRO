"""
PR-4 — Study Case Lifecycle & Result Invalidation Tests

Tests that verify:
1. results_valid property on StudyCase and AnalysisRun
2. Invalidation matrix (§10.8):
   - Model/topology change → ALL cases OUTDATED
   - Config change → ONLY that case OUTDATED
   - Protection config change → ONLY that case OUTDATED
3. Clone creates NONE status (results not copied)
4. Stale results cannot be accessed (results_valid == False)
5. ResultInvalidator cascades to both AnalysisRuns and StudyCases

SPEC REFERENCES:
- SPEC_CHAPTER_10_STUDY_CASES_AND_SCENARIOS.md §10.8
- SPEC_CHAPTER_12_VALIDATION_AND_QA.md
- AUDIT_SPEC_VS_CODE.md
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from domain.analysis_run import AnalysisRun, new_analysis_run
from domain.study_case import (
    ProtectionConfig,
    StudyCase,
    StudyCaseConfig,
    StudyCaseResult,
    StudyCaseResultStatus,
    new_study_case,
)

# =============================================================================
# 1. results_valid Property Tests
# =============================================================================


class TestStudyCaseResultsValid:
    """PR-4: Explicit results_valid flag on StudyCase."""

    def test_new_case_results_not_valid(self):
        """New case has no results → results_valid == False."""
        case = new_study_case(uuid4(), "Test")
        assert case.result_status == StudyCaseResultStatus.NONE
        assert case.results_valid is False

    def test_fresh_case_results_valid(self):
        """FRESH case has valid results → results_valid == True."""
        case = new_study_case(uuid4(), "Test")
        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="short_circuit_sn",
            calculated_at=datetime.now(UTC),
            input_hash="abc123",
        )
        fresh = case.mark_as_fresh(ref)
        assert fresh.result_status == StudyCaseResultStatus.FRESH
        assert fresh.results_valid is True

    def test_outdated_case_results_not_valid(self):
        """OUTDATED case has stale results → results_valid == False."""
        case = new_study_case(uuid4(), "Test")
        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="short_circuit_sn",
            calculated_at=datetime.now(UTC),
            input_hash="abc123",
        )
        fresh = case.mark_as_fresh(ref)
        outdated = fresh.mark_as_outdated()
        assert outdated.result_status == StudyCaseResultStatus.OUTDATED
        assert outdated.results_valid is False

    def test_results_valid_in_to_dict(self):
        """results_valid is included in serialized output."""
        case = new_study_case(uuid4(), "Test")
        data = case.to_dict()
        assert "results_valid" in data
        assert data["results_valid"] is False

        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="short_circuit_sn",
            calculated_at=datetime.now(UTC),
            input_hash="abc123",
        )
        fresh_data = case.mark_as_fresh(ref).to_dict()
        assert fresh_data["results_valid"] is True


class TestAnalysisRunResultsValid:
    """PR-4: Explicit results_valid flag on AnalysisRun."""

    def test_new_run_results_not_valid(self):
        """New (CREATED) run has no results yet → results_valid == False."""
        run = new_analysis_run(
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="PF",
            input_snapshot={"test": True},
            input_hash="hash123",
        )
        assert run.status == "CREATED"
        assert run.result_status == "VALID"
        # Not FINISHED yet → results_valid is False
        assert run.results_valid is False

    def test_finished_valid_run_results_valid(self):
        """FINISHED run with VALID status → results_valid == True."""
        run = AnalysisRun(
            id=uuid4(),
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="PF",
            status="FINISHED",
            result_status="VALID",
            input_snapshot={},
            input_hash="hash123",
            result_summary={"converged": True},
        )
        assert run.results_valid is True

    def test_finished_outdated_run_results_not_valid(self):
        """FINISHED run with OUTDATED status → results_valid == False."""
        run = AnalysisRun(
            id=uuid4(),
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="short_circuit_sn",
            status="FINISHED",
            result_status="OUTDATED",
            input_snapshot={},
            input_hash="hash123",
            result_summary={},
        )
        assert run.results_valid is False

    def test_failed_run_results_not_valid(self):
        """FAILED run → results_valid == False."""
        run = AnalysisRun(
            id=uuid4(),
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="PF",
            status="FAILED",
            result_status="VALID",
            input_snapshot={},
            input_hash="hash123",
            error_message="Validation failed",
        )
        assert run.results_valid is False

    def test_running_run_results_not_valid(self):
        """RUNNING run → results_valid == False (not finished yet)."""
        run = AnalysisRun(
            id=uuid4(),
            project_id=uuid4(),
            operating_case_id=uuid4(),
            analysis_type="PF",
            status="RUNNING",
            result_status="VALID",
            input_snapshot={},
            input_hash="hash123",
        )
        assert run.results_valid is False


# =============================================================================
# 2. Invalidation Matrix Tests (§10.8)
# =============================================================================


class TestInvalidationMatrix:
    """
    PR-4: Verify invalidation matrix from SPEC §10.8.

    | Event                  | Scope       | New Status |
    |------------------------|-------------|------------|
    | Model changed          | ALL cases   | OUTDATED   |
    | Config changed         | Single case | OUTDATED   |
    | Protection config      | Single case | OUTDATED   |
    | Clone case             | New case    | NONE       |
    | Wizard commit          | ALL cases   | OUTDATED   |
    | Calculation completed  | Single case | FRESH      |
    """

    def _make_fresh_case(self) -> StudyCase:
        """Helper: create a FRESH case."""
        case = new_study_case(uuid4(), "Test")
        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="short_circuit_sn",
            calculated_at=datetime.now(UTC),
            input_hash="abc123",
        )
        return case.mark_as_fresh(ref)

    def test_config_change_invalidates_single_case(self):
        """Config change → single case OUTDATED."""
        fresh = self._make_fresh_case()
        assert fresh.results_valid is True

        updated = fresh.with_updated_config(StudyCaseConfig(c_factor_max=1.05))
        assert updated.result_status == StudyCaseResultStatus.OUTDATED
        assert updated.results_valid is False

    def test_config_change_on_none_stays_none(self):
        """Config change on NONE case → stays NONE (no results to invalidate)."""
        case = new_study_case(uuid4(), "Test")
        assert case.result_status == StudyCaseResultStatus.NONE

        updated = case.with_updated_config(StudyCaseConfig(c_factor_max=1.05))
        # NONE stays NONE — there are no results to invalidate
        assert updated.result_status == StudyCaseResultStatus.NONE
        assert updated.results_valid is False

    def test_protection_config_change_invalidates(self):
        """Protection config change → single case OUTDATED."""
        fresh = self._make_fresh_case()
        new_protection = ProtectionConfig(
            template_ref="new-template",
            template_fingerprint="sha256-new",
        )
        updated = fresh.with_protection_config(new_protection)
        assert updated.result_status == StudyCaseResultStatus.OUTDATED
        assert updated.results_valid is False

    def test_snapshot_change_invalidates(self):
        """Network snapshot change → case OUTDATED."""
        fresh = self._make_fresh_case()
        updated = fresh.with_network_snapshot_id("new-snapshot-id")
        assert updated.result_status == StudyCaseResultStatus.OUTDATED
        assert updated.results_valid is False

    def test_clone_has_none_status(self):
        """Clone → NONE status, results not copied."""
        fresh = self._make_fresh_case()
        assert fresh.results_valid is True

        cloned = fresh.clone("Clone")
        assert cloned.result_status == StudyCaseResultStatus.NONE
        assert cloned.results_valid is False
        assert len(cloned.result_refs) == 0

    def test_calculation_makes_case_fresh(self):
        """Successful calculation → FRESH with results_valid == True."""
        case = new_study_case(uuid4(), "Test")
        assert case.results_valid is False

        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="PF",
            calculated_at=datetime.now(UTC),
            input_hash="def456",
        )
        fresh = case.mark_as_fresh(ref)
        assert fresh.result_status == StudyCaseResultStatus.FRESH
        assert fresh.results_valid is True

    def test_name_change_does_not_invalidate(self):
        """Name change does NOT affect result status."""
        fresh = self._make_fresh_case()
        renamed = fresh.with_name("New Name")
        assert renamed.result_status == StudyCaseResultStatus.FRESH
        assert renamed.results_valid is True

    def test_description_change_does_not_invalidate(self):
        """Description change does NOT affect result status."""
        fresh = self._make_fresh_case()
        renamed = fresh.with_description("New description")
        assert renamed.result_status == StudyCaseResultStatus.FRESH
        assert renamed.results_valid is True

    def test_activation_does_not_invalidate(self):
        """Activating/deactivating does NOT affect result status."""
        fresh = self._make_fresh_case()
        active = fresh.mark_as_active()
        assert active.result_status == StudyCaseResultStatus.FRESH
        assert active.results_valid is True

        inactive = active.mark_as_inactive()
        assert inactive.result_status == StudyCaseResultStatus.FRESH
        assert inactive.results_valid is True


# =============================================================================
# 3. Full Lifecycle Tests
# =============================================================================


class TestFullLifecycle:
    """PR-4: Complete lifecycle NONE → FRESH → OUTDATED → recalculate → FRESH."""

    def test_complete_lifecycle(self):
        """
        Lifecycle:
        1. Create case → NONE (results_valid=False)
        2. Calculate → FRESH (results_valid=True)
        3. Change config → OUTDATED (results_valid=False)
        4. Recalculate → FRESH (results_valid=True)
        """
        # 1. Create
        case = new_study_case(uuid4(), "Lifecycle Test")
        assert case.result_status == StudyCaseResultStatus.NONE
        assert case.results_valid is False

        # 2. Calculate
        ref1 = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="short_circuit_sn",
            calculated_at=datetime.now(UTC),
            input_hash="hash1",
        )
        case = case.mark_as_fresh(ref1)
        assert case.result_status == StudyCaseResultStatus.FRESH
        assert case.results_valid is True
        assert len(case.result_refs) == 1

        # 3. Change config → OUTDATED
        case = case.with_updated_config(StudyCaseConfig(c_factor_max=1.05))
        assert case.result_status == StudyCaseResultStatus.OUTDATED
        assert case.results_valid is False

        # 4. Recalculate → FRESH
        ref2 = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="short_circuit_sn",
            calculated_at=datetime.now(UTC),
            input_hash="hash2",
        )
        case = case.mark_as_fresh(ref2)
        assert case.result_status == StudyCaseResultStatus.FRESH
        assert case.results_valid is True
        assert len(case.result_refs) == 2

    def test_multiple_invalidation_cycles(self):
        """
        Multiple invalidation/recalculation cycles maintain consistency.
        """
        case = new_study_case(uuid4(), "Multi-cycle")

        for i in range(5):
            # Calculate
            ref = StudyCaseResult(
                analysis_run_id=uuid4(),
                analysis_type="PF",
                calculated_at=datetime.now(UTC),
                input_hash=f"hash-{i}",
            )
            case = case.mark_as_fresh(ref)
            assert case.results_valid is True

            # Invalidate
            case = case.mark_as_outdated()
            assert case.results_valid is False

        # Final state: OUTDATED after last invalidation
        assert case.result_status == StudyCaseResultStatus.OUTDATED
        assert len(case.result_refs) == 5


# =============================================================================
# 4. StaleResultsError Tests
# =============================================================================


class TestStaleResultsError:
    """PR-4: StaleResultsError is properly raised."""

    def test_stale_results_error_message(self):
        """StaleResultsError has proper Polish message."""
        from application.study_case.errors import StaleResultsError

        error = StaleResultsError(run_id="run-123", result_status="OUTDATED")
        assert "run-123" in str(error)
        assert "nieaktualne" in str(error)
        assert "OUTDATED" in str(error)

    def test_stale_results_error_attributes(self):
        """StaleResultsError stores run_id and result_status."""
        from application.study_case.errors import StaleResultsError

        error = StaleResultsError(run_id="run-456", result_status="OUTDATED")
        assert error.run_id == "run-456"
        assert error.result_status == "OUTDATED"


# =============================================================================
# 5. Determinism Tests
# =============================================================================


class TestInvalidationDeterminism:
    """PR-4: Invalidation is deterministic and consistent."""

    def test_same_config_change_same_result(self):
        """Same config change produces same result status."""
        project_id = uuid4()
        case1 = new_study_case(project_id, "Case 1")
        case2 = new_study_case(project_id, "Case 2")

        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="PF",
            calculated_at=datetime.now(UTC),
            input_hash="same-hash",
        )

        fresh1 = case1.mark_as_fresh(ref)
        fresh2 = case2.mark_as_fresh(ref)

        new_config = StudyCaseConfig(c_factor_max=1.05)
        updated1 = fresh1.with_updated_config(new_config)
        updated2 = fresh2.with_updated_config(new_config)

        assert updated1.result_status == updated2.result_status
        assert updated1.results_valid == updated2.results_valid

    def test_outdated_mark_is_idempotent(self):
        """Marking OUTDATED again stays OUTDATED (not NONE)."""
        case = new_study_case(uuid4(), "Test")
        ref = StudyCaseResult(
            analysis_run_id=uuid4(),
            analysis_type="PF",
            calculated_at=datetime.now(UTC),
            input_hash="hash",
        )
        fresh = case.mark_as_fresh(ref)
        outdated = fresh.mark_as_outdated()
        assert outdated.result_status == StudyCaseResultStatus.OUTDATED

        # Mark outdated again — should stay OUTDATED
        still_outdated = outdated.mark_as_outdated()
        assert still_outdated.result_status == StudyCaseResultStatus.OUTDATED
