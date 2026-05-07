/**
 * Phase 0A — apparatusSymbolPolicy unit tests.
 *
 * Reguła Acceptance Invariant nr 13: stan zmienia tylko fill/stroke/markery,
 * nigdy kształt aparatu.
 */

import { describe, expect, it } from 'vitest';

import { APPARATUS_KIND } from '../apparatusContracts';
import {
  defaultApparatusVisualState,
  enumerateApparatusVisualStates,
  type ApparatusVisualState,
} from '../apparatusVisualState';
import { decideSymbolStyle, isGeometryInvariantAcrossStates } from '../apparatusSymbolPolicy';

function withState(
  state: ApparatusVisualState,
  overrides: Partial<ApparatusVisualState>,
): ApparatusVisualState {
  return { ...state, ...overrides };
}

describe('decideSymbolStyle — variant per kind', () => {
  it('CT/VT/transformer mają wariant fixed_neutral (geometria stała)', () => {
    for (const k of ['ct', 'vt', 'transformer', 'cable_head', 'metering_cubicle', 'surge_arrester'] as const) {
      const decision = decideSymbolStyle(defaultApparatusVisualState(k));
      expect(decision.variant).toBe('fixed_neutral');
    }
  });

  it('CB closed → variant closed_filled', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', energizationState: 'energized' },
    );
    expect(decideSymbolStyle(state).variant).toBe('closed_filled');
  });

  it('CB open → variant open_break', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'open' },
    );
    expect(decideSymbolStyle(state).variant).toBe('open_break');
  });

  it('CB unknown → variant unknown_question', () => {
    const decision = decideSymbolStyle(defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER));
    expect(decision.variant).toBe('unknown_question');
  });
});

describe('decideSymbolStyle — fill priorities', () => {
  it('result_state=missing przebija switching_state=closed', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', energizationState: 'energized', resultState: 'missing' },
    );
    expect(decideSymbolStyle(state).fillToken).toBe('missing');
  });

  it('open → transparent fill', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'open' },
    );
    expect(decideSymbolStyle(state).fillToken).toBe('transparent');
  });

  it('closed + energized → energized fill', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', energizationState: 'energized' },
    );
    expect(decideSymbolStyle(state).fillToken).toBe('energized');
  });

  it('closed + deenergized → deenergized fill', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', energizationState: 'deenergized' },
    );
    expect(decideSymbolStyle(state).fillToken).toBe('deenergized');
  });

  it('backfed → energized fill (pod napięciem zwrotnie)', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', energizationState: 'backfed' },
    );
    expect(decideSymbolStyle(state).fillToken).toBe('energized');
  });
});

describe('decideSymbolStyle — stroke priorities', () => {
  it('result_state=failed → stroke=failed (przebija inne)', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', resultState: 'failed', safetyState: 'alarm' },
    );
    expect(decideSymbolStyle(state).strokeToken).toBe('failed');
  });

  it('safety=alarm bez failed → stroke=alarm', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', resultState: 'complete', safetyState: 'alarm' },
    );
    expect(decideSymbolStyle(state).strokeToken).toBe('alarm');
  });

  it('open bez alarm/failed → stroke=open', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'open', safetyState: 'normal' },
    );
    expect(decideSymbolStyle(state).strokeToken).toBe('open');
  });

  it('result=missing bez alarm/failed/open → stroke=missing', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', resultState: 'missing', safetyState: 'normal' },
    );
    expect(decideSymbolStyle(state).strokeToken).toBe('missing');
  });

  it('domyślny stroke = neutral', () => {
    const state: ApparatusVisualState = withState(
      defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER),
      { switchingState: 'closed', resultState: 'complete', safetyState: 'normal' },
    );
    expect(decideSymbolStyle(state).strokeToken).toBe('neutral');
  });
});

describe('decideSymbolStyle — markery i przygaszenie linii', () => {
  it('grounded ES → showGroundMarker=true', () => {
    const decision = decideSymbolStyle({
      apparatusKind: APPARATUS_KIND.EARTHING_SWITCH,
      switchingState: 'closed',
      energizationState: 'deenergized',
      safetyState: 'grounded',
      resultState: 'not_applicable',
    });
    expect(decision.showGroundMarker).toBe(true);
  });

  it('alarm → showSafetyMarker=true', () => {
    const decision = decideSymbolStyle({
      apparatusKind: APPARATUS_KIND.CIRCUIT_BREAKER,
      switchingState: 'closed',
      energizationState: 'energized',
      safetyState: 'alarm',
      resultState: 'complete',
    });
    expect(decision.showSafetyMarker).toBe(true);
  });

  it('result=missing → showMissingMarker=true', () => {
    const decision = decideSymbolStyle({
      apparatusKind: APPARATUS_KIND.CIRCUIT_BREAKER,
      switchingState: 'closed',
      energizationState: 'unknown',
      safetyState: 'normal',
      resultState: 'missing',
    });
    expect(decision.showMissingMarker).toBe(true);
  });

  it('deenergized → dimEnergizationLines=true', () => {
    const decision = decideSymbolStyle({
      apparatusKind: APPARATUS_KIND.CIRCUIT_BREAKER,
      switchingState: 'closed',
      energizationState: 'deenergized',
      safetyState: 'normal',
      resultState: 'complete',
    });
    expect(decision.dimEnergizationLines).toBe(true);
  });
});

describe('decideSymbolStyle — geometry invariant kontrakt', () => {
  it('isGeometryInvariantAcrossStates zawsze zwraca true (kontrakt: fill/stroke nie zmieniają geometrii)', () => {
    const states = enumerateApparatusVisualStates([APPARATUS_KIND.CIRCUIT_BREAKER]);
    for (let i = 1; i < states.length; i++) {
      const a = decideSymbolStyle(states[0]);
      const b = decideSymbolStyle(states[i]);
      expect(isGeometryInvariantAcrossStates(a, b)).toBe(true);
    }
  });
});
