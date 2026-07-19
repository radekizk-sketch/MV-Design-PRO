import { describe, expect, it } from 'vitest';

import type { LoadCatalogType } from '../../../../ui/catalog/types';
import {
  DANE_DOMYSLNE,
  fmtA,
  fmtKw,
  maOdplyw,
  prefillZKatalogu,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type OdbiorFormData,
} from '../odbiorModel';

const typy = [
  { id: 'L1', name: 'Odbiór biurowy', model: 'pq', p_kw: 80, q_kvar: 30, cos_phi: 0.94, cos_phi_mode: 'fixed' },
] as unknown as LoadCatalogType[];

function dane(over: Partial<OdbiorFormData> = {}): OdbiorFormData {
  return { ...DANE_DOMYSLNE, ...over };
}

describe('odbiorModel — walidacja', () => {
  it('wymaga dodatniej mocy i poprawnego cosφ', () => {
    expect(walidujFormularz(dane({ active_power_kw: 0 })).some((e) => e.field === 'active_power_kw')).toBe(true);
    expect(walidujFormularz(dane({ cos_phi: 1.5 })).some((e) => e.field === 'cos_phi')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });
});

describe('odbiorModel — odpływ', () => {
  it('wykrywa obecność odpływu', () => {
    expect(maOdplyw({})).toBe(false);
    expect(maOdplyw({ feeder_ref: 'f1' })).toBe(true);
  });
});

describe('odbiorModel — prefill z katalogu', () => {
  it('wypełnia moc i cosφ z katalogu', () => {
    const out = prefillZKatalogu(dane(), 'L1', typy);
    expect(out.active_power_kw).toBe(80);
    expect(out.cos_phi).toBe(0.94);
    expect(out.reactive_power_kvar).toBe(30);
    expect(out.catalog_ref).toBe('L1');
  });
  it('bez trafienia zachowuje dane, zapisuje ref', () => {
    const out = prefillZKatalogu(dane({ active_power_kw: 12 }), 'X', typy);
    expect(out.active_power_kw).toBe(12);
    expect(out.catalog_ref).toBe('X');
  });
});

describe('odbiorModel — podgląd R1', () => {
  it('buduje żądanie prądu z P/cosφ/napięcia', () => {
    expect(zbudujZapytaniePodgladu(dane({ active_power_kw: 100, cos_phi: 0.9 }), 400)).toEqual({
      active_power_kw: 100,
      cos_phi: 0.9,
      line_voltage_v: 400,
    });
    expect(zbudujZapytaniePodgladu(dane({ active_power_kw: null }), 400)).toBeNull();
  });
});

describe('odbiorModel — payload', () => {
  it('wysyła P + cosφ (Q wyprowadzi backend), bez jawnego Q', () => {
    const payload = zbudujPayload(dane({ active_power_kw: 100, cos_phi: 0.9 }), { feeder_ref: 'f1', bus_nn_ref: 'b1' });
    expect(payload).toMatchObject({
      feeder_ref: 'f1',
      bus_nn_ref: 'b1',
      active_power_kw: 100,
      cos_phi: 0.9,
      load_kind: 'SKUPIONY',
      connection_type: 'TROJFAZOWY',
    });
    expect(payload).not.toHaveProperty('reactive_power_kvar');
  });

  it('dołącza jawny override Q gdy podany', () => {
    const payload = zbudujPayload(dane({ reactive_power_kvar: 25 }), { feeder_ref: 'f1' });
    expect(payload).toHaveProperty('reactive_power_kvar', 25);
  });

  it('dołącza catalog_binding gdy wybrano typ', () => {
    const payload = zbudujPayload(dane({ catalog_ref: 'L1' }), { feeder_ref: 'f1' });
    expect(payload.catalog_binding).toMatchObject({ catalog_namespace: 'OBCIAZENIE', catalog_item_id: 'L1' });
  });
});

describe('odbiorModel — formatery', () => {
  it('formatuje wartości', () => {
    expect(fmtA(46.25)).toBe('46.3 A');
    expect(fmtKw(80)).toBe('80.0 kW');
    expect(fmtA(null)).toBe('—');
  });
});
