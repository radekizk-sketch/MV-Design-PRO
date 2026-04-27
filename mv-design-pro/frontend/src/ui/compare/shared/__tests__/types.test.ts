/**
 * Tests for compare/shared/types — Pakiet I.
 */

import { describe, expect, it } from 'vitest';

import {
  DIFF_SEVERITY_LABELS_PL,
  DIFF_SEVERITY_ORDER,
  computeDeltaPercent,
  filterByMinSeverity,
  sortBySeverityDesc,
} from '../types';
import type { ComparisonRow } from '../types';

const ROWS: ComparisonRow[] = [
  { metric_label: 'Napięcie szyny X', value_a: 10, value_b: 10.05, severity: 'minor' },
  { metric_label: 'Napięcie szyny A', value_a: 10, value_b: 12, severity: 'critical' },
  { metric_label: 'Napięcie szyny B', value_a: 10, value_b: 10.5, severity: 'major' },
  { metric_label: 'Napięcie szyny Y', value_a: 10, value_b: 10, severity: 'none' },
];

describe('compare/shared/types — wspólne typy + helper functions', () => {
  it('DIFF_SEVERITY_LABELS_PL ma 5 wpisów w PL', () => {
    expect(Object.keys(DIFF_SEVERITY_LABELS_PL)).toHaveLength(5);
    expect(DIFF_SEVERITY_LABELS_PL.critical).toBe('Krytyczna');
  });

  it('DIFF_SEVERITY_LABELS_PL i ORDER są frozen (determinism)', () => {
    expect(Object.isFrozen(DIFF_SEVERITY_LABELS_PL)).toBe(true);
    expect(Object.isFrozen(DIFF_SEVERITY_ORDER)).toBe(true);
  });

  it('sortBySeverityDesc: critical → major → minor → none', () => {
    const sorted = sortBySeverityDesc(ROWS);
    expect(sorted[0].severity).toBe('critical');
    expect(sorted[1].severity).toBe('major');
    expect(sorted[2].severity).toBe('minor');
    expect(sorted[3].severity).toBe('none');
  });

  it('sortBySeverityDesc: tie-break po metric_label ASC', () => {
    const tied: ComparisonRow[] = [
      { metric_label: 'Z', value_a: 1, value_b: 1, severity: 'minor' },
      { metric_label: 'A', value_a: 1, value_b: 1, severity: 'minor' },
    ];
    const sorted = sortBySeverityDesc(tied);
    expect(sorted[0].metric_label).toBe('A');
    expect(sorted[1].metric_label).toBe('Z');
  });

  it('sortBySeverityDesc: nie mutuje wejścia', () => {
    const input = [...ROWS];
    sortBySeverityDesc(input);
    expect(input).toEqual(ROWS);
  });

  it('filterByMinSeverity: critical only', () => {
    const result = filterByMinSeverity(ROWS, 'critical');
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('critical');
  });

  it('filterByMinSeverity: major+ → 2 wpisy', () => {
    const result = filterByMinSeverity(ROWS, 'major');
    expect(result).toHaveLength(2);
  });

  it('filterByMinSeverity: none → wszystkie', () => {
    const result = filterByMinSeverity(ROWS, 'none');
    expect(result).toHaveLength(4);
  });

  it('computeDeltaPercent: numeric values', () => {
    expect(computeDeltaPercent(10, 12)).toBeCloseTo(20);
    expect(computeDeltaPercent(100, 95)).toBeCloseTo(-5);
  });

  it('computeDeltaPercent: A === 0 → undefined', () => {
    expect(computeDeltaPercent(0, 5)).toBeUndefined();
  });

  it('computeDeltaPercent: non-numeric → undefined', () => {
    expect(computeDeltaPercent('abc', 10)).toBeUndefined();
    expect(computeDeltaPercent(10, 'def')).toBeUndefined();
  });

  it('computeDeltaPercent: stringy numeric → liczby', () => {
    expect(computeDeltaPercent('10', '11')).toBeCloseTo(10);
  });

  it('determinizm: sortBySeverityDesc 100× → ten sam wynik', () => {
    const first = JSON.stringify(sortBySeverityDesc(ROWS));
    for (let i = 0; i < 100; i += 1) {
      expect(JSON.stringify(sortBySeverityDesc(ROWS))).toBe(first);
    }
  });
});
