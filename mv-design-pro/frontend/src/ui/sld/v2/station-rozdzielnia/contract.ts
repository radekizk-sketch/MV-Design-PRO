/**
 * STACJA-ROZDZIELNIA SN — typed contract (KROK 1, bottom-up SLD rebuild).
 *
 * GOVERNING PRINCIPLE (anti-guessing / "second truth: picture ≠ ENM"):
 * every descriptor here is a 1:1 PROJECTION of an ENM canonical type — the
 * picture is built FROM the model, never painted over emptiness:
 *
 *   - `StationFieldDescriptor.role`     ← ENM `BayCanonicalRole`
 *       (`models.py:1014-1024` / `types/enm.ts:372`):
 *       LINIA_IN / LINIA_OUT / TRANSFORMATOROWE / LINIA_ODG / SPRZEGLO /
 *       POMIAROWE  — EXACTLY the six roles this unit renders. The ENM ALSO
 *       carries this taxonomy on `SNFieldSpec.field_role` (the catalog-bound
 *       domain op that *creates* SN fields, `domain_ops_models.py:347-353`),
 *       so the role set is model-truth on both the read and the write side.
 *       → NO model extension was needed.
 *   - `StationApparatus`                ← ENM `BayPrimaryDevice`
 *       (`models.py:764-789` / `types/enm.ts:439`): kind + `switch_state`.
 *   - `StationApparatus.switchState`    ← ENM `BaySwitchState.actual_state`
 *       (`models.py:738-746`) mapped to the renderer's tri-state.
 *   - `StationProtectionFunction`       ← ENM `ProtectionFunctionState`
 *       (`models.py:861-883` / `types/enm.ts:515`), carried by a bay's
 *       `BayProtectionControlUnit.functions` (`models.py:926-940`).
 *
 * The component is a RESPONSIVE unit driven by this contract (one geometry
 * source, typed per role) — controlled internal layout, NOT a content-based
 * tangle. The power-flow arrow direction is READ from the frozen-solver
 * companion (`SldPowerFlowCompanion`), never re-derived here (P-A, one truth).
 */

import type {
  BayCanonicalRole,
  BayPrimaryDeviceKind,
  BayDeviceState,
} from '../../../../types/enm';
import type {
  EarthingSwitchState,
  GpzApparatusSwitchState,
} from '../renderer/GpzSwitchgearTypes';
import type { AbbCellType } from './abbFieldLibrary';
import type { SldShortCircuitCompanion } from './companions/shortCircuitTypes';
import type { SldVoltageFlowCompanion } from './companions/voltageFlowTypes';

// =============================================================================
// Archetype (T1-T4 network-station archetypes)
// =============================================================================

/**
 * The four canonical MV network-station archetypes (KROK 1 scope).
 * Each maps to an ENM `Substation.station_type` (`models.py:653-662`):
 *   - T1 PRZELOTOWA  → station_type 'inline'    (LINIA_IN + LINIA_OUT [+ TR])
 *   - T2 KOŃCOWA     → station_type 'terminal'  (LINIA_IN + TRANSFORMATOROWE)
 *   - T3 ODGAŁĘŹNA    → station_type 'branch'    (LINIA_IN + LINIA_OUT + LINIA_ODG)
 *   - T4 SPRZĘGŁOWA   → station_type 'sectional' (SPRZEGLO + a normally-open point)
 */
export type StationArchetype = 'T1' | 'T2' | 'T3' | 'T4';

export const STATION_ARCHETYPE_TYPE_PL: Readonly<Record<StationArchetype, string>> = {
  T1: 'przelotowa',
  T2: 'końcowa',
  T3: 'ZKSN — złącze kablowe', // a cable junction (1×WE + n×WY), not a station
  T4: 'sekcyjna (sprzęgło SMC)',
};

/** ENM `Substation.station_type` per archetype (model-truth binding). */
export const STATION_ARCHETYPE_STATION_TYPE: Readonly<Record<StationArchetype, string>> = {
  T1: 'inline',
  T2: 'terminal',
  T3: 'branch',
  T4: 'sectional',
};

// =============================================================================
// Field role — projection of ENM BayCanonicalRole
// =============================================================================

/**
 * The six SN field roles this unit renders (subset of `BayCanonicalRole`,
 * excluding DER roles PV_SN/BESS_SN/FW_SN which are KROK 2 / OZE — out of
 * scope here). 1:1 with the ENM enum value.
 */
