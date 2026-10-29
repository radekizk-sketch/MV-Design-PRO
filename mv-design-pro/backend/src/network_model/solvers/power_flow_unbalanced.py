"""
Three-Phase Unbalanced Backward/Forward Sweep Solver (BFS).

Standardowy algorytm dla radialnych nieobalansowanych sieci dystrybucyjnych
(IEEE 13/34-bus, CIGRE LV residential).

Reference:
- Shirmohammadi D., Hong H.W., Semlyen A., Luo G.X. (1988):
  "A compensation-based power flow method for weakly meshed
  distribution and transmission networks", IEEE Trans. PWRS 3(2), p.753.
- Kersting W.H. (2007): "Distribution System Modeling and Analysis", 2nd ed., Ch.10.

Algorytm BFS:
  1. Init: V_a = V_b = V_c = 1.0 ∠ 0°, ∠-120°, ∠+120° pu (balanced start)
  2. Backward sweep: od liści do slacka akumuluj prądy gałęzi I_branch = I_load_below
  3. Forward sweep: od slacka do liści aktualizuj V_node = V_parent - Z·I_branch
  4. Sprawdź zbieżność: max|ΔV| < tolerancja
  5. Powtórz do convergence lub max_iter

WHITE BOX trace zapisuje per iterację: vector mismatch, current snapshot, voltage snapshot.

Zwracane wartości:
- Per-phase complex voltage U_a/U_b/U_c (pu)
- Voltage Unbalance Factor (VUF) wg IEC 61000-4-30 = |V2| / |V1| × 100%
- Per-phase branch flows
- Total losses (S_loss = Σ_p ΔU_p·I_p* — pełna macierz Krona: Z_s na fazie, Z_m od faz
  pozostałych; dla Z_m = Z_N to straty faz i przewodu powrotnego N/PEN, Kersting rozdz. 4)
- Prąd przewodu powrotnego gałęzi I_N = I_a + I_b + I_c i potencjał przewodu N szyny
  względem punktu uziemienia (szyna bilansująca i ``neutral_earthed_bus_ids``):
  V_N,do = V_N,od + Z_m·(I_a + I_b + I_c). Wyprowadzenie: model czteroprzewodowy faza–N
  z redukcją Krona (Z_s = Z_f + Z_N, Z_m = Z_N) daje napięcia FAZA–N szyn (tak liczy BFS),
  a przewód N niesie prąd powrotny −ΣI_p, więc jego spadek względem punktu uziemienia to
  Z_N·ΣI_p (Kersting rozdz. 4, model linii czteroprzewodowej z przewodem neutralnym
  uziemionym w punkcie zasilania).
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass
from typing import Any

UNBALANCED_PF_SOLVER_VERSION = "load-flow-unbalanced-bfs-v1"

# Symmetrical components transformation matrix
# a = e^(j*2π/3)
A_OPERATOR = cmath.rect(1.0, 2.0 * math.pi / 3.0)
A_SQUARED = A_OPERATOR * A_OPERATOR
SQRT3 = math.sqrt(3.0)


@dataclass(frozen=True)
class PhasePower:
    """Complex per-phase power injection (load = negative, gen = positive)."""

    p_mw_a: float
    p_mw_b: float
    p_mw_c: float
    q_mvar_a: float
    q_mvar_b: float
    q_mvar_c: float


@dataclass(frozen=True)
class UnbalancedPowerFlowBusResult:
    bus_id: str
    voltage_pu_a: complex
    voltage_pu_b: complex
    voltage_pu_c: complex
    voltage_pu_magnitude_a: float
    voltage_pu_magnitude_b: float
    voltage_pu_magnitude_c: float
    angle_deg_a: float
    angle_deg_b: float
    angle_deg_c: float
    voltage_unbalance_factor_pct: float
    #: Potencjał przewodu N (powrotnego) szyny względem punktu uziemienia [p.u. napięcia
    #: fazowego bazy wyspy]; 0 w szynie bilansującej i w ``neutral_earthed_bus_ids``.
    neutral_voltage_pu: complex = 0j

    def to_dict(self) -> dict[str, object]:
        return {
            "bus_id": self.bus_id,
            "neutral_voltage_pu_magnitude": round(abs(self.neutral_voltage_pu), 6),
            "voltage_pu_magnitude_a": round(self.voltage_pu_magnitude_a, 6),
            "voltage_pu_magnitude_b": round(self.voltage_pu_magnitude_b, 6),
            "voltage_pu_magnitude_c": round(self.voltage_pu_magnitude_c, 6),
            "angle_deg_a": round(self.angle_deg_a, 4),
            "angle_deg_b": round(self.angle_deg_b, 4),
            "angle_deg_c": round(self.angle_deg_c, 4),
            "voltage_unbalance_factor_pct": round(self.voltage_unbalance_factor_pct, 4),
        }


@dataclass(frozen=True)
class UnbalancedPowerFlowBranchResult:
    branch_id: str
    from_bus_id: str
    to_bus_id: str
    p_mw_a: float
    p_mw_b: float
    p_mw_c: float
    q_mvar_a: float
    q_mvar_b: float
    q_mvar_c: float
    losses_p_mw: float
    losses_q_mvar: float
    #: Prąd przewodu powrotnego gałęzi I_N = I_a + I_b + I_c [p.u. prądu bazy wyspy]
    #: (3·I_0; 0 przy obciążeniu symetrycznym).
    neutral_current_pu: complex = 0j

    def to_dict(self) -> dict[str, object]:
        return {
            "branch_id": self.branch_id,
            "neutral_current_pu_magnitude": round(abs(self.neutral_current_pu), 6),
            "from_bus_id": self.from_bus_id,
            "to_bus_id": self.to_bus_id,
            "p_mw_a": round(self.p_mw_a, 6),
            "p_mw_b": round(self.p_mw_b, 6),
            "p_mw_c": round(self.p_mw_c, 6),
            "q_mvar_a": round(self.q_mvar_a, 6),
            "q_mvar_b": round(self.q_mvar_b, 6),
            "q_mvar_c": round(self.q_mvar_c, 6),
            "losses_p_mw": round(self.losses_p_mw, 6),
            "losses_q_mvar": round(self.losses_q_mvar, 6),
        }


@dataclass(frozen=True)
class UnbalancedPowerFlowResult:
    converged: bool
    iterations: int
    max_voltage_mismatch_pu: float
    bus_results: tuple[UnbalancedPowerFlowBusResult, ...]
    branch_results: tuple[UnbalancedPowerFlowBranchResult, ...]
    total_losses_p_mw: float
    total_losses_q_mvar: float
    white_box_trace: tuple[dict[str, Any], ...]
    solver_version: str = UNBALANCED_PF_SOLVER_VERSION
    tolerance: float = 1e-6
    max_iterations: int = 50

    def to_dict(self) -> dict[str, object]:
        return {
            "converged": self.converged,
            "iterations": self.iterations,
            "max_voltage_mismatch_pu": round(self.max_voltage_mismatch_pu, 9),
            "bus_results": [b.to_dict() for b in self.bus_results],
            "branch_results": [b.to_dict() for b in self.branch_results],
            "total_losses_p_mw": round(self.total_losses_p_mw, 6),
            "total_losses_q_mvar": round(self.total_losses_q_mvar, 6),
            "solver_version": self.solver_version,
            "tolerance": self.tolerance,
            "max_iterations": self.max_iterations,
            "trace_step_count": len(self.white_box_trace),
        }


@dataclass(frozen=True)
class UnbalancedNetworkInput:
    """Input dla BFS solvera - lekka struktura kompatybilna z ENM snapshotem.

    Dla każdego węzła: load per phase (default = symetryczny).
    Dla każdej gałęzi: R, X per phase (mutualne self) + opcjonalna macierz Z_3x3
    (gdy None - przyjmujemy diagonalną z self-Z bez mutual coupling).
    """

    base_mva: float
    base_kv: float
    slack_bus_id: str
    bus_ids: tuple[str, ...]
    branches: tuple[UnbalancedBranchSpec, ...]
    loads: tuple[UnbalancedLoadSpec, ...]
    slack_voltage_pu: float = 1.0  # |V_slack| (balanced angles)
    #: Szyny z uziemionym punktem neutralnym (gwiazda transformatora uziemiona po stronie tej
    #: szyny) — potencjał przewodu N := 0 (punkt odniesienia N–PE). Szyna bilansująca zawsze.
    neutral_earthed_bus_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class UnbalancedBranchSpec:
    branch_id: str
    from_bus_id: str
    to_bus_id: str
    r_self_ohm: float
    x_self_ohm: float
    r_mutual_ohm: float = 0.0  # mutual impedance między fazami (default 0 = no coupling)
    x_mutual_ohm: float = 0.0


@dataclass(frozen=True)
class UnbalancedLoadSpec:
    """Per-phase load (ZIP simplification: constant power S = P + jQ)."""

    bus_id: str
    p_mw_a: float = 0.0
    p_mw_b: float = 0.0
    p_mw_c: float = 0.0
    q_mvar_a: float = 0.0
    q_mvar_b: float = 0.0
    q_mvar_c: float = 0.0


def _balanced_initial_voltages() -> tuple[complex, complex, complex]:
    """Initial balanced 3-phase voltages: V_a = 1∠0°, V_b = 1∠-120°, V_c = 1∠+120°."""
    return (
        complex(1.0, 0.0),
        cmath.rect(1.0, -2.0 * math.pi / 3.0),
        cmath.rect(1.0, 2.0 * math.pi / 3.0),
    )


def _build_radial_topology(
    input_data: UnbalancedNetworkInput,
) -> tuple[dict[str, list[str]], dict[str, str | None], list[str]]:
    """Build adjacency + parent map + BFS traversal order from slack.

    Returns:
        - children: bus_id -> list of child bus_ids (downstream from slack)
        - parent: bus_id -> parent bus_id (or None for slack)
        - traversal_order: BFS order from slack to leaves (for forward sweep)
    """
    # Build undirected adjacency
    adj: dict[str, list[tuple[str, str]]] = {bus: [] for bus in input_data.bus_ids}
    for branch in input_data.branches:
        adj[branch.from_bus_id].append((branch.to_bus_id, branch.branch_id))
        adj[branch.to_bus_id].append((branch.from_bus_id, branch.branch_id))

    parent: dict[str, str | None] = dict.fromkeys(input_data.bus_ids)
    children: dict[str, list[str]] = {bus: [] for bus in input_data.bus_ids}
    traversal_order: list[str] = [input_data.slack_bus_id]
    visited: set[str] = {input_data.slack_bus_id}

    queue: list[str] = [input_data.slack_bus_id]
    while queue:
        current = queue.pop(0)
        for neighbor, _branch_id in adj[current]:
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = current
                children[current].append(neighbor)
                traversal_order.append(neighbor)
                queue.append(neighbor)

    # Disconnected components are unreachable from slack - flagged in return
    return children, parent, traversal_order


def _branch_lookup(
    branches: tuple[UnbalancedBranchSpec, ...],
) -> dict[tuple[str, str], UnbalancedBranchSpec]:
    """Build (from,to) → branch lookup, both directions for undirected lookup."""
    lookup: dict[tuple[str, str], UnbalancedBranchSpec] = {}
    for branch in branches:
        lookup[(branch.from_bus_id, branch.to_bus_id)] = branch
        lookup[(branch.to_bus_id, branch.from_bus_id)] = branch
    return lookup


def _load_by_bus(loads: tuple[UnbalancedLoadSpec, ...]) -> dict[str, UnbalancedLoadSpec]:
    """Build bus_id → load map; aggregate if multiple loads per bus."""
    result: dict[str, UnbalancedLoadSpec] = {}
    for load in loads:
        existing = result.get(load.bus_id)
        if existing is None:
            result[load.bus_id] = load
        else:
            result[load.bus_id] = UnbalancedLoadSpec(
                bus_id=load.bus_id,
                p_mw_a=existing.p_mw_a + load.p_mw_a,
                p_mw_b=existing.p_mw_b + load.p_mw_b,
                p_mw_c=existing.p_mw_c + load.p_mw_c,
                q_mvar_a=existing.q_mvar_a + load.q_mvar_a,
                q_mvar_b=existing.q_mvar_b + load.q_mvar_b,
                q_mvar_c=existing.q_mvar_c + load.q_mvar_c,
            )
    return result


def _compute_voltage_unbalance_factor_pct(v_a: complex, v_b: complex, v_c: complex) -> float:
    """VUF wg IEC 61000-4-30: |V_negative| / |V_positive| × 100%.

    Symmetrical components decomposition:
        V_1 (positive) = (V_a + a·V_b + a²·V_c) / 3
        V_2 (negative) = (V_a + a²·V_b + a·V_c) / 3
        V_0 (zero)     = (V_a + V_b + V_c) / 3
    """
    v_positive = (v_a + A_OPERATOR * v_b + A_SQUARED * v_c) / 3.0
    v_negative = (v_a + A_SQUARED * v_b + A_OPERATOR * v_c) / 3.0
    if abs(v_positive) < 1e-12:
        return 0.0
    return abs(v_negative) / abs(v_positive) * 100.0


def _ohm_to_pu(z_ohm: complex, base_mva: float, base_kv: float) -> complex:
    """Z[pu] = Z[Ohm] × (Sbase / Vbase²) — line-to-line voltage base."""
    z_base = (base_kv**2) / base_mva
    return z_ohm / z_base


def _power_to_current(s_mva: complex, v_pu: complex, base_mva: float) -> complex:
    """I_pu = (S/V)* in per-unit (S = P + jQ, |V| normalized)."""
    if abs(v_pu) < 1e-12:
        return 0.0 + 0.0j
    # I = (S/V)* where S = S_mva/base_mva for per-unit
    s_pu = s_mva / base_mva
    return (s_pu / v_pu).conjugate()


def solve_unbalanced_backward_forward_sweep(
    input_data: UnbalancedNetworkInput,
    *,
    tolerance: float = 1e-6,
    max_iterations: int = 50,
) -> UnbalancedPowerFlowResult:
    """Solve unbalanced PF using Backward/Forward Sweep.

    Args:
        input_data: Network topology + per-phase loads + impedances.
        tolerance: Convergence threshold for max voltage mismatch (pu).
        max_iterations: Iteration limit before declaring non-convergence.

    Returns:
        UnbalancedPowerFlowResult z per-bus voltages, per-branch flows,
        VUF, total losses, white-box trace.
    """
    children, parent, traversal_order = _build_radial_topology(input_data)
    branch_lookup = _branch_lookup(input_data.branches)
    load_by_bus = _load_by_bus(input_data.loads)

    # Init per-phase voltages: balanced 3-phase at all buses
    v_init_a, v_init_b, v_init_c = _balanced_initial_voltages()
    voltages_a: dict[str, complex] = dict.fromkeys(
        input_data.bus_ids, v_init_a * input_data.slack_voltage_pu
    )
    voltages_b: dict[str, complex] = dict.fromkeys(
        input_data.bus_ids, v_init_b * input_data.slack_voltage_pu
    )
    voltages_c: dict[str, complex] = dict.fromkeys(
        input_data.bus_ids, v_init_c * input_data.slack_voltage_pu
    )

    # Slack always fixed
    voltages_a[input_data.slack_bus_id] = v_init_a * input_data.slack_voltage_pu
    voltages_b[input_data.slack_bus_id] = v_init_b * input_data.slack_voltage_pu
    voltages_c[input_data.slack_bus_id] = v_init_c * input_data.slack_voltage_pu

    # Branch currents (initialized to zero, filled during backward sweep)
    branch_currents_a: dict[str, complex] = {b.branch_id: 0.0 + 0.0j for b in input_data.branches}
    branch_currents_b: dict[str, complex] = {b.branch_id: 0.0 + 0.0j for b in input_data.branches}
    branch_currents_c: dict[str, complex] = {b.branch_id: 0.0 + 0.0j for b in input_data.branches}

    trace: list[dict[str, Any]] = []
    converged = False
    iteration = 0
    max_mismatch = float("inf")

    for iteration in range(1, max_iterations + 1):
        v_prev_a = dict(voltages_a)
        v_prev_b = dict(voltages_b)
        v_prev_c = dict(voltages_c)

        # ===== Backward sweep =====
        # Process buses in reverse traversal order (leaves first)
        for bus in reversed(traversal_order):
            if bus == input_data.slack_bus_id:
                continue
            # Compute load current at this bus
            load = load_by_bus.get(bus)
            if load is not None:
                i_load_a = _power_to_current(
                    complex(load.p_mw_a, load.q_mvar_a),
                    voltages_a[bus],
                    input_data.base_mva,
                )
                i_load_b = _power_to_current(
                    complex(load.p_mw_b, load.q_mvar_b),
                    voltages_b[bus],
                    input_data.base_mva,
                )
                i_load_c = _power_to_current(
                    complex(load.p_mw_c, load.q_mvar_c),
                    voltages_c[bus],
                    input_data.base_mva,
                )
            else:
                i_load_a = 0.0 + 0.0j
                i_load_b = 0.0 + 0.0j
                i_load_c = 0.0 + 0.0j

            # Sum currents from children branches
            i_children_a = 0.0 + 0.0j
            i_children_b = 0.0 + 0.0j
            i_children_c = 0.0 + 0.0j
            for child in children[bus]:
                child_branch = branch_lookup[(bus, child)]
                i_children_a += branch_currents_a[child_branch.branch_id]
                i_children_b += branch_currents_b[child_branch.branch_id]
                i_children_c += branch_currents_c[child_branch.branch_id]

            # Branch current from parent to this bus = load + children
            parent_bus = parent[bus]
            if parent_bus is not None:
                branch = branch_lookup[(parent_bus, bus)]
                branch_currents_a[branch.branch_id] = i_load_a + i_children_a
                branch_currents_b[branch.branch_id] = i_load_b + i_children_b
                branch_currents_c[branch.branch_id] = i_load_c + i_children_c

        # ===== Forward sweep =====
        # Process buses in traversal order (slack first, then propagate)
        for bus in traversal_order:
            if bus == input_data.slack_bus_id:
                continue
            parent_bus = parent[bus]
            if parent_bus is None:
                continue
            branch = branch_lookup[(parent_bus, bus)]
            z_self = _ohm_to_pu(
                complex(branch.r_self_ohm, branch.x_self_ohm),
                input_data.base_mva,
                input_data.base_kv,
            )
            z_mutual = _ohm_to_pu(
                complex(branch.r_mutual_ohm, branch.x_mutual_ohm),
                input_data.base_mva,
                input_data.base_kv,
            )
            i_a = branch_currents_a[branch.branch_id]
            i_b = branch_currents_b[branch.branch_id]
            i_c = branch_currents_c[branch.branch_id]

            # V_to = V_from - Z·I
            # With diagonal Z (no mutual): V_to_p = V_from_p - Z_self·I_p
            # With mutual: V_to_p = V_from_p - Z_self·I_p - Z_mutual·(I_other + I_other2)
            voltages_a[bus] = voltages_a[parent_bus] - z_self * i_a - z_mutual * (i_b + i_c)
            voltages_b[bus] = voltages_b[parent_bus] - z_self * i_b - z_mutual * (i_a + i_c)
            voltages_c[bus] = voltages_c[parent_bus] - z_self * i_c - z_mutual * (i_a + i_b)

        # ===== Convergence check =====
        diffs: list[float] = []
        for bus in input_data.bus_ids:
            diffs.append(abs(voltages_a[bus] - v_prev_a[bus]))
            diffs.append(abs(voltages_b[bus] - v_prev_b[bus]))
            diffs.append(abs(voltages_c[bus] - v_prev_c[bus]))
        max_mismatch = max(diffs) if diffs else 0.0

        trace.append(
            {
                "iteration": iteration,
                "max_mismatch_pu": round(max_mismatch, 9),
                "phase": "backward+forward",
            }
        )

        if max_mismatch < tolerance:
            converged = True
            break

    # Potencjał przewodu N względem punktu uziemienia: od szyny bilansującej w kolejności
    # przeglądu, V_N,do = V_N,od + Z_m·(I_a + I_b + I_c); szyna z uziemionym punktem
    # neutralnym zeruje potencjał (punkt odniesienia N–PE poniżej transformatora).
    uziemione = frozenset(input_data.neutral_earthed_bus_ids)
    neutral_voltages: dict[str, complex] = dict.fromkeys(input_data.bus_ids, 0j)
    for bus in traversal_order:
        parent_bus = parent[bus]
        if bus == input_data.slack_bus_id or parent_bus is None or bus in uziemione:
            continue
        branch = branch_lookup[(parent_bus, bus)]
        z_mutual = _ohm_to_pu(
            complex(branch.r_mutual_ohm, branch.x_mutual_ohm),
            input_data.base_mva,
            input_data.base_kv,
        )
        neutral_voltages[bus] = neutral_voltages[parent_bus] + z_mutual * (
            branch_currents_a[branch.branch_id]
            + branch_currents_b[branch.branch_id]
            + branch_currents_c[branch.branch_id]
        )

    # Build results
    bus_results: list[UnbalancedPowerFlowBusResult] = []
    for bus in input_data.bus_ids:
        v_a = voltages_a[bus]
        v_b = voltages_b[bus]
        v_c = voltages_c[bus]
        bus_results.append(
            UnbalancedPowerFlowBusResult(
                bus_id=bus,
                voltage_pu_a=v_a,
                voltage_pu_b=v_b,
                voltage_pu_c=v_c,
                voltage_pu_magnitude_a=abs(v_a),
                voltage_pu_magnitude_b=abs(v_b),
                voltage_pu_magnitude_c=abs(v_c),
                angle_deg_a=math.degrees(cmath.phase(v_a)),
                angle_deg_b=math.degrees(cmath.phase(v_b)),
                angle_deg_c=math.degrees(cmath.phase(v_c)),
                voltage_unbalance_factor_pct=_compute_voltage_unbalance_factor_pct(v_a, v_b, v_c),
                neutral_voltage_pu=neutral_voltages[bus],
            )
        )

    # Branch flows (S = V × I*) per phase
    branch_results: list[UnbalancedPowerFlowBranchResult] = []
    total_losses_p = 0.0
    total_losses_q = 0.0
    for branch in input_data.branches:
        # Flow at "from" end
        v_from_a = voltages_a[branch.from_bus_id]
        v_from_b = voltages_b[branch.from_bus_id]
        v_from_c = voltages_c[branch.from_bus_id]
        i_a = branch_currents_a[branch.branch_id]
        i_b = branch_currents_b[branch.branch_id]
        i_c = branch_currents_c[branch.branch_id]
        s_from_a = v_from_a * i_a.conjugate() * input_data.base_mva
        s_from_b = v_from_b * i_b.conjugate() * input_data.base_mva
        s_from_c = v_from_c * i_c.conjugate() * input_data.base_mva
        # Straty = Σ_p ΔU_p·I_p* z pełną macierzą Krona (ΔU_p = Z_s·I_p + Z_m·ΣI_q≠p) — ten
        # sam spadek co przemiatanie w przód. Dawne |I_p|²·Z_s pomijało wyraz wzajemny:
        # przy obciążeniu symetrycznym zawyżało straty o 3·|I|²·Z_m (R_s/R_1 = 5/3 dla
        # Z0 = 3·Z1), a straty przewodu N są właśnie w wyrazie wzajemnym (Z_m = Z_N).
        z_self_pu = _ohm_to_pu(
            complex(branch.r_self_ohm, branch.x_self_ohm),
            input_data.base_mva,
            input_data.base_kv,
        )
        z_mutual_pu = _ohm_to_pu(
            complex(branch.r_mutual_ohm, branch.x_mutual_ohm),
            input_data.base_mva,
            input_data.base_kv,
        )
        loss_s_a = (z_self_pu * i_a + z_mutual_pu * (i_b + i_c)) * i_a.conjugate()
        loss_s_b = (z_self_pu * i_b + z_mutual_pu * (i_a + i_c)) * i_b.conjugate()
        loss_s_c = (z_self_pu * i_c + z_mutual_pu * (i_a + i_b)) * i_c.conjugate()
        loss_total = (loss_s_a + loss_s_b + loss_s_c) * input_data.base_mva

        branch_results.append(
            UnbalancedPowerFlowBranchResult(
                branch_id=branch.branch_id,
                from_bus_id=branch.from_bus_id,
                to_bus_id=branch.to_bus_id,
                p_mw_a=s_from_a.real,
                p_mw_b=s_from_b.real,
                p_mw_c=s_from_c.real,
                q_mvar_a=s_from_a.imag,
                q_mvar_b=s_from_b.imag,
                q_mvar_c=s_from_c.imag,
                # loss_total = I^H·Z·I (zespolone): Re = straty czynne w R faz i przewodu
                # powrotnego, Im = moc bierna pochłaniana w X.
                losses_p_mw=loss_total.real,
                losses_q_mvar=loss_total.imag,
                neutral_current_pu=i_a + i_b + i_c,
            )
        )
        total_losses_p += branch_results[-1].losses_p_mw
        total_losses_q += branch_results[-1].losses_q_mvar

    return UnbalancedPowerFlowResult(
        converged=converged,
        iterations=iteration,
        max_voltage_mismatch_pu=max_mismatch,
        bus_results=tuple(bus_results),
        branch_results=tuple(branch_results),
        total_losses_p_mw=total_losses_p,
        total_losses_q_mvar=total_losses_q,
        white_box_trace=tuple(trace),
        tolerance=tolerance,
        max_iterations=max_iterations,
    )
