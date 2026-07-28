/**
 * Rewizja modelu w kontrakcie przebiegu — realna droga HTTP (V12K-264).
 *
 * DLACZEGO OSOBNY TEST. Wstrzyknięta regresja pokazała lukę we WŁASNYM pokryciu:
 * usunięcie `rewizjaModelu` z normalizatora nie zapalało żadnego testu, więc pole
 * mogło zniknąć po cichu — a wtedy znacznik świeżości i panel przyczyn znów
 * przestałyby się pokazywać, dokładnie tak jak przed tą kartą, i nikt by tego nie
 * zauważył.
 *
 * Test jedzie przez `useAnalysisRunContract` (pobranie + normalizacja + stan),
 * czyli tę samą drogę, którą jedzie ekran — nie przez wyeksportowaną na potrzeby
 * testu funkcję wewnętrzną.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnalysisRunContract } from '../analysisRunContract';

function odpowiedzBiegu(rewizja: unknown): Record<string, unknown> {
  return {
    id: 'run-rewizja-1',
    analysis_case_context: {
      case_ref: 'case-1',
      snapshot_ref: 'sha256:abc',
      rewizja_modelu: rewizja,
    },
  };
}

function zamontujFetch(body: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kontrakt przebiegu — LICZBOWA rewizja modelu', () => {
  it('przenosi rewizję z odpowiedzi backendu do kontraktu', async () => {
    zamontujFetch(odpowiedzBiegu(4));
    const { result } = renderHook(() => useAnalysisRunContract('run-rewizja-1'));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.analysisCaseContext?.rewizjaModelu).toBe(4);
  });

  it('brak rewizji w odpowiedzi zostaje BRAKIEM (null), nie zerem', async () => {
    zamontujFetch(odpowiedzBiegu(undefined));
    const { result } = renderHook(() => useAnalysisRunContract('run-rewizja-2'));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data?.analysisCaseContext?.rewizjaModelu).toBeNull();
  });

  it('rewizja jako TEKST jest odrzucona — porównanie liczbowe musi być pewne', async () => {
    zamontujFetch(odpowiedzBiegu('4'));
    const { result } = renderHook(() => useAnalysisRunContract('run-rewizja-3'));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    // Napis „4" przepuszczony jako liczba dawałby porównanie, które czasem działa,
    // a czasem cicho zawodzi — i werdykt świeżości bez podstawy.
    expect(result.current.data?.analysisCaseContext?.rewizjaModelu).toBeNull();
  });
});
