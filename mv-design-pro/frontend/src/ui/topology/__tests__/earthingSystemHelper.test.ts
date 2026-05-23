import { describe, expect, it } from 'vitest';
import {
  validateEarthingConfig,
  describeEarthingType,
  type EarthingConfig,
} from '../earthingSystemHelper';

describe('validateEarthingConfig — nN', () => {
  it('TN-S 0.4 kV → valid', () => {
    const r = validateEarthingConfig(
      { type: 'TN-S', voltageLevel: 'nN' },
      0.4,
    );
    expect(r.isValid).toBe(true);
  });

  it('TN-C 0.4 kV → valid', () => {
    expect(validateEarthingConfig({ type: 'TN-C', voltageLevel: 'nN' }, 0.4).isValid).toBe(true);
  });

  it('Petersen na nN → invalid', () => {
    const r = validateEarthingConfig({ type: 'Petersen', voltageLevel: 'nN' }, 0.4);
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('nieprawidłowy');
  });

  it('TN-S 100 kV → ostrzeżenie o nietypowym napięciu', () => {
    const r = validateEarthingConfig({ type: 'TN-S', voltageLevel: 'nN' }, 100);
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('nietypowe'))).toBe(true);
  });
});

describe('validateEarthingConfig — SN', () => {
  it('Petersen 15 kV → valid (z parametrami)', () => {
    const r = validateEarthingConfig(
      { type: 'Petersen', voltageLevel: 'SN', petersenInductanceMh: 1500 },
      15,
    );
    expect(r.isValid).toBe(true);
    expect(r.faultCurrentA).toBeGreaterThan(0);
  });

  it('Resistor 15 kV bez R_n → invalid', () => {
    const r = validateEarthingConfig({ type: 'Resistor', voltageLevel: 'SN' }, 15);
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('Brak');
    expect(r.recommendation).toContain('PN-EN 50522');
  });

  it('Resistor 15 kV z R_n=20 → valid + faultCurrent', () => {
    const r = validateEarthingConfig(
      { type: 'Resistor', voltageLevel: 'SN', resistorOhm: 20 },
      15,
    );
    expect(r.isValid).toBe(true);
    // I_fault = (15000/√3) / 20 ≈ 433 A
    expect(r.faultCurrentA).toBeGreaterThan(400);
    expect(r.faultCurrentA).toBeLessThan(500);
  });

  it('Resistor R_n=2 (poza zakresem 5-100) → invalid', () => {
    const r = validateEarthingConfig(
      { type: 'Resistor', voltageLevel: 'SN', resistorOhm: 2 },
      15,
    );
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('poza typowym zakresem'))).toBe(true);
  });

  it('TN-S na SN → invalid', () => {
    const r = validateEarthingConfig({ type: 'TN-S', voltageLevel: 'SN' }, 15);
    expect(r.isValid).toBe(false);
  });
});

describe('describeEarthingType', () => {
  it('zwraca opis PL dla każdego typu', () => {
    expect(describeEarthingType('Petersen')).toContain('Petersena');
    expect(describeEarthingType('TN-S')).toContain('PE');
    expect(describeEarthingType('Resistor')).toContain('rezystor');
    expect(describeEarthingType('IT')).toContain('izolowany');
  });
});
