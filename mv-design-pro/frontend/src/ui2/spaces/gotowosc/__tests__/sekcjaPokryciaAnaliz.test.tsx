/*
 * Testy sekcji „Pokrycie analizami" (ROUTERY-4A — zdolność A3 macierzy
 * pokrycia). Mock globalnego `fetch` na kontrakcie
 * `GET /api/insights/analysis-coverage` (klient `insightsApi.ts` ćwiczony
 * naprawdę). Iloczyn cech: stan (bez przypadku / ładowanie / błąd / z biegiem /
 * bez biegu / komplet) × treść (punktacja, braki, luki krytyczne).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SekcjaPokryciaAnaliz } from '../SekcjaPokryciaAnaliz';
import { GOTOWOSC_STRINGS } from '../strings';
import type { PokrycieResponse } from '../insightsApi';
import { useAppStateStore } from '../../../../ui/app-state/store';

function odpowiedz(over: Partial<PokrycieResponse> = {}): PokrycieResponse {
  return {
    case_id: 'C1',
    run_id: 'pf-1',
    pokrycie: {
      analysis_id: 'cov-1',
      total_score: 8.0,
      missing_items: [
        'Brak dowodu: zwarcie trójfazowe SC3F (IEC 60909).',
        'Brak analizy zabezpieczeń.',
      ],
      critical_gaps: ['LUKA-UZIEMIENIE: brak pakietu dowodu uziemienia (zwarcie doziemne SN).'],
    },
    ...over,
  };
}

function mockFetchOk(dane: PokrycieResponse) {
  const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => dane } as Response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: 'C1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useAppStateStore.setState({ activeCaseId: null });
});

describe('SekcjaPokryciaAnaliz — stany', () => {
  it('bez aktywnego przypadku: uczciwy stan pusty PL, bez wołania API', () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    useAppStateStore.setState({ activeCaseId: null });
    render(<SekcjaPokryciaAnaliz />);
    expect(screen.getByTestId('mvd-pokrycie-brak-przypadku')).toHaveTextContent(
      GOTOWOSC_STRINGS.pokrycieBrakPrzypadku,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('błąd pobierania: komunikat PL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal' } as Response),
    );
    render(<SekcjaPokryciaAnaliz />);
    expect(await screen.findByTestId('mvd-pokrycie-blad')).toHaveTextContent(
      GOTOWOSC_STRINGS.pokrycieBlad,
    );
  });
});

describe('SekcjaPokryciaAnaliz — treść', () => {
  it('pokazuje punktację, braki i luki krytyczne wprost z backendu', async () => {
    const spy = mockFetchOk(odpowiedz());
    render(<SekcjaPokryciaAnaliz />);
    expect(await screen.findByTestId('mvd-pokrycie-punktacja')).toHaveTextContent('8 / 100');
    expect(screen.getByTestId('mvd-pokrycie-braki')).toHaveTextContent(
      'Brak dowodu: zwarcie trójfazowe SC3F (IEC 60909).',
    );
    expect(screen.getByTestId('mvd-pokrycie-luki')).toHaveTextContent('LUKA-UZIEMIENIE');
    // PEŁNY adres końcówki przypięty (iniekcja wykazała: sam `case_id=C1`
    // przepuszczał zepsutą ścieżkę klienta — test maskował defekt produktu).
    expect(String(spy.mock.calls[0][0])).toBe('/api/insights/analysis-coverage?case_id=C1');
  });

  it('przypadek bez biegu rozpływu: jawna informacja PL (run_id=null)', async () => {
    mockFetchOk(odpowiedz({ run_id: null }));
    render(<SekcjaPokryciaAnaliz />);
    expect(await screen.findByTestId('mvd-pokrycie-bez-biegu')).toHaveTextContent(
      GOTOWOSC_STRINGS.pokrycieBezBiegu,
    );
  });

  it('komplet analiz (bez braków): komunikat pozytywny zamiast pustych list', async () => {
    mockFetchOk(
      odpowiedz({
        pokrycie: {
          analysis_id: 'cov-2',
          total_score: 100.0,
          missing_items: [],
          critical_gaps: [],
        },
      }),
    );
    render(<SekcjaPokryciaAnaliz />);
    expect(await screen.findByTestId('mvd-pokrycie-bez-brakow')).toHaveTextContent(
      GOTOWOSC_STRINGS.pokrycieBezBrakow,
    );
    expect(screen.queryByTestId('mvd-pokrycie-braki')).toBeNull();
  });
});
