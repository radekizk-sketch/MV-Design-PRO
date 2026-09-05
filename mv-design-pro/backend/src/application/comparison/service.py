"""
P10b Comparison Service — Case A/B Result Comparison

CANONICAL ALIGNMENT:
- P10b: Result State + Case A/B Comparison (BACKEND ONLY)
- Read-only comparison between two Study Runs
- No physics, no mutations, no solver invocation

INVARIANTS (BINDING):
1. READ-ONLY: Zero physics calculations, zero state mutations
2. SAME PROJECT: Both runs must belong to the same project
3. DATA FROM RESULT API: Uses only stored result payloads
4. DETERMINISTIC: Same inputs produce identical comparison output

USAGE:
    service = ComparisonService(uow_factory)
    result = service.compare_runs(run_a_id, run_b_id)
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

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
    ResultNotFoundError,
    RunComparisonResult,
    RunNotFoundError,
    ShortCircuitComparison,
)
from infrastructure.persistence.unit_of_work import UnitOfWork


class ComparisonService:
    """
    P10b Comparison Service — read-only comparison of two Study Runs.

    RESPONSIBILITIES:
    - Validate run compatibility (same project, same analysis type)
    - Fetch result payloads from Result API
    - Compute deterministic deltas (no physics, just arithmetic)
    - Return immutable comparison DTO

    DOES NOT:
    - Invoke solvers
    - Mutate any state
    - Interpret results normatively (no limits/thresholds)

    USAGE:
        service = ComparisonService(uow_factory)
        result = service.compare_runs(run_a_id, run_b_id)
    """

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def compare_runs(
        self,
        run_a_id: UUID,
        run_b_id: UUID,
    ) -> RunComparisonResult:
        """
        Compare two Study Runs.

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
            ResultNotFoundError: If results aren't found for a run
        """
        with self._uow_factory() as uow:
            # 1. Fetch runs
            run_a = uow.study_runs.get(run_a_id)
            if run_a is None:
                raise RunNotFoundError(run_a_id)

            run_b = uow.study_runs.get(run_b_id)
            if run_b is None:
                raise RunNotFoundError(run_b_id)

            # 2. Validate same project
            if run_a.project_id != run_b.project_id:
                raise ProjectMismatchError(run_a.project_id, run_b.project_id)

            # 3. Validate same analysis type
            if run_a.analysis_type != run_b.analysis_type:
                raise AnalysisTypeMismatchError(run_a.analysis_type, run_b.analysis_type)

            # 4. Fetch results
            results_a = uow.results.list_results(run_a_id)
            results_b = uow.results.list_results(run_b_id)

            # 5. Build comparison based on analysis type
            short_circuit_comp = None
            power_flow_comp = None
            protection_comp = None

            if run_a.analysis_type in ("short_circuit", "sc", "iec60909"):
                short_circuit_comp = self._compare_short_circuit(
                    results_a, results_b, run_a_id, run_b_id
                )
            elif run_a.analysis_type in ("power_flow", "pf", "load_flow"):
                power_flow_comp = self._compare_power_flow(results_a, results_b, run_a_id, run_b_id)
            elif run_a.analysis_type in ("protection", "protection_analysis"):
                protection_comp = self._compare_protection(results_a, results_b, run_a_id, run_b_id)

            return RunComparisonResult(
                run_a_id=run_a_id,
                run_b_id=run_b_id,
                project_id=run_a.project_id,
                analysis_type=run_a.analysis_type,
                short_circuit=short_circuit_comp,
                power_flow=power_flow_comp,
                protection=protection_comp,
            )

    def _compare_short_circuit(
        self,
        results_a: list[dict],
        results_b: list[dict],
        run_a_id: UUID,
        run_b_id: UUID,
    ) -> ShortCircuitComparison:
        """
        Compare Short Circuit results (IEC 60909).

        P10b: Compares Ik'', Sk'', Zth, Ip, Ith.

        INVARIANT: No normative interpretation, just arithmetic deltas.
        """
        payload_a = self._find_result_payload(results_a, "short_circuit", run_a_id)
        payload_b = self._find_result_payload(results_b, "short_circuit", run_b_id)

        # FAB-E (E1): brak wartości w payloadzie run A LUB run B (niekompletny/
        # starszy zapis wyniku) -> delta None, NIGDY fabrykowana od milczącego
        # 0 (ShortCircuitResult FROZEN nie ma tu odpowiednika "naprawdę zero").
        ikss_delta = self._numeric_delta_or_none(payload_a, payload_b, "ikss_a")
        sk_delta = self._numeric_delta_or_none(payload_a, payload_b, "sk_mva")
        ip_delta = self._numeric_delta_or_none(payload_a, payload_b, "ip_a")
        ith_delta = self._numeric_delta_or_none(payload_a, payload_b, "ith_a")

        # Zth can be stored as complex dict {"re": x, "im": y}
        zth_delta = self._complex_delta_or_none(payload_a, payload_b, "zkk_ohm")

        # Karta S-C (2026-07-22): addytywne delty pełnego bilansu — ta sama
        # klasa przekształceń co kanoniczny bilans (X/R = 1/(R/X),
        # I²t = (Ith/1000)²·tk). Starszy payload bez pól → None (uczciwy brak).
        xr_a = self._payload_xr_ratio(payload_a)
        xr_b = self._payload_xr_ratio(payload_b)
        xr_ratio_delta = (
            NumericDelta.compute(xr_a, xr_b) if xr_a is not None and xr_b is not None else None
        )

        i2t_a = self._payload_i2t_ka2s(payload_a)
        i2t_b = self._payload_i2t_ka2s(payload_b)
        i2t_delta = (
            NumericDelta.compute(i2t_a, i2t_b) if i2t_a is not None and i2t_b is not None else None
        )

        return ShortCircuitComparison(
            ikss_delta=ikss_delta,
            sk_delta=sk_delta,
            zth_delta=zth_delta,
            ip_delta=ip_delta,
            ith_delta=ith_delta,
            xr_ratio_delta=xr_ratio_delta,
            i2t_delta=i2t_delta,
        )

    @staticmethod
    def _numeric_delta_or_none(
        payload_a: dict[str, Any], payload_b: dict[str, Any], key: str
    ) -> NumericDelta | None:
        """Delta dwóch pól liczbowych payloadu — None, gdy klucz brakuje w
        KTÓRYMKOLWIEK payloadzie (nie tylko gdy brakuje w obu)."""
        value_a = payload_a.get(key)
        value_b = payload_b.get(key)
        if value_a is None or value_b is None:
            return None
        return NumericDelta.compute(float(value_a), float(value_b))

    @classmethod
    def _complex_delta_or_none(
        cls, payload_a: dict[str, Any], payload_b: dict[str, Any], key: str
    ) -> ComplexDelta | None:
        """Jak `_numeric_delta_or_none`, dla pól zespolonych {"re":x,"im":y}."""
        raw_a = payload_a.get(key)
        raw_b = payload_b.get(key)
        if raw_a is None or raw_b is None:
            return None
        return ComplexDelta.compute(cls._parse_complex(raw_a), cls._parse_complex(raw_b))

    @staticmethod
    def _payload_xr_ratio(payload: dict[str, Any]) -> float | None:
        """X/R = 1/(R/X) z payloadu SC (rx_ratio z FROZEN wyniku); brak/0 → None."""
        rx = payload.get("rx_ratio")
        if isinstance(rx, int | float) and not isinstance(rx, bool) and rx != 0.0:
            return 1.0 / float(rx)
        return None

    @staticmethod
    def _payload_i2t_ka2s(payload: dict[str, Any]) -> float | None:
        """I²t = (Ith/1000)²·tk [kA²s] z payloadu SC; brak pól → None."""
        ith_a = payload.get("ith_a")
        tk_s = payload.get("tk_s")
        if (
            isinstance(ith_a, int | float)
            and not isinstance(ith_a, bool)
            and isinstance(tk_s, int | float)
            and not isinstance(tk_s, bool)
        ):
            return (float(ith_a) / 1000.0) ** 2 * float(tk_s)
        return None

    def _compare_power_flow(
        self,
        results_a: list[dict],
        results_b: list[dict],
        run_a_id: UUID,
        run_b_id: UUID,
    ) -> PowerFlowComparison:
        """
        Compare Power Flow results.

        P10b: Compares delta_U, P, Q (aggregate + per-element).

        INVARIANT: No normative interpretation, just arithmetic deltas.
        """
        payload_a = self._find_result_payload(results_a, "power_flow", run_a_id)
        payload_b = self._find_result_payload(results_b, "power_flow", run_b_id)

        # FAB-E (E1): brak klucza w payloadzie run A LUB run B -> obie skladowe
        # (P i Q) None, NIGDY fabrykowane 0.0 (wygladaloby jak zerowe straty/
        # zerowy bilans wezla bilansujacego).
        total_losses_p_delta, total_losses_q_delta = self._complex_component_deltas(
            payload_a, payload_b, "losses_total_pu"
        )
        slack_p_delta, slack_q_delta = self._complex_component_deltas(
            payload_a, payload_b, "slack_power_pu"
        )

        # Per-node voltages
        node_voltages = self._compare_node_voltages(
            payload_a.get("node_voltage_kv", {}),
            payload_b.get("node_voltage_kv", {}),
            payload_a.get("node_u_mag_pu", {}),
            payload_b.get("node_u_mag_pu", {}),
        )

        # Per-branch powers (from side)
        branch_powers = self._compare_branch_powers(
            payload_a.get("branch_s_from_mva", {}),
            payload_b.get("branch_s_from_mva", {}),
        )

        return PowerFlowComparison(
            total_losses_p_delta=total_losses_p_delta,
            total_losses_q_delta=total_losses_q_delta,
            slack_p_delta=slack_p_delta,
            slack_q_delta=slack_q_delta,
            node_voltages=tuple(node_voltages),
            branch_powers=tuple(branch_powers),
        )

    @classmethod
    def _complex_component_deltas(
        cls, payload_a: dict[str, Any], payload_b: dict[str, Any], key: str
    ) -> tuple[NumericDelta | None, NumericDelta | None]:
        """(delta_re, delta_im) pola zespolonego payloadu — (None, None), gdy
        klucz brakuje w KTORYMKOLWIEK payloadzie (nie tylko gdy brakuje w obu)."""
        raw_a = payload_a.get(key)
        raw_b = payload_b.get(key)
        if raw_a is None or raw_b is None:
            return None, None
        value_a = cls._parse_complex(raw_a)
        value_b = cls._parse_complex(raw_b)
        return (
            NumericDelta.compute(value_a.real, value_b.real),
            NumericDelta.compute(value_a.imag, value_b.imag),
        )

    def _compare_node_voltages(
        self,
        kv_a: dict[str, float],
        kv_b: dict[str, float],
        pu_a: dict[str, float],
        pu_b: dict[str, float],
    ) -> list[BusVoltageComparison]:
        """Compare per-bus voltages.

        FAB-E (E1): szyna obecna tylko w jednym z porownywanych biegow (zmiana
        topologii miedzy run A i run B) dostaje delte None dla tej skladowej,
        NIGDY fabrykowane 0.0 kV/pu (wygladaloby jak calkowity zanik napiecia).
        """
        all_nodes = sorted(set(kv_a.keys()) | set(kv_b.keys()))
        comparisons = []

        for node_id in all_nodes:
            u_kv_val_a = kv_a.get(node_id)
            u_kv_val_b = kv_b.get(node_id)
            u_pu_val_a = pu_a.get(node_id)
            u_pu_val_b = pu_b.get(node_id)

            u_kv_delta = (
                NumericDelta.compute(float(u_kv_val_a), float(u_kv_val_b))
                if u_kv_val_a is not None and u_kv_val_b is not None
                else None
            )
            u_pu_delta = (
                NumericDelta.compute(float(u_pu_val_a), float(u_pu_val_b))
                if u_pu_val_a is not None and u_pu_val_b is not None
                else None
            )

            comparisons.append(
                BusVoltageComparison(
                    bus_id=node_id,
                    u_kv_delta=u_kv_delta,
                    u_pu_delta=u_pu_delta,
                )
            )

        return comparisons

    def _compare_branch_powers(
        self,
        s_from_a: dict[str, Any],
        s_from_b: dict[str, Any],
    ) -> list[BranchPowerComparison]:
        """Compare per-branch powers.

        FAB-E (E1): galaz obecna tylko w jednym z porownywanych biegow dostaje
        delte None, NIGDY fabrykowane 0.0 MW/Mvar (wygladaloby jak realny
        zanik przeplywu)."""
        all_branches = sorted(set(s_from_a.keys()) | set(s_from_b.keys()))
        comparisons = []

        for branch_id in all_branches:
            raw_a = s_from_a.get(branch_id)
            raw_b = s_from_b.get(branch_id)
            if raw_a is None or raw_b is None:
                comparisons.append(
                    BranchPowerComparison(branch_id=branch_id, p_mw_delta=None, q_mvar_delta=None)
                )
                continue
            s_a = self._parse_complex(raw_a)
            s_b = self._parse_complex(raw_b)

            comparisons.append(
                BranchPowerComparison(
                    branch_id=branch_id,
                    p_mw_delta=NumericDelta.compute(s_a.real, s_b.real),
                    q_mvar_delta=NumericDelta.compute(s_a.imag, s_b.imag),
                )
            )

        return comparisons

    def _compare_protection(
        self,
        results_a: list[dict],
        results_b: list[dict],
        run_a_id: UUID,
        run_b_id: UUID,
    ) -> ProtectionComparison:
        """
        Compare Protection Analysis results.

        P15c: Compares trip states, trip times, margins between two runs.

        INVARIANT: No normative interpretation, just arithmetic deltas.
        """
        payload_a = self._find_result_payload(results_a, "protection", run_a_id)
        payload_b = self._find_result_payload(results_b, "protection", run_b_id)

        # Extract evaluations (list of evaluation dicts)
        evaluations_a = payload_a.get("evaluations", [])
        evaluations_b = payload_b.get("evaluations", [])

        # Build mapping by protected_element_ref for deterministic comparison
        eval_map_a = {ev.get("protected_element_ref"): ev for ev in evaluations_a}
        eval_map_b = {ev.get("protected_element_ref"): ev for ev in evaluations_b}

        # Get all element IDs (union of both sets)
        all_elements = sorted(set(eval_map_a.keys()) | set(eval_map_b.keys()))

        # Compare each element
        eval_comparisons = []
        for element_id in all_elements:
            ev_a = eval_map_a.get(element_id, {})
            ev_b = eval_map_b.get(element_id, {})

            trip_state_a = ev_a.get("trip_state", "UNKNOWN")
            trip_state_b = ev_b.get("trip_state", "UNKNOWN")

            # Determine state change (PL)
            if trip_state_a == trip_state_b:
                state_change = "BRAK ZMIANY"
            else:
                state_change = f"{trip_state_a}→{trip_state_b}"

            # Trip time delta (only if both TRIPS AND obie strony mają t_trip_s
            # — FAB-E (E1): TRIPS bez t_trip_s to uszkodzona ewaluacja, nie
            # fikcyjny czas zadzialania 0 s).
            t_trip_delta = None
            if trip_state_a == "TRIPS" and trip_state_b == "TRIPS":
                t_a = ev_a.get("t_trip_s")
                t_b = ev_b.get("t_trip_s")
                if t_a is not None and t_b is not None:
                    t_trip_delta = NumericDelta.compute(float(t_a), float(t_b))

            # Margin delta (if both have margin)
            margin_delta = None
            margin_a = ev_a.get("margin_percent")
            margin_b = ev_b.get("margin_percent")
            if margin_a is not None and margin_b is not None:
                margin_delta = NumericDelta.compute(float(margin_a), float(margin_b))

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

        # Extract summary counts. FAB-E (E1): brak klucza "summary" w
        # KTORYMKOLWIEK payloadzie (starszy/niekompletny zapis wyniku) ->
        # wszystkie trzy count-delty None, nigdy fabrykowane 0 (wygladaloby
        # jak "zero zadzialan zabezpieczen" zamiast "brak podsumowania").
        summary_a = payload_a.get("summary")
        summary_b = payload_b.get("summary")
        if isinstance(summary_a, dict) and isinstance(summary_b, dict):
            trip_count_delta = self._numeric_delta_or_none(summary_a, summary_b, "trips_count")
            no_trip_count_delta = self._numeric_delta_or_none(summary_a, summary_b, "no_trip_count")
            invalid_count_delta = self._numeric_delta_or_none(summary_a, summary_b, "invalid_count")
        else:
            trip_count_delta = None
            no_trip_count_delta = None
            invalid_count_delta = None

        return ProtectionComparison(
            evaluations=tuple(eval_comparisons),
            trip_count_delta=trip_count_delta,
            no_trip_count_delta=no_trip_count_delta,
            invalid_count_delta=invalid_count_delta,
        )

    def _find_result_payload(
        self,
        results: list[dict],
        result_type: str,
        run_id: UUID,
    ) -> dict[str, Any]:
        """
        Find result payload by type.

        Searches through stored results for matching type.
        Falls back to checking payload structure.
        """
        # First, try exact type match
        for result in results:
            if result.get("result_type") == result_type:
                return result.get("payload", {})

        # Fallback: look for payload with expected keys
        if result_type == "short_circuit":
            for result in results:
                payload = result.get("payload", {})
                if "ikss_a" in payload or "sk_mva" in payload:
                    return payload

        if result_type == "power_flow":
            for result in results:
                payload = result.get("payload", {})
                if "converged" in payload or "node_voltage_pu" in payload:
                    return payload

        if result_type == "protection":
            for result in results:
                payload = result.get("payload", {})
                if "evaluations" in payload or "summary" in payload:
                    return payload

        # If we have any results, return the first payload
        if results:
            return results[0].get("payload", {})

        raise ResultNotFoundError(run_id, result_type)

    @staticmethod
    def _parse_complex(value: Any) -> complex:
        """
        Parse complex value from dict or number.

        Handles:
        - {"re": x, "im": y}
        - Complex number
        - Float/int (imaginary = 0)
        """
        if isinstance(value, complex):
            return value
        if isinstance(value, int | float):
            return complex(value, 0.0)
        if isinstance(value, dict):
            return complex(
                float(value.get("re", 0.0)),
                float(value.get("im", 0.0)),
            )
        return complex(0.0, 0.0)
