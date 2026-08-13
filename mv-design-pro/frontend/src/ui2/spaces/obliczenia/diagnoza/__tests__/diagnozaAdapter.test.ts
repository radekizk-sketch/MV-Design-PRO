/*
 * Adapter powierzchni „Diagnoza przebiegu" — kontrakt tras i wybór biegu.
 *
 * KONTRAKT DWUSTRONNY. Pola konsumowane przez UI muszą być PODZBIOREM pól
 * wystawianych przez backend. Zbiór wystawiany jest tu przypięty do kształtu,
 * który pytest weryfikuje na ŻYWEJ odpowiedzi
 * (`backend/tests/api/test_diagnoza_przebiegu_api.py::
 * test_diagnoza_biegu_wystawia_zamkniety_zestaw_pol` — asercja równościowa na
 * realnym biegu sieci golden). Dzięki temu para testów zamyka pętlę: tamten
 * pilnuje, że backend NAPRAWDĘ zwraca ten zestaw, ten — że UI nie sięga poza
 * niego (typowa droga do pola-widma, którego backend nigdy nie przysłał).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { emituj } from '../../../../events/bus';
import { najnowszyBieg, useDaneDiagnozy } from '../adapters/diagnozaAdapter';
import {
  diagnostykaFixture,
  diagnozaZbieznaFixture,
  preflightFixture,
} from './fixtures';

/**
 * Pola wystawiane przez `GET /api/execution/runs/{run_id}/diagnostics`.
 * Lustro asercji pytest — zmiana kontraktu czerwieni OBA testy.
 */
const POLA_WYSTAWIANE_DIAGNOZA = [
  'run_id',
  'case_id',
  'analysis_type',
  'run_status',
  'iterative',
  'code',
  'converged',
  'iterations_count',
  'max_iterations',
  'tolerance',
  'final_mismatch_pu',
  'cause_if_failed',
  'unsolved_node_ids',
  'reporting_limitations',
  'quality_status',
  'error_message',
  'iteration_history',
] as const;

/** Pola wystawiane przez `PreflightReport.to_dict`. */
const POLA_WYSTAWIANE_PREFLIGHT = [
  'ready',
  'overall_status',
  'checks',
  'blocker_count',
  'warning_count',
] as const;

/** Pola wystawiane przez `DiagnosticReport.to_dict`. */
const POLA_WYSTAWIANE_DIAGNOSTYKA = [
  'status',
  'issues',
  'analysis_matrix',
  'blocker_count',
  'warning_count',
  'info_count',
] as const;

const fetchMock = vi.fn();

function odpowiedz(dane: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => dane };
}

