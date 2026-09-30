/**
 * Dostawca rozpływu gałęziowego + śladu WHITE BOX podziału prądu (TH-1) NA
 * ŻĄDANIE (V12K-281, K13; karta WB-ROZPLYW).
 *
 * Wiersze zbiorcze wyniku zwarciowego nie niosą już rozpływu (iloczyn
 * źródło×gałąź per wiersz dawał odpowiedź 730 MB dla 50 stacji) — hook
 * `useRozplywZwarciowy` pobiera dane JEDNEGO punktu (wkłady ORAZ ślad — jedna
 * odpowiedź, jedno wywołanie) z endpointu rozpływu. Testy pokrywają wszystkie
 * uczciwe stany kontraktu, ILOCZYN CECH (nie tylko przykład z karty):
 *  - dane inline w wierszu (mock/starszy pełny zapis) → flows wprost, ZERO
 *    wołań, trace niedostępny tą ścieżką (ShortCircuitRow go nie niesie),
 *  - flaga dostępności prawdziwa → pobranie na żądanie + cache per punkt,
 *    flows I trace z JEDNEJ odpowiedzi,
 *  - flaga nieprawdziwa/nieobecna (starszy wynik) → flows/trace null, ZERO wołań,
 *  - branch_contributions i branch_flow_trace mają NIEZALEŻNĄ nullowość (ślad
 *    dokumentuje wyłącznie rodzinę Thevenina — punkt może mieć wkłady
 *    falownikowe bez śladu, albo starszy zapis bez kolumny śladu przy
 *    obecnych wkładach),
 *  - błąd pobrania (HTTP/sieć) → `blad: true` ROZPOZNANY, nie cisza (karta
 *    WB-ROZPLYW, W4d) — różne od „brak danych" (flaga fałszywa).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import type { ShortCircuitBranchFlow, ShortCircuitRow } from '../../../../ui/results-inspector/types';
import { useRozplywZwarciowy } from '../api';
import { branchFlowTraceFixture, shortCircuitRowFixture } from './fixtures';

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

/** Ślad TH-1 REALNEGO kształtu (`branchFlowTraceFixture` — kopia bajt-w-bajt
 * z testu backendu); tu wystarczy PIERWSZY krok (setup) do dowodu przepływu
 * przez cache/pary flows+trace — pełny ślad (4 kroki, wszystkie kształty
 * wartości) ma dedykowany test w `sladPodzialuPradu.test.tsx`. */
const TRACE_STEP = branchFlowTraceFixture()[0];

function wierszNaZadanie(nadpisania: Partial<ShortCircuitRow> = {}): ShortCircuitRow {
  return shortCircuitRowFixture({
    branch_contributions: null,
    branch_contributions_available: true,
    ...nadpisania,
  });
}

describe('useRozplywZwarciowy (V12K-281, karta WB-ROZPLYW)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dane inline w wierszu mają pierwszeństwo — flows wprost, trace null, zero wołań API', () => {
    const wiersz = shortCircuitRowFixture({ branch_contributions: [FLOW] });
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wiersz));
    expect(result.current).toEqual({ flows: [FLOW], trace: null, blad: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flaga dostępności prawdziwa → pobiera flows I trace punktu z JEDNEJ odpowiedzi (ref w zapytaniu)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          run_id: 'run-1',
          target_id: 'node-1',
          branch_contributions: [FLOW],
          branch_flow_trace: [TRACE_STEP],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() =>
      useRozplywZwarciowy('run-1', wierszNaZadanie({ target_id: 'gpz/a/b' })),
    );
    expect(result.current).toEqual({ flows: null, trace: null, blad: false });
    await waitFor(() =>
      expect(result.current).toEqual({ flows: [FLOW], trace: [TRACE_STEP], blad: false }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Ref węzła ENM zawiera ukośniki — MUSI iść parametrem zapytania (zakodowany).
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/analysis-runs/run-1/results/short-circuit/rozplyw?target_id=gpz%2Fa%2Fb',
    );
  });

  it('odpowiedź z pustymi listami → [] (policzono, brak wkładów/kroków)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          run_id: 'run-1',
          target_id: 'node-1',
          branch_contributions: [],
          branch_flow_trace: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wierszNaZadanie()));
    await waitFor(() =>
      expect(result.current).toEqual({ flows: [], trace: [], blad: false }),
    );
  });

  it('branch_flow_trace i branch_contributions mają NIEZALEŻNĄ nullowość (ślad dokumentuje wyłącznie Thevenina)', async () => {
    // Wkłady falownikowe obecne, ślad Thevenina pusty (punkt bez wkładu sieci
    // zastępczej) — dwie rodziny wkładu, jedna bez WHITE BOX.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          run_id: 'run-1',
          target_id: 'node-1',
          branch_contributions: [FLOW],
          branch_flow_trace: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wierszNaZadanie()));
    await waitFor(() =>
      expect(result.current).toEqual({ flows: [FLOW], trace: [], blad: false }),
    );
  });

  it('branch_flow_trace null przy niepustym branch_contributions (zapis sprzed kolumny śladu)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          run_id: 'run-1',
          target_id: 'node-1',
          branch_contributions: [FLOW],
          branch_flow_trace: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wierszNaZadanie()));
    await waitFor(() =>
      expect(result.current).toEqual({ flows: [FLOW], trace: null, blad: false }),
    );
  });

  it('starszy wynik bez flagi dostępności → flows/trace null, zero wołań (uczciwa kreska)', () => {
    const wiersz = shortCircuitRowFixture({
      branch_contributions: null,
      branch_contributions_available: undefined,
    });
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wiersz));
    expect(result.current).toEqual({ flows: null, trace: null, blad: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('błąd pobrania (HTTP) → blad: true ROZPOZNANY, różny od „brak danych" (karta WB-ROZPLYW, W4d)', async () => {
    fetchMock.mockResolvedValue(new Response('awaria', { status: 500 }));
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wierszNaZadanie()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current).toEqual({ flows: null, trace: null, blad: true }),
    );
  });

  it('błąd sieci (fetch odrzucony) → blad: true, bez wyjątku nieobsłużonego', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useRozplywZwarciowy('run-1', wierszNaZadanie()));
    await waitFor(() =>
      expect(result.current).toEqual({ flows: null, trace: null, blad: true }),
    );
  });

  it('cache per punkt: zmiana punktu pobiera raz, powrót do punktu nie pobiera ponownie', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            run_id: 'run-1',
            target_id: 'x',
            branch_contributions: String(url).includes('node-2') ? [] : [FLOW],
            branch_flow_trace: String(url).includes('node-2') ? [] : [TRACE_STEP],
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
    await waitFor(() =>
      expect(result.current).toEqual({ flows: [FLOW], trace: [TRACE_STEP], blad: false }),
    );
    rerender({ punkt: 'node-2' });
    await waitFor(() => expect(result.current).toEqual({ flows: [], trace: [], blad: false }));
    rerender({ punkt: 'node-1' });
    await waitFor(() =>
      expect(result.current).toEqual({ flows: [FLOW], trace: [TRACE_STEP], blad: false }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
