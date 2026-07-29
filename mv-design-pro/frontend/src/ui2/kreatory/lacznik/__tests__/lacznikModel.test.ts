import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  fmtPct01,
  maOdcinek,
  walidujFormularz,
  zbudujPayload,
  type LacznikFormData,
} from '../lacznikModel';

function dane(over: Partial<LacznikFormData> = {}): LacznikFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'app-1', ...over };
}

describe('lacznikModel — walidacja', () => {
  it('wymaga aparatu z katalogu', () => {
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });
  it('waliduje położenie w (0,1)', () => {
    expect(walidujFormularz(dane({ polozenie: 0 })).some((e) => e.field === 'polozenie')).toBe(true);
    expect(walidujFormularz(dane({ polozenie: 1 })).some((e) => e.field === 'polozenie')).toBe(true);
    expect(walidujFormularz(dane({ polozenie: 0.5 })).some((e) => e.field === 'polozenie')).toBe(false);
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
      name: 'Ł1',
      catalog_binding: expect.objectContaining({ catalog_namespace: 'APARAT_SN', catalog_item_id: 'app-1' }),
    });
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
  });
});
