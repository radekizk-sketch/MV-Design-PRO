/**
 * Testy kontraktu modelu kreatora źródła zasilania — payload operacji domenowej
 * i walidacja są przeniesione 1:1 z retirowanego GridSourceEditor/AddGridSourceForm,
 * więc testy pilnują, że kontrakt `add_grid_source_sn` nie uległ zmianie.
 */

import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  scalDanePoczatkowe,
  walidujFormularz,
  wierszeGotowosci,
  zbudujOznaczenieGpz,
  zbudujPayloadZrodla,
  zbudujZadaniePodgladu,
  type GridSourceFormData,
} from '../zrodloModel';

function daneKompletne(nadpisz: Partial<GridSourceFormData> = {}): GridSourceFormData {
  return {
    ...DANE_DOMYSLNE,
    catalog_ref: 'GPZ-001',
    gpz_line_field_apparatus_catalog_ref: 'APP-001',
    ...nadpisz,
  };
}

describe('zbudujPayloadZrodla — kontrakt operacji add_grid_source_sn', () => {
  it('buduje wiązanie katalogowe ZRODLO_SN z wybranej pozycji', () => {
    const payload = zbudujPayloadZrodla(daneKompletne());
    expect(payload.catalog_binding).toMatchObject({
      catalog_namespace: 'ZRODLO_SN',
      catalog_item_id: 'GPZ-001',
      materialize: true,
    });
  });

  it('generuje sekcje GPZ z per-sekcyjną liczbą pól liniowych', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      sections_count: 2,
      sekcje: [
        { nazwa: 'Sekcja A', liczbaPol: 3 },
        { nazwa: 'Sekcja B', liczbaPol: 1 },
      ],
    }));
    const sekcje = payload.gpz_sections as Array<{ name: string; line_field_names: string[] }>;
    expect(sekcje).toHaveLength(2);
    expect(sekcje[0].name).toBe('Sekcja A');
    expect(sekcje[0].line_field_names).toHaveLength(3);
    expect(sekcje[1].line_field_names).toHaveLength(1);
  });

  it('tryb ręczny (110 kV) buduje manual_equivalent i sk3_hv_mva zamiast katalogu', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      short_circuit_input_side: 'HV_110',
      hv_voltage_kv: 110,
      sk3_hv_mva: 2500,
      rx_ratio: 0.1,
    }));
    expect(payload.catalog_binding).toBeUndefined();
    expect(payload.sk3_hv_mva).toBe(2500);
    expect(payload.source_mode).toBe('EKSPERCKI_RECZNY');
    expect(payload.manual_equivalent).toMatchObject({ short_circuit_input_side: 'HV_110', sk3_hv_mva: 2500 });
  });

  it('mapuje uziemienie bezpośrednie solid_grounded → directly_grounded', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({ grounding_type: 'solid_grounded' }));
    expect(payload.grounding).toMatchObject({ type: 'directly_grounded' });
  });

  it('niesie parametry zwarciowe SN (sk3_mva + rx_ratio) i składową zerową', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({ sk3_mva: 310, rx_ratio: 0.12 }));
    expect(payload.sk3_mva).toBe(310);
    expect(payload.rx_ratio).toBe(0.12);
    expect(payload.zero_sequence).toMatchObject({ enabled: true, z0_z1_ratio: 3.2 });
    expect(payload.short_circuit_input_side).toBe('SN');
    expect(payload.short_circuit_mode).toBe('SHORT_CIRCUIT_POWER');
  });

  it('ogranicza liczbę transformatorów do zakresu 1-4', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({ transformer_count: 9 }));
    expect(payload.transformer_count).toBe(4);
  });

  it('rodzina rozdzielnicy → pola komponowane ze szablonu producenta (bays[] + refy)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      switchgear_family_ref: 'ABB__SAFERING',
      manufacturer_ref: 'ABB',
      sections_count: 1,
      sekcje: [{ nazwa: 'Sekcja A', liczbaPol: 2, bayTemplateRef: 'ABB__SAFERING__LINE_OUT' }],
    }));
    expect(payload.switchgear_family_ref).toBe('ABB__SAFERING');
    expect(payload.manufacturer_ref).toBe('ABB');
    const sekcje = payload.gpz_sections as Array<{ bay_template_ref?: string; bays?: Array<{ bay_role: string; bay_template_ref: string }> }>;
    expect(sekcje[0].bay_template_ref).toBe('ABB__SAFERING__LINE_OUT');
    expect(sekcje[0].bays).toHaveLength(2);
    expect(sekcje[0].bays?.[0]).toMatchObject({ bay_role: 'LINIA_ODG', bay_template_ref: 'ABB__SAFERING__LINE_OUT' });
  });

  it('bez rodziny rozdzielnicy payload nie niesie bays ani refów producenta (kompat.)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne());
    expect(payload.switchgear_family_ref).toBeUndefined();
    const sekcje = payload.gpz_sections as Array<{ bays?: unknown }>;
    expect(sekcje[0].bays).toBeUndefined();
    expect(payload.transformer_catalog_ref).toBeUndefined();
  });

  it('wybrany transformator 110/SN z katalogu trafia do payloadu (Sn/uk/grupa)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      transformer_catalog_ref: 'TR-110-15-25',
      transformer_sn_mva: 25,
      transformer_uk_percent: 12.5,
      transformer_vector_group: 'YNd11',
    }));
    expect(payload.transformer_catalog_ref).toBe('TR-110-15-25');
    expect(payload.transformer_sn_mva).toBe(25);
    expect(payload.transformer_uk_percent).toBe(12.5);
    expect(payload.transformer_vector_group).toBe('YNd11');
  });

  it('bez regulacji payload nie niesie kluczy OLTC (kompat./determinizm)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne());
    expect(payload.transformer_regulation_type).toBeUndefined();
    expect(payload.transformer_voltage_setpoint_kv).toBeUndefined();
    expect(payload.transformer_ldc_enabled).toBeUndefined();
  });

  it('OLTC automatyczny mapuje pełny kontrakt TapChanger na klucze transformer_*', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      oltc_regulation_type: 'OLTC',
      oltc_tap_changer_catalog_ref: 'tc_oltc_110sn_19_125',
      oltc_regulated_winding: 'HV',
      oltc_neutral_position: 0,
      oltc_current_position: 1,
      oltc_min_position: -9,
      oltc_max_position: 9,
      oltc_step_percent: 1.25,
      oltc_control_mode: 'AUTOMATIC',
      oltc_voltage_setpoint_kv: 15.3,
      oltc_deadband_kv: 0.2,
      oltc_delay_seconds: 30,
      oltc_ldc_enabled: true,
      oltc_ldc_r_ohm: 0.5,
      oltc_ldc_x_ohm: 1.2,
    }));
    expect(payload.transformer_regulation_type).toBe('OLTC');
    expect(payload.transformer_tap_changer_catalog_ref).toBe('tc_oltc_110sn_19_125');
    expect(payload.transformer_regulated_winding).toBe('HV');
    expect(payload.transformer_tap_min_position).toBe(-9);
    expect(payload.transformer_tap_max_position).toBe(9);
    expect(payload.transformer_tap_step_percent).toBe(1.25);
    expect(payload.transformer_control_mode).toBe('AUTOMATIC');
    expect(payload.transformer_voltage_setpoint_kv).toBe(15.3);
    expect(payload.transformer_deadband_kv).toBe(0.2);
    expect(payload.transformer_delay_seconds).toBe(30);
    expect(payload.transformer_ldc_enabled).toBe(true);
    expect(payload.transformer_ldc_r_ohm).toBe(0.5);
    expect(payload.transformer_ldc_x_ohm).toBe(1.2);
  });

  it('DETC nie niesie kluczy specyficznych dla OLTC (setpoint/deadband/LDC)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      oltc_regulation_type: 'DETC',
      oltc_step_percent: 2.5,
      oltc_min_position: -2,
      oltc_max_position: 2,
    }));
    expect(payload.transformer_regulation_type).toBe('DETC');
    expect(payload.transformer_voltage_setpoint_kv).toBeUndefined();
    expect(payload.transformer_ldc_enabled).toBeUndefined();
  });
});

