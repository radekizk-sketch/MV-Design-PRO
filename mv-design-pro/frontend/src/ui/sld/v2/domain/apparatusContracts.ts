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

import type { BayPrimaryDeviceKind, BayPrimaryPlacement } from '../../../../types/enm';
import { FIELD_ROLE_LABEL_PL } from '../station-rozdzielnia/contract';

// =============================================================================
// 0. Porządek fizyczny aparatów pola wg `placement` (jedno źródło prawdy)
// =============================================================================

/**
 * Kolejność położeń aparatu pola: tor szeregowy od szyny (UPSTREAM →
 * MIDSTREAM → DOWNSTREAM), potem aparaty boczne (OFF_PATH, GROUND_BRANCH).
 *
 * W2C-PLAN-ETYKIET (reguła KLASA §3 „predykaty parami"): porządek ustalał
 * dotąd WYŁĄCZNIE adapter (`v2/canvas/enmToSldAdapter.ts`
 * `projectBayPrimaryDevices`), a kompozycja SLD v3 (`compose/apparatusSequence.ts`,
 * `compose/station.ts`) jedynie ZAKŁADAŁA w komentarzu, że dostaje sekwencję
 * już posortowaną. Sekwencja niesortowana (kolejność surowa backendu
 * [DS, CB, CT, VT, DS, ES, SA, głowica]) rozkładała aparaty boczne na RÓŻNE
 * kotwice toru, a te dzieliły jedną kolumnę X — identyfikator „TV1" spod
 * przekładnika lądował wtedy na symbolu uziemnika. Obie strony pary czytają
 * teraz TĘ funkcję, więc kolejność nie zależy od tego, kto zbudował deskryptor.
 */
export const PRIMARY_DEVICE_PLACEMENT_ORDER: Readonly<Record<BayPrimaryPlacement, number>> = {
  UPSTREAM: 0,
  MIDSTREAM: 1,
  DOWNSTREAM: 2,
  OFF_PATH: 3,
  GROUND_BRANCH: 4,
};

/**
 * Aparaty pola posortowane wg `placement` (`PRIMARY_DEVICE_PLACEMENT_ORDER`)
 * ze stabilnym rozstrzygnięciem remisu = kolejność źródłowa. Funkcja czysta,
 * idempotentna (sekwencja już posortowana wraca w tej samej kolejności).
 */
export function orderByPrimaryPlacement<T extends { readonly placement: BayPrimaryPlacement }>(
  devices: readonly T[],
): T[] {
  return devices
    .map((device, sourceIndex) => ({ device, sourceIndex }))
    .sort((a, b) => {
      const placementDelta =
        PRIMARY_DEVICE_PLACEMENT_ORDER[a.device.placement] - PRIMARY_DEVICE_PLACEMENT_ORDER[b.device.placement];
      return placementDelta !== 0 ? placementDelta : a.sourceIndex - b.sourceIndex;
    })
    .map(({ device }) => device);
}

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
  metering_cubicle: FIELD_ROLE_LABEL_PL.POMIAROWE,
};

/**
 * Mapowanie ENM `BayPrimaryDeviceKind` → V2 `ApparatusKind`.
 *
 * Nie wszystkie ENM kindy mapują się 1:1 (np. `GENERATOR_PV/BESS/FW` to
 * DER, nie aparat pola; mapują się na `null` — źródło rysuje glif źródła
 * z `v3/compose/sourceKind.ts`, nie symbol aparatu pola).
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
  // F9.6 (SLD_CAD_SPEC_V3 §12.5, V12K-028): SA rysowany WYŁĄCZNIE z danych.
  SURGE_ARRESTER: APPARATUS_KIND.SURGE_ARRESTER,
  // Rodzaje DER: glif źródła (`v3/compose/sourceKind.ts`), nie symbol aparatu pola.
  GENERATOR_PV: null,
  GENERATOR_BESS: null,
  GENERATOR_FW: null,
  PCS: null,
  BATTERY: null,
  // GPZ-H5-APARATURA (ENEA Zeszyt 1 §13, §16, §17): odłącznik trójpołożeniowy rysowany
  // symbolem odłącznika (jego uziemnik niesie `earthing_role`), transformator uziemiający —
  // symbolem transformatora. Wskaźnik napięcia, dławik gaszący, rezystor uziemiający
  // i bateria kondensatorów nie mają symbolu aparatu pola w zbiorze v2 (`null` = brak
  // symbolu aparatu, nie domysł innego symbolu).
  DS_ES: APPARATUS_KIND.DISCONNECTOR,
  VOLTAGE_INDICATOR: null,
  EARTHING_TRANSFORMER: APPARATUS_KIND.TRANSFORMER,
  NEUTRAL_REACTOR: null,
  NEUTRAL_RESISTOR: null,
  CAPACITOR_BANK: null,
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
  /** Pole zespołu uziemiającego (ZU) — pole funkcyjne sekcji SN (`Bay.bay_role = 'EARTHING'`,
   *  ENEA Zeszyt 1 §13, zał. Z.2). Własna rola: dawniej zlewana z polem liniowym. */
  EARTHING: 'EARTHING',
  /** Pole baterii kondensatorów (BKR) — pole funkcyjne sekcji SN (`Bay.bay_role = 'CAPACITOR'`). */
  CAPACITOR: 'CAPACITOR',
  GPZ_LINE_BAY: 'GPZ_LINE_BAY',
  RMU_LINE: 'RMU_LINE',
  RMU_TRANSFORMER: 'RMU_TRANSFORMER',
  DER_PV: 'DER_PV',
  DER_BESS: 'DER_BESS',
  DER_FW: 'DER_FW',
  /** Pole źródłowe, którego rodzaju źródła model nie rozstrzyga (rola `OZE` bez
   *  przyłączonego wytwórcy albo z wytwórcami różnych rodzajów) — jawny symbol źródła
   *  nieokreślonego, nigdy PV z domysłu (karta GPZ-PARYTET cz. 2, pkt 3). */
  DER_UNKNOWN: 'DER_UNKNOWN',
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
    role === FIELD_ROLE.EARTHING ||
    role === FIELD_ROLE.CAPACITOR ||
    role === FIELD_ROLE.GPZ_LINE_BAY ||
    role === FIELD_ROLE.RMU_LINE ||
    role === FIELD_ROLE.RMU_TRANSFORMER ||
    role === FIELD_ROLE.DER_PV ||
    role === FIELD_ROLE.DER_BESS ||
    role === FIELD_ROLE.DER_FW ||
    role === FIELD_ROLE.DER_UNKNOWN
  );
}

// =============================================================================
// 3. ApparatusInstance — instancja aparatu na potrzeby renderingu
// =============================================================================

/**
 * Instancja aparatu w polu (operator-grade opis aparatu pola).
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
