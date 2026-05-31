/**
 * SldShortCircuitCompanion — the ONE TRUTH the SLD reads for busbar short-circuit
 * (gate E). Mirror of the backend `sld_short_circuit_companion_v1`.
 *
 * GOVERNING PRINCIPLE (B-01, P-A): the SC values shown on a busbar MUST equal what
 * the FROZEN IEC 60909 solver computed. This companion is produced by RUNNING
 * `ShortCircuitIEC60909Solver` on a two-voltage substrate and committed next to
 * the ENM. The renderer INTERPRETS it on L2 — it never recomputes a short circuit.
 */

/**
 * One White Box step carried verbatim from the solver trace — a full A→B→C→D
 * derivation: A=title/formula, B=inputs (data), C=substitution, D=result+unit.
 * LaTeX strings are the solver's own; rendered as readable math text at L2.
 */
export interface ScWhiteBoxStep {
  readonly key?: string;
  readonly title?: string;
  readonly description?: string;
  /** A — the symbolic formula (LaTeX). */
  readonly formula_latex?: string;
  /** B — the input data (named values; complex as {re, im}). */
  readonly inputs?: Readonly<Record<string, unknown>>;
  /** C — the formula with the data substituted (LaTeX). */
  readonly substitution_latex?: string;
  readonly substitution?: string;
  /** D — the result value(s). */
  readonly result?: Readonly<Record<string, unknown>>;
  readonly unit?: string | null;
  readonly result_unit?: string | null;
  readonly notes?: string | null;
  readonly [k: string]: unknown;
}

/** Ik''max branch (c=1.10) — full equipment-withstand quantities. */
export interface ScMax {
  readonly case_ref: string;
  readonly c_factor: number;
  readonly ikss_ka: number;
  readonly ip_ka: number;
  readonly ib_ka: number;
  readonly ith_ka: number;
  readonly kappa: number;
  readonly sk_mva: number;
  readonly rx_ratio: number;
  readonly white_box_trace: readonly ScWhiteBoxStep[];
}

/** Ik''min branch (c=0.95) — protection-sensitivity reference. */
export interface ScMin {
  readonly case_ref: string;
  readonly c_factor: number;
  readonly ikss_ka: number;
  readonly ith_ka: number;
  readonly kappa: number;
  readonly sk_mva: number;
  readonly white_box_trace: readonly ScWhiteBoxStep[];
}

/** Ik''max ≤ Icw withstand verification at a busbar. */
export interface ScVerification {
  readonly rule: 'ikss_max_le_icw';
  readonly ikss_max_ka: number;
  readonly icw_ka: number;
  readonly passed: boolean;
}

/** Short-circuit at one busbar (SN section or nN 400 V). */
export interface ScBus {
  readonly bus_ref: string;
  readonly un_kv: number;
  readonly icw_ka: number;
  readonly max: ScMax;
  readonly min: ScMin;
  readonly verification: ScVerification;
}

export interface SldShortCircuitCompanion {
  readonly schema: 'sld_short_circuit_companion_v1';
  readonly enm_hash: string;
  readonly standard: string;
  readonly solver_method: string;
  readonly tk_s: number;
  /** bus_ref → its short-circuit dossier. */
  readonly buses: Readonly<Record<string, ScBus>>;
}
