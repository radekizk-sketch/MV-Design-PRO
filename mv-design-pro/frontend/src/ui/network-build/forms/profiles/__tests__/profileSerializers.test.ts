/**
 * Tests for profileSerializers — Pakiet D fundament determinizmu.
 *
 * Sprawdza:
 *   - quantizeFloat: round-half-to-even, range
 *   - canonicalizeValue: lex sort kluczy, rekurencja, undefined skip
 *   - canonicalizeProfile: round-trip stability
 *   - validateMonotonic: asc/desc
 *   - validateRange: granice
 */

import { describe, expect, it } from 'vitest';

import {
  FLOAT_PRECISION,
  canonicalizeProfile,
  canonicalizeValue,
  quantizeFloat,
  validateMonotonic,
  validateRange,
} from '../profileSerializers';

describe('profileSerializers — fundament determinizmu', () => {
  describe('quantizeFloat', () => {
    it('zaokrągla do FLOAT_PRECISION miejsc', () => {
      expect(quantizeFloat(0.123456789)).toBe(0.123457);
      expect(quantizeFloat(1.0)).toBe(1.0);
      expect(quantizeFloat(-0.5)).toBe(-0.5);
    });

    it('FLOAT_PRECISION = 6 (binding)', () => {
      expect(FLOAT_PRECISION).toBe(6);
    });

    it('rzuca błąd dla NaN i Infinity', () => {
      expect(() => quantizeFloat(NaN)).toThrow(/non-finite/);
      expect(() => quantizeFloat(Infinity)).toThrow(/non-finite/);
      expect(() => quantizeFloat(-Infinity)).toThrow(/non-finite/);
    });

    it('Math.round — deterministyczne (round half toward +∞)', () => {
      // pozytywne half → góra: 0.1234565 → 0.123457 (lub 0.123456 zależnie od float repr)
      const r = quantizeFloat(0.1234565);
      expect([0.123456, 0.123457]).toContain(r);
      // negatywne half → góra (-0.5 → 0): Math.round(-0.5) = -0
      expect(Object.is(quantizeFloat(-0.0000005), -0)).toBe(true);
    });

    it('idempotency: quantize(quantize(x)) === quantize(x)', () => {
      const samples = [0.123456789, 1.5, -2.7182818, 100.000_001];
      for (const x of samples) {
        const q1 = quantizeFloat(x);
        const q2 = quantizeFloat(q1);
        expect(q2).toBe(q1);
      }
    });
  });

  describe('canonicalizeValue — sortowanie i rekurencja', () => {
    it('sortuje klucze obiektu lexycznie', () => {
      const v = canonicalizeValue({ b: 1, a: 2, c: 3 });
      expect(Object.keys(v as object)).toEqual(['a', 'b', 'c']);
    });

    it('zachowuje kolejność tablic (znaczy dla profili czasowych)', () => {
      const v = canonicalizeValue([3, 1, 2]);
      expect(v).toEqual([3, 1, 2]);
    });

    it('rekurencja: zagnieżdżone obiekty sortowane', () => {
      const v = canonicalizeValue({ z: { y: 1, x: 2 }, a: 3 });
      const json = JSON.stringify(v);
      expect(json).toBe('{"a":3,"z":{"x":2,"y":1}}');
    });

    it('pomija undefined (jak JSON.stringify)', () => {
      const v = canonicalizeValue({ a: 1, b: undefined, c: 3 });
      const json = JSON.stringify(v);
      expect(json).toBe('{"a":1,"c":3}');
    });

    it('null → null', () => {
      expect(canonicalizeValue(null)).toBe(null);
      expect(canonicalizeValue({ a: null })).toEqual({ a: null });
    });

    it('rzuca błąd dla function/symbol', () => {
      expect(() => canonicalizeValue(() => 0)).toThrow();
      expect(() => canonicalizeValue(Symbol('x'))).toThrow();
    });
  });

  describe('canonicalizeProfile — round-trip stability', () => {
    it('te same dane → ten sam string (różna kolejność kluczy)', () => {
      const a = canonicalizeProfile({ kind: 'qu', points: [{ u_pu: 1.0, q_mvar: 0 }] });
      const b = canonicalizeProfile({ points: [{ q_mvar: 0, u_pu: 1.0 }], kind: 'qu' });
      expect(a).toBe(b);
    });

    it('round-trip: parse → canonicalize → ten sam wynik', () => {
      const profile = {
        kind: 'qu',
        points: [
          { u_pu: 0.95, q_mvar: -0.5 },
          { u_pu: 1.0, q_mvar: 0 },
          { u_pu: 1.05, q_mvar: 0.5 },
        ],
        hysteresis_pu: 0.01,
      };
      const json1 = canonicalizeProfile(profile);
      const parsed = JSON.parse(json1);
      const json2 = canonicalizeProfile(parsed);
      expect(json2).toBe(json1);
    });

    it('różne dane → różny string', () => {
      const a = canonicalizeProfile({ x: 1 });
      const b = canonicalizeProfile({ x: 2 });
      expect(a).not.toBe(b);
    });

    it('determinizm: 100 wywołań → ten sam wynik', () => {
      const profile = { points: [{ u_pu: 1.0, q_mvar: 0.5 }] };
      const first = canonicalizeProfile(profile);
      for (let i = 0; i < 100; i += 1) {
        expect(canonicalizeProfile(profile)).toBe(first);
      }
    });
  });

  describe('validateMonotonic', () => {
    it('asc: poprawny wzrost', () => {
      const points = [{ x: 1 }, { x: 2 }, { x: 3 }];
      expect(validateMonotonic(points, 'x', 'asc')).toBeNull();
    });

    it('asc: równość = naruszenie (strict)', () => {
      const points = [{ x: 1 }, { x: 1 }];
      expect(validateMonotonic(points, 'x', 'asc')).toMatch(/Monotonicity violation/);
    });

    it('asc: malejące = naruszenie', () => {
      const points = [{ x: 2 }, { x: 1 }];
      expect(validateMonotonic(points, 'x', 'asc')).toMatch(/Monotonicity violation/);
    });

    it('desc: poprawne malenie', () => {
      const points = [{ x: 3 }, { x: 2 }, { x: 1 }];
      expect(validateMonotonic(points, 'x', 'desc')).toBeNull();
    });

    it('1-element / pusta → OK', () => {
      expect(validateMonotonic([], 'x', 'asc')).toBeNull();
      expect(validateMonotonic([{ x: 1 }], 'x', 'asc')).toBeNull();
    });
  });

  describe('validateRange', () => {
    it('wszystkie w zakresie → null', () => {
      const points = [{ v: -1 }, { v: 0 }, { v: 1 }];
      expect(validateRange(points, 'v', -1, 1)).toBeNull();
    });

    it('poza zakresem → opis', () => {
      const points = [{ v: 0 }, { v: 2 }];
      expect(validateRange(points, 'v', -1, 1)).toMatch(/Range violation/);
    });

    it('granice są inkluzywne', () => {
      const points = [{ v: 1 }];
      expect(validateRange(points, 'v', 0, 1)).toBeNull();
      expect(validateRange(points, 'v', 0, 0.99)).toMatch(/Range violation/);
    });
  });
});
