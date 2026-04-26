/**
 * Tests for profileTypes — walidacja długości, agregacje 8760h, CSV.
 */

import { describe, expect, it } from 'vitest';

import {
  WORK_PROFILE_LENGTH,
  aggregateTo168h,
  aggregateTo24h,
  aggregateToMonthly,
  parseWorkProfileCsv,
  validateWorkProfileLength,
} from '../profileTypes';

describe('profileTypes — work profile (8760h, agregacje, CSV)', () => {
  describe('WORK_PROFILE_LENGTH', () => {
    it('hourly_24 = 24, hourly_168 = 168, hourly_8760 = 8760', () => {
      expect(WORK_PROFILE_LENGTH.hourly_24).toBe(24);
      expect(WORK_PROFILE_LENGTH.hourly_168).toBe(168);
      expect(WORK_PROFILE_LENGTH.hourly_8760).toBe(8760);
    });

    it('jest zamrożona', () => {
      expect(Object.isFrozen(WORK_PROFILE_LENGTH)).toBe(true);
    });
  });

  describe('validateWorkProfileLength', () => {
    it('poprawna długość → null', () => {
      expect(
        validateWorkProfileLength({
          kind: 'work',
          resolution: 'hourly_24',
          values: new Array(24).fill(0.5),
        }),
      ).toBeNull();
    });

    it('niepoprawna długość → opis', () => {
      const result = validateWorkProfileLength({
        kind: 'work',
        resolution: 'hourly_24',
        values: [0.5],
      });
      expect(result).toMatch(/length=1, expected=24/);
    });
  });

  describe('aggregateTo24h', () => {
    it('rzuca dla niepoprawnej długości', () => {
      expect(() => aggregateTo24h([1, 2, 3])).toThrow(/expected 8760/);
    });

    it('stała wartość 1.0 → 24× 1.0', () => {
      const arr = new Array(8760).fill(1.0);
      const result = aggregateTo24h(arr);
      expect(result).toHaveLength(24);
      for (const v of result) expect(v).toBeCloseTo(1.0);
    });

    it('wartość = i % 24 → średnia per godzina = i', () => {
      const arr: number[] = [];
      for (let i = 0; i < 8760; i += 1) arr.push(i % 24);
      const result = aggregateTo24h(arr);
      for (let h = 0; h < 24; h += 1) {
        expect(result[h]).toBeCloseTo(h);
      }
    });
  });

  describe('aggregateTo168h', () => {
    it('zwraca 168 wartości', () => {
      const arr = new Array(8760).fill(0.5);
      const result = aggregateTo168h(arr);
      expect(result).toHaveLength(168);
    });

    it('wartość = i % 168 → średnia per godzina tygodnia = i', () => {
      const arr: number[] = [];
      for (let i = 0; i < 8760; i += 1) arr.push(i % 168);
      const result = aggregateTo168h(arr);
      for (let h = 0; h < 168; h += 1) {
        expect(result[h]).toBeCloseTo(h);
      }
    });
  });

  describe('aggregateToMonthly', () => {
    it('zwraca 12 wartości', () => {
      const arr = new Array(8760).fill(0.5);
      const result = aggregateToMonthly(arr);
      expect(result).toHaveLength(12);
      for (const v of result) expect(v).toBeCloseTo(0.5);
    });

    it('rzuca dla niepoprawnej długości', () => {
      expect(() => aggregateToMonthly([1, 2, 3])).toThrow(/expected 8760/);
    });
  });

  describe('parseWorkProfileCsv', () => {
    it('parsuje 1 kolumnę bez nagłówka', () => {
      const csv = '0.1\n0.2\n0.3';
      expect(parseWorkProfileCsv(csv)).toEqual([0.1, 0.2, 0.3]);
    });

    it('pomija nagłówek (non-numeric pierwsza linia)', () => {
      const csv = 'value\n0.1\n0.2';
      expect(parseWorkProfileCsv(csv)).toEqual([0.1, 0.2]);
    });

    it('rzuca dla non-numeric w środku', () => {
      const csv = '0.1\nXYZ\n0.3';
      expect(() => parseWorkProfileCsv(csv)).toThrow(/non-numeric/);
    });

    it('obsługuje CRLF', () => {
      const csv = '0.1\r\n0.2\r\n0.3';
      expect(parseWorkProfileCsv(csv)).toEqual([0.1, 0.2, 0.3]);
    });

    it('pomija puste linie', () => {
      const csv = '0.1\n\n0.2\n  \n0.3';
      expect(parseWorkProfileCsv(csv)).toEqual([0.1, 0.2, 0.3]);
    });

    it('bierze pierwszą kolumnę (CSV multi-col)', () => {
      const csv = '0.1,extra\n0.2,extra';
      expect(parseWorkProfileCsv(csv)).toEqual([0.1, 0.2]);
    });

    it('pusty input → []', () => {
      expect(parseWorkProfileCsv('')).toEqual([]);
      expect(parseWorkProfileCsv('\n\n')).toEqual([]);
    });
  });
});
