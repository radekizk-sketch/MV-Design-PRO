import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  fmtPct01,
  maOdcinek,
  problemTorowosci,
  walidujFormularz,
  zbudujPayload,
  type SlupOdgaleznyFormData,
} from '../slupOdgaleznyModel';

function dane(over: Partial<SlupOdgaleznyFormData> = {}): SlupOdgaleznyFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'bp-1', ...over };
}

describe('slupOdgaleznyModel — walidacja', () => {
  it('wymaga słupa z katalogu', () => {
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });
  it('waliduje położenie w (0,1)', () => {
    expect(walidujFormularz(dane({ polozenie: 0 })).some((e) => e.field === 'polozenie')).toBe(true);
    expect(walidujFormularz(dane({ polozenie: 1 })).some((e) => e.field === 'polozenie')).toBe(true);
    expect(walidujFormularz(dane({ polozenie: 0.5 })).some((e) => e.field === 'polozenie')).toBe(false);
  });
});

describe('slupOdgaleznyModel — odcinek i torowość', () => {
  it('wykrywa obecność odcinka', () => {
    expect(maOdcinek({})).toBe(false);
    expect(maOdcinek({ segment_id: 'seg-1' })).toBe(true);
  });
  it('blokuje wstawienie na kablu (słup tylko na linii napowietrznej)', () => {
    expect(problemTorowosci({ segment_id: 'seg-1', segment_type: 'cable' })).not.toBeNull();
    expect(problemTorowosci({ segment_id: 'seg-1', segment_type: 'line_overhead' })).toBeNull();
    // Bez znanego typu odcinka nie blokujemy (backend rozstrzygnie).
    expect(problemTorowosci({ segment_id: 'seg-1' })).toBeNull();
  });
});

describe('slupOdgaleznyModel — payload', () => {
  it('buduje payload insert_at RATIO + katalog mv_branch_points', () => {
    const payload = zbudujPayload(
      dane({ polozenie: 0.5, nazwa: 'Słup A' }),
      { segment_id: 'seg-1', switch_state: 'open' },
    );
    expect(payload).toMatchObject({
      segment_id: 'seg-1',
      name: 'Słup A',
      switch_state: 'open',
      insert_at: { mode: 'RATIO', value: 0.5 },
      catalog_binding: expect.objectContaining({ catalog_namespace: 'mv_branch_points', catalog_item_id: 'bp-1' }),
    });
  });
  it('domyślna nazwa gdy pusta', () => {
    expect(zbudujPayload(dane({ nazwa: '' }), { segment_id: 'seg-1' }).name).toBe('Słup rozgałęźny SN');
  });
});

describe('slupOdgaleznyModel — formatery', () => {
  it('formatuje położenie jako procent', () => {
    expect(fmtPct01(0.5)).toBe('50 %');
    expect(fmtPct01(0.25)).toBe('25 %');
  });
});
