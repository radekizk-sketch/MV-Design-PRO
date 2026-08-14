from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from dataclasses import asdict
from typing import Any

import numpy as np
from network_model.core.branch import Branch, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_inverter import (
    InverterControl,
    InverterShaping,
    inverter_effective_spec,
    qu_dq_dv,
    qu_q,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    ShuntSpec,
)
from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    zip_effective_spec,
    zip_factor,
    zip_factor_derivative,
)


def transformer_clock_number(vector_group: str | None) -> int | None:
    """Clock number k of an IEC vector group label (``'Dyn11'`` -> ``11``).

    The clock number is the trailing integer of the vector-group string, taken
    modulo 12. Returns ``None`` when no digits are present (e.g. a bare ``'Dyn'``
    or an empty string) so callers can treat the transformer as having no
    defined phase displacement.
    """
    if not vector_group:
        return None
    digits = "".join(c for c in vector_group if c.isdigit())
    if not digits:
        return None
    return int(digits) % 12


def transformer_phase_shift_rad(vector_group: str | None) -> float:
    """Phase displacement θ [rad] the vector group imposes on the LV (``to``)
    side relative to the HV (``from``) side, with positive = LV leads HV.

    SM-2 (V12K-180). IEC convention: the clock number k puts the LV phasor at
    ``k`` o'clock, i.e. lagging the HV phasor by ``k·30°``. Equivalently the LV
    leads the HV by ``−k·30°``, normalised to the principal range (−180°, 180°]:

        Dyn11 → +30°   Dyn1 → −30°   Dyn5 → −150°   Dyn7 → +150°   Yy0/Dyn0 → 0°

    Returns ``0.0`` when the clock number is undefined. This θ is the shift that
    appears on every node behind the transformer in a balanced power flow; the
    magnitudes |V| are unaffected (it is a rotation of the downstream reference).
    """
    k = transformer_clock_number(vector_group)
    if k is None:
        return 0.0
    deg = -(k * 30.0)
    # normalise to the principal range (-180, 180]
    deg = ((deg + 180.0) % 360.0) - 180.0
    return float(np.deg2rad(deg))


