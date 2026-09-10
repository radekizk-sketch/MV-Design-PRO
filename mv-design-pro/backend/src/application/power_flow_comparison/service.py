"""
Power Flow Comparison Service — P20c (A/B), tor kanoniczny (CV-3.3-B)

Orchestrates power flow comparison:
1. VALIDATE: Both runs are R1 `CanonicalRun` (`enm.canonical_analysis`),
   analysis_type == "PF", FINISHED, tego samego projektu
2. FETCH: `ResultSetV1` obu biegów (`build_resultset_v1_from_canonical_run` —
   JEDYNY producent projekcji wyników; zero własnego parsowania raw_result)
3. COMPARE: Match buses/branches by `element_ref` (ENM ref_id), compute deltas
4. RANK: Generate deterministic issue ranking
5. TRACE: Record all steps for audit, z proweniencją (snapshot_hash/input_hash/
   koperta) OBU biegów R1 — porównanie bez tego jest porównaniem bez dowodu,
   CO było porównywane (B1, karta CV-3.3-B)

INVARIANTS (BINDING):
1. READ-ONLY: Zero physics calculations, zero state mutations
2. SAME PROJECT: Both runs must belong to the same project
3. FINISHED ONLY: Both runs must be FINISHED status
4. DETERMINISTIC: Same inputs → identical outputs
5. NO NORMATIVE INTERPRETATION: Only factual comparison (no voltage limit violations)
6. BEZSTANOWE: żadna trwałość poza R1 (oba biegi są append-only) — ten sam
   `comparison_id` zawsze przelicza się identycznie; brak cache'a to nie dług,
   to konsekwencja determinizmu (patrz `domain/power_flow_comparison.py` nagłówek
   sekcji „HELPER FUNCTIONS").
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from analysis.comparison_diffs import (
    RunProvenance,
    delta_lub_none,
    dopasuj_klucze,
    pole_lub_none,
    procent_lub_none,
)
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
)
from domain.power_flow_comparison import (
    ANGLE_DELTA_THRESHOLD_DEG,
    ISSUE_DESCRIPTIONS_PL,
    ISSUE_SEVERITY_MAP,
    LOSSES_DECREASE_THRESHOLD_MW,
    LOSSES_INCREASE_THRESHOLD_MW,
    SLACK_POWER_CHANGE_THRESHOLD_MW,
    TOP_N_FOR_RANKING,
    VOLTAGE_DELTA_THRESHOLD_PU,
    PowerFlowBranchDiffRow,
    PowerFlowBusDiffRow,
    PowerFlowComparisonNotFoundError,
    PowerFlowComparisonResult,
    PowerFlowComparisonSummary,
    PowerFlowComparisonTrace,
    PowerFlowComparisonTraceStep,
    PowerFlowIssueCode,
    PowerFlowIssueSeverity,
    PowerFlowProjectMismatchError,
    PowerFlowRankingIssue,
    PowerFlowRunNotFinishedError,
    PowerFlowRunNotFoundError,
    PowerFlowRunWrongTypeError,
    compute_pf_comparison_input_hash,
    get_ranking_thresholds,
    procent_roznicy,
)
from enm.canonical_analysis import CanonicalRun, get_run

#: Separator w `comparison_id` — porównanie jest BEZSTANOWE (zob. nagłówek
#: modułu): `comparison_id` koduje wprost parę biegów R1, więc `get_comparison`/
#: `get_comparison_trace` przeliczają porównanie od nowa zamiast czytać cache.
_ID_SEP = "::"

# =============================================================================
# POWER FLOW COMPARISON SERVICE
# =============================================================================


class PowerFlowComparisonService:
    """
    Service for comparing two power flow analysis runs.

    P20c: Main entry point for power flow A/B comparison.

    USAGE:
        service = PowerFlowComparisonService()
        result = service.compare(run_a_id, run_b_id)
    """

    def __init__(self, uow_factory: Any = None) -> None:
        # `uow_factory` zachowany wyłącznie dla zgodności sygnatury wołania z
        # routera (`_build_service(uow_factory)`, `Depends(get_uow_factory)`) —
        # porównanie R1 nie dotyka UnitOfWork: oba biegi i ich wyniki czyta
        # WYŁĄCZNIE `enm.canonical_analysis` (R1).
        self._uow_factory = uow_factory

    def compare(self, run_a_id: str, run_b_id: str) -> PowerFlowComparisonResult:
        """
        Compare two power flow analysis runs.

        Args:
            run_a_id: First power flow run ID (baseline) — R1 `CanonicalRun` id
            run_b_id: Second power flow run ID (comparison) — R1 `CanonicalRun` id

        Returns:
            PowerFlowComparisonResult with bus_diffs, branch_diffs, ranking, and trace

        Raises:
            PowerFlowRunNotFoundError: If a run doesn't exist
            PowerFlowRunWrongTypeError: If a run exists but isn't analysis_type PF
            PowerFlowRunNotFinishedError: If a run is not FINISHED
            PowerFlowProjectMismatchError: If runs belong to different projects
        """
        result, _trace = self._compare_full(run_a_id, run_b_id)
        return result

    def get_comparison(self, comparison_id: str) -> PowerFlowComparisonResult:
        """Get a comparison by ID — przelicza od nowa (BEZSTANOWE, patrz nagłówek)."""
        run_a_id, run_b_id = self._split_comparison_id(comparison_id)
        return self.compare(run_a_id, run_b_id)

    def get_comparison_trace(self, comparison_id: str) -> PowerFlowComparisonTrace:
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
            raise PowerFlowComparisonNotFoundError(comparison_id)
        return parts[0], parts[1]

    def _compare_full(
        self, run_a_id: str, run_b_id: str
    ) -> tuple[PowerFlowComparisonResult, PowerFlowComparisonTrace]:
        run_a = self._get_power_flow_run(run_a_id)
        run_b = self._get_power_flow_run(run_b_id)

        self._validate_run_status(run_a, run_a_id)
        self._validate_run_status(run_b, run_b_id)

        # Validate same project
        if str(run_a.project_id) != str(run_b.project_id):
            raise PowerFlowProjectMismatchError(
                str(run_a.project_id),
                str(run_b.project_id),
            )

        # Fetch results — JEDYNA projekcja (B1): zero własnego parsowania raw_result.
        result_set_a = build_resultset_v1_from_canonical_run(run_a)
        result_set_b = build_resultset_v1_from_canonical_run(run_b)

        bus_values_a = self._values_by_ref(result_set_a, "Bus")
        bus_values_b = self._values_by_ref(result_set_b, "Bus")
        branch_values_a = self._values_by_ref(result_set_a, "Branch")
        branch_values_b = self._values_by_ref(result_set_b, "Branch")

        trace_steps: list[PowerFlowComparisonTraceStep] = []

        # Step 1: Match buses
        trace_steps.append(
            PowerFlowComparisonTraceStep(
                step="MATCH_BUSES",
                description_pl="Dopasowanie szyn po element_ref (ENM ref_id)",
                inputs={
                    "buses_a_count": len(bus_values_a),
                    "buses_b_count": len(bus_values_b),
                },
                outputs={},
            )
        )
        bus_diffs = self._compute_bus_diffs(bus_values_a, bus_values_b)
        trace_steps[-1] = PowerFlowComparisonTraceStep(
            step="MATCH_BUSES",
            description_pl="Dopasowanie szyn po element_ref (ENM ref_id)",
            inputs={
                "buses_a_count": len(bus_values_a),
                "buses_b_count": len(bus_values_b),
            },
            outputs={"matched_buses": len(bus_diffs)},
        )

        # Step 2: Match branches
        trace_steps.append(
            PowerFlowComparisonTraceStep(
                step="MATCH_BRANCHES",
                description_pl="Dopasowanie galezi po element_ref (ENM ref_id)",
                inputs={
                    "branches_a_count": len(branch_values_a),
                    "branches_b_count": len(branch_values_b),
                },
                outputs={},
            )
        )
        branch_diffs = self._compute_branch_diffs(branch_values_a, branch_values_b)
        trace_steps[-1] = PowerFlowComparisonTraceStep(
            step="MATCH_BRANCHES",
            description_pl="Dopasowanie galezi po element_ref (ENM ref_id)",
            inputs={
                "branches_a_count": len(branch_values_a),
                "branches_b_count": len(branch_values_b),
            },
            outputs={"matched_branches": len(branch_diffs)},
        )

        # Step 3: Ranking
        summary_a = result_set_a.global_results
        summary_b = result_set_b.global_results
        converged_a = bool(summary_a.get("converged") or False)
        converged_b = bool(summary_b.get("converged") or False)

        trace_steps.append(
            PowerFlowComparisonTraceStep(
                step="RANK_ISSUES",
                description_pl="Generowanie rankingu problemow wg severity (5->1)",
                inputs={
                    "bus_diffs_count": len(bus_diffs),
                    "branch_diffs_count": len(branch_diffs),
                    "thresholds": get_ranking_thresholds(),
                },
                outputs={},
            )
        )
        ranking = self._generate_ranking(
            bus_diffs=bus_diffs,
            branch_diffs=branch_diffs,
            converged_a=converged_a,
            converged_b=converged_b,
            summary_a=summary_a,
            summary_b=summary_b,
        )
        severity_counts = self._count_severities(ranking)
        trace_steps[-1] = PowerFlowComparisonTraceStep(
            step="RANK_ISSUES",
            description_pl="Generowanie rankingu problemow wg severity (5->1)",
            inputs={
                "bus_diffs_count": len(bus_diffs),
                "branch_diffs_count": len(branch_diffs),
                "thresholds": get_ranking_thresholds(),
            },
            outputs={"total_issues": len(ranking), **severity_counts},
        )

        summary = self._build_summary(
            bus_diffs=bus_diffs,
            branch_diffs=branch_diffs,
            ranking=ranking,
            converged_a=converged_a,
            converged_b=converged_b,
            summary_a=summary_a,
            summary_b=summary_b,
        )

        input_hash = compute_pf_comparison_input_hash(run_a_id, run_b_id)
        comparison_id = f"{run_a_id}{_ID_SEP}{run_b_id}"
        provenance_a = RunProvenance.from_canonical_run(run_a)
        provenance_b = RunProvenance.from_canonical_run(run_b)

        result = PowerFlowComparisonResult(
            comparison_id=comparison_id,
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=str(run_a.project_id),
            bus_diffs=tuple(bus_diffs),
            branch_diffs=tuple(branch_diffs),
            ranking=tuple(ranking),
            summary=summary,
            input_hash=input_hash,
            provenance_a=provenance_a.to_dict(),
            provenance_b=provenance_b.to_dict(),
        )
        trace = PowerFlowComparisonTrace(
            comparison_id=comparison_id,
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            snapshot_hash_a=run_a.snapshot_hash,
            snapshot_hash_b=run_b.snapshot_hash,
            input_hash_a=run_a.input_hash,
            input_hash_b=run_b.input_hash,
            solver_version=str(summary_a.get("solver_method") or "unknown"),
            ranking_thresholds=get_ranking_thresholds(),
            steps=tuple(trace_steps),
        )
        return result, trace

    def _get_power_flow_run(self, run_id: str) -> CanonicalRun:
        """Get a power flow analysis run (R1 `CanonicalRun`) by ID."""
        try:
            run_uuid = UUID(run_id)
        except (ValueError, TypeError, AttributeError) as exc:
            raise PowerFlowRunNotFoundError(run_id) from exc
        run = get_run(run_uuid)
        if run is None:
            raise PowerFlowRunNotFoundError(run_id)
        if run.analysis_type != "PF":
            raise PowerFlowRunWrongTypeError(run_id, run.analysis_type)
        return run

    def _validate_run_status(self, run: CanonicalRun, run_id: str) -> None:
        """Validate that run is FINISHED."""
        if run.status != "FINISHED":
            raise PowerFlowRunNotFinishedError(run_id, run.status)

    @staticmethod
    def _values_by_ref(result_set: Any, element_type: str) -> dict[str, dict[str, Any]]:
        """Indeks `element_ref -> values` z `ResultSetV1.element_results`,
        filtrowany po typie elementu (Bus/Branch) — JEDYNE źródło pól
        porównania (B1: zero własnego parsowania raw_result)."""
        return {
            row.element_ref: row.values
            for row in result_set.element_results
            if row.element_type == element_type
        }

    def _compute_bus_diffs(
        self,
        buses_a: dict[str, dict[str, Any]],
        buses_b: dict[str, dict[str, Any]],
    ) -> list[PowerFlowBusDiffRow]:
        """
        Match buses from A and B by element_ref (ENM ref_id) and compute deltas.

        Returns:
            List of PowerFlowBusDiffRow sorted by bus_id (deterministic)
        """
        diffs: list[PowerFlowBusDiffRow] = []

        for bus_ref in dopasuj_klucze(buses_a.keys(), buses_b.keys()):
            bus_a = buses_a.get(bus_ref, {})
            bus_b = buses_b.get(bus_ref, {})

            # FAB-E (E1, zachowane): szyna obecna tylko w jednym z porownywanych
            # biegow (bus_a/bus_b puste) -> v_pu/angle_deg/delty None, NIGDY
            # fabrykowane 0.0 (wygladaloby jak calkowity zanik napiecia).
            v_pu_a = pole_lub_none(bus_a, "u_pu")
            v_pu_b = pole_lub_none(bus_b, "u_pu")
            angle_deg_a = pole_lub_none(bus_a, "angle_deg")
            angle_deg_b = pole_lub_none(bus_b, "angle_deg")
            # p_injected_mw/q_injected_mvar PER SZYNA POZOSTAJĄ 0.0: FROZEN
            # `PowerFlowResultV1.bus_results` nie niesie mocy wstrzykniętej PER
            # WĘZEŁ w ogóle — tylko per ŹRÓDŁO (element_results typu "Source",
            # patrz `enm/canonical_analysis.py::build_execution_result_set`).
            # Dług architektoniczny poza zakresem tej karty (brak pola u
            # źródła, nie błąd odczytu) — zachowany bit w bit z poprzedniej
            # wersji tego serwisu (R2), nie pogłębiony ani nie ukryty.
            p_inj_a = 0.0
            p_inj_b = 0.0
            q_inj_a = 0.0
            q_inj_b = 0.0

            diffs.append(
                PowerFlowBusDiffRow(
                    bus_id=bus_ref,
                    v_pu_a=v_pu_a,
                    v_pu_b=v_pu_b,
                    angle_deg_a=angle_deg_a,
                    angle_deg_b=angle_deg_b,
                    p_injected_mw_a=p_inj_a,
                    p_injected_mw_b=p_inj_b,
                    q_injected_mvar_a=q_inj_a,
                    q_injected_mvar_b=q_inj_b,
                    delta_v_pu=delta_lub_none(v_pu_a, v_pu_b),
                    delta_angle_deg=delta_lub_none(angle_deg_a, angle_deg_b),
                    delta_p_mw=p_inj_b - p_inj_a,
                    delta_q_mvar=q_inj_b - q_inj_a,
                    # L-13: różnica względna liczona w backendzie (nie w prezentacji).
                    delta_v_percent=procent_lub_none(v_pu_a, v_pu_b),
                    delta_angle_percent=procent_lub_none(angle_deg_a, angle_deg_b),
                    delta_p_percent=procent_roznicy(p_inj_a, p_inj_b),
                    delta_q_percent=procent_roznicy(q_inj_a, q_inj_b),
                )
            )

        return diffs

    def _compute_branch_diffs(
        self,
        branches_a: dict[str, dict[str, Any]],
        branches_b: dict[str, dict[str, Any]],
    ) -> list[PowerFlowBranchDiffRow]:
        """
        Match branches from A and B by element_ref (ENM ref_id) and compute deltas.

        Returns:
            List of PowerFlowBranchDiffRow sorted by branch_id (deterministic)
        """
        diffs: list[PowerFlowBranchDiffRow] = []

        for branch_ref in dopasuj_klucze(branches_a.keys(), branches_b.keys()):
            br_a = branches_a.get(branch_ref, {})
            br_b = branches_b.get(branch_ref, {})

            # FAB-E (E1, zachowane): galaz obecna tylko w jednym z porownywanych
            # biegow (br_a/br_b puste) -> wszystkie pola/delty None, NIGDY
            # fabrykowane 0.0 MW/Mvar (wygladaloby jak realny zanik przeplywu).
            p_from_a = pole_lub_none(br_a, "p_from_mw")
            p_from_b = pole_lub_none(br_b, "p_from_mw")
            q_from_a = pole_lub_none(br_a, "q_from_mvar")
            q_from_b = pole_lub_none(br_b, "q_from_mvar")
            p_to_a = pole_lub_none(br_a, "p_to_mw")
            p_to_b = pole_lub_none(br_b, "p_to_mw")
            q_to_a = pole_lub_none(br_a, "q_to_mvar")
            q_to_b = pole_lub_none(br_b, "q_to_mvar")
            losses_p_a = pole_lub_none(br_a, "losses_p_mw")
            losses_p_b = pole_lub_none(br_b, "losses_p_mw")
            losses_q_a = pole_lub_none(br_a, "losses_q_mvar")
            losses_q_b = pole_lub_none(br_b, "losses_q_mvar")

            diffs.append(
                PowerFlowBranchDiffRow(
                    branch_id=branch_ref,
                    p_from_mw_a=p_from_a,
                    p_from_mw_b=p_from_b,
                    q_from_mvar_a=q_from_a,
                    q_from_mvar_b=q_from_b,
                    p_to_mw_a=p_to_a,
                    p_to_mw_b=p_to_b,
                    q_to_mvar_a=q_to_a,
                    q_to_mvar_b=q_to_b,
                    losses_p_mw_a=losses_p_a,
                    losses_p_mw_b=losses_p_b,
                    losses_q_mvar_a=losses_q_a,
                    losses_q_mvar_b=losses_q_b,
                    delta_p_from_mw=delta_lub_none(p_from_a, p_from_b),
                    delta_q_from_mvar=delta_lub_none(q_from_a, q_from_b),
                    delta_p_to_mw=delta_lub_none(p_to_a, p_to_b),
                    delta_q_to_mvar=delta_lub_none(q_to_a, q_to_b),
                    delta_losses_p_mw=delta_lub_none(losses_p_a, losses_p_b),
                    delta_losses_q_mvar=delta_lub_none(losses_q_a, losses_q_b),
                    # L-13: różnica względna liczona w backendzie (nie w prezentacji).
                    delta_p_from_percent=procent_lub_none(p_from_a, p_from_b),
                    delta_q_from_percent=procent_lub_none(q_from_a, q_from_b),
                    delta_p_to_percent=procent_lub_none(p_to_a, p_to_b),
                    delta_q_to_percent=procent_lub_none(q_to_a, q_to_b),
                    delta_losses_p_percent=procent_lub_none(losses_p_a, losses_p_b),
                    delta_losses_q_percent=procent_lub_none(losses_q_a, losses_q_b),
                )
            )

        return diffs

    def _generate_ranking(
        self,
        bus_diffs: list[PowerFlowBusDiffRow],
        branch_diffs: list[PowerFlowBranchDiffRow],
        converged_a: bool,
        converged_b: bool,
        summary_a: dict[str, Any],
        summary_b: dict[str, Any],
    ) -> list[PowerFlowRankingIssue]:
        """
        Generate deterministic issue ranking.

        Rules (explicit):
        1. converged A != B → severity 5 (NON_CONVERGENCE_CHANGE)
        2. top N largest |delta_v_pu| → severity 4 (VOLTAGE_DELTA_HIGH)
        3. top N largest delta total_losses_p_mw (increase) → severity 3 (LOSSES_INCREASED)
        4. rest by thresholds → severity 1-2

        Sorted by severity (DESC), then issue_code, then element_ref.
        """
        issues: list[PowerFlowRankingIssue] = []

        # Rule 1: Convergence change
        if converged_a != converged_b:
            issues.append(
                self._create_issue(
                    PowerFlowIssueCode.NON_CONVERGENCE_CHANGE,
                    "system",
                    -1,  # No specific element
                    extra_info=f"A={converged_a}, B={converged_b}",
                )
            )

        # Rule 2: Top N largest |delta_v_pu|. FAB-E (E1): szyna obecna tylko w
        # jednym z porownywanych biegow ma delta_v_pu=None (nie ma jak
        # policzyc "jak bardzo sie zmienilo" — pomijamy w rankingu, nie
        # traktujemy jako 0 pu, co ukryloby ja jako "bez zmian").
        voltage_deltas = [
            (idx, abs(bus.delta_v_pu), bus.bus_id)
            for idx, bus in enumerate(bus_diffs)
            if bus.delta_v_pu is not None
        ]
        voltage_deltas.sort(
            key=lambda x: (-x[1], x[2])
        )  # Sort by delta DESC, then bus_id for determinism

        for _rank, (idx, abs_delta, bus_id) in enumerate(voltage_deltas[:TOP_N_FOR_RANKING]):
            if abs_delta >= VOLTAGE_DELTA_THRESHOLD_PU:
                issues.append(
                    self._create_issue(
                        PowerFlowIssueCode.VOLTAGE_DELTA_HIGH,
                        bus_id,
                        idx,
                        extra_info=f"DeltaV = {bus_diffs[idx].delta_v_pu:.4f} pu",
                    )
                )

        # Rule 3: Angle shift (top N largest |delta_angle_deg|). FAB-E (E1): jak
        # wyzej — szyna bez delta_angle_deg pomijana w rankingu, nie 0 deg.
        angle_deltas = [
            (idx, abs(bus.delta_angle_deg), bus.bus_id)
            for idx, bus in enumerate(bus_diffs)
            if bus.delta_angle_deg is not None
        ]
        angle_deltas.sort(key=lambda x: (-x[1], x[2]))

        for _rank, (idx, abs_delta, bus_id) in enumerate(angle_deltas[:TOP_N_FOR_RANKING]):
            if abs_delta >= ANGLE_DELTA_THRESHOLD_DEG:
                issues.append(
                    self._create_issue(
                        PowerFlowIssueCode.ANGLE_SHIFT_HIGH,
                        bus_id,
                        idx,
                        extra_info=f"DeltaAngle = {bus_diffs[idx].delta_angle_deg:.2f} deg",
                    )
                )

        # Rule 4: Total losses change. `summary_a`/`summary_b` sa
        # `ResultSetV1.global_results` obu biegow — dla KAZDEGO zakonczonego
        # biegu PF niosa WSZYSTKIE 6 kluczy `PowerFlowSummary` (FROZEN,
        # bezwarunkowo zapisywane przez solver) — subskrypcja z domyslna
        # wartoscia jest tu obrona przed nieistniejacym przypadkiem, nie
        # cichym maskowaniem braku.
        total_losses_a = float(summary_a.get("total_losses_p_mw", 0.0))
        total_losses_b = float(summary_b.get("total_losses_p_mw", 0.0))
        delta_losses = total_losses_b - total_losses_a

        if delta_losses > LOSSES_INCREASE_THRESHOLD_MW:
            issues.append(
                self._create_issue(
                    PowerFlowIssueCode.LOSSES_INCREASED,
                    "system",
                    -1,
                    extra_info=f"DeltaLosses = +{delta_losses:.3f} MW",
                )
            )
        elif delta_losses < -LOSSES_DECREASE_THRESHOLD_MW:
            issues.append(
                self._create_issue(
                    PowerFlowIssueCode.LOSSES_DECREASED,
                    "system",
                    -1,
                    extra_info=f"DeltaLosses = {delta_losses:.3f} MW",
                )
            )

        # Rule 5: Slack power change
        slack_p_a = float(summary_a.get("slack_p_mw", 0.0))
        slack_p_b = float(summary_b.get("slack_p_mw", 0.0))
        delta_slack = abs(slack_p_b - slack_p_a)

        if delta_slack > SLACK_POWER_CHANGE_THRESHOLD_MW:
            issues.append(
                self._create_issue(
                    PowerFlowIssueCode.SLACK_POWER_CHANGED,
                    "slack",
                    -1,
                    extra_info=f"DeltaSlackP = {slack_p_b - slack_p_a:.3f} MW",
                )
            )

        # Sort by severity DESC, then issue_code, then element_ref (deterministic)
        issues.sort(key=lambda i: (-i.severity.value, i.issue_code.value, i.element_ref))

        return issues

    def _create_issue(
        self,
        issue_code: PowerFlowIssueCode,
        element_ref: str,
        evidence_ref: int,
        extra_info: str = "",
    ) -> PowerFlowRankingIssue:
        """
        Create a ranking issue with Polish description.
        """
        base_description = ISSUE_DESCRIPTIONS_PL.get(issue_code, issue_code.value)
        description = f"{base_description} ({extra_info})" if extra_info else base_description

        # FAB-E (E2): brak wpisu w ISSUE_SEVERITY_MAP dla ten kodu problemu to
        # dziura w kontrakcie (nowy PowerFlowIssueCode bez przypisanej
        # surowosci) — nie wolno cicho podstawiac INFORMATIONAL, bo to
        # zafalszowaloby priorytet realnego problemu. Mapa pokrywa dzis
        # WSZYSTKIE elementy PowerFlowIssueCode (patrz test kompletnosci w
        # tests/domain/test_power_flow_comparison_severity_map.py) — subskrypcja
        # wprost zamiast `.get(..., default)` sprawia, ze przyszla luka rzuci
        # KeyError zamiast cicho zanizyc priorytet.
        return PowerFlowRankingIssue(
            issue_code=issue_code,
            severity=ISSUE_SEVERITY_MAP[issue_code],
            element_ref=element_ref,
            description_pl=description,
            evidence_ref=evidence_ref,
        )

    def _count_severities(self, ranking: list[PowerFlowRankingIssue]) -> dict[str, int]:
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
            if issue.severity == PowerFlowIssueSeverity.CRITICAL:
                counts["critical_issues"] += 1
            elif issue.severity == PowerFlowIssueSeverity.MAJOR:
                counts["major_issues"] += 1
            elif issue.severity == PowerFlowIssueSeverity.MODERATE:
                counts["moderate_issues"] += 1
            elif issue.severity == PowerFlowIssueSeverity.MINOR:
                counts["minor_issues"] += 1
            else:
                counts["informational_issues"] += 1

        return counts

    def _build_summary(
        self,
        bus_diffs: list[PowerFlowBusDiffRow],
        branch_diffs: list[PowerFlowBranchDiffRow],
        ranking: list[PowerFlowRankingIssue],
        converged_a: bool,
        converged_b: bool,
        summary_a: dict[str, Any],
        summary_b: dict[str, Any],
    ) -> PowerFlowComparisonSummary:
        """
        Build comparison summary.
        """
        severities = self._count_severities(ranking)

        total_losses_a = float(summary_a.get("total_losses_p_mw", 0.0))
        total_losses_b = float(summary_b.get("total_losses_p_mw", 0.0))

        # FAB-E (E1): szyny bez porownywalnej delty (obecne tylko w jednym
        # biegu) pomijane — max z PUSTEJ sekwencji (zaden wspolny bus) to
        # None, nie fikcyjne 0.0 (wygladaloby jak "brak zmian w calej sieci").
        max_delta_v = max(
            (abs(b.delta_v_pu) for b in bus_diffs if b.delta_v_pu is not None), default=None
        )
        max_delta_angle = max(
            (abs(b.delta_angle_deg) for b in bus_diffs if b.delta_angle_deg is not None),
            default=None,
        )

        return PowerFlowComparisonSummary(
            total_buses=len(bus_diffs),
            total_branches=len(branch_diffs),
            converged_a=converged_a,
            converged_b=converged_b,
            total_losses_p_mw_a=total_losses_a,
            total_losses_p_mw_b=total_losses_b,
            delta_total_losses_p_mw=total_losses_b - total_losses_a,
            max_delta_v_pu=max_delta_v,
            max_delta_angle_deg=max_delta_angle,
            total_issues=len(ranking),
            critical_issues=severities["critical_issues"],
            major_issues=severities["major_issues"],
            moderate_issues=severities["moderate_issues"],
            minor_issues=severities["minor_issues"],
            # L-13: względna zmiana strat całkowitych [%].
            delta_total_losses_p_percent=procent_roznicy(total_losses_a, total_losses_b),
        )