export type StationFieldRole =
  | 'LINIA_IN'
  | 'LINIA_OUT'
  | 'TRANSFORMATOROWE'
  | 'LINIA_ODG'
  | 'SPRZEGLO'
  | 'POMIAROWE';

/** The role is literally an ENM `BayCanonicalRole` — compile-time proof. */
const _roleIsCanonical: StationFieldRole extends BayCanonicalRole ? true : never = true;
void _roleIsCanonical;

/** Short dispatcher tag shown on far/closer zoom (owner spec: IN/OUT/TR/FEEDER/COUPLER/POMIAR). */
export const FIELD_ROLE_SHORT_TAG: Readonly<Record<StationFieldRole, string>> = {
  LINIA_IN: 'WE',
  LINIA_OUT: 'WY',
  TRANSFORMATOROWE: 'TR',
  LINIA_ODG: 'ODG',
  SPRZEGLO: 'SPR',
  POMIAROWE: 'POM',
};

// =============================================================================
// Field role vocabulary — THE canon of SN field role names (karta #141)
// =============================================================================

/**
 * Full Polish label of an SN field role — the ONE vocabulary of the whole product (wizard,
 * schematic, drawer, context panel, bay-template catalog, exports, results). Mirrored by the
 * backend canon `backend/src/enm/rola_pola_sn.py::NAZWA_ROLI_POLA_SN_PL` (parity pinned by
 * `backend/tests/enm/test_nazwy_pol_bez_kodow.py`). Every other role vocabulary (model
 * `Bay.bay_role` IN/OUT/FEEDER/TR/COUPLER/MEASUREMENT/OZE, catalog `BayKind`, SLD roles) maps
 * to a canonical role FIRST and takes its label from here — no second list of Polish role
 * labels anywhere else (guard: `backend/tests/ci/test_etykiety_rol_pol_sn.py`).
 */
export const FIELD_ROLE_LABEL_PL: Readonly<Record<BayCanonicalRole, string>> = {
  LINIA_IN: 'Pole liniowe wejściowe',
  LINIA_OUT: 'Pole liniowe wyjściowe',
  TRANSFORMATOROWE: 'Pole transformatorowe',
  LINIA_ODG: 'Pole odgałęźne',
  SPRZEGLO: 'Pole sprzęgła',
  POMIAROWE: 'Pole pomiarowe',
  PV_SN: 'Pole źródłowe PV',
  BESS_SN: 'Pole źródłowe BESS',
  FW_SN: 'Pole źródłowe FW',
};

/** Source field whose technology is not known (model role `OZE`). */
export const FIELD_SOURCE_LABEL_PL = 'Pole źródłowe SN';

/** Field without a role or with a role outside the canon — generic name, no role guessing. */
export const FIELD_GENERIC_LABEL_PL = 'Pole SN';

/**
 * Model field role (`Bay.bay_role`, `field_specs[].bay_role`) → canonical role. Mirror of the
 * backend alias map `ROLA_POLA_SN_Z_ALIASU` (parity pinned by the same backend test). The model
 * source role `OZE` has NO canonical role: its technology is known only from the generator.
 */
export const MODEL_BAY_ROLE_TO_CANONICAL: Readonly<Record<string, BayCanonicalRole>> = {
  IN: 'LINIA_IN',
  OUT: 'LINIA_OUT',
  FEEDER: 'LINIA_ODG',
  TR: 'TRANSFORMATOROWE',
  COUPLER: 'SPRZEGLO',
  MEASUREMENT: 'POMIAROWE',
};

const MODEL_SOURCE_ROLE = 'OZE';

