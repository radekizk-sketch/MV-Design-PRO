"""
Protection Comparison Service — P15b SELECTIVITY (A/B), tor kanoniczny (CV-3.3-B)

Orchestrates protection comparison:
1. VALIDATE: Both runs are R1 `CanonicalRun` (`enm.canonical_analysis`),
   analysis_type == "protection_sn", FINISHED, tego samego projektu
2. FETCH: `ResultSetV1` obu biegów (`build_resultset_v1_from_canonical_run` —
   JEDYNY producent projekcji wyników; zero własnego parsowania raw_result)
3. COMPARE: Match by (protected_element_ref, fault_target_id)
4. RANK: Generate deterministic issue ranking
5. TRACE: Record all steps for audit, z proweniencją (snapshot_hash/input_hash/
   koperta) OBU biegów R1 (B1, karta CV-3.3-B)

INVARIANTS (BINDING):
1. READ-ONLY: Zero physics calculations, zero state mutations
2. SAME PROJECT: Both runs must belong to the same project
3. FINISHED ONLY: Both runs must be FINISHED status
4. DETERMINISTIC: Same inputs → identical outputs
5. NO NORMATIVE INTERPRETATION: Only factual comparison (no IEC 60255 selectivity)
6. BEZSTANOWE: żadna trwałość poza R1 (zob. `domain/protection_comparison.py`
   nagłówek sekcji „HELPER FUNCTIONS").
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from analysis.comparison_diffs import RunProvenance
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
)
from domain.protection_comparison import (
    ISSUE_DESCRIPTIONS_PL,
    ISSUE_SEVERITY_MAP,
    IssueCode,
    IssueSeverity,
    ProtectionComparisonNotFoundError,
    ProtectionComparisonResult,
    ProtectionComparisonRow,
    ProtectionComparisonSummary,
    ProtectionComparisonTrace,
    ProtectionComparisonTraceStep,
    ProtectionProjectMismatchError,
    ProtectionRunNotFinishedError,
    ProtectionRunNotFoundError,
    ProtectionRunWrongTypeError,
    RankingIssue,
    StateChange,
    compute_comparison_input_hash,
)
from enm.canonical_analysis import CanonicalRun, get_run

# =============================================================================
# THRESHOLDS FOR ISSUE DETECTION
# =============================================================================

# Time difference threshold for significant delay change [s]
DELAY_CHANGE_THRESHOLD_S = 0.05  # 50ms

# Margin difference threshold for significant margin change [%]
MARGIN_CHANGE_THRESHOLD_PERCENT = 5.0

#: Separator w `comparison_id` — porównanie jest BEZSTANOWE (zob. nagłówek
#: modułu): `comparison_id` koduje wprost parę biegów R1.
_ID_SEP = "::"


# =============================================================================
# PROTECTION COMPARISON SERVICE
# =============================================================================


class ProtectionComparisonService:
    """
    Service for comparing two protection analysis runs.

    P15b: Main entry point for protection selectivity comparison.

    USAGE:
        service = ProtectionComparisonService()
        result = service.compare(run_a_id, run_b_id)
    """

    def __init__(self, uow_factory: Any = None) -> None:
        # `uow_factory` zachowany wyłącznie dla zgodności sygnatury wołania z
        # routera — porównanie R1 nie dotyka UnitOfWork (patrz
        # `application/power_flow_comparison/service.py`, ten sam wzorzec).
        self._uow_factory = uow_factory

    def compare(self, run_a_id: str, run_b_id: str) -> ProtectionComparisonResult:
        """
        Compare two protection analysis runs.

        Args:
            run_a_id: First protection run ID (baseline) — R1 `CanonicalRun` id
            run_b_id: Second protection run ID (comparison) — R1 `CanonicalRun` id

        Returns:
            ProtectionComparisonResult with rows, ranking, and trace

        Raises:
            ProtectionRunNotFoundError: If a run doesn't exist
            ProtectionRunWrongTypeError: If a run exists but isn't analysis_type protection_sn
            ProtectionRunNotFinishedError: If a run is not FINISHED
            ProtectionProjectMismatchError: If runs belong to different projects
        """
        result, _trace = self._compare_full(run_a_id, run_b_id)
        return result

    def get_comparison(self, comparison_id: str) -> ProtectionComparisonResult:
        """Get a comparison by ID — przelicza od nowa (BEZSTANOWE, patrz nagłówek)."""
        run_a_id, run_b_id = self._split_comparison_id(comparison_id)
        return self.compare(run_a_id, run_b_id)

    def get_comparison_trace(self, comparison_id: str) -> ProtectionComparisonTrace:
        """Get the trace for a comparison — przelicza od nowa (BEZSTANOWE)."""
        run_a_id, run_b_id = self._split_comparison_id(comparison_id)
        _result, trace = self._compare_full(run_a_id, run_b_id)
        return trace

    # =========================================================================
    # PRIVATE METHODS
    # =========================================================================

    def _split_comparison_id(self, comparison_id: str) -> tuple[str, str]:
        parts = comparison_id.split(_ID_SEP, 1)
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ProtectionComparisonNotFoundError(comparison_id)
        return parts[0], parts[1]

    def _compare_full(
        self, run_a_id: str, run_b_id: str
    ) -> tuple[ProtectionComparisonResult, ProtectionComparisonTrace]:
        run_a = self._get_protection_run(run_a_id)
        run_b = self._get_protection_run(run_b_id)

        self._validate_run_status(run_a, run_a_id)
        self._validate_run_status(run_b, run_b_id)

        if str(run_a.project_id) != str(run_b.project_id):
            raise ProtectionProjectMismatchError(
                str(run_a.project_id),
                str(run_b.project_id),
            )

        # Fetch results — JEDYNA projekcja (B1): zero własnego parsowania raw_result.
        result_set_a = build_resultset_v1_from_canonical_run(run_a)
        result_set_b = build_resultset_v1_from_canonical_run(run_b)

        evaluations_a = self._evaluations(result_set_a)
        evaluations_b = self._evaluations(result_set_b)

        trace_steps: list[ProtectionComparisonTraceStep] = []

        # Step 1: Match evaluations by (protected_element_ref, fault_target_id)
        trace_steps.append(
            ProtectionComparisonTraceStep(
                step="MATCH_EVALUATIONS",
                description_pl="Dopasowanie ewaluacji po (element chroniony, punkt zwarcia)",
                inputs={
                    "evaluations_a_count": len(evaluations_a),
                    "evaluations_b_count": len(evaluations_b),
                },
                outputs={},
            )
        )
        rows, matched_count = self._match_evaluations(evaluations_a, evaluations_b)
        trace_steps[-1] = ProtectionComparisonTraceStep(
            step="MATCH_EVALUATIONS",
            description_pl="Dopasowanie ewaluacji po (element chroniony, punkt zwarcia)",
            inputs={
                "evaluations_a_count": len(evaluations_a),
                "evaluations_b_count": len(evaluations_b),
            },
            outputs={"matched_pairs": matched_count, "total_rows": len(rows)},
        )

        # Step 2: Compute deltas and classify changes
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

        # Step 3: Classify state changes
        trace_steps.append(
            ProtectionComparisonTraceStep(
                step="CLASSIFY_CHANGES",
                description_pl="Klasyfikacja zmian stanów (TRIP_TO_NO_TRIP, NO_TRIP_TO_TRIP, itd.)",
                inputs={"row_count": len(rows)},
                outputs=state_change_counts,
            )
        )

        # Step 4: Generate issue ranking
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
            outputs={"total_issues": len(ranking), **severity_counts},
        )

        summary = self._build_summary(rows, ranking)

        input_hash = compute_comparison_input_hash(run_a_id, run_b_id)
        comparison_id = f"{run_a_id}{_ID_SEP}{run_b_id}"
        provenance_a = RunProvenance.from_canonical_run(run_a)
        provenance_b = RunProvenance.from_canonical_run(run_b)

        result = ProtectionComparisonResult(
            comparison_id=comparison_id,
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=str(run_a.project_id),
            rows=tuple(rows),
            ranking=tuple(ranking),
            summary=summary,
            input_hash=input_hash,
            provenance_a=provenance_a.to_dict(),
            provenance_b=provenance_b.to_dict(),
        )
        trace = ProtectionComparisonTrace(
            comparison_id=comparison_id,
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            library_fingerprint_a=result_set_a.global_results.get("template_fingerprint"),
            library_fingerprint_b=result_set_b.global_results.get("template_fingerprint"),
            steps=tuple(trace_steps),
        )
        return result, trace

    def _get_protection_run(self, run_id: str) -> CanonicalRun:
        """Get a protection analysis run (R1 `CanonicalRun`) by ID."""
        try:
            run_uuid = UUID(run_id)
        except (ValueError, TypeError, AttributeError) as exc:
            raise ProtectionRunNotFoundError(run_id) from exc
        run = get_run(run_uuid)
        if run is None:
            raise ProtectionRunNotFoundError(run_id)
        if run.analysis_type != "protection_sn":
            raise ProtectionRunWrongTypeError(run_id, run.analysis_type)
        return run

    def _validate_run_status(self, run: CanonicalRun, run_id: str) -> None:
        """Validate that run is FINISHED."""
        if run.status != "FINISHED":
            raise ProtectionRunNotFinishedError(run_id, run.status)

    @staticmethod
    def _evaluations(result_set: Any) -> list[dict[str, Any]]:
        """Lista ewaluacji (`values` per element `ProtectionDevice`) z
        `ResultSetV1.element_results` — JEDYNE źródło (B1: zero własnego
        parsowania raw_result)."""
        return [
            row.values
            for row in result_set.element_results
            if row.element_type == "ProtectionDevice"
        ]

    def _match_evaluations(
        self,
        evaluations_a: list[dict[str, Any]],
        evaluations_b: list[dict[str, Any]],
    ) -> tuple[list[ProtectionComparisonRow], int]:
        """
        Match evaluations from A and B by (protected_element_ref, fault_target_id).

        Returns:
            Tuple of (rows, matched_count)
        """
        index_a: dict[tuple[str, str], dict[str, Any]] = {
            (str(ev["protected_element_ref"]), str(ev["fault_target_id"])): ev
            for ev in evaluations_a
        }
        index_b: dict[tuple[str, str], dict[str, Any]] = {
            (str(ev["protected_element_ref"]), str(ev["fault_target_id"])): ev
            for ev in evaluations_b
        }

        all_keys = sorted(set(index_a.keys()) | set(index_b.keys()))

        rows: list[ProtectionComparisonRow] = []
        matched_count = 0

        for key in all_keys:
            eval_a = index_a.get(key)
            eval_b = index_b.get(key)

            if eval_a is not None and eval_b is not None:
                matched_count += 1

            state_change = self._compute_state_change(eval_a, eval_b)

            row = ProtectionComparisonRow(
                protected_element_ref=key[0],
                fault_target_id=key[1],
                device_id_a=str(eval_a["device_id"]) if eval_a else "",
                device_id_b=str(eval_b["device_id"]) if eval_b else "",
                trip_state_a=str(eval_a["trip_state"]) if eval_a else "MISSING",
                trip_state_b=str(eval_b["trip_state"]) if eval_b else "MISSING",
                t_trip_s_a=self._optional_float(eval_a, "t_trip_s"),
                t_trip_s_b=self._optional_float(eval_b, "t_trip_s"),
                # FAB-E (E1, zachowane): element nieobecny w run A/B (eval_a/
                # eval_b brak) -> None, nie fikcyjny prad zwarciowy 0.0 A.
                i_fault_a_a=self._optional_float(eval_a, "i_fault_a"),
                i_fault_a_b=self._optional_float(eval_b, "i_fault_a"),
                delta_t_s=None,  # Computed in next step
                delta_i_fault_a=(
                    (float(eval_b["i_fault_a"]) - float(eval_a["i_fault_a"]))
                    if (eval_a and eval_b)
                    else None
                ),
                margin_percent_a=self._optional_float(eval_a, "margin_percent"),
                margin_percent_b=self._optional_float(eval_b, "margin_percent"),
                state_change=state_change,
            )
            rows.append(row)

        return rows, matched_count

    @staticmethod
    def _optional_float(evaluation: dict[str, Any] | None, key: str) -> float | None:
        if evaluation is None:
            return None
        value = evaluation.get(key)
        return float(value) if value is not None else None

    def _compute_state_change(
        self,
        eval_a: dict[str, Any] | None,
        eval_b: dict[str, Any] | None,
    ) -> StateChange:
        """
        Compute state change between two evaluations.
        """
        if eval_a is None or eval_b is None:
            return StateChange.INVALID_CHANGE

        state_a = str(eval_a["trip_state"])
        state_b = str(eval_b["trip_state"])

        if state_a == "INVALID" or state_b == "INVALID":
            return StateChange.INVALID_CHANGE

        if state_a == state_b:
            return StateChange.NO_CHANGE

        if state_a == "TRIPS" and state_b == "NO_TRIP":
            return StateChange.TRIP_TO_NO_TRIP

        if state_a == "NO_TRIP" and state_b == "TRIPS":
            return StateChange.NO_TRIP_TO_TRIP

        return StateChange.INVALID_CHANGE

    def _compute_deltas(self, rows: list[ProtectionComparisonRow]) -> list[ProtectionComparisonRow]:
        """
        Compute time deltas for rows where both states are TRIPS.
        """
        updated_rows: list[ProtectionComparisonRow] = []

        for row in rows:
            delta_t_s: float | None = None

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
            if row.state_change == StateChange.TRIP_TO_NO_TRIP:
                issues.append(
                    self._create_issue(
                        IssueCode.TRIP_LOST,
                        row.protected_element_ref,
                        row.fault_target_id,
                        (idx,),
                    )
                )
            elif row.state_change == StateChange.NO_TRIP_TO_TRIP:
                issues.append(
                    self._create_issue(
                        IssueCode.TRIP_GAINED,
                        row.protected_element_ref,
                        row.fault_target_id,
                        (idx,),
                    )
                )
            elif row.state_change == StateChange.INVALID_CHANGE:
                issues.append(
                    self._create_issue(
                        IssueCode.INVALID_STATE,
                        row.protected_element_ref,
                        row.fault_target_id,
                        (idx,),
                    )
                )
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

        # FAB-E (E2, KLASA NIE INSTANCJA — ten sam wzorzec jak
        # application/power_flow_comparison/service.py): brak wpisu w
        # ISSUE_SEVERITY_MAP dla tego kodu problemu to dziura w kontrakcie —
        # subskrypcja wprost zamiast `.get(..., default)`, zeby przyszla luka
        # rzucila KeyError zamiast cicho zanizyc priorytet do INFORMATIONAL.
        # Mapa pokrywa dzis WSZYSTKIE elementy IssueCode — patrz
        # tests/domain/test_protection_comparison_severity_map.py.
        return RankingIssue(
            issue_code=issue_code,
            severity=ISSUE_SEVERITY_MAP[issue_code],
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
