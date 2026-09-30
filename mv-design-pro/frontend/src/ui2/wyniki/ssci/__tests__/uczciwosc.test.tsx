/*
 * Uczciwość natychmiastowa (2026-09-23) — okno „Stabilność SSCI" NIE wystawia werdyktu
 * „stabilny / ryzyko SSCI / niestabilny". Z_grid(f) solvera liczone jest bez przekładni
 * transformatora (dla szyny 0,4 kV około 1400 razy za duże), więc wzmocnienie pętli
 * L = Z_grid/Z_conv i każdy wniosek z kryterium Nyquista są niewiarygodne.
 *
 * ILOCZYN CECH: widok (komplet tablic ze strefą ujemnej rezystancji / komplet bez niej /
 * brak danych karty) × miejsce (pierwszy plan / sekcja audytowa / akcja „Popraw w
 * modelu"). Pierwszy plan: rekord oceny z backendu + wskaźnik strefy ujemnej rezystancji
 * przekształtnika (zależy tylko od jego modelu); metryki L(f) wyłącznie w zwiniętej
 * sekcji audytowej; żadnego chipu werdyktu ani akcji decyzyjnej opartej na „ryzyku".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import * as model from '../model';
import { EkranSsci } from '../EkranSsci';
import type { WidokStabilnosciSsci } from '../api';
import {
  widokBezRezystancjiUjemnejFixture,
  widokBrakDanychFixture,
  widokZMetrykamiFixture,
} from './fixtures';

function ustawFetch(widok: WidokStabilnosciSsci): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const adres = String(url);
      if ((init?.method ?? 'GET') === 'POST') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ run_id: 'run-1', status: 'FINISHED', deterministic_hash: 'h' }),
        } as Response;
      }
      if (adres.includes('/results/v126/ssci_impedance/stability')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => widok } as Response;
      }
      throw new Error(`Nieoczekiwane wywołanie fetch: ${adres}`);
    }),
  );
}

const DAWNE = ['stabilny', 'ryzyko SSCI', 'niestabilny', 'Werdykt'];

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: 'case-ssci-1' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useAppStateStore.setState({ activeCaseId: null });
});

describe.each([
  ['komplet tablic, strefa ujemnej rezystancji obecna', widokZMetrykamiFixture],
  ['komplet tablic bez strefy ujemnej rezystancji', widokBezRezystancjiUjemnejFixture],
  ['brak danych karty przekształtnika', widokBrakDanychFixture],
] as const)('EkranSsci — %s', (_opis, fixture) => {
  it('pierwszy plan: rekord oceny z backendu, zero werdyktu i akcji decyzyjnej', async () => {
    const widok = fixture();
    ustawFetch(widok);
    render(<EkranSsci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));
    const wynik = await screen.findByTestId('mvd-ssci-wynik');

    expect(screen.getByTestId('mvd-ssci-ocena')).toHaveAttribute('data-status', 'NIE_OCENIONO');
    const karta = `mvd-werdykt-${widok.ocena.kryterium_id}`;
    expect(screen.getByTestId(`${karta}-etykieta`)).toHaveTextContent('Ocena niewykonana');
    expect(screen.getByTestId(`${karta}-zdanie`)).toHaveTextContent(
      widok.ocena.wyjasnienie.zdanie_pl,
    );
    // Powód (Z_grid bez przekładni transformatora) i brak wyroczni — z backendu.
    expect(screen.getByTestId(`${karta}-czego-brakuje`)).toHaveTextContent('1400');
    expect(screen.queryByTestId('mvd-ssci-chip-werdykt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-ssci-popraw')).not.toBeInTheDocument();
    for (const tekst of DAWNE) expect(wynik).not.toHaveTextContent(tekst);
    // Metryki kryterium impedancyjnego NIE są na pierwszym planie.
    expect(screen.queryByTestId('mvd-ssci-metryki')).not.toBeInTheDocument();
  });

  it('wskaźnik strefy ujemnej rezystancji przekształtnika zostaje informacją na pierwszym planie', async () => {
    const widok = fixture();
    ustawFetch(widok);
    render(<EkranSsci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));
    await screen.findByTestId('mvd-ssci-wynik');
    const rezystancja = screen.getByTestId('mvd-ssci-rezystancja-ujemna');
    if (widok.verdict.negative_resistance_present) {
      expect(rezystancja).toHaveTextContent('obecna');
      expect(rezystancja).toHaveTextContent('28,00 Hz');
      expect(rezystancja).toHaveTextContent('-0,0125 Ω');
    } else {
      expect(rezystancja).toHaveTextContent('brak');
    }
  });
});

describe('EkranSsci — sekcja audytowa metryk', () => {
  it('metryki L(f) dostępne wyłącznie po rozwinięciu sekcji audytowej', async () => {
    ustawFetch(widokZMetrykamiFixture());
    render(<EkranSsci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));
    await screen.findByTestId('mvd-ssci-wynik');
    const audyt = screen.getByTestId('mvd-ssci-audyt');
    expect(audyt).toHaveTextContent('nie jest wynikiem inżynierskim');
    expect(screen.queryByTestId('mvd-ssci-metryki')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-ssci-audyt-przelacz'));
    expect(screen.getByTestId('mvd-ssci-metryki')).toHaveTextContent('1,420');
  });

  it('model prezentacji nie mapuje już werdyktu na kolor ani etykietę', () => {
    expect('istotnoscWerdyktu' in model).toBe(false);
    expect('etykietaWerdyktu' in model).toBe(false);
  });
});
