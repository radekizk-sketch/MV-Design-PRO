/**
 * SLD V2 — MiniBlock Footprints (Phase 0A).
 *
 * Czysta data dla 7 typów mini-bloków stacji RMU/RM6 (wykluczając GPZ —
 * GPZ ma osobny renderer `GpzSwitchgearRenderer`).
 *
 * Reguła Acceptance Invariant nr 11: stacja w widoku oddalonym = mini-RMU
 * wynikający z bays[]+ports[], NIE pojedynczy prostokąt. Footprint dostarcza
 * tylko domyślny układ; ostateczna geometria wynika z faktycznych pól.
 *
 * @see SLD_STATION_MINI_BLOCK_SPEC.md
 */

import { FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';

// =============================================================================
// 7 typów footprintu
// =============================================================================

/**
 * 7 kanonicznych footprintów mini-bloku stacji.
 *
 * GPZ (`station_type='gpz'`) NIE jest tu — ma osobny `GpzSwitchgearRenderer`.
 */
export type StationFootprintType =
  | 'mv_lv_terminal'
  | 'mv_lv_inline'
  | 'mv_lv_branch'
  | 'mv_lv_sectional'
  | 'mv_lv_customer'
  | 'switching_station'
  | 'der_station';

export const ALL_STATION_FOOTPRINT_TYPES: readonly StationFootprintType[] = [
  'mv_lv_terminal',
  'mv_lv_inline',
  'mv_lv_branch',
  'mv_lv_sectional',
  'mv_lv_customer',
  'switching_station',
  'der_station',
];

// =============================================================================
// Footprint definition
// =============================================================================

export interface StationFootprint {
  readonly type: StationFootprintType;
  /** Czy footprint zakłada obecność transformatora SN/nN (pole TRANSFORMER). */
  readonly hasTransformer: boolean;
  /** Czy footprint zakłada obecność sekcji nN (po stronie nN). */
  readonly hasLvSection: boolean;
  /** Domyślne role pól SN dla footprintu (oczekiwana sekwencja). */
  readonly defaultSnBayRoles: readonly FieldRole[];
  /** Polska etykieta typu (UI). */
  readonly labelPl: string;
  /** Krótki kod identyfikacji typu (do badge'a w mini-bloku). */
  readonly shortCodePl: string;
}

const MV_LV_TERMINAL: StationFootprint = {
  type: 'mv_lv_terminal',
  hasTransformer: true,
  hasLvSection: true,
  defaultSnBayRoles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER],
  labelPl: 'Stacja końcowa SN/nN',
  shortCodePl: 'RMU·K',
};

const MV_LV_INLINE: StationFootprint = {
  type: 'mv_lv_inline',
  hasTransformer: true,
  hasLvSection: true,
  defaultSnBayRoles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER],
  labelPl: 'Stacja przelotowa SN/nN',
  shortCodePl: 'RMU·P',
};

const MV_LV_BRANCH: StationFootprint = {
  type: 'mv_lv_branch',
  hasTransformer: true,
  hasLvSection: true,
  defaultSnBayRoles: [
    FIELD_ROLE.RMU_LINE,
    FIELD_ROLE.RMU_LINE,
    FIELD_ROLE.RMU_LINE,
    FIELD_ROLE.RMU_TRANSFORMER,
  ],
  labelPl: 'Stacja odgałęźna SN/nN',
  shortCodePl: 'RMU·O',
};

const MV_LV_SECTIONAL: StationFootprint = {
  type: 'mv_lv_sectional',
  hasTransformer: true,
  hasLvSection: true,
  defaultSnBayRoles: [
    FIELD_ROLE.RMU_LINE,
    FIELD_ROLE.RMU_TRANSFORMER,
    FIELD_ROLE.COUPLER,
    FIELD_ROLE.RMU_LINE,
    FIELD_ROLE.RMU_TRANSFORMER,
  ],
  labelPl: 'Stacja sekcyjna SN/nN',
  shortCodePl: 'RMU·S',
};

const MV_LV_CUSTOMER: StationFootprint = {
  type: 'mv_lv_customer',
  hasTransformer: true,
  hasLvSection: true,
  defaultSnBayRoles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.MEASUREMENT, FIELD_ROLE.RMU_TRANSFORMER],
  labelPl: 'Stacja abonencka SN/nN',
  shortCodePl: 'RMU·A',
};

const SWITCHING_STATION: StationFootprint = {
  type: 'switching_station',
  hasTransformer: false,
  hasLvSection: false,
  defaultSnBayRoles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE],
  labelPl: 'Stacja łącznikowa SN',
  shortCodePl: 'ŁCZ',
};

const DER_STATION: StationFootprint = {
  type: 'der_station',
  hasTransformer: true,
  hasLvSection: false,
  defaultSnBayRoles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER],
  labelPl: 'Stacja źródłowa OZE',
  shortCodePl: 'OZE',
};

export const MINI_BLOCK_FOOTPRINT: Readonly<Record<StationFootprintType, StationFootprint>> = {
  mv_lv_terminal: MV_LV_TERMINAL,
  mv_lv_inline: MV_LV_INLINE,
  mv_lv_branch: MV_LV_BRANCH,
  mv_lv_sectional: MV_LV_SECTIONAL,
  mv_lv_customer: MV_LV_CUSTOMER,
  switching_station: SWITCHING_STATION,
  der_station: DER_STATION,
};

// =============================================================================
// Derive footprint from Substation
// =============================================================================

/**
 * Wnioskuje footprint type z substation_type + bay roles.
 *
 * Reguła: footprint NIE wymusza geometrii — to mini-RMU komponuje się
 * z faktycznych pól. Footprint jest tylko domyślnym layoutem dla badge i
 * koloru wewnętrznego.
 */
export function deriveFootprintType(
  stationType: string,
  bayRoles: readonly FieldRole[],
  hasDer: boolean,
): StationFootprintType {
  // GPZ nie ma footprintu mini-bloku.
  if (stationType === 'gpz') {
    throw new Error('GPZ does not have mini-block footprint; use GpzSwitchgearRenderer');
  }
  if (stationType === 'switching') return 'switching_station';
  if (stationType === 'customer') return 'mv_lv_customer';
  if (stationType === 'sectional') return 'mv_lv_sectional';
  if (hasDer) return 'der_station';

  // mv_lv / inline / branch / terminal — rozróżniamy po liczbie pól liniowych SN.
  const lineLikeCount = bayRoles.filter(
    (r) =>
      r === FIELD_ROLE.LINE_IN ||
      r === FIELD_ROLE.LINE_OUT ||
      r === FIELD_ROLE.LINE_BRANCH ||
      r === FIELD_ROLE.RMU_LINE,
  ).length;
  if (stationType === 'inline' || lineLikeCount === 2) return 'mv_lv_inline';
  if (stationType === 'branch' || lineLikeCount >= 3) return 'mv_lv_branch';
  // 'terminal', 'mv_lv' default lub 1 line bay.
  return 'mv_lv_terminal';
}

/**
 * Pomocnicze: czy footprint zakłada DER.
 *
 * Reguła Acceptance Invariant nr 10: DER musi mieć PCC. Tutaj tylko
 * informacja, czy footprint TYPU zakłada obecność DER — walidator robi
 * twardy check.
 */
export function footprintAssumesDer(type: StationFootprintType): boolean {
  return type === 'der_station';
}
