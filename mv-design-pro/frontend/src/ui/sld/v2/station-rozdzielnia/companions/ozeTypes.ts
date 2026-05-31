/**
 * SldOzeArchetypeCompanion — the ONE TRUTH the SLD reads for an OZE source
 * archetype (KROK 2). Mirror of the backend `sld_oze_archetype_companion_v1`.
 *
 * GOVERNING PRINCIPLE (B-01, P-A): every value shown for an OZE source MUST equal
 * what the FROZEN solvers computed (Newton-Raphson for U/flow, IEC 60909 for Ik'').
 * Produced by running the solvers on a two-voltage OZE substrate with a real
 * transformer + an IBG InverterSource. The renderer INTERPRETS — never recomputes.
 */
import type { ScBus } from './shortCircuitTypes';

/** Power hierarchy of a connection: Pzainst ≥ Pn,AC ≥ Pprzyłącz ≥ Posiągalna. */
export interface OzePowerHierarchy {
  readonly p_zainst_kw: number;
  readonly pn_ac_kw: number;
  readonly p_przylacz_kw: number;
  readonly p_osiagalna_kw: number;
  /** Gate H verdict: the chain is monotonically non-increasing. */
  readonly valid: boolean;
}

/** OZE source metadata (axes T/R/S of the taxonomy). */
export interface OzeSourceMeta {
  readonly technology: string; // PV | BESS | FW | ...
  readonly machine_type: 'IBG' | 'SYNCHRONOUS' | 'ASYNCHRONOUS';
  readonly nc_rfg_class: string; // A | B | C | D
  readonly control_mode: string; // cosφ=const | Q=const | cosφ(P) | Q(U) | P(f)
  /** Gate I — protection function codes (ANSI/IEC), a function of machine_type. */
  readonly protection_codes: readonly string[];
  readonly power_hierarchy: OzePowerHierarchy;
}

export interface OzeVfBus {
  readonly bus_ref: string;
  readonly un_kv: number;
  readonly u_kv: number;
  readonly u_pu: number;
  readonly deviation_percent: number;
}

export interface OzeVfBranch {
  readonly branch_ref: string;
  readonly i_a: number;
  readonly p_mw: number;
  readonly q_mvar: number;
  readonly s_mva: number;
  readonly direction: 'forward' | 'reverse' | 'none';
  readonly loading_percent: number | null;
}

/** IBG short-circuit contribution breakdown (gate J). */
export interface OzeSourceContribution {
  readonly machine_type: string;
  readonly model: string;
  readonly ik_contribution_ka: number;
  /** Gate J flag: an IBG is NOT modelled as a synchronous machine. */
  readonly is_synchronous_machine: boolean;
}

/** A short-circuit busbar dossier extended with the OZE source contribution. */
export type OzeScBus = ScBus & { readonly source_contribution: OzeSourceContribution };

export interface SldOzeArchetypeCompanion {
  readonly schema: 'sld_oze_archetype_companion_v1';
  readonly archetype: string;
  readonly enm_hash: string;
  /** Bus_ref of the point of common coupling (PCC). */
  readonly pcc_bus_ref: string;
  readonly source: OzeSourceMeta;
  readonly case_ref_pf: string;
  readonly case_ref_sc: string;
  readonly converged: boolean;
  readonly voltage_flow: {
    readonly buses: Readonly<Record<string, OzeVfBus>>;
    readonly branches: Readonly<Record<string, OzeVfBranch>>;
  };
  readonly short_circuit: {
    readonly standard: string;
    readonly buses: Readonly<Record<string, OzeScBus>>;
  };
}
