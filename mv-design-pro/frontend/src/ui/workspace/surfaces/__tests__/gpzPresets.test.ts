/**
 * gpzPresets + gpzAdvisor tests (R38-R39).
 */
import { describe, expect, it } from 'vitest';

import { GPZ_PRESETS, getGpzPresetById, filterGpzPresetsByLocation } from '../gpzPresets';
import { analyzeGpz } from '../gpzAdvisor';
import { HV_TRANSFORMER_CATALOG } from '../../../catalog/hvTransformerCatalog';
import type { Substation, Transformer, Bus, Bay } from '../../../../types/enm';

describe('gpzPresets', () => {
  it('Ma minimum 6 preset\'ów (4 typowe obszary)', () => {
    expect(GPZ_PRESETS.length).toBeGreaterThanOrEqual(6);
  });

  it('Każdy preset ma unique id', () => {
    const ids = GPZ_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Każdy preset wskazuje istniejący transformer w katalogu', () => {
    for (const p of GPZ_PRESETS) {
      const trafo = HV_TRANSFORMER_CATALOG.find((c) => c.id === p.transformerCatalogId);
      expect(trafo, `Preset ${p.id} → ${p.transformerCatalogId} musi być w HV_TRANSFORMER_CATALOG`).toBeDefined();
    }
  });

  it('Wszystkie 4 location tags reprezentowane (wiejski/miejski/przemysłowy/tranzytowy)', () => {
    const tags = new Set(GPZ_PRESETS.map((p) => p.locationTag));
    expect(tags.has('wiejski')).toBe(true);
    expect(tags.has('miejski')).toBe(true);
    expect(tags.has('przemysłowy')).toBe(true);
    expect(tags.has('tranzytowy')).toBe(true);
  });

  it('S\'\'k * R/X w sensownym zakresie', () => {
    for (const p of GPZ_PRESETS) {
      expect(p.typicalSk3Mva).toBeGreaterThan(0);
      expect(p.typicalRX).toBeGreaterThan(0);
      expect(p.typicalRX).toBeLessThan(0.5);
    }
  });

  it('getGpzPresetById znajduje istniejący preset', () => {
    const p = getGpzPresetById('preset-rural-standard');
    expect(p).not.toBeNull();
    expect(p?.transformerCount).toBe(2);
  });

  it('filterGpzPresetsByLocation filtruje po tagu', () => {
    const wiejski = filterGpzPresetsByLocation('wiejski');
    expect(wiejski.length).toBeGreaterThan(0);
    for (const p of wiejski) expect(p.locationTag).toBe('wiejski');
  });
});

