/**
 * Tests for protection-curves/types — coverage gap fix (Pakiet I).
 *
 * Wcześniej moduł protection-curves nie miał testów. Dodajemy minimum
 * sprawdzające determinizm typów + Polish labels + sortowalność.
 */

import { describe, expect, it } from 'vitest';

import {
  COORDINATION_STATUS_COLORS,
  CURVE_COLORS,
  DEFAULT_CHART_CONFIG,
  IEC_CURVE_OPTIONS,
  IEEE_CURVE_OPTIONS,
  PROTECTION_CURVES_LABELS,
} from '../types';
import type { CoordinationStatus, IECCurveType, IEEECurveType } from '../types';

describe('protection-curves/types — Polish labels + determinizm', () => {
  it('PROTECTION_CURVES_LABELS: tytuł w PL', () => {
    expect(PROTECTION_CURVES_LABELS.title).toMatch(/Edytor/);
  });

  it('PROTECTION_CURVES_LABELS.status: wszystkie 4 statusy mają etykiety', () => {
    const statuses: CoordinationStatus[] = [
      'COORDINATED',
      'MARGIN_LOW',
      'NOT_COORDINATED',
      'UNKNOWN',
    ];
    for (const s of statuses) {
      expect(PROTECTION_CURVES_LABELS.status[s]).toBeTruthy();
    }
    expect(PROTECTION_CURVES_LABELS.status.COORDINATED).toMatch(/Skoordyn/);
  });

  it('COORDINATION_STATUS_COLORS: 4 statusy mapowane na klasy Tailwind', () => {
    expect(Object.keys(COORDINATION_STATUS_COLORS)).toHaveLength(4);
    expect(COORDINATION_STATUS_COLORS.COORDINATED).toContain('emerald');
    expect(COORDINATION_STATUS_COLORS.NOT_COORDINATED).toContain('rose');
  });

  it('IEC_CURVE_OPTIONS: 5 typów (SI/VI/EI/LTI/DT)', () => {
    expect(IEC_CURVE_OPTIONS).toHaveLength(5);
    const values = IEC_CURVE_OPTIONS.map((o) => o.value).sort();
    expect(values).toEqual(['DT', 'EI', 'LTI', 'SI', 'VI']);
  });

  it('IEEE_CURVE_OPTIONS: 5 typów (MI/VI/EI/STI/DT)', () => {
    expect(IEEE_CURVE_OPTIONS).toHaveLength(5);
    const values: IEEECurveType[] = IEEE_CURVE_OPTIONS.map((o) => o.value);
    expect(values).toContain('MI');
    expect(values).toContain('STI');
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

  it('IEC i IEEE mają wspólne typy (VI, EI, DT) - świadome aliasing', () => {
    const iecVals = IEC_CURVE_OPTIONS.map((o) => o.value);
    const ieeeVals = IEEE_CURVE_OPTIONS.map((o) => o.value);
    const common = iecVals.filter((v) => ieeeVals.includes(v as IECCurveType));
    expect(common.sort()).toEqual(['DT', 'EI', 'VI']);
  });
});
