import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  fmtPct01,
  maOdcinek,
  opisWariantu,
  problemTorowosci,
  walidujFormularz,
  zbudujPayload,
  type ZksnFormData,
} from '../zksnModel';

function dane(over: Partial<ZksnFormData> = {}): ZksnFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'zk-1', ...over };
}

describe('zksnModel — walidacja', () => {
  it('wymaga wariantu z katalogu', () => {
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });
  it('waliduje położenie w (0,1)', () => {
    expect(walidujFormularz(dane({ polozenie: 0 })).some((e) => e.field === 'polozenie')).toBe(true);
    expect(walidujFormularz(dane({ polozenie: 0.5 })).some((e) => e.field === 'polozenie')).toBe(false);
  });
});

describe('zksnModel — torowość i wariant', () => {
  it('blokuje wstawienie na linii napowietrznej (ZKSN tylko na kablu)', () => {
    expect(problemTorowosci({ segment_id: 'seg-1', segment_type: 'line_overhead' })).not.toBeNull();
    expect(problemTorowosci({ segment_id: 'seg-1', segment_type: 'cable' })).toBeNull();
  });
  it('opisuje wariant wg liczby portów', () => {
    expect(opisWariantu(1)).toContain('Przelotowy');
    expect(opisWariantu(2)).toContain('Odgałęźny');
  });
});

describe('zksnModel — payload', () => {
  it('buduje payload z liczbą portów i katalogiem mv_branch_points', () => {
    const payload = zbudujPayload(
      dane({ polozenie: 0.4, branch_ports_count: 2, nazwa: 'ZK-3' }),
      { segment_id: 'seg-1', switch_state: 'closed' },
    );
    expect(payload).toMatchObject({
      segment_id: 'seg-1',
      name: 'ZK-3',
      branch_ports_count: 2,
      switch_state: 'closed',
      insert_at: { mode: 'RATIO', value: 0.4 },
      catalog_binding: expect.objectContaining({ catalog_namespace: 'mv_branch_points', catalog_item_id: 'zk-1' }),
    });
  });
});

describe('zksnModel — formatery', () => {
  it('formatuje położenie jako procent', () => {
    expect(fmtPct01(0.4)).toBe('40 %');
  });
});
