from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import numpy as np
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_inverter import (
    apply_inverter_setpoint,
    build_inverter_table,
)
from network_model.solvers.power_flow_newton_internal import (
    build_initial_voltage,
    build_power_spec_v2,
    build_slack_island,
    build_ybus_pu,
    compute_branch_flows,
    compute_power_injections,
    effective_pq_injections,
    newton_raphson_solve_v2,
    validate_input,
)
from network_model.solvers.power_flow_types import PowerFlowInput
from network_model.solvers.power_flow_zip import (
    apply_zip_frequency,
    build_zip_table,
    split_zip_constant_part,
)


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
            raise ValueError("Slack island could not be determined.")

        tap_ratios = {spec.branch_id: spec.tap_ratio for spec in pf_input.taps}

        ybus_pu, node_index_map, ybus_trace, applied_taps, applied_shunts = build_ybus_pu(
            graph,
            slack_island_nodes,
            pf_input.base_mva,
            pf_input.slack.node_id,
            pf_input.shunts,
            tap_ratios,
        )

        slack_index = node_index_map[pf_input.slack.node_id]
        node_index_to_id = {idx: node_id for node_id, idx in node_index_map.items()}
        zip_table = build_zip_table(pf_input.pq, node_index_map)
        inv_table = build_inverter_table(pf_input.pq, node_index_map)

        pq_node_ids = [spec.node_id for spec in pf_input.pq if spec.node_id in node_index_map]
        pv_node_ids = [spec.node_id for spec in pf_input.pv if spec.node_id in node_index_map]
        pq_indices = sorted([node_index_map[node_id] for node_id in pq_node_ids])
        pv_indices = sorted([node_index_map[node_id] for node_id in pv_node_ids])

        v0 = build_initial_voltage(
            slack_island_nodes,
            pf_input.slack.node_id,
            pf_input.slack.u_pu,
            pf_input.slack.angle_rad,
            options,
            graph,
        )

        # P20a: Build init_state for white-box trace (before solver modifies v0)
        init_state: dict[str, dict[str, float]] | None = None
        if options.trace_level == "full":
            init_state = {}
            for node_id in sorted(slack_island_nodes):
                idx = node_index_map[node_id]
                init_state[node_id] = {
                    "v_pu": float(np.abs(v0[idx])),
                    "theta_rad": float(np.angle(v0[idx])),
                }

        # ADR-011 §5a / ZASADA NR 3: a single NR physics path (v2). It handles
        # the PQ-only case (empty PV) identically to the former v1 — verified
        # byte-identical (np.array_equal voltages, equal iterations). The second
        # NR implementation has been removed (no second truth in the core).
        p_spec, q_spec, pv_setpoints, pv_q_limits = build_power_spec_v2(
            slack_island_nodes, pf_input.base_mva, pf_input.pq, pf_input.pv
        )
        # Defect D1 (audit 2026-08-01): rebase ZIP buses onto their LOAD part and
        # keep the rest (generation) as a constant term. BEFORE the frequency
        # scaling, so P(f) scales the load only. None => nothing to split.
        zip_const = split_zip_constant_part(
            p_spec, q_spec, pf_input.pq, node_index_map, pf_input.base_mva
        )
        apply_zip_frequency(p_spec, q_spec, pf_input.pq, node_index_map, pf_input.base_frequency_hz)
        # ADR-011 §5b: one-time inverter shaping (LFSM P(f) + cosφ/Q modes);
        # Q(U) sources are recomputed per iteration via inv_table. Defect B: the
        # shaping reads the SOURCE's own power and enters as a component of the
        # bus — on a ZIP bus into the constant part, so the load polynomial never
        # scales it (hence zip_table/zip_const are handed over).
        inv_shaping = apply_inverter_setpoint(
            p_spec,
            q_spec,
            pf_input.pq,
            node_index_map,
            pf_input.base_frequency_hz,
            pf_input.base_mva,
            zip_table,
            zip_const,
        )
        for idx, u_pu in pv_setpoints.items():
            v0[idx] = u_pu * np.exp(1j * np.angle(v0[idx]))
        if pq_indices or pv_indices:
            (
                v,
                converged,
                iterations,
                max_mismatch,
                nr_trace,
                pv_to_pq_switches,
            ) = newton_raphson_solve_v2(
                ybus_pu,
                slack_index,
                pq_indices,
                pv_indices,
                p_spec,
                q_spec,
                pv_setpoints,
                pv_q_limits,
                v0,
                options,
                pf_input.base_mva,
                node_index_to_id,
                zip_table,
                inv_table,
                zip_const,
                inv_shaping,
            )
        else:
            v = v0
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

        node_voltage = {node_id: v[node_index_map[node_id]] for node_id in slack_island_nodes}
        node_u_mag = {node_id: float(abs(voltage)) for node_id, voltage in node_voltage.items()}
        node_angle = {
            node_id: float(np.angle(voltage)) for node_id, voltage in node_voltage.items()
        }

        # K30-14 NO-GO #10 fix: include not_solved_nodes z NaN marker — bez tego
        # frontend overlay payload pomijał te bus refs, fallbackując do nominal
        # voltage co user widział jako 'flat 15.0 kV everywhere'. NaN signals
        # 'solver did not compute' (vs. 1.0 pu signaling 'solved at nominal').
        # JSON serialization converts NaN → null (via float_nan_to_none helper).
        for not_solved_id in not_solved_nodes:
            node_u_mag[not_solved_id] = float("nan")
            node_angle[not_solved_id] = float("nan")

        slack_voltage_kv = graph.nodes[pf_input.slack.node_id].voltage_level
        (
            branch_current,
            branch_s_from,
            branch_s_to,
            losses_total,
            branch_flow_note,
        ) = compute_branch_flows(
            graph,
            node_voltage,
            pf_input.base_mva,
            slack_voltage_kv,
            {entry["branch_id"]: entry["tap_ratio"] for entry in applied_taps},
        )

        node_voltage_kv: dict[str, float] = {}
        missing_voltage_base_nodes: list[str] = []
        for node_id, voltage in node_voltage.items():
            voltage_level = graph.nodes[node_id].voltage_level
            if voltage_level and voltage_level > 0:
                node_voltage_kv[node_id] = float(abs(voltage) * voltage_level)
            else:
                missing_voltage_base_nodes.append(node_id)

        # K30-14 NO-GO #10 fix: not_solved_nodes z NaN kV (signals 'no solver
        # result' — frontend distinguishes from actual computed nominal).
        for not_solved_id in not_solved_nodes:
            if not_solved_id in node_voltage_kv:
                continue
            node_voltage_kv[not_solved_id] = float("nan")

        branch_current_ka: dict[str, float] = {}
        for branch_id, current_pu in branch_current.items():
            branch = graph.branches[branch_id]
            voltage_level = graph.nodes[branch.from_node_id].voltage_level
            if voltage_level and voltage_level > 0:
                i_base_ka = pf_input.base_mva / (np.sqrt(3) * voltage_level)
                branch_current_ka[branch_id] = float(abs(current_pu) * i_base_ka)

        branch_s_from_mva = {
            branch_id: value * pf_input.base_mva for branch_id, value in branch_s_from.items()
        }
        branch_s_to_mva = {
            branch_id: value * pf_input.base_mva for branch_id, value in branch_s_to.items()
        }

        p_calc, q_calc = compute_power_injections(ybus_pu, v)
        slack_power = complex(p_calc[slack_index], q_calc[slack_index])
        # Defect D1: after the split p_spec/q_spec hold only the ZIP base, so the
        # constant part is added back here — this diagnostic keeps its historical
        # meaning (sum of the SPECIFIED PQ powers) and its historical value.
        sum_pq_spec = complex(float(np.sum(p_spec)), float(np.sum(q_spec)))
        if zip_const is not None:
            sum_pq_spec += complex(float(np.sum(zip_const[0])), float(np.sum(zip_const[1])))
        node_p_spec_effective_pu, node_q_spec_effective_pu = effective_pq_injections(
            pf_input.pq, node_index_map, p_spec, q_spec, v, zip_table, inv_table, zip_const
        )

        if branch_flow_note:
            losses_total = 0.0 + 0.0j

        return PowerFlowNewtonSolution(
            converged=converged,
            iterations=iterations,
            max_mismatch=max_mismatch,
            node_voltage=node_voltage,
            node_u_mag=node_u_mag,
            node_angle=node_angle,
            node_voltage_kv=node_voltage_kv,
            branch_current=branch_current,
            branch_s_from=branch_s_from,
            branch_s_to=branch_s_to,
            branch_current_ka=branch_current_ka,
            branch_s_from_mva=branch_s_from_mva,
            branch_s_to_mva=branch_s_to_mva,
            losses_total=losses_total,
            slack_power=slack_power,
            sum_pq_spec=sum_pq_spec,
            branch_flow_note=branch_flow_note,
            missing_voltage_base_nodes=missing_voltage_base_nodes,
            validation_warnings=validation_warnings,
            validation_errors=validation_errors,
            slack_island_nodes=slack_island_nodes,
            not_solved_nodes=not_solved_nodes,
            ybus_trace=ybus_trace,
            nr_trace=nr_trace,
            applied_taps=applied_taps,
            applied_shunts=applied_shunts,
            pv_to_pq_switches=pv_to_pq_switches,
            init_state=init_state,
            node_p_spec_effective_pu=node_p_spec_effective_pu,
            node_q_spec_effective_pu=node_q_spec_effective_pu,
        )


def solve_power_flow_physics(pf_input: PowerFlowInput) -> PowerFlowNewtonSolution:
    return PowerFlowNewtonSolver().solve(pf_input)
