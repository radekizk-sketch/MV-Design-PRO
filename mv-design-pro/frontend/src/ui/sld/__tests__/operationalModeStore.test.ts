/**
 * Tests for K30-17 operationalModeStore.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { useOperationalModeStore, OPERATIONAL_MODE_LABELS_PL } from '../operationalModeStore';

describe('operationalModeStore', () => {
  beforeEach(() => {
    useOperationalModeStore.getState().reset();
  });

  it('default mode is NORMALNY', () => {
    expect(useOperationalModeStore.getState().mode).toBe('NORMALNY');
  });

  it('setMode updates state', () => {
    useOperationalModeStore.getState().setMode('SERVICE');
    expect(useOperationalModeStore.getState().mode).toBe('SERVICE');
    useOperationalModeStore.getState().setMode('FAULT');
    expect(useOperationalModeStore.getState().mode).toBe('FAULT');
  });

  it('reset returns to NORMALNY', () => {
    useOperationalModeStore.getState().setMode('REVIEW');
    useOperationalModeStore.getState().reset();
    expect(useOperationalModeStore.getState().mode).toBe('NORMALNY');
  });

  it('has Polish labels for all 4 modes', () => {
    expect(OPERATIONAL_MODE_LABELS_PL.NORMALNY).toBeTruthy();
    expect(OPERATIONAL_MODE_LABELS_PL.SERVICE).toBeTruthy();
    expect(OPERATIONAL_MODE_LABELS_PL.FAULT).toBeTruthy();
    expect(OPERATIONAL_MODE_LABELS_PL.REVIEW).toBeTruthy();
  });
});
