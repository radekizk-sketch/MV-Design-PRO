/**
 * Testy aggregacji readiness Station ↔ DER (Faza F).
 */

import { describe, it, expect } from 'vitest';

import {
  buildAggregatedReadiness,
  computeDerReadinessMatrix,
  sumStationLoadImportKw,
  zlozZBramkaModelu,
  type AggregatedReadinessAxis,
  emptyReadinessMatrix,
  READINESS_AXIS_LABELS_PL,
  summarizeReadiness,
} from '../readiness';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type StationDerConnection,
} from '../types';

const FROZEN_NOW = '2026-05-06T10:00:00Z';

function makeDer(
  overrides: Partial<StationDerConnection> = {},
): StationDerConnection {
  return {
    id: 'der_1',
    project_id: 'p',
    station_id: 'station_1',
    der_kind: 'PV',
    name: 'PV Test',
    connection_side: 'SN',
    bus_przylaczenia_ref: 'pcc_1',
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: null,
    catalogs: { ...EMPTY_DER_CATALOGS, device_catalog_ref: 'pv_inv_sma_2500' },
    profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: 'ncrfg_pse' },
    nominal_power_kw: 2500,
    completeness: 'complete',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: FROZEN_NOW,
    updated_at: FROZEN_NOW,
    ...overrides,
  };
}

describe('computeDerReadinessMatrix — agregacja gotowości DER', () => {
  it('Pełny minimalny DER (device + pcc + nc_rfg) → SC3F ready, SC1F/SC2FG partial (Naprawa A.1), FRT/HVRT/NC_RFG blocked', () => {
    const matrix = computeDerReadinessMatrix(makeDer());
    expect(matrix.sc_3f).toBe('ready');
    expect(matrix.sc_2f).toBe('ready');
    // Naprawa A.1: SC1F/SC2FG wymagają fault_current_data_ref (Z₀/Z₁) — bez
    // tego status partial nawet z pełnymi pcc + device.
    expect(matrix.sc_1f).toBe('partial');
    expect(matrix.sc_2fg).toBe('partial');
    expect(matrix.q_u).toBe('ready');
    // Brak LVRT/HVRT curve → frt/hvrt blocked
    expect(matrix.frt).toBe('blocked');
    expect(matrix.hvrt).toBe('blocked');
    expect(matrix.nc_rfg).toBe('blocked');
  });

  it('DER z pełnymi profilami + dynamic_model_ref → FRT/HVRT/NC_RFG ready (Naprawa A.5)', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        profiles: {
          nc_rfg_profile_ref: 'ncrfg_pse',
          lvrt_curve_ref: 'lvrt_pse_b',
          hvrt_curve_ref: 'hvrt_pse_b',
          regulation_profile_ref: null,
        },
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          dynamic_model_ref: 'dyn_pv_gfl_typical',
        },
      }),
    );
    expect(matrix.frt).toBe('ready');
    expect(matrix.hvrt).toBe('ready');
    expect(matrix.nc_rfg).toBe('ready');
  });

  it('DER bez device_catalog_ref → SC blocked', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({ catalogs: { ...EMPTY_DER_CATALOGS } }),
    );
    expect(matrix.sc_3f).toBe('blocked');
    expect(matrix.equipment).toBe('blocked');
  });

  it('DER bez bus_przylaczenia_ref → SC blocked', () => {
    const matrix = computeDerReadinessMatrix(makeDer({ bus_przylaczenia_ref: null }));
    expect(matrix.sc_3f).toBe('blocked');
  });

  it('DER z dedicated_transformer ale bez block_transformer_catalog_ref → equipment partial', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({ connection_side: 'dedicated_transformer' }),
    );
    expect(matrix.equipment).toBe('partial');
  });

  it('DER z dedicated_transformer I WYBRANYM transformatorem blokowym → equipment ready (V12K-244)', () => {
    // PRZYPADEK ROZSTRZYGAJACY, ktory do V12K-244 NIE MOGL przejsc: regula czytala pole
    // `transformer_catalog_ref`, ktorego nie zapisywala zadna sciezka produkcyjna
    // (kreator, konfigurator stacji i odczyt ze snapshotu pisza `block_transformer_catalog_ref`).
    // Os „Dowod aparatury" byla wiec TRWALE „czesciowo" z powodem „brak transformatora
    // dedykowanego" — dla wytworcy, ktoremu projektant ten transformator wybral.
    const matrix = computeDerReadinessMatrix(
      makeDer({
        connection_side: 'dedicated_transformer',
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          block_transformer_catalog_ref: 'btr_pv_15_04_1000',
        },
      }),
    );
    expect(matrix.equipment).toBe('ready');
    const osie = buildAggregatedReadiness(
      makeDer({
        connection_side: 'dedicated_transformer',
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          block_transformer_catalog_ref: 'btr_pv_15_04_1000',
        },
      }),
    );
    const equipment = osie.find((os) => os.axis === 'equipment');
    expect(equipment?.blockers.map((b) => b.code)).not.toContain('der.dedicated_trafo.missing');
  });

  it('DER z protection + ct (5P20 zabezpieczeniowa) + vt → protection ready', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          protection_catalog_ref: 'prot_xyz',
          // Naprawa eng.5: CT musi mieć klasę 5P/10P. V12K-239: klasa jest DANĄ na
          // rekordzie (wypełnia ją warstwa znająca prawdziwy katalog), a nie wynikiem
          // szukania identyfikatora wewnątrz reguły — dlatego test podaje ją wprost.
          ct_catalog_ref: 'ct_400_5_5p20_15va_abb',
          vt_catalog_ref: 'vt_15kv_100v_3p_abb',
        },
        ct_accuracy_class: '5P20',
        ct_application: 'protection',
      }),
    );
    expect(matrix.protection).toBe('ready');
  });

  it('protection_selectivity z 0 innych DER → partial', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          protection_catalog_ref: 'prot_xyz',
          ct_catalog_ref: 'ct_xyz',
          vt_catalog_ref: 'vt_xyz',
        },
      }),
      { otherDersInStation: 0 },
    );
    expect(matrix.protection_selectivity).toBe('partial');
  });

  it('protection_selectivity z ≥1 innych DER → ready', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          protection_catalog_ref: 'prot_xyz',
          ct_catalog_ref: 'ct_xyz',
          vt_catalog_ref: 'vt_xyz',
        },
      }),
      { otherDersInStation: 2 },
    );
    expect(matrix.protection_selectivity).toBe('ready');
  });

  it('VDROP wymaga nominal_power_kw', () => {
    const matrix = computeDerReadinessMatrix(makeDer({ nominal_power_kw: null }));
    expect(matrix.vdrop).not.toBe('ready');
  });

  it('Report blocked gdy SC blocked', () => {
    const matrix = computeDerReadinessMatrix(makeDer({ bus_przylaczenia_ref: null }));
    expect(matrix.report_osd).toBe('blocked');
    expect(matrix.report_technical).toBe('blocked');
  });
});

