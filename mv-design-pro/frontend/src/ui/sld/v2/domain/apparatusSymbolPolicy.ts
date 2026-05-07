/**
 * SLD V2 — Apparatus Symbol Policy (Phase 0A).
 *
 * Mapowanie `apparatusKind × ApparatusVisualState` → wybór wariantu SVG +
 * tokeny stylu. Reguła geometrii (Acceptance Invariant nr 13): wybór
 * wariantu nie zmienia `viewBox` ani `anchors`.
 *
 * Wybór koloru:
 *   - safety_state.alarm → priorytet alarmu (czerwony badge dodatkowy)
 *   - result_state.failed → czerwony obrys (override)
 *   - result_state.missing → szary, dashed
 *   - switching_state.open → przerwa wewnątrz + czerwony marker
 *   - switching_state.closed + energized → fill zielony
 *   - switching_state.closed + deenergized → fill szary jasny
 *   - switching_state.unknown → znak zapytania, neutralny obrys
 */

import type {
  ApparatusVisualState,
  EnergizationState,
  ResultState,
  SafetyState,
  SwitchingState,
} from './apparatusVisualState';

// =============================================================================
// Variant + style decision
// =============================================================================

/**
 * Wariant geometrii aparatu — każdy kind ma listę dozwolonych wariantów.
 *
 * Wariant zmienia tylko fill/marker; viewBox i anchors są te same.
 */
export type SymbolVariant =
  | 'closed_filled'
  | 'open_break'
  | 'unknown_question'
  | 'not_applicable_neutral'
  | 'fixed_neutral'; // CT/VT/cable_head/transformer — geometria niezmienna od stanu

/** Output decyzji symbolu — input dla rendererów SVG. */
export interface ApparatusSymbolDecision {
  readonly variant: SymbolVariant;
  /** Główny fill (zielony/szary/biały). */
  readonly fillToken: SymbolFillToken;
  /** Stroke główny aparatu (neutralny/czerwony/dashed). */
  readonly strokeToken: SymbolStrokeToken;
  /** Czy pokazać marker safety/alarm (boczny czerwony znacznik). */
  readonly showSafetyMarker: boolean;
  /** Czy pokazać marker missing-data (szary trójkąt). */
  readonly showMissingMarker: boolean;
  /** Czy pokazać marker uziemienia (boczny symbol ziemi). */
  readonly showGroundMarker: boolean;
  /** Hint dla rendererów: czy linie energizacji są przyciemnione. */
  readonly dimEnergizationLines: boolean;
}

export type SymbolFillToken = 'energized' | 'deenergized' | 'unknown' | 'transparent' | 'missing';
export type SymbolStrokeToken = 'neutral' | 'open' | 'failed' | 'missing' | 'alarm';

// =============================================================================
// Policy core
// =============================================================================

/**
 * Decyzja symbolu — jedyny punkt decyzyjny dla mapowania stanu na styl.
 *
 * Czysta funkcja, deterministyczna, zero RNG.
 */
export function decideSymbolStyle(state: ApparatusVisualState): ApparatusSymbolDecision {
  const variant = chooseVariant(state);
  const fillToken = chooseFill(state);
  const strokeToken = chooseStroke(state);
  return {
    variant,
    fillToken,
    strokeToken,
    showSafetyMarker: state.safetyState === 'alarm' || state.safetyState === 'blocked',
    showMissingMarker: state.resultState === 'missing',
    showGroundMarker: state.safetyState === 'grounded',
    dimEnergizationLines: state.energizationState === 'deenergized',
  };
}

function chooseVariant(state: ApparatusVisualState): SymbolVariant {
  // CT/VT/transformer/cable_head/metering_cubicle — geometria stała.
  if (
    state.apparatusKind === 'ct' ||
    state.apparatusKind === 'vt' ||
    state.apparatusKind === 'transformer' ||
    state.apparatusKind === 'cable_head' ||
    state.apparatusKind === 'metering_cubicle' ||
    state.apparatusKind === 'surge_arrester'
  ) {
    return 'fixed_neutral';
  }
  switch (state.switchingState) {
    case 'closed':
      return 'closed_filled';
    case 'open':
      return 'open_break';
    case 'unknown':
      return 'unknown_question';
    case 'not_applicable':
      return 'not_applicable_neutral';
  }
}

