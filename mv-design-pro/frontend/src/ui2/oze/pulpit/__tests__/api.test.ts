/*
 * Testy cienkiego klienta `ui2/oze/api` (P47a): poprawne URL-e końcówek D1 +
 * katalogu konwerterów oraz jawny błąd przy odpowiedzi != 2xx. `fetch` mockowany.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  pobierzAdekwatnoscQ,
  pobierzKonwertery,
  pobierzSileSieci,
} from '../../api';
import { adekwatnoscQFixture, konwerteryBessFixture, silaSieciFixture } from './analizyFixtures';

function mockFetchOk(payload: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(payload) }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pobierzSileSieci', () => {
  it('woła grid-strength z parametrem run_id i zwraca widok', async () => {
    const fn = mockFetchOk(silaSieciFixture());
    const widok = await pobierzSileSieci('abc-123');
    expect(fn).toHaveBeenCalledWith('/api/oze-analysis/grid-strength?run_id=abc-123');
    expect(widok.summary.wscr).toBe(4.5);
    expect(widok.entries).toHaveLength(3);
  });
});

describe('pobierzAdekwatnoscQ', () => {
  it('woła reactive-adequacy z parametrem run_id i zwraca widok', async () => {
    const fn = mockFetchOk(adekwatnoscQFixture());
    const widok = await pobierzAdekwatnoscQ('def-456');
    expect(fn).toHaveBeenCalledWith('/api/oze-analysis/reactive-adequacy?run_id=def-456');
    expect(widok.verdict).toBe('wystarczajaca rezerwa Q');
    expect(widok.sources).toHaveLength(2);
  });
});

describe('pobierzKonwertery', () => {
  it('dokłada filtr kind gdy podany', async () => {
    const fn = mockFetchOk(konwerteryBessFixture());
    const rekordy = await pobierzKonwertery('BESS');
    expect(fn).toHaveBeenCalledWith('/api/catalog/converter-types?kind=BESS');
    expect(rekordy[0].id).toBe('conv-bess-nn-1mw-0p4kv');
  });

  it('bez filtra kind pobiera całą listę', async () => {
    const fn = mockFetchOk([]);
    await pobierzKonwertery();
    expect(fn).toHaveBeenCalledWith('/api/catalog/converter-types');
  });
});

describe('getJson — obsługa błędu', () => {
  it('rzuca jawny błąd gdy odpowiedź != 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 422, statusText: 'Unprocessable Entity' })),
    );
    await expect(pobierzSileSieci('x')).rejects.toThrow('422');
  });
});