describe('buildAggregatedReadiness — wiersze z polskimi labelami', () => {
  it('zwraca 14 osi z polskimi etykietami', () => {
    const rows = buildAggregatedReadiness(makeDer());
    expect(rows).toHaveLength(14);
    expect(rows.map((r) => r.label_pl)).toContain('Zwarcie 3-fazowe (SC3F)');
    expect(rows.map((r) => r.label_pl)).toContain('Zgodność przyłączeniowa (NC RfG)');
    expect(rows.map((r) => r.label_pl)).toContain('Raport OSD');
  });

  it('blockers dla SC mają target_screen=E-21 dla PV i target_tab odpowiedni', () => {
    const der = makeDer({
      catalogs: { ...EMPTY_DER_CATALOGS },
    });
    const rows = buildAggregatedReadiness(der);
    const sc3f = rows.find((r) => r.axis === 'sc_3f');
    expect(sc3f?.status).toBe('blocked');
    expect(sc3f?.blockers).toHaveLength(1);
    expect(sc3f?.blockers[0].target_screen).toBe('E-21');
    expect(sc3f?.blockers[0].target_tab).toBe('inverters');
    expect(sc3f?.blockers[0].message_pl).toContain('katalogu');
  });

  it('blocker NC RfG missing → target_tab=ncrfg', () => {
    const der = makeDer({ profiles: { ...EMPTY_DER_PROFILES } });
    const rows = buildAggregatedReadiness(der);
    const qu = rows.find((r) => r.axis === 'q_u');
    expect(qu?.status).toBe('blocked');
    expect(qu?.blockers[0].target_tab).toBe('ncrfg');
  });

  it('FW (E-23) target_screen mapowany poprawnie', () => {
    const der = makeDer({ der_kind: 'FW', catalogs: { ...EMPTY_DER_CATALOGS } });
    const rows = buildAggregatedReadiness(der);
    const sc3f = rows.find((r) => r.axis === 'sc_3f');
    expect(sc3f?.blockers[0].target_screen).toBe('E-23');
  });

  it('BESS (E-22) target_screen', () => {
    const der = makeDer({ der_kind: 'BESS', catalogs: { ...EMPTY_DER_CATALOGS } });
    const rows = buildAggregatedReadiness(der);
    const sc3f = rows.find((r) => r.axis === 'sc_3f');
    expect(sc3f?.blockers[0].target_screen).toBe('E-22');
  });
});

