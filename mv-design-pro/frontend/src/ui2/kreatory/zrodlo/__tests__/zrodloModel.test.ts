/**
 * Testy kontraktu modelu kreatora źródła zasilania — payload operacji domenowej
 * i walidacja są przeniesione 1:1 z retirowanego GridSourceEditor/AddGridSourceForm,
 * więc testy pilnują, że kontrakt `add_grid_source_sn` nie uległ zmianie.
 */

import { describe, expect, it } from 'vitest';

import {
  aparatZdatnyNaSn,
  brakiFormularza,
  DANE_DOMYSLNE,
  konfliktyFormularza,
  pasujeRodzajAparatu,
  scalDanePoczatkowe,
  transformatorPasujeDoSn,
  walidujFormularz,
  wierszeGotowosci,
  zbudujOznaczenieGpz,
  zbudujPayloadZrodla,
  zbudujZadaniePodgladu,
  type GridSourceFormData,
} from '../zrodloModel';

/**
 * Dane kompletne do zapisu. Formularz startuje bez wartości wpływających na wyniki (kontrakt
 * prowadzenia, 2026-10-15), więc komplet niesie je jawnie — tak, jak wnosi je pozycja katalogu
 * systemu zasilającego (15 kV, Sk″ 310 MVA, R/X 0,12), transformator (110 kV) i projektant
 * (Z0/Z1, rezystor uziemiający 12 Ω, tk 1 s).
 */
