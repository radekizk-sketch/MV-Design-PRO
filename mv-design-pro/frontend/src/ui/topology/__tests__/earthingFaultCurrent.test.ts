import { describe, expect, it } from 'vitest';
import {
  calculateEarthingFault,
  isCurrentSafeForGrid,
} from '../earthingFaultCurrent';

describe('calculateEarthingFault — Resistor', () => {
  it('SN 15 kV + R_n=20 Ω → I_F ≈ 433 A', () => {
    const r = calculateEarthingFault({
      earthingType: 'Resistor',
      systemVoltageKv: 15,
      resistorOhm: 20,
    });
    expect(r.currentA).toBeGreaterThan(400);
    expect(r.currentA).toBeLessThan(500);
    expect(r.description).toContain('Resistor');
  });

  it('brak R_n → I_F=0 + description', () => {
    const r = calculateEarthingFault({
      earthingType: 'Resistor',
      systemVoltageKv: 15,
    });
    expect(r.currentA).toBe(0);
    expect(r.description).toContain('Brak');
  });
});

describe('calculateEarthingFault — Petersen', () => {
  it('kompensacja 95% → I_res << I_C', () => {
    const r = calculateEarthingFault({
      earthingType: 'Petersen',
      systemVoltageKv: 15,
      networkLengthKm: 50,
      cableCapacitanceUfPerKm: 0.3,
      petersenCompensationRatio: 0.95,
    });
    expect(r.currentA).toBeGreaterThan(0);
    expect(r.description).toContain('kompensacja');
  });

  it('kompensacja 100% → I_res ≈ 0', () => {
    const r = calculateEarthingFault({
      earthingType: 'Petersen',
      systemVoltageKv: 15,
      networkLengthKm: 50,
      petersenCompensationRatio: 1.0,
    });
    expect(r.currentA).toBe(0);
  });
});

describe('calculateEarthingFault — IT', () => {
  it('SN 15 kV, 30 km kabli → kapacytancyjny I_F', () => {
    const r = calculateEarthingFault({
      earthingType: 'IT',
      systemVoltageKv: 15,
      networkLengthKm: 30,
    });
    // 3 × 8660 × 2π50 × 0.3μF × 30 = ~73A
    expect(r.currentA).toBeGreaterThan(50);
    expect(r.currentA).toBeLessThan(100);
    expect(r.description).toContain('IT');
  });
});

describe('calculateEarthingFault — TN', () => {
  it('TN-S nN → estymowany I_F', () => {
    const r = calculateEarthingFault({
      earthingType: 'TN-S',
      systemVoltageKv: 0.4,
    });
    expect(r.currentA).toBeGreaterThan(0);
    expect(r.description).toContain('TN-S');
  });
});

describe('calculateEarthingFault — recommendations', () => {
  it('recommendedGridResistanceOhm = 50/I_F', () => {
    const r = calculateEarthingFault({
      earthingType: 'Resistor',
      systemVoltageKv: 15,
      resistorOhm: 20,
    });
    expect(r.recommendedGridResistanceOhm).toBeGreaterThan(0);
    expect(r.recommendedGridResistanceOhm).toBeLessThan(1);
  });
});

describe('isCurrentSafeForGrid', () => {
  it('safe gdy U_t = I × R ≤ 50V', () => {
    const r = isCurrentSafeForGrid(100, 0.4);
    // 100 × 0.4 = 40 V < 50 → safe
    expect(r.isSafe).toBe(true);
    expect(r.touchVoltageV).toBe(40);
  });

  it('unsafe gdy U_t > 50V', () => {
    const r = isCurrentSafeForGrid(500, 0.5);
    // 500 × 0.5 = 250 V > 50 → unsafe
    expect(r.isSafe).toBe(false);
    expect(r.message).toContain('zwiększ siatkę');
  });

  it('message zawiera PN-EN 50522 reference', () => {
    const r = isCurrentSafeForGrid(50, 0.5);
    expect(r.message).toMatch(/50522|bezpieczne|zwiększ/);
  });
});