describe('summarizeReadiness', () => {
  it('liczy ready/partial/blocked', () => {
    const summary = summarizeReadiness(emptyReadinessMatrix());
    expect(summary.total).toBe(14);
    expect(summary.blocked).toBe(14);
    expect(summary.ready).toBe(0);
  });
});

describe('READINESS_AXIS_LABELS_PL', () => {
  it('zawiera 14 polskich labelów (zgodne z DerReadinessMatrix)', () => {
    expect(Object.keys(READINESS_AXIS_LABELS_PL)).toHaveLength(14);
    expect(READINESS_AXIS_LABELS_PL.frt).toContain('FRT');
    expect(READINESS_AXIS_LABELS_PL.hvrt).toContain('HVRT');
    expect(READINESS_AXIS_LABELS_PL.nc_rfg).toContain('NC RfG');
  });
});

// =============================================================================
// V12K-226: import mocy stacji — dana wejściowa oceny kierunku przepływu
// =============================================================================

describe('sumStationLoadImportKw (V12K-226)', () => {
  const snapshot = {
    substations: [
      { ref_id: 'ST-1', bus_refs: ['BUS-1A', 'BUS-1B'] },
      { ref_id: 'ST-2', bus_refs: ['BUS-2'] },
      { ref_id: 'ST-BEZ-SZYN', bus_refs: [] },
    ],
    loads: [
      { bus_ref: 'BUS-1A', p_mw: 0.25 },
      { bus_ref: 'BUS-1B', p_mw: 0.15 },
      { bus_ref: 'BUS-2', p_mw: 1.5 },
    ],
  };

  it('sumuje odbiory z szyn stacji i przelicza MW na kW', () => {
    // RACHUNEK RĘCZNY: (0,25 + 0,15) MW = 0,4 MW = 400 kW.
    expect(sumStationLoadImportKw(snapshot, 'ST-1')).toBe(400);
    // Druga stacja: 1,5 MW = 1500 kW (dowód, że filtr po szynach działa rozdzielnie).
    expect(sumStationLoadImportKw(snapshot, 'ST-2')).toBe(1500);
  });

  it('czyta moc z p_mw, a NIE z nominal_power_kw (kontrola odwrotna do defektu)', () => {
    // Odbiór niesie WYŁĄCZNIE zgadnięte pole z wersji sprzed naprawy. Gdyby kod nadal
    // czytał `nominal_power_kw`, wynik byłby 900 kW; poprawny odczyt `p_mw` daje brak
    // danej kontraktowej, czyli import NIEZNANY.
    const zeZgadnietymPolem = {
      substations: [{ ref_id: 'ST-1', bus_refs: ['BUS-1A'] }],
      loads: [{ bus_ref: 'BUS-1A', nominal_power_kw: 900 } as { bus_ref: string; p_mw?: number }],
    };
    expect(sumStationLoadImportKw(zeZgadnietymPolem, 'ST-1')).toBeNull();
  });

  it('nie wiąże odbioru ze stacją przez station_ref (pola, którego Load nie ma)', () => {
    // Odbiór wskazuje stację polem ze źródła `nn_side`, ale jego szyna nie należy do
    // stacji. Powiązanie idzie WYŁĄCZNIE przez szyny — inaczej wróciłby stary defekt.
    const zeStationRef = {
      substations: [{ ref_id: 'ST-1', bus_refs: ['BUS-1A'] }],
      loads: [{ bus_ref: 'BUS-OBCA', p_mw: 2.0, station_ref: 'ST-1' }],
    };
    expect(sumStationLoadImportKw(zeStationRef, 'ST-1')).toBe(0);
  });

  it('brak snapshotu i stacja nieobecna w modelu daja NIEZNANE, nie zero', () => {
    // To jest sedno naprawy: zero importu jest TWIERDZENIEM o sieci (stacja bez
    // odbiorow, cala generacja na eksport), a nie zapisem braku wiedzy.
    expect(sumStationLoadImportKw(null, 'ST-1')).toBeNull();
    expect(sumStationLoadImportKw(snapshot, 'ST-NIEZNANA')).toBeNull();
    expect(sumStationLoadImportKw(snapshot, 'ST-BEZ-SZYN')).toBeNull();
  });

  it('stacja z szynami bez odbiorow daje ZERO, bo to jest wiedza o sieci', () => {
    const bezOdbiorow = {
      substations: [{ ref_id: 'ST-1', bus_refs: ['BUS-1A'] }],
      loads: [{ bus_ref: 'BUS-INNA', p_mw: 1.0 }],
    };
    expect(sumStationLoadImportKw(bezOdbiorow, 'ST-1')).toBe(0);
  });
});

