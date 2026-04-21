from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from network_model.core.branch import LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_newton_internal import options_to_trace

from .result import PowerFlowResult
from .types import PowerFlowInput, PowerFlowOptions


def assemble_power_flow_result(
    *,
    converged: bool,
    iterations: int,
    max_mismatch: float,
    node_voltage: dict[str, complex],
    node_u_mag: dict[str, float],
    node_angle: dict[str, float],
    node_voltage_kv: dict[str, float],
    branch_current: dict[str, complex],
    branch_s_from: dict[str, complex],
    branch_s_to: dict[str, complex],
    branch_current_ka: dict[str, float],
    branch_s_from_mva: dict[str, complex],
    branch_s_to_mva: dict[str, complex],
    losses_total: complex,
    slack_power: complex,
    sum_pq_spec: complex,
    branch_flow_note: str,
    missing_voltage_base_nodes: Iterable[str],
    pf_input: PowerFlowInput,
    graph: NetworkGraph,
    options: PowerFlowOptions,
    validation_warnings: list[str],
    validation_errors: list[str],
    slack_island_nodes: Iterable[str],
    not_solved_nodes: Iterable[str],
    ybus_trace: dict[str, Any],
    nr_trace: list[dict[str, Any]],
    applied_taps: list[dict[str, Any]],
    applied_shunts: list[dict[str, Any]],
    pv_to_pq_switches: list[dict[str, Any]],
) -> PowerFlowResult:
    balance_note = _build_balance_note(
        branch_flow_note=branch_flow_note,
        slack_power=slack_power,
        sum_pq_spec=sum_pq_spec,
        losses_total=losses_total,
    )

    white_box_trace: dict[str, Any] = {
        "options": options_to_trace(options),
        "validation": {
            "warnings": sorted(validation_warnings),
            "errors": sorted(validation_errors),
        },
        "islands": {
            "slack_island_nodes": sorted(slack_island_nodes),
            "not_solved_island_nodes": sorted(not_solved_nodes),
        },
        "ybus": ybus_trace,
        "nr_iterations": nr_trace,
        "v2_functions_used": [
            "build_power_spec_v2" if pf_input.pv else "build_power_spec",
            "newton_raphson_solve_v2" if pf_input.pv else "newton_raphson_solve",
            "build_ybus_pu",
            "apply_shunts_pu",
            "apply_tap_ratio",
            "compute_branch_flows",
            "build_violations",
        ],
        "v2_feature_flags": {
            "pv_enabled": bool(pf_input.pv),
            "q_limits": bool(pf_input.pv),
            "tap_enabled": bool(applied_taps),
            "shunts_enabled": bool(applied_shunts),
            "violations_enabled": bool(pf_input.bus_limits or pf_input.branch_limits),
            "units_enabled": any(
                graph.nodes[node_id].voltage_level > 0 for node_id in slack_island_nodes
            ),
        },
        "source_of_data": {
            "p_spec": "overlay.pq + overlay.pv",
            "q_spec": "overlay.pq",
            "pv_voltage_setpoints": "overlay.pv",
            "pv_q_limits": "overlay.pv",
            "shunts": "overlay.shunts",
            "taps": "core.transformer.tap_position when non-zero; overlay.taps otherwise",
            "bus_limits": "overlay.bus_limits",
            "branch_limits": "overlay.branch_limits + core.ratings",
            "voltage_base": "core.node.voltage_level",
        },
        "pv_to_pq_switches": pv_to_pq_switches,
        "applied_taps": applied_taps,
        "applied_shunts": applied_shunts,
        "power_balance": {
            "sum_pq_spec_pu": sum_pq_spec,
            "slack_power_pu": slack_power,
            "losses_total_pu": losses_total,
            "balance_check_note": balance_note,
        },
    }

    violations = _build_violations(
        node_u_mag_pu=node_u_mag,
        bus_limits=pf_input.bus_limits,
        branch_s_from_mva=branch_s_from_mva,
        branch_s_to_mva=branch_s_to_mva,
        branch_current_ka=branch_current_ka,
        branch_limits=pf_input.branch_limits,
        graph=graph,
    )

    white_box_trace["violations_summary"] = _summarize_violations(violations)
    missing_nodes = sorted(missing_voltage_base_nodes)
    if missing_nodes:
        white_box_trace["units"] = {
            "missing_voltage_level_nodes": missing_nodes,
            "note": "kV/kA conversions unavailable where voltage_level is missing or zero.",
        }

    return PowerFlowResult(
        converged=converged,
        iterations=iterations,
        tolerance=options.tolerance,
        max_mismatch_pu=max_mismatch,
        base_mva=pf_input.base_mva,
        slack_node_id=pf_input.slack.node_id,
        node_voltage_pu=node_voltage,
        node_u_mag_pu=node_u_mag,
        node_angle_rad=node_angle,
        branch_current_pu=branch_current,
        branch_s_from_pu=branch_s_from,
        branch_s_to_pu=branch_s_to,
        node_voltage_kv=node_voltage_kv,
        branch_current_ka=branch_current_ka,
        branch_s_from_mva=branch_s_from_mva,
        branch_s_to_mva=branch_s_to_mva,
        violations=violations,
        pv_to_pq_switches=pv_to_pq_switches,
        losses_total_pu=losses_total,
        slack_power_pu=slack_power,
        white_box_trace=white_box_trace,
    )


