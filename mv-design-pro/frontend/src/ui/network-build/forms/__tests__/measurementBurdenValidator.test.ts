import { describe, expect, it } from 'vitest';
import {
  validateSecondaryBurden,
  validateVtBurden,
} from '../measurementBurdenValidator';

describe('validateSecondaryBurden', () => {
  it('low burden → isWithinClass=true', () => {
    const r = validateSecondaryBurden({
      ctRatedVa: 30,
      ctSecondaryCurrentA: 5,
      ctAlf: 10,
      cableLengthM: 5,
      cableCrossSectionMm2: 4,
      burdenItems: [
        { name: 'Przekaźnik', va: 1.5 },
        { name: 'Amperomierz', va: 0.5 },
      ],
    });
    expect(r.isWithinClass).toBe(true);
    expect(r.utilizationPercent).toBeLessThan(100);
  });

  it('cable burden = I² × R_cable', () => {
    const r = validateSecondaryBurden({
      ctRatedVa: 30,
      ctSecondaryCurrentA: 5,
      ctAlf: 10,
      cableLengthM: 50,
      cableCrossSectionMm2: 2.5,
      burdenItems: [],
    });
    // R = 2 × 0.0224 × 50 / 2.5 = 0.896 Ω; VA = 25 × 0.896 = 22.4
    expect(r.cableBurdenVa).toBeCloseTo(22.4, 0);
  });

  it('overload → isWithinClass=false + recommendation', () => {
    const r = validateSecondaryBurden({
      ctRatedVa: 10,
      ctSecondaryCurrentA: 5,
      ctAlf: 10,
      cableLengthM: 100,
      cableCrossSectionMm2: 2.5,
      burdenItems: [{ name: 'Heavy load', va: 30 }],
    });
    expect(r.isWithinClass).toBe(false);
    expect(r.recommendation).toBeTruthy();
  });

  it('long cable → recommendation o przekroju', () => {
    const r = validateSecondaryBurden({
      ctRatedVa: 10,
      ctSecondaryCurrentA: 5,
      ctAlf: 10,
      cableLengthM: 200,
      cableCrossSectionMm2: 2.5,
      burdenItems: [],
    });
    expect(r.isWithinClass).toBe(false);
    expect(r.recommendation).toContain('przekrój');
  });
});

describe('validateVtBurden', () => {
  it('OK gdy total ≤ rated VA', () => {
    const r = validateVtBurden({
      vtRatedVa: 50,
      burdenItems: [
        { name: 'Voltmeter', va: 5 },
        { name: 'Wattmeter', va: 10 },
        { name: 'Relay', va: 8 },
      ],
    });
    expect(r.totalBurdenVa).toBe(23);
    expect(r.isWithinClass).toBe(true);
    expect(r.utilizationPercent).toBe(46);
  });

  it('overload', () => {
    const r = validateVtBurden({
      vtRatedVa: 20,
      burdenItems: [
        { name: 'Heavy load', va: 30 },
      ],
    });
    expect(r.isWithinClass).toBe(false);
  });
});
