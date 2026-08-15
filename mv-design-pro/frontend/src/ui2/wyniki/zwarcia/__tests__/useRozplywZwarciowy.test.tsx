/**
 * Dostawca rozpływu gałęziowego NA ŻĄDANIE (V12K-281, K13).
 *
 * Wiersze zbiorcze wyniku zwarciowego nie niosą już rozpływu (iloczyn
 * źródło×gałąź per wiersz dawał odpowiedź 730 MB dla 50 stacji) — hook
 * `useRozplywZwarciowy` pobiera dane JEDNEGO punktu z endpointu rozpływu.
 * Testy pokrywają wszystkie uczciwe stany kontraktu:
 *  - dane inline w wierszu (mock/starszy pełny zapis) → wprost, ZERO wołań,
 *  - flaga dostępności prawdziwa → pobranie na żądanie + cache per punkt,
 *  - flaga nieprawdziwa/nieobecna (starszy wynik) → null, ZERO wołań,
 *  - błąd pobrania → null (sekcja pokazuje stan „niedostępny").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import type { ShortCircuitBranchFlow, ShortCircuitRow } from '../../../../ui/results-inspector/types';
import { useRozplywZwarciowy } from '../api';
import { shortCircuitRowFixture } from './fixtures';

const FLOW: ShortCircuitBranchFlow = {
  branch_id: 'BR-L1',
  branch_name: 'Linia OZE',
  source_id: 'THEVENIN_GRID',
  from_node_id: 'BUS-GPZ',
  from_node_name: 'Szyna GPZ 20 kV',
  to_node_id: 'BUS-OZE',
  to_node_name: 'Szyna OZE 20 kV',
  i_ka: 5.55,
  direction: 'from_to',
};

function wierszNaZadanie(nadpisania: Partial<ShortCircuitRow> = {}): ShortCircuitRow {
  return shortCircuitRowFixture({
    branch_contributions: null,
    branch_contributions_available: true,
    ...nadpisania,
  });
}

describe('useRozplywZwarciowy (V12K-281)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dane inline w wierszu mają pierwszeństwo — zero wołań API', () => {
    const wiersz = shortCircuitRowFixture({ branch_contributions: [FLOW] });
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wiersz));
    expect(result.current).toEqual([FLOW]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flaga dostępności prawdziwa → pobiera rozpływ punktu z endpointu (ref w zapytaniu)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ run_id: 'run-1', target_id: 'node-1', branch_contributions: [FLOW] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() =>
      useRozplywZwarciowy('run-1', wierszNaZadanie({ target_id: 'gpz/a/b' })),
    );
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual([FLOW]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Ref węzła ENM zawiera ukośniki — MUSI iść parametrem zapytania (zakodowany).
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/analysis-runs/run-1/results/short-circuit/rozplyw?target_id=gpz%2Fa%2Fb',
    );
  });

  it('odpowiedź z pustą listą → [] (policzono, brak prądu w gałęziach)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ run_id: 'run-1', target_id: 'node-1', branch_contributions: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wierszNaZadanie()));
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it('starszy wynik bez flagi dostępności → null, zero wołań (uczciwa kreska)', () => {
    const wiersz = shortCircuitRowFixture({
      branch_contributions: null,
      branch_contributions_available: undefined,
    });
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wiersz));
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('błąd pobrania → null (sekcja pokazuje stan „niedostępny", bez wyjątku)', async () => {
    fetchMock.mockResolvedValue(new Response('awaria', { status: 500 }));
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wierszNaZadanie()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });

  it('cache per punkt: zmiana punktu pobiera raz, powrót do punktu nie pobiera ponownie', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            run_id: 'run-1',
            target_id: 'x',
            branch_contributions: String(url).includes('node-2') ? [] : [FLOW],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const { result, rerender } = renderHook(
      ({ punkt }: { punkt: string }) =>
        useRozplywZwarciowy('run-1', wierszNaZadanie({ target_id: punkt })),
      { initialProps: { punkt: 'node-1' } },
    );
    await waitFor(() => expect(result.current).toEqual([FLOW]));
    rerender({ punkt: 'node-2' });
    await waitFor(() => expect(result.current).toEqual([]));
    rerender({ punkt: 'node-1' });
    await waitFor(() => expect(result.current).toEqual([FLOW]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
