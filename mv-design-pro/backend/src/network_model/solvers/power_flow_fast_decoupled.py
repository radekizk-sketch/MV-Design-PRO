"""Fast-Decoupled Load Flow (FDLF) Solver.

This module implements the Fast-Decoupled power flow algorithm, which is based on
the physical decoupling between P-θ and Q-V relationships in power systems.

Zgodność z AGENTS.md:
- Jest SOLVEREM (warstwa SOLVER)
- Implementuje WHITE BOX trace
- Zwraca tę samą strukturę co Newton-Raphson

Algorithm (Classic FDLF):
1. Build B' and B" matrices from imaginary part of Ybus
2. Factor matrices once (LU decomposition)
3. Iterative solution:
   a. P-θ half-iteration: B' · Δθ = ΔP / |V|
   b. Q-V half-iteration: B" · Δ|V| = ΔQ / |V|
4. Check convergence

Variants:
- XB: B' uses susceptances ignoring shunts (reactance-based)
      B" uses full susceptance
- BX: B' uses full susceptance
      B" uses susceptances ignoring shunts

Assumptions (classic FDLF):
- Conductances G are neglected (X >> R)
- cos(θ_ij) ≈ 1
- sin(θ_ij) ≈ θ_ij
- |V_i| ≈ 1.0 p.u.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
from network_model.core.graph import NetworkGraph
from network_model.solvers.power_flow_inverter import InverterControl, inverter_relax_q
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolution
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
from scipy import linalg


@dataclass
class FastDecoupledOptions(PowerFlowOptions):
    """Options for Fast-Decoupled power flow solver.

    Extends PowerFlowOptions with FDLF-specific parameters.

    Attributes:
        method: FDLF variant to use.
            - "XB": B' ignores shunts (default, recommended for transmission)
            - "BX": B" ignores shunts (alternative variant)
        rebuild_matrices_every: Rebuild B'/B" matrices every N iterations.
            - 0: Never rebuild (default, standard FDLF)
            - N > 0: Rebuild every N iterations (for ill-conditioned systems)
        angle_damping: Damping factor for angle updates (0 < factor <= 1.0).
            Default 1.0 means no damping.
        voltage_damping: Damping factor for voltage updates (0 < factor <= 1.0).
            Default 1.0 means no damping.
    """

    method: Literal["XB", "BX"] = "XB"
    rebuild_matrices_every: int = 0
    angle_damping: float = 1.0
    voltage_damping: float = 1.0

    def __post_init__(self) -> None:
        """Validate FDLF-specific parameters."""
        if self.angle_damping <= 0:
            raise ValueError(
                f"Współczynnik tłumienia kąta musi być dodatni, "
                f"otrzymano: {self.angle_damping}. "
                f"Wartość 1.0 oznacza brak tłumienia."
            )
        if self.voltage_damping <= 0:
            raise ValueError(
                f"Współczynnik tłumienia napięcia musi być dodatni, "
                f"otrzymano: {self.voltage_damping}. "
                f"Wartość 1.0 oznacza brak tłumienia."
            )
        if self.rebuild_matrices_every < 0:
            raise ValueError(
                f"Liczba iteracji między przebudowami macierzy susceptancyjnych musi być nieujemna, "
                f"otrzymano: {self.rebuild_matrices_every}. "
                f"Wartość 0 oznacza brak przebudowy macierzy."
            )


class PowerFlowFastDecoupledSolver:
    """Fast-Decoupled Load Flow Solver.

    Implements the Fast-Decoupled iterative method for power flow analysis.
    Provides the same interface and WHITE BOX trace as Newton-Raphson solver.

    The FDLF method is faster than Newton-Raphson for large well-conditioned
    networks because:
    - B' and B" matrices are constant (factored once)
    - Half-iterations are simpler than full Jacobian updates
    - Decoupled equations reduce computational complexity

    Limitations:
    - Less accurate for networks with high R/X ratios
    - May not converge for heavily loaded networks
    - Not suitable for systems with large angle differences

    WHITE BOX Compliance:
    - All iterations are traced
    - Per-bus mismatch recorded
    - Voltage/angle updates exposed
    - Full state saved after each iteration
    - solver_method = "fast-decoupled"
    """

    def solve(
        self,
        pf_input: PowerFlowInput,
        fd_options: FastDecoupledOptions | None = None,
    ) -> PowerFlowNewtonSolution:
        """Execute Fast-Decoupled power flow calculation.

        Args:
            pf_input: Standard power flow input specification.
            fd_options: Optional FDLF-specific options.
                       If not provided, uses defaults with XB method.

        Returns:
            PowerFlowNewtonSolution: Same format as Newton-Raphson solver.

        Raises:
            ValueError: If input validation fails.
        """
        graph: NetworkGraph = pf_input.typed_graph()
        options = pf_input.options

        # Merge options
        if fd_options is not None:
            method = fd_options.method
            rebuild_every = fd_options.rebuild_matrices_every
            angle_damping = fd_options.angle_damping
            voltage_damping = fd_options.voltage_damping
            full_trace = fd_options.trace_level == "full" or options.trace_level == "full"
            tolerance = fd_options.tolerance
            max_iter = fd_options.max_iter
        else:
            method = "XB"
            rebuild_every = 0
            angle_damping = 1.0
            voltage_damping = 1.0
            full_trace = options.trace_level == "full"
            tolerance = options.tolerance
            max_iter = options.max_iter

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

        # Run Fast-Decoupled iteration
        (
            v,
            converged,
            iterations,
            max_mismatch,
            fd_trace,
            pv_to_pq_switches,
        ) = self._fast_decoupled_solve(
            z.ybus_pu,
            z.slack_index,
            z.pq_indices,
            z.pv_indices,
            z.p_spec,
            z.q_spec,
            z.pv_setpoints,
            z.pv_q_limits,
            z.v0,
            tolerance,
            max_iter,
            method,
            rebuild_every,
            angle_damping,
            voltage_damping,
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

        # Handle non-convergence
        if not converged:
            iterations = int(max_iter)
            if fd_trace:
                if "cause_if_failed_optional" not in fd_trace[-1]:
                    fd_trace[-1]["cause_if_failed_optional"] = "max_iter"
            else:
                fd_trace.append(
                    {
                        "solver_method": "fast-decoupled",
                        "iter": iterations,
                        "max_mismatch_pu": max_mismatch,
                        "mismatch_norm": 0.0,
                        "step_norm": 0.0,
                        "angle_damping_used": float(angle_damping),
                        "voltage_damping_used": float(voltage_damping),
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
            nr_trace=fd_trace,  # Same field name for compatibility
            applied_taps=z.applied_taps,
            applied_shunts=z.applied_shunts,
            pv_to_pq_switches=pv_to_pq_switches,
            init_state=z.init_state,
            solver_method="fast-decoupled",  # type: ignore[arg-type]
            fallback_info=None,
            **wyniki,
        )

    def _build_b_matrices(
        self,
        ybus: np.ndarray,
        slack_index: int,
        pq_indices: list[int],
        pv_indices: list[int],
        method: Literal["XB", "BX"],
    ) -> tuple[np.ndarray, np.ndarray, list[int], list[int]]:
        """Build B' and B" matrices for FDLF.

        B' is used for P-θ iterations (non-slack buses).
        B" is used for Q-V iterations (PQ buses only).

        Classic FDLF formulation (Stott & Alsac, 1974):
        - B' and B" are derived from the imaginary part of Y-bus
        - B_ij = Im(Y_ij) for off-diagonal (note: negative of -Im convention)
        - The signs follow from ∂P/∂θ ≈ V_i * V_j * B_ij

        For XB method (default):
        - B' ignores shunts (only series susceptances)
        - B" uses full Y-bus susceptances

        For BX method:
        - B' uses full Y-bus susceptances
        - B" ignores shunts

        Args:
            ybus: Full admittance matrix.
            slack_index: Index of slack bus.
            pq_indices: Indices of PQ buses.
            pv_indices: Indices of PV buses.
            method: "XB" or "BX" variant.

        Returns:
            (B_prime, B_double_prime, non_slack_indices, pq_indices_filtered)
        """
        n = ybus.shape[0]

        # Non-slack indices: all except slack (for P-θ equations)
        non_slack_indices = sorted([i for i in range(n) if i != slack_index])

        # B' matrix: used for P-θ (all non-slack buses)
        # B" matrix: used for Q-V (PQ buses only)

        # B matrices in FDLF use negative of imaginary part of Y-bus
        # This gives positive diagonal, negative off-diagonal (Laplacian structure)
        # which is positive definite for connected networks
        neg_b_full = -ybus.imag.copy()

        if method == "XB":
            # B' ignores shunts: compute diagonal from sum of off-diagonals only
            b_prime_full = np.zeros((n, n), dtype=float)
            for i in range(n):
                for j in range(n):
                    if i != j:
                        b_prime_full[i, j] = neg_b_full[i, j]
                        b_prime_full[i, i] -= neg_b_full[i, j]  # Sum of negatives of off-diag

            # B" = full -Im(Y-bus)
            b_double_prime_full = neg_b_full.copy()

        else:  # BX
            # B' = full -Im(Y-bus)
            b_prime_full = neg_b_full.copy()

            # B" ignores shunts
            b_double_prime_full = np.zeros((n, n), dtype=float)
            for i in range(n):
                for j in range(n):
                    if i != j:
                        b_double_prime_full[i, j] = neg_b_full[i, j]
                        b_double_prime_full[i, i] -= neg_b_full[i, j]

        # Extract submatrices for reduced system
        # B' for non-slack buses
        n_non_slack = len(non_slack_indices)
        b_prime = np.zeros((n_non_slack, n_non_slack), dtype=float)
        for i, idx_i in enumerate(non_slack_indices):
            for j, idx_j in enumerate(non_slack_indices):
                b_prime[i, j] = b_prime_full[idx_i, idx_j]

        # B" for PQ buses only
        n_pq = len(pq_indices)
        b_double_prime = np.zeros((n_pq, n_pq), dtype=float)
        for i, idx_i in enumerate(pq_indices):
            for j, idx_j in enumerate(pq_indices):
                b_double_prime[i, j] = b_double_prime_full[idx_i, idx_j]

        return b_prime, b_double_prime, non_slack_indices, pq_indices

    def _fast_decoupled_solve(
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
        method: Literal["XB", "BX"],
        rebuild_every: int,
        angle_damping: float,
        voltage_damping: float,
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
        """Core Fast-Decoupled iteration with WHITE BOX trace.

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
            method: FDLF variant ("XB" or "BX").
            rebuild_every: Rebuild matrices every N iterations (0 = never).
            angle_damping: Damping factor for angle updates.
            voltage_damping: Damping factor for voltage magnitude updates.
            full_trace: Whether to record full trace.
            node_index_to_id: Map from index to node ID.
            base_mva: Base power in MVA.
            zip_table: Voltage-dependent ZIP coefficients keyed by bus index
                (ADR-011). Only the mismatch uses the V-dependent spec; B'/B" stay
                constant. Empty/None => classic constant-power path (reduce-to-NR).
            inv_table: Voltage-dependent inverter Q(U) controls keyed by bus index
                (ADR-011 §5b). Only the Q mismatch uses the V-dependent spec; B'/B"
                stay constant. Empty/None => classic path (reduce-to-NR).
            zip_const: Constant (non-ZIP) part of a ZIP bus — generation on the
                same bus (defect D1). None => nothing to split; p_spec/q_spec are
                the whole bus power (historical path).
            scalenie: Węzły elektryczne wyspy (zamknięte łączniki scalone). ``ybus``,
                ``v0``, B'/B", indeksy typów i nastawy PV — na indeksie węzła
                elektrycznego; ``p_spec``, ``q_spec``, ``zip_table``, ``inv_table``,
                ``zip_const``, ``q_inv_seed`` — na indeksie węzła wyspy (niezbilansowanie
                węzła elektrycznego z sumy zadań jego węzłów). Wyspa bez łącznika — dawna
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
        iteration = 0

        # Active bus sets (can change if PV switches to PQ)
        active_pq = list(pq_indices)
        active_pv = list(pv_indices)

        # ADR-011 §5b: under-relaxed Q(U) state. Seeded from the SOURCE's own
        # declared Q (defect B — the bus power is not the source's on a prosumer
        # bus); advanced toward qu_q(|V|) at the start of each iteration with a
        # slope-scaled step so the volt-var fixed-point gain stays < 1 (FD lacks NR's
        # ∂Q/∂V Jacobian feedback). Converged value == qu_q(v*) => parity with NR and
        # reduce-to-NR preserved (empty inv_table => no-op).
        q_inv_state = dict(q_inv_seed or {})
        sc = scalenie
        scalona = not sc.trywialne
        id_pelny = dict(enumerate(sc.wezly)) if scalona else node_index_to_id

        # Build and factor B matrices initially
        b_prime, b_double_prime, non_slack_indices, _ = self._build_b_matrices(
            ybus, slack_index, active_pq, active_pv, method
        )

        # LU factorization (scipy uses LAPACK routines)
        try:
            b_prime_lu = linalg.lu_factor(b_prime) if b_prime.size > 0 else None
            b_double_prime_lu = (
                linalg.lu_factor(b_double_prime) if b_double_prime.size > 0 else None
            )
        except linalg.LinAlgError:
            # Singular matrix - return early with failure
            trace.append(
                {
                    "solver_method": "fast-decoupled",
                    "iter": 0,
                    "max_mismatch_pu": float("inf"),
                    "mismatch_norm": float("inf"),
                    "step_norm": 0.0,
                    "angle_damping_used": float(angle_damping),
                    "voltage_damping_used": float(voltage_damping),
                    "cause_if_failed_optional": "singular_matrix",
                }
            )
            return v, False, 0, float("inf"), trace, pv_to_pq_switches

        for iteration in range(1, max_iter + 1):
            v_old = v.copy()
            switched_this_iter: list[str] = []

            # Advance the under-relaxed Q(U) state using the current voltages.
            inverter_relax_q(q_inv_state, sc.rozwin(v), inv_table)

            # --- PV bus Q-limit check and switching ---
            for idx in list(active_pv):
                if idx not in pv_q_limits:
                    continue

                # Calculate Q injection for this PV bus
                i_inj = sum(ybus[idx, k] * v[k] for k in range(n))
                s_calc = v[idx] * np.conj(i_inj)
                q_calc = s_calc.imag
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
                    q_spec[nosnik] = limit_pu
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

                    # Rebuild B" matrix after PV→PQ switch
                    _, b_double_prime, _, _ = self._build_b_matrices(
                        ybus, slack_index, active_pq, active_pv, method
                    )
                    if b_double_prime.size > 0:
                        try:
                            b_double_prime_lu = linalg.lu_factor(b_double_prime)
                        except linalg.LinAlgError:
                            b_double_prime_lu = None

            # Rebuild matrices if requested
            if rebuild_every > 0 and iteration % rebuild_every == 0:
                b_prime, b_double_prime, non_slack_indices, _ = self._build_b_matrices(
                    ybus, slack_index, active_pq, active_pv, method
                )
                if b_prime.size > 0:
                    try:
                        b_prime_lu = linalg.lu_factor(b_prime)
                    except linalg.LinAlgError:
                        b_prime_lu = None
                if b_double_prime.size > 0:
                    try:
                        b_double_prime_lu = linalg.lu_factor(b_double_prime)
                    except linalg.LinAlgError:
                        b_double_prime_lu = None

            # --- Calculate power mismatches ---
            p_calc, q_calc = compute_power_injections(ybus, v)

            # ADR-011 ZIP: evaluate the specified injection at the current |V|
            # (no-op when zip_table is empty => reduce-to-NR). B' is unaffected.
            p_eff, _ = zip_effective_spec(p_spec, q_spec, sc.rozwin(v), zip_table, zip_const)
            p_eff = sc.zredukuj(p_eff)

            # P mismatch for all non-slack buses (the Q mismatch of the Q-V half-iteration
            # is taken after the angle update below).
            d_p_full = p_eff - p_calc
            d_p = d_p_full[non_slack_indices]

            # --- P-θ half-iteration ---
            delta_theta = np.zeros(n)
            if b_prime_lu is not None and len(non_slack_indices) > 0:
                # ΔP / |V| for non-slack buses
                v_mag_non_slack = np.abs(v[non_slack_indices])
                d_p_over_v = d_p / v_mag_non_slack

                # Solve B' · Δθ = ΔP/|V|
                delta_theta_reduced = linalg.lu_solve(b_prime_lu, d_p_over_v)

                # Apply damping and expand to full vector
                for i, idx in enumerate(non_slack_indices):
                    delta_theta[idx] = angle_damping * delta_theta_reduced[i]

            # Update angles
            theta = np.angle(v)
            theta_new = theta + delta_theta
            v = np.abs(v) * np.exp(1j * theta_new)

            # --- Q-V half-iteration ---
            delta_v_mag = np.zeros(n)
            if b_double_prime_lu is not None and len(active_pq) > 0:
                # Recalculate Q after angle update
                _, q_calc_updated = compute_power_injections(ybus, v)
                # ADR-011 ZIP: recompute the specified Q at the updated |V| (no-op
                # when zip_table is empty => reduce-to-NR). B" is unaffected.
                # ADR-011 §5b: the Q(U) buses use the under-relaxed Q(U) state (no-op
                # when inv_table empty); inverter P is not voltage-dependent so the P
                # side is untouched.
                # Defect B: the volt-var value is ADDED to the composed bus power,
                # not assigned over it — on a prosumer bus what is already there is
                # the ZIP-scaled load, which assigning deleted from the model.
                _, q_eff = zip_effective_spec(p_spec, q_spec, sc.rozwin(v), zip_table, zip_const)
                if inv_table:
                    q_eff = q_eff.copy()
                    for idx in inv_table:
                        q_eff[idx] += q_inv_state[idx]
                q_eff = sc.zredukuj(q_eff)
                d_q_updated = q_eff[active_pq] - q_calc_updated[active_pq]

                # ΔQ / |V| for PQ buses
                v_mag_pq = np.abs(v[active_pq])
                d_q_over_v = d_q_updated / v_mag_pq

                # Solve B" · Δ|V| = ΔQ/|V|
                delta_v_reduced = linalg.lu_solve(b_double_prime_lu, d_q_over_v)

                # Apply damping and expand to full vector
                for i, idx in enumerate(active_pq):
                    delta_v_mag[idx] = voltage_damping * delta_v_reduced[i]

            # Update voltage magnitudes (PQ buses only)
            v_mag = np.abs(v)
            for idx in active_pq:
                v_mag[idx] += delta_v_mag[idx]

            # Restore PV voltage magnitudes
            for idx in active_pv:
                v_mag[idx] = pv_setpoints.get(idx, np.abs(v[idx]))

            # Reconstruct complex voltage
            v = v_mag * np.exp(1j * np.angle(v))

            # --- Calculate final mismatch for convergence check ---
            p_calc_final, q_calc_final = compute_power_injections(ybus, v)
            # ADR-011 ZIP: the convergence test compares against the specified
            # injection at the final |V| (matches NR). With an empty zip_table this
            # returns p_spec/q_spec unchanged => reduce-to-NR (byte-identical).
            # ADR-011 §5b: the Q(U) buses use the under-relaxed Q(U) state for the Q
            # mismatch (same value the Q-V half-iteration used this iteration), so the
            # convergence test is consistent. No-op when inv_table is empty.
            p_eff_final, q_eff_final = zip_effective_spec(
                p_spec, q_spec, sc.rozwin(v), zip_table, zip_const
            )
            if inv_table:
                q_eff_final = q_eff_final.copy()
                for idx in inv_table:
                    q_eff_final[idx] += q_inv_state[idx]
            p_eff_final = sc.zredukuj(p_eff_final)
            q_eff_final = sc.zredukuj(q_eff_final)
            d_p_final = p_eff_final[non_slack_indices] - p_calc_final[non_slack_indices]
            d_q_final = q_eff_final[active_pq] - q_calc_final[active_pq]

            mismatch = (
                np.concatenate([d_p_final, d_q_final])
                if len(d_p_final) > 0 or len(d_q_final) > 0
                else np.array([])
            )
            max_mismatch = float(np.max(np.abs(mismatch))) if mismatch.size else 0.0
            mismatch_norm = float(np.linalg.norm(mismatch)) if mismatch.size else 0.0

            # Calculate step norm (voltage change)
            step_norm = float(np.linalg.norm(v - v_old))

            # --- Build trace entry ---
            mismatch_per_bus: dict[str, dict[str, float]] | None = None
            delta_theta_dict: dict[str, float] | None = None
            delta_v_dict: dict[str, float] | None = None

            if full_trace:
                mismatch_per_bus = {}
                delta_theta_dict = {}
                delta_v_dict = {}

                for i, idx in enumerate(non_slack_indices):
                    node_id = node_index_to_id.get(idx, str(idx))
                    mismatch_per_bus[node_id] = {"delta_p_pu": float(d_p_final[i])}
                    delta_theta_dict[node_id] = float(delta_theta[idx])

                for i, idx in enumerate(active_pq):
                    node_id = node_index_to_id.get(idx, str(idx))
                    if node_id in mismatch_per_bus:
                        mismatch_per_bus[node_id]["delta_q_pu"] = float(d_q_final[i])
                    else:
                        mismatch_per_bus[node_id] = {
                            "delta_p_pu": 0.0,
                            "delta_q_pu": float(d_q_final[i]),
                        }
                    delta_v_dict[node_id] = float(delta_v_mag[idx])

            # Check for numerical issues
            if mismatch.size and (not np.isfinite(max_mismatch) or not np.isfinite(mismatch_norm)):
                trace_entry: dict[str, Any] = {
                    "solver_method": "fast-decoupled",
                    "iter": iteration,
                    "max_mismatch_pu": max_mismatch,
                    "mismatch_norm": mismatch_norm,
                    "step_norm": step_norm,
                    "angle_damping_used": float(angle_damping),
                    "voltage_damping_used": float(voltage_damping),
                    "pv_to_pq_optional": switched_this_iter,
                    "cause_if_failed_optional": "numerical_issue",
                }
                if full_trace:
                    if mismatch_per_bus:
                        trace_entry["mismatch_per_bus"] = mismatch_per_bus
                    trace_entry["state_next"] = self._build_state_dict(v, node_index_to_id)
                trace.append(trace_entry)
                break

            # Check convergence
            if max_mismatch < tolerance:
                converged = True
                trace_entry = {
                    "solver_method": "fast-decoupled",
                    "iter": iteration,
                    "max_mismatch_pu": max_mismatch,
                    "mismatch_norm": mismatch_norm,
                    "step_norm": step_norm,
                    "angle_damping_used": float(angle_damping),
                    "voltage_damping_used": float(voltage_damping),
                    "pv_to_pq_optional": switched_this_iter,
                }
                if full_trace:
                    if mismatch_per_bus:
                        trace_entry["mismatch_per_bus"] = mismatch_per_bus
                    if delta_theta_dict:
                        trace_entry["delta_theta"] = delta_theta_dict
                    if delta_v_dict:
                        trace_entry["delta_v"] = delta_v_dict
                    trace_entry["state_next"] = self._build_state_dict(v, node_index_to_id)
                trace.append(trace_entry)
                break

            # Build trace entry for this iteration
            trace_entry = {
                "solver_method": "fast-decoupled",
                "iter": iteration,
                "max_mismatch_pu": max_mismatch,
                "mismatch_norm": mismatch_norm,
                "step_norm": step_norm,
                "angle_damping_used": float(angle_damping),
                "voltage_damping_used": float(voltage_damping),
                "pv_to_pq_optional": switched_this_iter,
            }

            if full_trace:
                if mismatch_per_bus:
                    trace_entry["mismatch_per_bus"] = mismatch_per_bus
                if delta_theta_dict:
                    trace_entry["delta_theta"] = delta_theta_dict
                if delta_v_dict:
                    trace_entry["delta_v"] = delta_v_dict
                trace_entry["state_next"] = self._build_state_dict(v, node_index_to_id)

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


def solve_power_flow_fast_decoupled(
    pf_input: PowerFlowInput,
    fd_options: FastDecoupledOptions | None = None,
) -> PowerFlowNewtonSolution:
    """Convenience function to solve power flow using Fast-Decoupled method.

    Args:
        pf_input: Power flow input specification.
        fd_options: Optional FDLF-specific options.

    Returns:
        PowerFlowNewtonSolution: Same format as Newton-Raphson solver.
    """
    return PowerFlowFastDecoupledSolver().solve(pf_input, fd_options)