describe('osie niesymetryczne: powod stanu „czesciowo" (V12K-226)', () => {
  function derBezDanychZwarciowych(): StationDerConnection {
    return {
      id: 'DER-1',
      station_id: 'ST-1',
      der_kind: 'PV',
      connection_side: 'mv_bay',
      bus_przylaczenia_ref: 'BUS-1',
      bay_ref: 'BAY-1',
      lv_busbar_ref: null,
      connection_node_ref: null,
      nominal_power_kw: 500,
      voltage_level_ref: null,
      catalogs: {
        device_catalog_ref: 'INV-1',
        block_transformer_catalog_ref: null,
        protection_catalog_ref: null,
        ct_catalog_ref: null,
        vt_catalog_ref: null,
        fault_current_data_ref: null,
        dynamic_model_ref: null,
      },
      profiles: { nc_rfg_profile_ref: null, lvrt_curve_ref: null, hvrt_curve_ref: null },
    } as unknown as StationDerConnection;
  }

  it('brak modelu zwarciowego daje POWOD na osiach niesymetrycznych, nie pusta liste', () => {
    // POMIAR PRZED NAPRAWĄ: sc_1f = 'partial', blokery = [] — projektant widział
    // „niegotowe" bez żadnej akcji naprawczej (ślepy zaułek w torze pracy).
    const der = derBezDanychZwarciowych();
    const matrix = computeDerReadinessMatrix(der);
    const axes = buildAggregatedReadiness(der);

    expect(matrix.sc_1f).toBe('partial');
    for (const nazwa of ['sc_1f', 'sc_2fg'] as const) {
      const os = axes.find((a) => a.axis === nazwa);
      const kody = (os?.blockers ?? []).map((b) => b.code);
      expect(kody).toContain('der.fault_current_data.missing');
    }
  });

  it('bloker prowadzi na zakladke, na ktorej model zwarciowy sie ustawia', () => {
    // Akcja naprawcza bez celu jest bezużyteczna: „Model zwarciowy" jest polem
    // zakładki zgodności przyłączeniowej, nie topologii.
    const axes = buildAggregatedReadiness(derBezDanychZwarciowych());
    const bloker = axes
      .find((a) => a.axis === 'sc_1f')
      ?.blockers.find((b) => b.code === 'der.fault_current_data.missing');

    expect(bloker?.target_tab).toBe('ncrfg');
  });

  it('SC3F i SC2F nie dostaja tego blokera — skladowa zerowa ich nie dotyczy', () => {
    // Kontrola odwrotna, WYPROWADZONA Z FIZYKI, nie z kodu: zwarcie 3-fazowe jest
    // symetryczne (sama skladowa zgodna), a dwufazowe BEZ ZIEMI rozklada sie na
    // zgodna i przeciwna (Z1, Z2). Zadna z nich nie ma drogi powrotnej przez ziemie,
    // wiec zadanie danych Z0 byloby FALSZYWYM BRAKIEM — ta sama klasa bledu co
    // „brak izolacji" zglaszany dla przewodu golego (V12K-211).
    //
    // Ten test zlapal blad w PIERWSZEJ wersji naprawy, ktora dodawala bloker
    // wszystkim osiom poza SC3F, czyli takze zwarciu dwufazowemu.
    const axes = buildAggregatedReadiness(derBezDanychZwarciowych());
    for (const nazwa of ['sc_3f', 'sc_2f'] as const) {
      const kody = (axes.find((a) => a.axis === nazwa)?.blockers ?? []).map((b) => b.code);
      expect(kody).not.toContain('der.fault_current_data.missing');
    }
  });
});

