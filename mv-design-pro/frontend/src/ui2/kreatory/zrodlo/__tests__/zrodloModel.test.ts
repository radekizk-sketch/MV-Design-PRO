/**
 * Testy kontraktu modelu kreatora źródła zasilania — payload operacji domenowej
 * i walidacja są przeniesione 1:1 z retirowanego GridSourceEditor/AddGridSourceForm,
 * więc testy pilnują, że kontrakt `add_grid_source_sn` nie uległ zmianie.
 */

import { describe, expect, it } from 'vitest';

import {
  DANE_DOMYSLNE,
  WIERSZ_TRANSFORMATOROW,
  scalDanePoczatkowe,
  trybParametruZwarciowego,
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

/** Klucze ładunku, które backend traktuje jako żądanie transformatorów 110/SN
 *  (`_klucze_transformatorow_gpz`: prefiks `transformer_` i `hv_voltage_kv`). */
function kluczeTransformatorow(payload: Record<string, unknown>): string[] {
  return Object.keys(payload)
    .filter((klucz) => payload[klucz] !== undefined && payload[klucz] !== null)
    .filter((klucz) => klucz.startsWith('transformer_') || klucz === 'hv_voltage_kv')
    .sort();
}

/** Granice zasilania kreatora: katalog, ręczny moc, ręczny impedancja — wszystkie na
 *  szynach SN (karta GPZ-H5-APARATURA: GPZ ze stroną 110 kV buduje szablon stacji H5). */
const GRANICE_SN: ReadonlyArray<[string, Partial<GridSourceFormData>]> = [
  ['katalog', {}],
  ['ręczny — moc zwarciowa', { manual_mode: true, catalog_ref: null, sk3_mva: 250 }],
  [
    'ręczny — impedancja',
    { manual_mode: true, catalog_ref: null, short_circuit_mode: 'IMPEDANCE', r_ohm: 0.1, x_ohm: 0.9 },
  ],
];

/** Dawne klucze trybu „równoważnik 110 kV” w kontekście operacji (np. zapis sprzed karty) —
 *  `scalDanePoczatkowe` przyjmuje kontekst bez filtra, więc ładunek nie może ich przenieść. */
const DAWNE_KLUCZE_WN = {
  short_circuit_input_side: 'HV_110',
  hv_voltage_kv: 110,
  sk3_hv_mva: 3000,
  transformer_count: 3,
  transformer_catalog_ref: 'TR-110-15-25',
  transformer_regulation_type: 'OLTC',
} as unknown as Partial<GridSourceFormData>;

describe('granica zasilania — kreator buduje GPZ z równoważnikiem na szynach SN', () => {
  it.each(GRANICE_SN)('%s: ładunek bez klucza transformatora ani napięcia WN, strona SN', (_opis, tryb) => {
    const payload = zbudujPayloadZrodla(daneKompletne(tryb));
    expect(kluczeTransformatorow(payload)).toEqual([]);
    expect(payload.short_circuit_input_side).toBe('SN');
    expect(payload.sk3_hv_mva).toBeUndefined();
    const rownowaznik = payload.manual_equivalent as Record<string, unknown> | undefined;
    if (rownowaznik !== undefined) {
      expect(rownowaznik.short_circuit_input_side).toBe('SN');
      expect(rownowaznik.hv_voltage_kv).toBeUndefined();
      expect(rownowaznik.sk3_hv_mva).toBeUndefined();
    }
  });

  it.each(GRANICE_SN)('%s: dawne klucze trybu 110 kV z kontekstu nie trafiają do ładunku', (_opis, tryb) => {
    const dane = scalDanePoczatkowe({ ...daneKompletne(tryb), ...DAWNE_KLUCZE_WN });
    const payload = zbudujPayloadZrodla(dane);
    expect(kluczeTransformatorow(payload)).toEqual([]);
    expect(payload.short_circuit_input_side).toBe('SN');
    expect(JSON.stringify(payload)).not.toContain('HV_110');
    expect(zbudujZadaniePodgladu(dane)?.voltage_kv ?? dane.sn_voltage_kv).toBe(dane.sn_voltage_kv);
  });

  it.each(GRANICE_SN)('%s: wiersz gotowości mówi, że transformatory są w równoważniku', (_opis, tryb) => {
    const wiersze = wierszeGotowosci(daneKompletne(tryb));
    expect(wiersze[wiersze.length - 1]).toEqual(WIERSZ_TRANSFORMATOROW);
    expect(WIERSZ_TRANSFORMATOROW).toEqual({
      etykieta: 'Transformatory 110/SN',
      stan: 'kompletne',
      wartosc: 'W równoważniku SN (poza modelem)',
    });
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

  it('tryb ręczny impedancja wymaga dodatniej reaktancji X', () => {
    const bledy = walidujFormularz(daneKompletne({
      manual_mode: true,
      catalog_ref: null,
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
