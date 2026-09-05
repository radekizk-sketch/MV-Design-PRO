"""
Power Flow Comparison Service — P20c (A/B)

Orchestrates power flow comparison:
1. VALIDATE: Both runs FINISHED, same project
2. FETCH: Get PowerFlowResult for each run
3. COMPARE: Match buses/branches, compute deltas
4. RANK: Generate deterministic issue ranking
5. TRACE: Record all steps for audit

INVARIANTS (BINDING):
1. READ-ONLY: Zero physics calculations, zero state mutations
2. SAME PROJECT: Both runs must belong to the same project
3. FINISHED ONLY: Both runs must be FINISHED status
4. DETERMINISTIC: Same inputs → identical outputs
5. NO NORMATIVE INTERPRETATION: Only factual comparison (no voltage limit violations)
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from domain.analysis_run import AnalysisRun
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
    PowerFlowComparison,
    PowerFlowComparisonError,
    PowerFlowComparisonNotFoundError,
    PowerFlowComparisonResult,
    PowerFlowComparisonStatus,
    PowerFlowComparisonSummary,
    PowerFlowComparisonTrace,
    PowerFlowComparisonTraceStep,
    PowerFlowIssueCode,
    PowerFlowIssueSeverity,
    PowerFlowProjectMismatchError,
    PowerFlowRankingIssue,
    PowerFlowResultNotFoundError,
    PowerFlowRunNotFinishedError,
    PowerFlowRunNotFoundError,
    compute_pf_comparison_input_hash,
    get_ranking_thresholds,
    procent_roznicy,
)
from infrastructure.persistence.unit_of_work import UnitOfWork

# =============================================================================
# POWER FLOW COMPARISON SERVICE
# =============================================================================


class PowerFlowComparisonService:
    """
    Service for comparing two power flow analysis runs.

    P20c: Main entry point for power flow A/B comparison.

    USAGE:
        service = PowerFlowComparisonService(uow_factory)
        result = service.compare(run_a_id, run_b_id)
    """

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def compare(
        self,
        run_a_id: str,
        run_b_id: str,
    ) -> PowerFlowComparisonResult:
        """
        Compare two power flow analysis runs.

        Args:
            run_a_id: First power flow run ID (baseline)
            run_b_id: Second power flow run ID (comparison)

        Returns:
            PowerFlowComparisonResult with bus_diffs, branch_diffs, ranking, and trace

        Raises:
            PowerFlowRunNotFoundError: If a run doesn't exist
            PowerFlowRunNotFinishedError: If a run is not FINISHED
            PowerFlowProjectMismatchError: If runs belong to different projects
            PowerFlowResultNotFoundError: If results not found for a run
        """
        with self._uow_factory() as uow:
            # 1. Fetch and validate both runs
            run_a = self._get_power_flow_run(uow, run_a_id)
            run_b = self._get_power_flow_run(uow, run_b_id)

            self._validate_run_status(run_a, run_a_id)
            self._validate_run_status(run_b, run_b_id)

            # 2. Validate same project
            if str(run_a.project_id) != str(run_b.project_id):
                raise PowerFlowProjectMismatchError(
                    str(run_a.project_id),
                    str(run_b.project_id),
                )

            # 3. Check cache (same input_hash)
            input_hash = compute_pf_comparison_input_hash(run_a_id, run_b_id)
            cached_comparison = self._get_cached_comparison(uow, input_hash)
            if cached_comparison is not None and cached_comparison.result_json is not None:
                return PowerFlowComparisonResult.from_dict(cached_comparison.result_json)

            # 4. Fetch results
            result_a = self._get_power_flow_result(uow, run_a_id)
            result_b = self._get_power_flow_result(uow, run_b_id)

            # 5. Initialize trace
            trace_steps: list[PowerFlowComparisonTraceStep] = []

            # 6. Step 1: Match buses
            trace_steps.append(
                PowerFlowComparisonTraceStep(
                    step="MATCH_BUSES",
                    description_pl="Dopasowanie szyn po bus_id",
                    inputs={
                        "buses_a_count": len(result_a.get("bus_results", [])),
                        "buses_b_count": len(result_b.get("bus_results", [])),
                    },
                    outputs={},
                )
            )

            bus_diffs = self._compute_bus_diffs(
                result_a.get("bus_results", []),
                result_b.get("bus_results", []),
            )

            trace_steps[-1] = PowerFlowComparisonTraceStep(
                step="MATCH_BUSES",
                description_pl="Dopasowanie szyn po bus_id",
                inputs={
                    "buses_a_count": len(result_a.get("bus_results", [])),
                    "buses_b_count": len(result_b.get("bus_results", [])),
                },
                outputs={
                    "matched_buses": len(bus_diffs),
                },
            )

            # 7. Step 2: Match branches
            trace_steps.append(
                PowerFlowComparisonTraceStep(
                    step="MATCH_BRANCHES",
                    description_pl="Dopasowanie galezi po branch_id",
                    inputs={
                        "branches_a_count": len(result_a.get("branch_results", [])),
                        "branches_b_count": len(result_b.get("branch_results", [])),
                    },
                    outputs={},
                )
            )

            branch_diffs = self._compute_branch_diffs(
                result_a.get("branch_results", []),
                result_b.get("branch_results", []),
            )

            trace_steps[-1] = PowerFlowComparisonTraceStep(
                step="MATCH_BRANCHES",
                description_pl="Dopasowanie galezi po branch_id",
                inputs={
                    "branches_a_count": len(result_a.get("branch_results", [])),
                    "branches_b_count": len(result_b.get("branch_results", [])),
                },
                outputs={
                    "matched_branches": len(branch_diffs),
                },
            )

            # 8. Step 3: Generate ranking
            converged_a = result_a.get("converged", False)
            converged_b = result_b.get("converged", False)
            summary_a = result_a.get("summary", {})
            summary_b = result_b.get("summary", {})

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
                outputs={
                    "total_issues": len(ranking),
                    **severity_counts,
                },
            )

            # 9. Build summary
            summary = self._build_summary(
                bus_diffs=bus_diffs,
                branch_diffs=branch_diffs,
                ranking=ranking,
                converged_a=converged_a,
                converged_b=converged_b,
                summary_a=summary_a,
                summary_b=summary_b,
            )

            # 10. Build result
            comparison_id = str(UUID(int=hash((run_a_id, run_b_id, input_hash)) % (2**128)))

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
            )

            # 11. Build trace
            trace = PowerFlowComparisonTrace(
                comparison_id=comparison_id,
                run_a_id=run_a_id,
                run_b_id=run_b_id,
                snapshot_id_a=(
                    run_a.input_snapshot.get("snapshot_id") if run_a.input_snapshot else None
                ),
                snapshot_id_b=(
                    run_b.input_snapshot.get("snapshot_id") if run_b.input_snapshot else None
                ),
                input_hash_a=run_a.input_hash,
                input_hash_b=run_b.input_hash,
                solver_version="1.0.0",
                ranking_thresholds=get_ranking_thresholds(),
                steps=tuple(trace_steps),
            )

            # 12. Store comparison in cache
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

    def get_comparison(self, comparison_id: str) -> PowerFlowComparisonResult:
        """
        Get a comparison by ID.
        """
        with self._uow_factory() as uow:
            comparison = self._get_comparison_by_id(uow, comparison_id)
            if comparison is None or comparison.result_json is None:
                raise PowerFlowComparisonNotFoundError(comparison_id)
            return PowerFlowComparisonResult.from_dict(comparison.result_json)

    def get_comparison_trace(self, comparison_id: str) -> PowerFlowComparisonTrace:
        """
        Get the trace for a comparison.
        """
        with self._uow_factory() as uow:
            comparison = self._get_comparison_by_id(uow, comparison_id)
            if comparison is None or comparison.trace_json is None:
                raise PowerFlowComparisonNotFoundError(comparison_id)
            return PowerFlowComparisonTrace.from_dict(comparison.trace_json)

    # =========================================================================
    # PRIVATE METHODS
    # =========================================================================

    def _get_power_flow_run(self, uow: UnitOfWork, run_id: str) -> AnalysisRun:
        """
        Get a power flow analysis run by ID.
        """
        try:
            run_uuid = UUID(run_id)
            # Try to get from analysis runs
            from application.analysis_run import AnalysisRunService

            service = AnalysisRunService(lambda: uow)
            run = service.get_run(run_uuid)
            if run.analysis_type != "PF":
                raise PowerFlowRunNotFoundError(run_id)
            return run
        except (ValueError, TypeError):
            raise PowerFlowRunNotFoundError(run_id)
        except Exception:
            raise PowerFlowRunNotFoundError(run_id)

    def _validate_run_status(self, run: AnalysisRun, run_id: str) -> None:
        """
        Validate that run is FINISHED.
        """
        if run.status != "FINISHED":
            raise PowerFlowRunNotFinishedError(run_id, run.status)

    def _get_power_flow_result(self, uow: UnitOfWork, run_id: str) -> dict[str, Any]:
        """
        Get PowerFlowResult for a run.
        """
        try:
            run_uuid = UUID(run_id)
            results = uow.results.list_results(run_uuid)
            for result in results:
                if result.get("result_type") == "power_flow":
                    payload = result.get("payload", {})
                    # Build PowerFlowResultV1-compatible structure
                    return self._build_pf_result_from_payload(payload, run_uuid, uow)
        except (ValueError, TypeError):
            pass
        raise PowerFlowResultNotFoundError(run_id)

    def _build_pf_result_from_payload(
        self,
        payload: dict[str, Any],
        run_uuid: UUID,
        uow: UnitOfWork,
    ) -> dict[str, Any]:
        """
        Build PowerFlowResultV1-compatible dict from raw payload.
        """
        import math

        # FAB-E (E1): base_mva SKALUJE total_losses/slack_p/slack_q ponizej
        # (* base_mva) — zamrozony kontrakt (analysis/power_flow/result.py::
        # PowerFlowResult.base_mva) wymaga tego pola bez domyslnej wartosci;
        # milczace 100.0 dalo by PRAWDOPODOBNIE-WYGLADAJACE, ale BLEDNE MW/Mvar
        # dla kazdej sieci o innej bazie mocy — gorsze niz jawna odmowa.
        base_mva_raw = payload.get("base_mva")
        if base_mva_raw is None:
            raise PowerFlowComparisonError(
                f"Zapis wyniku rozplywu dla biegu {run_uuid} nie ma wymaganego pola "
                "'base_mva' — zapis biegu jest uszkodzony, porownanie nie moze sie na "
                "nim oprzec (bledna baza mocy dalaby fikcyjnie przeskalowane straty/moc "
                "wezla bilansujacego)."
            )
        base_mva = float(base_mva_raw)
        slack_node_id = payload.get("slack_node_id", "")

        # Bus results (deterministycznie posortowane)
        node_u_mag = payload.get("node_u_mag_pu", {})
        node_angle_rad = payload.get("node_angle_rad", {})
        bus_results = []
        for bus_id in sorted(node_u_mag.keys()):
            v_pu = node_u_mag.get(bus_id, 0.0)
            angle_rad = node_angle_rad.get(bus_id, 0.0)
            angle_deg = math.degrees(angle_rad)
            bus_results.append(
                {
                    "bus_id": bus_id,
                    "v_pu": v_pu,
                    "angle_deg": angle_deg,
                    "p_injected_mw": 0.0,
                    "q_injected_mvar": 0.0,
                }
            )

        # Branch results (deterministycznie posortowane)
        branch_s_from = payload.get("branch_s_from_mva", {})
        branch_s_to = payload.get("branch_s_to_mva", {})
        branch_results = []
        for branch_id in sorted(branch_s_from.keys()):
            s_from = branch_s_from.get(branch_id, {"re": 0.0, "im": 0.0})
            s_to = branch_s_to.get(branch_id, {"re": 0.0, "im": 0.0})
            p_from = (
                s_from.get("re", 0.0) if isinstance(s_from, dict) else getattr(s_from, "real", 0.0)
            )
            q_from = (
                s_from.get("im", 0.0) if isinstance(s_from, dict) else getattr(s_from, "imag", 0.0)
            )
            p_to = s_to.get("re", 0.0) if isinstance(s_to, dict) else getattr(s_to, "real", 0.0)
            q_to = s_to.get("im", 0.0) if isinstance(s_to, dict) else getattr(s_to, "imag", 0.0)
            losses_p = p_from + p_to
            losses_q = q_from + q_to
            branch_results.append(
                {
                    "branch_id": branch_id,
                    "p_from_mw": p_from,
                    "q_from_mvar": q_from,
                    "p_to_mw": p_to,
                    "q_to_mvar": q_to,
                    "losses_p_mw": losses_p,
                    "losses_q_mvar": losses_q,
                }
            )

        # Summary
        losses_total = payload.get("losses_total_pu", {"re": 0.0, "im": 0.0})
        slack_power = payload.get("slack_power_pu", {"re": 0.0, "im": 0.0})
        v_values = list(node_u_mag.values())
        min_v = min(v_values) if v_values else 0.0
        max_v = max(v_values) if v_values else 0.0

        total_losses_p = (
            losses_total.get("re", 0.0)
            if isinstance(losses_total, dict)
            else getattr(losses_total, "real", 0.0)
        ) * base_mva
        total_losses_q = (
            losses_total.get("im", 0.0)
            if isinstance(losses_total, dict)
            else getattr(losses_total, "imag", 0.0)
        ) * base_mva
        slack_p = (
            slack_power.get("re", 0.0)
            if isinstance(slack_power, dict)
            else getattr(slack_power, "real", 0.0)
        ) * base_mva
        slack_q = (
            slack_power.get("im", 0.0)
            if isinstance(slack_power, dict)
            else getattr(slack_power, "imag", 0.0)
        ) * base_mva

        # Get convergence from run
        from application.analysis_run import AnalysisRunService

        service = AnalysisRunService(lambda: uow)
        run = service.get_run(run_uuid)
        result_summary = run.result_summary or {}
        converged = result_summary.get("converged", False)

        return {
            "converged": converged,
            # FAB-E: "iterations_count" nigdzie w tym module nie jest czytane
            # (zweryfikowane grepem) — metadana solvera, nie wielkosc fizyczna;
            # domyslne 0 bezpieczne/udokumentowane, spojnie z tym samym
            # ustaleniem w analyses/voltage_profile_view.py.
            "iterations_count": result_summary.get("iterations", 0),
            "base_mva": base_mva,
            "slack_bus_id": slack_node_id,
            "bus_results": bus_results,
            "branch_results": branch_results,
            "summary": {
                "total_losses_p_mw": total_losses_p,
                "total_losses_q_mvar": total_losses_q,
                "min_v_pu": min_v,
                "max_v_pu": max_v,
                "slack_p_mw": slack_p,
                "slack_q_mvar": slack_q,
            },
        }

    def _get_cached_comparison(
        self, uow: UnitOfWork, input_hash: str
    ) -> PowerFlowComparison | None:
        """
        Check for cached comparison with same input_hash.
        """
        try:
            results = uow.results.list_by_type("power_flow_comparison")
            for result in results:
                payload = result.get("payload", {})
                if payload.get("input_hash") == input_hash:
                    return PowerFlowComparison.from_dict(payload)
        except Exception:
            pass
        return None

    def _get_comparison_by_id(
        self, uow: UnitOfWork, comparison_id: str
    ) -> PowerFlowComparison | None:
        """
        Get a comparison by ID.
        """
        try:
            comparison_uuid = UUID(comparison_id)
            results = uow.results.list_results(comparison_uuid)
            for result in results:
                if result.get("result_type") == "power_flow_comparison":
                    return PowerFlowComparison.from_dict(result.get("payload", {}))
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
        result: PowerFlowComparisonResult,
        trace: PowerFlowComparisonTrace,
    ) -> None:
        """
        Store comparison result and trace.
        """
        comparison = PowerFlowComparison(
            id=(
                UUID(result.comparison_id)
                if self._is_valid_uuid(result.comparison_id)
                else UUID(int=hash(result.comparison_id) % (2**128))
            ),
            project_id=project_id,
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            status=PowerFlowComparisonStatus.FINISHED,
            input_hash=input_hash,
            result_json=result.to_dict(),
            trace_json=trace.to_dict(),
            finished_at=datetime.now(UTC),
        )

        uow.results.add_result(
            run_id=comparison.id,
            project_id=project_id,
            result_type="power_flow_comparison",
            payload=comparison.to_dict(),
        )

    def _is_valid_uuid(self, value: str) -> bool:
        """Check if string is a valid UUID."""
        try:
            UUID(value)
            return True
        except (ValueError, TypeError):
            return False

    def _compute_bus_diffs(
        self,
        buses_a: list[dict[str, Any]],
        buses_b: list[dict[str, Any]],
    ) -> list[PowerFlowBusDiffRow]:
        """
        Match buses from A and B by bus_id and compute deltas.

        Returns:
            List of PowerFlowBusDiffRow sorted by bus_id (deterministic)
        """
        # Build index of A buses
        index_a: dict[str, dict[str, Any]] = {}
        for bus in buses_a:
            index_a[bus["bus_id"]] = bus

        # Build index of B buses
        index_b: dict[str, dict[str, Any]] = {}
        for bus in buses_b:
            index_b[bus["bus_id"]] = bus

        # All unique bus IDs, sorted deterministically
        all_bus_ids = sorted(set(index_a.keys()) | set(index_b.keys()))

        diffs: list[PowerFlowBusDiffRow] = []

        for bus_id in all_bus_ids:
            bus_a = index_a.get(bus_id, {})
            bus_b = index_b.get(bus_id, {})

            # FAB-E (E1): szyna obecna tylko w jednym z porownywanych biegow
            # (bus_a/bus_b = {}) -> v_pu/angle_deg/delty None, NIGDY fabrykowane
            # 0.0 (wygladaloby jak calkowity zanik napiecia). p_injected_mw/
            # q_injected_mvar POZOSTAJA 0.0: zapis wyniku rozplywu
            # (analysis/power_flow/result.py::PowerFlowResult) nie niesie mocy
            # wstrzykniętej PER WEZEL w ogole (dlug architektoniczny poza
            # zakresem tej karty — brak pola u zrodla, nie blad odczytu; patrz
            # raport FAB-E i _build_pf_result_from_payload).
            v_pu_a = self._pole_lub_none(bus_a, "v_pu")
            v_pu_b = self._pole_lub_none(bus_b, "v_pu")
            angle_deg_a = self._pole_lub_none(bus_a, "angle_deg")
            angle_deg_b = self._pole_lub_none(bus_b, "angle_deg")
            p_inj_a = float(bus_a.get("p_injected_mw", 0.0))
            p_inj_b = float(bus_b.get("p_injected_mw", 0.0))
            q_inj_a = float(bus_a.get("q_injected_mvar", 0.0))
            q_inj_b = float(bus_b.get("q_injected_mvar", 0.0))

            diff = PowerFlowBusDiffRow(
                bus_id=bus_id,
                v_pu_a=v_pu_a,
                v_pu_b=v_pu_b,
                angle_deg_a=angle_deg_a,
                angle_deg_b=angle_deg_b,
                p_injected_mw_a=p_inj_a,
                p_injected_mw_b=p_inj_b,
                q_injected_mvar_a=q_inj_a,
                q_injected_mvar_b=q_inj_b,
                delta_v_pu=self._delta_lub_none(v_pu_a, v_pu_b),
                delta_angle_deg=self._delta_lub_none(angle_deg_a, angle_deg_b),
                delta_p_mw=p_inj_b - p_inj_a,
                delta_q_mvar=q_inj_b - q_inj_a,
                # L-13: różnica względna liczona w backendzie (nie w prezentacji).
                delta_v_percent=self._procent_lub_none(v_pu_a, v_pu_b),
                delta_angle_percent=self._procent_lub_none(angle_deg_a, angle_deg_b),
                delta_p_percent=procent_roznicy(p_inj_a, p_inj_b),
                delta_q_percent=procent_roznicy(q_inj_a, q_inj_b),
            )
            diffs.append(diff)

        return diffs

    @staticmethod
    def _pole_lub_none(zrodlo: dict[str, Any], klucz: str) -> float | None:
        """Pole liczbowe wiersza porownania — None, gdy brak (nie fikcyjne 0.0)."""
        wartosc = zrodlo.get(klucz)
        return float(wartosc) if wartosc is not None else None

    @staticmethod
    def _delta_lub_none(a: float | None, b: float | None) -> float | None:
        """Delta (B - A) — None, gdy KTORAKOLWIEK strona nie ma wartosci."""
        if a is None or b is None:
            return None
        return b - a

    @staticmethod
    def _procent_lub_none(a: float | None, b: float | None) -> float | None:
        """Jak `procent_roznicy`, ale None gdy KTORAKOLWIEK strona nie ma wartosci."""
        if a is None or b is None:
            return None
        return procent_roznicy(a, b)

    def _compute_branch_diffs(
        self,
        branches_a: list[dict[str, Any]],
        branches_b: list[dict[str, Any]],
    ) -> list[PowerFlowBranchDiffRow]:
        """
        Match branches from A and B by branch_id and compute deltas.

        Returns:
            List of PowerFlowBranchDiffRow sorted by branch_id (deterministic)
        """
        # Build index of A branches
        index_a: dict[str, dict[str, Any]] = {}
        for branch in branches_a:
            index_a[branch["branch_id"]] = branch

        # Build index of B branches
        index_b: dict[str, dict[str, Any]] = {}
        for branch in branches_b:
            index_b[branch["branch_id"]] = branch

        # All unique branch IDs, sorted deterministically
        all_branch_ids = sorted(set(index_a.keys()) | set(index_b.keys()))

        diffs: list[PowerFlowBranchDiffRow] = []

        for branch_id in all_branch_ids:
            br_a = index_a.get(branch_id, {})
            br_b = index_b.get(branch_id, {})

            # FAB-E (E1): galaz obecna tylko w jednym z porownywanych biegow
            # (br_a/br_b = {}) -> wszystkie pola/delty None, NIGDY fabrykowane
            # 0.0 MW/Mvar (wygladaloby jak realny zanik przeplywu).
            p_from_a = self._pole_lub_none(br_a, "p_from_mw")
            p_from_b = self._pole_lub_none(br_b, "p_from_mw")
            q_from_a = self._pole_lub_none(br_a, "q_from_mvar")
            q_from_b = self._pole_lub_none(br_b, "q_from_mvar")
            p_to_a = self._pole_lub_none(br_a, "p_to_mw")
            p_to_b = self._pole_lub_none(br_b, "p_to_mw")
            q_to_a = self._pole_lub_none(br_a, "q_to_mvar")
            q_to_b = self._pole_lub_none(br_b, "q_to_mvar")
            losses_p_a = self._pole_lub_none(br_a, "losses_p_mw")
            losses_p_b = self._pole_lub_none(br_b, "losses_p_mw")
            losses_q_a = self._pole_lub_none(br_a, "losses_q_mvar")
            losses_q_b = self._pole_lub_none(br_b, "losses_q_mvar")

            diff = PowerFlowBranchDiffRow(
                branch_id=branch_id,
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
                delta_p_from_mw=self._delta_lub_none(p_from_a, p_from_b),
                delta_q_from_mvar=self._delta_lub_none(q_from_a, q_from_b),
                delta_p_to_mw=self._delta_lub_none(p_to_a, p_to_b),
                delta_q_to_mvar=self._delta_lub_none(q_to_a, q_to_b),
                delta_losses_p_mw=self._delta_lub_none(losses_p_a, losses_p_b),
                delta_losses_q_mvar=self._delta_lub_none(losses_q_a, losses_q_b),
                # L-13: różnica względna liczona w backendzie (nie w prezentacji).
                delta_p_from_percent=self._procent_lub_none(p_from_a, p_from_b),
                delta_q_from_percent=self._procent_lub_none(q_from_a, q_from_b),
                delta_p_to_percent=self._procent_lub_none(p_to_a, p_to_b),
                delta_q_to_percent=self._procent_lub_none(q_to_a, q_to_b),
                delta_losses_p_percent=self._procent_lub_none(losses_p_a, losses_p_b),
                delta_losses_q_percent=self._procent_lub_none(losses_q_a, losses_q_b),
            )
            diffs.append(diff)

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

        # Rule 4: Total losses change. FAB-E: summary_a/summary_b pochodza
        # WYLACZNIE z _build_pf_result_from_payload, ktora konstruuje slownik
        # "summary" bezwarunkowo ze WSZYSTKIMI 6 kluczami (zawsze obecny) — klucz
        # tu nie brakuje nigdy; jedyne ryzyko bledu bylo w base_mva (naprawione
        # powyzej: odmowa zamiast domyslnej bazy mocy). Domyslny odczyt tutaj
        # bezpieczny/zweryfikowany, nie fabrykacja.
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
