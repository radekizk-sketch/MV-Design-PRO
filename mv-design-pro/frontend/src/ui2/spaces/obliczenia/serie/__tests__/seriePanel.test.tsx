/**
 * Testy panelu „Serie przebiegów" (karta BATCH-ROUTER).
 *
 * INTENCJA: powierzchnia serii działa na REALNYCH końcówkach
 * `/api/execution/study-cases/{id}/batches` + `/api/execution/batches/{id}/
 * execute` — asercje idą przeciwko TREŚCI ŻĄDAŃ (co backend dostaje), nie
 * tylko przeciwko napisom. Kliki natywne (userEvent) — Zero-Debt pkt 5.
 * Stany zerowe uczciwe: brak przypadku / brak scenariuszy (z realną akcją) /
 * brak serii. Wejście w wyniki biegu wyłącznie jawnym klikiem (S9-11).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useFaultScenariosStore } from '../../../../../ui/fault-scenarios/store';
import { useBatchRunsStore } from '../../../../../ui/study-cases/batchStore';
import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { SeriePanel } from '../SeriePanel';

const CASE_ID = 'case-serie-1';

interface Zadanie {
  readonly url: string;
  readonly metoda: string;
  readonly body: unknown;
}

function scenariusz(id: string, nazwa: string) {
  return {
    scenario_id: id,
    study_case_id: CASE_ID,
    name: nazwa,
    analysis_type: 'SHORT_CIRCUIT',
    fault_type: 'SC_3F',
    location: { element_ref: 'bus-1', location_type: 'BUS', position: null },
    config: { c_factor: 1.1, thermal_time_seconds: 1, include_branch_contributions: false },
    fault_impedance_type: 'METALLIC',
    fault_mode: 'METALLIC',
    fault_impedance: null,
    arc_params: null,
    z0_bus_data: null,
    created_at: '2026-08-07T10:00:00Z',
    updated_at: '2026-08-07T10:00:00Z',
    content_hash: 'h',
  };
}

function rekordSerii(
  status: 'CREATED' | 'FINISHED' | 'FAILED' | 'PARTIAL',
  runIds: string[] = [],
) {
  const bledy =
    status === 'FAILED' || status === 'PARTIAL'
      ? ['Scenariusz s2: Analiza zablokowana: brak danych Z2']
      : [];
  return {
    batch_id: 'batch-1',
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    scenario_ids: ['s1', 's2'],
    created_at: '2026-08-07T10:30:00Z',
    finished_at: status === 'CREATED' ? null : '2026-08-07T10:30:02Z',
    status,
    batch_input_hash: 'a'.repeat(64),
    run_ids: runIds,
    result_set_ids: runIds,
    errors: bledy,
    name: null,
    envelope: null,
    items: [],
  };
}

function biegKanoniczny(id: string) {
  return {
    id,
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'b'.repeat(64),
    status: 'DONE',
    started_at: '2026-08-07T10:30:01Z',
    finished_at: '2026-08-07T10:30:02Z',
    error_message: null,
  };
}

/**
 * Atrapa backendu na realnych adresach (kontrakt 1:1 z routerem
 * `api/batch_execution.py` + sąsiadami). Serie: przed wykonaniem lista pusta,
 * po POST execute lista niesie wykonaną serię (autorytatywne odświeżenie).
 */
function zamontujBackend(opcje: { scenariusze: ReturnType<typeof scenariusz>[] }): Zadanie[] {
  const zadania: Zadanie[] = [];
  let wykonano = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const metoda = init?.method ?? 'GET';
      zadania.push({ url, metoda, body: init?.body ? JSON.parse(String(init.body)) : null });
      const json = (payload: unknown, status = 200) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      if (metoda === 'GET' && url.includes('/fault-scenarios')) {
        return json({ scenarios: opcje.scenariusze, count: opcje.scenariusze.length });
      }
      if (metoda === 'GET' && url.endsWith('/batches')) {
        return wykonano
          ? json({ batches: [rekordSerii('FINISHED', ['run-a', 'run-b'])], count: 1 })
          : json({ batches: [], count: 0 });
      }
      if (metoda === 'POST' && url.endsWith('/batches')) {
        return json(rekordSerii('CREATED'), 201);
      }
      if (metoda === 'POST' && url.endsWith('/execute')) {
        wykonano = true;
        return json(rekordSerii('FINISHED', ['run-a', 'run-b']));
      }
      if (metoda === 'GET' && url.endsWith('/runs')) {
        return wykonano
          ? json({ runs: [biegKanoniczny('run-a'), biegKanoniczny('run-b')], count: 2 })
          : json({ runs: [], count: 0 });
      }
      return json({});
    }),
  );
  return zadania;
}

