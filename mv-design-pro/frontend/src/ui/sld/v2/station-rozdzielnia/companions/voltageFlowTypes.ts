/**
 * SldVoltageFlowCompanion — the ONE TRUTH the SLD reads for busbar voltages and
 * branch power flows (gate F). Mirror of the backend `sld_voltage_flow_companion_v1`.
 *
 * GOVERNING PRINCIPLE (B-01, P-A): the U / I / P / Q shown on a busbar/field MUST
 * equal what the FROZEN Newton-Raphson solver computed. This companion is produced
 * by RUNNING `solve_power_flow_physics` on a two-voltage substrate and committed
 * next to the ENM. The renderer INTERPRETS it on L2 — it never recomputes a flow.
 */

/** Voltage at one busbar (SN section or nN 400 V). */
export interface VfBus {
  readonly bus_ref: string;
  readonly un_kv: number;
  readonly u_kv: number;
  readonly u_pu: number;
  readonly u_percent: number;
  /** (U_pu − 1)·100 — signed deviation from nominal [%]. */
  readonly deviation_percent: number;
  readonly angle_deg: number;
}

/** Power flow through one branch/field. */
export interface VfBranch {
  readonly branch_ref: string;
  readonly i_a: number;
  readonly p_mw: number;
  readonly q_mvar: number;
  readonly s_mva: number;
  readonly direction: 'forward' | 'reverse' | 'none';
  /** I / I_rated · 100 [%], or null if the branch has no rated current. */
  readonly loading_percent: number | null;
}

export interface SldVoltageFlowCompanion {
  readonly schema: 'sld_voltage_flow_companion_v1';
  readonly enm_hash: string;
  readonly solver_method: string;
  /** Declared loadflow case the solution belongs to (e.g. ROZPLYW_MAX_OBC). */
  readonly case_ref: string;
  readonly converged: boolean;
  readonly iterations: number;
  readonly base_mva: number;
  /** Number of Newton-Raphson White Box iteration steps. */
  readonly white_box_steps: number;
  /** bus_ref → voltage. */
  readonly buses: Readonly<Record<string, VfBus>>;
  /** branch_ref → power flow. */
  readonly branches: Readonly<Record<string, VfBranch>>;
}
