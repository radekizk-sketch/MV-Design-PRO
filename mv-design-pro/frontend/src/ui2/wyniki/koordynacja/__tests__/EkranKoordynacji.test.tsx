/**
 * Testy ekranu „Koordynacja zabezpieczeń" (rama prowadząca F-E5b).
 * Kliki natywne (userEvent). Test przebiegu analizy mockuje `fetch` 1:1 z
 * kontraktem `protection-coordination/api.ts` (POST .../projects/:id/run,
 * GET .../:runId) — bez fabrykacji danych po stronie ekranu.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import type { CoordinationResult, CoordinationSummaryResponse } from '../../../../ui/protection-coordination/types';
import { EkranKoordynacji } from '../EkranKoordynacji';
import { KOORDYNACJA_STRINGS as T } from '../strings';

const DONE_SC_RUN = {
  id: 'run-sc-1',
  analysis_type: 'SC_3F',
  status: 'DONE',
  finished_at: '2026-07-18T10:00:00Z',
  started_at: '2026-07-18T09:59:00Z',
} as never;

function ustawKompletnyKontekst() {
  useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
  useExecutionRunsStore.setState({ runs: [DONE_SC_RUN] });
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EkranKoordynacji — rama prowadząca', () => {
  it('nagłówek: eyebrow obszaru i zdanie celu inżynierskiego', () => {
    render(<EkranKoordynacji />);
    expect(screen.getByText(T.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(T.cel)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-koordynacja')).toBeInTheDocument();
  });

  it('rama jest obecna niezależnie od stanu wejścia', () => {
    render(<EkranKoordynacji />);
    expect(screen.getByTestId('mvd-koordynacja')).toBeInTheDocument();
  });
});

describe('EkranKoordynacji — uczciwe stany zerowe z akcją', () => {
  it('bez aktywnego projektu: instrukcja + akcja prowadzi do przestrzeni Projekt', async () => {
    const user = userEvent.setup();
    render(<EkranKoordynacji />);

    expect(screen.getByTestId('mvd-koordynacja-brak-projektu')).toBeInTheDocument();
    expect(screen.getByText(T.brakProjektuTytul)).toBeInTheDocument();
    // Brak pustej tabeli — realna strona się nie renderuje.
    expect(screen.queryByTestId('protection-coordination-page')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-koordynacja-brak-projektu-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('brak projektu ma pierwszeństwo nad brakiem przebiegu zwarciowego', () => {
    useExecutionRunsStore.setState({ runs: [DONE_SC_RUN] });
    render(<EkranKoordynacji />);
    expect(screen.getByTestId('mvd-koordynacja-brak-projektu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-brak-zwarcia')).not.toBeInTheDocument();
  });

  it('projekt bez zakończonego przebiegu zwarciowego: akcja prowadzi do Obliczeń', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    render(<EkranKoordynacji />);

    expect(screen.getByTestId('mvd-koordynacja-brak-zwarcia')).toBeInTheDocument();
    expect(screen.queryByTestId('protection-coordination-page')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-koordynacja-brak-zwarcia-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('projekt z przebiegiem rozpływowym (nie zwarciowym) nadal pokazuje stan zerowy zwarcia', () => {
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    useExecutionRunsStore.setState({
      runs: [{ id: 'run-lf', analysis_type: 'LOAD_FLOW', status: 'DONE', finished_at: null, started_at: null } as never],
    });
    render(<EkranKoordynacji />);
    expect(screen.getByTestId('mvd-koordynacja-brak-zwarcia')).toBeInTheDocument();
  });
});

describe('EkranKoordynacji — realna strona przy kompletnym kontekście', () => {
  it('projekt + zakończony przebieg zwarciowy → renderuje ProtectionCoordinationPage', () => {
    ustawKompletnyKontekst();
    render(<EkranKoordynacji />);

    expect(screen.getByTestId('protection-coordination-page')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-brak-projektu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-brak-zwarcia')).not.toBeInTheDocument();
  });

  it('przebieg analizy koordynacji woła API 1:1 z kontraktem api.ts (POST run + GET wynik)', async () => {
    const user = userEvent.setup();
    ustawKompletnyKontekst();

    const summary: CoordinationSummaryResponse = {
      run_id: 'coord-run-1',
      project_id: 'project-1',
      overall_verdict: 'PASS',
      overall_verdict_pl: 'Pozytywny',
      total_devices: 1,
      total_checks: 1,
      sensitivity_pass: 1,
      sensitivity_fail: 0,
      selectivity_pass: 1,
      selectivity_fail: 0,
      overload_pass: 1,
    } as CoordinationSummaryResponse;

    const result: CoordinationResult = {
      run_id: 'coord-run-1',
      project_id: 'project-1',
      sensitivity_checks: [],
      selectivity_checks: [],
      overload_checks: [],
      tcc_curves: [],
      fault_markers: [],
      overall_verdict: 'PASS',
      summary: {
        total_devices: 1,
        total_checks: 1,
        sensitivity: { pass: 1, marginal: 0, fail: 0, error: 0 },
        selectivity: { pass: 1, marginal: 0, fail: 0, error: 0 },
        overload: { pass: 1, marginal: 0, fail: 0, error: 0 },
        overall_verdict: 'PASS',
        overall_verdict_pl: 'Pozytywny',
      },
      trace_steps: [],
      created_at: '2026-07-18T10:05:00Z',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/protection-coordination/projects/project-1/run' && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => summary } as Response;
      }
      if (url === '/api/protection-coordination/coord-run-1') {
        return { ok: true, status: 200, json: async () => result } as Response;
      }
      throw new Error(`Niespodziewane wywołanie fetch: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranKoordynacji />);

    // Realna ścieżka użytkownika: dodaj urządzenie, uruchom analizę.
    await user.click(screen.getByRole('button', { name: 'Dodaj urządzenie' }));
    await user.click(screen.getByTestId('run-analysis-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/protection-coordination/projects/project-1/run',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/protection-coordination/coord-run-1');
    });

    // Ciało POST jest zgodne z RunCoordinationRequest (devices niepuste).
    const postCall = fetchMock.mock.calls.find(
      ([u]) => String(u) === '/api/protection-coordination/projects/project-1/run',
    );
    const body = JSON.parse((postCall?.[1] as RequestInit).body as string);
    expect(Array.isArray(body.devices)).toBe(true);
    expect(body.devices.length).toBeGreaterThan(0);
  });
});
