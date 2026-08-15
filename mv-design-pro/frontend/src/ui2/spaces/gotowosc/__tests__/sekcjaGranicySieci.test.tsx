/*
 * Testy sekcji „Granica sieci (węzeł przyłączenia)" (ROUTERY-4A — zdolność A2
 * macierzy pokrycia). Mock globalnego `fetch` na kontrakcie
 * `GET /api/insights/network-boundary` (klient `insightsApi.ts` ćwiczony
 * naprawdę). Iloczyn cech: stan (bez przypadku / błąd / znaleziono /
 * nie znaleziono z diagnostyką) × treść (szyna, metoda PL, ufność).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SekcjaGranicySieci } from '../SekcjaGranicySieci';
import { GOTOWOSC_STRINGS } from '../strings';
import type { GranicaResponse } from '../insightsApi';
import { useAppStateStore } from '../../../../ui/app-state/store';

function znaleziona(over: Partial<GranicaResponse> = {}): GranicaResponse {
  return {
    case_id: 'C1',
    model_hash: 'deadbeef',
    znaleziono: true,
    wezel_przylaczenia: { ref_id: 'bus_hv', name: 'GPZ 110kV', voltage_kv: 110.0 },
    node_id: 'uuid-1',
    metoda: 'external_grid',
    metoda_pl: 'źródło zasilania z sieci zewnętrznej',
    ufnosc: 0.95,
    diagnostyka: [],
    ...over,
  };
}

function mockFetchOk(dane: GranicaResponse) {
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

describe('SekcjaGranicySieci — stany', () => {
  it('bez aktywnego przypadku: uczciwy stan pusty PL, bez wołania API', () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    useAppStateStore.setState({ activeCaseId: null });
    render(<SekcjaGranicySieci />);
    expect(screen.getByTestId('mvd-granica-brak-przypadku')).toHaveTextContent(
      GOTOWOSC_STRINGS.granicaBrakPrzypadku,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('błąd pobierania: komunikat PL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal' } as Response),
    );
    render(<SekcjaGranicySieci />);
    expect(await screen.findByTestId('mvd-granica-blad')).toHaveTextContent(
      GOTOWOSC_STRINGS.granicaBlad,
    );
  });
});

describe('SekcjaGranicySieci — wynik', () => {
  it('znaleziona granica: szyna z napięciem, metoda PL i ufność w procentach', async () => {
    const spy = mockFetchOk(znaleziona());
    render(<SekcjaGranicySieci />);
    expect(await screen.findByTestId('mvd-granica-wezel')).toHaveTextContent('GPZ 110kV');
    expect(screen.getByTestId('mvd-granica-wezel')).toHaveTextContent('110 kV');
    expect(screen.getByTestId('mvd-granica-metoda')).toHaveTextContent(
      'źródło zasilania z sieci zewnętrznej',
    );
    expect(screen.getByTestId('mvd-granica-ufnosc')).toHaveTextContent('95%');
    // PEŁNY adres końcówki przypięty (klasa z iniekcji sekcji pokrycia: sam
    // `case_id=` przepuszcza zepsutą ścieżkę klienta).
    expect(String(spy.mock.calls[0][0])).toBe('/api/insights/network-boundary?case_id=C1');
  });

  it('granica nieznaleziona: uczciwy komunikat + diagnostyka PL z backendu', async () => {
    mockFetchOk(
      znaleziona({
        znaleziono: false,
        wezel_przylaczenia: null,
        node_id: null,
        metoda: null,
        metoda_pl: null,
        ufnosc: 0.0,
        diagnostyka: [
          {
            kod: 'external_grid.multiple',
            opis_pl:
              'Więcej niż jedno źródło zasilania z sieci zewnętrznej — granica niejednoznaczna.',
          },
        ],
      }),
    );
    render(<SekcjaGranicySieci />);
    expect(await screen.findByTestId('mvd-granica-nieznaleziona')).toHaveTextContent(
      GOTOWOSC_STRINGS.granicaNieznaleziona,
    );
    expect(screen.getByTestId('mvd-granica-diagnostyka')).toHaveTextContent(
      'Więcej niż jedno źródło zasilania',
    );
  });
});