function daneKompletne(nadpisz: Partial<GridSourceFormData> = {}): GridSourceFormData {
  return {
    ...DANE_DOMYSLNE,
    sn_voltage_kv: 15,
    hv_voltage_kv: 110,
    sk3_mva: 310,
    rx_ratio: 0.12,
    z0_z1_ratio: 3.2,
    grounding_type: 'resistor_grounded',
    grounding_r_ohm: 12,
    thermal_time_s: 1,
    catalog_ref: 'GPZ-001',
    gpz_line_field_apparatus_catalog_ref: 'APP-001',
    // Karta FAB-G: transformator 110/SN GPZ jest teraz WYMAGANY przez backend
    // (zero fabrykacji mocy/napiecia) — "kompletne dane" musza go niesc, tak
    // jak nioso juz katalog zrodla i aparat pola liniowego powyzej.
    transformer_catalog_ref: 'TR-110-15-25',
    transformer_sn_mva: 25,
    transformer_uk_percent: 12.5,
    transformer_vector_group: 'YNd11',
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

  it('uziemienie bezpośrednie: literał kontraktu directly_grounded 1:1, bez R/X (W5-A)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({ grounding_type: 'directly_grounded' }));
    expect(payload.grounding).toEqual({ type: 'directly_grounded' });
  });

  it('cewka Petersena niesie x_ohm (składowa dominująca dławika), rezystor r_ohm', () => {
    const cewka = zbudujPayloadZrodla(daneKompletne({ grounding_type: 'petersen_coil', grounding_x_ohm: 150 }));
    expect(cewka.grounding).toEqual({ type: 'petersen_coil', x_ohm: 150 });
    const rezystor = zbudujPayloadZrodla(daneKompletne({ grounding_type: 'resistor_grounded', grounding_r_ohm: 12 }));
    expect(rezystor.grounding).toEqual({ type: 'resistor_grounded', r_ohm: 12 });
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
  });

  it('bez wybranego transformatora payload nie niesie tabliczki transformatora (kompat.)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      transformer_catalog_ref: null,
      transformer_sn_mva: null,
      transformer_uk_percent: null,
      transformer_vector_group: null,
    }));
    expect(payload.transformer_catalog_ref).toBeUndefined();
    expect(payload.transformer_sn_mva).toBeUndefined();
    expect(payload.transformer_uk_percent).toBeUndefined();
    expect(payload.transformer_vector_group).toBeUndefined();
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

  it('OLTC bez nastaw: braki nazywają uzwojenie, krok, zakres i tryb (bez stałych ±9 × 1,25 % AUTOMATIC)', () => {
    const bledy = brakiFormularza(daneKompletne({ oltc_regulation_type: 'OLTC' })).map((b) => b.field);
    expect(bledy).toEqual(expect.arrayContaining([
      'oltc_regulated_winding',
      'oltc_step_percent',
      'oltc_min_position',
      'oltc_max_position',
      'oltc_neutral_position',
      'oltc_current_position',
      'oltc_control_mode',
    ]));
    // Brak nastaw to BRAK (przy zapisie), nie konflikt (czerwień w trakcie pracy).
    expect(konfliktyFormularza(daneKompletne({ oltc_regulation_type: 'OLTC' }))).toEqual([]);
  });

  it('LDC włączone bez R/X: brak przy zapisie, bez cichego 0 Ω w payloadzie', () => {
    const dane = daneKompletne({
      oltc_regulation_type: 'OLTC',
      oltc_control_mode: 'MANUAL',
      oltc_ldc_enabled: true,
    });
    const pola = brakiFormularza(dane).map((b) => b.field);
    expect(pola).toContain('oltc_ldc_r_ohm');
    expect(pola).toContain('oltc_ldc_x_ohm');
    const payload = zbudujPayloadZrodla(dane);
    expect(payload.transformer_ldc_r_ohm).toBeNull();
    expect(payload.transformer_ldc_x_ohm).toBeNull();
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

describe('zbudujPayloadZrodla — scenariusz MIN (CV-4.3 K7)', () => {
  it('tryb ręczny SN: manual_equivalent niesie sk3_min_mva/ik3_min_ka/rx_ratio_min gdy podane', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
      sk3_min_mva: 150,
      ik3_min_ka: 5.8,
      rx_ratio_min: 0.2,
    }));
    expect(payload.manual_equivalent).toMatchObject({
      sk3_min_mva: 150,
      ik3_min_ka: 5.8,
      rx_ratio_min: 0.2,
    });
  });

  it('tryb ręczny SN: brak danych MIN → manual_equivalent BEZ tych kluczy (zero fabrykacji)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
    }));
    const manual = payload.manual_equivalent as Record<string, unknown>;
    expect('sk3_min_mva' in manual).toBe(false);
    expect('ik3_min_ka' in manual).toBe(false);
    expect('rx_ratio_min' in manual).toBe(false);
  });

  it('tryb ręczny WN/SN (HV_110): manual_equivalent niesie dane MIN po tej samej stronie', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_input_side: 'HV_110',
      hv_voltage_kv: 110,
      sk3_hv_mva: 2500,
      rx_ratio: 0.1,
      sk3_min_mva: 1500,
    }));
    expect(payload.manual_equivalent).toMatchObject({
      short_circuit_input_side: 'HV_110',
      sk3_hv_mva: 2500,
      sk3_min_mva: 1500,
    });
  });

  it('tryb impedancyjny: manual_equivalent NIGDY nie niesie danych MIN (brak wariantu MIN)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_mode: 'IMPEDANCE',
      r_ohm: 0.09,
      x_ohm: 0.9,
      // Dane MIN mimo wszystko obecne w danych formularza (np. pozostałość po
      // przełączeniu trybu) — payload ich NIE przenosi (backend odrzuciłby 422).
      sk3_min_mva: 150,
      rx_ratio_min: 0.2,
    }));
    const manual = payload.manual_equivalent as Record<string, unknown>;
    expect('sk3_min_mva' in manual).toBe(false);
    expect('rx_ratio_min' in manual).toBe(false);
  });
});

