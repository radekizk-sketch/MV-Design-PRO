import { describe, expect, it } from 'vitest';
import {
  FAULT_TYPE_METADATA,
  getFaultTypeMetadata,
  listFaultTypes,
  listFaultTypesForVoltageLevel,
  getVoltageFactor,
  classifyShortCircuitSeverity,
} from '../faultTypeClassifier';

describe('FAULT_TYPE_METADATA', () => {
  it('zawiera 5 typów zwarć', () => {
    expect(Object.keys(FAULT_TYPE_METADATA)).toHaveLength(5);
  });

  it('każdy typ ma fullNamePL + symbol + factors', () => {
    for (const meta of Object.values(FAULT_TYPE_METADATA)) {
      expect(meta.fullNamePL).toBeTruthy();
      expect(meta.symbol).toMatch(/I_/);
      expect(meta.voltageFactorMax).toBe(1.10);
      expect(meta.voltageFactorMin).toBe(0.95);
    }
  });

  it('3F symbol = I_k3', () => {
    expect(getFaultTypeMetadata('3F').symbol).toBe('I_k3');
  });

  it('1F: opis wskazuje 70% wszystkich zwarć', () => {
    expect(getFaultTypeMetadata('1F').description).toContain('70%');
  });
});

describe('listFaultTypes', () => {
  it('zwraca wszystkie 5 typów', () => {
    expect(listFaultTypes()).toEqual(['3F', '2F', '1F', '2FG', '3FG']);
  });
});

describe('listFaultTypesForVoltageLevel', () => {
  it('SN: wszystkie 5', () => {
    expect(listFaultTypesForVoltageLevel('SN')).toHaveLength(5);
  });

  it('nN: bez 2FG', () => {
    const types = listFaultTypesForVoltageLevel('nN');
    expect(types).not.toContain('2FG');
  });

  it('WN: wszystkie 5', () => {
    expect(listFaultTypesForVoltageLevel('WN')).toHaveLength(5);
  });
});

describe('getVoltageFactor', () => {
  it('IEC 60909 cMax=1.10, cMin=0.95', () => {
    expect(getVoltageFactor('3F', 'max')).toBe(1.10);
    expect(getVoltageFactor('3F', 'min')).toBe(0.95);
  });
});

describe('classifyShortCircuitSeverity', () => {
  it('within_rating: I_sc < 85% ratedKa', () => {
    expect(classifyShortCircuitSeverity(10, 25)).toBe('within_rating');
  });

  it('near_limit: 85-100%', () => {
    expect(classifyShortCircuitSeverity(22, 25)).toBe('near_limit');
  });

  it('exceeds_rating: > 100%', () => {
    expect(classifyShortCircuitSeverity(30, 25)).toBe('exceeds_rating');
  });

  it('ratedKa=0 → exceeds_rating', () => {
    expect(classifyShortCircuitSeverity(10, 0)).toBe('exceeds_rating');
  });
});
