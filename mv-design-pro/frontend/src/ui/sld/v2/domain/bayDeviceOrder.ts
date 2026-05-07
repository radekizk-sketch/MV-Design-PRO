/**
 * SLD V2 — BayDeviceOrderPolicy (Phase 0A).
 *
 * Hard rules dla kolejności aparatów w polu (od szyny do wyjścia/transformatora).
 * Renderer MUSI iterować aparaty w tej kolejności, niezależnie od kolejności
 * `equipment_refs` w ENM (które jest stabilne ale niesemantyczne).
 *
 * @see SLD_SYMBOLS_CANONICAL_OPERATOR_GRADE.md (CT w osi po wyłączniku, VT na bocznej)
 */

import { APPARATUS_KIND, type ApparatusKind, FIELD_ROLE, type FieldRole } from './apparatusContracts';

// =============================================================================
// PowerPathPosition — pozycja aparatu na torze pola
// =============================================================================

/**
 * Pozycja aparatu względem osi pola.
 *
 * - MAIN_AXIS: na pionowym torze pola (od szyny w dół), kolejność wynika z `order`.
 * - LATERAL_BRANCH: gałąź boczna od osi (uziemnik, VT pomiarowy).
 * - GROUND_BRANCH: dolne podłączenie do uziemnika (specjalny LATERAL).
 * - OFF_PATH: poza torem (relay, zabezpieczenie).
 */
export type PowerPathPosition = 'MAIN_AXIS' | 'LATERAL_BRANCH' | 'GROUND_BRANCH' | 'OFF_PATH';

/** Slot (kolejność) aparatu w polu. */
export interface BayDeviceSlot {
  readonly apparatusKind: ApparatusKind;
  readonly position: PowerPathPosition;
  /** Kolejność na osi (1 = najbliżej szyny, rośnie w kierunku wyjścia). */
  readonly order: number;
  /** Strona gałęzi bocznej (LEFT/RIGHT/null dla MAIN_AXIS). */
  readonly side?: 'LEFT' | 'RIGHT' | null;
  /** Czy slot jest opcjonalny — może być pusty bez naruszenia kontraktu pola. */
  readonly optional: boolean;
}

// =============================================================================
// Reguły dla 9 kanonicznych ról pól
// =============================================================================

/** LINE_IN (pole liniowe wejściowe pełne) — szyna → DS_BUS → CB → CT → DS_LINE → ES boczny → CABLE_HEAD. */
const LINE_IN_ORDER: readonly BayDeviceSlot[] = [
  { apparatusKind: APPARATUS_KIND.DISCONNECTOR, position: 'MAIN_AXIS', order: 1, optional: false },
  { apparatusKind: APPARATUS_KIND.CIRCUIT_BREAKER, position: 'MAIN_AXIS', order: 2, optional: false },
  { apparatusKind: APPARATUS_KIND.CT, position: 'MAIN_AXIS', order: 3, optional: false },
  { apparatusKind: APPARATUS_KIND.DISCONNECTOR, position: 'MAIN_AXIS', order: 4, optional: true },
  { apparatusKind: APPARATUS_KIND.EARTHING_SWITCH, position: 'LATERAL_BRANCH', order: 5, side: 'RIGHT', optional: false },
  { apparatusKind: APPARATUS_KIND.SURGE_ARRESTER, position: 'LATERAL_BRANCH', order: 5, side: 'LEFT', optional: true },
  { apparatusKind: APPARATUS_KIND.CABLE_HEAD, position: 'MAIN_AXIS', order: 6, optional: false },
];

/** LINE_OUT (pole liniowe wyjściowe pełne) — układ ten sam co LINE_IN ale rola wyjściowa. */
const LINE_OUT_ORDER: readonly BayDeviceSlot[] = LINE_IN_ORDER;

/** LINE_BRANCH (pole odgałęźne pełne) — układ ten sam, rola odgałęźna. */
const LINE_BRANCH_ORDER: readonly BayDeviceSlot[] = LINE_IN_ORDER;