describe('zbudujPayloadZrodla — napięcie zadane szyny bilansującej (CV-4.3 K7c)', () => {
  it('tryb ręczny, moc zwarciowa (SN): manual_equivalent niesie u_set_pu gdy podane', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
      u_set_pu: 1.06,
    }));
    expect(payload.manual_equivalent).toMatchObject({ u_set_pu: 1.06 });
  });

  // Iloczyn cech: u_set_pu × tryb impedancyjny — backend czyta u_set_pu
  // BEZWARUNKOWO (przed rozgałęzieniem na short_circuit_mode), więc pole NIE
  // dzieli losu danych MIN (blokowanych w trybie impedancyjnym) — musi
  // przejść payload w OBU postaciach parametru zwarciowego.
  it('tryb ręczny, impedancyjny (R+jX): manual_equivalent NADAL niesie u_set_pu gdy podane', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_mode: 'IMPEDANCE',
      r_ohm: 0.09,
      x_ohm: 0.9,
      u_set_pu: 0.95,
    }));
    expect(payload.manual_equivalent).toMatchObject({ u_set_pu: 0.95 });
  });

  // Iloczyn cech: u_set_pu × strona WN (HV_110) — ta sama bezwarunkowość.
  it('tryb ręczny WN/SN (HV_110): manual_equivalent niesie u_set_pu gdy podane', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_input_side: 'HV_110',
      hv_voltage_kv: 110,
      sk3_hv_mva: 2500,
      rx_ratio: 0.1,
      u_set_pu: 1.02,
    }));
    expect(payload.manual_equivalent).toMatchObject({
      short_circuit_input_side: 'HV_110',
      u_set_pu: 1.02,
    });
  });

  it('brak u_set_pu → manual_equivalent BEZ tego klucza (zero fabrykacji, null = znamionowe)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
    }));
    const manual = payload.manual_equivalent as Record<string, unknown>;
    expect('u_set_pu' in manual).toBe(false);
  });

  it('tryb katalogowy: payload nie niesie w ogóle manual_equivalent, więc u_set_pu nie wycieka', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({ u_set_pu: 1.06 }));
    expect('manual_equivalent' in payload).toBe(false);
  });
});

describe('zbudujZadaniePodgladu — scenariusz MIN (CV-4.3 K7)', () => {
  it('tryb mocy zwarciowej: żądanie niesie sk3_min_mva/ik3_min_ka/rx_ratio_min', () => {
    const req = zbudujZadaniePodgladu(daneKompletne({
      sk3_mva: 250,
      rx_ratio: 0.1,
      sk3_min_mva: 150,
      ik3_min_ka: 5.8,
      rx_ratio_min: 0.2,
    }));
    expect(req).toMatchObject({ sk3_min_mva: 150, ik3_min_ka: 5.8, rx_ratio_min: 0.2 });
  });

  it('tryb impedancyjny: żądanie NIGDY nie niesie danych MIN (brak wariantu MIN)', () => {
    const req = zbudujZadaniePodgladu(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_mode: 'IMPEDANCE',
      r_ohm: 0.09,
      x_ohm: 0.9,
      sk3_min_mva: 150,
    }));
    expect(req).toMatchObject({ sk3_min_mva: null, ik3_min_ka: null, rx_ratio_min: null });
  });

  it('rx_ratio_min bez sk3_min_mva/ik3_min_ka → null (backend odrzuciłby 422, podgląd nie pyta)', () => {
    expect(zbudujZadaniePodgladu(daneKompletne({ rx_ratio_min: 0.2 }))).toBeNull();
  });
});

