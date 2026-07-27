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
  lacznaDlugosc,
  lacznySpadekPct,
  LIMIT_SPADKU_PCT,
  maStartCiagu,
  ocenaDoboru,
  nextStepDozwolony,
  parametryZKatalogu,
  podsumujOdcinek,
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

describe('magistralaModel — builder realnej sieci (M2, V12K-071)', () => {
  it('podsumowuje dodany odcinek (rodzaj/typ/przekrój/długość)', () => {
    const p = parametryZKatalogu('KABEL', 'kab-1', [kabel], [linia]);
    const o = podsumujOdcinek(dane({ dlugosc_m: 1200 }), p, 'XRUHAKXS 1×120');
    expect(o).toMatchObject({ rodzaj: 'KABEL', typLabel: 'XRUHAKXS 1×120', cross_section_mm2: 120, dlugosc_m: 1200 });
  });

  it('sumuje łączną długość magistrali', () => {
    expect(
      lacznaDlugosc([
        { rodzaj: 'KABEL', typLabel: 'a', cross_section_mm2: 120, dlugosc_m: 500 },
        { rodzaj: 'LINIA', typLabel: 'b', cross_section_mm2: 70, dlugosc_m: 1500 },
      ]),
    ).toBe(2000);
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

  it('skumulowany spadek sumuje ZNANE skladniki i ZGLASZA niekompletnosc', () => {
    // Ten test wczesniej nazywal sie „pomija null" i utrwalal defekt: suma z
    // pominietym skladnikiem byla podawana jako spadek magistrali, a kreator
    // porownuje ja z limitem 5 %. Niepelne dane wyciszaly ostrzezenie, czyli dawaly
    // milczacy PASS na kryterium, ktorego nikt nie sprawdzil (V12K-227).
    // Intencja pomiaru zachowana: suma znanych = 1,2 + 2,1 = 3,3 %.
    const wynik = lacznySpadekPct([
      { rodzaj: 'KABEL', typLabel: 'a', cross_section_mm2: 120, dlugosc_m: 500, delta_u_pct: 1.2 },
      { rodzaj: 'KABEL', typLabel: 'b', cross_section_mm2: 120, dlugosc_m: 800, delta_u_pct: 2.1 },
      { rodzaj: 'LINIA', typLabel: 'c', cross_section_mm2: 70, dlugosc_m: 300, delta_u_pct: null },
    ]);

    expect(wynik.sumaZnanychPct).toBeCloseTo(3.3, 5);
    expect(wynik.odcinkiZeSpadkiem).toBe(2);
    expect(wynik.odcinkiBezSpadku).toBe(1);
    expect(wynik.kompletny).toBe(false);
  });

  it('wszystkie odcinki z wynikiem daja ocene KOMPLETNA', () => {
    // Kontrola odwrotna: bez niej flaga mogla by byc zawsze falszywa i nic nie znaczyc.
    const wynik = lacznySpadekPct([
      { rodzaj: 'KABEL', typLabel: 'a', cross_section_mm2: 120, dlugosc_m: 500, delta_u_pct: 1.2 },
      { rodzaj: 'KABEL', typLabel: 'b', cross_section_mm2: 120, dlugosc_m: 800, delta_u_pct: 2.1 },
    ]);

    expect(wynik.kompletny).toBe(true);
    expect(wynik.odcinkiBezSpadku).toBe(0);
    expect(wynik.sumaZnanychPct).toBeCloseTo(3.3, 5);
  });

  it('pusta magistrala jest KOMPLETNA z suma zero — nie ma czego brakowac', () => {
    const wynik = lacznySpadekPct([]);

    expect(wynik.kompletny).toBe(true);
    expect(wynik.sumaZnanychPct).toBe(0);
  });
});

describe('magistralaModel — asystent doboru przekroju (M3, V12K-072)', () => {
  const p = parametryZKatalogu('KABEL', 'kab-1', [kabel], [linia]); // Iz 255 A

  it('obciążalność OK gdy prąd ≤ Iz, ostrzeżenie gdy prąd > Iz', () => {
    expect(ocenaDoboru(p, 1.0, 200).obciazalnosc).toBe('ok');
    expect(ocenaDoboru(p, 1.0, 300).obciazalnosc).toBe('ostrzezenie');
    // Bez prądu roboczego → brak oceny obciążalności.
    expect(ocenaDoboru(p, 1.0, null).obciazalnosc).toBe('brak');
  });

  it('spadek OK gdy ΔU ≤ limit, ostrzeżenie powyżej', () => {
    expect(ocenaDoboru(p, 3.0, 200).spadek).toBe('ok');
    expect(ocenaDoboru(p, LIMIT_SPADKU_PCT + 0.5, 200).spadek).toBe('ostrzezenie');
    expect(ocenaDoboru(p, null, 200).spadek).toBe('brak');
  });

  it('zwraca prąd/Iz/ΔU/limit do interpretacji', () => {
    expect(ocenaDoboru(p, 2.5, 240)).toMatchObject({
      obciazenieA: 240,
      izA: 255,
      spadekPct: 2.5,
      limitPct: LIMIT_SPADKU_PCT,
    });
  });
});
