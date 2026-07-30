import { describe, expect, it } from 'vitest';

import type { CompleteMvBayTemplateSummary } from '../../../../ui/catalog/BayTemplatePicker';
import type { ConverterType, TransformerType } from '../../../../ui/catalog/types';
import {
  DANE_DOMYSLNE,
  czyKoniecOdcinka,
  czyRozdzielnicaKompletna,
  czyZrodloNn,
  doborTransformatorow,
  falownikiPv,
  falownikiZrodla,
  fmtKv,
  fmtMva,
  konwerterZKatalogu,
  kontekstKompletny,
  mocZrodlaNnMva,
  namespaceZrodlaNn,
  nazwaOperacji,
  normalizujTypStacji,
  ogranicznikOdplywow,
  parametryZKatalogu,
  rodzajFalownika,
  rolePolaStacji,
  szablonyDlaWyboru,
  szablonyPerRola,
  walidujFormularz,
  wymaganeNapiecieNn,
  wyznaczTryb,
  czyAparaturaKompletna,
  zabezpieczenieZrodla,
  zbudujPayload,
  zbudujPolaSn,
  type KontekstStacji,
  type StacjaFormData,
  type WyborRozdzielnicy,
} from '../stacjaModel';

function szablon(over: Partial<CompleteMvBayTemplateSummary> = {}): CompleteMvBayTemplateSummary {
  return {
    template_ref: 'tpl-in',
    manufacturer_ref: 'ZPUE_WLOSZCZOWA',
    switchgear_family_ref: 'ZPUE_ROTOBLOK',
    bay_kind: 'liniowe_doplywowe',
    bay_role: 'IN',
    source_status: 'repo_verified',
    source_refs: ['kat/zpue'],
    version: '1',
    hash: 'h',
    notes_pl: null,
    ...over,
  };
}

/** Komplet szablonów dla stacji odbiorczej (WE/WY/ODG/TR). */
const SZABLONY_KOMPLET: CompleteMvBayTemplateSummary[] = [
  szablon({ template_ref: 'tpl-in', bay_kind: 'liniowe_doplywowe', bay_role: 'IN' }),
  szablon({ template_ref: 'tpl-out', bay_kind: 'liniowe_odplywowe', bay_role: 'OUT' }),
  szablon({ template_ref: 'tpl-tr', bay_kind: 'transformatorowe', bay_role: 'TR' }),
  szablon({ template_ref: 'tpl-coupler', bay_kind: 'sprzeglowe_poprzeczne', bay_role: 'COUPLER' }),
];

/** Aparat pola per rola (B-12) — jawne wskazanie z katalogu APARAT_SN. */
const APARATY_ROL = {
  LINIA_IN: 'sw-cb-abb-vd4-17kv-630a',
  LINIA_OUT: 'sw-cb-abb-vd4-17kv-630a',
  LINIA_ODG: 'sw-cb-abb-vd4-17kv-630a',
  TRANSFORMATOROWE: 'sw-cb-abb-vd4-17kv-630a',
  SPRZEGLO: 'sw-cb-abb-vd4-17kv-630a',
} as const;

function rozdzielnica(stationType: StacjaFormData['station_type'] = 'branch'): WyborRozdzielnicy {
  const byRole = szablonyPerRola(SZABLONY_KOMPLET, stationType, {});
  return {
    manufacturerRef: 'ZPUE_WLOSZCZOWA',
    manufacturerName: 'ZPUE Włoszczowa',
    familyRef: 'ZPUE_ROTOBLOK',
    familyName: 'Rotoblok',
    snFields: zbudujPolaSn(
      stationType,
      byRole,
      {
        manufacturerRef: 'ZPUE_WLOSZCZOWA',
        switchgearFamilyRef: 'ZPUE_ROTOBLOK',
      },
      // B-12: aparat pola wskazany jawnie dla każdej roli.
      APARATY_ROL,
    ),
  };
}