describe('walidujFormularz — regulacja zaczepów (OLTC)', () => {
  it('OLTC automatyczny bez napięcia zadanego → błąd', () => {
    const bledy = walidujFormularz(daneKompletne({
      oltc_regulation_type: 'OLTC',
      oltc_control_mode: 'AUTOMATIC',
      oltc_voltage_setpoint_kv: null,
    }));
    expect(bledy.some((b) => b.field === 'oltc_voltage_setpoint_kv')).toBe(true);
  });

  it('krok zaczepu = 0 jest blokowany', () => {
    const bledy = walidujFormularz(daneKompletne({
      oltc_regulation_type: 'OLTC',
      oltc_step_percent: 0,
    }));
    expect(bledy.some((b) => b.field === 'oltc_step_percent')).toBe(true);
  });

  it('zły zakres (min >= max) jest blokowany', () => {
    const bledy = walidujFormularz(daneKompletne({
      oltc_regulation_type: 'DETC',
      oltc_min_position: 5,
      oltc_max_position: 3,
    }));
    expect(bledy.some((b) => b.field === 'oltc_max_position')).toBe(true);
  });

  it('pozycja bieżąca poza zakresem jest blokowana', () => {
    const bledy = walidujFormularz(daneKompletne({
      oltc_regulation_type: 'OLTC',
      oltc_min_position: -9,
      oltc_max_position: 9,
      oltc_current_position: 15,
    }));
    expect(bledy.some((b) => b.field === 'oltc_current_position')).toBe(true);
  });

  it('bez regulacji (NONE) nie zgłasza błędów OLTC', () => {
    expect(walidujFormularz(daneKompletne()).some((b) => b.field.startsWith('oltc_'))).toBe(false);
  });
});

