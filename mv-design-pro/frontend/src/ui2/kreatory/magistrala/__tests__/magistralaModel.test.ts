import { describe, expect, it } from 'vitest';

import type { CableType, LineType } from '../../../../ui/catalog/types';
import {
  branchKindZRodzaju,
  DANE_DOMYSLNE,
  fmtA,
  fmtPct,
  fmtV,
  maStartCiagu,
  nextStepDozwolony,
  parametryZKatalogu,
  segmentKindZRodzaju,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type MagistralaFormData,
} from '../magistralaModel';

const kabel = {
  id: 'kab-1',
  name: 'XRUHAKXS 1x120',
  r_ohm_per_km: 0.253,
  x_ohm_per_km: 0.118,
  c_nf_per_km: 230,
  rated_current_a: 255,
  voltage_rating_kv: 15,
  cross_section_mm2: 120,
  conductor_material: 'AL',
  insulation_type: 'XLPE',
  standard: 'HD 620',
  max_temperature_c: 90,
  return_conductor_ith_1s_a: 12000,
} as unknown as CableType;

const linia = {
  id: 'lin-1',
  name: 'AFL-6 70',
  r_ohm_per_km: 0.443,
  x_ohm_per_km: 0.36,
  b_us_per_km: 2.7,
  rated_current_a: 230,
  voltage_rating_kv: 15,
  cross_section_mm2: 70,
  conductor_material: 'AL',
  standard: 'PN-EN 50182',
  max_temperature_c: 80,
} as unknown as LineType;

function dane(over: Partial<MagistralaFormData> = {}): MagistralaFormData {
  return { ...DANE_DOMYSLNE, catalog_ref: 'kab-1', ...over };
}

describe('magistralaModel — mapowanie rodzaju', () => {
  it('mapuje rodzaj na kanoniczny segment_kind', () => {
    expect(segmentKindZRodzaju('KABEL')).toBe('KABEL');
    expect(segmentKindZRodzaju('LINIA')).toBe('LINIA_NAPOWIETRZNA');
  });

  it('mapuje rodzaj na typ gałęzi walidacji semantycznej', () => {
    expect(branchKindZRodzaju('KABEL')).toBe('cable_sn');
    expect(branchKindZRodzaju('LINIA')).toBe('overhead_line_sn');
  });

  it('słup rozgałęźny dozwolony tylko dla linii napowietrznej', () => {
    expect(nextStepDozwolony('branch_pole', 'KABEL')).toBe(false);
    expect(nextStepDozwolony('branch_pole', 'LINIA')).toBe(true);
    expect(nextStepDozwolony('zksn', 'KABEL')).toBe(true);
    expect(nextStepDozwolony('station', 'KABEL')).toBe(true);
    expect(nextStepDozwolony('continue', 'KABEL')).toBe(true);
  });
});

describe('magistralaModel — walidacja', () => {
  it('wymaga typu z katalogu', () => {
    const errs = walidujFormularz(dane({ catalog_ref: null }));
    expect(errs.some((e) => e.field === 'catalog_ref')).toBe(true);
  });

  it('wymaga dodatniej długości', () => {
    const errs = walidujFormularz(dane({ dlugosc_m: 0 }));
    expect(errs.some((e) => e.field === 'dlugosc_m')).toBe(true);
  });

  it('waliduje zakres cosφ', () => {
    expect(walidujFormularz(dane({ cos_phi: 0 })).some((e) => e.field === 'cos_phi')).toBe(true);
    expect(walidujFormularz(dane({ cos_phi: 1.2 })).some((e) => e.field === 'cos_phi')).toBe(true);
    expect(walidujFormularz(dane({ cos_phi: 0.95 })).some((e) => e.field === 'cos_phi')).toBe(false);
  });

  it('blokuje słup rozgałęźny dla kabla', () => {
    const errs = walidujFormularz(dane({ rodzaj: 'KABEL', next_step: 'branch_pole' }));
    expect(errs.some((e) => e.field === 'next_step')).toBe(true);
  });

  it('poprawny formularz nie zgłasza błędów', () => {
    expect(walidujFormularz(dane())).toHaveLength(0);
  });
});

describe('magistralaModel — start ciągu', () => {
  it('wymaga terminalu albo pola źródłowego', () => {
    expect(maStartCiagu({})).toBe(false);
    expect(maStartCiagu({ from_terminal_id: '  ' })).toBe(false);
    expect(maStartCiagu({ from_terminal_id: 'bus-1' })).toBe(true);
    expect(maStartCiagu({ field_ref: 'bay-1' })).toBe(true);
  });
});

