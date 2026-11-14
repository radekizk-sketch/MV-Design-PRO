"""Gauss-Seidel Power Flow Solver.

This module implements an alternative power flow solver using the Gauss-Seidel
iterative method. It provides the same interface and WHITE BOX trace support
as the Newton-Raphson solver.

Zgodność z AGENTS.md:
- Jest SOLVEREM (warstwa SOLVER)
- Implementuje WHITE BOX trace
- Zwraca tę samą strukturę co Newton-Raphson

Algorithm:
1. Initialization: V = 1.0, δ = 0 (flat start)
2. For each PQ node:
   V_i^{new} = (1/Y_ii) * ((P_i - jQ_i)/V_i* - Σ(Y_ij * V_j))
3. For each PV node:
   Q_i = imag(V_i* * Σ(Y_ij * V_j))
   |V_i| = setpoint, δ_i = arg(V_i^{new})
4. Check convergence
5. If not converged → go to 2
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_inverter import InverterControl, inverter_relax_q
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    PowerFlowNewtonSolver,
)
from network_model.solvers.power_flow_newton_internal import (
    build_slack_island,
    compute_power_injections,
    przygotuj_rozplyw_wyspy,
    validate_input,
    wyniki_rozplywu_wyspy,
)
from network_model.solvers.power_flow_scalenie import ScalenieWyspy, zadanie_wezla
from network_model.solvers.power_flow_types import PowerFlowInput, PowerFlowOptions
from network_model.solvers.power_flow_zip import ZipCoeffs, zip_effective_spec


@dataclass
class GaussSeidelOptions(PowerFlowOptions):
    """Options for Gauss-Seidel power flow solver.

    Extends PowerFlowOptions with Gauss-Seidel specific parameters.

    Attributes:
        acceleration_factor: Successive over-relaxation (SOR) factor.
            - 1.0: Standard Gauss-Seidel (default)
            - 1.0 < α < 2.0: Over-relaxation (faster convergence for some cases)
            - 0.5 < α < 1.0: Under-relaxation (more stable but slower)
            Typical optimal value is around 1.4-1.8 for well-conditioned systems.
            Valid range: [0.5, 2.0]
        allow_fallback: If True and GS doesn't converge, automatically fall back
            to Newton-Raphson solver. Default is False.
    """

    acceleration_factor: float = 1.0
    allow_fallback: bool = False

    def __post_init__(self) -> None:
        """Validate acceleration_factor range."""
        if not (0.5 <= self.acceleration_factor <= 2.0):
            raise ValueError(
                f"Współczynnik przyspieszenia musi być w zakresie "
                f"[0.5, 2.0], otrzymano: {self.acceleration_factor}. "
                f"Wartość 1.0 oznacza standardową metodę Gaussa-Seidla, "
                f"wartości > 1.0 przyspieszają zbieżność (nadrelaksacja), "
                f"wartości < 1.0 zwiększają stabilność (podrelaksacja)."
            )


@dataclass
class GaussSeidelInput:
    """Input specification for Gauss-Seidel solver.

    Wraps PowerFlowInput with Gauss-Seidel specific options.
    """

    pf_input: PowerFlowInput
    options: GaussSeidelOptions = field(default_factory=GaussSeidelOptions)


class PowerFlowGaussSeidelSolver:
    """Gauss-Seidel Power Flow Solver.

    Implements the Gauss-Seidel iterative method for power flow analysis.
    Provides the same interface and WHITE BOX trace as Newton-Raphson solver.

    The Gauss-Seidel method is simpler than Newton-Raphson but may converge
    slower for large or ill-conditioned networks. It is useful for:
    - Initial solution estimates
    - Networks where Newton-Raphson has convergence issues
    - Educational/verification purposes

    WHITE BOX Compliance:
    - All iterations are traced
    - Per-bus mismatch recorded
    - Voltage updates exposed
    - Full state saved after each iteration
    """

    def solve(
        self,
        pf_input: PowerFlowInput,
        gs_options: GaussSeidelOptions | None = None,
    ) -> PowerFlowNewtonSolution:
        """Execute Gauss-Seidel power flow calculation.

        Args:
            pf_input: Standard power flow input specification.
            gs_options: Optional Gauss-Seidel specific options.
                       If not provided, uses defaults from pf_input.options
                       with acceleration_factor=1.0.

        Returns:
            PowerFlowNewtonSolution: Same format as Newton-Raphson solver.

        Raises:
            ValueError: If input validation fails.
        """
        graph: NetworkGraph = pf_input.typed_graph()
        options = pf_input.options

        # Merge options
        if gs_options is not None:
            accel = gs_options.acceleration_factor
            allow_fallback = gs_options.allow_fallback
            full_trace = gs_options.trace_level == "full" or options.trace_level == "full"
        else:
            accel = 1.0
            allow_fallback = False
            full_trace = options.trace_level == "full"

        validation_warnings: list[str] = []
        validation_errors: list[str] = []

        if options.validate:
            validation_warnings, validation_errors = validate_input(pf_input)
            if validation_errors:
                raise ValueError("; ".join(validation_errors))

        # Build slack island
        slack_island_nodes, not_solved_nodes = build_slack_island(graph, pf_input.slack.node_id)

        if not slack_island_nodes:
            raise ValueError(
                "Węzła bilansującego nie ma w sieci obliczeniowej — nie można wyznaczyć wyspy "
                "zasilanej z sieci zasilającej."
            )

        # Węzły elektryczne (zamknięte łączniki scalone), zadania mocy i punkt startowy —
        # jedno przygotowanie dla NR/GS/FD (`przygotuj_rozplyw_wyspy`).
        z = przygotuj_rozplyw_wyspy(pf_input, graph, slack_island_nodes, full_trace)

        # Run Gauss-Seidel iteration
        (
            v,
            converged,
            iterations,
            max_mismatch,
            gs_trace,
            pv_to_pq_switches,
        ) = self._gauss_seidel_solve(
            z.ybus_pu,
            z.slack_index,
            z.pq_indices,
            z.pv_indices,
            z.p_spec,
            z.q_spec,
            z.pv_setpoints,
            z.pv_q_limits,
            z.v0,
            options.tolerance,
            options.max_iter,
            accel,
            full_trace,
            z.node_index_to_id,
            pf_input.base_mva,
            z.zip_table,
            z.inv_table,
            z.zip_const,
            z.q_inv_seed,
            scalenie=z.scalenie,
            pv_pelne=z.pv_pelne,
        )

        # Handle non-convergence with optional fallback to Newton-Raphson
        fallback_info: dict[str, str] | None = None
        if not converged:
            if allow_fallback:
                # Fallback to Newton-Raphson solver with proper settings
                # Create a new input with default NR-friendly options

                fallback_options = PowerFlowOptions(
                    tolerance=pf_input.options.tolerance,
                    max_iter=30,  # Use reasonable max_iter for NR
                    damping=pf_input.options.damping,
                    flat_start=pf_input.options.flat_start,
                    validate=False,  # Already validated
                    trace_level=pf_input.options.trace_level,
                )
                fallback_input = PowerFlowInput(
                    graph=pf_input.graph,
                    base_mva=pf_input.base_mva,
                    slack=pf_input.slack,
                    pq=pf_input.pq,
                    pv=pf_input.pv,
                    shunts=pf_input.shunts,
                    taps=pf_input.taps,
                    bus_limits=pf_input.bus_limits,
                    branch_limits=pf_input.branch_limits,
                    options=fallback_options,
                )
                nr_result = PowerFlowNewtonSolver().solve(fallback_input)
                # Return NR result with fallback info
                return PowerFlowNewtonSolution(
                    converged=nr_result.converged,
                    iterations=nr_result.iterations,
                    max_mismatch=nr_result.max_mismatch,
                    node_voltage=nr_result.node_voltage,
                    node_u_mag=nr_result.node_u_mag,
                    node_angle=nr_result.node_angle,
                    node_voltage_kv=nr_result.node_voltage_kv,
                    branch_current=nr_result.branch_current,
                    branch_s_from=nr_result.branch_s_from,
                    branch_s_to=nr_result.branch_s_to,
                    branch_current_ka=nr_result.branch_current_ka,
                    branch_s_from_mva=nr_result.branch_s_from_mva,
                    branch_s_to_mva=nr_result.branch_s_to_mva,
                    losses_total=nr_result.losses_total,
                    slack_power=nr_result.slack_power,
                    sum_pq_spec=nr_result.sum_pq_spec,
                    branch_flow_note=nr_result.branch_flow_note,
                    missing_voltage_base_nodes=nr_result.missing_voltage_base_nodes,
                    validation_warnings=nr_result.validation_warnings,
                    validation_errors=nr_result.validation_errors,
                    slack_island_nodes=nr_result.slack_island_nodes,
                    not_solved_nodes=nr_result.not_solved_nodes,
                    ybus_trace=nr_result.ybus_trace,
                    nr_trace=nr_result.nr_trace,
                    applied_taps=nr_result.applied_taps,
                    applied_shunts=nr_result.applied_shunts,
                    pv_to_pq_switches=nr_result.pv_to_pq_switches,
                    init_state=nr_result.init_state,
                    node_p_spec_effective_pu=nr_result.node_p_spec_effective_pu,
                    node_q_spec_effective_pu=nr_result.node_q_spec_effective_pu,
                    solver_method="newton-raphson",
                    fallback_info={
                        "fallback_used": "newton-raphson",
                        "cause": "non_convergence",
                        "gs_iterations": str(options.max_iter),
                        "gs_max_mismatch": str(max_mismatch),
                    },
                )

            # No fallback - mark as failed
            iterations = int(options.max_iter)
            if gs_trace:
                if "cause_if_failed_optional" not in gs_trace[-1]:
                    gs_trace[-1]["cause_if_failed_optional"] = "max_iter"
            else:
                gs_trace.append(
                    {
                        "iter": iterations,
                        "max_mismatch_pu": max_mismatch,
                        "mismatch_norm": 0.0,
                        "step_norm": 0.0,
                        "damping_used": float(accel),
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
            nr_trace=gs_trace,  # Same trace format, "nr" for compatibility
            applied_taps=z.applied_taps,
            applied_shunts=z.applied_shunts,
            pv_to_pq_switches=pv_to_pq_switches,
            init_state=z.init_state,
            solver_method="gauss-seidel",
            fallback_info=fallback_info,
            **wyniki,
        )

    def _gauss_seidel_solve(
        self,
        ybus: np.ndarray,
        slack_index: int,
        pq_indices: list[int],
        pv_indices: list[int],
        p_spec: np.ndarray,
        q_spec: np.ndarray,
        pv_setpoints: dict[int, float],
        pv_q_limits: dict[int, tuple[float, float]],
        v0: np.ndarray,
        tolerance: float,
        max_iter: int,
        acceleration_factor: float,
        full_trace: bool,
        node_index_to_id: dict[int, str],
        base_mva: float,
        zip_table: dict[int, ZipCoeffs] | None = None,
        inv_table: dict[int, InverterControl] | None = None,
        zip_const: tuple[np.ndarray, np.ndarray] | None = None,
        q_inv_seed: dict[int, float] | None = None,
        *,
        scalenie: ScalenieWyspy,
        pv_pelne: frozenset[int],
    ) -> tuple[
        np.ndarray,
        bool,
        int,
        float,
        list[dict[str, Any]],
        list[dict[str, Any]],
    ]:
        """Core Gauss-Seidel iteration with WHITE BOX trace.

        Args:
            ybus: Admittance matrix (n x n complex).
            slack_index: Index of slack bus.
            pq_indices: Indices of PQ buses.
            pv_indices: Indices of PV buses.
            p_spec: Specified active power per bus (p.u.).
            q_spec: Specified reactive power per bus (p.u.).
            pv_setpoints: PV bus voltage magnitude setpoints {idx: u_pu}.
            pv_q_limits: PV bus reactive power limits {idx: (q_min, q_max)}.
            v0: Initial voltage vector.
            tolerance: Convergence tolerance.
            max_iter: Maximum iterations.
            acceleration_factor: SOR acceleration factor.
            full_trace: Whether to record full trace.
            node_index_to_id: Map from index to node ID.
            base_mva: Base power in MVA.
            zip_table: Voltage-dependent ZIP coefficients keyed by bus index
                (ADR-011). Empty/None => classic constant-power path (reduce-to-NR).
            inv_table: Voltage-dependent inverter Q(U) controls keyed by bus index
                (ADR-011 §5b). Empty/None => classic path. A bus MAY be in both
                zip_table and inv_table (a prosumer bus): the two contributions
                COMPOSE — see the exclusivity contract on PQSpec.inverter_control
                (defect B). Picking one branch silently is forbidden.
            zip_const: Constant (non-ZIP) part of a ZIP bus — generation on the
                same bus (defect D1). None => nothing to split; p_spec/q_spec are
                the whole bus power (historical path).
            q_inv_seed: Start value of the Q(U) relaxation state per bus — the
                SOURCE's own declared Q (defect B), from ``inverter_q_seed``.
            scalenie: Węzły elektryczne wyspy (zamknięte łączniki scalone). ``ybus``,
                ``v0``, indeksy typów i nastawy PV — na indeksie węzła elektrycznego;
                ``p_spec``, ``q_spec``, ``zip_table``, ``inv_table``, ``zip_const``,
                ``q_inv_seed`` — na indeksie węzła wyspy (zadanie węzła elektrycznego =
                suma zadań jego węzłów, `zadanie_wezla`). Wyspa bez łącznika — dawna
                ścieżka bit w bit.
            pv_pelne: Indeksy węzłów wyspy ze źródłem PV (granica Q dotyczy mocy źródeł;
                zadanie Q po przełączeniu PV→PQ trafia do pierwszego źródła PV grupy).

        Returns:
            Tuple of (voltage, converged, iterations, max_mismatch, trace, pv_switches).
        """
        zip_table = zip_table or {}
        inv_table = inv_table or {}
        v = v0.copy()
        trace: list[dict[str, Any]] = []
        pv_to_pq_switches: list[dict[str, Any]] = []
        converged = False
        max_mismatch = 0.0
        n = len(v)

        # Active bus sets (can change if PV switches to PQ)
        active_pq = list(pq_indices)
        active_pv = list(pv_indices)

        # ADR-011 §5b: under-relaxed Q(U) state. Seeded from the SOURCE's own
        # declared Q (defect B — the bus power is not the source's on a prosumer
        # bus); advanced toward qu_q(|V|) at the start of each iteration with a
        # slope-scaled step so the volt-var fixed-point gain stays < 1 (GS lacks NR's
        # ∂Q/∂V Jacobian feedback). Converged value == qu_q(v*) => parity with NR and
        # reduce-to-NR preserved (empty inv_table => no-op).
        q_inv_state = dict(q_inv_seed or {})
        scalona = not scalenie.trywialne
        sc = scalenie
        id_pelny = dict(enumerate(sc.wezly)) if scalona else node_index_to_id

        for iteration in range(1, max_iter + 1):
            v_old = v.copy()
            switched_this_iter: list[str] = []

            # Advance the under-relaxed Q(U) state using the current voltages.
            inverter_relax_q(q_inv_state, sc.rozwin(v), inv_table)

            # --- PV bus Q-limit check and switching ---
            for idx in list(active_pv):
                if idx not in pv_q_limits:
                    continue

                # Calculate Q injection for this PV bus (injection convention)
                # S = V * conj(I) where I = Y*V
                i_inj = sum(ybus[idx, k] * v[k] for k in range(n))
                s_calc = v[idx] * np.conj(i_inj)
                q_calc = s_calc.imag  # Q injection (positive = generating reactive power)
                if scalona:
                    # Granica dotyczy mocy ŹRÓDEŁ PV: moc węzła elektrycznego minus
                    # zadania pozostałych węzłów grupy (odbiory, źródła PQ).
                    q_calc = (
                        q_calc
                        - zadanie_wezla(
                            sc,
                            idx,
                            abs(v[idx]),
                            p_spec,
                            q_spec,
                            zip_table,
                            zip_const,
                            inv_table,
                            q_inv_state,
                            pomin=pv_pelne,
                        )[1]
                    )

                q_min_pu, q_max_pu = pv_q_limits[idx]
                if q_calc < q_min_pu or q_calc > q_max_pu:
                    limit_pu = q_min_pu if q_calc < q_min_pu else q_max_pu
                    nosnik = sc.nosnik(idx, pv_pelne) if scalona else idx
                    q_spec[nosnik] = limit_pu  # Set Q injection to limit value
                    active_pv.remove(idx)
                    active_pq.append(idx)
                    active_pq.sort()
                    node_id = id_pelny[nosnik]
                    pv_to_pq_switches.append(
                        {
                            "iter": iteration,
                            "node_id": node_id,
                            "q_calc_mvar": float(q_calc * base_mva),
                            "limit_mvar": float(limit_pu * base_mva),
                            "direction": "under" if q_calc < q_min_pu else "over",
                        }
                    )
                    switched_this_iter.append(node_id)

            # --- Gauss-Seidel iteration for PQ buses ---
            for idx in active_pq:
                if idx == slack_index:
                    continue

                # Sum of Y_ij * V_j for j != i
                sum_yv = sum(ybus[idx, k] * v[k] for k in range(n) if k != idx)

                # Specified power injection (already in generation convention:
                # p_spec is negative for loads, positive for generation).
                # ADR-011 ZIP: at a voltage-dependent bus, recompute the specified
                # injection from the current |V| (fixed-point recompute, no Jacobian).
                # ADR-011 §5b: at a Q(U) inverter bus, recompute only the Q part from
                # |V| (inverter P is frequency-, not voltage-dependent).
                # Defect B: the two mechanisms COMPOSE. This used to be an if/elif
                # chain, so a prosumer bus (ZIP load + volt-var source) took the ZIP
                # branch and the volt-var control was silently dropped — GS then
                # disagreed with NR/FD, which instead overwrote the load's Q.
                # Defect D1: generation on a ZIP bus is constant power — added AFTER
                # the load polynomial, never scaled by it (`zadanie_wezla`). A merged
                # electrical node sums the specs of its nodes, each by its own formula.
                p_i, q_i = zadanie_wezla(
                    sc,
                    idx,
                    abs(v[idx]),
                    p_spec,
                    q_spec,
                    zip_table,
                    zip_const,
                    inv_table,
                    q_inv_state,
                )
                s_i = complex(p_i, q_i)

                # Gauss-Seidel update for PQ bus
                # V_i^{new} = (1/Y_ii) * (S_i^*/V_i^* - Σ Y_ij V_j)
                if abs(ybus[idx, idx]) > 1e-12:
                    v_new = (1.0 / ybus[idx, idx]) * (np.conj(s_i) / np.conj(v[idx]) - sum_yv)

                    # Apply acceleration (SOR)
                    if acceleration_factor != 1.0:
                        v[idx] = v_old[idx] + acceleration_factor * (v_new - v_old[idx])
                    else:
                        v[idx] = v_new

            # --- Gauss-Seidel iteration for PV buses ---
            for idx in active_pv:
                if idx == slack_index:
                    continue

                # Sum of Y_ij * V_j for j != i
                sum_yv = sum(ybus[idx, k] * v[k] for k in range(n) if k != idx)

                # Calculate Q from power balance (injection convention)
                # S_i = V_i * conj(I_i) => Q_i = imag(S_i)
                i_inj = ybus[idx, idx] * v[idx] + sum_yv
                s_calc = v[idx] * np.conj(i_inj)
                q_i = s_calc.imag  # Calculated Q injection

                if scalona:
                    # Węzeł elektryczny z odbiorami: P = zadania wszystkich węzłów grupy,
                    # granica Q obejmuje tylko moc źródeł PV (Q węzła minus pozostałe).
                    p_grupy, _q = zadanie_wezla(
                        sc,
                        idx,
                        abs(v[idx]),
                        p_spec,
                        q_spec,
                        zip_table,
                        zip_const,
                        inv_table,
                        q_inv_state,
                    )
                    _p, q_inne = zadanie_wezla(
                        sc,
                        idx,
                        abs(v[idx]),
                        p_spec,
                        q_spec,
                        zip_table,
                        zip_const,
                        inv_table,
                        q_inv_state,
                        pomin=pv_pelne,
                    )
                    if idx in pv_q_limits:
                        q_min_pu, q_max_pu = pv_q_limits[idx]
                        q_i = np.clip(q_i - q_inne, q_min_pu, q_max_pu) + q_inne
                    s_i = complex(p_grupy, q_i)
                else:
                    # Apply Q limits if defined
                    if idx in pv_q_limits:
                        q_min_pu, q_max_pu = pv_q_limits[idx]
                        q_i = np.clip(q_i, q_min_pu, q_max_pu)

                    # Specified P for PV bus (already in injection convention)
                    s_i = complex(p_spec[idx], q_i)

                # Gauss-Seidel update (but preserve |V|)
                if abs(ybus[idx, idx]) > 1e-12:
                    v_new = (1.0 / ybus[idx, idx]) * (np.conj(s_i) / np.conj(v[idx]) - sum_yv)

                    # Keep voltage magnitude, update angle only
                    v_mag_setpoint = pv_setpoints.get(idx, np.abs(v[idx]))
                    v_angle_new = np.angle(v_new)

                    # Apply acceleration to angle
                    if acceleration_factor != 1.0:
                        v_angle_old = np.angle(v_old[idx])
                        v_angle = v_angle_old + acceleration_factor * (v_angle_new - v_angle_old)
                    else:
                        v_angle = v_angle_new

                    v[idx] = v_mag_setpoint * np.exp(1j * v_angle)

            # --- Calculate mismatch ---
            p_calc, q_calc = compute_power_injections(ybus, v)

            # Mismatch for all non-slack buses
            non_slack_indices = sorted(
                [i for i in range(n) if i != slack_index and (i in active_pq or i in active_pv)]
            )

            # ADR-011 ZIP: evaluate the specified injection at the current |V|
            # for the mismatch (no-op when zip_table is empty => reduce-to-NR).
            # ADR-011 §5b: the Q mismatch at Q(U) buses uses the under-relaxed Q(U)
            # state (same value the sweep used this iteration), so the convergence
            # test and the update are consistent. No-op when inv_table is empty.
            # Defect B: ADDED to the composed bus power, exactly as the sweep does
            # above — assigning here would make the convergence test disagree with
            # the update on a prosumer bus (and never converge).
            p_eff, q_eff = zip_effective_spec(p_spec, q_spec, sc.rozwin(v), zip_table, zip_const)
            if inv_table:
                q_eff = q_eff.copy()
                for idx in inv_table:
                    q_eff[idx] += q_inv_state[idx]
            p_eff = sc.zredukuj(p_eff)
            q_eff = sc.zredukuj(q_eff)
            d_p = p_eff[non_slack_indices] - p_calc[non_slack_indices]
            d_q = q_eff[active_pq] - q_calc[active_pq]

            mismatch = np.concatenate([d_p, d_q]) if len(d_p) > 0 or len(d_q) > 0 else np.array([])
            max_mismatch = float(np.max(np.abs(mismatch))) if mismatch.size else 0.0
            mismatch_norm = float(np.linalg.norm(mismatch)) if mismatch.size else 0.0

            # Calculate step norm (voltage change)
            step_norm = float(np.linalg.norm(v - v_old))

            # --- Build trace entry ---
            mismatch_per_bus: dict[str, dict[str, float]] | None = None
            if full_trace:
                mismatch_per_bus = {}
                for i, idx in enumerate(non_slack_indices):
                    node_id = node_index_to_id.get(idx, str(idx))
                    mismatch_per_bus[node_id] = {"delta_p_pu": float(d_p[i])}
                for i, idx in enumerate(active_pq):
                    node_id = node_index_to_id.get(idx, str(idx))
                    if node_id in mismatch_per_bus:
                        mismatch_per_bus[node_id]["delta_q_pu"] = float(d_q[i])
                    else:
                        mismatch_per_bus[node_id] = {"delta_p_pu": 0.0, "delta_q_pu": float(d_q[i])}

            # Check for numerical issues
            if mismatch.size and (not np.isfinite(max_mismatch) or not np.isfinite(mismatch_norm)):
                trace_entry: dict[str, Any] = {
                    "iter": iteration,
                    "max_mismatch_pu": max_mismatch,
                    "mismatch_norm": mismatch_norm,
                    "step_norm": step_norm,
                    "damping_used": float(acceleration_factor),
                    "pv_to_pq_optional": switched_this_iter,
                    "cause_if_failed_optional": "numerical_issue",
                }
                if full_trace and mismatch_per_bus:
                    trace_entry["mismatch_per_bus"] = mismatch_per_bus
                trace.append(trace_entry)
                break

            # Check convergence
            if max_mismatch < tolerance:
                converged = True
                trace_entry = {
                    "iter": iteration,
                    "max_mismatch_pu": max_mismatch,
                    "mismatch_norm": mismatch_norm,
                    "step_norm": step_norm,
                    "damping_used": float(acceleration_factor),
                    "pv_to_pq_optional": switched_this_iter,
                }
                if full_trace:
                    if mismatch_per_bus:
                        trace_entry["mismatch_per_bus"] = mismatch_per_bus
                    trace_entry["state_next"] = self._build_state_dict(v, node_index_to_id)
                trace.append(trace_entry)
                break

            # Build trace entry for this iteration
            trace_entry = {
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": step_norm,
                "damping_used": float(acceleration_factor),
                "pv_to_pq_optional": switched_this_iter,
            }

            if full_trace:
                if mismatch_per_bus:
                    trace_entry["mismatch_per_bus"] = mismatch_per_bus
                trace_entry["state_next"] = self._build_state_dict(v, node_index_to_id)
                # Gauss-Seidel doesn't have Jacobian, but we record voltage delta
                delta_state = {}
                for idx in range(n):
                    node_id = node_index_to_id.get(idx, str(idx))
                    delta_state[node_id] = {
                        "delta_theta_rad": float(np.angle(v[idx]) - np.angle(v_old[idx])),
                        "delta_v_pu": float(np.abs(v[idx]) - np.abs(v_old[idx])),
                    }
                trace_entry["delta_state"] = delta_state

            trace.append(trace_entry)

        return v, converged, iteration, max_mismatch, trace, pv_to_pq_switches

    def _build_state_dict(
        self,
        v: np.ndarray,
        node_index_to_id: dict[int, str],
    ) -> dict[str, dict[str, float]]:
        """Build deterministic state dict from voltage vector."""
        state = {}
        for idx in sorted(node_index_to_id.keys()):
            if idx < len(v):
                node_id = node_index_to_id[idx]
                state[node_id] = {
                    "v_pu": float(np.abs(v[idx])),
                    "theta_rad": float(np.angle(v[idx])),
                }
        return state


def solve_power_flow_gauss_seidel(
    pf_input: PowerFlowInput,
    gs_options: GaussSeidelOptions | None = None,
) -> PowerFlowNewtonSolution:
    """Convenience function to solve power flow using Gauss-Seidel method.

    Args:
        pf_input: Power flow input specification.
        gs_options: Optional Gauss-Seidel specific options.

    Returns:
        PowerFlowNewtonSolution: Same format as Newton-Raphson solver.
    """
    return PowerFlowGaussSeidelSolver().solve(pf_input, gs_options)
