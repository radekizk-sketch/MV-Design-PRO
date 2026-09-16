/*
 * Model sekcji "Zgodność przekrojowa przypadku" (karta S-3, 2026-09-16 — jeden tor
 * NC RfG). Iloczyn cech stanu (KLASA NIE INSTANCJA): {caseId obecny/brak} ×
 * {ładowanie tak/nie} × {błąd tak/nie} × {wynik brak / der_count=0 bez pominiętych /
 * der_count=0 z pominiętymi / der_count>0}; wiersze i liczniki przez JEDEN model
 * werdyktu macierzy (`macierzModel.ts`), nie drugi.
 */
import { describe, expect, it } from 'vitest';

import type {
  NcRfgCaseComplianceResponse,
  NcRfgModuleResult,
  NcRfgRunResult,
  NcRfgTestResult,
} from '../../../../ui/ncrfg-tests/api';
import {
  brakiZgodnosciPrzekrojowej,
  nazwaModuluPrzekrojowego,
  podsumowanieZgodnosciPrzekrojowej,
  rozwiazStanZgodnosciPrzekrojowej,
  stopienDowodowyModulu,
  wierszeZgodnosciPrzekrojowej,
} from '../zgodnoscPrzekrojowaModel';

function test(over: Partial<NcRfgTestResult>): NcRfgTestResult {
  return {
    test_id: 'T14',
    ability_pl: 'LVRT',
    required: true,
    required_reason_pl: 'Wymagany dla modułu typu B.',
    verdict: 'pass',
    summary_pl: 'LVRT: margines 0 p.u.',
    metrics: {},
    trace_refs: [],
    fix_actions: [],
    ...over,
  };
}

function modul(over: Partial<NcRfgModuleResult>): NcRfgModuleResult {
  return {
    der_ref: 'pv-1',
    der_name: 'PV z biegu',
    operator_id: 'enea',
    operator_name_pl: 'Enea Operator',
    module_type: 'B',
    module_family: 'PPM',
    p_max_kw: 1935,
    voltage_kv: 15,
    required_count: 2,
    pass_count: 2,
    fail_count: 0,
    no_data_count: 0,
    not_required_count: 18,
    overall_status: 'zgodny',
    tests: [],
    ...over,
  };
}

function bieg(modules: NcRfgModuleResult[], over: Partial<NcRfgRunResult> = {}): NcRfgRunResult {
  return {
    contract: 'NcRfgPtpireeTestResultV1',
    procedure_version: 'PTPiREE Procedura testowania v3.0',
    solver_version: 'ncrfg-ptpiree-whitebox-1.0',
    input_hash: 'in',
    deterministic_hash: 'det',
    modules,
    certificate_evidence: [],
    reporting_status: 'reportable',
    proof_status: 'complete',
    evidence_limitations: [],
    evidence_note_pl: '',
    evidence_per_module: {},
    evidence_by_test: {},
    test_catalog: [],
    white_box_trace: [],
    report_pl: '',
    ...over,
  };
}

function odpowiedz(over: Partial<NcRfgCaseComplianceResponse>): NcRfgCaseComplianceResponse {
  return {
    case_id: 'case-1',
    operator_id: 'enea',
    der_count: 0,
    pominiete: [],
    bieg: null,
    ...over,
  };
}

