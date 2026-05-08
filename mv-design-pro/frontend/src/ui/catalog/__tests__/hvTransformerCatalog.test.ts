/**
 * hvTransformerCatalog tests (R35) — kanon polski 12 wpisów HV transformatorów.
 */
import { describe, expect, it } from 'vitest';

import {
  HV_TRANSFORMER_CATALOG,
  HV_TRANSFORMER_NAMESPACE,
  filterHvTransformersByVoltage,
  filterHvTransformersBySn,
  getHvTransformerById,
  toCatalogType,
} from '../hvTransformerCatalog';

describe('HV_TRANSFORMER_CATALOG — struktura', () => {
  it('Ma minimum 12 wpisów (12 typów + custom)', () => {
    expect(HV_TRANSFORMER_CATALOG.length).toBeGreaterThanOrEqual(12);
  });

  it('Każdy wpis ma unique id', () => {
    const ids = HV_TRANSFORMER_CATALOG.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('Każdy wpis (poza custom) ma sn_mva > 0, uhv > ulv > 0', () => {
    for (const e of HV_TRANSFORMER_CATALOG) {
      if (e.id === 'custom-trafo') continue;
      expect(e.snMva).toBeGreaterThan(0);
      expect(e.uhvKv).toBeGreaterThan(e.ulvKv);
      expect(e.ulvKv).toBeGreaterThan(0);
      expect(e.ukPercent).toBeGreaterThan(0);
      expect(e.pcuKw).toBeGreaterThan(0);
      expect(e.p0Kw).toBeGreaterThan(0);
      expect(e.priceReferencePln).toBeGreaterThan(0);
      expect(e.leadTimeWeeks).toBeGreaterThan(0);
    }
  });

  it('Każdy wpis ma vector group z whitelist IEC 60076', () => {
    const allowed = ['YNd11', 'YNd1', 'YNd5', 'YNd7', 'Yyn0', 'Dyn1', 'Dyn5', 'Dyn11', 'Yzn5', 'Yzn11'];
    for (const e of HV_TRANSFORMER_CATALOG) {
      expect(allowed).toContain(e.vectorGroup);
    }
  });

  it('In_HV obliczone poprawnie z Sn/(√3 * uhv)', () => {
    for (const e of HV_TRANSFORMER_CATALOG) {
      if (e.id === 'custom-trafo') continue;
      const expected = (e.snMva * 1000) / (Math.sqrt(3) * e.uhvKv);
      expect(Math.abs(e.inHvA - expected)).toBeLessThan(2); // tolerance
    }
  });

  it('Co najmniej 3 voltage pairs reprezentowane (110/15, 110/20, 110/30)', () => {
    const pairs = new Set<string>();
    for (const e of HV_TRANSFORMER_CATALOG) {
      if (e.id !== 'custom-trafo') pairs.add(`${e.uhvKv}/${e.ulvKv}`);
    }
    expect(pairs.has('110/15')).toBe(true);
    expect(pairs.has('110/20')).toBe(true);
    expect(pairs.has('110/30')).toBe(true);
  });

  it('Co najmniej 3 producentów reprezentowanych', () => {
    const manufacturers = new Set<string>();
    for (const e of HV_TRANSFORMER_CATALOG) {
      if (e.id !== 'custom-trafo') manufacturers.add(e.manufacturer);
    }
    expect(manufacturers.size).toBeGreaterThanOrEqual(3);
  });
});

describe('filterHvTransformersByVoltage', () => {
  it('110/15 → tylko 110/15 transformatory', () => {
    const filtered = filterHvTransformersByVoltage(110, 15);
    expect(filtered.length).toBeGreaterThan(0);
    for (const e of filtered) {
      expect(e.uhvKv).toBe(110);
      expect(e.ulvKv).toBe(15);
    }
  });

  it('110/20 → tylko 110/20', () => {
    const filtered = filterHvTransformersByVoltage(110, 20);
    expect(filtered.length).toBeGreaterThan(0);
    for (const e of filtered) {
      expect(e.uhvKv).toBe(110);
      expect(e.ulvKv).toBe(20);
    }
  });

  it('220/110 → znajduje autotransformator', () => {
    const filtered = filterHvTransformersByVoltage(220, 110);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it('null ulvKv → wszystkie 110 kV (każde ulv)', () => {
    const filtered = filterHvTransformersByVoltage(110, null);
    expect(filtered.length).toBeGreaterThan(3);
  });

  it('NIE zawiera custom-trafo', () => {
    const filtered = filterHvTransformersByVoltage(110, 15);
    expect(filtered.find((e) => e.id === 'custom-trafo')).toBeUndefined();
  });
});

describe('filterHvTransformersBySn', () => {
  it('25-40 MVA → tylko transformatory z tego zakresu', () => {
    const filtered = filterHvTransformersBySn(25, 40);
    expect(filtered.length).toBeGreaterThan(0);
    for (const e of filtered) {
      expect(e.snMva).toBeGreaterThanOrEqual(25);
      expect(e.snMva).toBeLessThanOrEqual(40);
    }
  });

  it('100+ MVA → tylko autotransformator 220/110', () => {
    const filtered = filterHvTransformersBySn(100, 200);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].snMva).toBeGreaterThanOrEqual(100);
  });
});

describe('getHvTransformerById', () => {
  it('Znajduje istniejący wpis', () => {
    const e = getHvTransformerById('abb-trt3-110-15-25');
    expect(e).not.toBeNull();
    expect(e?.snMva).toBe(25);
    expect(e?.uhvKv).toBe(110);
    expect(e?.ulvKv).toBe(15);
  });

  it('Zwraca null dla nieistniejącego id', () => {
    expect(getHvTransformerById('nieistniejacy-id')).toBeNull();
  });
});

describe('toCatalogType', () => {
  it('Konwertuje do CatalogType z id+name+manufacturer', () => {
    const e = HV_TRANSFORMER_CATALOG[0];
    const ct = toCatalogType(e);
    expect(ct.id).toBe(e.id);
    expect(ct.name).toBe(e.designation);
    expect(ct.manufacturer).toBe(e.manufacturer);
  });
});

describe('HV_TRANSFORMER_NAMESPACE', () => {
  it('Marker namespace zwraca TRAFO_SN_NN', () => {
    expect(HV_TRANSFORMER_NAMESPACE).toBe('TRAFO_SN_NN');
  });
});
