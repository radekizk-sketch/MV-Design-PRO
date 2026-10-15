/**
 * Tożsamość elementu nN (karta OBIEKT-KABEL-NN) — JEDEN predykat dla drzewa, inspektora,
 * karty technicznej i wyszukiwarki.
 *
 * Iloczyn cech: rodzaj gałęzi (kabel / linia / łącznik) × pasma końców (nN–nN, SN–SN,
 * nN–SN, szyna nieznana, szyna bez napięcia, granica 1 kV). Reguła parami z backendem
 * (`kabel_nn.lokalizuj_obwod_kabla_nn` i bramka operacji `set_nn_cable_laying_conditions`):
 * gałąź nN ⇔ OBA końce w paśmie nN.
 */
import { describe, expect, it } from 'vitest';

import {
  jestGaleziaNn,
  jestKablemNn,
  jestRozdzielnicaNn,
  rodzajGaleziPrzewodowejPl,
  szynaNn,
} from '../elementNn';

const MODEL = {
  buses: [
    { ref_id: 'nn1', voltage_kv: 0.4 },
    { ref_id: 'nn2', voltage_kv: 0.4 },
    { ref_id: 'g1', voltage_kv: 1.0 }, // granica pasma nN (włącznie)
    { ref_id: 'sn1', voltage_kv: 15 },
    { ref_id: 'sn2', voltage_kv: 15 },
    { ref_id: 'bez', voltage_kv: null },
  ],
};

type Pasma = readonly [string, string];
const PARY: Readonly<Record<string, { konce: Pasma; nn: boolean; pasmo: string | null }>> = {
  'nN–nN': { konce: ['nn1', 'nn2'], nn: true, pasmo: 'nN' },
  'nN–granica 1 kV': { konce: ['nn1', 'g1'], nn: true, pasmo: 'nN' },
  'SN–SN': { konce: ['sn1', 'sn2'], nn: false, pasmo: 'SN' },
  'nN–SN': { konce: ['nn1', 'sn1'], nn: false, pasmo: null },
  'nN–szyna nieznana': { konce: ['nn1', 'brak'], nn: false, pasmo: null },
  'nN–szyna bez napięcia': { konce: ['nn1', 'bez'], nn: false, pasmo: null },
};

describe('tożsamość gałęzi nN — iloczyn rodzaj × pasma końców', () => {
  for (const typ of ['cable', 'line_overhead', 'breaker'] as const) {
    for (const [nazwa, { konce, nn, pasmo }] of Object.entries(PARY)) {
      it(`${typ} × ${nazwa}`, () => {
        const galaz = { type: typ, from_bus_ref: konce[0], to_bus_ref: konce[1] };
        expect(jestGaleziaNn(MODEL, galaz)).toBe(nn);
        expect(jestKablemNn(MODEL, galaz)).toBe(nn && typ === 'cable');
        if (typ !== 'breaker') {
          const rdzen = typ === 'cable' ? 'Kabel' : 'Linia napowietrzna';
          expect(rodzajGaleziPrzewodowejPl(MODEL, galaz)).toBe(pasmo ? `${rdzen} ${pasmo}` : rdzen);
        }
      });
    }
  }

  it('kierunek gałęzi nie zmienia rozstrzygnięcia (predykat symetryczny)', () => {
    for (const { konce } of Object.values(PARY)) {
      const tam = { type: 'cable', from_bus_ref: konce[0], to_bus_ref: konce[1] };
      const z = { type: 'cable', from_bus_ref: konce[1], to_bus_ref: konce[0] };
      expect(jestKablemNn(MODEL, tam)).toBe(jestKablemNn(MODEL, z));
    }
  });

  it('brak modelu albo gałęzi = nie nN (brak danej ≠ nN)', () => {
    expect(jestGaleziaNn(null, { type: 'cable', from_bus_ref: 'nn1', to_bus_ref: 'nn2' })).toBe(false);
    expect(jestKablemNn(MODEL, null)).toBe(false);
    expect(szynaNn(MODEL, undefined)).toBe(false);
  });

  it('szyna wskazana przez `id` (nie tylko `ref_id`) też jest rozpoznana', () => {
    expect(szynaNn({ buses: [{ id: 'x', voltage_kv: 0.23 }] }, 'x')).toBe(true);
  });
});

describe('rozdzielnica nN', () => {
  it('rozpoznaje wyłącznie deklarację `rozdzielnica_nn`', () => {
    expect(jestRozdzielnicaNn({ station_type: 'rozdzielnica_nn' })).toBe(true);
    for (const typ of ['mv_lv', 'gpz', 'switching', 'customer', undefined]) {
      expect(jestRozdzielnicaNn({ station_type: typ })).toBe(false);
    }
    expect(jestRozdzielnicaNn(null)).toBe(false);
  });
});
