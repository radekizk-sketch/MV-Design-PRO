"""
P10b Comparison Service — Case A/B Result Comparison, tor kanoniczny (CV-3.3-B)

CANONICAL ALIGNMENT:
- P10b: Result State + Case A/B Comparison (BACKEND ONLY)
- Read-only comparison between two biegów R1 (`enm.canonical_analysis.CanonicalRun`)
- No physics, no mutations, no solver invocation

INVARIANTS (BINDING):
1. READ-ONLY: Zero physics calculations, zero state mutations
2. SAME PROJECT: Both runs must belong to the same project
3. DATA FROM R1: `ResultSetV1` (`build_resultset_v1_from_canonical_run` —
   JEDYNY producent projekcji wyników; zero własnego parsowania raw_result)
4. DETERMINISTIC: Same inputs produce identical comparison output

ZAKRES ZWARCIOWY (świadomie zawężony — B1, karta CV-3.3-B). Bieg zwarciowy R1
jest SWEEP-em wielu punktów zwarcia (jeden wiersz per szyna), a kontrakt
`ShortCircuitComparison` (`domain/results.py`) niesie POJEDYNCZĄ deltę — ten
sam kształt, jaki miał R2/R3 (jeden payload na bieg). Porównanie ogólne bierze
WSPÓLNY element obu biegów, PIERWSZY po sortowaniu `element_ref` — deterministyczny
wybór reprezentanta, nie próba fizyki. Pełne porównanie PER SZYNA istnieje już
dla rozpływu mocy (`node_voltages`/`branch_powers` niżej) — dla zwarć per-punkt
dają go dedykowane ekrany zwarciowe (poza tą kartą; ten endpoint jest ogólnym,
lekkim porównaniem P10b, nie zamiennikiem dedykowanych ekranów P20c/P15b).

USAGE:
    service = ComparisonService()
    result = service.compare_runs(run_a_id, run_b_id)
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from analysis.comparison_diffs import RunProvenance, dopasuj_klucze, numeric_delta_lub_none
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
)
from domain.results import (
    AnalysisTypeMismatchError,
    BranchPowerComparison,
    BusVoltageComparison,
    ComplexDelta,
    NumericDelta,
    PowerFlowComparison,
    ProjectMismatchError,
    ProtectionComparison,
    ProtectionEvaluationComparison,
    RunComparisonResult,
    RunNotFinishedError,
    RunNotFoundError,
    ShortCircuitComparison,
)
from enm.canonical_analysis import CanonicalRun, get_run


class ComparisonService:
    """
    P10b Comparison Service — read-only comparison of two biegów R1.

    RESPONSIBILITIES:
    - Validate run compatibility (same project, same analysis type, FINISHED)
    - Fetch `ResultSetV1` projekcji obu biegów
    - Compute deterministic deltas (no physics, just arithmetic)
    - Return immutable comparison DTO

    DOES NOT:
    - Invoke solvers
    - Mutate any state
    - Interpret results normatively (no limits/thresholds)

    USAGE:
        service = ComparisonService()
        result = service.compare_runs(run_a_id, run_b_id)
    """

    def __init__(self, uow_factory: Any = None) -> None:
        # `uow_factory` zachowany wyłącznie dla zgodności sygnatury wołania z
        # routera — porównanie R1 nie dotyka UnitOfWork (patrz
        # `application/power_flow_comparison/service.py`, ten sam wzorzec).
        self._uow_factory = uow_factory

    def compare_runs(
        self,
        run_a_id: UUID,
        run_b_id: UUID,
    ) -> RunComparisonResult:
        """
        Compare two biegi R1.

        P10b: Main entry point for run comparison.

        Args:
            run_a_id: UUID of first Run (baseline)
            run_b_id: UUID of second Run (comparison target)

        Returns:
            RunComparisonResult with all computed deltas

        Raises:
            RunNotFoundError: If either run doesn't exist
            ProjectMismatchError: If runs belong to different projects
            AnalysisTypeMismatchError: If runs have different analysis types
            RunNotFinishedError: If either run is not FINISHED
        """
        run_a = self._get_run(run_a_id)
        run_b = self._get_run(run_b_id)

        if run_a.project_id != run_b.project_id:
            raise ProjectMismatchError(self._project_uuid(run_a), self._project_uuid(run_b))

        if run_a.analysis_type != run_b.analysis_type:
            raise AnalysisTypeMismatchError(run_a.analysis_type, run_b.analysis_type)

        self._validate_finished(run_a, run_a_id)
        self._validate_finished(run_b, run_b_id)

        result_set_a = build_resultset_v1_from_canonical_run(run_a)
        result_set_b = build_resultset_v1_from_canonical_run(run_b)

        short_circuit_comp = None
        power_flow_comp = None
        protection_comp = None

        if run_a.analysis_type == "short_circuit_sn":
            short_circuit_comp = self._compare_short_circuit(result_set_a, result_set_b)
        elif run_a.analysis_type == "PF":
            power_flow_comp = self._compare_power_flow(result_set_a, result_set_b)
        elif run_a.analysis_type == "protection_sn":
            protection_comp = self._compare_protection(result_set_a, result_set_b)

        provenance_a = RunProvenance.from_canonical_run(run_a)
        provenance_b = RunProvenance.from_canonical_run(run_b)

        return RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=self._project_uuid(run_a),
            analysis_type=run_a.analysis_type,
            short_circuit=short_circuit_comp,
            power_flow=power_flow_comp,
            protection=protection_comp,
            provenance_a=provenance_a.to_dict(),
            provenance_b=provenance_b.to_dict(),
        )

    # =========================================================================
    # RUN LOOKUP
    # =========================================================================

    def _get_run(self, run_id: UUID) -> CanonicalRun:
        run = get_run(run_id)
        if run is None:
            raise RunNotFoundError(run_id)
        return run

    def _validate_finished(self, run: CanonicalRun, run_id: UUID) -> None:
        if run.status != "FINISHED":
            raise RunNotFinishedError(run_id, run.status)

    @staticmethod
    def _project_uuid(run: CanonicalRun) -> UUID:
        # `CanonicalRun.project_id` jest `str | None` (identyfikator projektu w
        # kopercie) — `RunComparisonResult.project_id` jest FROZEN jako `UUID`;
        # brak projektu (bieg spoza kanału projektowego) nie ma tu miejsca, bo
        # oba biegi juz przeszly `project_id` (walidacja rownosci powyzej).
        return UUID(str(run.project_id))

    @staticmethod
    def _values_by_ref(result_set: Any, element_type: str) -> dict[str, dict[str, Any]]:
        """Indeks `element_ref -> values` z `ResultSetV1.element_results`."""
        return {
            row.element_ref: row.values
            for row in result_set.element_results
            if row.element_type == element_type
        }

    # =========================================================================
    # SHORT CIRCUIT
    # =========================================================================

    def _compare_short_circuit(
        self,
        result_set_a: Any,
        result_set_b: Any,
    ) -> ShortCircuitComparison:
        """
        Compare Short Circuit results (IEC 60909) — jeden reprezentatywny punkt
        (patrz nagłówek modułu „ZAKRES ZWARCIOWY").

        INVARIANT: No normative interpretation, just arithmetic deltas.
        """
        bus_values_a = self._values_by_ref(result_set_a, "Bus")
        bus_values_b = self._values_by_ref(result_set_b, "Bus")
        wspolne = sorted(set(bus_values_a.keys()) & set(bus_values_b.keys()))

        if not wspolne:
            # FAB-E: żadna szyna nie jest wspólna obu biegom (inna sieć/rewizja
            # z inną numeracją węzłów) — wszystkie delty None, nigdy fabrykowane.
            return ShortCircuitComparison(
                ikss_delta=None, sk_delta=None, zth_delta=None, ip_delta=None, ith_delta=None
            )

        values_a = bus_values_a[wspolne[0]]
        values_b = bus_values_b[wspolne[0]]

        return ShortCircuitComparison(
            # ikss/ip/ith w projekcji R1 sa w kA (`build_short_circuit_results`);
            # kontrakt tego pola jest w A od zawsze (docstring klasy) — *1000
            # jest CZYSTA konwersja jednostki, zero fizyki.
            ikss_delta=self._ka_to_a_delta(values_a, values_b, "ikss_ka"),
            sk_delta=numeric_delta_lub_none(values_a, values_b, "sk_mva"),
            zth_delta=self._zth_delta(values_a, values_b),
            ip_delta=self._ka_to_a_delta(values_a, values_b, "ip_ka"),
            ith_delta=self._ka_to_a_delta(values_a, values_b, "ith_ka"),
            xr_ratio_delta=numeric_delta_lub_none(values_a, values_b, "xr_ratio"),
            i2t_delta=numeric_delta_lub_none(values_a, values_b, "i2t_ka2s"),
        )

    @staticmethod
    def _ka_to_a_delta(
        values_a: dict[str, Any], values_b: dict[str, Any], klucz: str
    ) -> NumericDelta | None:
        wartosc_a = values_a.get(klucz)
        wartosc_b = values_b.get(klucz)
        if wartosc_a is None or wartosc_b is None:
            return None
        return NumericDelta.compute(float(wartosc_a) * 1000.0, float(wartosc_b) * 1000.0)

    @staticmethod
    def _zth_delta(values_a: dict[str, Any], values_b: dict[str, Any]) -> ComplexDelta | None:
        rk_a, xk_a = values_a.get("rk_ohm"), values_a.get("xk_ohm")
        rk_b, xk_b = values_b.get("rk_ohm"), values_b.get("xk_ohm")
        if rk_a is None or xk_a is None or rk_b is None or xk_b is None:
            return None
        return ComplexDelta.compute(
            complex(float(rk_a), float(xk_a)), complex(float(rk_b), float(xk_b))
        )

    # =========================================================================
    # POWER FLOW
    # =========================================================================

    def _compare_power_flow(
        self,
        result_set_a: Any,
        result_set_b: Any,
    ) -> PowerFlowComparison:
        """
        Compare Power Flow results.

        P10b: Compares delta_U, P, Q (aggregate + per-element).

        INVARIANT: No normative interpretation, just arithmetic deltas.
        """
        global_a = result_set_a.global_results
        global_b = result_set_b.global_results

        total_losses_p_delta = numeric_delta_lub_none(global_a, global_b, "total_losses_p_mw")
        total_losses_q_delta = numeric_delta_lub_none(global_a, global_b, "total_losses_q_mvar")
        slack_p_delta = numeric_delta_lub_none(global_a, global_b, "slack_p_mw")
        slack_q_delta = numeric_delta_lub_none(global_a, global_b, "slack_q_mvar")

        bus_values_a = self._values_by_ref(result_set_a, "Bus")
        bus_values_b = self._values_by_ref(result_set_b, "Bus")
        node_voltages = [
            BusVoltageComparison(
                bus_id=ref,
                u_kv_delta=numeric_delta_lub_none(
                    bus_values_a.get(ref, {}), bus_values_b.get(ref, {}), "u_kv"
                ),
                u_pu_delta=numeric_delta_lub_none(
                    bus_values_a.get(ref, {}), bus_values_b.get(ref, {}), "u_pu"
                ),
            )
            for ref in dopasuj_klucze(bus_values_a.keys(), bus_values_b.keys())
        ]

        branch_values_a = self._values_by_ref(result_set_a, "Branch")
        branch_values_b = self._values_by_ref(result_set_b, "Branch")
        branch_powers = [
            BranchPowerComparison(
                branch_id=ref,
                p_mw_delta=numeric_delta_lub_none(
                    branch_values_a.get(ref, {}), branch_values_b.get(ref, {}), "p_from_mw"
                ),
                q_mvar_delta=numeric_delta_lub_none(
                    branch_values_a.get(ref, {}), branch_values_b.get(ref, {}), "q_from_mvar"
                ),
            )
            for ref in dopasuj_klucze(branch_values_a.keys(), branch_values_b.keys())
        ]

        return PowerFlowComparison(
            total_losses_p_delta=total_losses_p_delta,
            total_losses_q_delta=total_losses_q_delta,
            slack_p_delta=slack_p_delta,
            slack_q_delta=slack_q_delta,
            node_voltages=tuple(node_voltages),
            branch_powers=tuple(branch_powers),
        )

    # =========================================================================
    # PROTECTION
    # =========================================================================

    def _compare_protection(
        self,
        result_set_a: Any,
        result_set_b: Any,
    ) -> ProtectionComparison:
        """
        Compare Protection Analysis results.

        P15c: Compares trip states, trip times, margins between two runs.

        INVARIANT: No normative interpretation, just arithmetic deltas.
        """
        evals_a = self._values_by_ref(result_set_a, "ProtectionDevice")
        evals_b = self._values_by_ref(result_set_b, "ProtectionDevice")

        eval_comparisons = []
        for element_id in dopasuj_klucze(evals_a.keys(), evals_b.keys()):
            ev_a = evals_a.get(element_id, {})
            ev_b = evals_b.get(element_id, {})

            trip_state_a = str(ev_a.get("trip_state", "UNKNOWN"))
            trip_state_b = str(ev_b.get("trip_state", "UNKNOWN"))
            state_change = (
                "BRAK ZMIANY" if trip_state_a == trip_state_b else f"{trip_state_a}→{trip_state_b}"
            )

            # Trip time delta (only if both TRIPS AND obie strony mają t_trip_s
            # — FAB-E: TRIPS bez t_trip_s to uszkodzona ewaluacja, nie fikcyjny
            # czas zadzialania 0 s).
            t_trip_delta = None
            if trip_state_a == "TRIPS" and trip_state_b == "TRIPS":
                t_trip_delta = numeric_delta_lub_none(ev_a, ev_b, "t_trip_s")

            margin_delta = numeric_delta_lub_none(ev_a, ev_b, "margin_percent")

            eval_comparisons.append(
                ProtectionEvaluationComparison(
                    element_id=element_id,
                    trip_state_a=trip_state_a,
                    trip_state_b=trip_state_b,
                    state_change=state_change,
                    t_trip_delta=t_trip_delta,
                    margin_delta=margin_delta,
                )
            )

        # Summary counts: `ResultSetV1.global_results` biegu zabezpieczeń niesie
        # `ProtectionResultSummary` (trips_count/no_trip_count/invalid_count) —
        # brak którejś strony (starszy zapis) -> delta None, nigdy fabrykowane 0.
        summary_a = result_set_a.global_results
        summary_b = result_set_b.global_results
        trip_count_delta = numeric_delta_lub_none(summary_a, summary_b, "trips_count")
        no_trip_count_delta = numeric_delta_lub_none(summary_a, summary_b, "no_trip_count")
        invalid_count_delta = numeric_delta_lub_none(summary_a, summary_b, "invalid_count")

        return ProtectionComparison(
            evaluations=tuple(eval_comparisons),
            trip_count_delta=trip_count_delta,
            no_trip_count_delta=no_trip_count_delta,
            invalid_count_delta=invalid_count_delta,
        )