describe('zlozZBramkaModelu — ocena DER + bramka modelu (V12K-231)', () => {
  function osie(): AggregatedReadinessAxis[] {
    return [
      { axis: 'sc_3f', label_pl: 'SC3F', status: 'ready', blockers: [] },
      { axis: 'sc_1f', label_pl: 'SC1F', status: 'ready', blockers: [] },
      { axis: 'sc_2fg', label_pl: 'SC2FG', status: 'ready', blockers: [] },
      { axis: 'protection', label_pl: 'Zabezpieczenia', status: 'ready', blockers: [] },
    ];
  }

  it('bramka modelu ODRZUCAJACA psuje os, choc dane DER sa kompletne', () => {
    // DEFEKT: os „SC1F" swiecila gotowa na danych per-DER, a bieg byl odrzucany
    // bramka modelu (brak skladowej zerowej i modelu uziemienia punktu neutralnego).
    const wynik = zlozZBramkaModelu(osie(), {
      SC_1F: { eligible: false, powody_pl: ['brak modelu uziemienia punktu neutralnego'] },
    });

    const sc1f = wynik.find((a) => a.axis === 'sc_1f');
    expect(sc1f?.status).toBe('blocked');
    expect(sc1f?.blockers.map((b) => b.message_pl).join(' ')).toContain('uziemienia');
    // Powod jest NAZWANY jako modelowy, bo naprawa jest na modelu, nie na tym DER.
    expect(sc1f?.blockers[0]?.message_pl.startsWith('Model:')).toBe(true);
  });

  it('nie rusza osi bez odpowiednika w bramce (zero zgadywania mapowania)', () => {
    // SC2FG nie ma typu w kontrakcie eligibility, zabezpieczenia tez nie. Dopisanie
    // im mapowania „po podobienstwie" byloby zgadywaniem, nie zlozeniem faktow.
    const wynik = zlozZBramkaModelu(osie(), {
      SC_1F: { eligible: false, powody_pl: ['brak Z0'] },
    });

    expect(wynik.find((a) => a.axis === 'sc_2fg')?.status).toBe('ready');
    expect(wynik.find((a) => a.axis === 'protection')?.status).toBe('ready');
    expect(wynik.find((a) => a.axis === 'sc_3f')?.status).toBe('ready');
  });

  it('bramka DOPUSZCZAJACA nie polepsza ani nie psuje oceny per-DER', () => {
    const wejscie = osie().map((a) =>
      a.axis === 'sc_1f' ? { ...a, status: 'partial' as ReadinessAxisStatus } : a,
    );
    const wynik = zlozZBramkaModelu(wejscie, {
      SC_1F: { eligible: true, powody_pl: [] },
      SC_3F: { eligible: true, powody_pl: [] },
    });

    expect(wynik.find((a) => a.axis === 'sc_1f')?.status).toBe('partial');
    expect(wynik.find((a) => a.axis === 'sc_3f')?.status).toBe('ready');
  });

  it('BRAK oceny modelu nie zmienia niczego — nie wiem nie znaczy zle', () => {
    // Ta sama regula, co przy imporcie stacji (V12K-226): brak wiedzy nie moze
    // udawac ani zgody, ani odmowy.
    const wynik = zlozZBramkaModelu(osie(), {});

    expect(wynik.map((a) => a.status)).toEqual(['ready', 'ready', 'ready', 'ready']);
    expect(wynik.every((a) => a.blockers.length === 0)).toBe(true);
  });

  it('os NIEDOTYCZACA wytworcy zostaje niedotyczaca, mimo odrzucenia modelu', () => {
    // Bramka modelu nie czyni analizy DOTYCZACA wytworcy, ktorego ona nie dotyczy —
    // inaczej ekran pokazalby naprawe dla czegos, czego sie nie liczy.
    const wejscie = osie().map((a) =>
      a.axis === 'sc_1f' ? { ...a, status: 'not_applicable' as ReadinessAxisStatus } : a,
    );
    const wynik = zlozZBramkaModelu(wejscie, {
      SC_1F: { eligible: false, powody_pl: ['brak Z0'] },
    });

    expect(wynik.find((a) => a.axis === 'sc_1f')?.status).toBe('not_applicable');
  });
});

