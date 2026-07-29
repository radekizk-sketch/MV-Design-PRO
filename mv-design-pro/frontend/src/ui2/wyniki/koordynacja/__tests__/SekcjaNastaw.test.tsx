/**
 * Sekcja „Nastawy wyznaczone z analizy" (karta F-K5, dług V12K-189).
 *
 * Test pilnuje tego, co było długiem: nastawa, której projekt NIE wyliczył, musi być
 * widoczna jako STAN z powodem i drogą do naprawy — nie jako puste pole i nie jako
 * liczba zastępcza. Kliki natywne (userEvent), `fetch` mockowany 1:1 z kontraktem
 * końcówki `/api/protection/overcurrent-settings`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useShellStore } from '../../../shell/useShellStore';
import { SekcjaNastaw } from '../SekcjaNastaw';
import { KOORDYNACJA_STRINGS as T } from '../strings';

/** Odpowiedź końcówki: I> wyznaczone, pozostałe trzy NIEDOSTĘPNE (sam bieg 3F). */
const ODPOWIEDZ_Z_BRAKAMI = {
  run_id: 'protection.overcurrent.v0:abc',
  case_id: 'case-1',
  analysis_type: 'protection.overcurrent.v0',
  status: 'DEGRADED',
  prezentacja: {
    pozycje: [
      {
        klucz: 'i_pickup_51_a',
        etykieta: 'I> (51) — prad rozruchowy zwloczny',
        jednostka: 'A',
        wartosc: 132.5,
        stan: 'DOSTEPNA',
        komunikat_pl: null,
        powod_pl: null,
        fix_action_id: null,
        fix_navigation: null,
      },
      {
        klucz: 'i_inst_50_a',
        etykieta: 'I>> (50) — nastawa bezzwloczna',
        jednostka: 'A',
        wartosc: null,
        stan: 'NIEDOSTEPNA',
        komunikat_pl: 'Niedostepna — uzupelnij dane wejsciowe',
        powod_pl: 'Brak prądu zwarciowego z biegu SC — uruchom analizę zwarciową',
        fix_action_id: 'fix_protection_run_short_circuit',
        fix_navigation: { panel: 'analizy', tab: 'zwarciowa' },
      },
    ],
    kompletne: false,
    brakujace: ['i_inst_50_a'],
    kody_gotowosci: ['protection.fault_current_missing'],
    podsumowanie_pl: 'Niedostepne nastawy: 1 z 4 — uzupelnij dane wejsciowe wskazane przy pozycjach.',
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useShellStore.setState({ activeSpace: 'wyniki' } as never);
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ODPOWIEDZ_Z_BRAKAMI }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('SekcjaNastaw — niedostępna nastawa jest STANEM, nie pustym polem', () => {
  it('pokazuje wartość wyznaczoną i jawny brak z powodem', async () => {
    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/protection/overcurrent-settings?case_id=case-1',
    );

    // Nastawa wyznaczona: liczba z backendu, jednostka z kontraktu.
    expect(screen.getByText('132.5 A')).toBeInTheDocument();
    // Nastawa niedostępna: NAZWANY stan + powód, zero liczby zastępczej.
    const brak = screen.getByTestId('mvd-koordynacja-nastawa-i_inst_50_a');
    expect(brak.getAttribute('data-stan')).toBe('NIEDOSTEPNA');
    expect(brak.textContent).toContain('Niedostepna');
    expect(brak.textContent).toContain('uruchom analizę zwarciową');
    expect(brak.textContent).not.toContain('0.0 A');
    // Niekompletny zestaw jest oznaczony jako taki (nie czyta się jak wynik w normie).
    expect(
      screen.getByTestId('mvd-koordynacja-nastawy-podsumowanie').getAttribute('data-kompletne'),
    ).toBe('nie');
  });

  it('akcja naprawcza prowadzi do przestrzeni z kanonicznej nawigacji (native click)', async () => {
    const user = userEvent.setup();
    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());

    await user.click(screen.getByTestId('mvd-koordynacja-nastawa-i_inst_50_a-akcja'));

    // `fix_navigation.panel = 'analizy'` ⇒ przestrzeń obliczeń: tam uruchamia się bieg
    // zwarciowy, którego brakuje. Kierunek pochodzi z backendu, nie z domysłu UI.
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('nierozpoznany panel nawigacji nie dostaje przycisku (lepiej brak niż zła droga)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...ODPOWIEDZ_Z_BRAKAMI,
        prezentacja: {
          ...ODPOWIEDZ_Z_BRAKAMI.prezentacja,
          pozycje: [
            {
              ...ODPOWIEDZ_Z_BRAKAMI.prezentacja.pozycje[1],
              fix_navigation: { panel: 'nieznany-panel' },
            },
          ],
        },
      }),
    } as unknown as Response);

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());

    expect(screen.getByTestId('mvd-koordynacja-nastawa-i_inst_50_a')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-nastawa-i_inst_50_a-akcja')).toBeNull();
  });

  it('brak biegu nastaw (404) to uczciwy stan zerowy z drogą do obliczeń', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'brak' }),
    } as unknown as Response);
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-brak')).toBeInTheDocument(),
    );
    expect(screen.getByText(T.nastawyBrakBieguTytul)).toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-koordynacja-nastawy-brak-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('awaria końcówki jest odróżniona od braku biegu', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'Bieg nie niesie zestawu nastaw' }),
    } as unknown as Response);

    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-blad')).toBeInTheDocument(),
    );
    expect(screen.getByText(/nie niesie zestawu nastaw/)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-nastawy-brak')).toBeNull();
  });
});

/**
 * V12K-262 — stan spoza kontraktu nie może czytać się jak nastawa WYZNACZONA.
 *
 * `WierszNastawy` sprawdzał `stan !== 'NIEDOSTEPNA'`, więc odpowiedź ze stanem
 * spoza kontraktu (starsza wersja API, atrapa, proxy) renderowała się jako
 * „Wyznaczona" — przy PUSTEJ wartości. To najgorszy możliwy kierunek awarii dla
 * wielkości, którą nastawia się na przekaźniku.
 */
describe('SekcjaNastaw — stan spoza kontraktu jest odrzucany, nie zgadywany', () => {
  it('odpowiedź ze stanem spoza kontraktu daje NAZWANY błąd, a nie „Wyznaczona"', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        run_id: 'r1',
        case_id: 'case-1',
        analysis_type: 'protection.overcurrent.v0',
        status: 'DONE',
        prezentacja: {
          kompletne: false,
          brakujace: [],
          kody_gotowosci: [],
          podsumowanie_pl: 'x',
          pozycje: [
            {
              klucz: 'i_pickup_51_a',
              etykieta: 'I> (51)',
              jednostka: 'A',
              wartosc: null,
              // Stan, którego kontrakt NIE zna.
              stan: 'niewyznaczalna',
              komunikat_pl: null,
              powod_pl: null,
              fix_action_id: null,
              fix_navigation: null,
            },
          ],
        },
      }),
    } as unknown as Response);

    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-blad')).toBeInTheDocument(),
    );
    expect(screen.getByText(/nieoczekiwany kształt/)).toBeInTheDocument();
    // Żaden wiersz nie powstał — więc nic nie mogło się przedstawić jako wyznaczone.
    expect(screen.queryByTestId('mvd-koordynacja-nastawa-i_pickup_51_a')).toBeNull();
    expect(screen.queryByText(T.nastawyStanDostepna)).toBeNull();
  });
});
