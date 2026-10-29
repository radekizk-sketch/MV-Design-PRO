/**
 * Testy kontraktu modelu kreatora źródła zasilania — payload operacji domenowej
 * i walidacja są przeniesione 1:1 z retirowanego GridSourceEditor/AddGridSourceForm,
 * więc testy pilnują, że kontrakt `add_grid_source_sn` nie uległ zmianie.
 */

import { describe, expect, it } from 'vitest';

import { kluczeSpozaKontraktu } from '../../../../test/kontraktLadunkuOperacji';

import {
  DANE_DOMYSLNE,
  buildZespolySekcji,
  punktNeutralnySnTransformatora,
  scalDanePoczatkowe,
  sekcjaMaTransformator,
  transformatoryWModelu,
  trybParametruZwarciowego,
  walidujFormularz,
  wierszTransformatorow,
  wierszUziemieniaSn,
  wierszeGotowosci,
  zrodloOpisujeSiec110kV,
  zbudujOznaczenieGpz,
  zbudujPayloadZrodla,
  zbudujZadaniePodgladu,
  type GridSourceFormData,
} from '../zrodloModel';
import wyroczniaPunktuNeutralnego from '../../../../harness-fixtures/generated/punkt_neutralny_sn_grup_polaczen.json';

function daneKompletne(nadpisz: Partial<GridSourceFormData> = {}): GridSourceFormData {
  return {
    ...DANE_DOMYSLNE,
    catalog_ref: 'GPZ-001',
    gpz_line_field_apparatus_catalog_ref: 'APP-001',
    ...nadpisz,
  };
}

/** Równoważnik sieci po stronie 110 kV (tryb ekspercki) — jedyny tryb, w którym
 *  transformatory 110/SN są elementami modelu (karta GPZ-MODEL). */
function dane110kV(nadpisz: Partial<GridSourceFormData> = {}): GridSourceFormData {
  return daneKompletne({
    manual_mode: true,
    catalog_ref: null,
    short_circuit_input_side: 'HV_110',
    hv_voltage_kv: 110,
    sk3_hv_mva: 3000,
    rx_ratio: 0.1,
    transformer_count: 2,
    transformer_catalog_ref: 'TR-110-15-25',
    transformer_sn_mva: 25,
    transformer_uk_percent: 12.5,
    transformer_vector_group: 'YNd11',
    ...nadpisz,
  });
}

/** Klucze ładunku, które backend traktuje jako żądanie transformatorów 110/SN
 *  (`_klucze_transformatorow_gpz`: prefiks `transformer_` i `hv_voltage_kv`). */
function kluczeTransformatorow(payload: Record<string, unknown>): string[] {
  return Object.keys(payload)
    .filter((klucz) => payload[klucz] !== undefined && payload[klucz] !== null)
    .filter((klucz) => klucz.startsWith('transformer_') || klucz === 'hv_voltage_kv')
    .sort();
}

/** Granice SN (katalog, ręczny SN moc, ręczny SN impedancja) — iloczyn cech z danymi
 *  transformatora i regulacji pozostawionymi w formularzu po przełączeniu trybu. */
const GRANICE_SN: ReadonlyArray<[string, Partial<GridSourceFormData>]> = [
  ['katalog', {}],
  ['ręczny SN — moc zwarciowa', { manual_mode: true, catalog_ref: null, short_circuit_input_side: 'SN', sk3_mva: 250 }],
  [
    'ręczny SN — impedancja',
    { manual_mode: true, catalog_ref: null, short_circuit_input_side: 'SN', short_circuit_mode: 'IMPEDANCE', r_ohm: 0.1, x_ohm: 0.9 },
  ],
];
const POZOSTALOSCI_TRANSFORMATORA: Partial<GridSourceFormData> = {
  transformer_count: 3,
  transformer_catalog_ref: 'TR-110-15-25',
  transformer_sn_mva: 25,
  oltc_regulation_type: 'OLTC',
  oltc_step_percent: 0,
  oltc_voltage_setpoint_kv: null,
};

