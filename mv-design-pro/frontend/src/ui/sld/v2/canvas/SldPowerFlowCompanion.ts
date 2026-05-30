/**
 * SldPowerFlowCompanion — the ONE TRUTH the SLD reads for the power-flow tor.
 *
 * GOVERNING PRINCIPLE (P-A): the SLD is a PROJECTION of the math model. Direction
 * and energization shown on the diagram MUST equal what the FROZEN power-flow
 * solver computed — never re-derived in the SLD. This companion is produced by the
 * backend (`application.reference_networks.sld_substrate_power_flow`) by RUNNING the
 * production load-flow solver on the committed ENM, and committed next to the ENM
 * fixture. The SLD reads it; it does NOT compute direction/energization itself.
 *
 * `SupplyPathHighlighter` (the frontend topology BFS) is a *topology-only* fallback
 * with no direction — it is a second truth and is superseded by this companion
 * whenever a companion is supplied.
 *
 * Schema mirror of the backend `sld_power_flow_companion_v1`.
 */

/** Per-branch active-power flow direction from the solver. */
export type SldFlowDirection = 'forward' | 'reverse' | 'none';

export interface SldBranchFlow {
  /** sign(Re(branch_s_from)): "forward" = power flows from→to (ENM branch
   *  orientation); "reverse" = to→from (OZE backfeed upstream); "none" = no net
   *  active power (de-energized OR exactly zero through-flow). */
  readonly direction: SldFlowDirection;
  /** Active power at the branch "from" end [MW] (solver, signed). */
  readonly p_from_mw: number;
}

export interface SldPowerFlowCompanion {
  readonly schema: 'sld_power_flow_companion_v1';
  /** Active case (state declaration) shown on the canvas. */
  readonly case_ref: string;
  readonly case_label: string;
  readonly solver_method: string;
  readonly converged: boolean;
  readonly iterations: number;
  readonly base_mva: number;
  /** Builder snapshot hash — binds this companion to the ENM it was solved on. */
  readonly enm_hash: string;
  /** Per ENM branch ref_id → solver flow direction + signed P_from. */
  readonly branch_flow: Readonly<Record<string, SldBranchFlow>>;
  /** Branch ref_ids the solver actually solved (both endpoints in the slack
   *  island). Membership = energized; absence = de-energized. */
  readonly energized_branch_refs: readonly string[];
  /** Bus ref_ids in the solver slack island (energized). */
  readonly energized_bus_refs: readonly string[];
  /** Bus ref_ids the solver did NOT solve (de-energized; e.g. beyond an open NOP). */
  readonly de_energized_bus_refs: readonly string[];
  /** ENM switch branches with status=open (normally-open points). */
  readonly open_point_branch_refs: readonly string[];
}

/** Narrow an unknown JSON value to a companion (defensive parse). Returns null on
 *  shape mismatch so callers degrade gracefully to topology-only rendering. */
export function parsePowerFlowCompanion(raw: unknown): SldPowerFlowCompanion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema !== 'sld_power_flow_companion_v1') return null;
  if (typeof obj.branch_flow !== 'object' || obj.branch_flow === null) return null;
  if (!Array.isArray(obj.energized_branch_refs)) return null;
  if (!Array.isArray(obj.energized_bus_refs)) return null;
  return obj as unknown as SldPowerFlowCompanion;
}

/**
 * Indexed read-model over a companion — O(1) lookups for the adapter/renderer.
 * Pure projection of the solver result: NO direction/energization is computed here,
 * only looked up.
 */
export interface SldPowerFlowIndex {
  readonly caseRef: string;
  readonly caseLabel: string;
  readonly converged: boolean;
  readonly enmHash: string;
  /** branch ref_id → direction (solver). Missing ref ⇒ caller treats as 'none'. */
  directionOf(branchRef: string): SldFlowDirection;
  /** True iff the solver solved this branch (both ends energized). */
  isBranchEnergized(branchRef: string): boolean;
  /** True iff the bus is in the solver slack island. */
  isBusEnergized(busRef: string): boolean;
  /** True iff the branch is a normally-open point (open switch). */
  isOpenPoint(branchRef: string): boolean;
}

export function buildPowerFlowIndex(
  companion: SldPowerFlowCompanion | null,
): SldPowerFlowIndex | null {
  if (!companion) return null;
  const energizedBranches = new Set(companion.energized_branch_refs);
  const energizedBuses = new Set(companion.energized_bus_refs);
  const openPoints = new Set(companion.open_point_branch_refs);
  const flow = companion.branch_flow;
  return {
    caseRef: companion.case_ref,
    caseLabel: companion.case_label,
    converged: companion.converged,
    enmHash: companion.enm_hash,
    directionOf: (branchRef) => flow[branchRef]?.direction ?? 'none',
    isBranchEnergized: (branchRef) => energizedBranches.has(branchRef),
    isBusEnergized: (busRef) => energizedBuses.has(busRef),
    isOpenPoint: (branchRef) => openPoints.has(branchRef),
  };
}