def _seed_phase_shift_angles(
    graph: NetworkGraph, node_list: list[str], slack_node_id: str
) -> dict[str, float]:
    """SM-2 (V12K-180): cumulative vector-group phase displacement [rad] of each
    bus relative to the slack, following the path through the network.

    A flat start seeded with these angles lands next to the physically shifted
    solution (Dyn11 → +30° behind each transformer, accumulating through cascaded
    transformers), which keeps Newton robust when large group shifts (e.g. Dyn5 →
    −150°) would otherwise pull a flat 0° start toward a spurious low-voltage
    root. Seeding only moves the starting point — the converged |V|/θ are the
    same solution. Traversal is deterministic (BFS from the slack, neighbours in
    sorted order); only closed switches conduct, matching the Y-bus.
    """
    from network_model.core.switch import SwitchState

    node_set = set(node_list)
    seed = {node_id: 0.0 for node_id in node_list}
    if slack_node_id not in node_set:
        return seed

    adjacency: dict[str, list[tuple[str, float]]] = {node_id: [] for node_id in node_list}
    for branch in graph.branches.values():
        if not branch.in_service:
            continue
        u, v = branch.from_node_id, branch.to_node_id
        if u not in node_set or v not in node_set:
            continue
        theta = 0.0
        if isinstance(branch, TransformerBranch):
            # from = HV, to = LV: angle[to] = angle[from] + θ (LV leads HV).
            theta = transformer_phase_shift_rad(branch.vector_group)
        adjacency[u].append((v, theta))
        adjacency[v].append((u, -theta))
    for switch in graph.switches.values():
        if not switch.in_service or switch.state != SwitchState.CLOSED:
            continue
        u, v = switch.from_node_id, switch.to_node_id
        if u not in node_set or v not in node_set:
            continue
        adjacency[u].append((v, 0.0))
        adjacency[v].append((u, 0.0))

    visited = {slack_node_id}
    queue: deque[str] = deque([slack_node_id])
    while queue:
        current = queue.popleft()
        for neighbour, delta in sorted(adjacency[current]):
            if neighbour in visited:
                continue
            seed[neighbour] = seed[current] + delta
            visited.add(neighbour)
            queue.append(neighbour)
    return seed


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
    (Q eq). Same reduce-to-NR property: a=b=0 => derivative 0 => no change.

    Defect D1: p_spec/q_spec here are the ZIP BASE (the load part, after
    split_zip_constant_part), so the derivative is taken over the load alone —
    the constant part (generation) contributes zero, as physics requires."""
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


def pv_calculated_injections(
    pv_specs: Iterable[PVSpec],
    node_index_map: dict[str, int],
    p_calc: np.ndarray,
    q_calc: np.ndarray,
) -> tuple[dict[str, float], dict[str, float]]:
    """What a voltage-controlled bus actually injected, at the converged state.

    On a PV bus the reactive power is NOT specified — it is the RESULT: it is the
    quantity that holds the requested voltage magnitude. The solver already knows
    it, because the very same nodal equation (S_i = V_i * conj(sum_k Y_ik V_k))
    yields the slack power a few lines above; up to this function it was published
    for the slack ONLY. Measured gap (debt W2-D1, V12K-318): the report showed
    0.000000 Mvar for a PV bus where an independent nodal balance gives
    0.405463 Mvar — the bus looked reactively idle while it was regulating.

    NO new physics: the same `p_calc`/`q_calc` arrays the slack is read from.
    INJECTION convention, pu on base_mva — identical to `effective_pq_injections`,
    so a consumer merging both dictionaries keeps ONE sign convention.

    P is published too. On a PV bus it equals the specification, but reading it
    from the same nodal equation keeps a single source of "what was injected" and
    makes the pair (P, Q) close the balance by construction.
    """
    p_out: dict[str, float] = {}
    q_out: dict[str, float] = {}
    for spec in pv_specs:
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        p_out[spec.node_id] = float(p_calc[idx])
        q_out[spec.node_id] = float(q_calc[idx])
    return p_out, q_out


def effective_pq_injections(
    pq_specs: Iterable[PQSpec],
    node_index_map: dict[str, int],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    v: np.ndarray,
    zip_table: dict[int, ZipCoeffs] | None,
    inv_table: dict[int, InverterControl] | None,
    zip_const: tuple[np.ndarray, np.ndarray] | None,
) -> tuple[dict[str, float], dict[str, float]]:
    """Defect D1: the injection each PQ bus actually got, at the converged |V|.

    Same evaluation the solvers use for their final mismatch: the ZIP polynomial
    applied to the load base plus the constant part, and the volt-var Q(U) value
    at inverter buses. At a classic constant-power bus it returns the untouched
    p_spec/q_spec, so the reported value there is unchanged. Shared by NR/GS/FD
    (one truth about 'what was injected'); the result table reports THIS instead
    of the pre-polynomial request, otherwise the nodal balance does not close.
    Injection convention, pu on base_mva."""
    p_eff, q_eff = zip_effective_spec(p_spec, q_spec, v, zip_table, zip_const)
    q_eff = inverter_effective_spec(q_eff, v, inv_table)
    p_out: dict[str, float] = {}
    q_out: dict[str, float] = {}
    for spec in pq_specs:
        idx = node_index_map.get(spec.node_id)
        if idx is None:
            continue
        p_out[spec.node_id] = float(p_eff[idx])
        q_out[spec.node_id] = float(q_eff[idx])
    return p_out, q_out


def _zip_loads_trace(
    zip_table: dict[int, ZipCoeffs],
    node_index_to_id: dict[int, str],
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    p_spec_eff: np.ndarray,
    q_spec_eff: np.ndarray,
    zip_const: tuple[np.ndarray, np.ndarray] | None,
) -> dict[str, dict[str, float]]:
    """WHITE BOX (Rule #2) view of the ZIP buses for the trace.

    Reports the effective injection together with its two components, so an
    auditor reproduces the multiplier from the numbers alone:

        p_spec_pu = p_base_pu * f_ZIP(|V|) + p_const_pu

    ``*_base_pu`` is the load part the polynomial scales, ``*_const_pu`` the
    constant part of the bus (generation) — zero when the bus is load-only."""
    out: dict[str, dict[str, float]] = {}
    for z_idx in sorted(zip_table):
        node_id = node_index_to_id.get(z_idx, str(z_idx))
        out[node_id] = {
            "p_spec_pu": float(p_spec_eff[z_idx]),
            "q_spec_pu": float(q_spec_eff[z_idx]),
            "p_base_pu": float(p_spec[z_idx]),
            "q_base_pu": float(q_spec[z_idx]),
            "p_const_pu": float(zip_const[0][z_idx]) if zip_const is not None else 0.0,
            "q_const_pu": float(zip_const[1][z_idx]) if zip_const is not None else 0.0,
        }
    return out


def _inverter_sources_trace(
    inv_table: dict[int, InverterControl] | None,
    inv_shaping: dict[int, InverterShaping] | None,
    node_index_to_id: dict[int, str],
    v: np.ndarray,
    p_spec_eff: np.ndarray,
    q_spec_eff: np.ndarray,
) -> dict[str, dict[str, float | str]]:
    """WHITE BOX (Rule #2) view of the controlled sources for the trace (defect B).

    The audit that missed defect B could not have caught it from this trace: it
    reported only the BUS injection, so a cosφ source deriving its reactive power
    from the LOAD's active power looked exactly like a correct one. The record now
    carries the shaping INPUT and its RESULT, so the rachunek is reproducible from
    the numbers alone:

        p_shaped_pu   = p_source_pu * lfsm_factor
        q_shaped_pu   = q_over_p * |p_shaped_pu|      (cosφ modes)
        q_volt_var_pu = qu_q(|V|)                     (Q(U) mode, per iteration)
        q_spec_pu     = (bus power without this source) + q_shaped/q_volt_var

    Covers every shaped source, not only the voltage-dependent ones — a cosφ or
    P(f) source is shaped too and was invisible here before."""
    v_mag = np.abs(v)
    records = inv_shaping or {}
    controls = inv_table or {}
    out: dict[str, dict[str, float | str]] = {}
    for i_idx in sorted(set(records) | set(controls)):
        entry: dict[str, float | str] = {
            "p_spec_pu": float(p_spec_eff[i_idx]),
            "q_spec_pu": float(q_spec_eff[i_idx]),
        }
        sh = records.get(i_idx)
        if sh is not None:
            entry["p_source_pu"] = sh.p_source_pu
            entry["q_source_pu"] = sh.q_source_pu
            entry["p_shaped_pu"] = sh.p_shaped_pu
            entry["q_shaped_pu"] = sh.q_shaped_pu
            entry["lfsm_factor"] = sh.lfsm_factor
        c = controls.get(i_idx)
        if c is not None:
            entry["q_volt_var_pu"] = float(qu_q(c, v_mag[i_idx]))
        entry["mode"] = (c.mode if c is not None else sh.mode).value  # type: ignore[union-attr]
        out[node_index_to_id.get(i_idx, str(i_idx))] = entry
    return out


def _apply_inverter_jacobian_v2(
    jacobian: np.ndarray,
    v: np.ndarray,
    non_slack_indices: list[int],
    active_pq: list[int],
    inv_table: dict[int, InverterControl],
) -> None:
    """ADR-011 §5b: inverter Q(U) correction for the v2 Jacobian.

    An inverter source is a PQ bus whose Q follows the volt-var droop Q(U); its
    only voltage derivative is ∂Q_spec/∂V (the droop slope), so it touches the
    J22 diagonal exactly like the ZIP ∂Q/∂V term. P is frequency- (not voltage-)
    dependent, so there is no J12 term. In the deadband or where Q is clamped the
    slope is 0 → no change (reduce-to-NR)."""
    n_p = len(non_slack_indices)
    v_mag = np.abs(v)
    for idx, c in inv_table.items():
        if idx not in active_pq or idx not in non_slack_indices:
            continue
        col_q = active_pq.index(idx)
        jacobian[n_p + col_q, n_p + col_q] -= qu_dq_dv(c, v_mag[idx])


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

    slack_voltage_kv = graph.nodes[slack_node_id].voltage_level

    ybus_ohm, applied_taps, applied_phase_shifts = _build_ybus_ohm(
        graph, node_id_to_index_full, tap_ratios, slack_voltage_kv
    )
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
        # SM-2 (V12K-180): white-box record of transformer vector-group phase
        # displacements applied to the Y-bus (empty when no group shifts angles).
        "applied_phase_shifts": applied_phase_shifts,
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
    else:
        # SM-2 (V12K-180): seed flat-start angles with the cumulative vector-group
        # phase displacement from the slack, so the start sits near the physically
        # shifted solution. Converged values are unchanged; robustness improves.
        seed_angles = _seed_phase_shift_angles(graph, node_list, slack_node_id)
        for node_id, idx in node_index_map.items():
            v[idx] = np.exp(1j * (slack_angle_rad + seed_angles[node_id]))

    slack_idx = node_index_map[slack_node_id]
    v[slack_idx] = slack_u_pu * np.exp(1j * slack_angle_rad)
    return v


def compute_power_injections(ybus: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    i_inj = ybus @ v
    s_inj = v * np.conj(i_inj)
    return s_inj.real, s_inj.imag


def trig_bloku(va_w: np.ndarray, va_k: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Sinus i cosinus różnicy kątów bloku — JEDNO źródło dla produkcji i pinu składania.

    Wydzielone z ``build_jacobian_v2`` świadomie, po zderzeniu z runnerem CI
    (2026-08-14): pin składania porównuje TO SAMO wejście trygonometryczne, którego
    używa produkcja, więc równoważność postaci blokowej i skalarnej jest własnością
    KONSTRUKCJI, a nie założeniem o ścieżce SIMD biblioteki. Różnicę wektor-vs-skalar
    pilnuje osobny pin (``test_trig_wektorowy_vs_skalarny_najwyzej_1_ulp``).
    """
    theta = va_w[:, None] - va_k[None, :]
    return np.sin(theta), np.cos(theta)


def wyrazy_przekatne(
    g: np.ndarray,
    b: np.ndarray,
    vm_ns: np.ndarray,
    vm_pq: np.ndarray,
    p_calc: np.ndarray,
    q_calc: np.ndarray,
    ns: np.ndarray,
    pq: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Wyrazy przekątniowe czterech bloków — JEDNO źródło dla produkcji i pinu składania.

    Wydzielone z tego samego powodu, co ``trig_bloku`` (2026-08-14): po ujednoliceniu
    trygonometrii runner CI DALEJ meldował różnicę bitową, a jedynym miejscem, w którym
    produkcja liczyła WEKTOROWO, a pętla skalarnie, były wyrazy przekątniowe — w
    szczególności ``vm ** 2``, dla którego numpy może wybrać inną drogę dla tablicy
    (mnożenie) niż dla skalara (``pow`` z libm). To znowu własność biblioteki, a nie
    sposobu składania, więc pin składania nie może o nią zahaczać.
    """
    return (
        -q_calc[ns] - b[ns, ns] * vm_ns**2,
        p_calc[ns] / vm_ns + g[ns, ns] * vm_ns,
        p_calc[pq] - g[pq, pq] * vm_pq**2,
        q_calc[pq] / vm_pq - b[pq, pq] * vm_pq,
    )


def build_jacobian_v2(
    ybus: np.ndarray,
    v: np.ndarray,
    non_slack_indices: list[int],
    pq_indices: list[int],
    p_calc: np.ndarray,
    q_calc: np.ndarray,
) -> np.ndarray:
    """Jakobian rozpływu Newtona-Raphsona — SKŁADANIE BLOKOWE (bez pętli skalarnej).

    FIZYKA NIETKNIĘTA. To jest wyłącznie zmiana SPOSOBU SKŁADANIA tej samej
    macierzy: każdy wyraz ``J[row, col]`` powstaje z DOKŁADNIE tego samego wyrażenia
    i w tej samej kolejności działań, co w pętli skalarnej — zmieniło się tylko to,
    że wyrażenie jest liczone dla całego bloku naraz zamiast wyraz po wyrazie.
    Żaden wyraz nie jest pomijany (również tam, gdzie ``g[i,k] == b[i,k] == 0``),
    więc nie powstają zera o innym znaku niż w pętli, i nie ma tu ŻADNEJ redukcji
    (sumowania po osi), która mogłaby zmienić kolejność dodawań.

    Kolejność działań przepisana wyraz w wyraz z postaci skalarnej:
      J11 poza przekątną  ``v_mag[i] * v_mag[k] * (g*sin - b*cos)``  → ``(vm_i*vm_k)*expr``
      J12 poza przekątną  ``v_mag[i] * (g*cos + b*sin)``
      J21 poza przekątną  ``-v_mag[i] * v_mag[k] * (g*cos + b*sin)`` → ``((-vm_i)*vm_k)*expr``
      J22 poza przekątną  ``v_mag[i] * (g*sin - b*cos)``
    Wyraz przekątniowy (warunek ``i == k`` na indeksach WĘZŁA, nie wiersza/kolumny —
    dla bloków mieszanych ns×pq przekątna nie leży na ``row == col``) wybiera maska
    ``np.equal.outer``, czyli ten sam predykat, który w pętli był instrukcją ``if``.

    KOREKTA ZAŁOŻENIA (2026-08-14, dyspozycja właściciela po pomiarze). Pierwotnie
    stało tu, że wektorowe ``np.sin``/``np.cos`` dają bit w bit to samo, co wywołania
    skalarne. To jest NIEPRAWDA na niektórych procesorach: na tej maszynie różnic nie
    ma (0 na 376 996 wyrazów jakobianu substratu 53 stacji), ale runner CI wybiera
    inną ścieżkę SIMD i ostatni bit sinusa bywa inny. Dlatego:

    * wejście trygonometryczne pochodzi z JEDNEJ funkcji (``trig_bloku``), której
      używa też pin składania — równoważność postaci blokowej i skalarnej jest więc
      własnością KONSTRUKCJI, sprawdzaną bitowo niezależnie od procesora;
    * różnicę wektor-vs-skalar pilnuje OSOBNY pin (``≤ 1 ULP``), bo to własność
      biblioteki, a nie tego kodu.

    Zmierzony wpływ najgorszego przypadku (1 ULP na sinusie, substrat 53 stacji,
    Y-bus 308×308): jakobian ``max |Δ| = 2,8e-17`` (względnie 2,2e-16), krok Newtona
    ``max |Δdx| = 7,0e-12`` — cztery rzędy PONIŻEJ tolerancji zbieżności 1e-8.
    Determinizm w obrębie jednego środowiska jest nietknięty (ten sam wynik przy
    powtórzeniu); bit-identyczność wyniku MIĘDZY maszynami nie była i nie jest
    gwarantowana — tak samo zachowuje się BLAS/LAPACK pod ``scipy``.

    Powód zmiany (karta N1-WYDAJNOSC): profil enumeracji N-1 na substracie 53 stacji
    wskazał tę funkcję jako 76 % czasu WŁASNEGO całej analizy — dla sieci 315 węzłów
    pętla wykonywała ~394 tys. skalarnych wywołań ufunc na jedno złożenie jakobianu.
    """
    g = ybus.real
    b = ybus.imag
    ns = np.asarray(non_slack_indices, dtype=np.intp)
    pq = np.asarray(pq_indices, dtype=np.intp)

    v_mag = np.abs(v)
    v_ang = np.angle(v)

    vm_ns = v_mag[ns]
    vm_pq = v_mag[pq]
    va_ns = v_ang[ns]
    va_pq = v_ang[pq]

    def _blok(
        wiersze: np.ndarray,
        kolumny: np.ndarray,
        vm_w: np.ndarray,
        va_w: np.ndarray,
        va_k: np.ndarray,
        poza_przekatna: Any,
        przekatna: np.ndarray,
    ) -> np.ndarray:
        """Złóż jeden blok: wyraz poza przekątną, wyraz przekątniowy wg maski ``i == k``."""
        sin_t, cos_t = trig_bloku(va_w, va_k)
        wybor = np.ix_(wiersze, kolumny)
        wartosci = poza_przekatna(g[wybor], b[wybor], sin_t, cos_t, vm_w)
        return np.where(np.equal.outer(wiersze, kolumny), przekatna[:, None], wartosci)

    przek_11, przek_12, przek_21, przek_22 = wyrazy_przekatne(
        g, b, vm_ns, vm_pq, p_calc, q_calc, ns, pq
    )

    j11 = _blok(
        ns,
        ns,
        vm_ns,
        va_ns,
        va_ns,
        lambda g_ik, b_ik, sin_t, cos_t, vm_i: vm_i[:, None]
        * vm_ns[None, :]
        * (g_ik * sin_t - b_ik * cos_t),
        przek_11,
    )
    j12 = _blok(
        ns,
        pq,
        vm_ns,
        va_ns,
        va_pq,
        lambda g_ik, b_ik, sin_t, cos_t, vm_i: vm_i[:, None] * (g_ik * cos_t + b_ik * sin_t),
        przek_12,
    )
    j21 = _blok(
        pq,
        ns,
        vm_pq,
        va_pq,
        va_ns,
        lambda g_ik, b_ik, sin_t, cos_t, vm_i: -vm_i[:, None]
        * vm_ns[None, :]
        * (g_ik * cos_t + b_ik * sin_t),
        przek_21,
    )
    j22 = _blok(
        pq,
        pq,
        vm_pq,
        va_pq,
        va_pq,
        lambda g_ik, b_ik, sin_t, cos_t, vm_i: vm_i[:, None] * (g_ik * sin_t - b_ik * cos_t),
        przek_22,
    )

    top = np.hstack([j11, j12])
    bottom = np.hstack([j21, j22])
    return np.vstack([top, bottom])


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
    inv_table: dict[int, InverterControl] | None = None,
    zip_const: tuple[np.ndarray, np.ndarray] | None = None,
    inv_shaping: dict[int, InverterShaping] | None = None,
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

    Defect D1: with ``zip_const`` (from split_zip_constant_part) p_spec/q_spec are
    the ZIP BASE (load part) and the constant part (generation on the same bus) is
    added back after the polynomial. None => no split => historical path.

    Defect B: ``inv_shaping`` is the WHITE BOX record of the one-time source
    shaping (from ``apply_inverter_setpoint``) — trace-only, so the auditor can
    reproduce the source's Q from the source's own P.
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
        if zip_table or inv_table:
            v_mag_now = np.abs(v)
            p_spec_eff = p_spec.copy()
            q_spec_eff = q_spec.copy()
            if zip_table:
                for z_idx, z_c in zip_table.items():
                    p_spec_eff[z_idx] = p_spec[z_idx] * zip_factor(
                        z_c.a_p, z_c.b_p, z_c.c_p, v_mag_now[z_idx], z_c.v0_pu
                    )
                    q_spec_eff[z_idx] = q_spec[z_idx] * zip_factor(
                        z_c.a_q, z_c.b_q, z_c.c_q, v_mag_now[z_idx], z_c.v0_pu
                    )
                    if zip_const is not None:
                        # Defect D1: generation on a ZIP bus is constant power —
                        # it is added AFTER the load polynomial, never scaled by it.
                        p_spec_eff[z_idx] += zip_const[0][z_idx]
                        q_spec_eff[z_idx] += zip_const[1][z_idx]
            if inv_table:
                # ADR-011 §5b: Q(U) volt-var sources recompute Q from |V| each
                # iteration (P is frequency-, not voltage-dependent → unchanged).
                # Defect B: ADDED to the bus power, not assigned over it — the
                # source's own declared Q was already taken out of the base by
                # apply_inverter_setpoint, so what remains is the (ZIP-scaled)
                # load of a prosumer bus. Assigning deleted that load's reactive
                # demand. Source-only bus => base is exactly 0.0 => unchanged.
                for i_idx, i_c in inv_table.items():
                    q_spec_eff[i_idx] += qu_q(i_c, v_mag_now[i_idx])
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
                    trace_entry["zip_loads"] = _zip_loads_trace(
                        zip_table,
                        node_index_to_id,
                        p_spec,
                        q_spec,
                        p_spec_eff,
                        q_spec_eff,
                        zip_const,
                    )
                if inv_table or inv_shaping:
                    trace_entry["inverter_sources"] = _inverter_sources_trace(
                        inv_table, inv_shaping, node_index_to_id, v, p_spec_eff, q_spec_eff
                    )
            trace.append(trace_entry)
            break

        jacobian = build_jacobian_v2(ybus, v, non_slack_indices, active_pq, p_calc, q_calc)
        if zip_table:
            _apply_zip_jacobian_v2(
                jacobian, v, non_slack_indices, active_pq, p_spec, q_spec, zip_table
            )
        if inv_table:
            _apply_inverter_jacobian_v2(jacobian, v, non_slack_indices, active_pq, inv_table)
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
                trace_entry["zip_loads"] = _zip_loads_trace(
                    zip_table,
                    node_index_to_id,
                    p_spec,
                    q_spec,
                    p_spec_eff,
                    q_spec_eff,
                    zip_const,
                )
            if inv_table or inv_shaping:
                trace_entry["inverter_sources"] = _inverter_sources_trace(
                    inv_table, inv_shaping, node_index_to_id, v, p_spec_eff, q_spec_eff
                )

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

        # V12K-187: przekładnia i baza napięciowa TAK SAMO jak w Y-bus — inaczej
        # przepływy nie są spójne z rozwiązanymi napięciami (patrz
        # `_resolve_tap_ratio` i `_base_scale`).
        tap_ratio, _tap_source = _resolve_tap_ratio(graph, branch, tap_ratios or {})
        y_series, y_shunt = _branch_admittance_pu(
            branch, z_base * _base_scale(graph, branch.to_node_id, slack_voltage_kv)
        )
        if y_series is None:
            continue

        v_from = node_voltage[branch.from_node_id]
        v_to = node_voltage[branch.to_node_id]

        # SM-2 (V12K-180): same complex-tap model as the Y-bus so branch flows
        # stay power-balance-consistent with the solved (phase-shifted) voltages.
        theta_shift = 0.0
        if isinstance(branch, TransformerBranch):
            theta_shift = transformer_phase_shift_rad(branch.vector_group)

        if isinstance(branch, TransformerBranch) and (tap_ratio != 1.0 or theta_shift != 0.0):
            e_pos = np.exp(1j * theta_shift)
            e_neg = np.exp(-1j * theta_shift)
            i_from = (v_from / (tap_ratio**2)) * y_series - (v_to / tap_ratio) * e_neg * y_series
            i_to = -(v_from / tap_ratio) * e_pos * y_series + v_to * y_series
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


def _base_scale(graph: NetworkGraph, node_id: str, reference_kv: float) -> float:
    """Iloraz baz impedancyjnych: z_base(węzeł) / z_base(odniesienie) = (U/U_ref)².

    V12K-187. ``_build_ybus_ohm`` składa admitancje w SIEMENSACH, każdą liczoną
    NA WŁASNYM poziomie napięcia gałęzi, a ``build_ybus_pu`` mnożyła całą macierz
    przez JEDNO ``z_base`` z napięcia slacka. Dla sieci jednonapięciowej to
    poprawne; przy wielu poziomach napięcia gałęzie spoza poziomu slacka
    dostawały impedancję zaniżoną o (U_gałęzi/U_slack)². Skalujemy więc każdą
    gałąź jej WŁASNYM ilorazem baz, zanim macierz przejdzie przez wspólne
    ``z_base`` — dla sieci o jednym napięciu iloraz wynosi dokładnie 1.0, więc
    Y-bus pozostaje BIT-IDENTYCZNA (mnożenie przez 1.0 jest w IEEE-754 dokładne).

    Baza mocy skraca się w ilorazie, więc funkcja jej nie potrzebuje.
    """
    if reference_kv is None or reference_kv <= 0.0:
        return 1.0
    node = graph.nodes.get(node_id)
    if node is None or node.voltage_level <= 0.0:
        return 1.0
    return (node.voltage_level / reference_kv) ** 2


def _off_nominal_tap(graph: NetworkGraph, branch: TransformerBranch) -> float:
    """Przekładnia POZA-ZNAMIONOWA transformatora: rzeczywista / bazowa.

    V12K-187 (spójnie z V12K-186 w sieci zwarciowej): gdy napięcia znamionowe
    szyn nie są w stosunku równym przekładni z tabliczki, model wymaga idealnego
    transformatora o przekładni a = (U_hv_TR/U_szyny_HV)/(U_lv_TR/U_szyny_LV).
    Szyny zgodne z tabliczką ⇒ a = 1.0 dokładnie ⇒ zero zmian w macierzy.
    """
    hv = graph.nodes.get(branch.from_node_id)
    lv = graph.nodes.get(branch.to_node_id)
    if hv is None or lv is None or hv.voltage_level <= 0.0 or lv.voltage_level <= 0.0:
        return 1.0
    return (branch.voltage_hv_kv / hv.voltage_level) / (branch.voltage_lv_kv / lv.voltage_level)


def _resolve_tap_ratio(
    graph: NetworkGraph, branch: Branch, tap_ratios: dict[str, float]
) -> tuple[float, str | None]:
    """Efektywna przekładnia gałęzi w modelu per-unit + źródło zaczepu.

    JEDNO miejsce rozstrzygania przekładni dla całego rozpływu — Y-bus i tor
    przepływów gałęziowych muszą widzieć TĘ SAMĄ wartość, inaczej przepływy
    przestają być spójne z rozwiązanymi napięciami. Do V12K-187 Y-bus czytała
    zaczep z modelu (``tap_changer`` / ``tap_position``), a przepływy WYŁĄCZNIE
    z nakładki ``tap_ratios``, więc bilans rozjeżdżał się przy pracującym OLTC.

    Kolejność źródeł zaczepu (bez zmian): kanoniczny ``tap_changer`` (to jego
    pozycją steruje pętla regulacji OLTC) → ``tap_position`` → nakładka →
    ``get_tap_ratio()``. Na końcu dochodzi przekładnia POZA-ZNAMIONOWA szyn.
    """
    tap_ratio = 1.0
    tap_source: str | None = None
    if isinstance(branch, TransformerBranch):
        tc = branch.tap_changer
        if tc is not None and tc.is_active():
            # V12K-045: canonical tap changer drives the ratio (its position
            # is what the OLTC control loop mutates). get_tap_ratio() honours
            # the regulated winding.
            tap_ratio = branch.get_tap_ratio()
            if tap_ratio != 1.0:
                tap_source = "core"
        elif branch.tap_position != 0:
            tap_ratio = branch.get_tap_ratio()
            tap_source = "core"
        elif branch.id in tap_ratios:
            tap_ratio = tap_ratios[branch.id]
            tap_source = "overlay"
        else:
            tap_ratio = branch.get_tap_ratio()
            if tap_ratio != 1.0:
                tap_source = "core"
        # V12K-187: do zaczepu dochodzi przekładnia POZA-ZNAMIONOWA wynikająca
        # z różnicy między tabliczką a napięciami znamionowymi szyn (spójnie z
        # siecią zwarciową, V12K-186). Szyny zgodne z tabliczką ⇒ czynnik 1.0.
        tap_ratio = tap_ratio * _off_nominal_tap(graph, branch)
    elif branch.id in tap_ratios:
        tap_ratio = tap_ratios[branch.id]
        tap_source = "overlay"
    return tap_ratio, tap_source


def _build_ybus_ohm(
    graph: NetworkGraph,
    node_id_to_index: dict[str, int],
    tap_ratios: dict[str, float],
    reference_kv: float = 0.0,
) -> tuple[np.ndarray, list[dict[str, Any]], list[dict[str, Any]]]:
    size = len(node_id_to_index)
    y_bus = np.zeros((size, size), dtype=complex)
    applied_taps: list[dict[str, Any]] = []
    applied_phase_shifts: list[dict[str, Any]] = []

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
        y_switch = Y_CLOSED_SWITCH * _base_scale(graph, switch.to_node_id, reference_kv)
        y_bus[from_idx, to_idx] -= y_switch
        y_bus[to_idx, from_idx] -= y_switch
        y_bus[from_idx, from_idx] += y_switch
        y_bus[to_idx, to_idx] += y_switch

    for branch in graph.branches.values():
        if not branch.in_service:
            continue

        from_idx = node_id_to_index[branch.from_node_id]
        to_idx = node_id_to_index[branch.to_node_id]

        y_series, y_shunt = _get_branch_admittances_ohm(branch)
        # V12K-187: admitancja jest liczona na WŁASNYM poziomie napięcia gałęzi
        # (linia — napięcie szyn, transformator — strona LV, czyli węzeł `to`),
        # więc odnosimy ją do bazy tego węzła, zanim macierz przejdzie przez
        # wspólne z_base slacka. Sieć jednonapięciowa: iloraz = 1.0 (bez zmian).
        branch_scale = _base_scale(graph, branch.to_node_id, reference_kv)
        y_series = y_series * branch_scale
        y_shunt = y_shunt * branch_scale

        tap_ratio, tap_source = _resolve_tap_ratio(graph, branch, tap_ratios)

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

        # SM-2 (V12K-180): vector-group phase displacement θ (LV leads HV).
        # Consumed here — the phase-shifting-transformer complex-ratio model in
        # the LF Y-bus. θ = 0 (e.g. Yy0) reduces byte-for-byte to the previous
        # off-nominal-tap stamping. from = HV (tapped side), to = LV.
        theta_shift = 0.0
        if isinstance(branch, TransformerBranch):
            theta_shift = transformer_phase_shift_rad(branch.vector_group)

        if isinstance(branch, TransformerBranch) and (tap_ratio != 1.0 or theta_shift != 0.0):
            # Complex tap t = |t|·e^{-jθ} (MATPOWER convention; |t| = off-nominal
            # tap on the HV/from side). Phase-shifting-transformer stamping:
            #   Y_ff = y/|t|²          Y_ft = -y/|t|·e^{-jθ}
            #   Y_tf = -y/|t|·e^{+jθ}  Y_tt = y
            # gives, at no load, v_to = (1/|t|)·e^{+jθ}·v_from → the LV node
            # leads the HV node by θ (Dyn11 → +30°). The off-diagonal asymmetry
            # is physical for a phase shifter.
            e_pos = np.exp(1j * theta_shift)
            e_neg = np.exp(-1j * theta_shift)
            y_bus[from_idx, from_idx] += y_series / (tap_ratio**2)
            y_bus[from_idx, to_idx] += -y_series / tap_ratio * e_neg
            y_bus[to_idx, from_idx] += -y_series / tap_ratio * e_pos
            y_bus[to_idx, to_idx] += y_series
            if theta_shift != 0.0:
                clock = transformer_clock_number(branch.vector_group)
                t_complex = tap_ratio * e_neg
                applied_phase_shifts.append(
                    {
                        "branch_id": branch.id,
                        "vector_group": branch.vector_group,
                        "clock_number": clock,
                        "phase_shift_deg": float(np.rad2deg(theta_shift)),
                        "phase_shift_rad": float(theta_shift),
                        "tap_abs": float(tap_ratio),
                        "tap_complex_real": float(t_complex.real),
                        "tap_complex_imag": float(t_complex.imag),
                    }
                )
        else:
            y_bus[from_idx, to_idx] -= y_series
            y_bus[to_idx, from_idx] -= y_series

            y_bus[from_idx, from_idx] += y_series + y_shunt
            y_bus[to_idx, to_idx] += y_series + y_shunt

    return y_bus, applied_taps, applied_phase_shifts


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