const typy = [
  {
    id: 'trafo-630-15-04',
    name: 'TR 630',
    rated_power_mva: 0.63,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.4,
    uk_percent: 4,
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
  {
    id: 'trafo-1000-15-04',
    name: 'TR 1000',
    rated_power_mva: 1.0,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.4,
    uk_percent: 6,
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
  {
    id: 'trafo-1000-15-069',
    name: 'TR 1000 690V',
    rated_power_mva: 1.0,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.69,
    uk_percent: 6,
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
  {
    id: 'trafo-1000-20-04',
    name: 'TR 1000 20kV',
    rated_power_mva: 1.0,
    voltage_hv_kv: 20,
    voltage_lv_kv: 0.4,
    uk_percent: 6,
    tap_min: -2,
    tap_max: 2,
    tap_step_percent: 2.5,
  },
] as unknown as TransformerType[];

const falowniki = [
  { id: 'pv-500-04', name: 'PV 500 0,4kV', kind: 'PV', un_kv: 0.4, sn_mva: 0.55, pmax_mw: 0.5 },
  { id: 'pv-800-069', name: 'PV 800 0,69kV', kind: 'PV', un_kv: 0.69, sn_mva: 0.9, pmax_mw: 0.8 },
  // Napięcie strony nN > 1 kV — niezdatny na źródło nN stacji (filtr legacy).
  { id: 'pv-sn-3', name: 'PV 3kV', kind: 'PV', un_kv: 3, sn_mva: 2, pmax_mw: 1.8 },
  // Magazyn energii BESS (rodzaj BESS) — wariant BESS_INVERTER.
  { id: 'bess-04', name: 'BESS 0,4kV', kind: 'BESS', un_kv: 0.4, sn_mva: 0.5, pmax_mw: 0.4 },
  { id: 'bess-069', name: 'BESS 0,69kV', kind: 'BESS', un_kv: 0.69, sn_mva: 0.8, pmax_mw: 0.7 },
  // Elektrownia wiatrowa (rodzaj WIND) — wariant FW_INVERTER.
  { id: 'wind-04', name: 'FW 0,4kV', kind: 'WIND', un_kv: 0.4, sn_mva: 0.6, pmax_mw: 0.5 },
] as unknown as ConverterType[];

function dane(over: Partial<StacjaFormData> = {}): StacjaFormData {
  return {
    ...DANE_DOMYSLNE,
    catalog_ref: 'trafo-630-15-04',
    manufacturer_ref: 'ZPUE_WLOSZCZOWA',
    ...over,
  };
}

function kontekst(over: Partial<KontekstStacji> = {}): KontekstStacji {
  return {
    tryb: 'SPLIT',
    endpointBusRef: '',
    runRef: '',
    segmentId: 'seg-1',
    positionOnSegment: 0.5,
    snVoltageKv: 15,
    stationName: 'Stacja ST-3',
    stationKind: 'branch',
    ...over,
  };
}

describe('stacjaModel — tryb i operacja', () => {
  it('append gdy jawny ENDPOINT_APPEND i znany terminal', () => {
    expect(wyznaczTryb('ENDPOINT_APPEND', 'bus-end', 0.5)).toBe('ENDPOINT_APPEND');
  });

  it('append gdy pozycja na końcu segmentu (>=0.999) i terminal', () => {
    expect(wyznaczTryb('', 'bus-end', 1)).toBe('ENDPOINT_APPEND');
  });

  it('split gdy brak terminala', () => {
    expect(wyznaczTryb('ENDPOINT_APPEND', '', 1)).toBe('SPLIT');
    expect(wyznaczTryb('', '', 0.5)).toBe('SPLIT');
  });

  it('mapuje tryb na realną operację domenową', () => {
    expect(nazwaOperacji(kontekst({ tryb: 'ENDPOINT_APPEND' }))).toBe('append_station_on_endpoint');
    expect(nazwaOperacji(kontekst({ tryb: 'SPLIT' }))).toBe('insert_station_on_segment_sn');
    expect(czyKoniecOdcinka(kontekst({ tryb: 'ENDPOINT_APPEND' }))).toBe(true);
  });

  it('kompletność kontekstu zależy od trybu', () => {
    expect(kontekstKompletny(kontekst({ tryb: 'ENDPOINT_APPEND', endpointBusRef: 'bus-end' }))).toBe(true);
    expect(kontekstKompletny(kontekst({ tryb: 'ENDPOINT_APPEND', endpointBusRef: '' }))).toBe(false);
    expect(kontekstKompletny(kontekst({ tryb: 'SPLIT', segmentId: 'seg-1' }))).toBe(true);
    expect(kontekstKompletny(kontekst({ tryb: 'SPLIT', segmentId: '' }))).toBe(false);
  });
});

describe('stacjaModel — typ stacji', () => {
  it('normalizuje wariant semantyczny i legacy', () => {
    expect(normalizujTypStacji('inline')).toBe('inline');
    expect(normalizujTypStacji('sectional')).toBe('sectional');
    expect(normalizujTypStacji('B')).toBe('inline');
    expect(normalizujTypStacji('D')).toBe('sectional');
    expect(normalizujTypStacji('gpz')).toBe('branch');
    expect(normalizujTypStacji(undefined)).toBe('branch');
  });

  it('rozpoznaje typ końcowy (terminal) — semantyczny, legacy A i mv_lv', () => {
    expect(normalizujTypStacji('terminal')).toBe('terminal');
    expect(normalizujTypStacji('A')).toBe('terminal');
    expect(normalizujTypStacji('mv_lv')).toBe('terminal');
    expect(normalizujTypStacji('C')).toBe('branch');
  });

  it('stacja końcowa ma pola WE + transformator (bez WY/ODG)', () => {
    expect(rolePolaStacji('terminal')).toEqual(['LINIA_IN', 'TRANSFORMATOROWE']);
    // Odgałęźna nadal z pełnym zestawem (kontrast — dead-end nie dostaje nadmiaru).
    expect(rolePolaStacji('branch')).toContain('LINIA_OUT');
  });
});

describe('stacjaModel — walidacja', () => {
  it('wymaga katalogu i dodatniego napięcia nN', () => {
    expect(walidujFormularz(dane({ catalog_ref: null })).some((e) => e.field === 'catalog_ref')).toBe(true);
    expect(walidujFormularz(dane({ nn_voltage_kv: 0 })).some((e) => e.field === 'nn_voltage_kv')).toBe(true);
    expect(walidujFormularz(dane()).length).toBe(0);
  });

  it('wymaga producenta rozdzielnicy SN', () => {
    expect(
      walidujFormularz(dane({ manufacturer_ref: '' })).some((e) => e.field === 'manufacturer_ref'),
    ).toBe(true);
  });

  it('blokuje zapis, gdy pola rozdzielnicy niekompletne', () => {
    // Pusty zestaw pól SN → walidacja z snFields zgłasza brak.
    expect(walidujFormularz(dane(), []).some((e) => e.field === 'sn_fields')).toBe(true);
    // Komplet szablonów → brak błędu sn_fields.
    expect(
      walidujFormularz(dane(), rozdzielnica('branch').snFields).some((e) => e.field === 'sn_fields'),
    ).toBe(false);
  });

  it('blokuje zapis, gdy pole nie ma wskazanego aparatu (B-12)', () => {
    // Intencja: operacja domenowa NIE dobiera aparatu pola (usunięty fallback),
    // więc kreator musi wymusić jawne wskazanie z katalogu APARAT_SN.
    const byRole = szablonyPerRola(SZABLONY_KOMPLET, 'branch', {});
    const bezAparatu = zbudujPolaSn('branch', byRole, {
      manufacturerRef: 'ZPUE_WLOSZCZOWA',
      switchgearFamilyRef: 'ZPUE_ROTOBLOK',
    });
    expect(czyAparaturaKompletna(bezAparatu)).toBe(false);
    expect(
      walidujFormularz(dane(), bezAparatu).some((e) => e.field === 'sn_field_apparatus_refs'),
    ).toBe(true);
    expect(czyAparaturaKompletna(rozdzielnica('branch').snFields)).toBe(true);
    expect(
      walidujFormularz(dane(), rozdzielnica('branch').snFields).some(
        (e) => e.field === 'sn_field_apparatus_refs',
      ),
    ).toBe(false);
  });

  it('payload niesie jawny aparat per pole (B-12)', () => {
    const payload = zbudujPayload(dane(), kontekst(), rozdzielnica('branch'));
    const snFields = payload.sn_fields as Array<{ apparatus_catalog_ref: string | null }>;
    expect(snFields.length).toBeGreaterThan(0);
    expect(snFields.every((f) => f.apparatus_catalog_ref === 'sw-cb-abb-vd4-17kv-630a')).toBe(true);
  });

  it('ogranicza liczbę odpływów do zakresu', () => {
    expect(ogranicznikOdplywow(0)).toBe(1);
    expect(ogranicznikOdplywow(99)).toBe(8);
    expect(ogranicznikOdplywow(3)).toBe(3);
  });
});

describe('stacjaModel — dobór transformatora', () => {
  it('filtruje po napięciu SN szyny i nN odbioru, sortuje po mocy', () => {
    const wynik = doborTransformatorow(typy, 15, 0.4);
    expect(wynik.map((t) => t.id)).toEqual(['trafo-630-15-04', 'trafo-1000-15-04']);
  });

  it('inne napięcie nN zwraca zgodny typ', () => {
    expect(doborTransformatorow(typy, 15, 0.69).map((t) => t.id)).toEqual(['trafo-1000-15-069']);
  });

  it('inne napięcie SN zawęża listę', () => {
    expect(doborTransformatorow(typy, 20, 0.4).map((t) => t.id)).toEqual(['trafo-1000-20-04']);
  });

  it('czyta parametry z katalogu', () => {
    expect(parametryZKatalogu('trafo-630-15-04', typy)).toMatchObject({
      rated_power_mva: 0.63,
      voltage_hv_kv: 15,
      voltage_lv_kv: 0.4,
    });
  });
});

describe('stacjaModel — payload', () => {
  it('wariant koniec odcinka → append z endpoint_bus_ref/run_ref', () => {
    const payload = zbudujPayload(
      dane({ station_name: 'ST-3' }),
      kontekst({ tryb: 'ENDPOINT_APPEND', endpointBusRef: 'bus-end', runRef: 'run-1' }),
      rozdzielnica('branch'),
    );
    expect(payload).toMatchObject({
      name: 'ST-3',
      station_type: 'branch',
      endpoint_bus_ref: 'bus-end',
      run_ref: 'run-1',
      station: expect.objectContaining({ nn_voltage_kv: 0.4, station_role: 'STACJA_SN_NN' }),
      transformer: expect.objectContaining({
        create: true,
        transformer_catalog_ref: 'trafo-630-15-04',
        catalog_binding: expect.objectContaining({
          catalog_namespace: 'TRAFO_SN_NN',
          catalog_item_id: 'trafo-630-15-04',
        }),
      }),
      nn_block: expect.objectContaining({ nn_configuration: 'LOAD_NN', outgoing_feeders_nn_count: 2 }),
      options: expect.objectContaining({ create_transformer_field: true, create_nn_bus: true }),
    });
    expect(payload).not.toHaveProperty('segment_id');
    expect(payload).not.toHaveProperty('insert_at');
  });

  it('wariant podział → insert z segment_id/insert_at RATIO', () => {
    const payload = zbudujPayload(
      dane(),
      kontekst({ tryb: 'SPLIT', segmentId: 'seg-7', positionOnSegment: 0.25 }),
      rozdzielnica('branch'),
    );
    expect(payload).toMatchObject({
      segment_id: 'seg-7',
      insert_at: { mode: 'RATIO', value: 0.25 },
    });
    expect(payload).not.toHaveProperty('endpoint_bus_ref');
    // nazwa domyślna z kontekstu, gdy pole puste
    expect(payload).toHaveProperty('name', 'Stacja ST-3');
  });

  it('napięcie SN w payloadzie pochodzi z kontekstu (szyny), nie z UI', () => {
    const payload = zbudujPayload(dane(), kontekst({ snVoltageKv: 20 }), rozdzielnica('branch'));
    expect((payload.station as Record<string, unknown>).sn_voltage_kv).toBe(20);
  });

  it('napięcie SN nieznane (0) → pominięte w payloadzie (backend ustala z szyny)', () => {
    const payload = zbudujPayload(dane(), kontekst({ snVoltageKv: 0 }), rozdzielnica('branch'));
    // Zero fabrykacji: brak sn_voltage_kv zamiast zgadywanej wartości.
    expect(payload.station as Record<string, unknown>).not.toHaveProperty('sn_voltage_kv');
  });

  it('blok nn_earthing niesie układ sieci nN + typ punktu neutralnego (G-STK-1)', () => {
    const payload = zbudujPayload(
      dane({ nn_earthing_system: 'IT', neutral_point: 'isolated' }),
      kontekst(),
      rozdzielnica('branch'),
    );
    const earthing = payload.nn_earthing as Record<string, unknown>;
    expect(earthing.lv_system).toBe('IT');
    expect(earthing.neutral_point).toBe('isolated');
    // Izolowany → brak rezystancji (nie dotyczy).
    expect(earthing).not.toHaveProperty('lv_r_ohm');
  });

  it('liczba równoległych transformatorów → transformer.n_parallel tylko dla ≥2 (G-STK-6)', () => {
    // Pojedynczy (domyślnie 1) → brak n_parallel w payloadzie.
    const poj = zbudujPayload(dane(), kontekst(), rozdzielnica('branch'));
    expect(poj.transformer as Record<string, unknown>).not.toHaveProperty('n_parallel');

    // 2 jednostki → n_parallel=2.
    const dwie = zbudujPayload(dane({ transformer_units: 2 }), kontekst(), rozdzielnica('branch'));
    expect((dwie.transformer as Record<string, unknown>).n_parallel).toBe(2);
  });

  it('potrzeby własne w payloadzie tylko gdy moc > 0; cosφ opcjonalny (G-STK-3)', () => {
    // Domyślnie moc pusta → brak bloku.
    const bez = zbudujPayload(dane(), kontekst(), rozdzielnica('branch'));
    expect(bez).not.toHaveProperty('station_auxiliary');

    // Moc + cosφ (przecinek PL) → blok z active_power_kw + cos_phi.
    const zPw = zbudujPayload(
      dane({ station_auxiliary_kw: '5', station_auxiliary_cosphi: '0,9' }),
      kontekst(),
      rozdzielnica('branch'),
    );
    expect(zPw.station_auxiliary).toEqual({ active_power_kw: 5, cos_phi: 0.9 });
  });

  it('rezystancja uziemienia tylko dla wariantu impedancyjnego (rezystor/cewka)', () => {
    // Rezystor + R podane → lv_r_ohm w payloadzie (przecinek PL → liczba).
    const zRezystorem = zbudujPayload(
      dane({ neutral_point: 'resistor_grounded', neutral_r_ohm: '12,5' }),
      kontekst(),
      rozdzielnica('branch'),
    );
    expect((zRezystorem.nn_earthing as Record<string, unknown>).lv_r_ohm).toBe(12.5);

    // Bezpośrednio uziemiony + R w polu → R IGNOROWANE (nie dotyczy tego wariantu).
    const bezposredni = zbudujPayload(
      dane({ neutral_point: 'directly_grounded', neutral_r_ohm: '12,5' }),
      kontekst(),
      rozdzielnica('branch'),
    );
    expect(bezposredni.nn_earthing as Record<string, unknown>).not.toHaveProperty('lv_r_ohm');
  });

  it('payload niesie sn_fields i station.switchgear z wyboru rozdzielnicy', () => {
    const payload = zbudujPayload(dane(), kontekst(), rozdzielnica('branch'));
    const snFields = payload.sn_fields as Array<{ field_role: string; bay_template_ref: string | null }>;
    expect(snFields.map((f) => f.field_role)).toEqual([
      'LINIA_IN',
      'LINIA_OUT',
      'LINIA_ODG',
      'TRANSFORMATOROWE',
    ]);
    expect(snFields.every((f) => Boolean(f.bay_template_ref))).toBe(true);
    expect((payload.station as Record<string, unknown>).switchgear).toMatchObject({
      manufacturer_ref: 'ZPUE_WLOSZCZOWA',
      switchgear_family_ref: 'ZPUE_ROTOBLOK',
    });
  });
});

describe('stacjaModel — rozdzielnica SN', () => {
  it('role pól zależą od typu stacji (sekcyjna ma sprzęgło)', () => {
    expect(rolePolaStacji('branch')).toEqual([
      'LINIA_IN',
      'LINIA_OUT',
      'LINIA_ODG',
      'TRANSFORMATOROWE',
    ]);
    expect(rolePolaStacji('inline')).toEqual(['LINIA_IN', 'LINIA_OUT', 'TRANSFORMATOROWE']);
    expect(rolePolaStacji('sectional')).toEqual([
      'LINIA_IN',
      'LINIA_OUT',
      'SPRZEGLO',
      'TRANSFORMATOROWE',
    ]);
  });

  it('filtruje szablony niekompletne (tylko kompletne/repo_verified przechodzą)', () => {
    const mieszane: CompleteMvBayTemplateSummary[] = [
      szablon({ template_ref: 'ok', source_status: 'repo_verified' }),
      szablon({ template_ref: 'niekompletny', source_status: 'incomplete_requires_review' }),
      szablon({ template_ref: 'poza', source_status: 'requires_catalog' }),
    ];
    const wynik = szablonyDlaWyboru(mieszane, 'ZPUE_WLOSZCZOWA', null);
    expect(wynik.map((t) => t.template_ref)).toEqual(['ok']);
  });

  it('sekcyjna dobiera pole sprzęgłowe; kompletność wykrywana', () => {
    const byRole = szablonyPerRola(SZABLONY_KOMPLET, 'sectional', {});
    const snFields = zbudujPolaSn('sectional', byRole, {
      manufacturerRef: 'ZPUE_WLOSZCZOWA',
      switchgearFamilyRef: 'ZPUE_ROTOBLOK',
    });
    expect(snFields.map((f) => f.field_role)).toContain('SPRZEGLO');
    expect(czyRozdzielnicaKompletna(snFields)).toBe(true);
  });

  it('brak szablonu dla roli → rozdzielnica niekompletna', () => {
    const bezTr = SZABLONY_KOMPLET.filter((t) => t.bay_kind !== 'transformatorowe');
    const byRole = szablonyPerRola(bezTr, 'branch', {});
    const snFields = zbudujPolaSn('branch', byRole, {
      manufacturerRef: 'ZPUE_WLOSZCZOWA',
      switchgearFamilyRef: 'ZPUE_ROTOBLOK',
    });
    expect(czyRozdzielnicaKompletna(snFields)).toBe(false);
  });
});

describe('stacjaModel — blok nN / PV', () => {
  it('falownikiPv: filtruje PV zdatne na źródło nN (un ≤ 1 kV) i sortuje deterministycznie', () => {
    const wynik = falownikiPv(falowniki);
    // BESS odpada (rodzaj), PV 3 kV odpada (napięcie strony nN > 1 kV).
    expect(wynik.map((c) => c.id)).toEqual(['pv-500-04', 'pv-800-069']);
  });

  it('wymaganeNapiecieNn: dla PV z katalogu falownika, dla odbioru z wyboru', () => {
    const konw = konwerterZKatalogu('pv-800-069', falowniki);
    expect(wymaganeNapiecieNn(dane({ nn_configuration: 'PV_INVERTER', source_converter_ref: 'pv-800-069' }), konw)).toBe(0.69);
    // Brak wyboru falownika → null (bez domysłu).
    expect(wymaganeNapiecieNn(dane({ nn_configuration: 'PV_INVERTER', source_converter_ref: null }), null)).toBeNull();
    // Odbiorcza → napięcie z wyboru.
    expect(wymaganeNapiecieNn(dane({ nn_configuration: 'LOAD_NN', nn_voltage_kv: 0.4 }), null)).toBe(0.4);
  });

  it('mocZrodlaNnMva: moc źródła tylko dla PV', () => {
    const konw = konwerterZKatalogu('pv-500-04', falowniki);
    expect(mocZrodlaNnMva(dane({ nn_configuration: 'PV_INVERTER' }), konw)).toBe(0.55);
    expect(mocZrodlaNnMva(dane({ nn_configuration: 'LOAD_NN' }), konw)).toBeNull();
  });

  it('dobór transformatora dla PV: wymaga typu zgodnego ze stroną nN falownika (blokada, gdy brak)', () => {
    const konw = konwerterZKatalogu('pv-800-069', falowniki);
    const wymNn = wymaganeNapiecieNn(dane({ nn_configuration: 'PV_INVERTER', source_converter_ref: 'pv-800-069' }), konw);
    const moc = mocZrodlaNnMva(dane({ nn_configuration: 'PV_INVERTER' }), konw);
    // Falownik 0,69 kV → tylko transformator SN 15 / nN 0,69 kV.
    expect(doborTransformatorow(typy, 15, wymNn as number, moc).map((t) => t.id)).toEqual(['trafo-1000-15-069']);
    // Brak zgodnego transformatora (np. falownik 0,69 kV a szyna 20 kV) → pusto = blokada.
    expect(doborTransformatorow(typy, 20, 0.69, moc)).toEqual([]);
  });

  it('walidacja PV: wymaga wybranego falownika', () => {
    const bezFalownika = dane({ nn_configuration: 'PV_INVERTER', source_converter_ref: null });
    expect(walidujFormularz(bezFalownika).some((e) => e.field === 'source_converter_ref')).toBe(true);
    const zFalownikiem = dane({ nn_configuration: 'PV_INVERTER', source_converter_ref: 'pv-800-069' });
    expect(walidujFormularz(zFalownikiem).some((e) => e.field === 'source_converter_ref')).toBe(false);
  });

  it('zabezpieczenieZrodla: intencja tylko dla PV', () => {
    expect(zabezpieczenieZrodla(dane({ nn_configuration: 'PV_INVERTER' }))).toBeTruthy();
    expect(zabezpieczenieZrodla(dane({ nn_configuration: 'LOAD_NN' }))).toBeUndefined();
  });

  it('payload PV: nn_block niesie źródło, napięcie z falownika, feeder ZRODLO_NN_PV i zabezpieczenie', () => {
    const konw = konwerterZKatalogu('pv-800-069', falowniki);
    const payload = zbudujPayload(
      dane({
        nn_configuration: 'PV_INVERTER',
        source_converter_ref: 'pv-800-069',
        catalog_ref: 'trafo-1000-15-069',
        outgoing_feeders_nn_count: 2,
      }),
      kontekst({ snVoltageKv: 15 }),
      rozdzielnica('branch'),
      konw,
    );
    const nnBlock = payload.nn_block as Record<string, unknown>;
    expect(nnBlock).toMatchObject({
      nn_configuration: 'PV_INVERTER',
      source_converter_catalog_ref: 'pv-800-069',
      source_converter_kind: 'PV',
      source_converter_un_kv: 0.69,
      source_converter_sn_mva: 0.9,
      source_converter_pmax_mw: 0.8,
    });
    expect(nnBlock.source_protection).toBeTruthy();
    // Napięcie nN stacji z falownika, nie z pola odbioru.
    expect((payload.station as Record<string, unknown>).nn_voltage_kv).toBe(0.69);
    // Odpływy: 2 odbiorcze + pole źródłowe PV → count 3.
    const feeders = nnBlock.outgoing_feeders_nn as Array<{ feeder_role: string }>;
    expect(feeders.map((f) => f.feeder_role)).toEqual(['ODPLYW_NN', 'ODPLYW_NN', 'ZRODLO_NN_PV']);
    expect(nnBlock.outgoing_feeders_nn_count).toBe(3);
  });

  it('payload LOAD_NN: brak pól/źródła PV, sam odpływ odbiorczy', () => {
    const payload = zbudujPayload(dane({ nn_configuration: 'LOAD_NN' }), kontekst(), rozdzielnica('branch'));
    const nnBlock = payload.nn_block as Record<string, unknown>;
    expect(nnBlock.nn_configuration).toBe('LOAD_NN');
    expect(nnBlock).not.toHaveProperty('source_converter_catalog_ref');
    expect(nnBlock).not.toHaveProperty('source_protection');
    const feeders = nnBlock.outgoing_feeders_nn as Array<{ feeder_role: string }>;
    expect(feeders.every((f) => f.feeder_role === 'ODPLYW_NN')).toBe(true);
    expect(nnBlock.outgoing_feeders_nn_count).toBe(2);
  });
});

describe('stacjaModel — pełny parytet nN (5 wariantów vs legacy)', () => {
  it('rodzajFalownika + czyZrodloNn: mapowanie wariantów źródłowych', () => {
    expect(rodzajFalownika('PV_INVERTER')).toBe('PV');
    expect(rodzajFalownika('BESS_INVERTER')).toBe('BESS');
    expect(rodzajFalownika('FW_INVERTER')).toBe('WIND');
    expect(rodzajFalownika('LOAD_NN')).toBeNull();
    expect(rodzajFalownika('CUSTOM_NN')).toBeNull();
    expect(czyZrodloNn('PV_INVERTER')).toBe(true);
    expect(czyZrodloNn('BESS_INVERTER')).toBe(true);
    expect(czyZrodloNn('FW_INVERTER')).toBe(true);
    expect(czyZrodloNn('LOAD_NN')).toBe(false);
    expect(czyZrodloNn('CUSTOM_NN')).toBe(false);
  });

  it('falownikiZrodla: zawęża do rodzaju (PV/BESS/WIND) i filtruje un > 1 kV', () => {
    expect(falownikiZrodla(falowniki, 'PV_INVERTER').map((c) => c.id)).toEqual(['pv-500-04', 'pv-800-069']);
    expect(falownikiZrodla(falowniki, 'BESS_INVERTER').map((c) => c.id)).toEqual(['bess-04', 'bess-069']);
    expect(falownikiZrodla(falowniki, 'FW_INVERTER').map((c) => c.id)).toEqual(['wind-04']);
    // Warianty odbiorcze nie mają falownika.
    expect(falownikiZrodla(falowniki, 'LOAD_NN')).toEqual([]);
    expect(falownikiZrodla(falowniki, 'CUSTOM_NN')).toEqual([]);
    // falownikiPv = wariant PV (reużycie).
    expect(falownikiPv(falowniki).map((c) => c.id)).toEqual(['pv-500-04', 'pv-800-069']);
  });

  it('namespaceZrodlaNn: parytet 1:1 z legacy (PV/BESS/CONVERTER)', () => {
    expect(namespaceZrodlaNn('PV_INVERTER')).toBe('ZRODLO_NN_PV');
    expect(namespaceZrodlaNn('BESS_INVERTER')).toBe('ZRODLO_NN_BESS');
    expect(namespaceZrodlaNn('FW_INVERTER')).toBe('CONVERTER');
  });

  it('wymaganeNapiecieNn/mocZrodlaNnMva: BESS i FW czytają z katalogu falownika', () => {
    const bess = konwerterZKatalogu('bess-069', falownikiZrodla(falowniki, 'BESS_INVERTER'));
    expect(wymaganeNapiecieNn(dane({ nn_configuration: 'BESS_INVERTER', source_converter_ref: 'bess-069' }), bess)).toBe(0.69);
    expect(mocZrodlaNnMva(dane({ nn_configuration: 'BESS_INVERTER' }), bess)).toBe(0.8);
    const wind = konwerterZKatalogu('wind-04', falownikiZrodla(falowniki, 'FW_INVERTER'));
    expect(wymaganeNapiecieNn(dane({ nn_configuration: 'FW_INVERTER', source_converter_ref: 'wind-04' }), wind)).toBe(0.4);
    expect(mocZrodlaNnMva(dane({ nn_configuration: 'FW_INVERTER' }), wind)).toBe(0.6);
  });

  it('walidacja: warianty źródłowe wymagają falownika (BESS/FW)', () => {
    expect(
      walidujFormularz(dane({ nn_configuration: 'BESS_INVERTER', source_converter_ref: null })).some(
        (e) => e.field === 'source_converter_ref',
      ),
    ).toBe(true);
    expect(
      walidujFormularz(dane({ nn_configuration: 'FW_INVERTER', source_converter_ref: null })).some(
        (e) => e.field === 'source_converter_ref',
      ),
    ).toBe(true);
  });

  it('payload BESS: nn_block z BESS, feeder ZRODLO_NN_BESS, napięcie z falownika, bez zabezpieczenia', () => {
    const bess = konwerterZKatalogu('bess-069', falownikiZrodla(falowniki, 'BESS_INVERTER'));
    const payload = zbudujPayload(
      dane({
        nn_configuration: 'BESS_INVERTER',
        source_converter_ref: 'bess-069',
        catalog_ref: 'trafo-1000-15-069',
        outgoing_feeders_nn_count: 2,
      }),
      kontekst({ snVoltageKv: 15 }),
      rozdzielnica('branch'),
      bess,
    );
    const nnBlock = payload.nn_block as Record<string, unknown>;
    expect(nnBlock).toMatchObject({
      nn_configuration: 'BESS_INVERTER',
      source_converter_catalog_ref: 'bess-069',
      source_converter_kind: 'BESS',
      source_converter_un_kv: 0.69,
      source_converter_sn_mva: 0.8,
      source_converter_pmax_mw: 0.7,
    });
    // Legacy: intencja zabezpieczenia tylko dla PV → BESS bez source_protection.
    expect(nnBlock).not.toHaveProperty('source_protection');
    expect((payload.station as Record<string, unknown>).nn_voltage_kv).toBe(0.69);
    const feeders = nnBlock.outgoing_feeders_nn as Array<{
      feeder_role: string;
      catalog_bindings: { source_converter?: { catalog_namespace?: string } } | null;
    }>;
    expect(feeders.map((f) => f.feeder_role)).toEqual(['ODPLYW_NN', 'ODPLYW_NN', 'ZRODLO_NN_BESS']);
    expect(feeders[2].catalog_bindings?.source_converter?.catalog_namespace).toBe('ZRODLO_NN_BESS');
    expect(nnBlock.outgoing_feeders_nn_count).toBe(3);
  });

  it('payload FW: feeder ZRODLO_NN_FW, wiązanie falownika w przestrzeni CONVERTER (parytet legacy)', () => {
    const wind = konwerterZKatalogu('wind-04', falownikiZrodla(falowniki, 'FW_INVERTER'));
    const payload = zbudujPayload(
      dane({
        nn_configuration: 'FW_INVERTER',
        source_converter_ref: 'wind-04',
        catalog_ref: 'trafo-630-15-04',
      }),
      kontekst({ snVoltageKv: 15 }),
      rozdzielnica('branch'),
      wind,
    );
    const nnBlock = payload.nn_block as Record<string, unknown>;
    expect(nnBlock).toMatchObject({
      nn_configuration: 'FW_INVERTER',
      source_converter_catalog_ref: 'wind-04',
      source_converter_kind: 'WIND',
      source_converter_un_kv: 0.4,
    });
    const feeders = nnBlock.outgoing_feeders_nn as Array<{
      feeder_role: string;
      catalog_bindings: { source_converter?: { catalog_namespace?: string } } | null;
    }>;
    expect(feeders.at(-1)?.feeder_role).toBe('ZRODLO_NN_FW');
    expect(feeders.at(-1)?.catalog_bindings?.source_converter?.catalog_namespace).toBe('CONVERTER');
  });

  it('payload CUSTOM_NN: własne napięcie nN w payloadzie, bez źródła i pola źródłowego', () => {
    const payload = zbudujPayload(
      dane({ nn_configuration: 'CUSTOM_NN', nn_voltage_kv: 6.3, catalog_ref: 'trafo-630-15-04' }),
      kontekst({ snVoltageKv: 15 }),
      rozdzielnica('branch'),
    );
    const nnBlock = payload.nn_block as Record<string, unknown>;
    expect(nnBlock.nn_configuration).toBe('CUSTOM_NN');
    expect(nnBlock).not.toHaveProperty('source_converter_catalog_ref');
    expect(nnBlock).not.toHaveProperty('source_protection');
    // Własne napięcie strony nN spływa do station.nn_voltage_kv (nie z falownika).
    expect((payload.station as Record<string, unknown>).nn_voltage_kv).toBe(6.3);
    const feeders = nnBlock.outgoing_feeders_nn as Array<{ feeder_role: string }>;
    expect(feeders.every((f) => f.feeder_role === 'ODPLYW_NN')).toBe(true);
  });
});

describe('stacjaModel — formatery', () => {
  it('formatuje wartości', () => {
    expect(fmtKv(0.4)).toBe('0.400 kV');
    expect(fmtMva(0.63)).toBe('0.63 MVA');
    expect(fmtMva(null)).toBe('—');
  });
});
