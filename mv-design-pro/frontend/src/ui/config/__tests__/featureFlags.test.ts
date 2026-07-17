import { describe, expect, it } from 'vitest';

import { featureFlags, isFeatureEnabled } from '../featureFlags';

describe('featureFlags — Zadanie 11 UI/UX 100% (dev tools hidden default)', () => {
  it('ENABLE_MATH_RENDERING domyślnie ON', () => {
    expect(featureFlags.ENABLE_MATH_RENDERING).toBe(true);
  });

  it('sldCadEditingEnabled domyślnie OFF', () => {
    expect(featureFlags.sldCadEditingEnabled).toBe(false);
  });

  it('ENM_INSPECTOR_VISIBLE domyślnie OFF (dev tool ukryty)', () => {
    expect(featureFlags.ENM_INSPECTOR_VISIBLE).toBe(false);
  });

  it('SLD_OVERLAY_DEMO_VISIBLE domyślnie OFF (showcase ukryty)', () => {
    expect(featureFlags.SLD_OVERLAY_DEMO_VISIBLE).toBe(false);
  });

  it('USE_LAYOUT_V3 domyślnie OFF (V12 active)', () => {
    expect(featureFlags.USE_LAYOUT_V3).toBe(false);
  });


  it('isFeatureEnabled() zwraca prawidłową wartość', () => {
    expect(isFeatureEnabled('ENABLE_MATH_RENDERING')).toBe(true);
    expect(isFeatureEnabled('ENM_INSPECTOR_VISIBLE')).toBe(false);
    expect(isFeatureEnabled('SLD_OVERLAY_DEMO_VISIBLE')).toBe(false);
  });

  it('featureFlags jest immutable (frozen)', () => {
    expect(Object.isFrozen(featureFlags)).toBe(true);
  });
});
