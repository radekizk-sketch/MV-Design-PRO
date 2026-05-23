import { describe, expect, it } from 'vitest';
import { validateCableAmpacity } from '../cableAmpacityValidator';

describe('validateCableAmpacity — długość', () => {
  it('długość 0 lub ujemna → error', () => {
    const r = validateCableAmpacity({
      lengthKm: 0,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 240,
      ratedAmpacityA: 285,
      loadCurrentA: 100,
      shortCircuitKa: 10,
      shortCircuitDurationS: 1,
    });
    expect(r.verdict).toBe('error');
    expect(r.issues.some((i) => i.includes('dodatnia'))).toBe(true);
  });

  it('długość > 50 km dla SN → error', () => {
    const r = validateCableAmpacity({
      lengthKm: 60,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 240,
      ratedAmpacityA: 285,
      loadCurrentA: 100,
      shortCircuitKa: 10,
      shortCircuitDurationS: 1,
    });
    expect(r.verdict).toBe('error');
    expect(r.issues.some((i) => i.includes('50 km'))).toBe(true);
  });

  it('długość > 200 km dla WN → error', () => {
    const r = validateCableAmpacity({
      lengthKm: 250,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 240,
      ratedAmpacityA: 285,
      loadCurrentA: 100,
      shortCircuitKa: 10,
      shortCircuitDurationS: 1,
      voltageLevel: 'WN',
    });
    expect(r.verdict).toBe('error');
  });
});

describe('validateCableAmpacity — obciążenie', () => {
  it('prąd > derated ampacity → error', () => {
    const r = validateCableAmpacity({
      lengthKm: 5,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 240,
      ratedAmpacityA: 285,
      loadCurrentA: 300,
      shortCircuitKa: 10,
      shortCircuitDurationS: 1,
    });
    expect(r.verdict).toBe('error');
    expect(r.issues.some((i) => i.includes('przekracza obciążalność'))).toBe(true);
  });

  it('prąd 90-100% derated → warning', () => {
    const r = validateCableAmpacity({
      lengthKm: 5,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 240,
      ratedAmpacityA: 285,
      loadCurrentA: 250,
      shortCircuitKa: 10,
      shortCircuitDurationS: 1,
    });
    // 250 / (285*0.9*1.01) = 250/259 = 96.5%
    expect(r.verdict).toBe('warning');
    expect(r.ampacityUtilization).toBeGreaterThan(90);
  });

  it('prąd małe → ok', () => {
    const r = validateCableAmpacity({
      lengthKm: 5,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 240,
      ratedAmpacityA: 285,
      loadCurrentA: 100,
      shortCircuitKa: 10,
      shortCircuitDurationS: 1,
    });
    expect(r.verdict).toBe('ok');
  });
});

describe('validateCableAmpacity — zwarcie thermal', () => {
  it('XLPE Al k=94: I_sc=20kA × √1s / 94 ≈ 213 mm² → 240 OK', () => {
    const r = validateCableAmpacity({
      lengthKm: 1,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 240,
      ratedAmpacityA: 285,
      loadCurrentA: 100,
      shortCircuitKa: 20,
      shortCircuitDurationS: 1,
    });
    expect(r.thermalShortCircuitMm2).toBeGreaterThan(200);
    expect(r.thermalShortCircuitMm2).toBeLessThan(220);
    expect(r.verdict).toBe('ok');
  });

  it('przekrój za mały dla zwarcia → error + rekomendacja', () => {
    const r = validateCableAmpacity({
      lengthKm: 1,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 95,
      ratedAmpacityA: 285,
      loadCurrentA: 50,
      shortCircuitKa: 20,
      shortCircuitDurationS: 1,
    });
    expect(r.verdict).toBe('error');
    expect(r.recommendation).toContain('przekrojem');
  });

  it('overhead_al: brak thermal SC check', () => {
    const r = validateCableAmpacity({
      lengthKm: 5,
      cableType: 'overhead_al',
      crossSectionMm2: 35,
      ratedAmpacityA: 200,
      loadCurrentA: 50,
      shortCircuitKa: 20,
      shortCircuitDurationS: 1,
    });
    expect(r.thermalShortCircuitMm2).toBe(0);
    expect(r.verdict).toBe('ok');
  });
});

describe('validateCableAmpacity — Cu vs Al', () => {
  it('Cu (k=143) wymaga mniejszego przekroju niż Al (k=94)', () => {
    const cu = validateCableAmpacity({
      lengthKm: 1,
      cableType: 'cable_xlpe_cu',
      crossSectionMm2: 150,
      ratedAmpacityA: 400,
      loadCurrentA: 100,
      shortCircuitKa: 20,
      shortCircuitDurationS: 1,
    });
    const al = validateCableAmpacity({
      lengthKm: 1,
      cableType: 'cable_xlpe_al',
      crossSectionMm2: 150,
      ratedAmpacityA: 400,
      loadCurrentA: 100,
      shortCircuitKa: 20,
      shortCircuitDurationS: 1,
    });
    expect(cu.thermalShortCircuitMm2).toBeLessThan(al.thermalShortCircuitMm2);
  });
});