describe('walidujFormularz', () => {
  it('bez błędów dla kompletnych danych katalogowych', () => {
    expect(walidujFormularz(daneKompletne())).toEqual([]);
  });

  it('wymaga nazwy GPZ', () => {
    const bledy = walidujFormularz(daneKompletne({ source_name: '   ' }));
    expect(bledy.some((b) => b.field === 'source_name')).toBe(true);
  });

  it('wymaga pozycji katalogowej (katalog-first)', () => {
    const bledy = walidujFormularz(daneKompletne({ catalog_ref: null }));
    expect(bledy.some((b) => b.field === 'catalog_ref')).toBe(true);
  });

  it('wymaga aparatu pola liniowego', () => {
    const bledy = walidujFormularz(daneKompletne({ gpz_line_field_apparatus_catalog_ref: null }));
    expect(bledy.some((b) => b.field === 'gpz_line_field_apparatus_catalog_ref')).toBe(true);
  });

  it('tryb ręczny 110 kV wymaga Sk″ i napięcia strony WN (nie katalogu)', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_input_side: 'HV_110',
      hv_voltage_kv: null,
      sk3_hv_mva: null,
    }));
    expect(bledy.some((b) => b.field === 'catalog_ref')).toBe(false);
    expect(bledy.some((b) => b.field === 'hv_voltage_kv')).toBe(true);
    expect(bledy.some((b) => b.field === 'sk3_hv_mva')).toBe(true);
  });

  it('tryb ręczny impedancja wymaga dodatniej reaktancji X', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_input_side: 'SN',
      short_circuit_mode: 'IMPEDANCE',
      r_ohm: 0.1,
      x_ohm: null,
    }));
    expect(bledy.some((b) => b.field === 'x_ohm')).toBe(true);
  });

  it('odrzuca liczbę sekcji spoza zakresu 1-4', () => {
    expect(walidujFormularz(daneKompletne({ sections_count: 5 })).some((b) => b.field === 'sections_count')).toBe(true);
    expect(walidujFormularz(daneKompletne({ sections_count: 0 })).some((b) => b.field === 'sections_count')).toBe(true);
  });

  it('uziemienie rezystorowe wymaga dodatniej rezystancji', () => {
    const bledy = walidujFormularz(daneKompletne({ grounding_type: 'resistor_grounded', grounding_r_ohm: null }));
    expect(bledy.some((b) => b.field === 'grounding_r_ohm')).toBe(true);
  });
});

describe('zbudujZadaniePodgladu', () => {
  it('buduje żądanie podglądu dla poprawnych danych SN', () => {
    const req = zbudujZadaniePodgladu(daneKompletne({ sk3_mva: 250, rx_ratio: 0.1, thermal_time_s: 1 }));
    expect(req).toMatchObject({ voltage_kv: 15, sk3_mva: 250, rx_ratio: 0.1, tk_s: 1, tb_s: 0.1 });
  });

  it('zwraca null gdy brak mocy zwarciowej', () => {
    expect(zbudujZadaniePodgladu(daneKompletne({ sk3_mva: null }))).toBeNull();
  });
});

describe('wierszeGotowosci', () => {
  it('oznacza brak identyfikacji jako brak', () => {
    const wiersze = wierszeGotowosci(daneKompletne({ source_name: '' }));
    expect(wiersze.find((w) => w.etykieta === 'Identyfikacja')?.stan).toBe('brak');
  });

  it('składowa zerowa wyłączona → ostrzeżenie', () => {
    const wiersze = wierszeGotowosci(daneKompletne({ zero_sequence_enabled: false }));
    expect(wiersze.find((w) => w.etykieta === 'Składowa zerowa')?.stan).toBe('ostrzezenie');
  });
});

describe('scalDanePoczatkowe / oznaczenie', () => {
  it('ogranicza liczniki i synchronizuje sekcje; zachowuje tryb ekspercki', () => {
    const dane = scalDanePoczatkowe({ manual_mode: true, sections_count: 9, line_fields_per_section: 99 });
    // Tryb ręczny (ekspercki) NIE jest wymuszany na katalogowy (poprawka po v1).
    expect(dane.manual_mode).toBe(true);
    expect(dane.sections_count).toBe(4);
    expect(dane.line_fields_per_section).toBe(12);
    // Tablica sekcji zsynchronizowana z liczbą sekcji.
    expect(dane.sekcje).toHaveLength(4);
  });

  it('buduje czytelne oznaczenie GPZ', () => {
    expect(zbudujOznaczenieGpz('GPZ 1')).toBe('GPZ-01');
  });
});
