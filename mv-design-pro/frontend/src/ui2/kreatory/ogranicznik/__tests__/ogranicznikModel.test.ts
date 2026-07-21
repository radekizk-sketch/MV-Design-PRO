import { describe, expect, it } from 'vitest';

import type { SurgeArresterCatalogType } from '../../../../ui/catalog/types';
import {
  DANE_DOMYSLNE,
  maMiejsce,
  napiecieNiezgodne,
  parametryZKatalogu,
  walidujFormularz,
  zbudujPayload,
} from '../ogranicznikModel';

const TYP: SurgeArresterCatalogType = {
  id: 'arrester-abb-polim-d-24kv-10ka',
  name: 'ABB POLIM-D 24 kV 10 kA',
  u_m_kv: 24,
  mcov_kv: 20.4,
  u_rated_kv: 24,
  u_residual_at_10ka_kv: 75,
  tov_10s_kv: 28.8,
  energy_class: 2,
  energy_absorption_kj_per_kv: 4,
  bil_protected_kv: 125,
} as SurgeArresterCatalogType;

describe('ogranicznikModel', () => {
  it('wymaga wyboru typu z katalogu', () => {
    expect(walidujFormularz(DANE_DOMYSLNE)).toHaveLength(1);
    expect(walidujFormularz({ catalog_ref: TYP.id })).toHaveLength(0);
  });

  it('wyprowadza parametry z karty katalogu', () => {
    const p = parametryZKatalogu(TYP.id, [TYP]);
    expect(p).not.toBeNull();
    expect(p?.u_m_kv).toBe(24);
    expect(p?.mcov_kv).toBe(20.4);
    expect(p?.bil_protected_kv).toBe(125);
  });

  it('buduje payload z catalog_binding OGRANICZNIK_SN i field_ref', () => {
    const payload = zbudujPayload({ catalog_ref: TYP.id }, { field_ref: 'POLE-IN' });
    expect(payload.field_ref).toBe('POLE-IN');
    expect(payload.catalog_binding).toMatchObject({
      catalog_namespace: 'OGRANICZNIK_SN',
      catalog_item_id: TYP.id,
    });
  });

  it('przekazuje bus_ref, gdy launch z szyny (bez pola)', () => {
    const payload = zbudujPayload({ catalog_ref: TYP.id }, { bus_ref: 'BUS_SN' });
    expect(payload.bus_ref).toBe('BUS_SN');
    expect(payload.field_ref).toBeUndefined();
  });

  it('maMiejsce true dla pola lub szyny, false bez wskazania', () => {
    expect(maMiejsce({ field_ref: 'POLE-IN' })).toBe(true);
    expect(maMiejsce({ bus_ref: 'BUS_SN' })).toBe(true);
    expect(maMiejsce({})).toBe(false);
  });

  it('ostrzega, gdy U_m ogranicznika < napięcie szyny', () => {
    const p = parametryZKatalogu(TYP.id, [TYP]);
    expect(napiecieNiezgodne(p, { bus_voltage_kv: 20 })).toBe(false); // 24 >= 20 ok
    expect(napiecieNiezgodne(p, { bus_voltage_kv: 30 })).toBe(true); // 24 < 30 ostrzeżenie
  });
});
