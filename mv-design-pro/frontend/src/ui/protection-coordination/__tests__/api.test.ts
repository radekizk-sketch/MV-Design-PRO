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

import { getCoordinationResult, komunikatOdmowyAnalizy, runCoordinationAnalysis } from '../api';

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

/**
 * Odmowa `POST …/run` niesie `detail` jako tekst (bramka 400) albo rekord (422 autorytetu
 * biegów / wejścia niemiarodajnego). Rekord podany wprost do `new Error` dawał
 * „[object Object]" — iloczyn cech: {tekst, komunikat + niezgodności, blokady, nieznany
 * kształt}.
 */
describe('runCoordinationAnalysis — odmowa backendu czytelna dla inżyniera', () => {
  it.each([
    ['tekst bramki 400', 'Analiza koordynacji wymaga co najmniej jednego urzadzenia.', 'Analiza koordynacji wymaga co najmniej jednego urzadzenia.'],
    [
      'rekord autorytetu z niezgodnościami',
      {
        powod: 'PRADY_NIEZGODNE_Z_BIEGIEM',
        komunikat_pl: 'Prądy zwarciowe podane w żądaniu różnią się od prądów policzonych w biegach.',
        niezgodnosci: ['line_1 (szyna bus_1).ik_max_3f_a: podano 1.0 A, bieg maksymalny policzył 8400.0 A'],
      },
      'Prądy zwarciowe podane w żądaniu różnią się od prądów policzonych w biegach. line_1 (szyna bus_1).ik_max_3f_a: podano 1.0 A, bieg maksymalny policzył 8400.0 A',
    ],
    [
      'rekord blokad wejścia',
      { powod: 'WEJSCIE_NIEMIARODAJNE', blokady: [{ kod: 'SI-110', komunikat_pl: 'Wkład falownika z domyślki.' }] },
      'Wkład falownika z domyślki.',
    ],
    ['nieznany kształt', { cos: 1 }, 'Analiza koordynacji odrzucona (HTTP 422).'],
  ])('%s', (_opis, detail, oczekiwany) => {
    expect(komunikatOdmowyAnalizy(detail, 422)).toBe(oczekiwany);
  });

  it('błąd HTTP z rekordem → Error z komunikatem, nie „[object Object]"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ detail: { powod: 'X', komunikat_pl: 'Brak biegu minimalnego.' } }),
      }) as Response),
    );
    await expect(
      runCoordinationAnalysis('proj-1', { devices: [], fault_currents: [], operating_currents: [] }),
    ).rejects.toThrow('Brak biegu minimalnego.');
  });
});
