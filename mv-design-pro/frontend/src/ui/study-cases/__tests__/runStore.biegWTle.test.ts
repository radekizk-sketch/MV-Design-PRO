/**
 * Bieg w tle przez prawdziwy moduł api (karta DYNAMIKA-W-TLE, scalenie partii 8).
 *
 * Store edytora przypadku (`createAndExecuteRun`, wołany z `uruchomObliczenie`) idzie przez
 * PRAWDZIWE `api.ts`; atrapą jest wyłącznie `fetch` w kształcie backendu: POST execute
 * zwraca 202 ze stanem QUEUED, a stan końcowy przychodzi dopiero z GET /runs/{id}.
 * Iloczyn cech: stan końcowy {DONE, FAILED, CANCELLED} × liczba odczytów w toku {0, 2}.
 * Bez odpytywania store uznałby 202 QUEUED za wynik (defekt sprzed scalenia).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecutionRunsStore } from '../runStore';
import { ODSTEP_ODPYTYWANIA_BIEGU_MS } from '../api';
import type { ExecutionRun, RunStatus } from '../types';

const BIEG: ExecutionRun = {
  id: 'run-w-tle',
  study_case_id: 'case-001',
  analysis_type: 'SC_3F',
  solver_input_hash: 'hash-w-tle',
  status: 'PENDING',
  started_at: null,
  finished_at: null,
  error_message: null,
};

function odpowiedz(status: number, cialo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cialo,
  } as Response;
}

function atrapaBackendu(stanyWToku: RunStatus[], koncowy: RunStatus) {
  const kolejka: RunStatus[] = [...stanyWToku, koncowy];
  const wywolania: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const metoda = init?.method ?? 'GET';
    wywolania.push(`${metoda} ${url}`);
    if (metoda === 'POST' && url === '/api/execution/study-cases/case-001/runs') {
      return odpowiedz(201, BIEG);
    }
    if (metoda === 'POST' && url === `/api/execution/runs/${BIEG.id}/execute`) {
      return odpowiedz(202, { ...BIEG, status: 'QUEUED' });
    }
    if (metoda === 'GET' && url === `/api/execution/runs/${BIEG.id}`) {
      const status = kolejka.shift() ?? koncowy;
      return odpowiedz(200, { ...BIEG, status });
    }
    if (metoda === 'GET' && url === '/api/execution/study-cases/case-001/runs') {
      return odpowiedz(200, { runs: [{ ...BIEG, status: koncowy }], count: 1 });
    }
    return odpowiedz(404, { detail: `nieoczekiwane ${metoda} ${url}` });
  });
  return { fetchMock, wywolania };
}

const oryginalnyFetch = global.fetch;

describe('createAndExecuteRun — bieg w tle przez prawdziwe api', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useExecutionRunsStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = oryginalnyFetch;
  });

  for (const koncowy of ['DONE', 'FAILED', 'CANCELLED'] as const) {
    for (const stanyWToku of [[], ['QUEUED', 'RUNNING']] as RunStatus[][]) {
      it(`stan końcowy ${koncowy} po ${stanyWToku.length} odczytach w toku`, async () => {
        const { fetchMock, wywolania } = atrapaBackendu(stanyWToku, koncowy);
        global.fetch = fetchMock as unknown as typeof fetch;

        const obietnica = useExecutionRunsStore
          .getState()
          .createAndExecuteRun('case-001', { analysis_type: 'SC_3F' });
        for (let i = 0; i <= stanyWToku.length; i += 1) {
          await vi.advanceTimersByTimeAsync(ODSTEP_ODPYTYWANIA_BIEGU_MS);
          if (i < stanyWToku.length) {
            // Odczyt w toku: flaga wykonania nadal zapalona, stan z backendu.
            expect(useExecutionRunsStore.getState().isExecutingRun).toBe(true);
            expect(useExecutionRunsStore.getState().runStatus).toBe(stanyWToku[i]);
          }
        }
        const wynik = await obietnica;

        expect(wynik.status).toBe(koncowy);
        const stan = useExecutionRunsStore.getState();
        expect(stan.runStatus).toBe(koncowy);
        expect(stan.isExecutingRun).toBe(false);
        expect(wywolania.filter((w) => w === `GET /api/execution/runs/${BIEG.id}`)).toHaveLength(
          stanyWToku.length + 1,
        );
      });
    }
  }
});
