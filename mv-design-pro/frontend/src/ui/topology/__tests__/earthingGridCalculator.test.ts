import { describe, expect, it } from 'vitest';
import {
  calculateGridResistance,
  validateGridForFaultCurrent,
  estimateRequiredConductorLength,
} from '../earthingGridCalculator';

describe('calculateGridResistance', () => {
  it('typowa GPZ: 100 Ω·m, 200 m przewodów, 100 m², 0.5 m głęb.', () => {
    const r = calculateGridResistance({
      soilResistivityOhmM: 100,
      totalConductorLengthM: 200,
      gridAreaM2: 100,
      depthM: 0.5,
    });
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(10);
  });

  it('Infinity gdy parametry ≤ 0', () => {
    expect(calculateGridResistance({
      soilResistivityOhmM: 0,
      totalConductorLengthM: 100,
      gridAreaM2: 100,
      depthM: 0.5,
    })).toBe(Infinity);
  });

  it('wyższa rezystywność → wyższa R_g', () => {
    const low = calculateGridResistance({
      soilResistivityOhmM: 50,
      totalConductorLengthM: 200,
      gridAreaM2: 100,
      depthM: 0.5,
    });
    const high = calculateGridResistance({
      soilResistivityOhmM: 500,
      totalConductorLengthM: 200,
      gridAreaM2: 100,
      depthM: 0.5,
    });
    expect(high).toBeGreaterThan(low);
  });
});

describe('validateGridForFaultCurrent', () => {
  it('compliant gdy bardzo niski prąd zwarciowy', () => {
    const r = validateGridForFaultCurrent(
      {
        soilResistivityOhmM: 50,
        totalConductorLengthM: 500,
        gridAreaM2: 200,
        depthM: 0.6,
      },
      20,
    );
    expect(r.isCompliant).toBe(true);
  });

  it('non-compliant gdy U_t > 50V', () => {
    const r = validateGridForFaultCurrent(
      {
        soilResistivityOhmM: 1000,
        totalConductorLengthM: 50,
        gridAreaM2: 50,
        depthM: 0.5,
      },
      5000,
    );
    expect(r.isCompliant).toBe(false);
    expect(r.recommendations.some((rec) => rec.includes('dotykowe'))).toBe(true);
  });

  it('recommendations gdy R_g > 5 Ω', () => {
    const r = validateGridForFaultCurrent(
      {
        soilResistivityOhmM: 500,
        totalConductorLengthM: 50,
        gridAreaM2: 30,
        depthM: 0.5,
      },
      200,
    );
    expect(r.recommendations.some((rec) => rec.includes('R_g'))).toBe(true);
  });
});

describe('estimateRequiredConductorLength', () => {
  it('zwraca długość dla rozsądnego target R_g', () => {
    const L = estimateRequiredConductorLength(5.0, 100, 200, 0.5);
    expect(L).toBeGreaterThan(0);
    expect(L).toBeLessThan(10000);
  });

  it('Infinity gdy target niemożliwe (za niskie)', () => {
    const L = estimateRequiredConductorLength(0.001, 1000, 50, 0.5);
    expect(L).toBe(Infinity);
  });
});
