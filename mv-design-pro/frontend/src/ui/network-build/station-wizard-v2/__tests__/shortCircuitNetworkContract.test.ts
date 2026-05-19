/**
 * Kontrakt analizy zwarciowej — weryfikacja per Excel MT880 v3 sekcja 4.
 *
 * Wartości referencyjne z Excel'a:
 *   Sz GPZ = 270.43 MVA, U = 15 kV
 *   Linia: R=0.5688Ω, X=0.5233Ω, L=4.55 km
 *   Z całkowita = 1.578 Ω
 *   Ik3 = 6.035 kA (za kablem, w PCC)
 *   κ = 1.27 (per Excel, dla R/X = 0.46)
 *   tk = 0.36 s
 *   m = 0.2, n = 1.0
 *   Ith = 6.61 kA
 *   ip = 10.81 kA
 *
 *   CT 200/5/5/5: Ith=16 kA, Idyn=40 kA
 *   Sprawdzenie: 6.61 < 16 ✓, 10.81 < 20 (Idyn użyty z 5P10 ALF) ... ✓
 */
import { describe, expect, it } from 'vitest';

import {
  VOLTAGE_FACTOR_C_MAX,
  computeSystemImpedance,
  computeCableLineImpedance,
  combineSystemAndCable,
  computeShortCircuitCurrent,
  computePeakFactor,
  computePeakCurrent,
  computeThermalEquivalentCurrent,
  approximateMFactor,
  analyzeFullShortCircuit,
  checkCtRating,
} from '../shortCircuitNetworkContract';

describe('computeSystemImpedance — Z systemu z mocy zwarciowej', () => {
  it('Excel MT880 v3: Sz=270.43 MVA, U=15 kV, R/X=0.1 → Z ≈ 0.915 Ω', () => {
    const z = computeSystemImpedance({
      shortCircuitPowerMva: 270.43,
      nominalVoltageKv: 15,
      rxRatio: 0.1,
      voltageFactor: VOLTAGE_FACTOR_C_MAX,
    });
    // Z = 1.10 × 15² / 270.43 = 1.10 × 225 / 270.43 = 247.5/270.43 = 0.915 Ω
    expect(z.z_ohm).toBeCloseTo(0.915, 2);
    // R/X = 0.1 → X dominuje.
    expect(z.x_ohm).toBeGreaterThan(z.r_ohm);
  });

  it('c=1.0 (min) — niższa impedancja niż c=1.10 (max)', () => {
    const zMin = computeSystemImpedance({
      shortCircuitPowerMva: 270.43, nominalVoltageKv: 15, rxRatio: 0.1, voltageFactor: 1.0,
    });
    const zMax = computeSystemImpedance({
      shortCircuitPowerMva: 270.43, nominalVoltageKv: 15, rxRatio: 0.1, voltageFactor: 1.10,
    });
    expect(zMax.z_ohm).toBeGreaterThan(zMin.z_ohm);
    expect(zMax.z_ohm / zMin.z_ohm).toBeCloseTo(1.10, 2);
  });
});

describe('computeCableLineImpedance — impedancja linii', () => {
  it('Excel: R0=0.125 Ω/km, X0=0.115 Ω/km, L=4.55 km → R=0.569Ω, X=0.523Ω', () => {
    const z = computeCableLineImpedance({
      r0_ohm_per_km: 0.125,
      x0_ohm_per_km: 0.115,
      lengthKm: 4.55,
    });
    expect(z.r_ohm).toBeCloseTo(0.569, 2);
    expect(z.x_ohm).toBeCloseTo(0.523, 2);
    expect(z.z_ohm).toBeCloseTo(0.773, 2);
  });

  it('Krótszy odcinek → niższa impedancja', () => {
    const z1 = computeCableLineImpedance({ r0_ohm_per_km: 0.1, x0_ohm_per_km: 0.1, lengthKm: 1 });
    const z2 = computeCableLineImpedance({ r0_ohm_per_km: 0.1, x0_ohm_per_km: 0.1, lengthKm: 2 });
    expect(z2.z_ohm).toBeCloseTo(z1.z_ohm * 2, 3);
  });
});

describe('combineSystemAndCable — Z całkowita', () => {
  it('Excel MT880: Z_sys + Z_cable = Z_total', () => {
    const sys = computeSystemImpedance({
      shortCircuitPowerMva: 270.43, nominalVoltageKv: 15, rxRatio: 0.1,
    });
    const cable = computeCableLineImpedance({
      r0_ohm_per_km: 0.125, x0_ohm_per_km: 0.115, lengthKm: 4.55,
    });
    const total = combineSystemAndCable(sys, cable);
    // R_total = R_sys + R_cable, X_total = X_sys + X_cable.
    expect(total.r_total_ohm).toBeCloseTo(sys.r_ohm + cable.r_ohm, 3);
    expect(total.x_total_ohm).toBeCloseTo(sys.x_ohm + cable.x_ohm, 3);
    // Excel pokazuje 1.578 Ω — sprawdzamy zbliżoną wartość.
    expect(total.z_total_ohm).toBeGreaterThan(1.3);
    expect(total.z_total_ohm).toBeLessThan(1.7);
  });
});

