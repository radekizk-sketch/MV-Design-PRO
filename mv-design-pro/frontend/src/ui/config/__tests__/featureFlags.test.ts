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

  // D2 (DECYZJE_ARCHITEKTONICZNE_2026-08): flaga USE_LAYOUT_V3 i jej gałąź
  // (CanonicalLayoutV3.tsx, skasowany w 3693c01e) USUNIĘTE na amen — powłoką
  // jest `ui2/shell/AppShell`. Zapadka: `scripts/nawigacja_jeden_kanon_guard.py`
  // (reguła C) pilnuje, że nazwa flagi nie wraca do kodu.
  it('rejestr flag nie zawiera martwej flagi powłoki V3', () => {
    expect(Object.keys(featureFlags)).not.toContain('USE_LAYOUT_V3');
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