describe('walidujFormularz — scenariusz MIN (CV-4.3 K7)', () => {
  it('bez danych MIN nie zgłasza błędów (pola opcjonalne)', () => {
    expect(
      walidujFormularz(daneKompletne({
        manual_mode: true,
        catalog_ref: null,
        sk3_mva: 250,
        rx_ratio: 0.1,
      })).some((b) => ['sk3_min_mva', 'ik3_min_ka', 'rx_ratio_min'].includes(b.field)),
    ).toBe(false);
  });

  it('Sk″min ujemna/zerowa jest blokowana', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
      sk3_min_mva: 0,
    }));
    expect(bledy.some((b) => b.field === 'sk3_min_mva')).toBe(true);
  });

  it('Sk″min większe od Sk″ (maks.) jest blokowane', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
      sk3_min_mva: 300,
    }));
    expect(bledy.some((b) => b.field === 'sk3_min_mva')).toBe(true);
  });

  it('Sk″min ≤ Sk″ (maks.) jest dozwolone', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
      sk3_min_mva: 150,
    }));
    expect(bledy.some((b) => b.field === 'sk3_min_mva')).toBe(false);
  });

  it('Sk″min (WN/SN, HV_110) porównywane z Sk″ (110 kV), nie z Sk″ (SN)', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_input_side: 'HV_110',
      hv_voltage_kv: 110,
      sk3_hv_mva: 2500,
      rx_ratio: 0.1,
      sk3_min_mva: 1500,
    }));
    expect(bledy.some((b) => b.field === 'sk3_min_mva')).toBe(false);
  });

  it('R/X (MIN) bez Sk″min/Ik″min jest blokowane', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
      rx_ratio_min: 0.2,
    }));
    expect(bledy.some((b) => b.field === 'rx_ratio_min')).toBe(true);
  });

  it('R/X (MIN) z Ik″min (bez Sk″min) jest dozwolone', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      sk3_mva: 250,
      rx_ratio: 0.1,
      ik3_min_ka: 5.8,
      rx_ratio_min: 0.2,
    }));
    expect(bledy.some((b) => b.field === 'rx_ratio_min')).toBe(false);
  });

  it('tryb impedancyjny z jakimikolwiek danymi MIN jest blokowany (brak wariantu MIN)', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_mode: 'IMPEDANCE',
      r_ohm: 0.09,
      x_ohm: 0.9,
      sk3_min_mva: 150,
    }));
    expect(bledy.some((b) => b.field === 'sk3_min_mva')).toBe(true);
  });
});

describe('walidujFormularz — napięcie zadane szyny bilansującej (CV-4.3 K7c)', () => {
  it('brak u_set_pu (null) nie zgłasza błędu — pole opcjonalne (zero fabrykacji)', () => {
    expect(walidujFormularz(daneKompletne({ u_set_pu: null })).some((b) => b.field === 'u_set_pu')).toBe(false);
  });

  it('wartość w paśmie 0,8–1,2 p.u. jest dozwolona', () => {
    expect(walidujFormularz(daneKompletne({ u_set_pu: 1.06 })).some((b) => b.field === 'u_set_pu')).toBe(false);
    expect(walidujFormularz(daneKompletne({ u_set_pu: 0.8 })).some((b) => b.field === 'u_set_pu')).toBe(false);
    expect(walidujFormularz(daneKompletne({ u_set_pu: 1.2 })).some((b) => b.field === 'u_set_pu')).toBe(false);
  });

  it('wartość poniżej pasma (< 0,8 p.u.) jest odrzucana', () => {
    const bledy = walidujFormularz(daneKompletne({ u_set_pu: 0.79 }));
    expect(bledy.some((b) => b.field === 'u_set_pu')).toBe(true);
  });

  it('wartość powyżej pasma (> 1,2 p.u.) jest odrzucana', () => {
    const bledy = walidujFormularz(daneKompletne({ u_set_pu: 1.21 }));
    expect(bledy.some((b) => b.field === 'u_set_pu')).toBe(true);
  });

  // Iloczyn cech: walidacja u_set_pu × tryb impedancyjny — w przeciwieństwie do
  // scenariusza MIN (blokowanego w trybie impedancyjnym), u_set_pu NIE ma
  // wyjątku trybu — walidacja pasma obowiązuje identycznie w OBU postaciach.
  it('pasmo obowiązuje TAKŻE w trybie impedancyjnym (u_set_pu nie ma wyjątku trybu jak MIN)', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
      short_circuit_mode: 'IMPEDANCE',
      r_ohm: 0.09,
      x_ohm: 0.9,
      u_set_pu: 1.5,
    }));
    expect(bledy.some((b) => b.field === 'u_set_pu')).toBe(true);
  });
});