/** GPZ_LINE_BAY (pole liniowe GPZ) — pełne ze wszystkimi pomiarami. */
const GPZ_LINE_BAY_ORDER: readonly BayDeviceSlot[] = [
  { apparatusKind: APPARATUS_KIND.DISCONNECTOR, position: 'MAIN_AXIS', order: 1, optional: false },
  { apparatusKind: APPARATUS_KIND.CIRCUIT_BREAKER, position: 'MAIN_AXIS', order: 2, optional: false },
  { apparatusKind: APPARATUS_KIND.CT, position: 'MAIN_AXIS', order: 3, optional: false },
  { apparatusKind: APPARATUS_KIND.VT, position: 'LATERAL_BRANCH', order: 3, side: 'LEFT', optional: true },
  { apparatusKind: APPARATUS_KIND.DISCONNECTOR, position: 'MAIN_AXIS', order: 4, optional: false },
  { apparatusKind: APPARATUS_KIND.EARTHING_SWITCH, position: 'LATERAL_BRANCH', order: 5, side: 'RIGHT', optional: false },
  { apparatusKind: APPARATUS_KIND.SURGE_ARRESTER, position: 'LATERAL_BRANCH', order: 5, side: 'LEFT', optional: true },
  { apparatusKind: APPARATUS_KIND.CABLE_HEAD, position: 'MAIN_AXIS', order: 6, optional: false },
];

/** RMU_LINE (pole liniowe RMU/RM6 — uproszczone). */
const RMU_LINE_ORDER: readonly BayDeviceSlot[] = [
  { apparatusKind: APPARATUS_KIND.SWITCH_DISCONNECTOR, position: 'MAIN_AXIS', order: 1, optional: false },
  { apparatusKind: APPARATUS_KIND.CT, position: 'MAIN_AXIS', order: 2, optional: true },
  { apparatusKind: APPARATUS_KIND.EARTHING_SWITCH, position: 'LATERAL_BRANCH', order: 3, side: 'RIGHT', optional: false },
  { apparatusKind: APPARATUS_KIND.CABLE_HEAD, position: 'MAIN_AXIS', order: 4, optional: false },
];

/** TRANSFORMER (pole transformatorowe pełne SN/nN). */
const TRANSFORMER_ORDER: readonly BayDeviceSlot[] = [
  { apparatusKind: APPARATUS_KIND.DISCONNECTOR, position: 'MAIN_AXIS', order: 1, optional: false },
  { apparatusKind: APPARATUS_KIND.CIRCUIT_BREAKER, position: 'MAIN_AXIS', order: 2, optional: true },
  { apparatusKind: APPARATUS_KIND.FUSE, position: 'MAIN_AXIS', order: 2, optional: true },
  { apparatusKind: APPARATUS_KIND.CT, position: 'MAIN_AXIS', order: 3, optional: false },
  { apparatusKind: APPARATUS_KIND.EARTHING_SWITCH, position: 'LATERAL_BRANCH', order: 4, side: 'RIGHT', optional: false },
  { apparatusKind: APPARATUS_KIND.TRANSFORMER, position: 'MAIN_AXIS', order: 5, optional: false },
  { apparatusKind: APPARATUS_KIND.LV_BREAKER, position: 'MAIN_AXIS', order: 6, optional: false },
];

/** RMU_TRANSFORMER (pole transformatorowe RMU). */
const RMU_TRANSFORMER_ORDER: readonly BayDeviceSlot[] = [
  { apparatusKind: APPARATUS_KIND.SWITCH_DISCONNECTOR, position: 'MAIN_AXIS', order: 1, optional: false },
  { apparatusKind: APPARATUS_KIND.FUSE, position: 'MAIN_AXIS', order: 2, optional: true },
  { apparatusKind: APPARATUS_KIND.CT, position: 'MAIN_AXIS', order: 3, optional: true },
  { apparatusKind: APPARATUS_KIND.EARTHING_SWITCH, position: 'LATERAL_BRANCH', order: 4, side: 'RIGHT', optional: false },
  { apparatusKind: APPARATUS_KIND.TRANSFORMER, position: 'MAIN_AXIS', order: 5, optional: false },
  { apparatusKind: APPARATUS_KIND.LV_BREAKER, position: 'MAIN_AXIS', order: 6, optional: false },
];

