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

  // D2 (DECYZJE_ARCHITEKTONICZNE_2026-08): flaga powłoki V3 i jej gałąź
  // (CanonicalLayoutV3.tsx, skasowany w 3693c01e) USUNIĘTE na amen — powłoką
  // jest `ui2/shell/AppShell`. Test pilnuje ZAMKNIĘTEGO zbioru flag: każda
  // nowa albo wskrzeszona flaga musi tu przejść przez świadomą decyzję.
  // Nazwy skasowanej flagi celowo nie wymieniamy — zabrania jej
  // `scripts/nawigacja_jeden_kanon_guard.py` (reguła C).
  it('rejestr flag ma zamknięty zbiór czterech pozycji', () => {
    expect(Object.keys(featureFlags).sort()).toEqual([
      'ENABLE_MATH_RENDERING',
      'ENM_INSPECTOR_VISIBLE',
      'SLD_OVERLAY_DEMO_VISIBLE',
      'sldCadEditingEnabled',
    ]);
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