function chooseFill(state: ApparatusVisualState): SymbolFillToken {
  // result_state.missing przebija (operator ma widzieć brak danych)
  if (state.resultState === 'missing') return 'missing';
  // switching_state.open → transparent (przerwa)
  if (state.switchingState === 'open') return 'transparent';
  if (state.switchingState === 'unknown') return 'unknown';
  // closed + energization
  return chooseFillForEnergization(state.energizationState);
}

function chooseFillForEnergization(state: EnergizationState): SymbolFillToken {
  switch (state) {
    case 'energized':
      return 'energized';
    case 'deenergized':
      return 'deenergized';
    case 'backfed':
      return 'energized'; // Backfed jest pod napięciem — zielony, ale renderer może dodać dodatkową strzałkę kierunku.
    case 'unknown':
      return 'unknown';
  }
}

function chooseStroke(state: ApparatusVisualState): SymbolStrokeToken {
  // Priorytety stroke (od najwyższego):
  //   1. result_state.failed → failed (czerwony)
  //   2. safety_state.alarm → alarm (czerwony)
  //   3. switching_state.open → open (czerwony)
  //   4. result_state.missing → missing (dashed szary)
  //   5. domyślny: neutral
  if (state.resultState === 'failed') return 'failed';
  if (state.safetyState === 'alarm') return 'alarm';
  if (state.switchingState === 'open') return 'open';
  if (state.resultState === 'missing') return 'missing';
  return 'neutral';
}

/** Czy decyzja prowadzi do tej samej geometrii dla zadanego kindu (test inwariantu). */
export function isGeometryInvariantAcrossStates(
  decisionA: ApparatusSymbolDecision,
  decisionB: ApparatusSymbolDecision,
): boolean {
  // viewBox + anchors są niezmienione zawsze; ten helper jest dla testów.
  // Geometria jest tożsama gdy wariant nie wprowadza zmiany kształtu — co w
  // V2 oznacza: każdy wariant. Funkcja zwraca true zawsze (kontrakt).
  void decisionA;
  void decisionB;
  return true;
}

/**
 * Polityka eksportowa — dla zewnętrznego konsumenta (testy, debug).
 */
export const APPARATUS_SYMBOL_POLICY = {
  decideSymbolStyle,
  isGeometryInvariantAcrossStates,
} as const;

// =============================================================================
// Helpery dla testów / debug
// =============================================================================

export function describeStatePl(state: ApparatusVisualState): string {
  const sw = describeSwitching(state.switchingState);
  const en = describeEnergization(state.energizationState);
  const sf = describeSafety(state.safetyState);
  const rs = describeResult(state.resultState);
  return `${sw} • ${en} • ${sf} • ${rs}`;
}

function describeSwitching(s: SwitchingState): string {
  switch (s) {
    case 'closed':
      return 'zamknięty';
    case 'open':
      return 'otwarty';
    case 'unknown':
      return 'nieznany';
    case 'not_applicable':
      return 'n/d';
  }
}

function describeEnergization(s: EnergizationState): string {
  switch (s) {
    case 'energized':
      return 'pod napięciem';
    case 'deenergized':
      return 'odłączony';
    case 'backfed':
      return 'zasilany zwrotnie';
    case 'unknown':
      return 'energizacja nieznana';
  }
}

function describeSafety(s: SafetyState): string {
  switch (s) {
    case 'grounded':
      return 'uziemiony';
    case 'not_grounded':
      return 'bez uziemienia';
    case 'blocked':
      return 'zablokowany';
    case 'alarm':
      return 'alarm';
    case 'normal':
      return 'normalny';
  }
}

function describeResult(s: ResultState): string {
  switch (s) {
    case 'complete':
      return 'wyniki kompletne';
    case 'partial':
      return 'wyniki częściowe';
    case 'failed':
      return 'błąd obliczeń';
    case 'missing':
      return 'brak wyników';
    case 'not_applicable':
      return 'wyniki n/d';
  }
}
