import { describe, expect, it } from 'vitest';
import {
  validateApparatusSequence,
  describeSequence,
  suggestApparatusForRole,
} from '../bayApparatusBuilder';

describe('validateApparatusSequence', () => {
  it('OUT z DS+CB+CT+ES → valid', () => {
    const r = validateApparatusSequence('OUT', ['DS', 'CB', 'CT', 'ES']);
    expect(r.isValid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('OUT bez DS przed CB → issue', () => {
    const r = validateApparatusSequence('OUT', ['CB', 'CT', 'ES']);
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('widzialnej przerwy'))).toBe(true);
  });

  it('ES jako pierwszy → issue', () => {
    const r = validateApparatusSequence('OUT', ['ES', 'DS', 'CB']);
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('pierwszym'))).toBe(true);
  });

  it('LBS + CB razem → issue', () => {
    const r = validateApparatusSequence('OUT', ['DS', 'LBS', 'CB', 'CT']);
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('LBS i CB'))).toBe(true);
  });

  it('MEASUREMENT z CB → issue', () => {
    const r = validateApparatusSequence('MEASUREMENT', ['VT', 'CB']);
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('wyłącznika'))).toBe(true);
  });

  it('TR bez CT → issue (wymóg 87T)', () => {
    const r = validateApparatusSequence('TR', ['DS', 'CB', 'ES']);
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('87T'))).toBe(true);
  });

  it('OZE bez CT → issue', () => {
    const r = validateApparatusSequence('OZE', ['DS', 'CB', 'ES']);
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('OZE'))).toBe(true);
  });

  it('COUPLER z DS+CB → valid', () => {
    const r = validateApparatusSequence('COUPLER', ['DS', 'CB']);
    expect(r.isValid).toBe(true);
  });
});

describe('describeSequence', () => {
  it('zwraca PL labels z separatorem →', () => {
    expect(describeSequence(['DS', 'CB', 'CT', 'ES'])).toBe(
      'Odłącznik szynowy → Wyłącznik mocy → Przekładnik prądowy → Uziemnik (Earth Switch)',
    );
  });
});

describe('suggestApparatusForRole', () => {
  it('OUT: DS+CB+CT+ES', () => {
    const { sequence } = suggestApparatusForRole('OUT');
    expect(sequence).toEqual(['DS', 'CB', 'CT', 'ES']);
  });
  it('MEASUREMENT: VT+FUSE', () => {
    const { sequence } = suggestApparatusForRole('MEASUREMENT');
    expect(sequence).toEqual(['VT', 'FUSE']);
  });
  it('description = describeSequence', () => {
    const { description } = suggestApparatusForRole('TR');
    expect(description).toContain('Wyłącznik mocy');
  });
});
