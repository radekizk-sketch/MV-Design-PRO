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

/** CT/VT nameplate distilled from the reference schematic. */
export interface OzeSchematicCt {
  readonly type: string;
  readonly ratio: string;
  readonly ith_ka: number;
  readonly idyn_ka: number;
  readonly cores: readonly string[];
}
export interface OzeSchematicVt {
  readonly type: string;
  readonly ratio: string;
  readonly windings: readonly string[];
}

/** Equipment register distilled element-by-element from a real schematic
 *  (source_ref = the drawing) — present when the template is a faithful
 *  projection of a reference document, not a synthesised archetype. */
export interface OzeSchematic {
  readonly source_ref: string;
  readonly sn_kv: number;
  readonly nn_kv: number;
  readonly transformer: string;
  readonly nn_grid: string;
  readonly nn_main_breaker: string;
  readonly pv_modules: string;
  readonly inverters?: string;
  readonly dc_ac_ratio?: number;
  readonly ct: OzeSchematicCt;
  readonly vt: OzeSchematicVt;
  readonly own_needs: string;
}

/** One row of the protection-coordination matrix (distilled from the doc). */
export interface OzeCoordRow {
  readonly lp: number;
  readonly code: string; // real function name: I>, Ust I>, G0>, 3U0, I0>, SPZ...
  readonly name: string;
  readonly inverter: string;
  readonly relay_sn: string;
  readonly measure: string; // SN | nN
  readonly trips: string; // which breaker trips
}

/** Three-level protection coordination (inverter / nN Q1 / SN Q0), distilled
 *  from the settings document (source_ref). Lives in the click-module, NOT on the
 *  canvas — the canvas elements are clickable and bound to this. */
export interface OzeCoordination {
  readonly source_ref: string;
  readonly levels: readonly string[];
  readonly philosophy: { readonly soft: string; readonly hard: string };
  readonly base: Readonly<Record<string, number>>;
  readonly matrix: readonly OzeCoordRow[];
}

/** OZE source metadata (axes T/R/S of the taxonomy). */
export interface OzeSourceMeta {
  readonly technology: string; // PV | BESS | FW | ...
  readonly machine_type: 'IBG' | 'SYNCHRONOUS' | 'ASYNCHRONOUS';
  readonly nc_rfg_class: string; // A | B | C | D
  readonly control_mode: string; // cosφ=const | Q=const | cosφ(P) | Q(U) | P(f)
  /** Gate I — protection function codes (real names from the doc), per device. */
  readonly protection_codes: readonly string[];
  readonly power_hierarchy: OzePowerHierarchy;
  /** Present iff this template is distilled from a real reference schematic. */
  readonly schematic?: OzeSchematic;
  /** Protection coordination matrix (click-module content, not on the canvas). */
  readonly coordination?: OzeCoordination;
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

/**
 * One station field of the producer installation (anti-fabrication: pinned to the
 * ENM via `source_ref`). The interface protection (looking at the grid) lives on
 * the CONNECTION field only — never at the source.
 */
/** One apparatus on a field's power path (projection of ENM BayPrimaryDevice),
 *  ordered busbar→cable via `placement`. */
export interface OzeApparatus {
  readonly device_ref: string;
  readonly kind: string; // CB | DS | LOAD_SWITCH | ES | CT | VT | CABLE_HEAD | SURGE_ARRESTER | ...
  readonly designation: string;
  readonly catalog: string | null;
  readonly placement: 'UPSTREAM' | 'MIDSTREAM' | 'DOWNSTREAM' | 'OFF_PATH' | 'GROUND_BRANCH';
  readonly source_ref: string;
}

/** A field's cable-connection PORT (projection of ENM Port) — the cable docks
 *  HERE (on the cable head), entering from `entry_side` (axis 7). This is the
 *  docking contract that keeps the network orthogonal at 53 stations. */
export interface OzePort {
  readonly port_id: string;
  readonly kind: string; // sn_input | sn_output | sn_branch | nn_feeder | ...
  readonly nominal_voltage_kv: number;
  readonly entry_side: 'DOL' | 'BOK-L' | 'BOK-P' | 'GORA'; // axis 7
  readonly occupied_by: string; // cable segment ref
  readonly cable: string; // type/cross-section, or 'dane niekompletne'
  readonly source_ref: string;
}

export interface OzeField {
  readonly field_id: string;
  readonly role: 'connection' | 'source' | 'measurement' | 'load' | 'switch' | 'breaker';
  readonly kind: string;
  /** ABB cell type (SDC | SDF | CBC | SMC | DBC | SDM-V | SDM-C | ...). */
  readonly abb_cell: string;
  readonly on_bus_ref: string;
  /** Anti-fabrication: every element is pinned to the ENM / catalog / standard. */
  readonly source_ref: string;
  /** True ⇒ this is the interface-protection relay (connection field). */
  readonly interface_protection: boolean;
  readonly protection_codes: readonly string[];
  /** Ordered apparatus stack (busbar→cable) for the detailed SN switchgear. */
  readonly apparatus?: readonly OzeApparatus[];
  /** Cable-connection port — the cable docks on this field's cable head. */
  readonly port?: OzePort | null;
}

/** The grid boundary / point of connection (ENEA axis-6 variant, pinned to ENM). */
export interface OzeBoundary {
  readonly variant: 'G-GPZ' | 'G-ZKSN' | 'G-SLUP' | 'G-ZLACZE-POM' | 'G-ZALICZNIK';
  readonly enm_connection_variant: string;
  readonly on_bus_ref: string;
  readonly metered: boolean;
  readonly source_ref: string;
}

export interface SldOzeArchetypeCompanion {
  readonly schema: 'sld_oze_archetype_companion_v1';
  readonly archetype: string;
  readonly enm_hash: string;
  /** Bus_ref of the point of common coupling (PCC). */
  readonly pcc_bus_ref: string;
  readonly source: OzeSourceMeta;
  /** Station idiom — source field + connection field (+ measurement), each pinned. */
  readonly fields: readonly OzeField[];
  /** Grid boundary marker (ENEA variant). */
  readonly boundary: OzeBoundary;
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
