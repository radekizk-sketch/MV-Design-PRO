import { describe, expect, it } from 'vitest';
import {
  estimateOperatingTemperature,
  calculateThermalAging,
  describeInsulationType,
} from '../cableThermalAgingHelper';

describe('estimateOperatingTemperature', () => {
  it('low load → niska temperatura', () => {
    const t = estimateOperatingTemperature({
      insulationType: 'XLPE',
      ambientTempC: 20,
      loadFactor: 0.3,
      installationMedium: 'soil',
    });
    // 20 + 40 × 0.09 = 23.6°C
    expect(t).toBeLessThan(30);
  });

  it('full load → wyższa temperatura', () => {
    const t = estimateOperatingTemperature({
      insulationType: 'XLPE',
      ambientTempC: 20,
      loadFactor: 1.0,
      installationMedium: 'soil',
    });
    // 20 + 40 × 1 = 60°C
    expect(t).toBe(60);
  });

  it('duct vs soil: duct grzejny więcej', () => {
    const soil = estimateOperatingTemperature({
      insulationType: 'XLPE',
      ambientTempC: 20,
      loadFactor: 1.0,
      installationMedium: 'soil',
    });
    const duct = estimateOperatingTemperature({
      insulationType: 'XLPE',
      ambientTempC: 20,
      loadFactor: 1.0,
      installationMedium: 'duct',
    });
    expect(duct).toBeGreaterThan(soil);
  });
});

describe('calculateThermalAging', () => {
  it('XLPE w normie → expectedLife ≈ 30 lat', () => {
    const r = calculateThermalAging({
      insulationType: 'XLPE',
      ambientTempC: 20,
      loadFactor: 0.5,
      installationMedium: 'soil',
    });
    expect(r.isWithinLimit).toBe(true);
    expect(r.expectedLifeYears).toBeGreaterThanOrEqual(30);
  });

  it('przekroczenie temperatury → skrócone życie', () => {
    const r = calculateThermalAging({
      insulationType: 'XLPE',
      ambientTempC: 35,
      loadFactor: 1.5,
      installationMedium: 'duct',
    });
    expect(r.isWithinLimit).toBe(false);
    expect(r.expectedLifeYears).toBeLessThan(30);
    expect(r.recommendation).toBeTruthy();
  });

  it('Arrhenius: +10°C → ~2× faster aging', () => {
    const r = calculateThermalAging({
      insulationType: 'XLPE',
      ambientTempC: 40,
      loadFactor: 1.2,
      installationMedium: 'soil',
    });
    expect(r.agingFactor).toBeGreaterThan(1);
  });

  it('PVC limit 70°C', () => {
    const r = calculateThermalAging({
      insulationType: 'PVC',
      ambientTempC: 50,
      loadFactor: 1.0,
      installationMedium: 'soil',
    });
    // 50 + 40 = 90°C > 70°C PVC limit
    expect(r.isWithinLimit).toBe(false);
  });
});

describe('describeInsulationType', () => {
  it('PL opisy z normami', () => {
    expect(describeInsulationType('XLPE')).toContain('90°C');
    expect(describeInsulationType('PVC')).toContain('70°C');
    expect(describeInsulationType('EPR')).toContain('etylen-propylen');
  });
});