describe('gpzAdvisor.analyzeGpz', () => {
  function gpz(overrides: Partial<Substation> = {}): Substation {
    return {
      id: 'gpz-1', ref_id: 'gpz-1', name: 'GPZ Test', tags: [], meta: {},
      station_type: 'gpz', bus_refs: [], transformer_refs: [],
      ...overrides,
    } as Substation;
  }
  function trafo(overrides: Partial<Transformer> = {}): Transformer {
    return {
      id: 'tr-1', ref_id: 'tr-1', name: 'TR1', tags: [], meta: {},
      hv_bus_ref: 'b1', lv_bus_ref: 'b2',
      sn_mva: 25, uhv_kv: 110, ulv_kv: 15, uk_percent: 11, pk_kw: 110,
      ...overrides,
    } as Transformer;
  }
  function bus(refId: string, voltageKv: number): Bus {
    return {
      id: refId, ref_id: refId, name: `bus-${voltageKv}`, voltage_kv: voltageKv, phase_system: '3ph', tags: [], meta: {},
    } as Bus;
  }
  function bay(role: Bay['bay_role']): Bay {
    return {
      id: 'bay-1', ref_id: 'bay-1', name: 'b', tags: [], meta: {},
      bay_role: role, substation_ref: 'gpz-1', bus_ref: 'b2', equipment_refs: [],
    } as Bay;
  }

  it('Brak substacji → blocker "Brak substacji"', () => {
    const out = analyzeGpz({
      substation: null, transformers: [], hvBuses: [], lvBuses: [], bays: [],
      hvShortCircuitMva: null, hvRX: null,
    });
    expect(out[0].level).toBe('blocker');
    expect(out[0].title).toContain('Brak substacji');
  });

  it('Brak nazwy → blocker "Brak nazwy GPZ"', () => {
    const out = analyzeGpz({
      substation: gpz({ name: '' }), transformers: [], hvBuses: [], lvBuses: [], bays: [],
      hvShortCircuitMva: null, hvRX: null,
    });
    expect(out.find((s) => s.title.includes('Brak nazwy GPZ'))).toBeDefined();
  });

  it('Brak transformatorów → blocker', () => {
    const out = analyzeGpz({
      substation: gpz(), transformers: [], hvBuses: [], lvBuses: [], bays: [],
      hvShortCircuitMva: 2500, hvRX: 0.1,
    });
    expect(out.find((s) => s.title.includes('Brak transformatorów'))).toBeDefined();
  });

  it('Brak S\'\'k → blocker', () => {
    const out = analyzeGpz({
      substation: gpz(), transformers: [trafo()], hvBuses: [], lvBuses: [], bays: [],
      hvShortCircuitMva: null, hvRX: null,
    });
    expect(out.find((s) => s.title.includes('mocy zwarciowej'))).toBeDefined();
  });

  it('Niski ratio S\'\'k/Sn → warning', () => {
    const out = analyzeGpz({
      substation: gpz(), transformers: [trafo({ sn_mva: 100 })],
      hvBuses: [bus('b1', 110)], lvBuses: [bus('b2', 15)], bays: [],
      hvShortCircuitMva: 500, hvRX: 0.1, // ratio = 5 (zbyt niskie)
    });
    expect(out.find((s) => s.title.includes('Niski ratio'))).toBeDefined();
  });

  it('Voltage mismatch między bus i trafo → warning', () => {
    const out = analyzeGpz({
      substation: gpz(), transformers: [trafo({ uhv_kv: 220 })],
      hvBuses: [bus('b1', 110)], lvBuses: [bus('b2', 15)], bays: [],
      hvShortCircuitMva: 2500, hvRX: 0.1,
    });
    expect(out.find((s) => s.title.includes('Niezgodność napięcia'))).toBeDefined();
  });

  it('R/X poza zakresem → warning', () => {
    const out = analyzeGpz({
      substation: gpz(), transformers: [trafo()],
      hvBuses: [bus('b1', 110)], lvBuses: [bus('b2', 15)], bays: [],
      hvShortCircuitMva: 2500, hvRX: 0.5, // poza zakresem
    });
    expect(out.find((s) => s.title.includes('R/X'))).toBeDefined();
  });

  it('2 trafa + 1 sekcja → warning', () => {
    const out = analyzeGpz({
      substation: gpz({ gpz_sections: [{ section_id: 's1', order: 1, name: 'S1', bus_ref: 'b2' }] }),
      transformers: [trafo(), trafo({ ref_id: 'tr-2' })],
      hvBuses: [bus('b1', 110)], lvBuses: [bus('b2', 15)], bays: [],
      hvShortCircuitMva: 2500, hvRX: 0.1,
    });
    expect(out.find((s) => s.title.includes('2 transformatory'))).toBeDefined();
  });

  it('Brak sprzęgła przy ≥2 sekcjach → warning', () => {
    const out = analyzeGpz({
      substation: gpz({
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'b2' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'b2' },
        ],
      }),
      transformers: [trafo(), trafo({ ref_id: 'tr-2' })],
      hvBuses: [bus('b1', 110)], lvBuses: [bus('b2', 15)], bays: [],
      hvShortCircuitMva: 2500, hvRX: 0.1,
    });
    expect(out.find((s) => s.title.includes('sprzęgła'))).toBeDefined();
  });

  it('Kompletny GPZ → info "GPZ jest kompletny inżyniersko"', () => {
    const lineBays = Array(8).fill(null).map((_, i) => bay('OUT'));
    const couplerBay = bay('COUPLER');
    const out = analyzeGpz({
      substation: gpz({
        meta: { operator: 'Energa', address_line: 'ul. Test 1', radio_id: '587' },
        gpz_sections: [
          { section_id: 's1', order: 1, name: 'S1', bus_ref: 'b2' },
          { section_id: 's2', order: 2, name: 'S2', bus_ref: 'b2' },
        ],
      }),
      transformers: [trafo(), trafo({ ref_id: 'tr-2' })],
      hvBuses: [bus('b1', 110)], lvBuses: [bus('b2', 15)],
      bays: [couplerBay, ...lineBays],
      hvShortCircuitMva: 2500, hvRX: 0.1,
    });
    expect(out.find((s) => s.level === 'info' && s.title.includes('kompletny'))).toBeDefined();
  });

  it('Sortowanie: blockers przed warnings przed suggestions', () => {
    const out = analyzeGpz({
      substation: gpz({ name: '' }),
      transformers: [],
      hvBuses: [], lvBuses: [], bays: [],
      hvShortCircuitMva: null, hvRX: null,
    });
    /* Wszystkie blockers powinny być przed warningami */
    let lastLevel = 0;
    const levelOrder = { blocker: 0, warning: 1, suggestion: 2, info: 3 };
    for (const s of out) {
      expect(levelOrder[s.level]).toBeGreaterThanOrEqual(lastLevel);
      lastLevel = levelOrder[s.level];
    }
  });

  it('Limit 12 sugestii', () => {
    const out = analyzeGpz({
      substation: gpz({ name: '' }), transformers: [], hvBuses: [], lvBuses: [], bays: [],
      hvShortCircuitMva: null, hvRX: null,
    });
    expect(out.length).toBeLessThanOrEqual(12);
  });
});
