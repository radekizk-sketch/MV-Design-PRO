import { describe, expect, it } from 'vitest';

import { METER_REFERENCE_CATALOG } from '../metersContract';

describe('Meter catalog contract', () => {
  it('każdy licznik ma komplet danych katalogowych dla konfiguratora pomiaru', () => {
    for (const meter of METER_REFERENCE_CATALOG) {
      expect(meter.modelRef).toBeTruthy();
      expect(meter.typeLabelPl).toBeTruthy();
      expect(meter.accuracyClass).toBeTruthy();
      expect(meter.voltageCircuitBurdenVa).toBeGreaterThanOrEqual(0);
      expect(meter.currentCircuitBurdenVa).toBeGreaterThanOrEqual(0);
      expect(meter.meteringVariantLabelPl).toMatch(/bezpośredni|półpośredni|pośredni/);
    }
  });

  it('MT880 jest licznikiem, nie analizatorem jakości energii ani nazwą szablonu obliczeń', () => {
    const meter = METER_REFERENCE_CATALOG.find((item) => item.modelRef === 'MT880');
    expect(meter).toBeDefined();
    expect(meter?.typeLabelPl).toBe('licznik rozliczeniowy');
    expect(meter?.meteringVariant).toBe('INDIRECT_CT_VT');
    expect(meter?.voltageCircuitBurdenVa).toBeGreaterThan(0);
    expect(meter?.currentCircuitBurdenVa).toBeGreaterThan(0);
  });

  it('katalog liczników nie zawiera analizatorów jakości energii klasy A', () => {
    for (const meter of METER_REFERENCE_CATALOG) {
      expect(meter.typeLabelPl).not.toBe('analizator jakości energii');
    }
  });
});
