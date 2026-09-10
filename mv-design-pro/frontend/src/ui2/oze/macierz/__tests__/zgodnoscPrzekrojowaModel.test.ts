/*
 * Model sekcji "Zgodność przekrojowa przypadku" (karta W3-D, 2026-09-09).
 * Iloczyn cech stanu (KLASA NIE INSTANCJA): {caseId obecny/brak} ×
 * {ładowanie tak/nie} × {błąd tak/nie} × {wynik brak/der_count=0/der_count>0}.
 */
import { describe, expect, it } from 'vitest';

import type { NcRfgCaseComplianceResponse, NcRfgComplianceReport } from '../../../../ui/ncrfg-tests/api';
import {
  nazwaModuluPrzekrojowego,
  podsumowanieZgodnosciPrzekrojowej,
  rozwiazStanZgodnosciPrzekrojowej,
  testyNiespelnione,
} from '../zgodnoscPrzekrojowaModel';

function raport(over: Partial<NcRfgComplianceReport>): NcRfgComplianceReport {
  return {
    operator_id: 'enea',
    operator_name_pl: 'Enea Operator',
    der_ref: 'pv-1',
    module_type: 'B',
    p_max_kw: 500,
    voltage_kv: 15,
    test_results: [],
    overall_pass: true,
    total_tests: 0,
    passed_count: 0,
    no_module_count: 0,
    ...over,
  };
}

function odpowiedz(over: Partial<NcRfgCaseComplianceResponse>): NcRfgCaseComplianceResponse {
  return {
    case_id: 'case-1',
    operator_id: 'enea',
    der_count: 0,
    reports: [],
    ...over,
  };
}

describe('rozwiazStanZgodnosciPrzekrojowej — iloczyn cech', () => {
  it('brak caseId → brak_przypadku, NIEZALEŻNIE od reszty cech', () => {
    for (const cechy of [
      { ladowanie: false, blad: null, wynik: null },
      { ladowanie: true, blad: null, wynik: null },
      { ladowanie: false, blad: 'X', wynik: null },
      { ladowanie: false, blad: null, wynik: odpowiedz({ der_count: 3 }) },
    ]) {
      expect(rozwiazStanZgodnosciPrzekrojowej({ caseId: null, ...cechy })).toBe('brak_przypadku');
    }
  });

  it('błąd ma pierwszeństwo nad ładowaniem i wynikiem, gdy caseId jest', () => {
    expect(
      rozwiazStanZgodnosciPrzekrojowej({
        caseId: 'case-1',
        ladowanie: true,
        blad: 'sieć padła',
        wynik: null,
      }),
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

  it('brak_der: wynik przyszedł, der_count === 0', () => {
    expect(
      rozwiazStanZgodnosciPrzekrojowej({
        caseId: 'case-1',
        ladowanie: false,
        blad: null,
        wynik: odpowiedz({ der_count: 0 }),
      }),
    ).toBe('brak_der');
  });

  it('gotowe: wynik przyszedł, der_count > 0', () => {
    expect(
      rozwiazStanZgodnosciPrzekrojowej({
        caseId: 'case-1',
        ladowanie: false,
        blad: null,
        wynik: odpowiedz({ der_count: 1, reports: [raport({})] }),
      }),
    ).toBe('gotowe');
  });
});

describe('podsumowanieZgodnosciPrzekrojowej', () => {
  it('liczy zgodne/niezgodne z overall_pass, nie z jakiejkolwiek innej heurystyki', () => {
    const wynik = podsumowanieZgodnosciPrzekrojowej([
      raport({ der_ref: 'pv-1', overall_pass: true }),
      raport({ der_ref: 'bess-1', overall_pass: false }),
      raport({ der_ref: 'fw-1', overall_pass: false }),
    ]);
    expect(wynik).toEqual({ liczbaModulow: 3, zgodne: 1, niezgodne: 2 });
  });

  it('pusta lista raportów → zera, nie null/undefined', () => {
    expect(podsumowanieZgodnosciPrzekrojowej([])).toEqual({
      liczbaModulow: 0,
      zgodne: 0,
      niezgodne: 0,
    });
  });
});

describe('testyNiespelnione', () => {
  it('filtruje WYŁĄCZNIE fail i no_data — pass i no_module nie są "niespełnione"', () => {
    const report = raport({
      test_results: [
        { test_id: 'T3', test_name_pl: 'Droop P(f)', verdict: 'pass', message_pl: null },
        { test_id: 'T4', test_name_pl: 'Q(U)', verdict: 'fail', message_pl: 'Brak krzywej Q(U).' },
        { test_id: 'T5', test_name_pl: 'cos φ', verdict: 'no_data', message_pl: 'Brak danych.' },
        { test_id: 'T1', test_name_pl: 'LVRT', verdict: 'no_module', message_pl: 'Wymaga RMS.' },
      ],
    });
    const wynik = testyNiespelnione(report);
    expect(wynik.map((t) => t.test_id)).toEqual(['T4', 'T5']);
  });

  it('brak testów niespełnionych → pusta lista', () => {
    const report = raport({
      test_results: [{ test_id: 'T3', test_name_pl: 'Droop P(f)', verdict: 'pass', message_pl: null }],
    });
    expect(testyNiespelnione(report)).toEqual([]);
  });
});

describe('nazwaModuluPrzekrojowego', () => {
  it('zwraca nazwę ze słownika, gdy jest wpis', () => {
    expect(nazwaModuluPrzekrojowego('pv-1', { 'pv-1': 'PV Dach A' })).toBe('PV Dach A');
  });

  it('zwraca sam der_ref, gdy słownik nie ma wpisu (uczciwy fallback, nie pusty string)', () => {
    expect(nazwaModuluPrzekrojowego('pv-nieznany', { 'pv-1': 'PV Dach A' })).toBe('pv-nieznany');
  });
});