def _build_balance_note(
    *,
    branch_flow_note: str,
    slack_power: complex,
    sum_pq_spec: complex,
    losses_total: complex,
) -> str:
    if branch_flow_note:
        return (
            "Power balance uses slack and PQ specs only; branch losses not computed. "
            + branch_flow_note
        )

    balance_error = (slack_power + sum_pq_spec) - losses_total
    return (
        "Balance check: slack + PQ specs - losses = "
        f"{balance_error.real:.6g}+j{balance_error.imag:.6g} pu."
    )


def _build_violations(
    *,
    node_u_mag_pu: dict[str, float],
    bus_limits: list[Any],
    branch_s_from_mva: dict[str, complex],
    branch_s_to_mva: dict[str, complex],
    branch_current_ka: dict[str, float],
    branch_limits: list[Any],
    graph: NetworkGraph,
) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []

    for limit in bus_limits:
        if limit.node_id not in node_u_mag_pu:
            continue
        value = node_u_mag_pu[limit.node_id]
        if value < limit.u_min_pu:
            violations.append(
                {
                    "type": "bus_voltage",
                    "id": limit.node_id,
                    "value": float(value),
                    "limit": float(limit.u_min_pu),
                    "severity": float(value / limit.u_min_pu),
                    "direction": "under",
                }
            )
        if value > limit.u_max_pu:
            violations.append(
                {
                    "type": "bus_voltage",
                    "id": limit.node_id,
                    "value": float(value),
                    "limit": float(limit.u_max_pu),
                    "severity": float(value / limit.u_max_pu),
                    "direction": "over",
                }
            )

    branch_limit_map = {limit.branch_id: limit for limit in branch_limits}

    for branch_id, branch in graph.branches.items():
        if not branch.in_service:
            continue
        if branch_id not in branch_s_from_mva and branch_id not in branch_s_to_mva:
            continue
        s_limit = None
        i_limit = None

        if branch_id in branch_limit_map:
            spec = branch_limit_map[branch_id]
            s_limit = spec.s_max_mva
            i_limit = spec.i_max_ka
        else:
            if isinstance(branch, TransformerBranch) and branch.rated_power_mva > 0:
                s_limit = branch.rated_power_mva
            if isinstance(branch, LineBranch) and branch.rated_current_a > 0:
                i_limit = branch.rated_current_a / 1000.0

        if s_limit is not None:
            s_from = abs(branch_s_from_mva.get(branch_id, 0.0 + 0.0j))
            s_to = abs(branch_s_to_mva.get(branch_id, 0.0 + 0.0j))
            s_value = max(s_from, s_to)
            if s_value > s_limit:
                violations.append(
                    {
                        "type": "branch_loading",
                        "id": branch_id,
                        "value": float(s_value),
                        "limit": float(s_limit),
                        "severity": float(s_value / s_limit),
                        "direction": "over",
                    }
                )

        if i_limit is not None and branch_id in branch_current_ka:
            i_value = branch_current_ka[branch_id]
            if i_value > i_limit:
                violations.append(
                    {
                        "type": "branch_current",
                        "id": branch_id,
                        "value": float(i_value),
                        "limit": float(i_limit),
                        "severity": float(i_value / i_limit),
                        "direction": "over",
                    }
                )

    violations.sort(key=lambda item: (-item["severity"], item["type"], item["id"]))
    return violations


def _summarize_violations(violations: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {"count": len(violations), "by_type": {}}
    for violation in violations:
        summary["by_type"].setdefault(violation["type"], 0)
        summary["by_type"][violation["type"]] += 1
    summary["top"] = violations[:3]
    return summary
