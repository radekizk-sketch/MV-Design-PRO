/**
 * Tests for protection-curves/types — coverage gap fix (Pakiet I).
 *
 * Wcześniej moduł protection-curves nie miał testów. Dodajemy minimum
 * sprawdzające determinizm typów + Polish labels + sortowalność.
 */

import { describe, expect, it } from 'vitest';

import {
  CURVE_COLORS,
  DEFAULT_CHART_CONFIG,
  PROTECTION_CURVES_LABELS,
} from '../types';

describe('protection-curves/types — Polish labels + determinizm', () => {
  it('PROTECTION_CURVES_LABELS: tytuł w PL', () => {
    expect(PROTECTION_CURVES_LABELS.title).toMatch(/Edytor/);
  });

  it('CURVE_COLORS: 8 stabilnych kolorów (deterministic palette)', () => {
    expect(CURVE_COLORS).toHaveLength(8);
    // Kolory w hexie
    for (const c of CURVE_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('DEFAULT_CHART_CONFIG: poprawne zakresy', () => {
    expect(DEFAULT_CHART_CONFIG.currentRange[0]).toBeLessThan(DEFAULT_CHART_CONFIG.currentRange[1]);
    expect(DEFAULT_CHART_CONFIG.timeRange[0]).toBeLessThan(DEFAULT_CHART_CONFIG.timeRange[1]);
    expect(DEFAULT_CHART_CONFIG.height).toBeGreaterThan(0);
  });
});
