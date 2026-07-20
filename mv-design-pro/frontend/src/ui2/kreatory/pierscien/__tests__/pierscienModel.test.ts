import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  fmtDlugosc,
  maZaciski,
  walidujDomkniecie,
  walidujNop,
  zbudujPayloadDomkniecie,
  zbudujPayloadNop,
  type KontekstPierscienia,
  type PierscienFormData,
} from '../pierscienModel';

function dane(over: Partial<PierscienFormData> = {}): PierscienFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'cab-1', ...over };
}

const KONTEKST: KontekstPierscienia = {
  terminalA_id: 'bus-a',
  terminalA_label: 'Szyna A',
  terminalB_id: 'bus-b',
  terminalB_label: 'Szyna B',
  kandydaciNop: [{ id: 'sw-1', label: 'Ł1' }],
};

describe('pierscienModel — zaciski', () => {
  it('wykrywa obecność obu zacisków', () => {
    expect(maZaciski({ kandydaciNop: [] })).toBe(false);
    expect(maZaciski({ terminalA_id: 'a', kandydaciNop: [] })).toBe(false);
    expect(maZaciski(KONTEKST)).toBe(true);
  });
});

describe('pierscienModel — walidacja domknięcia', () => {
  it('wymaga katalogu i dodatniej długości', () => {
    expect(walidujDomkniecie(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujDomkniecie(dane({ dlugosc_m: 0 })).some((e) => e.field === 'dlugosc_m')).toBe(true);
    expect(walidujDomkniecie(dane()).length).toBe(0);
  });
});

describe('pierscienModel — walidacja NOP', () => {
  it('wymaga wskazania łącznika NOP', () => {
    expect(walidujNop(dane({ nop_ref: null })).some((e) => e.field === 'nop_ref')).toBe(true);
    expect(walidujNop(dane({ nop_ref: 'sw-1' })).length).toBe(0);
  });
});

describe('pierscienModel — payload domknięcia', () => {
  it('buduje payload connect_secondary_ring_sn z zaciskami i segmentem katalogowym', () => {
    const payload = zbudujPayloadDomkniecie(dane({ rodzaj: 'KABEL', dlugosc_m: 300 }), KONTEKST);
    expect(payload).toMatchObject({
      from_bus_ref: 'bus-a',
      to_bus_ref: 'bus-b',
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: 300,
        catalog_binding: expect.objectContaining({ catalog_namespace: 'KABEL_SN', catalog_item_id: 'cab-1' }),
      },
    });
  });

  it('mapuje linię napowietrzną na LINIA_NAPOWIETRZNA + namespace LINIA_SN', () => {
    const payload = zbudujPayloadDomkniecie(dane({ rodzaj: 'LINIA' }), KONTEKST);
    const segment = payload.segment as Record<string, unknown>;
    expect(segment.rodzaj).toBe('LINIA_NAPOWIETRZNA');
    expect(segment.catalog_binding).toMatchObject({ catalog_namespace: 'LINIA_SN' });
  });
});

describe('pierscienModel — payload NOP + formatery', () => {
  it('buduje payload set_normal_open_point', () => {
    expect(zbudujPayloadNop(dane({ nop_ref: 'sw-9' }))).toEqual({ switch_ref: 'sw-9' });
  });
  it('formatuje długość', () => {
    expect(fmtDlugosc(300)).toBe('300 m');
    expect(fmtDlugosc(null)).toBe('—');
  });
});
