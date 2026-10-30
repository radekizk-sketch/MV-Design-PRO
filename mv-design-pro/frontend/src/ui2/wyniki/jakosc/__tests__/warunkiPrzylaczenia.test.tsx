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
import { R, przebiegTestowy } from './fixtures';
import type { OcenaWarunkow, WarunkiPrzylaczeniaResponse } from '../api';

const fetchMock = vi.fn();

/** Odpowiedź końcówki z oceną WYGENEROWANĄ backendem (`ocen_warunki_przylaczenia`). */
function odpowiedz(ocena: unknown): WarunkiPrzylaczeniaResponse {
  return {
    run_id: 'pf-1',
    case_id: 'case-1',
    analysis_type: 'PF',
    ocena: ocena as OcenaWarunkow,
  };
}

function props(over = {}) {
  return {
    przebieg: przebiegTestowy('pf-1', 'LOAD_FLOW'),
    szczegolyAudytowe: false as const,
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
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz(R.warunki_nie_spelnia)));
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

/** Wszystkie teksty rekordów (zdanie, przyczyna, braki, etykiety) — do kontroli języka. */
function tekstyRekordu(rekord: {
  wyjasnienie: { zdanie_pl: string; przyczyna_pl?: string | null; czego_brakuje?: readonly string[] };
  etykieta: { etykieta_pl: string };
}): string[] {
  return [
    rekord.wyjasnienie.zdanie_pl,
    rekord.wyjasnienie.przyczyna_pl ?? '',
    ...(rekord.wyjasnienie.czego_brakuje ?? []),
    rekord.etykieta.etykieta_pl,
  ];
}

const SUROWE_KODY = /\b(SPELNIA|NIE_SPELNIA|NIE_OCENIONO|BRAK_PODSTAWY|BRAK_DOWODU|PASS|FAIL|UNAVAILABLE|None|True|False|undefined|null)\b/;

describe('SekcjaWarunkowPrzylaczenia — werdykt (iloczyn: spełnia × narusza × brak warunków × brak rozpływu × częściowo)', () => {
  it('naruszenie: etykiety kryteriów i agregatu wyłącznie z rekordów backendu', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz(R.warunki_nie_spelnia)));
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki')).toBeTruthy());

    expect(screen.getByText(JAKOSC_STRINGS.kryteriumMoc)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.kryteriumCosPhi)).toBeTruthy();
    const pozycje = R.warunki_nie_spelnia.pozycje;
    expect(pozycje.map((p) => p.ocena.status_maszynowy)).toEqual(['NIE_SPELNIA', 'NIE_SPELNIA']);
    expect(screen.getAllByText(pozycje[0].ocena.etykieta.etykieta_pl).length).toBeGreaterThan(0);
    // Agregat W prowadzi do karty z wyjaśnieniem (nie sam status).
    expect(screen.getAllByText(R.warunki_nie_spelnia.ocena_wymagania.etykieta.etykieta_pl).length).toBeGreaterThan(0);
    expect(screen.getByText('BUS-PWP')).toBeTruthy();
  });

  it('spełnienie: etykieta rekordu „spełnione — dowód niepełny", nie skrót „spełnione"', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz(R.warunki_spelnia)));
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki')).toBeTruthy());
    const etykieta = R.warunki_spelnia.pozycje[0].ocena.etykieta.etykieta_pl;
    expect(R.warunki_spelnia.pozycje[0].ocena.kompletnosc_dowodu).toBe('NIEPELNY');
    expect(screen.getAllByText(etykieta).length).toBeGreaterThanOrEqual(2);
  });

  it('stan trzeci: brak warunków OSD nie jest spełnieniem ani błędem', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz(R.warunki_brak_warunkow)));
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki-bez-danych')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.warunkiBrakWarunkow)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.warunkiBrakWarunkowOpis)).toBeTruthy();
    expect(screen.queryByTestId('mvd-jakosc-warunki')).toBeNull();
  });

  it('brak przepływu w punkcie to INNY brak niż brak warunków — tabela z oceną niewykonaną', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz(R.warunki_brak_rozplywu)));
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki')).toBeTruthy());
    const pozycja = R.warunki_brak_rozplywu.pozycje[0];
    expect(pozycja.ocena.status_maszynowy).toBe('NIE_OCENIONO');
    expect(screen.getAllByText(pozycja.ocena.etykieta.etykieta_pl).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('mvd-jakosc-warunki-bez-danych')).toBeNull();
  });

  it('częściowa ocena: agregat nie jest spełnieniem, gdy jedno kryterium nie ma podstawy', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz(R.warunki_czesciowe)));
    render(<SekcjaWarunkowPrzylaczenia {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-warunki')).toBeTruthy());
    const [moc, cosPhi] = R.warunki_czesciowe.pozycje;
    expect(moc.ocena.status_maszynowy).toBe('SPELNIA');
    expect(cosPhi.ocena.status_maszynowy).toBe('BRAK_PODSTAWY');
    // Brak danych ≠ spełnia: agregat W nie jest „spełnione".
    expect(R.warunki_czesciowe.ocena_wymagania.status_maszynowy).not.toBe('SPELNIA');
    expect(screen.getAllByText(moc.ocena.etykieta.etykieta_pl).length).toBeGreaterThan(0);
    expect(screen.getAllByText(cosPhi.ocena.etykieta.etykieta_pl).length).toBeGreaterThan(0);
  });

  it('język rekordów: bez surowych kodów, bez None/True, liczby z przecinkiem', () => {
    const sceny = [
      R.warunki_spelnia,
      R.warunki_nie_spelnia,
      R.warunki_brak_warunkow,
      R.warunki_brak_rozplywu,
      R.warunki_czesciowe,
    ];
    for (const scena of sceny) {
      const rekordy = [scena.ocena_wymagania, ...scena.pozycje.map((p) => p.ocena)];
      for (const rekord of rekordy) {
        for (const tekst of tekstyRekordu(rekord)) {
          expect(tekst).not.toMatch(SUROWE_KODY);
          expect(tekst).not.toMatch(/\d\.\d+\s?(MW|Mvar|MVA)\b/);
        }
      }
      for (const p of scena.pozycje) expect(p.opis_pl).not.toMatch(/\d\.\d/);
    }
  });
});