/** COUPLER (pole sprzęgła sekcyjnego). */
const COUPLER_ORDER: readonly BayDeviceSlot[] = [
  { apparatusKind: APPARATUS_KIND.DISCONNECTOR, position: 'MAIN_AXIS', order: 1, optional: false },
  { apparatusKind: APPARATUS_KIND.CIRCUIT_BREAKER, position: 'MAIN_AXIS', order: 2, optional: false },
  { apparatusKind: APPARATUS_KIND.CT, position: 'MAIN_AXIS', order: 3, optional: true },
  { apparatusKind: APPARATUS_KIND.DISCONNECTOR, position: 'MAIN_AXIS', order: 4, optional: false },
];

/** MEASUREMENT (pole pomiarowe SN). */
const MEASUREMENT_ORDER: readonly BayDeviceSlot[] = [
  { apparatusKind: APPARATUS_KIND.DISCONNECTOR, position: 'MAIN_AXIS', order: 1, optional: false },
  { apparatusKind: APPARATUS_KIND.FUSE, position: 'MAIN_AXIS', order: 2, optional: true },
  { apparatusKind: APPARATUS_KIND.VT, position: 'MAIN_AXIS', order: 3, optional: false },
  { apparatusKind: APPARATUS_KIND.EARTHING_SWITCH, position: 'LATERAL_BRANCH', order: 4, side: 'RIGHT', optional: false },
];

// =============================================================================
// Publiczna polityka kolejności
// =============================================================================

/**
 * Kanoniczna kolejność aparatów dla każdej z 9 ról pól.
 *
 * Renderer MUSI iterować po tej tabeli (nie po `equipment_refs`).
 */
export const BAY_DEVICE_ORDER_POLICY: Readonly<Record<FieldRole, readonly BayDeviceSlot[]>> = {
  [FIELD_ROLE.LINE_IN]: LINE_IN_ORDER,
  [FIELD_ROLE.LINE_OUT]: LINE_OUT_ORDER,
  [FIELD_ROLE.LINE_BRANCH]: LINE_BRANCH_ORDER,
  [FIELD_ROLE.GPZ_LINE_BAY]: GPZ_LINE_BAY_ORDER,
  [FIELD_ROLE.RMU_LINE]: RMU_LINE_ORDER,
  [FIELD_ROLE.TRANSFORMER]: TRANSFORMER_ORDER,
  [FIELD_ROLE.RMU_TRANSFORMER]: RMU_TRANSFORMER_ORDER,
  [FIELD_ROLE.COUPLER]: COUPLER_ORDER,
  [FIELD_ROLE.MEASUREMENT]: MEASUREMENT_ORDER,
};

/**
 * Zwraca kolejność aparatów dla danej roli pola.
 *
 * Przeznaczony do iteracji w `BayRenderer`. Pełna kolejność (włącznie z
 * opcjonalnymi slotami); renderer pomija sloty bez `ApparatusInstance`.
 */
export function getBayDeviceOrder(role: FieldRole): readonly BayDeviceSlot[] {
  return BAY_DEVICE_ORDER_POLICY[role];
}

/**
 * Liczba slotów MAIN_AXIS dla danej roli — używane do kalkulacji wysokości
 * pola w SLD.
 */
export function countMainAxisSlots(role: FieldRole): number {
  return getBayDeviceOrder(role).filter((slot) => slot.position === 'MAIN_AXIS').length;
}
