from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict
from typing import Any

import numpy as np
from network_model.core.branch import Branch, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    ShuntSpec,
)
from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    zip_factor,
    zip_factor_derivative,
)


def _apply_zip_jacobian(
    jacobian: np.ndarray,
    v: np.ndarray,
    pq_indices: list[int],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    zip_table: dict[int, ZipCoeffs],
) -> None:
    """ADR-011 (Z-ZIP-04): in-place ZIP correction of the assembled Jacobian.

    Subtracts d(P_spec)/dV and d(Q_spec)/dV from the J12 (dP/dV) and J22 (dQ/dV)
    diagonals at each ZIP bus, because the mismatch f = P_spec(V) - P_calc now
    carries a voltage-dependent specified term. With a=b=0,c=1 the derivative is
    zero, so the Jacobian is unchanged (reduce-to-NR invariant).
    """
    n_pq = len(pq_indices)
    v_mag = np.abs(v)
    for z_idx, z_c in zip_table.items():
        if z_idx not in pq_indices:
            continue
        pos = pq_indices.index(z_idx)
        dp_dv = p_spec[z_idx] * zip_factor_derivative(z_c.a_p, z_c.b_p, v_mag[z_idx], z_c.v0_pu)
        dq_dv = q_spec[z_idx] * zip_factor_derivative(z_c.a_q, z_c.b_q, v_mag[z_idx], z_c.v0_pu)
        jacobian[pos, n_pq + pos] -= dp_dv
        jacobian[n_pq + pos, n_pq + pos] -= dq_dv


def _apply_zip_jacobian_v2(
    jacobian: np.ndarray,
    v: np.ndarray,
    non_slack_indices: list[int],
    active_pq: list[int],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    zip_table: dict[int, ZipCoeffs],
) -> None:
    """ADR-011: ZIP correction for the v2 (PV/PQ-switching) Jacobian.

    Block layout: top=[j11(n_p x n_p), j12(n_p x n_q)], bottom=[j21, j22(n_q x n_q)].
    A ZIP bus is a PQ load, so it appears in non_slack_indices (P eq) and active_pq
    (Q eq). Same reduce-to-NR property: a=b=0 => derivative 0 => no change."""
    n_p = len(non_slack_indices)
    v_mag = np.abs(v)
    for z_idx, z_c in zip_table.items():
        if z_idx not in active_pq or z_idx not in non_slack_indices:
            continue
        row_p = non_slack_indices.index(z_idx)
        col_q = active_pq.index(z_idx)
        dp_dv = p_spec[z_idx] * zip_factor_derivative(z_c.a_p, z_c.b_p, v_mag[z_idx], z_c.v0_pu)
        dq_dv = q_spec[z_idx] * zip_factor_derivative(z_c.a_q, z_c.b_q, v_mag[z_idx], z_c.v0_pu)
        jacobian[row_p, n_p + col_q] -= dp_dv
        jacobian[n_p + col_q, n_p + col_q] -= dq_dv


def validate_input(pf_input: PowerFlowInput) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    errors: list[str] = []

    if pf_input.base_mva <= 0:
        errors.append("base_mva must be > 0")

    graph = pf_input.typed_graph()
    if pf_input.slack.node_id not in graph.nodes:
        errors.append(f"slack node '{pf_input.slack.node_id}' not in graph")

    pq_ids = [spec.node_id for spec in pf_input.pq]
    pv_ids = [spec.node_id for spec in pf_input.pv]
    slack_id = pf_input.slack.node_id

    duplicate_pq = _find_duplicates(pq_ids)
    if duplicate_pq:
        errors.append("duplicate PQSpec.node_id entries: " + ", ".join(sorted(duplicate_pq)))

    duplicate_pv = _find_duplicates(pv_ids)
    if duplicate_pv:
        errors.append("duplicate PVSpec.node_id entries: " + ", ".join(sorted(duplicate_pv)))

    duplicate_shunts = _find_duplicates([spec.node_id for spec in pf_input.shunts])
    if duplicate_shunts:
        errors.append("duplicate ShuntSpec.node_id entries: " + ", ".join(sorted(duplicate_shunts)))

    duplicate_bus_limits = _find_duplicates([spec.node_id for spec in pf_input.bus_limits])
    if duplicate_bus_limits:
        errors.append(
            "duplicate BusVoltageLimitSpec.node_id entries: "
            + ", ".join(sorted(duplicate_bus_limits))
        )

    duplicate_taps = _find_duplicates([spec.branch_id for spec in pf_input.taps])
    if duplicate_taps:
        errors.append(
            "duplicate TransformerTapSpec.branch_id entries: " + ", ".join(sorted(duplicate_taps))
        )

    duplicate_branch_limits = _find_duplicates([spec.branch_id for spec in pf_input.branch_limits])
    if duplicate_branch_limits:
        errors.append(
            "duplicate BranchLimitSpec.branch_id entries: "
            + ", ".join(sorted(duplicate_branch_limits))
        )

    pq_set = set(pq_ids)
    pv_set = set(pv_ids)
    if slack_id in pq_set or slack_id in pv_set:
        errors.append("slack node cannot also be specified as PQ or PV")
    overlap = pq_set.intersection(pv_set)
    if overlap:
        errors.append(
            "node_id cannot be specified as both PQ and PV: " + ", ".join(sorted(overlap))
        )

    for spec in pf_input.pv:
        if spec.q_min_mvar > spec.q_max_mvar:
            errors.append(f"PVSpec '{spec.node_id}' q_min_mvar must be <= q_max_mvar")

    for spec in pf_input.bus_limits:
        if spec.u_min_pu >= spec.u_max_pu:
            errors.append(f"BusVoltageLimitSpec '{spec.node_id}' requires u_min_pu < u_max_pu")

    for spec in pf_input.branch_limits:
        if spec.s_max_mva is None and spec.i_max_ka is None:
            errors.append(f"BranchLimitSpec '{spec.branch_id}' requires s_max_mva or i_max_ka")

    for spec in pf_input.taps:
        if spec.branch_id not in graph.branches:
            errors.append(f"TransformerTapSpec '{spec.branch_id}' not in graph")
            continue
        branch = graph.branches[spec.branch_id]
        if not isinstance(branch, TransformerBranch):
            errors.append(f"TransformerTapSpec '{spec.branch_id}' must reference a transformer")

    for spec in pf_input.branch_limits:
        if spec.branch_id not in graph.branches:
            errors.append(f"BranchLimitSpec '{spec.branch_id}' not in graph")

    if pf_input.slack.u_pu < 0.8 or pf_input.slack.u_pu > 1.2:
        warnings.append("slack.u_pu outside typical range [0.8, 1.2]")

    return warnings, errors


