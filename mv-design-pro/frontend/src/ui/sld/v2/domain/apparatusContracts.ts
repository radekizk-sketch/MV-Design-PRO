/**
 * SLD V2 — Kontrakty aparatów (Phase 0A).
 *
 * Migracja z V1 `src/ui/sld/core/fieldDeviceContracts.ts`. V2 trzyma
 * minimalny operator-grade kontrakt potrzebny do rendererów; pełen
 * walidator wymagań pól przeniesie się do osobnego modułu wraz z
 * Phase 1 (visual canon expansion).
 *
 * Reguła Acceptance Invariant nr 2: każdy element wizualny aparatu ma
 * `domain_ref` i `apparatus_kind` jest zwrotne do ENM `BayPrimaryDevice`.
 */

import type { BayPrimaryDeviceKind } from '../../../../types/enm';

// =============================================================================
// 1. ApparatusKind — kanoniczne 12 typów (V2)
// =============================================================================

/**
 * 12 typów aparatów rozpoznawanych przez SLD V2.
 *
 * Mirror `BayPrimaryDeviceKind` z ENM, plus `LV_BREAKER` i `SURGE_ARRESTER`
 * jawnie wydzielone (operator-grade — w V1 chowane były pod `LOAD_SWITCH`).
 *
 * Nie używaj kodów V1 (`LINE_IN`, `TRANSFORMATOROWE`); używaj `BayCanonicalRole`
 * z ENM dla ról pól. Ten enum dotyczy aparatów, nie pól.
 */
export const APPARATUS_KIND = {
  CIRCUIT_BREAKER: 'circuit_breaker',
  SWITCH_DISCONNECTOR: 'switch_disconnector',
  DISCONNECTOR: 'disconnector',
  EARTHING_SWITCH: 'earthing_switch',
  FUSE: 'fuse',
  CT: 'ct',
  VT: 'vt',
  SURGE_ARRESTER: 'surge_arrester',
  TRANSFORMER: 'transformer',
  LV_BREAKER: 'lv_breaker',
  CABLE_HEAD: 'cable_head',
  METERING_CUBICLE: 'metering_cubicle',
} as const;

export type ApparatusKind = (typeof APPARATUS_KIND)[keyof typeof APPARATUS_KIND];

export const ALL_APPARATUS_KINDS: readonly ApparatusKind[] = Object.values(APPARATUS_KIND);

/** Polskie etykiety aparatów dla UI (operator-grade). */
export const APPARATUS_KIND_LABELS_PL: Readonly<Record<ApparatusKind, string>> = {
  circuit_breaker: 'Wyłącznik',
  switch_disconnector: 'Rozłącznik',
  disconnector: 'Odłącznik',
  earthing_switch: 'Uziemnik',
  fuse: 'Bezpiecznik',
  ct: 'Przekładnik prądowy',
  vt: 'Przekładnik napięciowy',
  surge_arrester: 'Ogranicznik przepięć',
  transformer: 'Transformator',
  lv_breaker: 'Wyłącznik nN',
  cable_head: 'Głowica kablowa',
  metering_cubicle: 'Pole pomiarowe',
};

/**
 * Mapowanie ENM `BayPrimaryDeviceKind` → V2 `ApparatusKind`.
 *
 * Nie wszystkie ENM kindy mapują się 1:1 (np. `GENERATOR_PV/BESS/FW` to
 * DER, nie aparat pola; mapują się na `null` i są obsługiwane przez
 * DerRenderer). Używamy tej tabeli w `BayRenderer` przy parsowaniu
 * `BayPrimaryDevice[]` z ENM.
 */
export const BAY_PRIMARY_DEVICE_TO_APPARATUS: Readonly<
  Record<BayPrimaryDeviceKind, ApparatusKind | null>
> = {
  CB: APPARATUS_KIND.CIRCUIT_BREAKER,
  LOAD_SWITCH: APPARATUS_KIND.SWITCH_DISCONNECTOR,
  DS: APPARATUS_KIND.DISCONNECTOR,
  ES: APPARATUS_KIND.EARTHING_SWITCH,
  CT: APPARATUS_KIND.CT,
  VT: APPARATUS_KIND.VT,
  CABLE_HEAD: APPARATUS_KIND.CABLE_HEAD,
  TRANSFORMER_DEVICE: APPARATUS_KIND.TRANSFORMER,
  FUSE: APPARATUS_KIND.FUSE,
  // DER device kinds: rendered by DerRenderer, not BayRenderer.
  GENERATOR_PV: null,
  GENERATOR_BESS: null,
  GENERATOR_FW: null,
  PCS: null,
  BATTERY: null,
};