describe('walidujFormularz', () => {
  it('bez błędów dla kompletnych danych katalogowych', () => {
    expect(walidujFormularz(daneKompletne())).toEqual([]);
  });

  it('formularz startuje bez zgadniętych wartości wpływających na wyniki', () => {
    expect(DANE_DOMYSLNE).toMatchObject({
      sn_voltage_kv: null,
      hv_voltage_kv: null,
      sk3_mva: null,
      rx_ratio: null,
      z0_z1_ratio: null,
      grounding_type: null,
      grounding_r_ohm: null,
      thermal_time_s: null,
      oltc_regulated_winding: null,
      oltc_step_percent: null,
      oltc_min_position: null,
      oltc_max_position: null,
      oltc_control_mode: null,
      oltc_voltage_setpoint_kv: null,
      oltc_deadband_kv: null,
      oltc_delay_seconds: null,
    });
  });

  it('braki niosą „co — po co”, bez ogólnego „Uzupełnij”; konflikty puste dla pustego formularza', () => {
    const braki = brakiFormularza({ ...DANE_DOMYSLNE, source_name: '' });
    expect(braki.map((b) => b.field)).toEqual([
      'source_name',
      'sn_voltage_kv',
      'catalog_ref',
      'transformer_catalog_ref',
      'grounding_type',
      'gpz_line_field_apparatus_catalog_ref',
    ]);
    for (const b of braki) {
      expect(b.message).toMatch(/ — /);
      expect(b.message).not.toMatch(/Uzupełnij/);
    }
    expect(konfliktyFormularza(DANE_DOMYSLNE)).toEqual([]);
  });

  it('pozycja katalogu bez Sk″/R/X: brak wskazuje katalog (nie ukryte pole trybu ręcznego)', () => {
    const braki = brakiFormularza(daneKompletne({ rx_ratio: null }));
    expect(braki).toEqual([
      { field: 'catalog_ref', message: expect.stringMatching(/nie ma Sk″ albo R\/X/) },
    ]);
  });

  // Iloczyn cech: pozycja katalogowa (transformator / aparat) × napięcie SN zgodne / niezgodne /
  // nieznane — ten sam predykat filtruje listę i zgłasza konflikt przy polu.
  it.each([
    [15, 15, true],
    [20, 15, false],
    [15, null, true],
  ] as const)('transformator LV %s kV × SN %s kV → pasuje: %s', (lv, sn, pasuje) => {
    expect(transformatorPasujeDoSn(lv, sn)).toBe(pasuje);
    const konflikty = konfliktyFormularza(daneKompletne({ sn_voltage_kv: sn }), {
      transformatorLvKv: lv,
      aparatUnKv: null,
    }).map((k) => k.field);
    expect(konflikty.includes('transformer_catalog_ref')).toBe(!pasuje);
  });

  it.each([
    [17.5, 15, true],
    [12, 15, false],
    [12, null, true],
  ] as const)('aparat U_n %s kV × SN %s kV → zdatny: %s', (un, sn, zdatny) => {
    expect(aparatZdatnyNaSn({ u_n_kv: un }, sn)).toBe(zdatny);
    const konflikty = konfliktyFormularza(daneKompletne({ sn_voltage_kv: sn }), {
      transformatorLvKv: null,
      aparatUnKv: un,
    }).map((k) => k.field);
    expect(konflikty.includes('gpz_line_field_apparatus_catalog_ref')).toBe(!zdatny);
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

  it('wymaga transformatora 110/SN z katalogu (karta FAB-G)', () => {
    const bledy = walidujFormularz(daneKompletne({ transformer_catalog_ref: null }));
    expect(bledy.some((b) => b.field === 'transformer_catalog_ref')).toBe(true);
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

  it('zwraca null bez czasu tk (interfejs nie podstawia 1 s)', () => {
    expect(zbudujZadaniePodgladu(daneKompletne({ thermal_time_s: null }))).toBeNull();
  });
});

// Intencja dawnych testów („brak” / „ostrzeżenie”): panel kontroli mówi, co jeszcze przed
// projektantem — w nowym kanonie neutralnie („do wyboru”), czerwień wyłącznie dla konfliktu.
describe('wierszeGotowosci', () => {
  it('brak identyfikacji → do wyboru (neutralnie, nie czerwień)', () => {
    const wiersze = wierszeGotowosci(daneKompletne({ source_name: '' }));
    expect(wiersze.find((w) => w.etykieta === 'Identyfikacja')?.stan).toBe('do_wyboru');
  });

  it('pusty formularz: żaden wiersz nie jest konfliktem', () => {
    const wiersze = wierszeGotowosci(DANE_DOMYSLNE, konfliktyFormularza(DANE_DOMYSLNE));
    expect(wiersze.some((w) => w.stan === 'konflikt')).toBe(false);
  });

  it('składowa zerowa wyłączona → ustalone („Wyłączona” to decyzja projektanta)', () => {
    const wiersze = wierszeGotowosci(daneKompletne({ zero_sequence_enabled: false }));
    expect(wiersze.find((w) => w.etykieta === 'Składowa zerowa')).toMatchObject({ stan: 'ustalone', wartosc: 'Wyłączona' });
  });

  it('konflikt napięcia → wiersz „Napięcie SN” w stanie konflikt', () => {
    const dane = daneKompletne({ sn_voltage_kv: -1 });
    const wiersze = wierszeGotowosci(dane, konfliktyFormularza(dane));
    expect(wiersze.find((w) => w.etykieta === 'Napięcie SN')?.stan).toBe('konflikt');
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


/**
 * Rodzaj aparatu pola liniowego GPZ × rodzaj pozycji katalogu (iloczyn cech, przejście
 * scenariusza 630 kVA, pkt 5): pole wyłącznikowe GPZ to wyłącznik celkowy — reklozer
 * (łącznik słupowy z SPZ) i uziemnik nie są aparatem toru pola GPZ.
 */
describe('pasujeRodzajAparatu — rodzaj pola GPZ × rodzaj pozycji katalogu', () => {
  const pozycja = (device_kind: string) =>
    ({ id: `a-${device_kind}`, name: device_kind, device_kind, u_n_kv: 17.5, i_n_a: 630 }) as Parameters<
      typeof pasujeRodzajAparatu
    >[0];
  const oczekiwane: Record<string, readonly string[]> = {
    BREAKER: ['WYLACZNIK'],
    DISCONNECTOR: ['ODLACZNIK'],
    LOAD_SWITCH: ['ROZLACZNIK', 'ROZLACZNIK_BEZPIECZNIKOWY'],
  };
  const rodzajeKatalogu = [
    'WYLACZNIK',
    'REKLOZER',
    'ODLACZNIK',
    'UZIEMNIK',
    'ROZLACZNIK',
    'ROZLACZNIK_BEZPIECZNIKOWY',
  ];
  for (const [rodzajPola, dopuszczone] of Object.entries(oczekiwane)) {
    for (const rodzaj of rodzajeKatalogu) {
      it(`${rodzajPola} × ${rodzaj} → ${dopuszczone.includes(rodzaj) ? 'tak' : 'nie'}`, () => {
        expect(
          pasujeRodzajAparatu(pozycja(rodzaj), rodzajPola as 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH'),
        ).toBe(dopuszczone.includes(rodzaj));
      });
    }
  }
});