def build_slack_island(graph: NetworkGraph, slack_node_id: str) -> tuple[list[str], list[str]]:
    islands = graph.find_islands()
    slack_island: list[str] = []
    for island in islands:
        if slack_node_id in island:
            slack_island = island
            break
    if not slack_island:
        return [], sorted(graph.nodes.keys())

    slack_island_set = set(slack_island)
    not_solved = sorted([node_id for node_id in graph.nodes if node_id not in slack_island_set])
    return sorted(slack_island), not_solved


def build_ybus_pu(
    graph: NetworkGraph,
    slack_island_nodes: Iterable[str],
    base_mva: float,
    slack_node_id: str,
    shunts: Iterable[ShuntSpec],
    tap_ratios: dict[str, float],
) -> tuple[np.ndarray, dict[str, int], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    node_ids_sorted = sorted(graph.nodes.keys())
    node_id_to_index_full = {node_id: idx for idx, node_id in enumerate(node_ids_sorted)}

    ybus_ohm, applied_taps = _build_ybus_ohm(graph, node_id_to_index_full, tap_ratios)

    slack_voltage_kv = graph.nodes[slack_node_id].voltage_level
    ybus_note = ""
    ybus_source = "network_model.solvers.power_flow_newton_internal.build_ybus_pu"

    if slack_voltage_kv and slack_voltage_kv > 0:
        z_base = (slack_voltage_kv**2) / base_mva
        ybus_pu_full = ybus_ohm * z_base
    else:
        ybus_note = "Slack node voltage_level missing or zero; Ybus treated as per-unit."
        ybus_pu_full = ybus_ohm

    island_nodes_sorted = sorted(slack_island_nodes)
    island_indices = [node_id_to_index_full[node_id] for node_id in island_nodes_sorted]
    ybus_pu = ybus_pu_full[np.ix_(island_indices, island_indices)]
    node_id_to_index = {node_id: idx for idx, node_id in enumerate(island_nodes_sorted)}

    applied_shunts = _apply_shunts_pu(ybus_pu, node_id_to_index, shunts)

    trace_info = {
        "source": ybus_source,
        "n": int(len(island_nodes_sorted)),
        "node_index_map": node_id_to_index,
        "note": ybus_note,
    }

    return ybus_pu, node_id_to_index, trace_info, applied_taps, applied_shunts


def build_power_spec(
    island_nodes: Iterable[str],
    base_mva: float,
    pq_specs: Iterable[PQSpec],
) -> tuple[np.ndarray, np.ndarray]:
    node_list = list(island_nodes)
    p_spec = np.zeros(len(node_list), dtype=float)
    q_spec = np.zeros(len(node_list), dtype=float)
    node_index_map = {node_id: idx for idx, node_id in enumerate(node_list)}

    for spec in pq_specs:
        if spec.node_id not in node_index_map:
            continue
        idx = node_index_map[spec.node_id]
        p_spec[idx] = -spec.p_mw / base_mva
        q_spec[idx] = -spec.q_mvar / base_mva

    return p_spec, q_spec


def build_power_spec_v2(
    island_nodes: Iterable[str],
    base_mva: float,
    pq_specs: Iterable[PQSpec],
    pv_specs: Iterable[PVSpec],
) -> tuple[np.ndarray, np.ndarray, dict[int, float], dict[int, tuple[float, float]]]:
    node_list = list(island_nodes)
    p_spec = np.zeros(len(node_list), dtype=float)
    q_spec = np.zeros(len(node_list), dtype=float)
    node_index_map = {node_id: idx for idx, node_id in enumerate(node_list)}

    pv_setpoints: dict[int, float] = {}
    pv_q_limits: dict[int, tuple[float, float]] = {}

    for spec in pq_specs:
        if spec.node_id not in node_index_map:
            continue
        idx = node_index_map[spec.node_id]
        p_spec[idx] = -spec.p_mw / base_mva
        q_spec[idx] = -spec.q_mvar / base_mva

    for spec in pv_specs:
        if spec.node_id not in node_index_map:
            continue
        idx = node_index_map[spec.node_id]
        p_spec[idx] = -spec.p_mw / base_mva
        pv_setpoints[idx] = float(spec.u_pu)
        q_min_pu = spec.q_min_mvar / base_mva
        q_max_pu = spec.q_max_mvar / base_mva
        pv_q_limits[idx] = (q_min_pu, q_max_pu)

    return p_spec, q_spec, pv_setpoints, pv_q_limits


def build_initial_voltage(
    nodes: Iterable[str],
    slack_node_id: str,
    slack_u_pu: float,
    slack_angle_rad: float,
    options: PowerFlowOptions,
    graph: NetworkGraph,
) -> np.ndarray:
    node_list = list(nodes)
    size = len(node_list)
    v = np.ones(size, dtype=complex)
    node_index_map = {node_id: idx for idx, node_id in enumerate(node_list)}

    if not options.flat_start:
        for node_id, idx in node_index_map.items():
            node = graph.nodes[node_id]
            mag = node.voltage_magnitude if node.voltage_magnitude is not None else 1.0
            angle = node.voltage_angle if node.voltage_angle is not None else 0.0
            v[idx] = mag * np.exp(1j * angle)

    slack_idx = node_index_map[slack_node_id]
    v[slack_idx] = slack_u_pu * np.exp(1j * slack_angle_rad)
    return v


def compute_power_injections(ybus: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    i_inj = ybus @ v
    s_inj = v * np.conj(i_inj)
    return s_inj.real, s_inj.imag


def build_jacobian(
    ybus: np.ndarray,
    v: np.ndarray,
    pq_indices: list[int],
    p_calc: np.ndarray,
    q_calc: np.ndarray,
) -> np.ndarray:
    g = ybus.real
    b = ybus.imag
    n_pq = len(pq_indices)
    j11 = np.zeros((n_pq, n_pq))
    j12 = np.zeros((n_pq, n_pq))
    j21 = np.zeros((n_pq, n_pq))
    j22 = np.zeros((n_pq, n_pq))

    v_mag = np.abs(v)
    v_ang = np.angle(v)

    for row, i in enumerate(pq_indices):
        for col, k in enumerate(pq_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j11[row, col] = -q_calc[i] - b[i, i] * v_mag[i] ** 2
                j21[row, col] = p_calc[i] - g[i, i] * v_mag[i] ** 2
                j12[row, col] = p_calc[i] / v_mag[i] + g[i, i] * v_mag[i]
                j22[row, col] = q_calc[i] / v_mag[i] - b[i, i] * v_mag[i]
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j11[row, col] = v_mag[i] * v_mag[k] * (g[i, k] * sin_t - b[i, k] * cos_t)
                j21[row, col] = -v_mag[i] * v_mag[k] * (g[i, k] * cos_t + b[i, k] * sin_t)
                j12[row, col] = v_mag[i] * (g[i, k] * cos_t + b[i, k] * sin_t)
                j22[row, col] = v_mag[i] * (g[i, k] * sin_t - b[i, k] * cos_t)

    top = np.hstack([j11, j12])
    bottom = np.hstack([j21, j22])
    return np.vstack([top, bottom])


def build_jacobian_v2(
    ybus: np.ndarray,
    v: np.ndarray,
    non_slack_indices: list[int],
    pq_indices: list[int],
    p_calc: np.ndarray,
    q_calc: np.ndarray,
) -> np.ndarray:
    g = ybus.real
    b = ybus.imag
    n_p = len(non_slack_indices)
    n_q = len(pq_indices)
    j11 = np.zeros((n_p, n_p))
    j12 = np.zeros((n_p, n_q))
    j21 = np.zeros((n_q, n_p))
    j22 = np.zeros((n_q, n_q))

    v_mag = np.abs(v)
    v_ang = np.angle(v)

    for row, i in enumerate(non_slack_indices):
        for col, k in enumerate(non_slack_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j11[row, col] = -q_calc[i] - b[i, i] * v_mag[i] ** 2
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j11[row, col] = v_mag[i] * v_mag[k] * (g[i, k] * sin_t - b[i, k] * cos_t)

    for row, i in enumerate(non_slack_indices):
        for col, k in enumerate(pq_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j12[row, col] = p_calc[i] / v_mag[i] + g[i, i] * v_mag[i]
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j12[row, col] = v_mag[i] * (g[i, k] * cos_t + b[i, k] * sin_t)

    for row, i in enumerate(pq_indices):
        for col, k in enumerate(non_slack_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j21[row, col] = p_calc[i] - g[i, i] * v_mag[i] ** 2
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j21[row, col] = -v_mag[i] * v_mag[k] * (g[i, k] * cos_t + b[i, k] * sin_t)

    for row, i in enumerate(pq_indices):
        for col, k in enumerate(pq_indices):
            theta = v_ang[i] - v_ang[k]
            if i == k:
                j22[row, col] = q_calc[i] / v_mag[i] - b[i, i] * v_mag[i]
            else:
                sin_t = np.sin(theta)
                cos_t = np.cos(theta)
                j22[row, col] = v_mag[i] * (g[i, k] * sin_t - b[i, k] * cos_t)

    top = np.hstack([j11, j12])
    bottom = np.hstack([j21, j22])
    return np.vstack([top, bottom])


def newton_raphson_solve(
    ybus: np.ndarray,
    slack_index: int,
    pq_indices: list[int],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    v0: np.ndarray,
    options: PowerFlowOptions,
    node_index_to_id: dict[int, str] | None = None,
    zip_table: dict[int, ZipCoeffs] | None = None,
) -> tuple[np.ndarray, bool, int, float, list[dict[str, Any]]]:
    """Newton-Raphson power flow solver with optional white-box trace.

    P20a: When options.trace_level == "full", generates complete white-box trace
    including per-bus mismatch, Jacobian, delta_state, and state_next.

    ADR-011 (Z-ZIP-04): when ``zip_table`` maps a bus index to ZipCoeffs, that
    bus's specified injection is recomputed from the current |V| every iteration
    and the Jacobian gains a ZIP correction term. When ``zip_table`` is falsy the
    code path is identical to the classic constant-power solve (reduce-to-NR).
    """
    v = v0.copy()
    trace: list[dict[str, Any]] = []
    converged = False
    max_mismatch = 0.0
    full_trace = options.trace_level == "full"

    # P20a: Build index mapping for deterministic trace output
    if node_index_to_id is None:
        node_index_to_id = {i: str(i) for i in range(len(v0))}

    for iteration in range(1, options.max_iter + 1):
        p_calc, q_calc = compute_power_injections(ybus, v)
        # ADR-011: voltage-dependent (ZIP) loads recompute the specified
        # injection from the current |V| each iteration. Gated — with no ZIP
        # load the base p_spec/q_spec are used unchanged (reduce-to-NR).
        if zip_table:
            v_mag_now = np.abs(v)
            p_spec_eff = p_spec.copy()
            q_spec_eff = q_spec.copy()
            for z_idx, z_c in zip_table.items():
                p_spec_eff[z_idx] = p_spec[z_idx] * zip_factor(
                    z_c.a_p, z_c.b_p, z_c.c_p, v_mag_now[z_idx], z_c.v0_pu
                )
                q_spec_eff[z_idx] = q_spec[z_idx] * zip_factor(
                    z_c.a_q, z_c.b_q, z_c.c_q, v_mag_now[z_idx], z_c.v0_pu
                )
        else:
            p_spec_eff = p_spec
            q_spec_eff = q_spec
        d_p = p_spec_eff[pq_indices] - p_calc[pq_indices]
        d_q = q_spec_eff[pq_indices] - q_calc[pq_indices]

        max_mismatch = float(np.max(np.abs(np.concatenate([d_p, d_q]))))
        mismatch_norm = float(np.linalg.norm(np.concatenate([d_p, d_q])))

        # P20a: Build per-bus mismatch dict (deterministic order)
        mismatch_per_bus: dict[str, dict[str, float]] | None = None
        if full_trace:
            mismatch_per_bus = {}
            for _i, idx in enumerate(sorted(pq_indices)):
                node_id = node_index_to_id.get(idx, str(idx))
                mismatch_per_bus[node_id] = {
                    "delta_p_pu": float(d_p[pq_indices.index(idx)]) if idx in pq_indices else 0.0,
                    "delta_q_pu": float(d_q[pq_indices.index(idx)]) if idx in pq_indices else 0.0,
                }

        if not np.isfinite(max_mismatch) or not np.isfinite(mismatch_norm):
            trace_entry: dict[str, Any] = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
                "cause_if_failed_optional": "numerical_issue",
            }
            if full_trace and mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            trace.append(trace_entry)
            break

        if max_mismatch < options.tolerance:
            converged = True
            trace_entry = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
            }
            if full_trace:
                if mismatch_per_bus:
                    trace_entry["mismatch_per_bus"] = mismatch_per_bus
                # P20a: Final state
                trace_entry["state_next"] = _build_state_dict(v, node_index_to_id)
                # ADR-011: converged ZIP injections (computed at the converged |V|)
                if zip_table:
                    trace_entry["zip_loads"] = {
                        node_index_to_id.get(z_idx, str(z_idx)): {
                            "p_spec_pu": float(p_spec_eff[z_idx]),
                            "q_spec_pu": float(q_spec_eff[z_idx]),
                        }
                        for z_idx in sorted(zip_table)
                    }
            trace.append(trace_entry)
            break

        jacobian = build_jacobian(ybus, v, pq_indices, p_calc, q_calc)
        if zip_table:
            _apply_zip_jacobian(jacobian, v, pq_indices, p_spec, q_spec, zip_table)
        try:
            step = np.linalg.solve(jacobian, np.concatenate([d_p, d_q]))
        except np.linalg.LinAlgError:
            trace_entry = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
                "cause_if_failed_optional": "singular_jacobian",
            }
            if full_trace and mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            trace.append(trace_entry)
            break

        step *= options.damping
        step_norm = float(np.linalg.norm(step))

        # P20a: Build delta_state before update
        delta_state: dict[str, dict[str, float]] | None = None
        if full_trace:
            delta_state = {}
            n_pq = len(pq_indices)
            for _i, idx in enumerate(sorted(pq_indices)):
                node_id = node_index_to_id.get(idx, str(idx))
                pq_pos = pq_indices.index(idx)
                delta_state[node_id] = {
                    "delta_theta_rad": float(step[pq_pos]),
                    "delta_v_pu": float(step[n_pq + pq_pos]),
                }

        v_mag = np.abs(v)
        v_ang = np.angle(v)
        n_pq = len(pq_indices)
        v_ang[pq_indices] += step[:n_pq]
        v_mag[pq_indices] += step[n_pq:]

        for idx in pq_indices:
            v[idx] = v_mag[idx] * np.exp(1j * v_ang[idx])
        v[slack_index] = v0[slack_index]

        trace_entry = {
            "iter": iteration,
            "max_mismatch_pu": max_mismatch,
            "mismatch_norm": mismatch_norm,
            "step_norm": step_norm,
            "damping_used": float(options.damping),
        }

        # P20a: Add full trace data
        if full_trace:
            if mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            if delta_state:
                trace_entry["delta_state"] = delta_state
            trace_entry["state_next"] = _build_state_dict(v, node_index_to_id)
            # P20a: Jacobian blocks (J1=dP/dθ, J2=dP/dV, J3=dQ/dθ, J4=dQ/dV)
            trace_entry["jacobian"] = _serialize_jacobian_blocks(jacobian, n_pq)
            # ADR-011: white-box ZIP — recomputed (voltage-dependent) injection
            # per ZIP bus at this iteration's |V|.
            if zip_table:
                trace_entry["zip_loads"] = {
                    node_index_to_id.get(z_idx, str(z_idx)): {
                        "p_spec_pu": float(p_spec_eff[z_idx]),
                        "q_spec_pu": float(q_spec_eff[z_idx]),
                    }
                    for z_idx in sorted(zip_table)
                }

        trace.append(trace_entry)

    return v, converged, iteration, max_mismatch, trace


def _build_state_dict(
    v: np.ndarray, node_index_to_id: dict[int, str]
) -> dict[str, dict[str, float]]:
    """P20a: Build deterministic state dict from voltage vector."""
    state = {}
    for idx in sorted(node_index_to_id.keys()):
        if idx < len(v):
            node_id = node_index_to_id[idx]
            state[node_id] = {
                "v_pu": float(np.abs(v[idx])),
                "theta_rad": float(np.angle(v[idx])),
            }
    return state


def _serialize_jacobian_blocks(jacobian: np.ndarray, n_pq: int) -> dict[str, list[list[float]]]:
    """P20a: Serialize Jacobian blocks for white-box trace (deterministic)."""
    # Jacobian structure: [[J1, J2], [J3, J4]]
    # J1 = dP/dθ, J2 = dP/dV, J3 = dQ/dθ, J4 = dQ/dV
    j1 = jacobian[:n_pq, :n_pq]
    j2 = jacobian[:n_pq, n_pq:]
    j3 = jacobian[n_pq:, :n_pq]
    j4 = jacobian[n_pq:, n_pq:]
    return {
        "J1_dP_dTheta": [[float(x) for x in row] for row in j1],
        "J2_dP_dV": [[float(x) for x in row] for row in j2],
        "J3_dQ_dTheta": [[float(x) for x in row] for row in j3],
        "J4_dQ_dV": [[float(x) for x in row] for row in j4],
    }


def newton_raphson_solve_v2(
    ybus: np.ndarray,
    slack_index: int,
    pq_indices: list[int],
    pv_indices: list[int],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    pv_setpoints: dict[int, float],
    pv_q_limits: dict[int, tuple[float, float]],
    v0: np.ndarray,
    options: PowerFlowOptions,
    base_mva: float,
    node_index_to_id: dict[int, str],
    zip_table: dict[int, ZipCoeffs] | None = None,
) -> tuple[
    np.ndarray,
    bool,
    int,
    float,
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    """Newton-Raphson power flow solver v2 (with PV buses) with optional white-box trace.

    P20a: When options.trace_level == "full", generates complete white-box trace
    including per-bus mismatch, Jacobian, delta_state, and state_next.
    """
    v = v0.copy()
    trace: list[dict[str, Any]] = []
    pv_to_pq_switches: list[dict[str, Any]] = []
    converged = False
    max_mismatch = 0.0
    full_trace = options.trace_level == "full"

    active_pq = sorted(pq_indices)
    active_pv = sorted(pv_indices)

    for iteration in range(1, options.max_iter + 1):
        if pv_setpoints:
            v_mag = np.abs(v)
            v_ang = np.angle(v)
            for idx in active_pv:
                v_mag[idx] = pv_setpoints[idx]
                v[idx] = v_mag[idx] * np.exp(1j * v_ang[idx])

        p_calc, q_calc = compute_power_injections(ybus, v)

        switched_this_iter = []
        for idx in list(active_pv):
            if idx not in pv_q_limits:
                continue
            q_min_pu, q_max_pu = pv_q_limits[idx]
            q_calc_consumption = -q_calc[idx]
            if q_calc_consumption < q_min_pu or q_calc_consumption > q_max_pu:
                limit_pu = q_min_pu if q_calc_consumption < q_min_pu else q_max_pu
                q_spec[idx] = -limit_pu
                active_pv.remove(idx)
                active_pq.append(idx)
                active_pq.sort()
                node_id = node_index_to_id[idx]
                pv_to_pq_switches.append(
                    {
                        "iter": iteration,
                        "node_id": node_id,
                        "q_calc_mvar": float(q_calc_consumption * base_mva),
                        "limit_mvar": float(limit_pu * base_mva),
                        "direction": "under" if q_calc_consumption < q_min_pu else "over",
                    }
                )
                switched_this_iter.append(node_id)

        non_slack_indices = sorted([idx for idx in active_pq + active_pv if idx != slack_index])

        # ADR-011: recompute voltage-dependent (ZIP) injections from current |V|.
        # Gated — with no ZIP load the base p_spec/q_spec are used unchanged
        # (reduce-to-NR). Placed after PV-limit handling so switched-bus q_spec
        # values are respected; ZIP touches only ZIP (PQ-load) buses.
        if zip_table:
            v_mag_now = np.abs(v)
            p_spec_eff = p_spec.copy()
            q_spec_eff = q_spec.copy()
            for z_idx, z_c in zip_table.items():
                p_spec_eff[z_idx] = p_spec[z_idx] * zip_factor(
                    z_c.a_p, z_c.b_p, z_c.c_p, v_mag_now[z_idx], z_c.v0_pu
                )
                q_spec_eff[z_idx] = q_spec[z_idx] * zip_factor(
                    z_c.a_q, z_c.b_q, z_c.c_q, v_mag_now[z_idx], z_c.v0_pu
                )
        else:
            p_spec_eff = p_spec
            q_spec_eff = q_spec
        d_p = p_spec_eff[non_slack_indices] - p_calc[non_slack_indices]
        d_q = q_spec_eff[active_pq] - q_calc[active_pq]

        mismatch = np.concatenate([d_p, d_q])
        max_mismatch = float(np.max(np.abs(mismatch))) if mismatch.size else 0.0
        mismatch_norm = float(np.linalg.norm(mismatch)) if mismatch.size else 0.0

        # P20a: Build per-bus mismatch dict (deterministic order)
        mismatch_per_bus: dict[str, dict[str, float]] | None = None
        if full_trace:
            mismatch_per_bus = {}
            # P mismatch for all non-slack nodes
            for i, idx in enumerate(non_slack_indices):
                node_id = node_index_to_id.get(idx, str(idx))
                mismatch_per_bus[node_id] = {"delta_p_pu": float(d_p[i])}
            # Q mismatch for PQ nodes only
            for i, idx in enumerate(active_pq):
                node_id = node_index_to_id.get(idx, str(idx))
                if node_id in mismatch_per_bus:
                    mismatch_per_bus[node_id]["delta_q_pu"] = float(d_q[i])
                else:
                    mismatch_per_bus[node_id] = {"delta_p_pu": 0.0, "delta_q_pu": float(d_q[i])}

        if mismatch.size and (not np.isfinite(max_mismatch) or not np.isfinite(mismatch_norm)):
            trace_entry: dict[str, Any] = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
                "pv_to_pq_optional": switched_this_iter,
                "cause_if_failed_optional": "numerical_issue",
            }
            if full_trace and mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            trace.append(trace_entry)
            break

        if max_mismatch < options.tolerance:
            converged = True
            trace_entry = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
                "pv_to_pq_optional": switched_this_iter,
            }
            if full_trace:
                if mismatch_per_bus:
                    trace_entry["mismatch_per_bus"] = mismatch_per_bus
                trace_entry["state_next"] = _build_state_dict(v, node_index_to_id)
                if zip_table:
                    trace_entry["zip_loads"] = {
                        node_index_to_id.get(z_idx, str(z_idx)): {
                            "p_spec_pu": float(p_spec_eff[z_idx]),
                            "q_spec_pu": float(q_spec_eff[z_idx]),
                        }
                        for z_idx in sorted(zip_table)
                    }
            trace.append(trace_entry)
            break

        jacobian = build_jacobian_v2(ybus, v, non_slack_indices, active_pq, p_calc, q_calc)
        if zip_table:
            _apply_zip_jacobian_v2(
                jacobian, v, non_slack_indices, active_pq, p_spec, q_spec, zip_table
            )
        try:
            step = np.linalg.solve(jacobian, mismatch)
        except np.linalg.LinAlgError:
            trace_entry = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": 0.0,
                "damping_used": float(options.damping),
                "pv_to_pq_optional": switched_this_iter,
                "cause_if_failed_optional": "singular_jacobian",
            }
            if full_trace and mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            trace.append(trace_entry)
            break

        step *= options.damping
        step_norm = float(np.linalg.norm(step)) if step.size else 0.0

        # P20a: Build delta_state before update
        delta_state: dict[str, dict[str, float]] | None = None
        if full_trace:
            delta_state = {}
            n_p = len(non_slack_indices)
            # Theta changes for all non-slack
            for i, idx in enumerate(non_slack_indices):
                node_id = node_index_to_id.get(idx, str(idx))
                delta_state[node_id] = {"delta_theta_rad": float(step[i])}
            # V magnitude changes for PQ only
            for i, idx in enumerate(active_pq):
                node_id = node_index_to_id.get(idx, str(idx))
                if node_id in delta_state:
                    delta_state[node_id]["delta_v_pu"] = float(step[n_p + i])
                else:
                    delta_state[node_id] = {
                        "delta_theta_rad": 0.0,
                        "delta_v_pu": float(step[n_p + i]),
                    }

        v_mag = np.abs(v)
        v_ang = np.angle(v)
        n_p = len(non_slack_indices)
        v_ang[non_slack_indices] += step[:n_p]
        if active_pq:
            v_mag[active_pq] += step[n_p:]

        for idx in non_slack_indices:
            v[idx] = v_mag[idx] * np.exp(1j * v_ang[idx])
        v[slack_index] = v0[slack_index]

        trace_entry = {
            "iter": iteration,
            "max_mismatch_pu": max_mismatch,
            "mismatch_norm": mismatch_norm,
            "step_norm": step_norm,
            "damping_used": float(options.damping),
            "pv_to_pq_optional": switched_this_iter,
        }

        # P20a: Add full trace data
        if full_trace:
            if mismatch_per_bus:
                trace_entry["mismatch_per_bus"] = mismatch_per_bus
            if delta_state:
                trace_entry["delta_state"] = delta_state
            trace_entry["state_next"] = _build_state_dict(v, node_index_to_id)
            # P20a: Jacobian blocks for v2 (different structure - n_p x n_p for J1, n_p x n_q for J2, etc.)
            n_q = len(active_pq)
            trace_entry["jacobian"] = _serialize_jacobian_blocks_v2(jacobian, n_p, n_q)
            if zip_table:
                trace_entry["zip_loads"] = {
                    node_index_to_id.get(z_idx, str(z_idx)): {
                        "p_spec_pu": float(p_spec_eff[z_idx]),
                        "q_spec_pu": float(q_spec_eff[z_idx]),
                    }
                    for z_idx in sorted(zip_table)
                }

        trace.append(trace_entry)

    return v, converged, iteration, max_mismatch, trace, pv_to_pq_switches


def _serialize_jacobian_blocks_v2(
    jacobian: np.ndarray, n_p: int, n_q: int
) -> dict[str, list[list[float]]]:
    """P20a: Serialize Jacobian blocks for v2 solver (with PV buses).

    Structure: [[J1 (n_p x n_p), J2 (n_p x n_q)], [J3 (n_q x n_p), J4 (n_q x n_q)]]
    J1 = dP/dθ, J2 = dP/dV, J3 = dQ/dθ, J4 = dQ/dV
    """
    j1 = jacobian[:n_p, :n_p]
    j2 = jacobian[:n_p, n_p:] if n_q > 0 else np.array([]).reshape(n_p, 0)
    j3 = jacobian[n_p:, :n_p] if n_q > 0 else np.array([]).reshape(0, n_p)
    j4 = jacobian[n_p:, n_p:] if n_q > 0 else np.array([]).reshape(0, 0)
    return {
        "J1_dP_dTheta": [[float(x) for x in row] for row in j1],
        "J2_dP_dV": [[float(x) for x in row] for row in j2],
        "J3_dQ_dTheta": [[float(x) for x in row] for row in j3],
        "J4_dQ_dV": [[float(x) for x in row] for row in j4],
    }


def compute_branch_flows(
    graph: NetworkGraph,
    node_voltage: dict[str, complex],
    base_mva: float,
    slack_voltage_kv: float,
    tap_ratios: dict[str, float] | None = None,
) -> tuple[dict[str, complex], dict[str, complex], dict[str, complex], complex, str]:
    branch_current_pu: dict[str, complex] = {}
    branch_s_from_pu: dict[str, complex] = {}
    branch_s_to_pu: dict[str, complex] = {}
    losses_total_pu = 0.0 + 0.0j

    if not node_voltage:
        return branch_current_pu, branch_s_from_pu, branch_s_to_pu, losses_total_pu, ""

    if slack_voltage_kv <= 0:
        note = "Branch flow calculation skipped: slack voltage_level missing."
        return branch_current_pu, branch_s_from_pu, branch_s_to_pu, losses_total_pu, note

    z_base = (slack_voltage_kv**2) / base_mva

    for branch_id, branch in graph.branches.items():
        if not branch.in_service:
            continue
        if branch.from_node_id not in node_voltage:
            continue
        if branch.to_node_id not in node_voltage:
            continue

        tap_ratio = 1.0
        if tap_ratios and branch_id in tap_ratios:
            tap_ratio = tap_ratios[branch_id]
        y_series, y_shunt = _branch_admittance_pu(branch, z_base)
        if y_series is None:
            continue

        v_from = node_voltage[branch.from_node_id]
        v_to = node_voltage[branch.to_node_id]

        if isinstance(branch, TransformerBranch) and tap_ratio != 1.0:
            i_from = (v_from / (tap_ratio**2)) * y_series - (v_to / tap_ratio) * y_series
            i_to = -(v_from / tap_ratio) * y_series + v_to * y_series
        else:
            y_shunt_val = y_shunt if y_shunt is not None else 0j
            i_from = (v_from - v_to) * y_series + v_from * y_shunt_val
            i_to = (v_to - v_from) * y_series + v_to * y_shunt_val

        s_from = v_from * np.conj(i_from)
        s_to = v_to * np.conj(i_to)

        branch_current_pu[branch_id] = i_from
        branch_s_from_pu[branch_id] = s_from
        branch_s_to_pu[branch_id] = s_to
        losses_total_pu += s_from + s_to

    return branch_current_pu, branch_s_from_pu, branch_s_to_pu, losses_total_pu, ""


def _branch_admittance_pu(branch: Branch, z_base: float) -> tuple[complex | None, complex | None]:
    if isinstance(branch, LineBranch):
        y_series = branch.get_series_admittance() * z_base
        y_shunt = branch.get_shunt_admittance_per_end() * z_base
        return y_series, y_shunt
    if isinstance(branch, TransformerBranch):
        impedance = branch.get_short_circuit_impedance_ohm_lv()
        if impedance == 0:
            return None, None
        y_series = (1.0 / impedance) * z_base
        return y_series, 0.0 + 0.0j
    return None, None


def options_to_trace(options: PowerFlowOptions) -> dict[str, Any]:
    return asdict(options)


def _find_duplicates(values: list[str]) -> set[str]:
    seen = set()
    duplicates = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


def _build_ybus_ohm(
    graph: NetworkGraph, node_id_to_index: dict[str, int], tap_ratios: dict[str, float]
) -> tuple[np.ndarray, list[dict[str, Any]]]:
    size = len(node_id_to_index)
    y_bus = np.zeros((size, size), dtype=complex)
    applied_taps: list[dict[str, Any]] = []

    # K30-14 NO-GO #10 (singular Jacobian fix): closed switches connect buses
    # topologically ale dotychczas NIE wstawiały do Y-bus admittance. Buses
    # connected only via switches były dangling rows in Y-bus → Jacobian
    # singular → Newton-Raphson divergence z step_norm=0.
    # Standard engineering practice: zamknięty łącznik = bardzo mała impedancja
    # (R=X=0.0001 ohm). Y_short = 1/(R+jX) = bardzo duża admittance →
    # voltage equalization between bus endpoints przy minimalnym wpływie na flow.
    # Open switches → no edge (correct: galvanic break).
    Y_CLOSED_SWITCH = 1.0 / complex(0.0001, 0.0001)
    for switch in graph.switches.values():
        if not switch.in_service:
            continue
        # SwitchState.CLOSED only — open switches don't conduct
        from network_model.core.switch import SwitchState

        if switch.state != SwitchState.CLOSED:
            continue
        from_idx = node_id_to_index.get(switch.from_node_id)
        to_idx = node_id_to_index.get(switch.to_node_id)
        if from_idx is None or to_idx is None:
            continue
        y_bus[from_idx, to_idx] -= Y_CLOSED_SWITCH
        y_bus[to_idx, from_idx] -= Y_CLOSED_SWITCH
        y_bus[from_idx, from_idx] += Y_CLOSED_SWITCH
        y_bus[to_idx, to_idx] += Y_CLOSED_SWITCH

    for branch in graph.branches.values():
        if not branch.in_service:
            continue

        from_idx = node_id_to_index[branch.from_node_id]
        to_idx = node_id_to_index[branch.to_node_id]

        y_series, y_shunt = _get_branch_admittances_ohm(branch)

        tap_ratio = 1.0
        tap_source = None
        if isinstance(branch, TransformerBranch):
            if branch.tap_position != 0:
                tap_ratio = branch.get_tap_ratio()
                tap_source = "core"
            elif branch.id in tap_ratios:
                tap_ratio = tap_ratios[branch.id]
                tap_source = "overlay"
            else:
                tap_ratio = branch.get_tap_ratio()
                if tap_ratio != 1.0:
                    tap_source = "core"
        elif branch.id in tap_ratios:
            tap_ratio = tap_ratios[branch.id]
            tap_source = "overlay"

        if tap_ratio <= 0:
            raise ValueError(f"Tap ratio must be > 0 for branch '{branch.id}'")

        if tap_source:
            applied_taps.append(
                {
                    "branch_id": branch.id,
                    "tap_ratio": float(tap_ratio),
                    "source": tap_source,
                }
            )

        if tap_ratio != 1.0 and isinstance(branch, TransformerBranch):
            y_bus[from_idx, from_idx] += y_series / (tap_ratio**2)
            y_bus[from_idx, to_idx] += -y_series / tap_ratio
            y_bus[to_idx, from_idx] += -y_series / tap_ratio
            y_bus[to_idx, to_idx] += y_series
        else:
            y_bus[from_idx, to_idx] -= y_series
            y_bus[to_idx, from_idx] -= y_series

            y_bus[from_idx, from_idx] += y_series + y_shunt
            y_bus[to_idx, to_idx] += y_series + y_shunt

    return y_bus, applied_taps


def _get_branch_admittances_ohm(branch: Branch) -> tuple[complex, complex]:
    if isinstance(branch, LineBranch):
        return branch.get_series_admittance(), branch.get_shunt_admittance_per_end()
    if isinstance(branch, TransformerBranch):
        impedance = branch.get_short_circuit_impedance_ohm_lv()
        if impedance == 0:
            raise ZeroDivisionError("Cannot compute transformer admittance: impedance is zero")
        return 1.0 / impedance, 0.0 + 0.0j
    raise ValueError(f"Unsupported branch type: {branch.branch_type}")


def _apply_shunts_pu(
    ybus_pu: np.ndarray,
    node_index_map: dict[str, int],
    shunts: Iterable[ShuntSpec],
) -> list[dict[str, Any]]:
    applied: list[dict[str, Any]] = []
    for shunt in shunts:
        if shunt.node_id not in node_index_map:
            continue
        idx = node_index_map[shunt.node_id]
        ybus_pu[idx, idx] += complex(shunt.g_pu, shunt.b_pu)
        applied.append(
            {
                "node_id": shunt.node_id,
                "g_pu": float(shunt.g_pu),
                "b_pu": float(shunt.b_pu),
                "source": "overlay",
            }
        )
    return applied
