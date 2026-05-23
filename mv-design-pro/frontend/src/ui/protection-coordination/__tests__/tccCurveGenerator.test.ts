import { describe, expect, it } from 'vitest';
import {
  CURVE_CONSTANTS,
  curveTime,
  generateCurvePoints,
  operateTimeAt,
  describeCurveStandard,
} from '../tccCurveGenerator';

describe('CURVE_CONSTANTS', () => {
  it('IEC_SI: k=0.14, α=0.02', () => {
    expect(CURVE_CONSTANTS.IEC_SI.k).toBe(0.14);
    expect(CURVE_CONSTANTS.IEC_SI.alpha).toBe(0.02);
  });

  it('IEC_EI: k=80, α=2', () => {
    expect(CURVE_CONSTANTS.IEC_EI.k).toBe(80);
    expect(CURVE_CONSTANTS.IEC_EI.alpha).toBe(2);
  });

  it('IEEE_MI ma B offset', () => {
    expect(CURVE_CONSTANTS.IEEE_MI.B).toBeDefined();
    expect(CURVE_CONSTANTS.IEEE_MI.B).toBeCloseTo(0.114);
  });
});

describe('curveTime', () => {
  it('IEC_SI: TMS=0.1, I/Ip=10 → ~0.30s', () => {
    // t = 0.1 × 0.14 / (10^0.02 - 1) ≈ 0.297s
    const t = curveTime('IEC_SI', 0.1, 100, 1000);
    expect(t).toBeGreaterThan(0.28);
    expect(t).toBeLessThan(0.32);
  });

  it('DT: zwraca tylko TMS', () => {
    expect(curveTime('DT', 0.5, 100, 1000)).toBe(0.5);
  });

  it('I ≤ pickup → Infinity', () => {
    expect(curveTime('IEC_SI', 0.1, 100, 50)).toBe(Infinity);
    expect(curveTime('IEC_SI', 0.1, 100, 100)).toBe(Infinity);
  });

  it('IEEE_MI ma constant B w wzorze (offset)', () => {
    // IEEE_MI: t = TMS × (k/(M^α - 1) + B)
    // dla I/Ip=10, TMS=0.1: t = 0.1 × (0.0515/(10^0.02 - 1) + 0.114)
    const ieee = curveTime('IEEE_MI', 0.1, 100, 1000);
    // bez offset B czas byłby ~0.108s; z B=0.114 dodaje ~0.0114s
    expect(ieee).toBeGreaterThan(0.11);
    expect(ieee).toBeLessThan(0.14);
  });

  it('Definite time addition', () => {
    const baseT = curveTime('IEC_SI', 0.1, 100, 1000);
    const offsetT = curveTime('IEC_SI', 0.1, 100, 1000, 0.5);
    expect(offsetT - baseT).toBeCloseTo(0.5);
  });
});

describe('generateCurvePoints', () => {
  it('zwraca punkty dla zakresu', () => {
    const points = generateCurvePoints({
      standard: 'IEC_SI',
      tms: 0.1,
      pickupCurrentA: 100,
    });
    expect(points.length).toBeGreaterThan(20);
    expect(points[0].currentA).toBeCloseTo(120, 0);
  });

  it('punkty są monotonicznie rosnące w prądzie', () => {
    const points = generateCurvePoints({
      standard: 'IEC_SI',
      tms: 0.1,
      pickupCurrentA: 100,
    });
    for (let i = 1; i < points.length; i++) {
      expect(points[i].currentA).toBeGreaterThanOrEqual(points[i - 1].currentA);
    }
  });

  it('punkty mają malejący czas (krzywa odwrotna)', () => {
    const points = generateCurvePoints({
      standard: 'IEC_SI',
      tms: 0.1,
      pickupCurrentA: 100,
      minMultiple: 2,
      maxMultiple: 50,
    });
    expect(points[0].timeS).toBeGreaterThan(points[points.length - 1].timeS);
  });

  it('DT: 2 punkty (poziomy)', () => {
    const points = generateCurvePoints({
      standard: 'DT',
      tms: 0.3,
      pickupCurrentA: 100,
    });
    expect(points).toHaveLength(2);
    expect(points[0].timeS).toBe(0.3);
    expect(points[1].timeS).toBe(0.3);
  });
});

describe('operateTimeAt', () => {
  it('= curveTime alias', () => {
    expect(operateTimeAt('IEC_SI', 0.1, 100, 1000)).toBe(
      curveTime('IEC_SI', 0.1, 100, 1000),
    );
  });
});

describe('describeCurveStandard', () => {
  it('zwraca PL opis dla każdego standardu', () => {
    expect(describeCurveStandard('IEC_SI')).toContain('uniwersalna');
    expect(describeCurveStandard('IEC_EI')).toContain('najszybsza');
    expect(describeCurveStandard('DT')).toContain('stały czas');
  });
});