describe('klasa przekladnika: DANA z modelu, nie szukanie w rownoleglym katalogu (V12K-232)', () => {
  function derZCt(over: Partial<StationDerConnection>): StationDerConnection {
    return {
      id: 'DER-1', station_id: 'ST-1', der_kind: 'PV', connection_side: 'mv_bay',
      bus_przylaczenia_ref: 'BUS-1', bay_ref: 'BAY-1', lv_busbar_ref: null, connection_node_ref: null,
      nominal_power_kw: 500, voltage_level_ref: null,
      catalogs: {
        device_catalog_ref: 'INV-1', block_transformer_catalog_ref: null,
        protection_catalog_ref: 'REL-1', ct_catalog_ref: 'ct_200_5_5p10_10va_abb',
        vt_catalog_ref: 'VT-1', fault_current_data_ref: 'FC-1', dynamic_model_ref: null,
      },
      profiles: { nc_rfg_profile_ref: null, lvrt_curve_ref: null, hvrt_curve_ref: null },
      ...over,
    } as unknown as StationDerConnection;
  }

  it('przekladnik z PRAWDZIWEGO katalogu bez podanej klasy: powod NAZWANY, nie milczenie', () => {
    // POMIAR PRZED NAPRAWĄ: dla realnego `ct_200_5_5p10_10va_abb` (klasa 5P10, w pełni
    // poprawna zabezpieczeniowo wg IEC 61869-2) oś zabezpieczeń kończyła się stanem
    // „częściowo" z PUSTĄ listą powodów — bo reguła szukała identyfikatora w lokalnym,
    // pięciowpisowym katalogu frontu, który ma ZEROWE pokrycie ID z backendem.
    const der = derZCt({});
    const matrix = computeDerReadinessMatrix(der);
    const kody = (buildAggregatedReadiness(der).find((a) => a.axis === 'protection')?.blockers ?? [])
      .map((b) => b.code);

    expect(matrix.protection).toBe('partial');
    expect(kody).toContain('der.ct_class.unresolved');
  });

  it('klasa PODANA jako dana modelu czyni os gotowa — bez zadnego katalogu w regule', () => {
    // Kontrola, że dana z modelu wystarcza: ten sam identyfikator backendu, tylko
    // z rozwiązaną klasą 5P10 obok.
    const der = derZCt({ ct_accuracy_class: '5P10' });
    const matrix = computeDerReadinessMatrix(der);

    expect(matrix.protection).toBe('ready');
  });

  it('klasa POMIAROWA podana jako dana daje werdykt, nie brak danej', () => {
    // Rozróżnienie, o które chodzi: „klasa nie jest zabezpieczeniowa" to WERDYKT
    // (kod .invalid), a „klasy nie da się ustalić" to brak danej (kod .unresolved).
    const der = derZCt({ ct_accuracy_class: '0.5' });
    const kody = (buildAggregatedReadiness(der).find((a) => a.axis === 'protection')?.blockers ?? [])
      .map((b) => b.code);

    expect(kody).toContain('der.ct_class.invalid');
    expect(kody).not.toContain('der.ct_class.unresolved');
  });

  it('warunek 87T czyta zastosowanie z DANEJ, a brak danej nie udaje spelnienia', () => {
    // Transformator dedykowany 2 MVA wymaga rdzenia podwójnego (IEC 60255-13).
    // Rdzeń podany jako pojedynczy → wymaganie zgłoszone; rdzeń nieznany → NIE
    // zgłaszamy fałszywego naruszenia, bo braku danej nie wolno czytać jako „nie dual".
    const zPojedynczym = derZCt({
      connection_side: 'dedicated_transformer', nominal_power_kw: 2000,
      ct_accuracy_class: '5P10', ct_application: 'protection',
    });
    const bezDanej = derZCt({
      connection_side: 'dedicated_transformer', nominal_power_kw: 2000,
      ct_accuracy_class: '5P10',
    });

    const kodyPojedynczy = (buildAggregatedReadiness(zPojedynczym)
      .find((a) => a.axis === 'protection')?.blockers ?? []).map((b) => b.code);
    const kodyBezDanej = (buildAggregatedReadiness(bezDanej)
      .find((a) => a.axis === 'protection')?.blockers ?? []).map((b) => b.code);

    expect(kodyPojedynczy).toContain('der.ct_87t_dual_core.required');
    expect(kodyBezDanej).not.toContain('der.ct_87t_dual_core.required');
  });

  it('rdzen podwojny podany jako dana spelnia warunek 87T', () => {
    const der = derZCt({
      connection_side: 'dedicated_transformer', nominal_power_kw: 2000,
      ct_accuracy_class: '5P10', ct_application: 'dual',
    });
    const kody = (buildAggregatedReadiness(der).find((a) => a.axis === 'protection')?.blockers ?? [])
      .map((b) => b.code);

    expect(kody).not.toContain('der.ct_87t_dual_core.required');
  });
});
