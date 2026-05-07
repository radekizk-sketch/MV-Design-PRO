/**
 * SLD V2 — Apparatus Visual State Matrix (Phase 0A).
 *
 * 5-wymiarowa matryca stanów aparatu, według uwagi recenzenta planu:
 *   apparatus_kind × switching_state × energization_state × safety_state × result_state
 *
 * Reguła geometrii (Acceptance Invariant nr 13):
 *   `viewBox` i `anchors` aparatu są INWARIANTNE przez wszystkie kombinacje
 *   stanów. Stan zmienia tylko fill/stroke/markery — nigdy kształt.
 *
 * Reguła kolorów:
 *   - switching_state.closed → fill zielony (token COLOR_STATE_ENERGIZED).
 *   - switching_state.open → przerwa wewnątrz + obrys czerwony.
 *   - energization_state.deenergized → przyciemnienie linii (50% intensywność).
 *   - safety_state.grounded → boczny marker uziemienia (czerwony).
 *   - safety_state.alarm → czerwony badge dodatkowy (geometria invariant).
 *   - result_state.missing → szary, dashed; result_state.failed → czerwony obrys.
 *
 * @see SLD_SYMBOLS_CANONICAL_OPERATOR_GRADE.md
 */

import type { ApparatusKind } from './apparatusContracts';

// =============================================================================
// 5 wymiarów stanu
// =============================================================================

/** Wymiar 1: stan łączeniowy (mechaniczny). */
export type SwitchingState = 'closed' | 'open' | 'unknown' | 'not_applicable';

/** Wymiar 2: stan zasilania (elektryczny). */
export type EnergizationState = 'energized' | 'deenergized' | 'backfed' | 'unknown';

/** Wymiar 3: stan bezpieczeństwa (uziemienie / blokady / alarmy). */
export type SafetyState = 'grounded' | 'not_grounded' | 'blocked' | 'alarm' | 'normal';

/** Wymiar 4: stan wyników obliczeń przypisanych do aparatu / pola. */
export type ResultState = 'complete' | 'partial' | 'failed' | 'missing' | 'not_applicable';

/** Wymiar 5: kind aparatu (z apparatusContracts). */

/** Pełny stan wizualny aparatu — input dla `apparatusSymbolPolicy`. */
export interface ApparatusVisualState {
  readonly apparatusKind: ApparatusKind;
  readonly switchingState: SwitchingState;
  readonly energizationState: EnergizationState;
  readonly safetyState: SafetyState;
  readonly resultState: ResultState;
}

// =============================================================================
// Mapowanie z ENM stanów na wymiary V2
// =============================================================================

/**
 * Mapowanie ENM `BayDeviceState` → V2 `SwitchingState`.
 *
 * ENM rozróżnia "zamkniety_naped_rozbrojony" (closed but interlocked) — w V2
 * to nadal `closed` po stronie SwitchingState, a "interlocked" wyrażamy przez
 * `safetyState='blocked'`.
 */
export function fromEnmDeviceStateToSwitching(
  enmState:
    | 'zamkniety'
    | 'otwarty'
    | 'zamkniety_naped_rozbrojony'
    | 'otwarty_naped_rozbrojony'
    | 'nieznany'
    | 'awaria',
): SwitchingState {
  switch (enmState) {
    case 'zamkniety':
    case 'zamkniety_naped_rozbrojony':
      return 'closed';
    case 'otwarty':
    case 'otwarty_naped_rozbrojony':
      return 'open';
    case 'nieznany':
    case 'awaria':
      return 'unknown';
  }
}

/** Domyślny SafetyState dla aparatów, które nie mogą być uziemnikiem. */
export function defaultSafetyState(apparatusKind: ApparatusKind): SafetyState {
  // Tylko ES (uziemnik) może być w stanie `grounded`. Inne aparaty: `normal`
  // chyba że alarm/blokada są jawnie ustawione.
  return apparatusKind === 'earthing_switch' ? 'grounded' : 'normal';
}

/** Czy switching_state ma sens dla danego kindu (np. CT/VT zawsze 'not_applicable'). */
export function isSwitchingStateApplicable(kind: ApparatusKind): boolean {
  return (
    kind === 'circuit_breaker' ||
    kind === 'switch_disconnector' ||
    kind === 'disconnector' ||
    kind === 'earthing_switch' ||
    kind === 'fuse' ||
    kind === 'lv_breaker'
  );
}

/**
 * Domyślny ApparatusVisualState dla aparatu — używany w testach i na
 * stanach niekompletnych. Reguła: brak danych → `unknown`/`missing`, NIE
 * 0/closed (to byłoby fabrykowanie).
 */
export function defaultApparatusVisualState(kind: ApparatusKind): ApparatusVisualState {
  return {
    apparatusKind: kind,
    switchingState: isSwitchingStateApplicable(kind) ? 'unknown' : 'not_applicable',
    energizationState: 'unknown',
    safetyState: defaultSafetyState(kind),
    resultState: 'not_applicable',
  };
}

/**
 * Wszystkie kombinacje stanów dla testów inwariantów geometrii.
 *
 * Używane przez `structuralSvg.test.ts` (Phase 7) do potwierdzenia, że
 * `viewBox` i `anchors` są niezmienione przez stan.
 */
export function enumerateApparatusVisualStates(
  kinds: readonly ApparatusKind[] = [],
): readonly ApparatusVisualState[] {
  const switching: SwitchingState[] = ['closed', 'open', 'unknown', 'not_applicable'];
  const energization: EnergizationState[] = ['energized', 'deenergized', 'backfed', 'unknown'];
  const safety: SafetyState[] = ['grounded', 'not_grounded', 'blocked', 'alarm', 'normal'];
  const result: ResultState[] = ['complete', 'partial', 'failed', 'missing', 'not_applicable'];

  const out: ApparatusVisualState[] = [];
  for (const k of kinds) {
    for (const s of switching) {
      // Filtruj kombinacje niemożliwe: switching_state nie ma sensu dla CT/VT itp.
      if (!isSwitchingStateApplicable(k) && s !== 'not_applicable') continue;
      if (isSwitchingStateApplicable(k) && s === 'not_applicable') continue;
      for (const e of energization) {
        for (const sf of safety) {
          // Tylko ES może być `grounded`; inne aparaty nigdy.
          if (sf === 'grounded' && k !== 'earthing_switch') continue;
          for (const r of result) {
            out.push({
              apparatusKind: k,
              switchingState: s,
              energizationState: e,
              safetyState: sf,
              resultState: r,
            });
          }
        }
      }
    }
  }
  return out;
}
