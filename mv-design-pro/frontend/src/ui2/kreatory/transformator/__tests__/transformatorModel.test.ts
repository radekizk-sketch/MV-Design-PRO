import { describe, expect, it } from 'vitest';

import type { TransformerType } from '../../../../ui/catalog/types';
import {
  DANE_DOMYSLNE,
  fmtA,
  fmtMva,
  parametryZKatalogu,
  seedRegulacjiZKatalogu,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type TransformatorFormData,
} from '../transformatorModel';

const typy = [
  {
    id: 'energen-tonr-1000-15-04',
    name: 'TONR 1000',
    rated_power_mva: 1.0,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.4,
    uk_percent: 6,
    pk_kw: 10,
    i0_percent: 0.5,
    p0_kw: 1.2,
    vector_group: 'Dyn5',
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
] as unknown as TransformerType[];

function dane(over: Partial<TransformatorFormData> = {}): TransformatorFormData {
  return {
    ...DANE_DOMYSLNE,
    hv_bus_ref: 'bus-sn',
    lv_bus_ref: 'bus-nn',
    catalog_ref: 'energen-tonr-1000-15-04',
    ...over,
  };
}

describe('transformatorModel — walidacja', () => {
  it('wymaga szyn HV/LV i katalogu', () => {
    expect(walidujFormularz(dane({ hv_bus_ref: '' })).some((e) => e.field === 'hv_bus_ref')).toBe(true);
    expect(walidujFormularz(dane({ lv_bus_ref: '' })).some((e) => e.field === 'lv_bus_ref')).toBe(true);
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });

  it('odrzuca tę samą szynę po obu stronach', () => {
    expect(walidujFormularz(dane({ lv_bus_ref: 'bus-sn' })).some((e) => e.field === 'lv_bus_ref')).toBe(true);
  });

  it('OLTC AUTO wymaga napięcia zadanego', () => {
    const errs = walidujFormularz(dane({ regulation_type: 'OLTC', control_mode: 'AUTO', voltage_setpoint_kv: null }));
    expect(errs.some((e) => e.field === 'voltage_setpoint_kv')).toBe(true);
    expect(
      walidujFormularz(dane({ regulation_type: 'OLTC', control_mode: 'AUTO', voltage_setpoint_kv: 15.5 })).some(
        (e) => e.field === 'voltage_setpoint_kv',
      ),
    ).toBe(false);
  });

  it('waliduje zakres i krok zaczepów przy regulacji', () => {
    expect(walidujFormularz(dane({ regulation_type: 'DETC', tap_min_position: 5, tap_max_position: 2 })).some((e) => e.field === 'tap_min_position')).toBe(true);
    expect(walidujFormularz(dane({ regulation_type: 'DETC', tap_step_percent: 0 })).some((e) => e.field === 'tap_step_percent')).toBe(true);
  });
});

describe('transformatorModel — katalog i podgląd R2', () => {
  it('czyta parametry z katalogu', () => {
    expect(parametryZKatalogu('energen-tonr-1000-15-04', typy)).toMatchObject({
      rated_power_mva: 1.0,
      voltage_hv_kv: 15,
      voltage_lv_kv: 0.4,
      tap_min: -2,
      tap_max: 2,
    });
  });

  it('buduje żądanie R2 z konwersją MVA→kVA', () => {
    const params = parametryZKatalogu('energen-tonr-1000-15-04', typy);
    expect(zbudujZapytaniePodgladu(params)).toEqual({
      rated_power_kva: 1000,
      primary_voltage_kv: 15,
      secondary_voltage_kv: 0.4,
    });
  });

  it('seed regulacji przenosi zakres zaczepów z katalogu', () => {
    const params = parametryZKatalogu('energen-tonr-1000-15-04', typy);
    const seeded = seedRegulacjiZKatalogu(dane({ regulation_type: 'OLTC' }), params);
    expect(seeded.tap_min_position).toBe(-2);
    expect(seeded.tap_max_position).toBe(2);
    expect(seeded.tap_step_percent).toBe(2.5);
  });
});

describe('transformatorModel — payload', () => {
  it('bez regulacji nie wysyła pól OLTC', () => {
    const payload = zbudujPayload(dane(), { station_ref: 'st-1' });
    expect(payload).toMatchObject({
      hv_bus_ref: 'bus-sn',
      lv_bus_ref: 'bus-nn',
      station_ref: 'st-1',
      catalog_binding: expect.objectContaining({ catalog_namespace: 'TRAFO_SN_NN', catalog_item_id: 'energen-tonr-1000-15-04' }),
    });
    expect(payload).not.toHaveProperty('transformer_regulation_type');
  });

  it('OLTC AUTO wysyła komplet pól TapChanger', () => {
    const payload = zbudujPayload(
      dane({ regulation_type: 'OLTC', control_mode: 'AUTO', voltage_setpoint_kv: 15.5, deadband_kv: 0.2, regulated_winding: 'HV' }),
      {},
    );
    expect(payload).toMatchObject({
      transformer_regulation_type: 'OLTC',
      transformer_regulated_winding: 'HV',
      transformer_control_mode: 'AUTO',
      transformer_voltage_setpoint_kv: 15.5,
      transformer_deadband_kv: 0.2,
    });
  });

  it('DETC nie wysyła napięcia zadanego (tylko OLTC AUTO)', () => {
    const payload = zbudujPayload(dane({ regulation_type: 'DETC', voltage_setpoint_kv: 15.5 }), {});
    expect(payload).toHaveProperty('transformer_regulation_type', 'DETC');
    expect(payload).not.toHaveProperty('transformer_voltage_setpoint_kv');
  });
});

describe('transformatorModel — formatery', () => {
  it('formatuje wartości', () => {
    expect(fmtA(46.25)).toBe('46.3 A');
    expect(fmtMva(1)).toBe('1.00 MVA');
    expect(fmtA(null)).toBe('—');
  });
});
