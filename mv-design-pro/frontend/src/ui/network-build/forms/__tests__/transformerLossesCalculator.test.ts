import { describe, expect, it } from 'vitest';
import {
  calculateTransformerLosses,
  calculateOptimalLoadingFactor,
  annualEnergyLossesKwh,
} from '../transformerLossesCalculator';

describe('calculateTransformerLosses', () => {
  it('TR 1 MVA, P0=1 kW, Pk=10 kW, β=0.5, cos φ=0.9', () => {
    const r = calculateTransformerLosses({
      ratedPowerMva: 1,
      noLoadLossesKw: 1,
      loadLossesKw: 10,
      loadingFactor: 0.5,
      cosPhi: 0.9,
    });
    // P_total = 1 + 0.25 × 10 = 3.5 kW
    expect(r.totalLossesKw).toBe(3.5);
    // P_out = 1 × 0.5 × 0.9 = 0.45 MW = 450 kW
    expect(r.outputPowerMw).toBeCloseTo(0.45);
    // η = 450 / 453.5 ≈ 99.23%
    expect(r.efficiencyPercent).toBeGreaterThan(99);
  });

  it('β=0 → tylko straty jałowe + brak output', () => {
    const r = calculateTransformerLosses({
      ratedPowerMva: 1,
      noLoadLossesKw: 1,
      loadLossesKw: 10,
      loadingFactor: 0,
      cosPhi: 0.9,
    });
    expect(r.loadLossesKw).toBe(0);
    expect(r.totalLossesKw).toBe(1);
    expect(r.outputPowerMw).toBe(0);
  });

  it('β=1 → pełne straty obciążeniowe', () => {
    const r = calculateTransformerLosses({
      ratedPowerMva: 1,
      noLoadLossesKw: 1,
      loadLossesKw: 10,
      loadingFactor: 1,
      cosPhi: 0.9,
    });
    expect(r.loadLossesKw).toBe(10);
    expect(r.totalLossesKw).toBe(11);
  });
});

describe('calculateOptimalLoadingFactor', () => {
  it('β_opt = √(P_0 / P_k)', () => {
    // β_opt = √(2/8) = √0.25 = 0.5
    expect(calculateOptimalLoadingFactor(2, 8)).toBe(0.5);
  });

  it('β_opt = 1 gdy P_k=0', () => {
    expect(calculateOptimalLoadingFactor(1, 0)).toBe(1);
  });
});

describe('annualEnergyLossesKwh', () => {
  it('liczy roczne straty energetyczne', () => {
    const losses = calculateTransformerLosses({
      ratedPowerMva: 1,
      noLoadLossesKw: 1,
      loadLossesKw: 10,
      loadingFactor: 0.5,
      cosPhi: 0.9,
    });
    const annual = annualEnergyLossesKwh(losses, 8760, 0.5);
    // P_0 = 1 kW × 8760 h = 8760 kWh
    expect(annual.noLoadEnergyKwh).toBe(8760);
    // Load lossesx 2.5 kW × 8760 h × 0.5 = 10950 kWh
    expect(annual.loadEnergyKwh).toBe(10950);
    expect(annual.totalEnergyKwh).toBe(19710);
  });
});
