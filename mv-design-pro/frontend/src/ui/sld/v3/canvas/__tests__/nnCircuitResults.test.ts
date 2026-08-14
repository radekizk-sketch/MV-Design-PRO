/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2) — testy `nnCircuitResults.ts`:
 * rozwiązanie referencji obwodu nN (`resolveNnCircuitRef`) + budowniczy CZYSTY
 * sekcji wynikowych (`buildNnCircuitResultsSections`). Fixture ENM MINIMALNA
 * skopiowana ze struktury backendowego testu SWZ
 * (`backend/tests/application/analyses/swz/test_service.py::_enm`) — TA SAMA
 * topologia (TR SN/nN → szyna nN → aparat odpływu → punkt daleki).
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildNnCircuitResultsSections,
  resolveNnCircuitRef,
  type NnCircuitRef,
} from '../nnCircuitResults';
import type { SwzApiResponse } from '../overlay';

function minimalEnm(): EnergyNetworkModel {
  return {
    header: { name: 't', defaults: { sn_nominal_kv: 15 } },
    buses: [
      { id: 'sn', ref_id: 'sn', name: 'SN', tags: [], meta: {}, voltage_kv: 15, phase_system: '3ph' },
      { id: 'nn', ref_id: 'nn', name: 'nN', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
      { id: 'b2', ref_id: 'b2', name: 'B2 (daleki)', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
    ],
    sources: [],
    transformers: [],
    branches: [
      {
        id: 'ap1', ref_id: 'ap1', name: 'AP1', tags: [], meta: {},
        type: 'breaker', from_bus_ref: 'nn', to_bus_ref: 'b2', status: 'closed',
        catalog_namespace: 'APARAT_NN_MCB',
        materialized_params: { in_a: 16, curve_class: 'B' },
      },
    ],
    substations: [
      {
        id: 'stn', ref_id: 'stn', name: 'S', tags: [], meta: {},
        station_type: 'mv_lv', bus_refs: ['sn', 'nn'], transformer_refs: [],
      },
    ],
    loads: [],
    generators: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

describe('resolveNnCircuitRef', () => {
  it('rozwiązuje aparat nN (switch dotykający szyny <= 0,5 kV należącej do stacji)', () => {
    const enm = minimalEnm();
    const ref = resolveNnCircuitRef(enm, 'ap1');
    expect(ref).toEqual<NnCircuitRef>({
      stationRef: 'stn',
      nnBusRef: 'nn',
      busRef: 'b2',
      breakerRef: 'ap1',
    });
  });

  it('zwraca null dla aparatu SN (oba końce > 0,5 kV — żadna szyna nN)', () => {
    const enm = minimalEnm();
    const snFar = { id: 'sn2', ref_id: 'sn2', name: 'SN2', tags: [], meta: {}, voltage_kv: 15, phase_system: '3ph' as const };
    const snApp = {
      id: 'sn-ap', ref_id: 'sn-ap', name: 'SN-AP', tags: [], meta: {},
      type: 'breaker' as const, from_bus_ref: 'sn', to_bus_ref: 'sn2', status: 'closed' as const,
    };
    const withSnApp: EnergyNetworkModel = { ...enm, buses: [...enm.buses, snFar], branches: [snApp] };
    expect(resolveNnCircuitRef(withSnApp, 'sn-ap')).toBeNull();
  });

  it('zwraca null dla ref nieistniejącej gałęzi (uczciwy brak, zero zgadywania)', () => {
    const enm = minimalEnm();
    expect(resolveNnCircuitRef(enm, 'nieistniejacy-ref')).toBeNull();
  });

  it('zwraca null dla gałęzi, która nie jest aparatem (np. kabel)', () => {
    const enm = minimalEnm();
    const cable = {
      id: 'c1', ref_id: 'c1', name: 'C1', tags: [], meta: {},
      type: 'cable' as const, from_bus_ref: 'nn', to_bus_ref: 'b2', status: 'closed' as const,
      length_km: 0.1, r_ohm_per_km: 0.3, x_ohm_per_km: 0.08,
    };
    const withCable: EnergyNetworkModel = { ...enm, branches: [cable] };
    expect(resolveNnCircuitRef(withCable, 'c1')).toBeNull();
  });

  it('deterministyczne: to samo wejście daje identyczny wynik', () => {
    const enm = minimalEnm();
    const a = resolveNnCircuitRef(enm, 'ap1');
    const b = resolveNnCircuitRef(enm, 'ap1');
    expect(a).toEqual(b);
  });
});

const REF: NnCircuitRef = { stationRef: 'stn', nnBusRef: 'nn', busRef: 'b2', breakerRef: 'ap1' };
const BRANCH = {
  id: 'ap1', ref_id: 'ap1', name: 'AP1', tags: [], meta: {},
  type: 'breaker' as const, from_bus_ref: 'nn', to_bus_ref: 'b2', status: 'closed' as const,
  catalog_namespace: 'APARAT_NN_MCB',
  materialized_params: { in_a: 16, curve_class: 'B' } as Record<string, unknown>,
};

function swzOk(overrides: Partial<NonNullable<SwzApiResponse['swz']>> = {}): SwzApiResponse {
  return {
    status: 'OK',
    breaker_ref: 'ap1',
    swz: {
      status: 'spełnia',
      przyczyna_pl: 'Ik1_min ≥ Ia wymagane',
      ik1_min_a: 250,
      ia_wymagane_a: 160,
      t_wymagany_s: 0.4,
      margines: 1.5625,
      ...overrides,
    },
  };
}

describe('buildNnCircuitResultsSections', () => {
  it('Ib: payload realny (LOAD_FLOW, I_A na breakerRef) → sekcja wartosc', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF,
      branch: BRANCH,
      overlayPayload: {
        run_id: 'run-1',
        analysis_type: 'LOAD_FLOW',
        elements: { ap1: { ref_id: 'ap1', kind: 'branch', badges: [], severity: 'INFO', metrics: { I_A: { code: 'I_A', value: 12.5, unit: 'A' } } } },
      },
      swzResponse: undefined,
      voltageProfileRow: undefined,
      resultsStale: false,
    });
    expect(spec.ib).toEqual({ stan: 'wartosc', wartosc: { amperow: 12.5 }, zrodloPl: 'bieg rozpływu mocy (run-1)' });
  });

  it('Ib: brak przebiegu rozpływu mocy → brak_wynikow z akcją przejdz-do-wynikow', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: undefined, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.ib.stan).toBe('brak_wynikow');
    expect(spec.ib.stan === 'brak_wynikow' && spec.ib.akcja).toBe('przejdz-do-wynikow');
  });

  it('In: odczyt z materialized_params (namespace APARAT_NN_MCB)', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: undefined, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.inRated).toEqual({ stan: 'wartosc', wartosc: { amperow: 16, typPl: 'MCB B' }, zrodloPl: 'model — katalog aparatu' });
  });

  it('In: brak materialized_params → brak_wynikow bez akcji', () => {
    const branchNoParams = { ...BRANCH, materialized_params: null };
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: branchNoParams, overlayPayload: null, swzResponse: undefined, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.inRated.stan).toBe('brak_wynikow');
  });

  it('Iz′: ZAWSZE brak_wynikow (brak dostawcy danych wejściowych w tym module) — uczciwy, nie phantom', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: undefined, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.izPrime.stan).toBe('brak_wynikow');
    expect(spec.izPrime.stan === 'brak_wynikow' && spec.izPrime.akcja).toBeUndefined();
  });

  it('Ikmax: payload realny (SC, IK_3F_A na busRef) → sekcja wartosc w kA', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH,
      overlayPayload: {
        run_id: 'run-sc', analysis_type: 'SC_3F',
        elements: { b2: { ref_id: 'b2', kind: 'bus', badges: [], severity: 'INFO', metrics: { IK_3F_A: { code: 'IK_3F_A', value: 5400, unit: 'A' } } } },
      },
      swzResponse: undefined, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.ikMax).toEqual({ stan: 'wartosc', wartosc: { kiloamperow: 5.4 }, zrodloPl: 'bieg zwarciowy (run-sc)' });
  });

  it('SWZ: koperta status=OK, werdykt „nierozstrzygalne" — trzeci stan JAWNY (nie brak_wynikow, nie nie_dotyczy)', () => {
    const response = swzOk({ status: 'nierozstrzygalne', przyczyna_pl: 'Brak wkładki — nierozstrzygalne' });
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: response, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.swz.stan).toBe('wartosc');
    expect(spec.swz.stan === 'wartosc' && spec.swz.wartosc.werdykt).toBe('nierozstrzygalne');
  });

  it('SWZ: koperta status="nie dotyczy" → sekcja nie_dotyczy (odróżniona od brak_wynikow)', () => {
    const response: SwzApiResponse = { status: 'nie dotyczy', breaker_ref: 'ap1' };
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: response, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.swz.stan).toBe('nie_dotyczy');
    expect(spec.ikMin.stan).toBe('nie_dotyczy');
  });

  it('SWZ: koperta status="brak danych" → brak_wynikow (backend nie mógł policzyć)', () => {
    const response: SwzApiResponse = { status: 'brak danych', breaker_ref: 'ap1' };
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: response, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.swz.stan).toBe('brak_wynikow');
  });

  it('SWZ: brak odpowiedzi (aparat nie jest korzeniem odpływu rozpoznanego przez pętlę) → brak_wynikow', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: undefined, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.swz.stan).toBe('brak_wynikow');
    expect(spec.ikMin.stan).toBe('brak_wynikow');
  });

  it('Ikmin: WYŁĄCZNIE odczyt ik1_min_a z koperty SWZ (zero przeliczeń fizycznych)', () => {
    const response = swzOk({ ik1_min_a: 3210 });
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: response, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.ikMin).toEqual({ stan: 'wartosc', wartosc: { kiloamperow: 3.21 }, zrodloPl: 'pętla zwarcia IEC 60364-4-41 (Ik1_min, scenariusz MIN)' });
  });

  it('ΔU: bez przebiegu rozpływu mocy → brak_wynikow z akcją', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: undefined, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.deltaU.stan).toBe('brak_wynikow');
    expect(spec.deltaU.stan === 'brak_wynikow' && spec.deltaU.akcja).toBe('przejdz-do-wynikow');
  });

  it('ΔU: przebieg LOAD_FLOW załadowany + wiersz profilu napięć dostarczony → wartosc', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH,
      overlayPayload: { run_id: 'run-1', analysis_type: 'LOAD_FLOW', elements: {} },
      swzResponse: undefined,
      voltageProfileRow: { bus_id: 'b2', delta_pct: -3.2 },
      resultsStale: false,
    });
    expect(spec.deltaU).toEqual({ stan: 'wartosc', wartosc: { procent: -3.2 }, zrodloPl: 'profil napięć — bieg rozpływu mocy (run-1)' });
  });

  it('I²t i dobór-selektywność: uczciwy brak_wynikow bez fabrykowanej akcji (dane wejściowe nieosiągalne w tym modelu)', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: undefined, voltageProfileRow: undefined, resultsStale: false,
    });
    expect(spec.iSquaredT.stan).toBe('brak_wynikow');
    expect(spec.doborSelektywnosc.stan).toBe('brak_wynikow');
  });

  it('resultsStale przechodzi 1:1 do specu (świeżość, wzorzec overlay.ts)', () => {
    const spec = buildNnCircuitResultsSections({
      ref: REF, branch: BRANCH, overlayPayload: null, swzResponse: undefined, voltageProfileRow: undefined, resultsStale: true,
    });
    expect(spec.resultsStale).toBe(true);
  });

  it('deterministyczne: to samo wejście → identyczny JSON', () => {
    const params = {
      ref: REF, branch: BRANCH,
      overlayPayload: { run_id: 'run-1', analysis_type: 'LOAD_FLOW', elements: { ap1: { ref_id: 'ap1', kind: 'branch', badges: [], severity: 'INFO', metrics: { I_A: { code: 'I_A', value: 10, unit: 'A' } } } } },
      swzResponse: swzOk(),
      voltageProfileRow: { bus_id: 'b2', delta_pct: 1.1 },
      resultsStale: false,
    };
    const a = buildNnCircuitResultsSections(params);
    const b = buildNnCircuitResultsSections(params);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
