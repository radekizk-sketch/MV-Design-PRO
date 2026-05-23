import { describe, expect, it } from 'vitest';
import {
  validateCtRatio,
  validateVtRatio,
  isMeteringClass,
  isProtectionClass,
} from '../ctVtRatioValidator';

describe('validateCtRatio', () => {
  it('OK gdy 1.2 × I_nom ≤ I_primary ≤ 4 × I_nom + ALF wystarczający', () => {
    const r = validateCtRatio({
      primaryCurrentA: 500,
      circuitNominalCurrentA: 200,
      shortCircuitCurrentKa: 5,
      ctClass: '5P20',
    });
    // I_primary 500 ∈ [240, 800], ALF wymagany 5000/500=10, dostarczony 20 → OK
    expect(r.verdict).toBe('ok');
  });

  it('error gdy I_primary < 1.2 × I_nom', () => {
    const r = validateCtRatio({
      primaryCurrentA: 100,
      circuitNominalCurrentA: 100,
      shortCircuitCurrentKa: 5,
      ctClass: '5P10',
    });
    expect(r.verdict).toBe('error');
    expect(r.issues.some((i) => i.includes('Niebezpieczny'))).toBe(true);
    expect(r.recommendation).toContain('≥');
  });

  it('warning gdy I_primary > 4 × I_nom', () => {
    const r = validateCtRatio({
      primaryCurrentA: 500,
      circuitNominalCurrentA: 100,
      shortCircuitCurrentKa: 5,
      ctClass: '5P10',
    });
    expect(r.verdict).toBe('warning');
    expect(r.issues.some((i) => i.includes('Niska precyzja'))).toBe(true);
  });

  it('ALF check: 5P10 z prądem zwarcia 5 kA na 200 A primary → ALF wymagany 25, dostarczony 10 → error', () => {
    const r = validateCtRatio({
      primaryCurrentA: 200,
      circuitNominalCurrentA: 100,
      shortCircuitCurrentKa: 5,
      ctClass: '5P10',
    });
    // Required ALF = 5000/200 = 25, supplied = 10 → error
    expect(r.verdict).toBe('error');
    expect(r.issues.some((i) => i.includes('ALF'))).toBe(true);
    expect(r.recommendation).toContain('ALF');
  });

  it('ALF OK gdy 5P20 z I_sc=5kA primary 500A → wymagany 10, supplied 20', () => {
    const r = validateCtRatio({
      primaryCurrentA: 500,
      circuitNominalCurrentA: 200,
      shortCircuitCurrentKa: 5,
      ctClass: '5P20',
    });
    // 500/200 = 2.5 (OK), required ALF = 5000/500 = 10, supplied = 20 → OK
    expect(r.verdict).toBe('ok');
  });

  it('error gdy brak danych circuit nominal', () => {
    const r = validateCtRatio({
      primaryCurrentA: 100,
      circuitNominalCurrentA: 0,
      shortCircuitCurrentKa: 5,
      ctClass: '5P10',
    });
    expect(r.verdict).toBe('error');
  });
});

describe('validateVtRatio', () => {
  it('OK gdy U_primary = U_circuit (15 kV)', () => {
    const r = validateVtRatio({
      primaryVoltageKv: 15,
      circuitNominalVoltageKv: 15,
      vtClass: '0.5',
    });
    expect(r.verdict).toBe('ok');
  });

  it('OK z tolerancją ±5%', () => {
    expect(validateVtRatio({
      primaryVoltageKv: 15.5,
      circuitNominalVoltageKv: 15,
      vtClass: '0.5',
    }).verdict).toBe('ok');
    expect(validateVtRatio({
      primaryVoltageKv: 14.5,
      circuitNominalVoltageKv: 15,
      vtClass: '0.5',
    }).verdict).toBe('ok');
  });

  it('error gdy odchylenie > 5%', () => {
    const r = validateVtRatio({
      primaryVoltageKv: 20,
      circuitNominalVoltageKv: 15,
      vtClass: '0.5',
    });
    expect(r.verdict).toBe('error');
    expect(r.issues.some((i) => i.includes('odchylenie'))).toBe(true);
  });

  it('error gdy high precision required ale klasa < 0.5', () => {
    const r = validateVtRatio({
      primaryVoltageKv: 15,
      circuitNominalVoltageKv: 15,
      vtClass: '1',
      useCaseRequiresHighPrecision: true,
    });
    expect(r.verdict).toBe('error');
    expect(r.recommendation).toContain('rozliczen');
  });
});

describe('class predicates', () => {
  it('isMeteringClass', () => {
    expect(isMeteringClass('0.5')).toBe(true);
    expect(isMeteringClass('0.2s')).toBe(true);
    expect(isMeteringClass('5P10')).toBe(false);
  });
  it('isProtectionClass', () => {
    expect(isProtectionClass('5P10')).toBe(true);
    expect(isProtectionClass('10P20')).toBe(true);
    expect(isProtectionClass('0.5')).toBe(false);
  });
});
