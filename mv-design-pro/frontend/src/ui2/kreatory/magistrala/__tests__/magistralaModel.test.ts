import { describe, expect, it } from 'vitest';

import type { CableType, LineType } from '../../../../ui/catalog/types';
import {
  branchKindZRodzaju,
  DANE_DOMYSLNE,
  fmtA,
  fmtDlugosc,
  fmtPct,
  fmtV,
  kontekstKontynuacji,
  maStartCiagu,
  nextStepDozwolony,
  odcinekOceny,
  parametryZKatalogu,
  podsumujOdcinek,
  segmentKindZRodzaju,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytanieOceny,
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

  // Karta MAGISTRALA-OCENA: żądanie oceny niesie WARTOŚCI POL wprost — brak prądu zostaje
  // brakiem (dawniej UI podstawiał prąd znamionowy typu i sam porównywał wynik z limitem).
  it('żądanie oceny: brak prądu roboczego zostaje null (backend nazwie brak, UI nie podstawia Iz)', () => {
    const req = zbudujZapytanieOceny(dane({ prad_a: null, dlugosc_m: 500, napiecie_kv: 15 }), []);
    expect(req).toEqual({
      napiecie_kv: 15,
      odcinek: {
        rodzaj: 'KABEL',
        catalog_ref: 'kab-1',
        dlugosc_m: 500,
        prad_roboczy_a: null,
        cos_phi: DANE_DOMYSLNE.cos_phi,
        nazwa: null,
      },
      odcinki_zbudowane: [],
    });
  });

  it('żądanie oceny: brak typu i długości nie blokuje żądania (braki nazywa backend)', () => {
    const req = zbudujZapytanieOceny(dane({ catalog_ref: null, dlugosc_m: null }), []);
    expect(req?.odcinek).toMatchObject({ catalog_ref: null, dlugosc_m: null });
  });

  it('żądanie oceny: odcinki zbudowane w kolejności od startu, z danymi odcinka', () => {
    const p = parametryZKatalogu('KABEL', 'kab-1', [kabel], [linia]);
    const pierwszy = podsumujOdcinek(dane({ dlugosc_m: 1200, prad_a: 180, nazwa: 'A' }), p, 'XRUHAKXS');
    const req = zbudujZapytanieOceny(dane({ dlugosc_m: 800, prad_a: 150 }), [pierwszy]);
    expect(req?.odcinki_zbudowane).toEqual([
      { rodzaj: 'KABEL', catalog_ref: 'kab-1', dlugosc_m: 1200, prad_roboczy_a: 180, cos_phi: 0.95, nazwa: 'A' },
    ]);
    expect(req?.odcinek.dlugosc_m).toBe(800);
  });

  it('żądanie oceny: cosφ poza dziedziną albo napięcie niedodatnie → brak żądania', () => {
    expect(zbudujZapytanieOceny(dane({ cos_phi: 0 }), [])).toBeNull();
    expect(zbudujZapytanieOceny(dane({ cos_phi: 1.2 }), [])).toBeNull();
    expect(zbudujZapytanieOceny(dane({ napiecie_kv: 0 }), [])).toBeNull();
  });

  it('odcinek oceny normalizuje puste pola do null', () => {
    expect(odcinekOceny(dane({ catalog_ref: '  ', nazwa: ' ', dlugosc_m: 0, prad_a: -3 }))).toMatchObject({
      catalog_ref: null,
      nazwa: null,
      dlugosc_m: null,
      prad_roboczy_a: null,
    });
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

describe('magistralaModel — builder realnej sieci (M2, V12K-071)', () => {
  it('podsumowuje dodany odcinek (rodzaj/typ/przekrój/długość)', () => {
    const p = parametryZKatalogu('KABEL', 'kab-1', [kabel], [linia]);
    const o = podsumujOdcinek(dane({ dlugosc_m: 1200 }), p, 'XRUHAKXS 1×120');
    expect(o).toMatchObject({ rodzaj: 'KABEL', typLabel: 'XRUHAKXS 1×120', cross_section_mm2: 120, dlugosc_m: 1200 });
  });

  it('formatuje długość w m/km', () => {
    expect(fmtDlugosc(500)).toBe('500 m');
    expect(fmtDlugosc(2500)).toBe('2.50 km');
  });

  it('buduje kontekst kontynuacji z końca odcinka (start kolejnego)', () => {
    expect(kontekstKontynuacji('bus/end-1', 'trunk-1', '15 kV')).toMatchObject({
      trunk_id: 'trunk-1',
      from_terminal_id: 'bus/end-1',
      terminal_voltage_label: '15 kV',
    });
    // Start ciągu z tego kontekstu jest ważny (builder może kontynuować).
    expect(maStartCiagu(kontekstKontynuacji('bus/end-1', undefined, undefined))).toBe(true);
  });
});
