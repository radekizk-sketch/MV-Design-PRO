/**
 * Sekcja „Warunki przyłączenia OSD" (karta F-K2, znalezisko Z2 audytu FLOW).
 *
 * METODA: mockowany jest GLOBALNY `fetch`, nie moduł `../api`. Dzięki temu test
 * ćwiczy REALNĄ ścieżkę: budowę adresu końcówki, parsowanie odpowiedzi, adapter
 * prezentacyjny i render. Mock na poziomie `../api` przeskakiwałby dwa z tych
 * ogniw (CLAUDE.md §Zero-Debt pkt 5 — test nie może omijać ścieżki produkcyjnej).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SekcjaWarunkowPrzylaczenia } from '../EkranJakosci';
import { JAKOSC_STRINGS } from '../strings';
import { przebiegTestowy } from './fixtures';
import type { OcenaWarunkow, WarunkiPrzylaczeniaResponse } from '../api';

const fetchMock = vi.fn();

function odpowiedz(ocena: Partial<OcenaWarunkow>): WarunkiPrzylaczeniaResponse {
  return {
    run_id: 'pf-1',
    case_id: 'case-1',
    analysis_type: 'PF',
    ocena: {
      punkt_przylaczenia: 'BUS-GPZ-SN',
      p_mw: -6.2,
      q_mvar: 0,
      s_mva: 6.2,
      cos_phi: 1,
      kierunek: 'oddawanie',
      status_ogolny: 'FAIL',
      pozycje: [],
      readiness_codes: [],
      formula_ref: 'cosφ = |P| / √(P² + Q²);  kryterium mocy: |P| ≤ P_limit',
      zalozenia: [],
      ...ocena,
    } as OcenaWarunkow,
  };
}

function props(over = {}) {
  return {
    przebieg: przebiegTestowy('pf-1', 'LOAD_FLOW'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function odpowiedzOk(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

describe('SekcjaWarunkowPrzylaczenia — realna ścieżka do końcówki', () => {
  it('woła właściwą końcówkę z identyfikatorem przebiegu', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          pozycje: [
            {
              kryterium: 'moc_w_punkcie_przylaczenia',
              status: 'FAIL',
              wartosc: 6.2,
              wymagana: 5,
              jednostka: 'MW',
              opis_pl: 'Moc oddawana do sieci 6.200 MW wobec limitu 5.000 MW (PRZEKROCZONY).',
              readiness_codes: [],
            },
          ],
        }),
      ),
    );
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki')).toBeTruthy());
    // WYSZUKANIE PO ADRESIE, NIE PO KOLEJNOSCI (V12K-265). Asercja celowala
    // w `calls[0]`, czyli zakladala, ze ta koncowka jest PIERWSZYM zapytaniem
    // sekcji. Gdy ekran zaczal dodatkowo pobierac kontrakt przebiegu (rewizja
    // modelu dla znacznika swiezosci), pierwszy stal sie inny adres i test
    // padal — mimo ze sprawdzana wlasciwosc byla spelniona. Intencja dotyczy
    // KONKRETNEJ koncowki, nie kolejnosci zapytan.
    const url = fetchMock.mock.calls
      .map(([u]) => String(u))
      .find((u) => u.includes('/api/quality/connection-conditions'));
    expect(url, 'brak zapytania do /api/quality/connection-conditions').toBeDefined();
    expect(url).toContain('run_id=pf-1');
  });

  it('brak przebiegu → nie woła końcówki i mówi, czego brakuje', () => {
    render(<SekcjaWarunkowPrzylaczenia {...props({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-warunki-brak')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.brakPrzebieguRozplywu)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('błąd końcówki → panel błędu, bez udawania wyniku', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ detail: 'zly rodzaj przebiegu' }),
    } as Response);
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki-blad')).toBeTruthy());
  });
});

describe('SekcjaWarunkowPrzylaczenia — werdykt', () => {
  it('przekroczony limit mocy pokazuje wartość zmierzoną i wymaganą', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          pozycje: [
            {
              kryterium: 'moc_w_punkcie_przylaczenia',
              status: 'FAIL',
              wartosc: 6.2,
              wymagana: 5,
              jednostka: 'MW',
              opis_pl: 'Moc oddawana do sieci 6.200 MW wobec limitu 5.000 MW (PRZEKROCZONY).',
              readiness_codes: [],
            },
            {
              kryterium: 'cos_phi_w_punkcie_przylaczenia',
              status: 'PASS',
              wartosc: 0.99,
              wymagana: 0.95,
              jednostka: '-',
              opis_pl: 'cosfi w punkcie 0.9900 wobec wymaganego 0.9500 (dotrzymany).',
              readiness_codes: [],
            },
          ],
        }),
      ),
    );
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki')).toBeTruthy());

    // Kryteria po polsku, nie klucze techniczne.
    expect(screen.getByText(JAKOSC_STRINGS.kryteriumMoc)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.kryteriumCosPhi)).toBeTruthy();
    // Werdykty: naruszone i spełnione obok siebie.
    expect(screen.getByText(JAKOSC_STRINGS.ocenaNaruszone)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.ocenaSpelnione)).toBeTruthy();
    // Punkt przyłączenia w założeniach — projektant musi wiedzieć, GDZIE zmierzono.
    expect(screen.getByText('BUS-GPZ-SN')).toBeTruthy();
  });

  it('stan trzeci: brak warunków OSD nie jest spełnieniem ani błędem', async () => {
    // Wszystkie pozycje NIESPRAWDZONE => sekcja pokazuje uczciwy stan z akcją
    // naprawczą, a NIE tabelę sugerującą, że coś oceniono.
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          status_ogolny: 'UNAVAILABLE',
          p_mw: null,
          q_mvar: null,
          s_mva: null,
          cos_phi: null,
          kierunek: null,
          readiness_codes: ['connection.power_limit_missing'],
          pozycje: [
            {
              kryterium: 'moc_w_punkcie_przylaczenia',
              status: 'UNAVAILABLE',
              wartosc: null,
              wymagana: null,
              jednostka: 'MW',
              opis_pl: 'Nie mozna ocenic mocy w punkcie przylaczenia — brak danych.',
              readiness_codes: ['connection.power_limit_missing'],
            },
            {
              kryterium: 'cos_phi_w_punkcie_przylaczenia',
              status: 'UNAVAILABLE',
              wartosc: null,
              wymagana: null,
              jednostka: '-',
              opis_pl: 'Nie mozna ocenic cosfi w punkcie przylaczenia — brak danych.',
              readiness_codes: ['connection.cos_phi_required_missing'],
            },
          ],
        }),
      ),
    );
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki-bez-danych')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.warunkiBrakWarunkow)).toBeTruthy();
    // Komunikat wskazuje, GDZIE uzupełnić dane (jawny następny krok).
    expect(screen.getByText(JAKOSC_STRINGS.warunkiBrakWarunkowOpis)).toBeTruthy();
    // Nie wolno pokazać tabeli werdyktu, gdy nic nie zostało ocenione.
    expect(screen.queryByTestId('mvd-jakosc-warunki')).toBeNull();
  });

  it('częściowa ocena pokazuje tabelę z jawnym stanem niesprawdzonym', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz({
          status_ogolny: 'PASS',
          pozycje: [
            {
              kryterium: 'moc_w_punkcie_przylaczenia',
              status: 'PASS',
              wartosc: 4.5,
              wymagana: 5,
              jednostka: 'MW',
              opis_pl: 'Moc oddawana do sieci 4.500 MW wobec limitu 5.000 MW (dotrzymany).',
              readiness_codes: [],
            },
            {
              kryterium: 'cos_phi_w_punkcie_przylaczenia',
              status: 'UNAVAILABLE',
              wartosc: null,
              wymagana: null,
              jednostka: '-',
              opis_pl: 'Brak wymaganego cosfi w warunkach OSD.',
              readiness_codes: ['connection.cos_phi_required_missing'],
            },
          ],
        }),
      ),
    );
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.ocenaSpelnione)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.ocenaNiesprawdzone)).toBeTruthy();
  });
});