describe('rozwiazStanZgodnosciPrzekrojowej — iloczyn cech', () => {
  it('brak caseId → brak_przypadku, NIEZALEŻNIE od reszty cech', () => {
    for (const cechy of [
      { ladowanie: false, blad: null, wynik: null },
      { ladowanie: true, blad: null, wynik: null },
      { ladowanie: false, blad: 'X', wynik: null },
      { ladowanie: false, blad: null, wynik: odpowiedz({ der_count: 3, bieg: bieg([modul({})]) }) },
    ]) {
      expect(rozwiazStanZgodnosciPrzekrojowej({ caseId: null, ...cechy })).toBe('brak_przypadku');
    }
  });

  it('błąd ma pierwszeństwo nad ładowaniem i wynikiem, gdy caseId jest', () => {
    expect(
      rozwiazStanZgodnosciPrzekrojowej({ caseId: 'case-1', ladowanie: true, blad: 'sieć padła', wynik: null }),
    ).toBe('blad');
    expect(
      rozwiazStanZgodnosciPrzekrojowej({
        caseId: 'case-1',
        ladowanie: false,
        blad: 'sieć padła',
        wynik: odpowiedz({ der_count: 2 }),
      }),
    ).toBe('blad');
  });

  it('ładowanie: trwa albo wynik jeszcze nie przyszedł (pierwszy render)', () => {
    expect(
      rozwiazStanZgodnosciPrzekrojowej({ caseId: 'case-1', ladowanie: true, blad: null, wynik: null }),
    ).toBe('ladowanie');
    expect(
      rozwiazStanZgodnosciPrzekrojowej({ caseId: 'case-1', ladowanie: false, blad: null, wynik: null }),
    ).toBe('ladowanie');
  });

  it('brak_der: solver nikogo nie objął I backend nikogo nie pominął', () => {
    expect(
      rozwiazStanZgodnosciPrzekrojowej({
        caseId: 'case-1',
        ladowanie: false,
        blad: null,
        wynik: odpowiedz({ der_count: 0, pominiete: [], bieg: null }),
      }),
    ).toBe('brak_der');
  });

  it('gotowe: der_count=0, ale są DER pominięte z powodem — to treść, nie stan zerowy', () => {
    expect(
      rozwiazStanZgodnosciPrzekrojowej({
        caseId: 'case-1',
        ladowanie: false,
        blad: null,
        wynik: odpowiedz({
          der_count: 0,
          pominiete: [{ der_ref: 'pv-0', der_name: 'PV 0 MW', powod: 'brak_mocy', powod_pl: 'Moc nie jest dodatnia.' }],
          bieg: null,
        }),
      }),
    ).toBe('gotowe');
  });

  it('gotowe: bieg przyszedł, der_count > 0', () => {
    expect(
      rozwiazStanZgodnosciPrzekrojowej({
        caseId: 'case-1',
        ladowanie: false,
        blad: null,
        wynik: odpowiedz({ der_count: 1, bieg: bieg([modul({})]) }),
      }),
    ).toBe('gotowe');
  });
});

describe('wierszeZgodnosciPrzekrojowej + podsumowanieZgodnosciPrzekrojowej — jeden model werdyktu', () => {
  it('moduły objęte biegiem w kolejności solvera, potem pominięte jako zablokowane (brak danych)', () => {
    const wynik = odpowiedz({
      der_count: 3,
      bieg: bieg([
        modul({ der_ref: 'pv-1', overall_status: 'zgodny', required_count: 8, pass_count: 8 }),
        modul({ der_ref: 'bess-1', overall_status: 'niezgodny', required_count: 8, pass_count: 6, fail_count: 2 }),
        modul({ der_ref: 'fw-1', overall_status: 'brak_danych', required_count: 8, pass_count: 3, no_data_count: 5 }),
      ]),
      pominiete: [{ der_ref: 'pv-0', der_name: 'PV bez mocy', powod: 'brak_mocy', powod_pl: 'Moc nie jest dodatnia.' }],
    });
    const wiersze = wierszeZgodnosciPrzekrojowej(wynik, { 'pv-1': 'PV Dach A' });
    expect(wiersze.map((w) => [w.derRef, w.nazwa, w.overallStatus, w.zablokowany])).toEqual([
      ['pv-1', 'PV Dach A', 'zgodny', false],
      ['bess-1', 'PV z biegu', 'niezgodny', false],
      ['fw-1', 'PV z biegu', 'brak_danych', false],
      ['pv-0', 'PV bez mocy', 'brak_danych', true],
    ]);
    expect(podsumowanieZgodnosciPrzekrojowej(wiersze)).toEqual({
      liczbaModulow: 4,
      zgodne: 1,
      niezgodne: 1,
      brakDanych: 2,
      wymaganeRazem: 24,
      spelnioneRazem: 17,
    });
  });

  it('bieg null + pominięte → wyłącznie wiersze zablokowane z zerowymi licznikami', () => {
    const wynik = odpowiedz({
      der_count: 0,
      bieg: null,
      pominiete: [
        { der_ref: 'a', der_name: null, powod: 'brak_napiecia', powod_pl: 'Brak szyny.' },
        { der_ref: 'b', der_name: 'B', powod: 'brak_mocy', powod_pl: 'Brak mocy.' },
      ],
    });
    const wiersze = wierszeZgodnosciPrzekrojowej(wynik, {});
    expect(wiersze.map((w) => [w.derRef, w.nazwa, w.zablokowany, w.requiredCount])).toEqual([
      ['a', 'a', true, 0],
      ['b', 'B', true, 0],
    ]);
    expect(podsumowanieZgodnosciPrzekrojowej(wiersze)).toEqual({
      liczbaModulow: 2,
      zgodne: 0,
      niezgodne: 0,
      brakDanych: 2,
      wymaganeRazem: 0,
      spelnioneRazem: 0,
    });
  });

  it('pusta lista wierszy → zera, nie null/undefined', () => {
    expect(podsumowanieZgodnosciPrzekrojowej([])).toEqual({
      liczbaModulow: 0,
      zgodne: 0,
      niezgodne: 0,
      brakDanych: 0,
      wymaganeRazem: 0,
      spelnioneRazem: 0,
    });
  });
});

