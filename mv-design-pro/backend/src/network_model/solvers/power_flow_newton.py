from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_newton_internal import (
    build_slack_island,
    newton_raphson_solve_v2,
    przygotuj_rozplyw_wyspy,
    validate_input,
    wyniki_rozplywu_wyspy,
)
from network_model.solvers.power_flow_types import PowerFlowInput


@dataclass(frozen=True)
class PowerFlowNewtonSolution:
    """P20a: Power flow solution with full white-box trace support."""

    converged: bool
    iterations: int
    max_mismatch: float
    node_voltage: dict[str, complex]
    node_u_mag: dict[str, float]
    node_angle: dict[str, float]
    node_voltage_kv: dict[str, float]
    branch_current: dict[str, complex]
    branch_s_from: dict[str, complex]
    branch_s_to: dict[str, complex]
    branch_current_ka: dict[str, float]
    branch_s_from_mva: dict[str, complex]
    branch_s_to_mva: dict[str, complex]
    losses_total: complex
    slack_power: complex
    sum_pq_spec: complex
    branch_flow_note: str
    missing_voltage_base_nodes: list[str]
    validation_warnings: list[str]
    validation_errors: list[str]
    slack_island_nodes: list[str]
    not_solved_nodes: list[str]
    ybus_trace: dict[str, object]
    nr_trace: list[dict[str, object]]
    applied_taps: list[dict[str, object]]
    applied_shunts: list[dict[str, object]]
    pv_to_pq_switches: list[dict[str, object]]
    # P20a: Initial state for white-box trace (V0, θ0)
    init_state: dict[str, dict[str, float]] | None = None
    # Defect D1 (audit 2026-08-01): the injection the solver actually specified at
    # each PQ bus at the converged |V| — i.e. the ZIP polynomial applied to the load
    # base plus the constant part (and the converged Q(U) at inverter buses). For a
    # classic constant-power bus this is exactly -p_mw/base_mva (unchanged). The
    # result table must report THIS, not the pre-polynomial request, or the nodal
    # balance breaks. Injection convention, pu on base_mva. Empty => not available.
    node_p_spec_effective_pu: dict[str, float] = field(default_factory=dict)
    node_q_spec_effective_pu: dict[str, float] = field(default_factory=dict)
    # FIX-08b/FIX-09: Solver method identifier for trace clarity
    solver_method: Literal["newton-raphson", "gauss-seidel", "fast-decoupled"] = "newton-raphson"
    # FIX-08b: Fallback information (if GS fell back to NR)
    fallback_info: dict[str, str] | None = None


class PowerFlowNewtonSolver:
    def solve(self, pf_input: PowerFlowInput) -> PowerFlowNewtonSolution:
        graph: NetworkGraph = pf_input.typed_graph()
        options = pf_input.options

        validation_warnings: list[str] = []
        validation_errors: list[str] = []

        if options.validate:
            validation_warnings, validation_errors = validate_input(pf_input)
            if validation_errors:
                raise ValueError("; ".join(validation_errors))

        slack_island_nodes, not_solved_nodes = build_slack_island(graph, pf_input.slack.node_id)

        if not slack_island_nodes:
            raise ValueError(
                "Węzła bilansującego nie ma w sieci obliczeniowej — nie można wyznaczyć wyspy "
                "zasilanej z sieci zasilającej."
            )

        # Węzły elektryczne (zamknięte łączniki scalone), zadania mocy i punkt startowy —
        # jedno przygotowanie dla NR/GS/FD (`przygotuj_rozplyw_wyspy`).
        z = przygotuj_rozplyw_wyspy(
            pf_input, graph, slack_island_nodes, options.trace_level == "full"
        )

        # ADR-011 §5a / ZASADA NR 3: a single NR physics path (v2). It handles
        # the PQ-only case (empty PV) identically to the former v1 — verified
        # byte-identical (np.array_equal voltages, equal iterations). The second
        # NR implementation has been removed (no second truth in the core).
        if z.pq_indices or z.pv_indices:
            (
                v,
                converged,
                iterations,
                max_mismatch,
                nr_trace,
                pv_to_pq_switches,
            ) = newton_raphson_solve_v2(
                z.ybus_pu,
                z.slack_index,
                z.pq_indices,
                z.pv_indices,
                z.p_spec,
                z.q_spec,
                z.pv_setpoints,
                z.pv_q_limits,
                z.v0,
                options,
                pf_input.base_mva,
                z.node_index_to_id,
                z.zip_table,
                z.inv_table,
                z.zip_const,
                z.inv_shaping,
                scalenie=z.scalenie,
                pv_pelne=z.pv_pelne,
            )
        else:
            v = z.v0
            converged = True
            iterations = 0
            max_mismatch = 0.0
            nr_trace = []
            pv_to_pq_switches = []

        if not converged:
            iterations = int(options.max_iter)
            if nr_trace:
                if "cause_if_failed_optional" not in nr_trace[-1]:
                    nr_trace[-1]["cause_if_failed_optional"] = "max_iter"
            else:
                nr_trace.append(
                    {
                        "iter": iterations,
                        "max_mismatch_pu": max_mismatch,
                        "mismatch_norm": 0.0,
                        "step_norm": 0.0,
                        "damping_used": float(options.damping),
                        "cause_if_failed_optional": "max_iter",
                    }
                )

        wyniki = wyniki_rozplywu_wyspy(pf_input, graph, z, v, slack_island_nodes, not_solved_nodes)

        return PowerFlowNewtonSolution(
            converged=converged,
            iterations=iterations,
            max_mismatch=max_mismatch,
            validation_warnings=validation_warnings,
            validation_errors=validation_errors,
            slack_island_nodes=slack_island_nodes,
            not_solved_nodes=not_solved_nodes,
            ybus_trace=z.ybus_trace,
            nr_trace=nr_trace,
            applied_taps=z.applied_taps,
            applied_shunts=z.applied_shunts,
            pv_to_pq_switches=pv_to_pq_switches,
            init_state=z.init_state,
            **wyniki,
        )


def solve_power_flow_physics(pf_input: PowerFlowInput) -> PowerFlowNewtonSolution:
    return PowerFlowNewtonSolver().solve(pf_input)
