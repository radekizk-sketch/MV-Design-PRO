/*
 * Testy okna „Stabilność SSCI" (ui2/wyniki/ssci). Ćwiczą REALNĄ ścieżkę natywną
 * użytkownika (`fireEvent.click` na realnym przycisku JSX — bez syntetycznych
 * `dispatchEvent`): uczciwy stan bez aktywnego przypadku (bez API), utworzenie
 * przebiegu SSCI + pobranie werdyktu, render chipu werdyktu i metryk, uczciwy stan
 * „brak danych" (brak przekształtnika/DER) oraz ślad WHITE BOX tylko w trybie
 * eksperckim. API mockowane NA GRANICY fetch (ćwiczy też `api.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { EkranSsci } from '../EkranSsci';
import {
  widokBrakDanychFixture,
  widokNiestabilnyFixture,
} from './fixtures';
import type { WidokStabilnosciSsci } from '../api';

const CASE_ID = 'case-ssci-1';
const RUN_ID = 'run-ssci-abc';

/** Mock fetch: POST tworzy przebieg (zwraca run_id), GET zwraca podany werdykt. */
function ustawFetch(widok: WidokStabilnosciSsci): void {
  const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const metoda = init?.method ?? 'GET';
    if (metoda === 'POST' && adres.includes('/runs/v126/ssci_impedance')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ run_id: RUN_ID, status: 'FINISHED', deterministic_hash: 'hash-ssci' }),
      } as Response;
    }
    if (metoda === 'GET' && adres.includes('/results/v126/ssci_impedance/stability')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => widok,
      } as Response;
    }
    throw new Error(`Nieoczekiwane wywołanie fetch: ${metoda} ${adres}`);
  });
  vi.stubGlobal('fetch', mock);
}

function aktywujPrzypadek(): void {
  useAppStateStore.setState({ activeCaseId: CASE_ID });
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('EkranSsci — stany wejściowe', () => {
  it('bez aktywnego przypadku → uczciwa instrukcja, bez wołań API', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<EkranSsci trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-ssci-brak-przypadku')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-ssci-uruchom')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('EkranSsci — ścieżka natywna werdyktu', () => {
  it('klik „Uruchom" → utworzenie przebiegu + werdykt niestabilny z metrykami', async () => {
    ustawFetch(widokNiestabilnyFixture());
    aktywujPrzypadek();
    render(<EkranSsci trybZaawansowania="basic" />);

    // Realna ścieżka natywna: kliknięcie przycisku uruchomienia.
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));

    const chip = await screen.findByTestId('mvd-ssci-chip-werdykt');
    expect(chip).toHaveTextContent('niestabilny');
    expect(chip.className).toContain('mvd-ssci-chip--err');

    // Werdykt „niestabilny": częstotliwość winna + margines fazy widoczne.
    expect(screen.getByTestId('mvd-ssci-metryka-czest-winna')).toHaveTextContent('34,50 Hz');
    expect(screen.getByTestId('mvd-ssci-metryka-margines')).toHaveTextContent('-3,50');
    expect(screen.getByTestId('mvd-ssci-metryka-max-gain')).toHaveTextContent('1,420');
    // Proweniencja obecna, braki nieobecne.
    expect(screen.getByTestId('mvd-ssci-prov')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-ssci-braki')).not.toBeInTheDocument();
  });

  it('werdykt „brak danych" (brak przekształtnika/DER) → uczciwy stan, bez metryk', async () => {
    ustawFetch(widokBrakDanychFixture());
    aktywujPrzypadek();
    render(<EkranSsci trybZaawansowania="basic" />);

    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));

    const chip = await screen.findByTestId('mvd-ssci-chip-werdykt');
    expect(chip).toHaveTextContent('brak danych');
    expect(screen.getByTestId('mvd-ssci-braki')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-ssci-metryki')).not.toBeInTheDocument();
  });
});

describe('EkranSsci — ślad WHITE BOX (tryb ekspercki)', () => {
  it('tryb podstawowy: brak śladu', async () => {
    ustawFetch(widokNiestabilnyFixture());
    aktywujPrzypadek();
    render(<EkranSsci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));
    await screen.findByTestId('mvd-ssci-chip-werdykt');
    expect(screen.queryByTestId('mvd-ssci-slad-blok')).not.toBeInTheDocument();
  });

  it('tryb ekspercki: ślad dostępny i rozwijany natywnym klikiem', async () => {
    ustawFetch(widokNiestabilnyFixture());
    aktywujPrzypadek();
    render(<EkranSsci trybZaawansowania="expert" />);
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));
    await screen.findByTestId('mvd-ssci-chip-werdykt');

    const otworz = screen.getByTestId('mvd-ssci-slad-otworz');
    expect(screen.queryByTestId('mvd-ssci-slad')).not.toBeInTheDocument();
    fireEvent.click(otworz);
    expect(screen.getByTestId('mvd-ssci-slad')).toBeInTheDocument();
  });
});