function normalizedRole(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

function isCanonicalRole(role: string): role is BayCanonicalRole {
  return Object.prototype.hasOwnProperty.call(FIELD_ROLE_LABEL_PL, role);
}

/**
 * Canonical role of a field given canonically (`LINIA_IN`) or by a model alias (`IN`, also
 * lower case — SLD internal ids use `in`/`tr`/…). `null` = empty role, source role without a
 * known technology (`OZE`) or a role outside the canon — the function never guesses.
 */
export function canonicalFieldRole(raw: string | null | undefined): BayCanonicalRole | null {
  const role = normalizedRole(raw);
  if (isCanonicalRole(role)) return role;
  return MODEL_BAY_ROLE_TO_CANONICAL[role] ?? null;
}

/** Is the role a source (generation) field: model `OZE` or `PV_SN`/`BESS_SN`/`FW_SN`. */
export function isSourceFieldRole(raw: string | null | undefined): boolean {
  const role = normalizedRole(raw);
  return role === MODEL_SOURCE_ROLE || role === 'PV_SN' || role === 'BESS_SN' || role === 'FW_SN';
}

/** Canon label of the role, or `null` when the role is empty or outside the canon. */
export function fieldRoleLabelOrNullPl(raw: string | null | undefined): string | null {
  if (normalizedRole(raw) === MODEL_SOURCE_ROLE) return FIELD_SOURCE_LABEL_PL;
  const role = canonicalFieldRole(raw);
  return role ? FIELD_ROLE_LABEL_PL[role] : null;
}

/** Canon label of the role; empty role or role outside the canon → generic „Pole SN”. */
export function fieldRoleLabelPl(raw: string | null | undefined): string {
  return fieldRoleLabelOrNullPl(raw) ?? FIELD_GENERIC_LABEL_PL;
}

/**
 * Dispatcher tag of the role (`FIELD_ROLE_SHORT_TAG`: WE/WY/TR/ODG/SPR/POM) for a role given
 * canonically or by a model alias; `null` for source fields and roles outside the canon — the
 * role code itself (`OUT`, `LINIA_OUT`) is never shown in its place.
 */
export function fieldRoleShortTagPl(raw: string | null | undefined): string | null {
  const role = canonicalFieldRole(raw);
  return role && Object.prototype.hasOwnProperty.call(FIELD_ROLE_SHORT_TAG, role)
    ? FIELD_ROLE_SHORT_TAG[role as StationFieldRole]
    : null;
}

/** The same label inside a sentence („Pole sprzęgła” → „pole sprzęgła”). */
export function fieldLabelInSentencePl(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** Plural of a canon label („Pole transformatorowe” → „Pola transformatorowe”). */
export function fieldLabelPluralPl(label: string): string {
  return label.replace(/^Pole /, 'Pola ');
}

// =============================================================================
// Apparatus — projection of ENM BayPrimaryDevice
// =============================================================================

export type StationSwitchState = GpzApparatusSwitchState; // 'closed' | 'open' | 'unknown'

/**
 * One apparatus in a field — a projection of ENM `BayPrimaryDevice`
 * (`types/enm.ts:439`). `kind` is the ENM `BayPrimaryDeviceKind`; `switchState`
 * is derived from `BaySwitchState.actual_state` for switching devices.
 */
export interface StationApparatus {
  /** ENM `BayPrimaryDevice.device_ref`. */
  readonly deviceRef: string;
  /** ENM `BayPrimaryDevice.kind`. */
  readonly kind: BayPrimaryDeviceKind;
  /** IEC 81346-2 designation (Q0/Q1/Q9/T1…), if assigned. */
  readonly designation?: string;
  /** Switching state for CB/DS/LOAD_SWITCH (from `BaySwitchState.actual_state`). */
  readonly switchState?: StationSwitchState;
  /** Earthing-switch state for ES. */
  readonly earthingState?: EarthingSwitchState;
  /** Catalog reference (close-zoom label slot). */
  readonly catalogLabel?: string;
}

/**
 * Map ENM `BaySwitchState.actual_state` → renderer tri-state.
 * Pure projection (no guessing): unknown/awaria → 'unknown'.
 */
export function switchStateFromActual(
  actual: BayDeviceState | null | undefined,
): StationSwitchState {
  switch (actual) {
    case 'zamkniety':
      return 'closed';
    case 'otwarty':
      return 'open';
    case 'zamkniety_naped_rozbrojony':
      return 'closed';
    case 'otwarty_naped_rozbrojony':
      return 'open';
    default:
      return 'unknown';
  }
}

// =============================================================================
// Protection function — projection of ENM ProtectionFunctionState
// =============================================================================

/**
 * A protection function bound to a field's breaker — projection of ENM
 * `ProtectionFunctionState` (`types/enm.ts:515`). `code` is the ANSI/IEC
 * device number string (e.g. "50", "51", "50N", "67", "27", "59").
 */
export interface StationProtectionFunction {
  /** ANSI/IEC function code, e.g. "50", "51", "50N", "51N", "67", "67N", "27", "59". */
  readonly code: string;
  readonly available: boolean;
  readonly enabled: boolean;
  /** Live pickup state (overlay), if known. */
  readonly pickedUp?: boolean;
  readonly tripped?: boolean;
}

// =============================================================================
// Field descriptor (typed per role — the unit of the rozdzielnia)
// =============================================================================

/**
 * One switchgear field (pole) of the station-rozdzielnia. Built FROM an ENM
 * `Bay` (canonical model): role + apparatus stack + protection + a stable
 * branch ref used to look up the solver flow direction.
 */
export interface StationFieldDescriptor {
  /** Stable id (ENM `Bay.ref_id`). Used for click → config + power-flow lookup. */
  readonly fieldId: string;
  /** Canonical role (ENM `BayCanonicalRole`). */
  readonly role: StationFieldRole;
  /** Dispatcher field number ("10", "23/1"), if assigned. */
  readonly bayNumber?: string;
  /** Short feeder name ("SADY"), if assigned. */
  readonly feederName?: string;
  /** Apparatus on the field's power path, ordered bus→cable (`BayPrimaryDevice[]`). */
  readonly apparatus: readonly StationApparatus[];
  /** Protection functions bound to the field breaker (per applicability). */
  readonly protection: readonly StationProtectionFunction[];
  /**
   * ENM branch `ref_id` whose solver flow gives THIS field's power direction.
   * The renderer reads the companion (one truth) — it never re-derives sign.
   * Absent for fields with no associated branch (e.g. a measurement field).
   */
  readonly branchRef?: string;
  /**
   * NORMALLY-OPEN POINT marker (T4 sekcyjna). When true the field is the open
   * point of the run — rendered distinctly (open state + NOP badge). Solver
   * truth: this field's `branchRef` is in `companion.open_point_branch_refs`.
   */
  readonly isNormallyOpen?: boolean;
  /**
   * ABB UniSwitch cell type for this field (catalog §4 "Rodzaje pól"). Derived
   * from {@link classifyAbbCellType} over role + apparatus. Optional so legacy
   * descriptors remain valid; archetype builders always populate it.
   */
  readonly abbCellType?: AbbCellType;
}

// =============================================================================
// nN tier (second voltage level) — transformer + nN busbar + feeders + PV
// =============================================================================

/**
 * The nN-side block of a transformer station (STEP 2). It is a SECOND voltage
 * level: an nN busbar fed by the SN/nN transformer through the nN main breaker,
 * with outgoing feeders (ODPLYW_NN) carrying load and an optional PV field
 * (ZRODLO_NN_PV) that backfeeds the bus. Mirrors the ENM `NNBlockSpec` /
 * `NNFeederSpec` taxonomy (domain_ops_models.py).
 *
 * Per the ZERO-SECOND-TRUTH rule, NO power values live here — the renderer reads
 * each feeder's / PV's active power and direction from the frozen-solver
 * companion via `branchRef`.
 */
export interface StationNNFeeder {
  /** Stable id (click target). */
  readonly feederId: string;
  /** nN feeder role (ENM `NNFeederSpec.feeder_role`). */
  readonly role: 'ODPLYW_NN' | 'ODPLYW_REZERWOWY' | 'ZRODLO_NN_PV' | 'ZRODLO_NN_BESS';
  /** Short feeder name. */
  readonly feederName?: string;
  /**
   * ENM branch `ref_id` whose solver flow gives THIS feeder's power + direction.
   * The renderer reads the companion (one truth) — never re-derives it.
   */
  readonly branchRef: string;
}

/** SN/nN transformer descriptor (vector group + tap shown on the boundary). */
export interface StationTransformer {
  readonly deviceRef: string;
  /** Vector group (e.g. "Dyn5"). */
  readonly vectorGroup: string;
  /** Rated power label (e.g. "630 kVA"). */
  readonly ratingLabel?: string;
  /** Whether an on-load tap changer is present (ENM `TransformerSpec.tap_changer_present`). */
  readonly tapChanger?: boolean;
}

/** The nN-side block: busbar (second voltage) + transformer + feeders + PV. */
export interface StationNNBlock {
  /** nN busbar nominal voltage [kV] (distinct colour/weight from the SN bus). */
  readonly busVoltageKv: number;
  /** SN/nN transformer feeding this nN bus. */
  readonly transformer: StationTransformer;
  /** Branch ref of the SN-side transformer feeder (joins the SN TR field flow). */
  readonly transformerBranchRef: string;
  /** nN main breaker device ref (between transformer and nN bus). */
  readonly mainBreakerRef: string;
  /** Outgoing nN feeders (loads) + optional PV source field. */
  readonly feeders: readonly StationNNFeeder[];
  /** SC bus_ref for the nN busbar — looks up `model.shortCircuit.buses`. */
  readonly scBusRef?: string;
}

// =============================================================================
// Station-rozdzielnia model (one geometry source consumes this)
// =============================================================================

/**
 * How the model is drawn. 'station' = a switchgear busbar with field columns
 * (T1/T2/T4). 'zksn' = a `BranchPointSN` projection (T3): a cable junction with
 * line fields on MAIN_IN/MAIN_OUT/BRANCH, NO transformer/nN, NO wide busbar.
 */
export type StationProjection = 'station' | 'zksn';

/**
 * The full typed model of ONE station-rozdzielnia SN. The geometry source and
 * the component both consume THIS — there is no second data store.
 */
export interface StationRozdzielniaModel {
  readonly stationId: string;
  readonly archetype: StationArchetype;
  /** Display name (Polish). */
  readonly name: string;
  /** Dispatcher station code (S01…), if assigned. */
  readonly stationCode?: string;
  /** Render projection (default 'station'). 'zksn' = cable-junction projection. */
  readonly projection?: StationProjection;
  /**
   * For a ZKSN/branch-point projection: the ENM `BranchPointSN.branch_point_type`.
   * BL-01: 'zksn' is cable-only; BL-02: 'branch_pole' is overhead-only.
   */
  readonly branchPointType?: 'zksn' | 'branch_pole';
  /** SN busbar nominal voltage [kV] (tints the busbar per dispatcher convention). */
  readonly busVoltageKv: number;
  /** Fields by canonical role, in dispatcher order (left→right on the busbar). */
  readonly fields: readonly StationFieldDescriptor[];
  /** Active case ref (state declaration the companion was solved on). */
  readonly caseRef?: string;
  readonly caseLabel?: string;
  /**
   * nN-side block (STEP 2): present for transformer stations (T1/T2). The SN
   * TRANSFORMATOROWE field feeds this; the nN busbar is a second voltage level
   * with feeders + optional PV. Absent for non-transformer archetypes (T3/T4).
   */
  readonly nnBlock?: StationNNBlock;
  /**
   * Sectioned busbar (T4 sekcyjna): the SPRZEGLO field is an ABB SMC coupler
   * that splits the busbar into two independently-energised sections (CIĄG A
   * left of the coupler, CIĄG B right). When set, the renderer draws TWO busbar
   * segments (each energised per its own incomer in the companion) and the
   * coupler as TWO cells: a CBC cell (wyłącznik Q1 + rozłącznik 3-poł. Q2) and a
   * BRC cell (rozłącznik 3-poł. wznios Q3) bridging A↔B.
   */
  readonly sectionedBus?: boolean;
  /** Branch ref energising bus section A (left). Read from the companion. */
  readonly sectionABranchRef?: string;
  /** Branch ref energising bus section B (right). Read from the companion. */
  readonly sectionBBranchRef?: string;
  /**
   * Frozen-solver IEC 60909 short-circuit dossier (gate E). The renderer reads
   * per-busbar Ik''max/min + ip/ib/ith + Icw verification + White Box from here
   * on L2 — it never recomputes a short circuit. Keyed by SC bus_ref.
   */
  readonly shortCircuit?: SldShortCircuitCompanion;
  /** SC bus_ref for the (main / section-A) SN busbar — looks up `shortCircuit.buses`. */
  readonly snBusScRef?: string;
  /** SC bus_ref for the section-B SN busbar (T4). */
  readonly snBusBScRef?: string;
  /**
   * Frozen-solver Newton-Raphson voltage + power-flow dossier (gate F). The
   * renderer reads per-busbar U [kV/p.u./%] and per-branch I/P/Q/S + loading from
   * here on L2 — it never recomputes a power flow. The SN/nN SC bus refs above
   * double as the VF bus refs (same node ids).
   */
  readonly voltageFlow?: SldVoltageFlowCompanion;
}
