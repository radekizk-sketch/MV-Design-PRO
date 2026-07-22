import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  efektywnyRodzaj,
  maZrodlo,
  walidujFormularz,
  zbudujPayload,
  type KontekstOdgalezienia,
  type OdgaleznieFormData,
} from '../odgaleznieModel';

function kontekst(over: Partial<KontekstOdgalezienia> = {}): KontekstOdgalezienia {
  return {
    from_ref: 'bus-1.PORT',
    source_type_label: 'Szyna SN',
    source_name: 'Szyna A',
    forced_segment_type: null,
    initial_segment_type: 'cable',
    initial_catalog_ref: null,
    ...over,
  };
}

function dane(over: Partial<OdgaleznieFormData> = {}): OdgaleznieFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'cab-1', ...over };
}

describe('odgaleznieModel — walidacja', () => {
  it('wymaga długości > 0 i katalogu', () => {
    expect(walidujFormularz(dane({ dlugosc_km: 0 })).some((e) => e.field === 'dlugosc_km')).toBe(true);
    expect(walidujFormularz(dane({ dlugosc_km: null })).some((e) => e.field === 'dlugosc_km')).toBe(true);
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });
});

describe('odgaleznieModel — źródło i wymuszenie toru', () => {
  it('wykrywa jawny zacisk źródła', () => {
    expect(maZrodlo(kontekst())).toBe(true);
    expect(maZrodlo(kontekst({ from_ref: '' }))).toBe(false);
  });
  it('wymuszony rodzaj toru nadpisuje wybór użytkownika', () => {
    expect(efektywnyRodzaj(dane({ segment_type: 'cable' }), kontekst({ forced_segment_type: 'line_overhead' }))).toBe('line_overhead');
    expect(efektywnyRodzaj(dane({ segment_type: 'line_overhead' }), kontekst())).toBe('line_overhead');
  });
});

describe('odgaleznieModel — payload', () => {
  it('buduje payload from_ref + segment (kabel, długość w metrach, katalog KABEL_SN)', () => {
    const payload = zbudujPayload(dane({ segment_type: 'cable', dlugosc_km: 0.85 }), kontekst());
    expect(payload.from_ref).toBe('bus-1.PORT');
    expect(payload.segment).toMatchObject({
      rodzaj: 'KABEL',
      dlugosc_m: 850,
      catalog_binding: expect.objectContaining({ catalog_namespace: 'KABEL_SN', catalog_item_id: 'cab-1' }),
    });
  });
  it('linia napowietrzna → namespace LINIA_SN i rodzaj LINIA_NAPOWIETRZNA', () => {
    const payload = zbudujPayload(dane({ segment_type: 'line_overhead', dlugosc_km: 1 }), kontekst());
    expect(payload.segment).toMatchObject({
      rodzaj: 'LINIA_NAPOWIETRZNA',
      dlugosc_m: 1000,
      catalog_binding: expect.objectContaining({ catalog_namespace: 'LINIA_SN' }),
    });
  });
});