function ustawOdpowiedziPoprawne() {
  fetchMock.mockImplementation((adres: string) => {
    if (adres.includes('/diagnostics/preflight')) {
      return Promise.resolve(odpowiedz(preflightFixture()));
    }
    if (adres.includes('/execution/runs/')) {
      return Promise.resolve(odpowiedz(diagnozaZbieznaFixture()));
    }
    return Promise.resolve(odpowiedz(diagnostykaFixture()));
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  ustawOdpowiedziPoprawne();
  useExecutionRunsStore.setState({
    activeStudyCaseId: 'K1',
    activeRunId: null,
    runStatus: null,
    runs: [
      { id: 'run-nowy', study_case_id: 'K1', analysis_type: 'LOAD_FLOW', solver_input_hash: 'h1', status: 'DONE', started_at: null, finished_at: null, error_message: null },
      { id: 'run-stary', study_case_id: 'K1', analysis_type: 'SC_3F', solver_input_hash: 'h2', status: 'DONE', started_at: null, finished_at: null, error_message: null },
    ],
    isLoadingRuns: false,
    runError: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kontrakt tras — konsumowane ⊆ wystawiane', () => {
  it('adapter czyta z diagnozy biegu wyłącznie pola wystawiane przez backend', async () => {
    const { result } = renderHook(() => useDaneDiagnozy());
    await waitFor(() => expect(result.current.stan).toBe('gotowe'));

    const konsumowane = Object.keys(result.current.diagnoza ?? {});
    expect(konsumowane.length).toBeGreaterThan(0);
    for (const pole of konsumowane) {
      expect(POLA_WYSTAWIANE_DIAGNOZA).toContain(pole);
    }
  });

  it('adapter czyta z pre-flight i diagnostyki wyłącznie pola wystawiane', async () => {
    const { result } = renderHook(() => useDaneDiagnozy());
    await waitFor(() => expect(result.current.stan).toBe('gotowe'));

    for (const pole of Object.keys(result.current.preflight ?? {})) {
      expect(POLA_WYSTAWIANE_PREFLIGHT).toContain(pole);
    }
    for (const pole of Object.keys(result.current.diagnostyka ?? {})) {
      expect(POLA_WYSTAWIANE_DIAGNOSTYKA).toContain(pole);
    }
  });

  it('woła dokładnie trzy zmierzone adresy końcówek', async () => {
    const { result } = renderHook(() => useDaneDiagnozy());
    await waitFor(() => expect(result.current.stan).toBe('gotowe'));

    const adresy = fetchMock.mock.calls.map((wywolanie) => wywolanie[0] as string);
    expect(adresy).toContain('/api/cases/K1/diagnostics/preflight');
    expect(adresy).toContain('/api/cases/K1/diagnostics');
    expect(adresy).toContain('/api/execution/runs/run-nowy/diagnostics');
  });
});

describe('wybór diagnozowanego biegu', () => {
  it('bierze pierwszy bieg listy — repozytorium sortuje od najnowszego', () => {
    expect(najnowszyBieg([{ id: 'a' }, { id: 'b' }])).toBe('a');
  });

  it('brak biegów to brak wyboru, nie wybór pusty', () => {
    expect(najnowszyBieg([])).toBeNull();
  });

  it('przypadek bez biegów: pre-flight jest, diagnoza biegu jest pusta', async () => {
    useExecutionRunsStore.setState({ runs: [] });

    const { result } = renderHook(() => useDaneDiagnozy());
    await waitFor(() => expect(result.current.stan).toBe('gotowe'));

    expect(result.current.diagnoza).toBeNull();
    expect(result.current.preflight).not.toBeNull();
    const adresy = fetchMock.mock.calls.map((wywolanie) => wywolanie[0] as string);
    expect(adresy.some((adres) => adres.includes('/execution/runs/'))).toBe(false);
  });
});

describe('stany adaptera', () => {
  it('brak aktywnego przypadku nie woła backendu', async () => {
    useExecutionRunsStore.setState({ activeStudyCaseId: null, runs: [] });

    const { result } = renderHook(() => useDaneDiagnozy());

    await waitFor(() => expect(result.current.stan).toBe('brak-przypadku'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('błąd którejkolwiek końcówki daje uczciwy stan błędu, nie połowiczne dane', async () => {
    fetchMock.mockImplementation((adres: string) => {
      if (adres.includes('/execution/runs/')) {
        return Promise.resolve({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) });
      }
      return Promise.resolve(odpowiedz(preflightFixture()));
    });

    const { result } = renderHook(() => useDaneDiagnozy());

    await waitFor(() => expect(result.current.stan).toBe('blad'));
    expect(result.current.preflight).toBeNull();
    expect(result.current.diagnoza).toBeNull();
  });

  it('ponowienie po błędzie realnie pobiera dane jeszcze raz', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) }),
    );
    const { result } = renderHook(() => useDaneDiagnozy());
    await waitFor(() => expect(result.current.stan).toBe('blad'));

    ustawOdpowiedziPoprawne();
    act(() => result.current.odswiez());

    await waitFor(() => expect(result.current.stan).toBe('gotowe'));
    expect(result.current.diagnoza?.code).toBe('PRZ-ZBIEZNY');
  });
});

describe('reakcja na magistralę zdarzeń', () => {
  it('nowe wyniki śledzonego przypadku odświeżają diagnozę', async () => {
    const { result } = renderHook(() => useDaneDiagnozy());
    await waitFor(() => expect(result.current.stan).toBe('gotowe'));
    const przed = fetchMock.mock.calls.length;

    act(() => {
      emituj({ typ: 'wyniki-gotowe', przypadekId: 'K1', runId: 'run-nowy' });
    });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(przed));
  });

  it('wyniki INNEGO przypadku nie odświeżają tej powierzchni', async () => {
    const { result } = renderHook(() => useDaneDiagnozy());
    await waitFor(() => expect(result.current.stan).toBe('gotowe'));
    const przed = fetchMock.mock.calls.length;

    act(() => {
      emituj({ typ: 'wyniki-gotowe', przypadekId: 'INNY', runId: 'run-x' });
    });

    await waitFor(() => expect(result.current.stan).toBe('gotowe'));
    expect(fetchMock.mock.calls.length).toBe(przed);
  });

  it('zmiana modelu odświeża kontrolę przed obliczeniem (opisuje model BIEŻĄCY)', async () => {
    const { result } = renderHook(() => useDaneDiagnozy());
    await waitFor(() => expect(result.current.stan).toBe('gotowe'));
    const przed = fetchMock.mock.calls.length;

    act(() => {
      emituj({ typ: 'wyniki-niewazne', przyczyna: 'model-zmieniony', rev: 7 });
    });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(przed));
  });
});
