import { describe, expect, it } from 'vitest';

import type { ShuntCapacitorCatalogType } from '../../../../ui/catalog/types';
import {
  DANE_DOMYSLNE,
  fmtA,
  fmtKv,
  fmtMvar,
  fmtSiemens,
  maSzyne,
  napiecieNiezgodne,
  parametryZKatalogu,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type KompensatorFormData,
} from '../kompensatorModel';

const typy = [
  { id: 'KOMP_SN_1V2_15KV', name: 'Bateria 1,2 Mvar 15 kV', rated_mvar: 1.2, rated_kv: 15, loss_kw: 0.6 },
  { id: 'KOMP_SN_1V8_20KV', name: 'Bateria 1,8 Mvar 20 kV', rated_mvar: 1.8, rated_kv: 20, loss_kw: 0.9 },
] as unknown as ShuntCapacitorCatalogType[];

function dane(over: Partial<KompensatorFormData> = {}): KompensatorFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'KOMP_SN_1V2_15KV', ...over };
}

describe('kompensatorModel — walidacja', () => {
  it('wymaga typu z katalogu', () => {
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane())).toHaveLength(0);
  });
});

describe('kompensatorModel — szyna', () => {
  it('wykrywa obecność szyny', () => {
    expect(maSzyne({})).toBe(false);
    expect(maSzyne({ bus_ref: '  ' })).toBe(false);
    expect(maSzyne({ bus_ref: 'bus-sn-1' })).toBe(true);
  });
});

describe('kompensatorModel — katalog i podgląd', () => {
  it('czyta parametry z katalogu', () => {
    expect(parametryZKatalogu('KOMP_SN_1V2_15KV', typy)).toMatchObject({
      rated_mvar: 1.2,
      rated_kv: 15,
      loss_kw: 0.6,
    });
    expect(parametryZKatalogu(null, typy)).toBeNull();
  });

  it('buduje żądanie podglądu z parametrów katalogu', () => {
    const params = parametryZKatalogu('KOMP_SN_1V2_15KV', typy);
    expect(zbudujZapytaniePodgladu(params)).toEqual({ rated_mvar: 1.2, rated_kv: 15 });
    expect(zbudujZapytaniePodgladu(null)).toBeNull();
  });
});

describe('kompensatorModel — payload', () => {
  it('buduje payload katalog-first z bus_ref i statusem', () => {
    const payload = zbudujPayload(dane({ nazwa: 'Bateria A', status: 'closed' }), { bus_ref: 'bus-sn-1' });
    expect(payload).toMatchObject({
      status: 'closed',
      bus_ref: 'bus-sn-1',
      name: 'Bateria A',
      catalog_binding: expect.objectContaining({
        catalog_namespace: 'KOMPENSATOR_SN',
        catalog_item_id: 'KOMP_SN_1V2_15KV',
      }),
    });
  });

  it('pomija pustą nazwę', () => {
    const payload = zbudujPayload(dane({ nazwa: '   ' }), { bus_ref: 'bus-sn-1' });
    expect(payload).not.toHaveProperty('name');
  });
});

describe('kompensatorModel — niezgodność napięcia', () => {
  it('wykrywa niezgodność napięcia typu i szyny', () => {
    const p20 = parametryZKatalogu('KOMP_SN_1V8_20KV', typy);
    expect(napiecieNiezgodne(p20, { bus_ref: 'b', bus_voltage_kv: 15 })).toBe(true);
    const p15 = parametryZKatalogu('KOMP_SN_1V2_15KV', typy);
    expect(napiecieNiezgodne(p15, { bus_ref: 'b', bus_voltage_kv: 15 })).toBe(false);
    // Bez napięcia szyny — brak ostrzeżenia (backend i tak waliduje twardo).
    expect(napiecieNiezgodne(p15, { bus_ref: 'b' })).toBe(false);
  });
});

describe('kompensatorModel — formatery', () => {
  it('formatuje wartości', () => {
    expect(fmtMvar(1.2)).toBe('1.20 Mvar');
    expect(fmtKv(15)).toBe('15.0 kV');
    expect(fmtA(46)).toBe('46 A');
    expect(fmtSiemens(0.0000053)).toBe('5.30 µS');
    expect(fmtMvar(null)).toBe('—');
  });
});