describe('computeShortCircuitCurrent — Ik" 3-fazowy + 2-fazowy', () => {
  it('Excel MT880: Z=1.578Ω, U=15kV, c=1.10 → Ik3 ≈ 6.035 kA', () => {
    const result = computeShortCircuitCurrent({
      impedance: { r_total_ohm: 0.660, x_total_ohm: 1.434, z_total_ohm: 1.578, rxRatio: 0.46 },
      nominalVoltageKv: 15,
      voltageFactor: 1.10,
    });
    // Ik = c·U / (√3·Z) = 1.10·15000 / (√3·1.578) = 16500 / 2.733 = 6.038 kA.
    expect(result.ik3_ka).toBeCloseTo(6.04, 1);
    // Ik2 = √3/2 × Ik3.
    expect(result.ik2_ka).toBeCloseTo(result.ik3_ka * Math.sqrt(3) / 2, 2);
  });

  it('Bezpośrednio na szynach GPZ (bez linii): Z=0.915 → Ik3 ≈ 10.4 kA', () => {
    const result = computeShortCircuitCurrent({
      impedance: { r_total_ohm: 0.091, x_total_ohm: 0.911, z_total_ohm: 0.915, rxRatio: 0.1 },
      nominalVoltageKv: 15,
      voltageFactor: 1.10,
    });
    // Ik = 1.10·15000 / (√3·0.915) = 10410 / 1 = 10.41 kA ≈ Excel 10.30 kA.
    expect(result.ik3_ka).toBeGreaterThan(10);
    expect(result.ik3_ka).toBeLessThan(10.7);
  });
});

describe('computePeakFactor κ — IEC 60909-0 § 4.3', () => {
  it('R/X = 0.46 → κ ≈ 1.27 (per Excel MT880)', () => {
    const kappa = computePeakFactor(0.46);
    // κ = 1.02 + 0.98·exp(-3·0.46) = 1.02 + 0.98·exp(-1.38) = 1.02 + 0.98·0.2516 = 1.27.
    expect(kappa).toBeCloseTo(1.27, 2);
  });

  it('R/X = 0 (czysto indukcyjny) → κ = 2.0', () => {
    expect(computePeakFactor(0)).toBeCloseTo(2.0, 2);
  });

  it('R/X >> 1 (rezystywny) → κ → 1.02', () => {
    expect(computePeakFactor(10)).toBeCloseTo(1.02, 2);
  });

  it('κ monotonicznie maleje z R/X', () => {
    expect(computePeakFactor(0.1)).toBeGreaterThan(computePeakFactor(0.5));
    expect(computePeakFactor(0.5)).toBeGreaterThan(computePeakFactor(1.0));
  });
});

describe('computePeakCurrent ip — udarowy', () => {
  it('Ik3 = 6.04 kA + κ = 1.27 → ip ≈ 10.84 kA (zbliżone do Excel 10.81)', () => {
    const ip = computePeakCurrent(6.04, 1.27);
    // ip = 1.27 × √2 × 6.04 = 1.27 × 1.414 × 6.04 ≈ 10.85 kA.
    expect(ip).toBeCloseTo(10.85, 1);
  });

  it('ip skaluje liniowo z Ik3', () => {
    const ip1 = computePeakCurrent(5, 1.27);
    const ip2 = computePeakCurrent(10, 1.27);
    expect(ip2).toBeCloseTo(ip1 * 2, 2);
  });
});

describe('computeThermalEquivalentCurrent + approximateMFactor', () => {
  it('Ik3=6.04 kA, m=0.2, n=1.0 → Ith = 6.04·√1.2 ≈ 6.61 kA (Excel)', () => {
    const ith = computeThermalEquivalentCurrent(6.04, 0.2, 1.0);
    // Ith = 6.04 × √1.2 = 6.04 × 1.0954 = 6.617 kA.
    expect(ith).toBeCloseTo(6.62, 1);
  });

  it('approximateMFactor dla tk=0.36s + κ=1.27 → m ≈ 0.12 (mała wartość)', () => {
    const m = approximateMFactor(0.36, 1.27);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(0.5);
  });

  it('approximateMFactor dla κ=1.02 (brak DC) → m = 0', () => {
    const m = approximateMFactor(0.5, 1.02);
    expect(m).toBe(0);
  });

  it('m maleje z czasem tk (decay składowej DC)', () => {
    expect(approximateMFactor(0.1, 1.5)).toBeGreaterThan(approximateMFactor(1.0, 1.5));
  });
});

