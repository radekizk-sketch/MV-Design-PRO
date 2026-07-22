/*
 * Testy sekcji „Migotanie i szybkie zmiany napięcia" (P37) okna „Jakość wyników".
 * Weryfikują: uczciwy stan bez przebiegu (bez API), pobranie po przebiegu
 * zwarciowym, stan błędu, tabelę węzłów z werdyktem i tagiem przekroczenia, chipy
 * podsumowania, rozwinięcie wiersza → moduły (w tym pominięty z powodem PL),
 * założenia z konfiguracji oraz ślad WHITE BOX w trybie eksperckim. API mockowane;
 * fixtures 1:1 z `build_migotanie_view`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { SekcjaMigotania } from '../EkranJakosci';
import { JAKOSC_STRINGS } from '../strings';
import { MIGOTANIE_FIXTURE, przebiegTestowy } from './fixtures';
import { useSelectionStore } from '../../../../ui/selection/store';
import { useShellStore } from '../../../shell/useShellStore';

vi.mock('../api', () => ({
  fetchWiarygodnoscZwarciowa: vi.fn(),
  fetchWalidacjaEnergetyczna: vi.fn(),
  fetchMigotanie: vi.fn(),
}));

import { fetchMigotanie } from '../api';

const mockedMigotanie = vi.mocked(fetchMigotanie);

function propsMigotanie(over = {}) {
  return {
    przebieg: przebiegTestowy('sc-1', 'SC_3F'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  mockedMigotanie.mockReset();
});

describe('SekcjaMigotania — stany', () => {
  it('brak przebiegu zwarciowego → uczciwa instrukcja, bez wołania API', () => {
    render(<SekcjaMigotania {...propsMigotanie({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-migotanie-brak')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.brakMigotanie)).toBeTruthy();
    expect(mockedMigotanie).not.toHaveBeenCalled();
  });

  it('błąd pobrania → panel błędu', async () => {
    mockedMigotanie.mockRejectedValue(new Error('boom'));
    render(<SekcjaMigotania {...propsMigotanie()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie-blad')).toBeTruthy());
  });

  it('gotowe → tabela z węzłami, werdykty PL i wołanie z przebiegiem zwarciowym', async () => {
    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    render(<SekcjaMigotania {...propsMigotanie()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy());
    expect(mockedMigotanie).toHaveBeenCalledWith('sc-1');
    const tabela = screen.getByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('bus-oze-1');
    expect(tabela).toHaveTextContent('przekroczenie poziomu planowania');
    // Wartości z przecinkiem PL (Pst 3 miejsca).
    expect(tabela).toHaveTextContent('0,400');
  });

  it('przekroczenie poziomu planowania → tag ostrzegawczy w wierszu', async () => {
    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    render(<SekcjaMigotania {...propsMigotanie()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy());
    expect(screen.getAllByTestId('mvd-wyn-tag-ostrzezenie').length).toBeGreaterThan(0);
  });

  it('podsumowanie ma trzy chipy (ocenione/przekroczenia/nieocenione)', async () => {
    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    render(<SekcjaMigotania {...propsMigotanie()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy());
    const podsum = screen.getByTestId('mvd-jakosc-migotanie-podsumowanie');
    expect(within(podsum).getAllByTestId('mvd-jakosc-chip')).toHaveLength(3);
  });

  it('założenia z konfiguracji obecne (poziomy planowania)', async () => {
    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    render(<SekcjaMigotania {...propsMigotanie()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.zalMigPst)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.zalMigM)).toBeTruthy();
  });

  it('wybór wiersza → moduły węzła, moduł pominięty z powodem PL', async () => {
    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    render(<SekcjaMigotania {...propsMigotanie()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy());
    // Przed wyborem: panel pusty.
    expect(screen.getByTestId('mvd-jakosc-migotanie-szczegol-pusty')).toBeTruthy();
    fireEvent.click(screen.getByText('bus-oze-1').closest('tr')!);
    const szczegol = screen.getByTestId('mvd-jakosc-migotanie-szczegol');
    expect(within(szczegol).getByText('gen-pv-2')).toBeTruthy();
    expect(screen.getByTestId('mvd-jakosc-mig-modul-info')).toHaveTextContent(
      'brak współczynnika emisji migotania',
    );
  });

  it('ślad WHITE BOX ukryty w trybie podstawowym, dostępny w eksperckim', async () => {
    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    const { unmount } = render(<SekcjaMigotania {...propsMigotanie()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy());
    fireEvent.click(screen.getByText('bus-oze-1').closest('tr')!);
    expect(screen.queryByTestId('mvd-jakosc-mig-slad-otworz')).toBeNull();
    unmount();

    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    render(<SekcjaMigotania {...propsMigotanie({ trybZaawansowania: 'expert' })} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy());
    fireEvent.click(screen.getByText('bus-oze-1').closest('tr')!);
    fireEvent.click(screen.getByTestId('mvd-jakosc-mig-slad-otworz'));
    const slad = screen.getByTestId('mvd-jakosc-mig-slad');
    // Zasada KaTeX (2026-07-22): wzor renderowany matematycznie, nie surowy LaTeX.
    const wzory = within(slad).getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThan(0);
    expect(wzory[0].getAttribute('data-latex')).toContain('P_{st');
  });

  it('przekroczenie migotania → „Popraw" zaznacza węzeł (Bus) i przechodzi do „Schemat" (F-E6.2)', async () => {
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    useShellStore.setState({ activeSpace: 'wyniki' });
    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    render(<SekcjaMigotania {...propsMigotanie()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy());
    // Fixtura: bus-oze-2 przekracza poziom planowania (pst/plt) → jedyny wiersz z przyciskiem.
    const wiersz = screen.getByText('bus-oze-2').closest('tr')!;
    fireEvent.click(within(wiersz).getByTestId('mvd-wyn-popraw'));
    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toMatchObject({ id: 'bus-oze-2', type: 'Bus' });
    expect(sel.sldCenterOnElement).toBe('bus-oze-2');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });
});
