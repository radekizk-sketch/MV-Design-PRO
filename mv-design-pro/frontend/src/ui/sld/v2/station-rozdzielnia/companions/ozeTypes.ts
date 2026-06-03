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

/** Station measurement-bay instrument transformers — the SN connection/metering-bay CT and
 *  VT as STRUCTURED nameplate fields (NOT a pre-formatted ratio string). The SLD composes the
 *  displayed ratio from these and never hard-codes one. Selection (Ipn = next-std ≥ I_load,
 *  Usn, Fv, cores per use) is the STATION WIZARD's job (IEC 61869); here these are the
 *  representative, correct values the wizard would produce, carried as data. */
export interface OzeMeteringCt {
  readonly ipn_a: number; // primary nominal current [A] — next-std ≥ I_load
  readonly isn_a: number; // secondary nominal current [A], per core (1 or 5)
  readonly cores: number; // number of secondary cores → ratio "ipn/isn/isn…"
  readonly type?: string; // optional catalog/type tag (e.g. "AD11")
  readonly accuracy_class?: string; // optional accuracy class
}
export interface OzeMeteringVt {
  readonly usn_v: number; // secondary nominal voltage [V] (line value; phase = usn/√3)
  readonly fv: number; // voltage factor (e.g. 1.9 — compensated network, 8 h)
  readonly accuracy_class?: string; // optional accuracy class
  // The primary is DERIVED from the bus Un (line-to-earth, Un/√3) — deterministic, no field.
  // The VT type tag (e.g. "FD11") is NOT rendered on the cramped metering-bay label.
}
export interface OzeMetering {
  readonly source_ref: string;
  readonly ct?: OzeMeteringCt;
  readonly vt?: OzeMeteringVt;
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

/** BESS storage spec — the ENERGY axis (kWh) alongside the power axis (kW), plus
 *  the bidirectional charge/discharge powers. Present iff the source is storage. */
export interface OzeStorageSpec {
  readonly source_ref: string;
  readonly power_kw: number;
  readonly capacity_kwh: number;
  readonly duration_h: number;
  readonly n_pcs: number;
  readonly pcs_kw: number;
  readonly charge_kw: number;
  readonly discharge_kw: number;
  readonly bidirectional: boolean;
}

/** PV+BESS hybrid spec (canon G4) — a co-located PV generator + battery store. `coupling`
 *  is SN_BUS (common SN busbar, PV and BESS each behind their own transformer) or AC_LV
 *  (AC-coupled: PV inverters + BESS PCS on one LV bus behind one connection transformer).
 *  The power balance uses a coincidence factor for the connection power (wniosek). */
export interface OzeHybridSpec {
  readonly source_ref: string;
  readonly coupling: 'SN_BUS' | 'AC_LV';
  readonly variant_pl: string;
  readonly pv_kw: number;
  readonly bess_kw: number;
  readonly bess_capacity_kwh: number;
  readonly coincidence_factor: number;
  readonly p_export_max_kw: number;
}

/** Wind internal SN COLLECTOR network — the distinguishing structure: n turbines,
 *  each with its own turbine transformer (LV→collector), gathered on a collector bus,
 *  rather than n inverters on one nN bus behind one transformer. Used by both Type 4
 *  (full converter, IBG) and Type 1 (asynchronous generator) wind farms. */
export interface OzeCollectorSpec {
  readonly source_ref: string;
  readonly collector_kv: number;
  readonly n_turbines: number;
  readonly turbine_kw: number;
  readonly turbine_transformer: string;
  readonly turbine_lv_kv: number;
  readonly topology: string;
}

/** Biogas/CHP genset spec — n SYNCHRONOUS machines (IEC 60909-0:2016 §6.3), a FULL
 *  machine SC source behind Z″ (distinct from IBG bounded current). */
export interface OzeGensetSpec {
  readonly source_ref: string;
  readonly sn_kv: number;
  readonly n_gensets: number;
  readonly genset_kw: number;
  readonly xd_subtransient_pu: number;
  readonly cos_phi_r: number;
  /** Generator star-point earthing (resistor/reactor/isolated) — basis for 64/59N + 1f-z. */
  readonly neutral_earthing?: string;
}

/** OZE source metadata (axes T/R/S of the taxonomy). */
/** §5 P0 — OSD neutral-point earthing + IT-system insulation monitoring (IMD). */
export interface OzeGridEarthing {
  readonly source_ref: string;
  readonly neutral_point: string; // izolowana | kompensowana | rezystor | bezpośrednie (TN)
  readonly ik_1f_ka: number; // single-phase earth-fault current at the metered node (SN or nN)
  readonly imd_it_nn: boolean; // IMD on the IT nN system (1st earth fault signalled)
  readonly note_pl: string;
}

/** §5 P1 — dynamic (peak) withstand nameplates (checked beside the thermal Icw). */
export interface OzeWithstand {
  readonly source_ref: string;
  readonly sn_idyn_ka: number;
  readonly nn_idyn_ka: number;
}

/** Audit #5 — MACHINE + rotor-CONVERTER protection (rotating-machine sources). The grid
 *  INTERFACE protection (NC RfG) lives on the connection field's protection_codes, NOT here
 *  (46/47 neg-seq are machine functions, not interface). */
export interface OzeMachineProtection {
  readonly source_ref: string;
  readonly machine: readonly string[];
  readonly converter: readonly string[];
}

export interface OzeSourceMeta {
  readonly technology: string; // PV | BESS | FW | ...
  readonly machine_type: 'IBG' | 'SYNCHRONOUS' | 'ASYNCHRONOUS' | 'DFIG';
  readonly nc_rfg_class: string; // A | B | C | D
  readonly control_mode: string; // cosφ=const | Q=const | cosφ(P) | Q(U) | P(f)
  /** Gate I — protection function codes (real names from the doc), per device. */
  readonly protection_codes: readonly string[];
  /** Audit #5 — machine + rotor-converter protection (rotating machines: DFIG, ...). */
  readonly protection?: OzeMachineProtection;
  readonly power_hierarchy: OzePowerHierarchy;
  /** Present iff this template is distilled from a real reference schematic. */
  readonly schematic?: OzeSchematic;
  /** SN measurement-bay CT/VT nameplates (structured) — the SLD reads these to render the
   *  instrument ratios; it never hard-codes one. Filled by the station wizard (IEC 61869). */
  readonly metering?: OzeMetering;
  /** Protection coordination matrix (click-module content, not on the canvas). */
  readonly coordination?: OzeCoordination;
  /** §5 P0 — OSD neutral-point earthing (drives Ik″1f-z SN) + IMD on the IT nN system. */
  readonly grid_earthing?: OzeGridEarthing;
  /** §5 P1 — dynamic (peak) withstand ratings checked beside the thermal Icw. */
  readonly withstand?: OzeWithstand;
  /** True ⇒ the source is bidirectional (BESS — charge ⇄ discharge). */
  readonly bidirectional?: boolean;
  /** Storage spec (BESS) — the energy axis (kWh) alongside the power axis (kW). */
  readonly storage?: OzeStorageSpec;
  /** Hybrid spec (PV+BESS, canon G4) — the coupling variant + the power balance. */
  readonly hybrid?: OzeHybridSpec;
  /** Collector spec (Wind) — the internal SN collector network. */
  readonly collector?: OzeCollectorSpec;
  /** Genset spec (biogas/CHP) — synchronous machines behind Z″ (§6.3). */
  readonly genset?: OzeGensetSpec;
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

/** One rotating machine's partial SC contribution (IEC 60909-0:2016 §6.6) — present
 *  only for SYNCHRONOUS/ASYNCHRONOUS sources, absent for IBG. */
export interface OzeMachinePartial {
  readonly source_id: string;
  readonly node_ref: string;
  readonly ikss_partial_ka: number;
  /** Symmetrical breaking current i_b = μ·(q)·I″k of this machine. */
  readonly ib_partial_ka: number;
  readonly mu: number;
  readonly q: number;
  readonly ir_a: number;
}

/** SC contribution breakdown by machine type (gate J). For IBG only the bounded-current
 *  fields are set; for a SYNCHRONOUS/ASYNCHRONOUS machine the §6.6 breaking current and
 *  the per-machine breakdown are added. */
export interface OzeSourceContribution {
  readonly machine_type: string;
  readonly model: string;
  readonly ik_contribution_ka: number;
  /** Gate J flag: an IBG is NOT modelled as a synchronous machine. */
  readonly is_synchronous_machine: boolean;
  /** Symmetrical breaking current Σi_b [kA] (rotating machines only, §6.6). */
  readonly ib_contribution_ka?: number;
  /** Minimum time delay t_min [s] used for i_b (§6.6). */
  readonly t_min_s?: number;
  /** Small-motor omission flag (§6.6) — asynchronous machines only. */
  readonly motors_negligible?: boolean;
  /** Per-machine breakdown (rotating machines only). */
  readonly machines?: readonly OzeMachinePartial[];
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
  readonly role: 'connection' | 'source' | 'measurement' | 'load' | 'switch' | 'breaker' | 'transformer';
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