// =============================================================================
// 2. FieldRole — kanoniczne role pól (mirror ENM)
// =============================================================================

/**
 * Rola pola rozdzielczego.
 *
 * Mirror `BayCanonicalRole` z ENM, ale wykluczamy DER role (`PV_SN`, `BESS_SN`,
 * `FW_SN`) bo DER ma własny renderer. Plus `GPZ_LINE_BAY` jako podtyp
 * `LINIA_OUT` dla GPZ-specific renderingu.
 */
export const FIELD_ROLE = {
  LINE_IN: 'LINE_IN',
  LINE_OUT: 'LINE_OUT',
  LINE_BRANCH: 'LINE_BRANCH',
  TRANSFORMER: 'TRANSFORMER',
  COUPLER: 'COUPLER',
  MEASUREMENT: 'MEASUREMENT',
  GPZ_LINE_BAY: 'GPZ_LINE_BAY',
  RMU_LINE: 'RMU_LINE',
  RMU_TRANSFORMER: 'RMU_TRANSFORMER',
  DER_PV: 'DER_PV',
  DER_BESS: 'DER_BESS',
  DER_FW: 'DER_FW',
} as const;

export type FieldRole = (typeof FIELD_ROLE)[keyof typeof FIELD_ROLE];

export const ALL_FIELD_ROLES: readonly FieldRole[] = Object.values(FIELD_ROLE);

/** Czy pole leży na torze SN. */
export function isSnFieldRole(role: FieldRole): boolean {
  return (
    role === FIELD_ROLE.LINE_IN ||
    role === FIELD_ROLE.LINE_OUT ||
    role === FIELD_ROLE.LINE_BRANCH ||
    role === FIELD_ROLE.TRANSFORMER ||
    role === FIELD_ROLE.COUPLER ||
    role === FIELD_ROLE.MEASUREMENT ||
    role === FIELD_ROLE.GPZ_LINE_BAY ||
    role === FIELD_ROLE.RMU_LINE ||
    role === FIELD_ROLE.RMU_TRANSFORMER ||
    role === FIELD_ROLE.DER_PV ||
    role === FIELD_ROLE.DER_BESS ||
    role === FIELD_ROLE.DER_FW
  );
}

/** Mapowanie ENM `Bay.bay_role` (raw enum) → kanoniczne `FieldRole`. */
export const ENM_BAY_ROLE_TO_FIELD_ROLE: Readonly<
  Record<'IN' | 'OUT' | 'TR' | 'COUPLER' | 'FEEDER' | 'MEASUREMENT' | 'OZE', FieldRole>
> = {
  IN: FIELD_ROLE.LINE_IN,
  OUT: FIELD_ROLE.LINE_OUT,
  TR: FIELD_ROLE.TRANSFORMER,
  COUPLER: FIELD_ROLE.COUPLER,
  FEEDER: FIELD_ROLE.LINE_OUT,
  MEASUREMENT: FIELD_ROLE.MEASUREMENT,
  // OZE jest renderowane przez DerRenderer; tutaj fallback na LINE_OUT
  // dla pola łącznikowego między DER a stacją (gdy używamy klasycznego
  // pola SN do przyłączenia DER w wariancie DEDICATED_MV_CONNECTION).
  OZE: FIELD_ROLE.DER_PV,
};

// =============================================================================
// 3. ApparatusInstance — instancja aparatu na potrzeby renderingu
// =============================================================================

/**
 * Instancja aparatu w polu (operator-grade input dla `BayRenderer`).
 *
 * Wszystkie pola są deterministyczne i `domain_ref` traceable — zgodnie z
 * Cardinal Rule planu (zasada nadrzędna).
 */
export interface ApparatusInstance {
  /** Stabilne ID (ENM `BayPrimaryDevice.device_ref`). */
  readonly id: string;
  /** Typ aparatu (12 kanonicznych). */
  readonly kind: ApparatusKind;
  /** Domain ref do aparatu w ENM (najczęściej == `id`). */
  readonly domainRef: string;
  /** Optional catalog ref (V2 wymusza catalog binding w produkcji). */
  readonly catalogRef: string | null;
  /** Etykieta inżynierska, np. "Q0", "Q1", "Q9", "T1" (Q-numeracja). */
  readonly designation: string;
  /** Czy aparat jest sterowalny (CB, DS, ES — `is_controllable`). */
  readonly isControllable: boolean;
}
