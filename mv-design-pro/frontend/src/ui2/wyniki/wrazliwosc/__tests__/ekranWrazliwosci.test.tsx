/*
 * Testy okna „Wrażliwość" (ROUTERY-4A — zdolność A6/A17 macierzy pokrycia).
 * Iloczyn cech: stan (brak przebiegu / pełny / błąd) × sekcja (LF / ogólna) ×
 * tryb (podstawowy / ekspercki). Ścieżka realna: rejestr przebiegów
 * (`useExecutionRunsStore`) + globalny `fetch` na kontrakcie końcówki
 * `GET /api/insights/sensitivity` (klient `api.ts` ćwiczony naprawdę,
 * bez mockowania modułu).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EkranWrazliwosci } from '../EkranWrazliwosci';
import { WRAZLIWOSC_STRINGS } from '../strings';
import type { WrazliwoscResponse } from '../api';
import { useAppStateStore } from '../../../../ui/app-state/store';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';

function przebieg(
  id: string,
  analysisType: ExecutionRun['analysis_type'],
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'hash',
    status,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}

const ODPOWIEDZ: WrazliwoscResponse = {
  analysis_id: 'aid-1',
  context: {
    project_name: 'Projekt SN',
    case_id: 'case-1',
    run_timestamp: '2026-08-07T00:00:00Z',
    snapshot_hash: 'deadbeef',
    run_id: 'pf-1',
  },
  lf: {
    analysis_id: 'lf-1',
    delta_pct: 5.0,
    entries: [
      {
        bus_id: 'wezel-a',
        base_delta_pct: -1.1,
        threshold_warn_pct: 5.0,
        threshold_fail_pct: 10.0,
        drivers: [],
        missing_data: [],
      },
    ],
    summary: { total_entries: 1, not_computed_count: 0 },
    top_drivers: [
      {
        bus_id: 'wezel-a',
        parameter: 'U_n',
        perturbation: '-5.0%',
        delta_delta_pct: 0.121,
        delta_margin_pct: 0.121,
        why_pl:
          'Wpływ napięcia znamionowego z dowodu spadków napięć rozpływu; '
          + 'margines względem progu: ostrzeżenie.',
      },
    ],
  },
  ogolna: {
    analysis_id: 'og-1',
    delta_pct: 5.0,
    entries: [
      {
        parameter_id: 'voltage_limit',
        parameter_label: 'Voltage limits',
        target_id: 'wezel-a',
        source: 'P21',
        base_margin: 3.9,
        margin_unit: '%',
        base_decision: 'PASS',
        minus: { delta_pct: -5.0, margin: 3.95, delta_margin: 0.05, decision: 'PASS' },
        plus: { delta_pct: 5.0, margin: 3.84, delta_margin: -0.06, decision: 'PASS' },
      },
    ],
    summary: { total_entries: 1, not_computed_count: 0 },
  },
  wezly: { 'wezel-a': { name: 'Szyna SN', u_nom_kv: 15.0 } },
  pominiete_zrodla_pl: ['raport normatywny (żadna reguła rejestru nie czyta dowodu)'],
};

function mockFetchTrasowany(odpowiedz: WrazliwoscResponse) {
  const spy = vi.fn((url: RequestInfo | URL) => {
    const adres = String(url);
    if (adres.startsWith('/api/insights/sensitivity')) {
      return Promise.resolve({ ok: true, json: async () => odpowiedz } as Response);
    }
    // Kontrakt przebiegu (świeżość) — brak danych to brak znacznika, nie awaria.
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' } as Response);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  useAppStateStore.setState({ activeRunId: null });
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EkranWrazliwosci — stany', () => {
  it('bez przebiegu rozpływu: uczciwy stan zerowy z akcją, bez wołania końcówki', () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    useExecutionRunsStore.setState({ runs: [przebieg('sc-1', 'SC_3F')], activeRunId: null });
    render(<EkranWrazliwosci trybZaawansowania="expert" />);
    expect(screen.getByTestId('mvd-wrazliwosc-brak-przebiegu')).toHaveTextContent(
      WRAZLIWOSC_STRINGS.brakPrzebiegu,
    );
    const wolaniaInsights = spy.mock.calls.filter((c) =>
      String(c[0]).includes('/api/insights/'),
    );
    expect(wolaniaInsights).toHaveLength(0);
  });

  it('błąd pobierania: komunikat PL z treścią błędu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal' } as Response),
    );
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')], activeRunId: null });
    render(<EkranWrazliwosci trybZaawansowania="expert" />);
    expect(await screen.findByTestId('mvd-wrazliwosc-blad')).toHaveTextContent(
      WRAZLIWOSC_STRINGS.blad,
    );
  });

  it('przebieg NIEZAKOŃCZONY nie jest dobierany (stan zerowy)', () => {
    vi.stubGlobal('fetch', vi.fn());
    useExecutionRunsStore.setState({
      runs: [przebieg('pf-1', 'LOAD_FLOW', 'RUNNING')],
      activeRunId: null,
    });
    render(<EkranWrazliwosci trybZaawansowania="expert" />);
    expect(screen.getByTestId('mvd-wrazliwosc-brak-przebiegu')).toBeTruthy();
  });
});

describe('EkranWrazliwosci — wynik', () => {
  it('renderuje obie sekcje z danymi backendu (LF + ogólna)', async () => {
    const spy = mockFetchTrasowany(ODPOWIEDZ);
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')], activeRunId: null });
    render(<EkranWrazliwosci trybZaawansowania="expert" />);
    await waitFor(() => {
      expect(screen.getByTestId('mvd-wrazliwosc-lf')).toBeTruthy();
      expect(screen.getByTestId('mvd-wrazliwosc-ogolna')).toBeTruthy();
    });
    // Końcówka wołana identyfikatorem dobranego przebiegu rozpływu.
    expect(
      spy.mock.calls.some((c) => String(c[0]).includes('run_id=pf-1')),
    ).toBe(true);
    // Wiersz rankingu LF: nazwa szyny z mapy węzłów (nie surowy identyfikator).
    expect(screen.getAllByText('Szyna SN').length).toBeGreaterThan(0);
    // Interpretacja why_pl z backendu, po polsku.
    expect(
      screen.getByText(/Wpływ napięcia znamionowego z dowodu spadków napięć/),
    ).toBeTruthy();
    // Kryterium ogólne przetłumaczone na PL (nie surowe parameter_id/source).
    expect(screen.getByText('Odchyłka napięcia węzła')).toBeTruthy();
    expect(screen.queryByText('P21')).toBeNull();
    // Uczciwa deklaracja pominiętych źródeł.
    expect(screen.getByTestId('mvd-wrazliwosc-pominiete')).toHaveTextContent(
      'raport normatywny',
    );
  });

  it('tryb podstawowy ukrywa kolumny identyfikatorów (tylkoEkspercki)', async () => {
    mockFetchTrasowany(ODPOWIEDZ);
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')], activeRunId: null });
    render(<EkranWrazliwosci trybZaawansowania="basic" />);
    await waitFor(() => expect(screen.getByTestId('mvd-wrazliwosc-lf')).toBeTruthy());
    expect(screen.queryByText('wezel-a')).toBeNull();
  });

  it('tryb ekspercki pokazuje identyfikator węzła', async () => {
    mockFetchTrasowany(ODPOWIEDZ);
    useExecutionRunsStore.setState({ runs: [przebieg('pf-1', 'LOAD_FLOW')], activeRunId: null });
    render(<EkranWrazliwosci trybZaawansowania="expert" />);
    await waitFor(() => expect(screen.getByTestId('mvd-wrazliwosc-lf')).toBeTruthy());
    expect(screen.getAllByText('wezel-a').length).toBeGreaterThan(0);
  });
});
