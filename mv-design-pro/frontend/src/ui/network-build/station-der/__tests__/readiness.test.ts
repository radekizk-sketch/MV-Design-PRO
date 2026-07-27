/**
 * Testy aggregacji readiness Station ↔ DER (Faza F).
 */

import { describe, it, expect } from 'vitest';

import {
  buildAggregatedReadiness,
  computeDerReadinessMatrix,
  sumStationLoadImportKw,
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
    pcc_ref: 'pcc_1',
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

  it('DER bez pcc_ref → SC blocked', () => {
    const matrix = computeDerReadinessMatrix(makeDer({ pcc_ref: null }));
    expect(matrix.sc_3f).toBe('blocked');
  });

  it('DER z dedicated_transformer ale bez transformer_catalog_ref → equipment partial', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({ connection_side: 'dedicated_transformer' }),
    );
    expect(matrix.equipment).toBe('partial');
  });

  it('DER z protection + ct (5P20 zabezpieczeniowa) + vt → protection ready', () => {
    const matrix = computeDerReadinessMatrix(
      makeDer({
        catalogs: {
          ...EMPTY_DER_CATALOGS,
          device_catalog_ref: 'pv_inv_sma_2500',
          protection_catalog_ref: 'prot_xyz',
          // Naprawa eng.5: CT musi być z katalogu i mieć klasę 5P/10P.
          ct_catalog_ref: 'ct_200_5_5p20',
          vt_catalog_ref: 'vt_15kv_100v_3p',
        },
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
    const matrix = computeDerReadinessMatrix(makeDer({ pcc_ref: null }));
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
      pcc_ref: 'BUS-1',
      bay_ref: 'BAY-1',
      lv_busbar_ref: null,
      connection_node_ref: null,
      nominal_power_kw: 500,
      voltage_level_ref: null,
      catalogs: {
        device_catalog_ref: 'INV-1',
        transformer_catalog_ref: null,
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