describe('granica zasilania SN — transformatory 110/SN tylko przy równoważniku 110 kV', () => {
  it.each(GRANICE_SN)('%s: ładunek bez żadnego klucza transformatora ani napięcia WN', (_opis, tryb) => {
    const dane = daneKompletne({ ...POZOSTALOSCI_TRANSFORMATORA, ...tryb });
    expect(transformatoryWModelu(dane)).toBe(false);
    const payload = zbudujPayloadZrodla(dane);
    expect(kluczeTransformatorow(payload)).toEqual([]);
    const rownowaznik = payload.manual_equivalent as Record<string, unknown> | undefined;
    expect(rownowaznik?.hv_voltage_kv).toBeUndefined();
  });

  it.each(GRANICE_SN)('%s: walidacja nie wymaga transformatora ani nastaw zaczepów', (_opis, tryb) => {
    const bledy = walidujFormularz(daneKompletne({ ...POZOSTALOSCI_TRANSFORMATORA, ...tryb, transformer_catalog_ref: null }));
    expect(bledy.filter((b) => b.field.startsWith('transformer_') || b.field.startsWith('oltc_'))).toEqual([]);
  });

  it.each(GRANICE_SN)('%s: wiersz gotowości mówi, że transformatory są w równoważniku', (_opis, tryb) => {
    expect(wierszTransformatorow(daneKompletne(tryb))).toEqual({
      etykieta: 'Transformatory 110/SN',
      stan: 'kompletne',
      wartosc: 'W równoważniku SN (poza modelem)',
    });
  });

  it('110 kV: ładunek niesie liczbę, pozycję katalogową i napięcie WN (bez tabliczki — tę czyta backend)', () => {
    const payload = zbudujPayloadZrodla(dane110kV());
    expect(transformatoryWModelu(dane110kV())).toBe(true);
    expect(kluczeTransformatorow(payload)).toEqual(['hv_voltage_kv', 'transformer_catalog_ref', 'transformer_count']);
    expect(payload).toMatchObject({ hv_voltage_kv: 110, transformer_count: 2, transformer_catalog_ref: 'TR-110-15-25' });
    expect(payload.manual_equivalent).toMatchObject({ short_circuit_input_side: 'HV_110', hv_voltage_kv: 110, sk3_hv_mva: 3000 });
  });

  it('110 kV: wiersz gotowości liczy transformatory w modelu albo żąda typu', () => {
    expect(wierszTransformatorow(dane110kV({ transformer_count: 3 }))).toMatchObject({ stan: 'kompletne', wartosc: '3 × w modelu' });
    expect(wierszTransformatorow(dane110kV({ transformer_catalog_ref: null }))).toMatchObject({ stan: 'brak' });
  });

  it('110 kV × impedancja pozostawiona w danych: wysyłana jest moc Sk″ widoczna na ekranie', () => {
    const dane = dane110kV({ short_circuit_mode: 'IMPEDANCE', r_ohm: 1, x_ohm: 5 });
    expect(trybParametruZwarciowego(dane)).toBe('SHORT_CIRCUIT_POWER');
    const payload = zbudujPayloadZrodla(dane);
    expect(payload.short_circuit_mode).toBe('SHORT_CIRCUIT_POWER');
    expect(payload.r_ohm).toBeUndefined();
    expect(payload.sk3_hv_mva).toBe(3000);
    expect(payload.manual_equivalent).toMatchObject({ short_circuit_mode: 'SHORT_CIRCUIT_POWER', sk3_hv_mva: 3000 });
    expect(zbudujZadaniePodgladu(dane)).toMatchObject({ voltage_kv: 110, sk3_mva: 3000, short_circuit_mode: 'SHORT_CIRCUIT_POWER' });
  });

  it('katalog × impedancja pozostawiona w danych: tryb katalogowy wysyła moc zwarciową', () => {
    const dane = daneKompletne({ short_circuit_mode: 'IMPEDANCE' });
    expect(trybParametruZwarciowego(dane)).toBe('SHORT_CIRCUIT_POWER');
    expect(zbudujPayloadZrodla(dane).short_circuit_mode).toBe('SHORT_CIRCUIT_POWER');
  });
});

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

  it('sieć 110 kV, uziemienie bezpośrednie: literał kontraktu directly_grounded 1:1, bez R/X (W5-A)', () => {
    const payload = zbudujPayloadZrodla(dane110kV({ grounding_type: 'directly_grounded' }));
    expect(payload.grounding).toEqual({ type: 'directly_grounded' });
  });

  it('sieć 110 kV: cewka Petersena niesie x_ohm (składowa dominująca dławika), rezystor r_ohm', () => {
    const cewka = zbudujPayloadZrodla(dane110kV({ grounding_type: 'petersen_coil', grounding_x_ohm: 150 }));
    expect(cewka.grounding).toEqual({ type: 'petersen_coil', x_ohm: 150 });
    const rezystor = zbudujPayloadZrodla(dane110kV({ grounding_type: 'resistor_grounded', grounding_r_ohm: 12 }));
    expect(rezystor.grounding).toEqual({ type: 'resistor_grounded', r_ohm: 12 });
  });

  it('niesie parametry zwarciowe SN (sk3_mva + rx_ratio); sieć 110 kV — także Z0', () => {
    const payload = zbudujPayloadZrodla(daneKompletne({ sk3_mva: 310, rx_ratio: 0.12 }));
    expect(payload.sk3_mva).toBe(310);
    expect(payload.rx_ratio).toBe(0.12);
    expect(payload.short_circuit_input_side).toBe('SN');
    expect(payload.short_circuit_mode).toBe('SHORT_CIRCUIT_POWER');
    expect(zbudujPayloadZrodla(dane110kV()).zero_sequence).toMatchObject({ enabled: true, z0_z1_ratio: 3.2 });
  });

  /* Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 3 — opis punktu neutralnego i Z0 źródła tylko
     dla sieci 110 kV. Iloczyn cech: granica {katalog SN, ręczny SN moc, ręczny SN impedancja,
     110 kV} × typ punktu neutralnego (każdy) × Z0 {włączone, wyłączone}. Żadna kombinacja
     po stronie SN nie niesie `grounding`, `zero_sequence` ani r0/x0 w `manual_equivalent`
     (backend odmawia `source.sn_neutral_not_on_source`). */
  const GRANICE_SN: Array<[string, Partial<GridSourceFormData>]> = [
    ['katalog SN', {}],
    ['ręczny SN moc', { manual_mode: true, catalog_ref: null }],
    ['ręczny SN impedancja', { manual_mode: true, catalog_ref: null, short_circuit_mode: 'IMPEDANCE', r_ohm: 0.1, x_ohm: 0.8 }],
  ];
  const TYPY = ['directly_grounded', 'resistor_grounded', 'petersen_coil', 'isolated'] as const;
  for (const [granica, nadpisz] of GRANICE_SN) {
    for (const typ of TYPY) {
      for (const zero of [true, false]) {
        it(`${granica} × ${typ} × Z0 ${zero ? 'wł.' : 'wył.'}: bez opisu punktu neutralnego i Z0`, () => {
          const dane = daneKompletne({
            ...nadpisz,
            grounding_type: typ,
            grounding_r_ohm: 12,
            grounding_x_ohm: 150,
            zero_sequence_enabled: zero,
            r0_ohm: 0.4,
            x0_ohm: 1.8,
          });
          expect(zrodloOpisujeSiec110kV(dane)).toBe(false);
          const payload = zbudujPayloadZrodla(dane);
          expect(payload).not.toHaveProperty('grounding');
          expect(payload).not.toHaveProperty('zero_sequence');
          const rownowaznik = (payload.manual_equivalent ?? {}) as Record<string, unknown>;
          for (const klucz of ['r0_ohm', 'x0_ohm', 'z0_z1_ratio']) expect(rownowaznik).not.toHaveProperty(klucz);
          expect(walidujFormularz({ ...dane, grounding_r_ohm: null, grounding_x_ohm: null })
            .filter((b) => b.field.startsWith('grounding'))).toEqual([]);
          const podglad = zbudujZadaniePodgladu(dane);
          if (podglad) expect(podglad.zero_sequence_enabled).toBe(false);
          expect(wierszeGotowosci(dane).map((w) => w.etykieta)).not.toContain('Składowa zerowa sieci 110 kV');
        });
      }
    }
  }

  it('sieć 110 kV: brak R uziemienia rezystorowego jest błędem pola, poza 110 kV nie', () => {
    const bledy = walidujFormularz(dane110kV({ grounding_type: 'resistor_grounded', grounding_r_ohm: null }));
    expect(bledy.some((b) => b.field === 'grounding_r_ohm')).toBe(true);
  });

  it('ogranicza liczbę transformatorów do zakresu 1-4 (równoważnik 110 kV)', () => {
    const payload = zbudujPayloadZrodla(dane110kV({ transformer_count: 9 }));
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

  it('wybrany transformator 110/SN trafia do payloadu jako pozycja katalogowa — tabliczka (Sn/uk/grupa) nie', () => {
    // Tabliczkę materializuje backend z katalogu (karta FAB-G); dawne klucze
    // transformer_uk_percent / transformer_vector_group backend ignorował (fantomy).
    const payload = zbudujPayloadZrodla(dane110kV());
    expect(payload.transformer_catalog_ref).toBe('TR-110-15-25');
    expect(payload.transformer_sn_mva).toBeUndefined();
    expect(payload.transformer_uk_percent).toBeUndefined();
    expect(payload.transformer_vector_group).toBeUndefined();
    expect(kluczeSpozaKontraktu('add_grid_source_sn', payload)).toEqual([]);
  });

  it('bez regulacji payload nie niesie kluczy OLTC (kompat./determinizm)', () => {
    const payload = zbudujPayloadZrodla(daneKompletne());
    expect(payload.transformer_regulation_type).toBeUndefined();
    expect(payload.transformer_voltage_setpoint_kv).toBeUndefined();
    expect(payload.transformer_ldc_enabled).toBeUndefined();
  });

  it('OLTC automatyczny mapuje pełny kontrakt TapChanger na klucze transformer_*', () => {
    const payload = zbudujPayloadZrodla(dane110kV({
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
    const payload = zbudujPayloadZrodla(dane110kV({
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
    const bledy = walidujFormularz(dane110kV({
      oltc_regulation_type: 'OLTC',
      oltc_control_mode: 'AUTOMATIC',
      oltc_voltage_setpoint_kv: null,
    }));
    expect(bledy.some((b) => b.field === 'oltc_voltage_setpoint_kv')).toBe(true);
  });

  it('krok zaczepu = 0 jest blokowany', () => {
    const bledy = walidujFormularz(dane110kV({
      oltc_regulation_type: 'OLTC',
      oltc_step_percent: 0,
    }));
    expect(bledy.some((b) => b.field === 'oltc_step_percent')).toBe(true);
  });

  it('zły zakres (min >= max) jest blokowany', () => {
    const bledy = walidujFormularz(dane110kV({
      oltc_regulation_type: 'DETC',
      oltc_min_position: 5,
      oltc_max_position: 3,
    }));
    expect(bledy.some((b) => b.field === 'oltc_max_position')).toBe(true);
  });

  it('pozycja bieżąca poza zakresem jest blokowana', () => {
    const bledy = walidujFormularz(dane110kV({
      oltc_regulation_type: 'OLTC',
      oltc_min_position: -9,
      oltc_max_position: 9,
      oltc_current_position: 15,
    }));
    expect(bledy.some((b) => b.field === 'oltc_current_position')).toBe(true);
  });

  it('bez regulacji (NONE) nie zgłasza błędów OLTC', () => {
    expect(walidujFormularz(dane110kV()).some((b) => b.field.startsWith('oltc_'))).toBe(false);
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

  it('wymaga transformatora 110/SN z katalogu przy równoważniku 110 kV (karta FAB-G)', () => {
    expect(walidujFormularz(dane110kV())).toEqual([]);
    const bledy = walidujFormularz(dane110kV({ transformer_catalog_ref: null }));
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

  it('uziemienie rezystorowe sieci 110 kV wymaga dodatniej rezystancji', () => {
    const bledy = walidujFormularz(dane110kV({ grounding_type: 'resistor_grounded', grounding_r_ohm: null }));
    expect(bledy.some((b) => b.field === 'grounding_r_ohm')).toBe(true);
  });
});

describe('zbudujZadaniePodgladu', () => {
  it('buduje żądanie podglądu dla poprawnych danych SN', () => {
    const req = zbudujZadaniePodgladu(daneKompletne({ sk3_mva: 250, rx_ratio: 0.1, thermal_time_s: 1 }));
    expect(req).toMatchObject({ voltage_kv: 15, sk3_mva: 250, rx_ratio: 0.1, tk_s: 1 });
    // Karta SC-IB-ITH-ZRODLA: podgląd źródła nie liczy I_b — dawne `tb_s: 0.1` było polem-fantomem.
    expect(req).not.toHaveProperty('tb_s');
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

  it('sieć 110 kV: składowa zerowa wyłączona → ostrzeżenie', () => {
    const wiersze = wierszeGotowosci(dane110kV({ zero_sequence_enabled: false }));
    expect(wiersze.find((w) => w.etykieta === 'Składowa zerowa sieci 110 kV')?.stan).toBe('ostrzezenie');
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


/* Karta GPZ-MODEL — punkt neutralny SN przy równoważniku 110 kV wynika z grupy połączeń
   transformatorów 110/SN modelu. Lustro kreatora porównane z WYROCZNIĄ backendu (ten sam
   model połączeń składowej zerowej, który czyta zwarcie 1F i walidator E-W5-01) dla
   KAŻDEJ grupy słownika IEC 60076-1 — nie z ręczną listą przykładów. Iloczyn cech:
   {grupa: cały słownik} × {granica zasilania: SN, 110 kV} × {opis: zgodny, sprzeczny}. */
describe('punkt neutralny SN z grupy transformatora 110/SN (karta GPZ-MODEL)', () => {
  const grupy = Object.entries((wyroczniaPunktuNeutralnego as { grupy: Record<string, string> }).grupy);

  it('wyrocznia obejmuje cały słownik grup i oba wyniki', () => {
    expect(grupy.length).toBeGreaterThan(30);
    expect(new Set(grupy.map(([, punkt]) => punkt))).toEqual(new Set(['isolated', 'directly_grounded']));
  });

  it.each(grupy)('grupa %s ⇒ punkt neutralny SN %s (parytet z modelem zerowym backendu)', (grupa, punkt) => {
    expect(punktNeutralnySnTransformatora(grupa)).toBe(punkt);
  });

  it('brak grupy ⇒ brak rozstrzygnięcia', () => {
    expect(punktNeutralnySnTransformatora(null)).toBeNull();
  });

  it('opis punktu neutralnego sieci 110 kV jest niezależny od grupy transformatora (bez wymuszenia)', () => {
    for (const grupa of ['YNd11', 'Dyn11', null]) {
      for (const typ of ['directly_grounded', 'isolated'] as const) {
        expect(walidujFormularz(dane110kV({ transformer_vector_group: grupa, grounding_type: typ }))
          .filter((b) => b.field === 'grounding_type')).toEqual([]);
      }
    }
  });
});

/* Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA — zespoły uziemiające sekcji GPZ (`zespoly_uziemiajace`).
   Iloczyn cech: granica {SN, 110 kV} × sekcje z zespołem {brak, 1, obie} × liczba
   transformatorów {1, 2} × wariant {Z.13 dławik, Z.14, Z.15, bezpośrednie} × deklaracja
   wyłączenia od TR {wł., wył.}. Wpis = ładunek `add_zespol_uziemiajacy_sn` (wspólny model)
   bez miejsca, nazwy i listy transformatorów; deklaracja tylko dla sekcji z transformatorem. */
describe('zespoły uziemiające sekcji GPZ', () => {
  const ZESPOL = {
    ...DANE_DOMYSLNE.zespol,
    catalog_ref: 'TU_ZNYN11_15KV_PW160',
    dlawik_catalog_ref: 'DL_40_400A_15KV_CIAGLY',
    rezystor_catalog_ref: 'REZ_200A_15KV',
  };
  const sekcje = (zaznaczone: number[]) =>
    [1, 2].map((n) => ({ nazwa: `Sekcja ${n}`, liczbaPol: 2, zespolUziemiajacy: zaznaczone.includes(n) }));

  for (const [granica, baza] of [['SN', daneKompletne], ['110 kV', dane110kV]] as const) {
    for (const zaznaczone of [[], [1], [1, 2]]) {
      for (const liczbaTr of [1, 2]) {
        for (const wariant of ['dlawik', 'dlawik_rezystor', 'rezystor', 'bezposrednie'] as const) {
          for (const wylaczenie of [true, false]) {
            it(`${granica} × sekcje ${JSON.stringify(zaznaczone)} × TR ${liczbaTr} × ${wariant} × wyłączenie ${wylaczenie}`, () => {
              const dane = baza({
                sections_count: 2,
                sekcje: sekcje(zaznaczone),
                transformer_count: liczbaTr,
                zespol: { ...ZESPOL, wariant },
                zespol_wylaczenie_od_tr: wylaczenie,
              });
              const payload = zbudujPayloadZrodla(dane);
              expect(kluczeSpozaKontraktu('add_grid_source_sn', payload)).toEqual([]);
              if (zaznaczone.length === 0) {
                expect(payload).not.toHaveProperty('zespoly_uziemiajace');
                expect(wierszUziemieniaSn(dane).stan).toBe('ostrzezenie');
                return;
              }
              const wpisy = payload.zespoly_uziemiajace as Array<Record<string, unknown>>;
              expect(wpisy).toEqual(buildZespolySekcji(dane));
              expect(wpisy.map((w) => w.sekcja)).toEqual(zaznaczone);
              for (const wpis of wpisy) {
                for (const klucz of ['bus_ref', 'bay_ref', 'name', 'wylaczenie_od_transformatorow_refs']) {
                  expect(wpis).not.toHaveProperty(klucz);
                }
                const n = wpis.sekcja as number;
                const deklaracja = wylaczenie && granica === '110 kV' && n <= liczbaTr;
                expect(sekcjaMaTransformator(dane, n)).toBe(granica === '110 kV' && n <= liczbaTr);
                expect(wpis.wylaczenie_od_transformatora_sekcji === true).toBe(deklaracja);
                expect('dlawik' in wpis).toBe(wariant === 'dlawik' || wariant === 'dlawik_rezystor');
                expect('rezystor' in wpis).toBe(wariant === 'rezystor' || wariant === 'dlawik_rezystor');
                expect(wpis.uziemienie_bezposrednie).toBe(wariant === 'bezposrednie');
              }
              expect(walidujFormularz(dane).filter((b) => b.field.startsWith('zespol.'))).toEqual([]);
              expect(wierszUziemieniaSn(dane).stan).toBe('kompletne');
            });
          }
        }
      }
    }
  }

  it('zespół zaznaczony bez pozycji katalogu: błędy pól `zespol.*` i wiersz gotowości „brak”', () => {
    const dane = daneKompletne({ sections_count: 2, sekcje: sekcje([2]), zespol: { ...DANE_DOMYSLNE.zespol, wariant: 'rezystor' } });
    expect(walidujFormularz(dane).filter((b) => b.field.startsWith('zespol.')).map((b) => b.field))
      .toEqual(['zespol.catalog_ref', 'zespol.rezystor.catalog_ref']);
    expect(wierszUziemieniaSn(dane).stan).toBe('brak');
  });

  it('normalizacja sekcji zachowuje zaznaczenie zespołu, nowa sekcja go nie ma', () => {
    const dane = scalDanePoczatkowe({ sections_count: 3, sekcje: sekcje([2]) });
    expect(dane.sekcje.map((s) => s.zespolUziemiajacy)).toEqual([false, true, false]);
  });
});
