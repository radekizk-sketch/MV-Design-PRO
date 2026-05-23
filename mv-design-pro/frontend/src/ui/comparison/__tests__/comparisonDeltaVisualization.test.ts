import { describe, expect, it } from 'vitest';
import {
  classifyDirection,
  severityScore,
  buildDeltaVisualization,
  summarizeDeltaVisualization,
} from '../comparisonDeltaVisualization';

describe('classifyDirection', () => {
  it('voltage_pu: increase → improved', () => {
    expect(classifyDirection('voltage_pu', 0.06)).toBe('improved');
  });
  it('voltage_pu: decrease → degraded', () => {
    expect(classifyDirection('voltage_pu', -0.06)).toBe('degraded');
  });
  it('losses: increase → degraded', () => {
    expect(classifyDirection('losses', 0.10)).toBe('degraded');
  });
  it('losses: decrease → improved', () => {
    expect(classifyDirection('losses', -0.10)).toBe('improved');
  });
  it('|delta| < 5% → unchanged', () => {
    expect(classifyDirection('losses', 0.02)).toBe('unchanged');
    expect(classifyDirection('voltage_pu', 0.04)).toBe('unchanged');
  });
  it('unknown metric: default higher=better', () => {
    expect(classifyDirection('custom', 0.10)).toBe('improved');
  });
});

describe('severityScore', () => {
  it('0% → 0, 50% → 50, 100% → 100', () => {
    expect(severityScore(0)).toBe(0);
    expect(severityScore(0.5)).toBe(50);
    expect(severityScore(1.0)).toBe(100);
  });

  it('clip do 100', () => {
    expect(severityScore(2.0)).toBe(100);
  });

  it('absolute value', () => {
    expect(severityScore(-0.5)).toBe(50);
  });
});

describe('buildDeltaVisualization', () => {
  const entries = [
    { elementRef: 'bus-1', valueA: 1.0, valueB: 1.07, deltaAbsolute: 0.07, deltaRelative: 0.07, metric: 'voltage_pu' },
    { elementRef: 'bus-2', valueA: 100, valueB: 110, deltaAbsolute: 10, deltaRelative: 0.1, metric: 'losses' },
    { elementRef: 'bus-3', valueA: 1.0, valueB: 1.01, deltaAbsolute: 0.01, deltaRelative: 0.01, metric: 'voltage_pu' },
  ];

  it('zwraca DeltaVisualizationEntry z color/direction/label', () => {
    const result = buildDeltaVisualization(entries);
    expect(result).toHaveLength(3);
    expect(result[0].direction).toBe('improved');
    expect(result[0].color).toMatch(/^#/);
    expect(result[1].direction).toBe('degraded');
    expect(result[2].direction).toBe('unchanged');
  });
});

describe('summarizeDeltaVisualization', () => {
  const entries = [
    { elementRef: 'bus-1', valueA: 1.0, valueB: 1.07, deltaAbsolute: 0.07, deltaRelative: 0.07, metric: 'voltage_pu' },
    { elementRef: 'bus-2', valueA: 100, valueB: 120, deltaAbsolute: 20, deltaRelative: 0.2, metric: 'losses' },
    { elementRef: 'bus-3', valueA: 1.0, valueB: 1.01, deltaAbsolute: 0.01, deltaRelative: 0.01, metric: 'voltage_pu' },
  ];

  it('zlicza improved/degraded/unchanged', () => {
    const viz = buildDeltaVisualization(entries);
    const summary = summarizeDeltaVisualization(viz);
    expect(summary.improvedCount).toBe(1);
    expect(summary.degradedCount).toBe(1);
    expect(summary.unchangedCount).toBe(1);
  });

  it('worstDegradation + bestImprovement', () => {
    const viz = buildDeltaVisualization(entries);
    const summary = summarizeDeltaVisualization(viz);
    expect(summary.worstDegradation?.elementRef).toBe('bus-2');
    expect(summary.bestImprovement?.elementRef).toBe('bus-1');
  });

  it('puste entries → null worst/best', () => {
    const summary = summarizeDeltaVisualization([]);
    expect(summary.worstDegradation).toBe(null);
    expect(summary.bestImprovement).toBe(null);
  });
});
