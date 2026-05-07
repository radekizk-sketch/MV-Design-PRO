/**
 * Phase 0A — V2 apparatusVisualState unit tests.
 *
 * Acceptance Invariant nr 13: viewBox/anchors aparatu są inwariantne przez
 * kombinacje stanów. Tu testujemy kontrakt stanu, structural invariant
 * geometrii dochodzi w Phase 7 (`structuralSvg.test.ts`).
 */

import { describe, expect, it } from 'vitest';

import { ALL_APPARATUS_KINDS, APPARATUS_KIND } from '../apparatusContracts';
import {
  defaultApparatusVisualState,
  defaultSafetyState,
  enumerateApparatusVisualStates,
  fromEnmDeviceStateToSwitching,
  isSwitchingStateApplicable,
} from '../apparatusVisualState';

describe('apparatusVisualState — domyślny stan', () => {
  it('domyślny stan zawsze ma kind == argument', () => {
    for (const kind of ALL_APPARATUS_KINDS) {
      const state = defaultApparatusVisualState(kind);
      expect(state.apparatusKind).toBe(kind);
    }
  });

  it('CT/VT/transformer/cable_head zawsze "not_applicable" w switching', () => {
    expect(defaultApparatusVisualState(APPARATUS_KIND.CT).switchingState).toBe('not_applicable');
    expect(defaultApparatusVisualState(APPARATUS_KIND.VT).switchingState).toBe('not_applicable');
    expect(defaultApparatusVisualState(APPARATUS_KIND.TRANSFORMER).switchingState).toBe('not_applicable');
    expect(defaultApparatusVisualState(APPARATUS_KIND.CABLE_HEAD).switchingState).toBe('not_applicable');
  });

  it('CB/DS/ES/SD/FUSE/LV_BREAKER startują w "unknown"', () => {
    expect(defaultApparatusVisualState(APPARATUS_KIND.CIRCUIT_BREAKER).switchingState).toBe('unknown');
    expect(defaultApparatusVisualState(APPARATUS_KIND.DISCONNECTOR).switchingState).toBe('unknown');
    expect(defaultApparatusVisualState(APPARATUS_KIND.EARTHING_SWITCH).switchingState).toBe('unknown');
    expect(defaultApparatusVisualState(APPARATUS_KIND.SWITCH_DISCONNECTOR).switchingState).toBe('unknown');
    expect(defaultApparatusVisualState(APPARATUS_KIND.FUSE).switchingState).toBe('unknown');
    expect(defaultApparatusVisualState(APPARATUS_KIND.LV_BREAKER).switchingState).toBe('unknown');
  });

  it('tylko ES może być w stanie grounded domyślnie', () => {
    expect(defaultSafetyState(APPARATUS_KIND.EARTHING_SWITCH)).toBe('grounded');
    expect(defaultSafetyState(APPARATUS_KIND.CIRCUIT_BREAKER)).toBe('normal');
    expect(defaultSafetyState(APPARATUS_KIND.CT)).toBe('normal');
  });
});

describe('apparatusVisualState — fromEnmDeviceStateToSwitching', () => {
  it('zamkniety (z dowolnym podstanem) → closed', () => {
    expect(fromEnmDeviceStateToSwitching('zamkniety')).toBe('closed');
    expect(fromEnmDeviceStateToSwitching('zamkniety_naped_rozbrojony')).toBe('closed');
  });

  it('otwarty (z dowolnym podstanem) → open', () => {
    expect(fromEnmDeviceStateToSwitching('otwarty')).toBe('open');
    expect(fromEnmDeviceStateToSwitching('otwarty_naped_rozbrojony')).toBe('open');
  });

  it('nieznany / awaria → unknown', () => {
    expect(fromEnmDeviceStateToSwitching('nieznany')).toBe('unknown');
    expect(fromEnmDeviceStateToSwitching('awaria')).toBe('unknown');
  });
});

describe('apparatusVisualState — isSwitchingStateApplicable', () => {
  it('aparaty łączeniowe TAK', () => {
    for (const kind of [
      APPARATUS_KIND.CIRCUIT_BREAKER,
      APPARATUS_KIND.SWITCH_DISCONNECTOR,
      APPARATUS_KIND.DISCONNECTOR,
      APPARATUS_KIND.EARTHING_SWITCH,
      APPARATUS_KIND.FUSE,
      APPARATUS_KIND.LV_BREAKER,
    ]) {
      expect(isSwitchingStateApplicable(kind)).toBe(true);
    }
  });

  it('aparaty pomiarowe / pasywne NIE', () => {
    for (const kind of [
      APPARATUS_KIND.CT,
      APPARATUS_KIND.VT,
      APPARATUS_KIND.SURGE_ARRESTER,
      APPARATUS_KIND.TRANSFORMER,
      APPARATUS_KIND.CABLE_HEAD,
      APPARATUS_KIND.METERING_CUBICLE,
    ]) {
      expect(isSwitchingStateApplicable(kind)).toBe(false);
    }
  });
});

describe('apparatusVisualState — enumerateApparatusVisualStates', () => {
  it('przegląda kombinacje dla każdego kindu', () => {
    const cb = enumerateApparatusVisualStates([APPARATUS_KIND.CIRCUIT_BREAKER]);
    expect(cb.length).toBeGreaterThan(0);
    // Każdy stan musi mieć apparatusKind == CB
    for (const state of cb) {
      expect(state.apparatusKind).toBe(APPARATUS_KIND.CIRCUIT_BREAKER);
    }
  });

  it('CT ma tylko switching=not_applicable', () => {
    const ct = enumerateApparatusVisualStates([APPARATUS_KIND.CT]);
    for (const state of ct) {
      expect(state.switchingState).toBe('not_applicable');
    }
  });

  it('CB nigdy nie ma switching=not_applicable', () => {
    const cb = enumerateApparatusVisualStates([APPARATUS_KIND.CIRCUIT_BREAKER]);
    for (const state of cb) {
      expect(state.switchingState).not.toBe('not_applicable');
    }
  });

  it('grounded wymiar tylko dla ES', () => {
    const all = enumerateApparatusVisualStates(ALL_APPARATUS_KINDS);
    for (const state of all) {
      if (state.safetyState === 'grounded') {
        expect(state.apparatusKind).toBe(APPARATUS_KIND.EARTHING_SWITCH);
      }
    }
  });
});