describe('magistralaModel — payload', () => {
  it('buduje payload z kanonicznym segment_kind i katalog-first', () => {
    const payload = zbudujPayload(dane({ rodzaj: 'KABEL', dlugosc_m: 500, nazwa: 'Magistrala A' }), {
      from_terminal_id: 'bus-gpz-1',
    });
    expect(payload).toMatchObject({
      from_terminal_id: 'bus-gpz-1',
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: 500,
        name: 'Magistrala A',
        catalog_binding: { catalog_namespace: 'KABEL_SN', catalog_item_id: 'kab-1' },
      },
    });
    expect(payload).not.toHaveProperty('trunk_id');
  });

  it('mapuje linię na LINIA_SN oraz LINIA_NAPOWIETRZNA', () => {
    const payload = zbudujPayload(dane({ rodzaj: 'LINIA', catalog_ref: 'lin-1' }), {
      field_ref: 'bay-1',
      trunk_id: 'trunk-9',
    });
    expect(payload.segment).toMatchObject({
      rodzaj: 'LINIA_NAPOWIETRZNA',
      catalog_binding: { catalog_namespace: 'LINIA_SN', catalog_item_id: 'lin-1' },
    });
    expect(payload).toMatchObject({ field_ref: 'bay-1', trunk_id: 'trunk-9' });
  });

  it('pomija pustą nazwę', () => {
    const payload = zbudujPayload(dane({ nazwa: '   ' }), { from_terminal_id: 'bus-1' });
    expect((payload.segment as Record<string, unknown>)).not.toHaveProperty('name');
  });
});

describe('magistralaModel — katalog i podgląd', () => {
  it('czyta parametry R/X/Iznam z katalogu', () => {
    expect(parametryZKatalogu('KABEL', 'kab-1', [kabel], [linia])).toMatchObject({
      r_ohm_per_km: 0.253,
      rated_current_a: 255,
    });
    expect(parametryZKatalogu('LINIA', 'lin-1', [kabel], [linia])).toMatchObject({
      r_ohm_per_km: 0.443,
      rated_current_a: 230,
    });
    expect(parametryZKatalogu('KABEL', null, [kabel], [linia])).toBeNull();
  });

  it('kabel niesie parametry normowe kabla (C, izolacja, Ith żyły powrotnej), bez B (V12K-070)', () => {
    const p = parametryZKatalogu('KABEL', 'kab-1', [kabel], [linia]);
    expect(p).toMatchObject({
      cross_section_mm2: 120,
      conductor_material: 'AL',
      standard: 'HD 620',
      max_temperature_c: 90,
      c_nf_per_km: 230,
      insulation_type: 'XLPE',
      return_conductor_ith_1s_a: 12000,
    });
    // Kabel nie ma susceptancji B linii.
    expect(p?.b_us_per_km).toBeNull();
  });

  it('linia napowietrzna niesie susceptancję B, bez C/izolacji/żyły powrotnej (V12K-070)', () => {
    const p = parametryZKatalogu('LINIA', 'lin-1', [kabel], [linia]);
    expect(p).toMatchObject({
      cross_section_mm2: 70,
      conductor_material: 'AL',
      standard: 'PN-EN 50182',
      max_temperature_c: 80,
      b_us_per_km: 2.7,
    });
    // Linia nie ma pojemności kabla, izolacji ani żyły powrotnej.
    expect(p?.c_nf_per_km).toBeNull();
    expect(p?.insulation_type).toBeNull();
    expect(p?.return_conductor_ith_1s_a).toBeNull();
  });

  it('buduje żądanie podglądu ΔU z prądem znamionowym gdy brak obciążenia', () => {
    const params = parametryZKatalogu('KABEL', 'kab-1', [kabel], [linia]);
    const req = zbudujZapytaniePodgladu(dane({ prad_a: null, dlugosc_m: 500, napiecie_kv: 15 }), params);
    expect(req).toMatchObject({
      current_a: 255,
      length_km: 0.5,
      r_ohm_per_km: 0.253,
      line_voltage_v: 15000,
    });
  });

  it('używa podanego prądu obciążenia gdy dostępny', () => {
    const params = parametryZKatalogu('KABEL', 'kab-1', [kabel], [linia]);
    const req = zbudujZapytaniePodgladu(dane({ prad_a: 180 }), params);
    expect(req?.current_a).toBe(180);
  });

  it('zwraca null bez kompletu danych', () => {
    expect(zbudujZapytaniePodgladu(dane(), null)).toBeNull();
  });
});

describe('magistralaModel — formatery', () => {
  it('formatuje wartości i braki', () => {
    expect(fmtV(12.34)).toBe('12.3 V');
    expect(fmtPct(2.345)).toBe('2.35 %');
    expect(fmtA(254.6)).toBe('255 A');
    expect(fmtV(null)).toBe('—');
    expect(fmtPct(undefined)).toBe('—');
  });
});
