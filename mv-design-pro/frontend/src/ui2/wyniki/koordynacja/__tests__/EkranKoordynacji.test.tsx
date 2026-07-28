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

/** Drugi bieg zwarciowy (przypadek minimalny c = 0,95). Od karty F-K4 faza 3b prądy
 *  koordynacji pochodzą WYŁĄCZNIE z biegów, a Ik_min wymaga osobnego przypadku —
 *  wcześniej były losowane w UI (`Math.random()`), więc test nie potrzebował biegów. */
const DONE_SC_RUN_MIN = {
  id: 'run-sc-2',
  analysis_type: 'SC_3F',
  status: 'DONE',
  finished_at: '2026-07-18T10:01:00Z',
  started_at: '2026-07-18T10:00:30Z',
} as never;

/** Wiersz wyniku zwarciowego dla lokalizacji pierwszego urządzenia (`bus_1`). */
function wierszSC(cFactor: number, ikssKa: number) {
  return {
    target_id: 'bus_1',
    element_id: 'bus_1',
    target_name: 'Szyna 1',
    ikss_ka: ikssKa,
    ip_ka: null,
    ith_ka: null,
    sk_mva: null,
    fault_type: '3F',
    flags: [],
    c_factor: cFactor,
  };
}

function ustawKompletnyKontekst() {
  useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
  // Wariant pracy jest potrzebny od V12K-262: z niego pochodzi migawka modelu,
  // czyli lista elementów, w których wolno umieścić zabezpieczenie.
  useAppStateStore.getState().setActiveCase('case-1', 'Wariant bazowy');
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
    // Koordynacja bez prądów z biegów jest zablokowana (F-K4 faza 3b) — dajemy
    // przypadek maksymalny i minimalny, czyli warunki, w których analiza ma sens.
    useExecutionRunsStore.setState({ runs: [DONE_SC_RUN, DONE_SC_RUN_MIN] });

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
      // Prądy koordynacji z realnych biegów (F-K4 faza 3b): przypadek maksymalny
      // z pierwszego biegu, minimalny z drugiego — klasyfikacja po współczynniku c.
      if (url === '/api/analysis-runs/run-sc-1/results/short-circuit') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ run_id: 'run-sc-1', rows: [wierszSC(1.1, 8.4)] }),
        } as Response;
      }
      if (url === '/api/analysis-runs/run-sc-2/results/short-circuit') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ run_id: 'run-sc-2', rows: [wierszSC(0.95, 3.1)] }),
        } as Response;
      }
      // V12K-262: lokalizacja urządzenia pochodzi z MIGAWKI MODELU przypadku;
      // `ref_id` jest tą samą przestrzenią nazw co `element_id` wiersza wyniku.
      if (url === '/api/cases/case-1/enm') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            buses: [{ id: 'b1', ref_id: 'bus_1', name: 'Szyna 1' }],
            branches: [],
            transformers: [],
          }),
        } as Response;
      }
      throw new Error(`Niespodziewane wywołanie fetch: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranKoordynacji />);

    // Realna ścieżka użytkownika: dodaj urządzenie, WSKAŻ element modelu
    // (V12K-262 — ekran nie wymyśla już lokalizacji), zapisz, uruchom analizę.
    await user.click(screen.getByRole('button', { name: 'Dodaj urządzenie' }));
    await user.selectOptions(await screen.findByTestId('device-location-select'), 'bus_1');
    await user.click(screen.getByRole('button', { name: 'Zapisz konfigurację' }));
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

// ---------------------------------------------------------------------------
// Karta F-K5 (dług V12K-189): sekcja nastaw NA EKRANIE, przed selektywnością.
// Test celowo ćwiczy WPIĘCIE (nie sam komponent): bez aktywnego przypadku sekcji
// nie ma czym zapytać, a kolejność „nastawy → selektywność" jest kontraktem flow.
// ---------------------------------------------------------------------------

const NASTAWY_ODPOWIEDZ = {
  run_id: 'protection.overcurrent.v0:e2e',
  case_id: 'case-1',
  analysis_type: 'protection.overcurrent.v0',
  status: 'DEGRADED',
  prezentacja: {
    pozycje: [
      {
        klucz: 'i_inst_50_a',
        etykieta: 'I>> (50) — nastawa bezzwloczna',
        jednostka: 'A',
        wartosc: null,
        stan: 'NIEDOSTEPNA',
        komunikat_pl: 'Niedostepna — uzupelnij dane wejsciowe',
        powod_pl: 'Brak prądu zwarciowego z biegu SC',
        fix_action_id: 'fix_protection_run_short_circuit',
        fix_navigation: { panel: 'analizy' },
      },
    ],
    kompletne: false,
    brakujace: ['i_inst_50_a'],
    kody_gotowosci: ['protection.fault_current_missing'],
    podsumowanie_pl: 'Niedostepne nastawy: 1 z 4',
  },
};

describe('EkranKoordynacji — nastawy z analizy (karta F-K5)', () => {
  it('z aktywnym przypadkiem sekcja nastaw jest na ekranie PRZED stroną selektywności', async () => {
    ustawKompletnyKontekst();
    useAppStateStore.getState().setActiveCase('case-1', 'Warian bazowy');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith('/api/protection/overcurrent-settings')) {
          return { ok: true, status: 200, json: async () => NASTAWY_ODPOWIEDZ } as Response;
        }
        // Strona selektywności ma własne wywołania — dla tego testu nieistotne.
        return { ok: true, status: 200, json: async () => ({ rows: [] }) } as Response;
      }),
    );

    render(<EkranKoordynacji />);

    const sekcja = await screen.findByTestId('mvd-koordynacja-nastawy');
    const strona = screen.getByTestId('mvd-koordynacja-strona');
    // Kolejność w DOM = kolejność pracy inżyniera: najpierw nastawy, potem selektywność.
    expect(sekcja.compareDocumentPosition(strona) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sekcja.textContent).toContain('Niedostepna');
    vi.unstubAllGlobals();
  });

  it('bez aktywnego przypadku sekcja nastaw się nie renderuje (nie ma czym zapytać)', () => {
    // Kontekst kompletny POZA wariantem pracy — `ustawKompletnyKontekst` ustawia go
    // od V12K-262 (migawka modelu), więc ten test musi go jawnie zdjąć: sprawdza
    // dokładnie stan „projekt jest, przypadku nie ma".
    ustawKompletnyKontekst();
    useAppStateStore.setState({ activeCaseId: null } as never);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranKoordynacji />);

    expect(screen.queryByTestId('mvd-koordynacja-nastawy')).toBeNull();
    expect(screen.queryByTestId('mvd-koordynacja-nastawy-ladowanie')).toBeNull();
    const wywolaniaNastaw = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith('/api/protection/overcurrent-settings'),
    );
    expect(wywolaniaNastaw).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
