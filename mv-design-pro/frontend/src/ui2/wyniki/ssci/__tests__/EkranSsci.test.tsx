/*
 * Testy okna „Stabilność SSCI" (ui2/wyniki/ssci). Ćwiczą REALNĄ ścieżkę natywną
 * użytkownika (`fireEvent.click` na realnym przycisku JSX — bez syntetycznych
 * `dispatchEvent`): uczciwy stan bez aktywnego przypadku (bez API), utworzenie
 * przebiegu SSCI + pobranie widoku, rekord oceny i metryki w sekcji audytowej, uczciwy
 * stan „brak danych" (brak przekształtnika/DER) oraz ślad WHITE BOX tylko w trybie
 * eksperckim. API mockowane NA GRANICY fetch (ćwiczy też `api.ts`).
 *
 * Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): werdykt „stabilny / ryzyko SSCI /
 * niestabilny" i akcja decyzyjna z „ryzyka" skasowane; pełny iloczyn cech pilnuje
 * `uczciwosc.test.tsx`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSelectionStore } from '../../../../ui/selection/store';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranSsci } from '../EkranSsci';
import { widokBrakDanychFixture, widokZMetrykamiFixture } from './fixtures';
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

describe('EkranSsci — ścieżka natywna (ocena niewykonana)', () => {
  // Intencja zachowana: natywny klik tworzy przebieg i pobiera widok z metrykami.
  // Zmiana kanonu (odwrócone): dawny chip „niestabilny" (err) — metryki są materiałem
  // audytowym w zwiniętej sekcji, pierwszy plan niesie rekord oceny.
  it('klik „Uruchom" → utworzenie przebiegu, rekord oceny i metryki w sekcji audytowej', async () => {
    ustawFetch(widokZMetrykamiFixture());
    aktywujPrzypadek();
    render(<EkranSsci trybZaawansowania="basic" />);

    // Realna ścieżka natywna: kliknięcie przycisku uruchomienia.
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));

    expect(await screen.findByTestId('mvd-ssci-ocena')).toHaveAttribute(
      'data-status',
      'NIE_OCENIONO',
    );
    expect(screen.queryByTestId('mvd-ssci-chip-werdykt')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-ssci-audyt-przelacz'));
    expect(screen.getByTestId('mvd-ssci-metryka-czest-winna')).toHaveTextContent('34,50 Hz');
    expect(screen.getByTestId('mvd-ssci-metryka-margines')).toHaveTextContent('-3,50');
    expect(screen.getByTestId('mvd-ssci-metryka-max-gain')).toHaveTextContent('1,420');
    // Proweniencja obecna, braki nieobecne.
    expect(screen.getByTestId('mvd-ssci-prov')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-ssci-braki')).not.toBeInTheDocument();
  });

  it('brak danych karty (brak przekształtnika/DER) → uczciwy stan, bez metryk', async () => {
    ustawFetch(widokBrakDanychFixture());
    aktywujPrzypadek();
    render(<EkranSsci trybZaawansowania="basic" />);

    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));

    expect(await screen.findByTestId('mvd-ssci-ocena')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-ssci-braki')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-ssci-audyt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-ssci-metryki')).not.toBeInTheDocument();
  });
});

describe('EkranSsci — ślad WHITE BOX (tryb ekspercki)', () => {
  it('tryb podstawowy: brak śladu', async () => {
    ustawFetch(widokZMetrykamiFixture());
    aktywujPrzypadek();
    render(<EkranSsci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));
    await screen.findByTestId('mvd-ssci-ocena');
    expect(screen.queryByTestId('mvd-ssci-slad-blok')).not.toBeInTheDocument();
  });

  it('tryb ekspercki: ślad dostępny i rozwijany natywnym klikiem', async () => {
    ustawFetch(widokZMetrykamiFixture());
    aktywujPrzypadek();
    render(<EkranSsci trybZaawansowania="expert" />);
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));
    await screen.findByTestId('mvd-ssci-ocena');

    const otworz = screen.getByTestId('mvd-ssci-slad-otworz');
    expect(screen.queryByTestId('mvd-ssci-slad')).not.toBeInTheDocument();
    fireEvent.click(otworz);
    expect(screen.getByTestId('mvd-ssci-slad')).toBeInTheDocument();
  });
});

describe('EkranSsci — pętla decyzji bez werdyktu (F-K4 odwrócona)', () => {
  // Odwrócone: dawna akcja „Popraw w modelu" z „ryzyka SSCI" prowadziła do szyny
  // przyłączenia na podstawie L(f) z błędnym Z_grid. Bez oceny ryzyka nie ma przyczyny
  // do naprawy — akcja zniknęła dla KAŻDEGO widoku (także z węzłem w kontrakcie).
  it.each([
    ['komplet tablic z węzłem', widokZMetrykamiFixture],
    ['brak danych bez węzła', widokBrakDanychFixture],
  ] as const)('%s → brak przycisku decyzji', async (_opis, fixture) => {
    ustawFetch(fixture());
    aktywujPrzypadek();
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
    render(<EkranSsci trybZaawansowania="basic" />);
    fireEvent.click(screen.getByTestId('mvd-ssci-uruchom'));

    await screen.findByTestId('mvd-ssci-ocena');
    expect(screen.queryByTestId('mvd-ssci-popraw')).not.toBeInTheDocument();
    expect(useSelectionStore.getState().selectedElement).toBeNull();
  });
});
