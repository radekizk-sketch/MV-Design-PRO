import { describe, expect, it } from 'vitest';
import {
  classifyCableLoading,
  buildCableLoadingEntry,
  buildCableLoadingOverlay,
  summarizeCableLoading,
} from '../cableLoadingOverlay';

describe('classifyCableLoading', () => {
  it('≤50% → low', () => {
    expect(classifyCableLoading(0.3)).toBe('low');
    expect(classifyCableLoading(0.5)).toBe('low');
  });
  it('50-80% → normal', () => {
    expect(classifyCableLoading(0.6)).toBe('normal');
    expect(classifyCableLoading(0.8)).toBe('normal');
  });
  it('80-100% → high', () => {
    expect(classifyCableLoading(0.85)).toBe('high');
    expect(classifyCableLoading(1.0)).toBe('high');
  });
  it('>100% → overload', () => {
    expect(classifyCableLoading(1.1)).toBe('overload');
  });
});

describe('buildCableLoadingEntry', () => {
  it('zwraca entry z color/strokeWidth/label', () => {
    const e = buildCableLoadingEntry({
      cableRef: 'cable-1',
      loadCurrentA: 200,
      ampacityA: 285,
    });
    expect(e.verdict).toBe('normal');
    expect(e.color).toMatch(/^#/);
    expect(e.strokeWidth).toBeGreaterThan(0);
    expect(e.utilizationPercent).toBeCloseTo(70.2, 1);
  });

  it('overload gdy load > ampacity', () => {
    const e = buildCableLoadingEntry({
      cableRef: 'cable-1',
      loadCurrentA: 350,
      ampacityA: 285,
    });
    expect(e.verdict).toBe('overload');
    expect(e.utilizationPercent).toBeGreaterThan(100);
  });

  it('ampacity=0 → utilization=0', () => {
    const e = buildCableLoadingEntry({
      cableRef: 'cable-1',
      loadCurrentA: 100,
      ampacityA: 0,
    });
    expect(e.utilizationPercent).toBe(0);
    expect(e.verdict).toBe('low');
  });
});

describe('buildCableLoadingOverlay + summary', () => {
  const inputs = [
    { cableRef: 'c1', loadCurrentA: 100, ampacityA: 285 },
    { cableRef: 'c2', loadCurrentA: 250, ampacityA: 285 },
    { cableRef: 'c3', loadCurrentA: 320, ampacityA: 285 },
  ];

  it('builds overlay entries', () => {
    const overlay = buildCableLoadingOverlay(inputs);
    expect(overlay).toHaveLength(3);
  });

  it('summary: total / overloaded / worst', () => {
    const overlay = buildCableLoadingOverlay(inputs);
    const summary = summarizeCableLoading(overlay);
    expect(summary.totalCables).toBe(3);
    expect(summary.overloaded).toBe(1);
    expect(summary.worstCase?.cableRef).toBe('c3');
  });

  it('empty input → safe defaults', () => {
    const s = summarizeCableLoading([]);
    expect(s.totalCables).toBe(0);
    expect(s.worstCase).toBe(null);
  });
});
