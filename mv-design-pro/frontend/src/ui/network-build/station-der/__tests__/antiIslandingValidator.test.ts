import { describe, expect, it } from 'vitest';
import {
  classifyDerProtection,
  getStandardSettings,
  validateAntiIslanding,
} from '../antiIslandingValidator';

describe('classifyDerProtection', () => {
  it('< 800 kVA → typ_a', () => {
    expect(classifyDerProtection(500)).toBe('typ_a');
  });
  it('800-1000 kVA → typ_b', () => {
    expect(classifyDerProtection(900)).toBe('typ_b');
  });
  it('1-50 MVA → typ_c', () => {
    expect(classifyDerProtection(5000)).toBe('typ_c');
  });
  it('≥ 50 MVA → typ_d', () => {
    expect(classifyDerProtection(50000)).toBe('typ_d');
  });
});

describe('validateAntiIslanding — compliant', () => {
  it('typowe ustawienia PSE → compliant', () => {
    const r = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 500,
      settings: getStandardSettings('typ_a'),
    });
    expect(r.verdict).toBe('compliant');
    expect(r.passedChecks).toHaveLength(5);
    expect(r.issues).toHaveLength(0);
  });
});

describe('validateAntiIslanding — non-compliant', () => {
  it('27 ustawione na 0.3 (poza 0.5-0.95) → issue', () => {
    const settings = { ...getStandardSettings('typ_a'), underVoltagePu: 0.3 };
    const r = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 500,
      settings,
    });
    expect(r.issues.some((i) => i.includes('under-voltage'))).toBe(true);
  });

  it('81U=40Hz (poza zakresu) → issue', () => {
    const settings = { ...getStandardSettings('typ_a'), underFrequencyHz: 40 };
    const r = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 500,
      settings,
    });
    expect(r.issues.some((i) => i.includes('under-frequency'))).toBe(true);
  });

  it('ROCOF poniżej minimum → issue', () => {
    const settings = { ...getStandardSettings('typ_a'), rocofHzPerS: 0.5 };
    const r = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 500,
      settings,
    });
    expect(r.issues.some((i) => i.includes('ROCOF'))).toBe(true);
  });

  it('czas zadziałania > 0.5s → issue', () => {
    const settings = { ...getStandardSettings('typ_a'), underVoltageTimeS: 1.0 };
    const r = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 500,
      settings,
    });
    expect(r.issues.some((i) => i.includes('Czas zadziałania'))).toBe(true);
  });

  it('wiele violations → non_compliant + recommendation', () => {
    const settings = {
      ...getStandardSettings('typ_a'),
      underVoltagePu: 0.3,
      overVoltagePu: 1.5,
      underFrequencyHz: 30,
    };
    const r = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 500,
      settings,
    });
    expect(r.verdict).toBe('non_compliant');
    expect(r.recommendation).toContain('NC RfG');
  });

  it('1 violation → warning gdy 4 pozostałe checks pass', () => {
    const settings = { ...getStandardSettings('typ_a'), underVoltagePu: 0.3 };
    const r = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 500,
      settings,
    });
    expect(r.verdict).toBe('warning');
  });
});

describe('validateAntiIslanding — protection class', () => {
  it('rozróżnia typ a/b/c/d w wyniku', () => {
    const r500 = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 500,
      settings: getStandardSettings('typ_a'),
    });
    const r5000 = validateAntiIslanding({
      derType: 'PV',
      installedPowerKva: 5000,
      settings: getStandardSettings('typ_c'),
    });
    expect(r500.protectionClass).toBe('typ_a');
    expect(r5000.protectionClass).toBe('typ_c');
  });
});
