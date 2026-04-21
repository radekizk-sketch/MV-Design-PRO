"""
Protection Comparison Service — P15b SELECTIVITY (A/B)

Orchestrates protection comparison:
1. VALIDATE: Both runs FINISHED, same project
2. FETCH: Get ProtectionResult for each run
3. COMPARE: Match by (protected_element_ref, fault_target_id)
4. RANK: Generate deterministic issue ranking
5. TRACE: Record all steps for audit

INVARIANTS (BINDING):
1. READ-ONLY: Zero physics calculations, zero state mutations
2. SAME PROJECT: Both runs must belong to the same project
3. FINISHED ONLY: Both runs must be FINISHED status
4. DETERMINISTIC: Same inputs → identical outputs
5. NO NORMATIVE INTERPRETATION: Only factual comparison (no IEC 60255 selectivity)
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from domain.protection_analysis import (
    ProtectionAnalysisRun,
    ProtectionEvaluation,
    ProtectionResult,
    ProtectionRunStatus,
    TripState,
)
from domain.protection_comparison import (
    ISSUE_DESCRIPTIONS_PL,
    ISSUE_SEVERITY_MAP,
    IssueCode,
    IssueSeverity,
    ProtectionComparison,
    ProtectionComparisonNotFoundError,
    ProtectionComparisonResult,
    ProtectionComparisonRow,
    ProtectionComparisonStatus,
    ProtectionComparisonSummary,
    ProtectionComparisonTrace,
    ProtectionComparisonTraceStep,
    ProtectionProjectMismatchError,
    ProtectionResultNotFoundError,
    ProtectionRunNotFinishedError,
    ProtectionRunNotFoundError,
    RankingIssue,
    StateChange,
    compute_comparison_input_hash,
)
from infrastructure.persistence.unit_of_work import UnitOfWork

# =============================================================================
# THRESHOLDS FOR ISSUE DETECTION
# =============================================================================

# Time difference threshold for significant delay change [s]
DELAY_CHANGE_THRESHOLD_S = 0.05  # 50ms

# Margin difference threshold for significant margin change [%]
MARGIN_CHANGE_THRESHOLD_PERCENT = 5.0


# =============================================================================
# PROTECTION COMPARISON SERVICE
# =============================================================================


class ProtectionComparisonService:
    """
    Service for comparing two protection analysis runs.

    P15b: Main entry point for protection selectivity comparison.

    USAGE:
        service = ProtectionComparisonService(uow_factory)
        result = service.compare(run_a_id, run_b_id)
    """

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def compare(
        self,
        run_a_id: str,
        run_b_id: str,
    ) -> ProtectionComparisonResult:
        """
        Compare two protection analysis runs.

        Args:
            run_a_id: First protection run ID (baseline)
            run_b_id: Second protection run ID (comparison)

        Returns:
            ProtectionComparisonResult with rows, ranking, and trace

        Raises:
            ProtectionRunNotFoundError: If a run doesn't exist
            ProtectionRunNotFinishedError: If a run is not FINISHED
            ProtectionProjectMismatchError: If runs belong to different projects
            ProtectionResultNotFoundError: If results not found for a run
        """
        with self._uow_factory() as uow:
            # 1. Fetch and validate both runs
            run_a = self._get_protection_run(uow, run_a_id)
            run_b = self._get_protection_run(uow, run_b_id)

            self._validate_run_status(run_a, run_a_id)
            self._validate_run_status(run_b, run_b_id)

            # 2. Validate same project
            if str(run_a.project_id) != str(run_b.project_id):
                raise ProtectionProjectMismatchError(
                    str(run_a.project_id),
                    str(run_b.project_id),
                )

            # 3. Check cache (same input_hash)
            input_hash = compute_comparison_input_hash(run_a_id, run_b_id)
            cached_comparison = self._get_cached_comparison(uow, input_hash)
            if cached_comparison is not None and cached_comparison.result_json is not None:
                return ProtectionComparisonResult.from_dict(cached_comparison.result_json)

            # 4. Fetch results
            result_a = self._get_protection_result(uow, run_a_id)
            result_b = self._get_protection_result(uow, run_b_id)

            # 5. Initialize trace
            trace_steps: list[ProtectionComparisonTraceStep] = []

            # 6. Step 1: Match evaluations by (protected_element_ref, fault_target_id)
            trace_steps.append(
                ProtectionComparisonTraceStep(
                    step="MATCH_EVALUATIONS",
                    description_pl="Dopasowanie ewaluacji po (element chroniony, punkt zwarcia)",
                    inputs={
                        "evaluations_a_count": len(result_a.evaluations),
                        "evaluations_b_count": len(result_b.evaluations),
                    },
                    outputs={},
                )
            )

            rows, matched_count = self._match_evaluations(
                result_a.evaluations,
                result_b.evaluations,
            )

            trace_steps[-1] = ProtectionComparisonTraceStep(
                step="MATCH_EVALUATIONS",
                description_pl="Dopasowanie ewaluacji po (element chroniony, punkt zwarcia)",
                inputs={
                    "evaluations_a_count": len(result_a.evaluations),
                    "evaluations_b_count": len(result_b.evaluations),
                },
                outputs={
                    "matched_pairs": matched_count,
                    "total_rows": len(rows),
                },
            )

            # 7. Step 2: Compute deltas and classify changes
            trace_steps.append(
                ProtectionComparisonTraceStep(
                    step="COMPUTE_DELTAS",
                    description_pl="Obliczanie różnic czasów i prądów",
                    inputs={"row_count": len(rows)},
                    outputs={},
                )
            )

            rows = self._compute_deltas(rows)

            state_change_counts = self._count_state_changes(rows)
            trace_steps[-1] = ProtectionComparisonTraceStep(
                step="COMPUTE_DELTAS",
                description_pl="Obliczanie różnic czasów i prądów",
                inputs={"row_count": len(rows)},
                outputs=state_change_counts,
            )

            # 8. Step 3: Classify state changes
            trace_steps.append(
                ProtectionComparisonTraceStep(
                    step="CLASSIFY_CHANGES",
                    description_pl="Klasyfikacja zmian stanów (TRIP_TO_NO_TRIP, NO_TRIP_TO_TRIP, itd.)",
                    inputs={"row_count": len(rows)},
                    outputs=state_change_counts,
                )
            )

            # 9. Step 4: Generate issue ranking
            trace_steps.append(
                ProtectionComparisonTraceStep(
                    step="RANK_ISSUES",
                    description_pl="Generowanie rankingu problemów wg severity (5→1)",
                    inputs={
                        "row_count": len(rows),
                        "delay_threshold_s": DELAY_CHANGE_THRESHOLD_S,
                        "margin_threshold_percent": MARGIN_CHANGE_THRESHOLD_PERCENT,
                    },
                    outputs={},
                )
            )

            ranking = self._generate_ranking(rows)

            severity_counts = self._count_severities(ranking)
            trace_steps[-1] = ProtectionComparisonTraceStep(
                step="RANK_ISSUES",
                description_pl="Generowanie rankingu problemów wg severity (5→1)",
                inputs={
                    "row_count": len(rows),
                    "delay_threshold_s": DELAY_CHANGE_THRESHOLD_S,
                    "margin_threshold_percent": MARGIN_CHANGE_THRESHOLD_PERCENT,
                },
                outputs={
                    "total_issues": len(ranking),
                    **severity_counts,
                },
            )

            # 10. Build summary
            summary = self._build_summary(rows, ranking)

            # 11. Build result
            comparison_id = str(UUID(int=hash((run_a_id, run_b_id, input_hash)) % (2**128)))

            result = ProtectionComparisonResult(
                comparison_id=comparison_id,
                run_a_id=run_a_id,
                run_b_id=run_b_id,
                project_id=str(run_a.project_id),
                rows=tuple(rows),
                ranking=tuple(ranking),
                summary=summary,
                input_hash=input_hash,
            )

            # 12. Build trace
            trace = ProtectionComparisonTrace(
                comparison_id=comparison_id,
                run_a_id=run_a_id,
                run_b_id=run_b_id,
                library_fingerprint_a=result_a.template_fingerprint,
                library_fingerprint_b=result_b.template_fingerprint,
                steps=tuple(trace_steps),
            )

            # 13. Store comparison in cache
            self._store_comparison(
                uow,
                project_id=run_a.project_id,
                run_a_id=run_a_id,
                run_b_id=run_b_id,
                input_hash=input_hash,
                result=result,
                trace=trace,
            )

        return result

    def get_comparison(self, comparison_id: str) -> ProtectionComparisonResult:
        """
        Get a comparison by ID.
        """
        with self._uow_factory() as uow:
            comparison = self._get_comparison_by_id(uow, comparison_id)
            if comparison is None or comparison.result_json is None:
                raise ProtectionComparisonNotFoundError(comparison_id)
            return ProtectionComparisonResult.from_dict(comparison.result_json)

    def get_comparison_trace(self, comparison_id: str) -> ProtectionComparisonTrace:
        """
        Get the trace for a comparison.
        """
        with self._uow_factory() as uow:
            comparison = self._get_comparison_by_id(uow, comparison_id)
            if comparison is None or comparison.trace_json is None:
                raise ProtectionComparisonNotFoundError(comparison_id)
            return ProtectionComparisonTrace.from_dict(comparison.trace_json)

    # =========================================================================
    # PRIVATE METHODS
    # =========================================================================

    def _get_protection_run(self, uow: UnitOfWork, run_id: str) -> ProtectionAnalysisRun:
        """
        Get a protection analysis run by ID.
        """
        try:
            run_uuid = UUID(run_id)
            results = uow.results.list_results(run_uuid)
            for result in results:
                if result.get("result_type") == "protection_analysis_run":
                    return ProtectionAnalysisRun.from_dict(result.get("payload", {}))
        except (ValueError, TypeError):
            pass
        raise ProtectionRunNotFoundError(run_id)

    def _validate_run_status(self, run: ProtectionAnalysisRun, run_id: str) -> None:
        """
        Validate that run is FINISHED.
        """
        if run.status != ProtectionRunStatus.FINISHED:
            raise ProtectionRunNotFinishedError(run_id, run.status.value)

    def _get_protection_result(self, uow: UnitOfWork, run_id: str) -> ProtectionResult:
        """
        Get ProtectionResult for a run.
        """
        try:
            run_uuid = UUID(run_id)
            results = uow.results.list_results(run_uuid)
            for result in results:
                if result.get("result_type") == "protection_result":
                    return ProtectionResult.from_dict(result.get("payload", {}))
        except (ValueError, TypeError):
            pass
        raise ProtectionResultNotFoundError(run_id)

    def _get_cached_comparison(
        self, uow: UnitOfWork, input_hash: str
    ) -> ProtectionComparison | None:
        """
        Check for cached comparison with same input_hash.
        """
        try:
            results = uow.results.list_by_type("protection_comparison")
            for result in results:
                payload = result.get("payload", {})
                if payload.get("input_hash") == input_hash:
                    return ProtectionComparison.from_dict(payload)
        except Exception:
            pass
        return None

    def _get_comparison_by_id(
        self, uow: UnitOfWork, comparison_id: str
    ) -> ProtectionComparison | None:
        """
        Get a comparison by ID.
        """
        try:
            comparison_uuid = UUID(comparison_id)
            results = uow.results.list_results(comparison_uuid)
            for result in results:
                if result.get("result_type") == "protection_comparison":
                    return ProtectionComparison.from_dict(result.get("payload", {}))
        except (ValueError, TypeError):
            pass
        return None

    def _store_comparison(
        self,
        uow: UnitOfWork,
        project_id: UUID,
        run_a_id: str,
        run_b_id: str,
        input_hash: str,
        result: ProtectionComparisonResult,
        trace: ProtectionComparisonTrace,
    ) -> None:
        """
        Store comparison result and trace.
        """
        comparison = ProtectionComparison(
            id=(
                UUID(result.comparison_id)
                if self._is_valid_uuid(result.comparison_id)
                else UUID(int=hash(result.comparison_id) % (2**128))
            ),
            project_id=project_id,
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            status=ProtectionComparisonStatus.FINISHED,
            input_hash=input_hash,
            result_json=result.to_dict(),
            trace_json=trace.to_dict(),
            finished_at=datetime.now(UTC),
        )

        uow.results.add_result(
            run_id=comparison.id,
            project_id=project_id,
            result_type="protection_comparison",
            payload=comparison.to_dict(),
        )

    def _is_valid_uuid(self, value: str) -> bool:
        """Check if string is a valid UUID."""
        try:
            UUID(value)
            return True
        except (ValueError, TypeError):
            return False

    def _match_evaluations(
        self,
        evaluations_a: tuple[ProtectionEvaluation, ...],
        evaluations_b: tuple[ProtectionEvaluation, ...],
    ) -> tuple[list[ProtectionComparisonRow], int]:
        """
        Match evaluations from A and B by (protected_element_ref, fault_target_id).

        Returns:
            Tuple of (rows, matched_count)
        """
        # Build index of A evaluations
        index_a: dict[tuple[str, str], ProtectionEvaluation] = {}
        for eval_a in evaluations_a:
            key = (eval_a.protected_element_ref, eval_a.fault_target_id)
            index_a[key] = eval_a

        # Build index of B evaluations
        index_b: dict[tuple[str, str], ProtectionEvaluation] = {}
        for eval_b in evaluations_b:
            key = (eval_b.protected_element_ref, eval_b.fault_target_id)
            index_b[key] = eval_b

        # All unique keys
        all_keys = sorted(set(index_a.keys()) | set(index_b.keys()))

        rows: list[ProtectionComparisonRow] = []
        matched_count = 0

        for key in all_keys:
            eval_a = index_a.get(key)
            eval_b = index_b.get(key)

            if eval_a is not None and eval_b is not None:
                matched_count += 1

            # Compute state change
            state_change = self._compute_state_change(eval_a, eval_b)

            row = ProtectionComparisonRow(
                protected_element_ref=key[0],
                fault_target_id=key[1],
                device_id_a=eval_a.device_id if eval_a else "",
                device_id_b=eval_b.device_id if eval_b else "",
                trip_state_a=eval_a.trip_state.value if eval_a else "MISSING",
                trip_state_b=eval_b.trip_state.value if eval_b else "MISSING",
                t_trip_s_a=eval_a.t_trip_s if eval_a else None,
                t_trip_s_b=eval_b.t_trip_s if eval_b else None,
                i_fault_a_a=eval_a.i_fault_a if eval_a else 0.0,
                i_fault_a_b=eval_b.i_fault_a if eval_b else 0.0,
                delta_t_s=None,  # Computed in next step
                delta_i_fault_a=(eval_b.i_fault_a if eval_b else 0.0)
                - (eval_a.i_fault_a if eval_a else 0.0),
                margin_percent_a=eval_a.margin_percent if eval_a else None,
                margin_percent_b=eval_b.margin_percent if eval_b else None,
                state_change=state_change,
            )
            rows.append(row)

        return rows, matched_count

    def _compute_state_change(
        self,
        eval_a: ProtectionEvaluation | None,
        eval_b: ProtectionEvaluation | None,
    ) -> StateChange:
        """
        Compute state change between two evaluations.
        """
        if eval_a is None or eval_b is None:
            return StateChange.INVALID_CHANGE

        state_a = eval_a.trip_state
        state_b = eval_b.trip_state

        if state_a == TripState.INVALID or state_b == TripState.INVALID:
            return StateChange.INVALID_CHANGE

        if state_a == state_b:
            return StateChange.NO_CHANGE

        if state_a == TripState.TRIPS and state_b == TripState.NO_TRIP:
            return StateChange.TRIP_TO_NO_TRIP

        if state_a == TripState.NO_TRIP and state_b == TripState.TRIPS:
            return StateChange.NO_TRIP_TO_TRIP

        return StateChange.INVALID_CHANGE

    def _compute_deltas(self, rows: list[ProtectionComparisonRow]) -> list[ProtectionComparisonRow]:
        """
        Compute time deltas for rows where both states are TRIPS.
        """
        updated_rows: list[ProtectionComparisonRow] = []

        for row in rows:
            delta_t_s: float | None = None

            # Only compute delta_t if both are TRIPS and have trip times
            if (
                row.trip_state_a == "TRIPS"
                and row.trip_state_b == "TRIPS"
                and row.t_trip_s_a is not None
                and row.t_trip_s_b is not None
            ):
                delta_t_s = row.t_trip_s_b - row.t_trip_s_a

            updated_row = ProtectionComparisonRow(
                protected_element_ref=row.protected_element_ref,
                fault_target_id=row.fault_target_id,
                device_id_a=row.device_id_a,
                device_id_b=row.device_id_b,
                trip_state_a=row.trip_state_a,
                trip_state_b=row.trip_state_b,
                t_trip_s_a=row.t_trip_s_a,
                t_trip_s_b=row.t_trip_s_b,
                i_fault_a_a=row.i_fault_a_a,
                i_fault_a_b=row.i_fault_a_b,
                delta_t_s=delta_t_s,
                delta_i_fault_a=row.delta_i_fault_a,
                margin_percent_a=row.margin_percent_a,
                margin_percent_b=row.margin_percent_b,
                state_change=row.state_change,
            )
            updated_rows.append(updated_row)

        return updated_rows

    def _count_state_changes(self, rows: list[ProtectionComparisonRow]) -> dict[str, int]:
        """
        Count state changes by type.
        """
        counts = {
            "no_change_count": 0,
            "trip_to_no_trip_count": 0,
            "no_trip_to_trip_count": 0,
            "invalid_change_count": 0,
        }

        for row in rows:
            if row.state_change == StateChange.NO_CHANGE:
                counts["no_change_count"] += 1
            elif row.state_change == StateChange.TRIP_TO_NO_TRIP:
                counts["trip_to_no_trip_count"] += 1
            elif row.state_change == StateChange.NO_TRIP_TO_TRIP:
                counts["no_trip_to_trip_count"] += 1
            else:
                counts["invalid_change_count"] += 1

        return counts

    def _generate_ranking(self, rows: list[ProtectionComparisonRow]) -> list[RankingIssue]:
        """
        Generate deterministic issue ranking.

        Issues are created for:
        - TRIP_LOST: state_change == TRIP_TO_NO_TRIP (CRITICAL)
        - TRIP_GAINED: state_change == NO_TRIP_TO_TRIP (MINOR)
        - DELAY_INCREASED: delta_t_s > threshold (MODERATE)
        - DELAY_DECREASED: delta_t_s < -threshold (MINOR)
        - INVALID_STATE: state_change == INVALID_CHANGE (MAJOR)
        - MARGIN_DECREASED: margin decreased > threshold (MODERATE)
        - MARGIN_INCREASED: margin increased > threshold (INFORMATIONAL)

        Sorted by severity (DESC), then issue_code, then element_ref.
        """
        issues: list[RankingIssue] = []

        for idx, row in enumerate(rows):
            # TRIP_LOST
            if row.state_change == StateChange.TRIP_TO_NO_TRIP:
                issues.append(
                    self._create_issue(
                        IssueCode.TRIP_LOST,
                        row.protected_element_ref,
                        row.fault_target_id,
                        (idx,),
                    )
                )

            # TRIP_GAINED
            elif row.state_change == StateChange.NO_TRIP_TO_TRIP:
                issues.append(
                    self._create_issue(
                        IssueCode.TRIP_GAINED,
                        row.protected_element_ref,
                        row.fault_target_id,
                        (idx,),
                    )
                )

            # INVALID_STATE
            elif row.state_change == StateChange.INVALID_CHANGE:
                issues.append(
                    self._create_issue(
                        IssueCode.INVALID_STATE,
                        row.protected_element_ref,
                        row.fault_target_id,
                        (idx,),
                    )
                )

            # DELAY changes (only for NO_CHANGE state where both trip)
            elif row.state_change == StateChange.NO_CHANGE and row.delta_t_s is not None:
                if row.delta_t_s > DELAY_CHANGE_THRESHOLD_S:
                    issues.append(
                        self._create_issue(
                            IssueCode.DELAY_INCREASED,
                            row.protected_element_ref,
                            row.fault_target_id,
                            (idx,),
                            extra_info=f"Δt = {row.delta_t_s:.3f} s",
                        )
                    )
                elif row.delta_t_s < -DELAY_CHANGE_THRESHOLD_S:
                    issues.append(
                        self._create_issue(
                            IssueCode.DELAY_DECREASED,
                            row.protected_element_ref,
                            row.fault_target_id,
                            (idx,),
                            extra_info=f"Δt = {row.delta_t_s:.3f} s",
                        )
                    )

            # MARGIN changes
            if row.margin_percent_a is not None and row.margin_percent_b is not None:
                margin_delta = row.margin_percent_b - row.margin_percent_a
                if margin_delta < -MARGIN_CHANGE_THRESHOLD_PERCENT:
                    issues.append(
                        self._create_issue(
                            IssueCode.MARGIN_DECREASED,
                            row.protected_element_ref,
                            row.fault_target_id,
                            (idx,),
                            extra_info=f"Δmargin = {margin_delta:.1f}%",
                        )
                    )
                elif margin_delta > MARGIN_CHANGE_THRESHOLD_PERCENT:
                    issues.append(
                        self._create_issue(
                            IssueCode.MARGIN_INCREASED,
                            row.protected_element_ref,
                            row.fault_target_id,
                            (idx,),
                            extra_info=f"Δmargin = +{margin_delta:.1f}%",
                        )
                    )

        # Sort by severity DESC, then issue_code, then element_ref
        issues.sort(key=lambda i: (-i.severity.value, i.issue_code.value, i.element_ref))

        return issues

    def _create_issue(
        self,
        issue_code: IssueCode,
        element_ref: str,
        fault_target_id: str,
        evidence_refs: tuple[int, ...],
        extra_info: str = "",
    ) -> RankingIssue:
        """
        Create a ranking issue with Polish description.
        """
        base_description = ISSUE_DESCRIPTIONS_PL.get(issue_code, issue_code.value)
        description = f"{base_description} ({extra_info})" if extra_info else base_description

        return RankingIssue(
            issue_code=issue_code,
            severity=ISSUE_SEVERITY_MAP.get(issue_code, IssueSeverity.INFORMATIONAL),
            element_ref=element_ref,
            fault_target_id=fault_target_id,
            description_pl=description,
            evidence_refs=evidence_refs,
        )

    def _count_severities(self, ranking: list[RankingIssue]) -> dict[str, int]:
        """
        Count issues by severity.
        """
        counts = {
            "critical_issues": 0,
            "major_issues": 0,
            "moderate_issues": 0,
            "minor_issues": 0,
            "informational_issues": 0,
        }

        for issue in ranking:
            if issue.severity == IssueSeverity.CRITICAL:
                counts["critical_issues"] += 1
            elif issue.severity == IssueSeverity.MAJOR:
                counts["major_issues"] += 1
            elif issue.severity == IssueSeverity.MODERATE:
                counts["moderate_issues"] += 1
            elif issue.severity == IssueSeverity.MINOR:
                counts["minor_issues"] += 1
            else:
                counts["informational_issues"] += 1

        return counts

    def _build_summary(
        self,
        rows: list[ProtectionComparisonRow],
        ranking: list[RankingIssue],
    ) -> ProtectionComparisonSummary:
        """
        Build comparison summary.
        """
        state_changes = self._count_state_changes(rows)
        severities = self._count_severities(ranking)

        return ProtectionComparisonSummary(
            total_rows=len(rows),
            no_change_count=state_changes["no_change_count"],
            trip_to_no_trip_count=state_changes["trip_to_no_trip_count"],
            no_trip_to_trip_count=state_changes["no_trip_to_trip_count"],
            invalid_change_count=state_changes["invalid_change_count"],
            total_issues=len(ranking),
            critical_issues=severities["critical_issues"],
            major_issues=severities["major_issues"],
            moderate_issues=severities["moderate_issues"],
            minor_issues=severities["minor_issues"],
        )
