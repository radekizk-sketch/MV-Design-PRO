import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  brakiFormularza,
  fmtPct01,
  konfliktyFormularza,
  maOdcinek,
  rodzajZKatalogu,
  walidujFormularz,
  zbudujPayload,
  type LacznikFormData,
} from '../lacznikModel';

function dane(over: Partial<LacznikFormData> = {}): LacznikFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'app-1', switch_type: 'ROZLACZNIK', polozenie: 0.5, ...over };
}

describe('lacznikModel — walidacja', () => {
  it('stan startowy nie zgaduje położenia ani rodzaju aparatu', () => {
    expect(DANE_DOMYSLNE.polozenie).toBeNull();
    expect(DANE_DOMYSLNE.switch_type).toBeNull();
  });
  it('wymaga aparatu z katalogu (BRAK_DO_OPERACJI z celem)', () => {
    const braki = brakiFormularza(dane({ catalog_ref: null }));
    expect(braki.map((e) => e.field)).toEqual(['catalog_ref']);
    expect(braki[0].message).toMatch(/ — /);
    expect(walidujFormularz(dane()).length).toBe(0);
  });
  it('braki w kolejności pracy: aparat, rodzaj, położenie', () => {
    expect(brakiFormularza({ ...DANE_DOMYSLNE }).map((e) => e.field)).toEqual([
      'catalog_ref',
      'switch_type',
      'polozenie',
    ]);
  });
  it('położenie spoza (0,1) to konflikt (widoczny od razu), brak położenia — brak', () => {
    expect(konfliktyFormularza(dane({ polozenie: 0 })).some((e) => e.field === 'polozenie')).toBe(true);
    expect(konfliktyFormularza(dane({ polozenie: 1 })).some((e) => e.field === 'polozenie')).toBe(true);
    expect(konfliktyFormularza(dane({ polozenie: null }))).toEqual([]);
    expect(brakiFormularza(dane({ polozenie: null })).map((e) => e.field)).toEqual(['polozenie']);
    expect(walidujFormularz(dane({ polozenie: 0.5 })).some((e) => e.field === 'polozenie')).toBe(false);
  });
  it('rodzaj niezgodny z pozycją katalogową to konflikt', () => {
    expect(konfliktyFormularza(dane({ switch_type: 'WYLACZNIK' }), 'ROZLACZNIK').map((e) => e.field)).toEqual([
      'switch_type',
    ]);
    expect(konfliktyFormularza(dane({ switch_type: 'ROZLACZNIK' }), 'ROZLACZNIK')).toEqual([]);
    expect(rodzajZKatalogu('UZIEMNIK')).toBeNull();
    expect(rodzajZKatalogu('WYLACZNIK')).toBe('WYLACZNIK');
  });
});

describe('lacznikModel — odcinek', () => {
  it('wykrywa obecność odcinka', () => {
    expect(maOdcinek({})).toBe(false);
    expect(maOdcinek({ segment_id: 'seg-1' })).toBe(true);
  });
});

describe('lacznikModel — payload', () => {
  it('buduje payload z insert_at RATIO, stanem i katalogiem APARAT_SN', () => {
    const payload = zbudujPayload(
      dane({ polozenie: 0.5, normal_state: 'open', switch_type: 'WYLACZNIK', nazwa: 'Ł1' }),
      { segment_id: 'seg-1' },
    );
    expect(payload).toMatchObject({
      segment_id: 'seg-1',
      insert_at: { mode: 'RATIO', value: 0.5 },
      switch_type: 'WYLACZNIK',
      normal_state: 'open',
      switch_name: 'Ł1',
      catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_SN', catalog_item_id: 'app-1' }),
    });
  });

  it('nazwa idzie kluczem kontraktu backendu `switch_name`, pusta nazwa nie jest wysyłana', () => {
    const zNazwa = zbudujPayload(dane({ nazwa: '  Wyłącznik odcinka 1 ' }), { segment_id: 'seg-1' });
    expect(zNazwa.switch_name).toBe('Wyłącznik odcinka 1');
    expect(zNazwa).not.toHaveProperty('name');
    const bezNazwy = zbudujPayload(dane({ nazwa: '   ' }), { segment_id: 'seg-1' });
    expect(bezNazwy).not.toHaveProperty('switch_name');
    expect(bezNazwy).not.toHaveProperty('name');
  });

  it('normalizuje stan zamknięty', () => {
    const payload = zbudujPayload(dane({ normal_state: 'closed' }), { segment_id: 'seg-1' });
    expect(payload.normal_state).toBe('closed');
  });
});

describe('lacznikModel — formatery', () => {
  it('formatuje położenie jako procent', () => {
    expect(fmtPct01(0.5)).toBe('50 %');
    expect(fmtPct01(0.25)).toBe('25 %');
    expect(fmtPct01(null)).toBe('—');
  });
});