describe('analyzeFullShortCircuit — kompleksowa analiza Excel MT880 v3', () => {
  it('Pełen scenariusz MT880: GPZ + linia 4.55 km → Ik3, ip, Ith', () => {
    const result = analyzeFullShortCircuit({
      system: {
        shortCircuitPowerMva: 270.43,
        nominalVoltageKv: 15,
        rxRatio: 0.1,
        voltageFactor: 1.10,
      },
      cable: {
        r0_ohm_per_km: 0.125, x0_ohm_per_km: 0.115, lengthKm: 4.55,
      },
      faultDurationSec: 0.36,
      nFactor: 1.0,
    });
    // Ik3 w PCC ≈ 6 kA.
    expect(result.currents.ik3_ka).toBeGreaterThan(5.5);
    expect(result.currents.ik3_ka).toBeLessThan(6.5);
    // ip ≈ 10-11 kA.
    expect(result.peakCurrentKa).toBeGreaterThan(8);
    expect(result.peakCurrentKa).toBeLessThan(12);
    // Ith < Ik3 (bo m+n < (Ik3/Ik")² → tu m+n ≈ 1.2 < (κ·√2)²=3.2).
    expect(result.thermalCurrentKa).toBeLessThan(result.peakCurrentKa);
  });

  it('Wynik zawiera wszystkie elementy analizy (system, cable, total, currents, kappa)', () => {
    const r = analyzeFullShortCircuit({
      system: { shortCircuitPowerMva: 300, nominalVoltageKv: 15, rxRatio: 0.1 },
      cable: { r0_ohm_per_km: 0.1, x0_ohm_per_km: 0.1, lengthKm: 2 },
      faultDurationSec: 0.5,
    });
    expect(r.system).toBeDefined();
    expect(r.cable).toBeDefined();
    expect(r.total).toBeDefined();
    expect(r.currents).toBeDefined();
    expect(r.kappa).toBeGreaterThan(1.02);
  });
});

describe('checkCtRating — dobór CT 200/5/5/5 per Excel MT880', () => {
  it('CT Ith=16kA, Idyn=40kA vs network Ith=6.61, ip=10.81 → wszystkie warunki OK', () => {
    const check = checkCtRating({
      ctPrimaryCurrentA: 200,
      ctIth1secKa: 16,
      ctIdynKa: 40,
      networkIthKa: 6.61,
      networkIpeakKa: 10.81,
      designCurrentA: 162.06,
    });
    expect(check.thermalOk).toBe(true);
    expect(check.thermalMarginKa).toBeCloseTo(9.39, 1);
    expect(check.dynamicOk).toBe(true);
    expect(check.dynamicMarginKa).toBeCloseTo(29.19, 1);
    // Ratio = 200/162.06 = 1.234 → w zakresie 1.2-2.0.
    expect(check.primaryRatingRatio).toBeCloseTo(1.234, 2);
    expect(check.primaryRatingOk).toBe(true);
  });

  it('CT za mały na zwarcie → thermalOk = false', () => {
    const check = checkCtRating({
      ctPrimaryCurrentA: 200,
      ctIth1secKa: 5,
      ctIdynKa: 20,
      networkIthKa: 6.61,
      networkIpeakKa: 10.81,
      designCurrentA: 162.06,
    });
    expect(check.thermalOk).toBe(false);
    expect(check.thermalMarginKa).toBeLessThan(0);
  });

  it('CT za duży (ratio > 2.0) → primaryRatingOk = false', () => {
    const check = checkCtRating({
      ctPrimaryCurrentA: 1000,
      ctIth1secKa: 50,
      ctIdynKa: 100,
      networkIthKa: 6.61,
      networkIpeakKa: 10.81,
      designCurrentA: 162.06,
    });
    expect(check.thermalOk).toBe(true);
    expect(check.primaryRatingRatio).toBeGreaterThan(5);
    expect(check.primaryRatingOk).toBe(false);
  });

  it('CT za mały na prąd obciążenia (ratio < 1.2) → primaryRatingOk = false', () => {
    const check = checkCtRating({
      ctPrimaryCurrentA: 150,
      ctIth1secKa: 16,
      ctIdynKa: 40,
      networkIthKa: 6.61,
      networkIpeakKa: 10.81,
      designCurrentA: 162.06,
    });
    expect(check.primaryRatingRatio).toBeLessThan(1.2);
    expect(check.primaryRatingOk).toBe(false);
  });
});

describe('Stałe — IEC 60909-0 voltage factors', () => {
  it('VOLTAGE_FACTOR_C_MAX = 1.10 (dla Ik" max — dobór aparatury)', () => {
    expect(VOLTAGE_FACTOR_C_MAX).toBe(1.10);
  });

  it('VOLTAGE_FACTOR_C_MAX > 1.0 (zawsze konserwatywne dla doboru)', () => {
    expect(VOLTAGE_FACTOR_C_MAX).toBeGreaterThan(1.0);
  });
});