beforeEach(() => {
  useFaultScenariosStore.getState().reset();
  useBatchRunsStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useAppStateStore.setState({ activeCaseId: CASE_ID });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PROPS = {
  trybZaawansowania: 'basic' as const,
  onPokazWyniki: () => {},
  onPrzejdzDoScenariuszy: () => {},
};

describe('SeriePanel — powierzchnia serii przebiegów', () => {
  it('STAN ZEROWY: bez aktywnego przypadku uczciwy komunikat, zero wołań serii', () => {
    useAppStateStore.setState({ activeCaseId: null });
    const zadania = zamontujBackend({ scenariusze: [] });
    render(<SeriePanel {...PROPS} />);

    expect(screen.getByTestId('mvd-serie-brak-przypadku')).toBeTruthy();
    expect(zadania.some((z) => z.url.includes('/batches'))).toBe(false);
  });

  it('STAN ZEROWY: brak scenariuszy — realna akcja „Przejdź do scenariuszy"', async () => {
    const user = userEvent.setup();
    const doScenariuszy = vi.fn();
    zamontujBackend({ scenariusze: [] });
    render(<SeriePanel {...PROPS} onPrzejdzDoScenariuszy={doScenariuszy} />);

    expect(await screen.findByTestId('mvd-serie-brak-scenariuszy')).toBeTruthy();
    await user.click(screen.getByTestId('mvd-serie-do-scenariuszy'));
    expect(doScenariuszy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mvd-serie-lista-pusta')).toBeTruthy();
  });

  it('URUCHOMIENIE: zaznaczone scenariusze jadą do POST batches, potem POST execute', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend({
      scenariusze: [scenariusz('s1', 'Zwarcie w GPZ'), scenariusz('s2', 'Zwarcie na odpływie')],
    });
    render(<SeriePanel {...PROPS} />);

    await user.click(await screen.findByTestId('mvd-serie-scenariusz-s1'));
    await user.click(screen.getByTestId('mvd-serie-scenariusz-s2'));
    await user.click(screen.getByTestId('mvd-serie-uruchom'));

    await waitFor(() => {
      const post = zadania.find((z) => z.metoda === 'POST' && z.url.endsWith('/batches'));
      expect(post).toBeTruthy();
      expect(post!.url).toContain(`/api/execution/study-cases/${CASE_ID}/batches`);
      expect(post!.body).toEqual({ scenario_ids: ['s1', 's2'] });
      const execute = zadania.find((z) => z.metoda === 'POST' && z.url.endsWith('/execute'));
      expect(execute).toBeTruthy();
      expect(execute!.url).toContain('/api/execution/batches/batch-1/execute');
    });

    // Po wykonaniu: lista serii odświeżona autorytatywnie (GET), status PL.
    expect(await screen.findByTestId('mvd-serie-wiersz-batch-1')).toBeTruthy();
    expect(screen.getByTestId('mvd-serie-wiersz-batch-1').textContent).toContain('Zakończona');
  });

  it('WYNIKI: „Pokaż wyniki" biegu serii woła lądowisko K3 z identyfikatorem biegu', async () => {
    const user = userEvent.setup();
    const pokazWyniki = vi.fn();
    zamontujBackend({
      scenariusze: [scenariusz('s1', 'Zwarcie w GPZ'), scenariusz('s2', 'Zwarcie na odpływie')],
    });
    // Panel serii czyta statusy biegów z runStore — ustaw kontekst biegów
    // przypadku tak, jak robi to powłoka (aktywny przypadek śledzony).
    useExecutionRunsStore.setState({ activeStudyCaseId: CASE_ID });
    render(<SeriePanel {...PROPS} onPokazWyniki={pokazWyniki} />);

    await user.click(await screen.findByTestId('mvd-serie-scenariusz-s1'));
    await user.click(screen.getByTestId('mvd-serie-uruchom'));

    const przyciskWynikow = await screen.findByTestId('mvd-serie-wyniki-run-a');
    await user.click(przyciskWynikow);
    expect(pokazWyniki).toHaveBeenCalledWith('run-a');
  });

  it('BŁĄD: odpowiedź 400 backendu pokazuje polski komunikat z detail', async () => {
    const user = userEvent.setup();
    zamontujBackend({ scenariusze: [scenariusz('s1', 'Zwarcie w GPZ')] });
    // Wymuś błąd WYŁĄCZNIE na POST batches — pozostałe adresy obsługuje atrapa.
    const fetchMock = vi.mocked(globalThis.fetch);
    const oryginalna = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST' && String(input).endsWith('/batches')) {
        return new Response(
          JSON.stringify({ detail: 'Wszystkie scenariusze serii muszą mieć ten sam typ analizy' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return oryginalna(input, init);
    });
    render(<SeriePanel {...PROPS} />);

    await user.click(await screen.findByTestId('mvd-serie-scenariusz-s1'));
    await user.click(screen.getByTestId('mvd-serie-uruchom'));

    const blad = await screen.findByTestId('mvd-serie-blad-akcji');
    expect(blad.textContent).toContain('ten sam typ analizy');
  });
});