describe('brakiZgodnosciPrzekrojowej — testy WYMAGANE z werdyktem fail/no_data', () => {
  it('filtruje pass i not_required oraz fail testu NIEwymaganego (spójnie z licznikami solvera)', () => {
    const b = bieg([
      modul({
        der_ref: 'bess-1',
        tests: [
          test({ test_id: 'T05', verdict: 'pass' }),
          test({ test_id: 'T09', verdict: 'fail', ability_pl: 'Zdolność Q' }),
          test({ test_id: 'T16', verdict: 'no_data', ability_pl: 'Odbudowa P', fix_actions: ['Uzupełnij czas odbudowy P.'] }),
          test({ test_id: 'T04', verdict: 'fail', required: false }),
          test({ test_id: 'T18', verdict: 'not_required', required: false }),
        ],
      }),
      modul({ der_ref: 'pv-1', tests: [test({ test_id: 'T05', verdict: 'pass' })] }),
    ]);
    const braki = brakiZgodnosciPrzekrojowej(b, { 'bess-1': 'Magazyn 1' });
    expect(braki.map((x) => [x.derRef, x.nazwa, x.testy.map((t) => t.test_id)])).toEqual([
      ['bess-1', 'Magazyn 1', ['T09', 'T16']],
    ]);
  });

  it('brak biegu → pusta lista', () => {
    expect(brakiZgodnosciPrzekrojowej(null, {})).toEqual([]);
  });
});

describe('stopienDowodowyModulu / nazwaModuluPrzekrojowego', () => {
  it('czyta reporting_status z evidence_per_module biegu; brak oceny = null (nie „w porządku")', () => {
    const b = bieg([modul({})], {
      evidence_per_module: {
        'pv-1': {
          der_ref: 'pv-1',
          reporting_status: 'not_reportable',
          proof_status: 'incomplete',
          evidence_limitations: ['T14:UNVALIDATED_MODEL'],
          evidence_note_pl: 'Brak dowodu dla testów: T14:UNVALIDATED_MODEL.',
        },
      },
    });
    expect(stopienDowodowyModulu(b, 'pv-1')).toBe('not_reportable');
    expect(stopienDowodowyModulu(b, 'nieznany')).toBeNull();
    expect(stopienDowodowyModulu(null, 'pv-1')).toBeNull();
  });

  it('nazwa: słownik macierzy › der_name biegu › sam der_ref', () => {
    expect(nazwaModuluPrzekrojowego('pv-1', 'PV z biegu', { 'pv-1': 'PV Dach A' })).toBe('PV Dach A');
    expect(nazwaModuluPrzekrojowego('pv-1', 'PV z biegu', {})).toBe('PV z biegu');
    expect(nazwaModuluPrzekrojowego('pv-nieznany', null, { 'pv-1': 'PV Dach A' })).toBe('pv-nieznany');
  });
});
