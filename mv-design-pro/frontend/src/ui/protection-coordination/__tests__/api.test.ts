/**
 * Klient API koordynacji — kształt odpowiedzi jest SPRAWDZANY, nie zakładany (V12K-262).
 *
 * DEFEKT, KTÓRY TO ZAMYKA: `getCoordinationResult` zwracał `response.json()` wprost,
 * a strona czytała `result.trace_steps.length` bez warunku. Odpowiedź bez którejś
 * kolekcji (starsza wersja API, atrapa sceny, błąd proxy) wywracała CAŁY ekran
 * koordynacji — biały ekran, bez granicy błędu i bez powodu. Ta sama klasa awarii,
 * którą V12K-252 naprawił po stronie nastaw.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCoordinationResult } from '../api';

const PELNY_WYNIK = {
  run_id: 'coord-1',
  project_id: 'proj-1',
  sensitivity_checks: [],
  selectivity_checks: [],
  overload_checks: [],
  tcc_curves: [],
  fault_markers: [],
  trace_steps: [],
  overall_verdict: 'PASS',
  summary: {},
  created_at: '2026-07-28T08:00:00Z',
};

function odpowiedz(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCoordinationResult — niepełny kształt jest NAZWANY, nie przepuszczony', () => {
  it('komplet kolekcji przechodzi bez zmian', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedz(PELNY_WYNIK)));
    await expect(getCoordinationResult('coord-1')).resolves.toEqual(PELNY_WYNIK);
  });

  it('brak `trace_steps` daje błąd z NAZWĄ brakującej kolekcji', async () => {
    const { trace_steps: _pominiete, ...bezSladu } = PELNY_WYNIK;
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedz(bezSladu)));
    await expect(getCoordinationResult('coord-1')).rejects.toThrow(/trace_steps/);
  });

  it('brak kilku kolekcji wymienia je wszystkie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedz({ run_id: 'coord-1', project_id: 'proj-1' })),
    );
    await expect(getCoordinationResult('coord-1')).rejects.toThrow(
      /sensitivity_checks.*selectivity_checks.*overload_checks/,
    );
  });

  it('kolekcja o złym typie (nie tablica) jest traktowana jak brak', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedz({ ...PELNY_WYNIK, tcc_curves: { a: 1 } })),
    );
    await expect(getCoordinationResult('coord-1')).rejects.toThrow(/tcc_curves/);
  });

  it('odpowiedź nie-obiektowa nie przechodzi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedz([PELNY_WYNIK])));
    await expect(getCoordinationResult('coord-1')).rejects.toThrow(/niepełny kształt/);
  });
});
