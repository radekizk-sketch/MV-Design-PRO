import { describe, expect, it } from 'vitest';
import {
  analyzeSensitivity,
  classifySensitivity,
  describeSensitivity,
  findCompensationCandidates,
  simulateDerImpact,
} from '../sensitivityAnalyzer';

const points = [
  { busRef: 'bus-1', dUdP: 0.02, dUdQ: 0.08 },
  { busRef: 'bus-2', dUdP: 0.005, dUdQ: 0.03 },
  { busRef: 'bus-3', dUdP: 0.04, dUdQ: 0.10 },
];

describe('analyzeSensitivity', () => {
  it('zwraca summary z most sensitive + averages', () => {
    const r = analyzeSensitivity(points);
    expect(r.mostSensitiveToP?.busRef).toBe('bus-3');
    expect(r.mostSensitiveToQ?.busRef).toBe('bus-3');
    expect(r.averageSensitivityP).toBeCloseTo((0.02 + 0.005 + 0.04) / 3, 3);
  });

  it('puste points → null + 0 averages', () => {
    const r = analyzeSensitivity([]);
    expect(r.mostSensitiveToP).toBe(null);
    expect(r.mostSensitiveToQ).toBe(null);
    expect(r.averageSensitivityP).toBe(0);
  });

  it('respektuje znak (abs value)', () => {
    const negPoints = [
      { busRef: 'a', dUdP: -0.05, dUdQ: 0.01 },
      { busRef: 'b', dUdP: 0.02, dUdQ: 0.01 },
    ];
    const r = analyzeSensitivity(negPoints);
    expect(r.mostSensitiveToP?.busRef).toBe('a'); // abs(-0.05) > abs(0.02)
  });
});

describe('classifySensitivity', () => {
  it('low gdy |s| < 0.01', () => {
    expect(classifySensitivity(0.005)).toBe('low');
    expect(classifySensitivity(-0.008)).toBe('low');
  });
  it('medium gdy 0.01 ≤ |s| < 0.05', () => {
    expect(classifySensitivity(0.03)).toBe('medium');
    expect(classifySensitivity(-0.04)).toBe('medium');
  });
  it('high gdy |s| ≥ 0.05', () => {
    expect(classifySensitivity(0.08)).toBe('high');
    expect(classifySensitivity(-0.1)).toBe('high');
  });
});

describe('describeSensitivity', () => {
  it('zwraca PL opis z klasą', () => {
    const desc = describeSensitivity(points[2]);
    expect(desc).toContain('bus-3');
    expect(desc).toContain('medium');
    expect(desc).toContain('high');
  });
});

describe('findCompensationCandidates', () => {
  it('zwraca szyny z dU/dQ ≥ threshold', () => {
    const result = analyzeSensitivity(points);
    const candidates = findCompensationCandidates(result, 0.05);
    expect(candidates.map((c) => c.busRef)).toEqual(['bus-1', 'bus-3']);
  });

  it('default threshold = 0.05', () => {
    const result = analyzeSensitivity(points);
    expect(findCompensationCandidates(result)).toHaveLength(2);
  });
});

describe('simulateDerImpact', () => {
  it('linearyzacja: ΔU = dU/dP × ΔP + dU/dQ × ΔQ', () => {
    const result = analyzeSensitivity(points);
    const impact = simulateDerImpact(result, 1.0, 0.5);
    // bus-3: 0.04 × 1 + 0.10 × 0.5 = 0.09
    expect(impact[2].deltaUpu).toBeCloseTo(0.09, 3);
  });

  it('zwraca per-bus delta', () => {
    const result = analyzeSensitivity(points);
    const impact = simulateDerImpact(result, 1.0, 0);
    expect(impact).toHaveLength(3);
    expect(impact.every((i) => 'deltaUpu' in i)).toBe(true);
  });
});
