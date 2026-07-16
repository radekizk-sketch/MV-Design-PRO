import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SekcjaWalidacji, SekcjaWiarygodnosci } from '../EkranJakosci';
import { JAKOSC_STRINGS } from '../strings';
import { WALIDACJA_FIXTURE, WIARYGODNOSC_FIXTURE, przebiegTestowy } from './fixtures';

vi.mock('../api', () => ({
  fetchWiarygodnoscZwarciowa: vi.fn(),
  fetchWalidacjaEnergetyczna: vi.fn(),
}));

import { fetchWalidacjaEnergetyczna, fetchWiarygodnoscZwarciowa } from '../api';

const mockedWiarygodnosc = vi.mocked(fetchWiarygodnoscZwarciowa);
const mockedWalidacja = vi.mocked(fetchWalidacjaEnergetyczna);

function propsWiarygodnosc(over = {}) {
  return {
    przebieg: przebiegTestowy('sc-1', 'SC_3F'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}
function propsWalidacja(over = {}) {
  return {
    przebieg: przebiegTestowy('pf-1', 'LOAD_FLOW'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  mockedWiarygodnosc.mockReset();
  mockedWalidacja.mockReset();
});

describe('SekcjaWiarygodnosci — stany', () => {
  it('brak przebiegu → uczciwa instrukcja, bez wołania API', () => {
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-wiarygodnosc-brak')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.brakPrzebieguZwarciowego)).toBeTruthy();
    expect(mockedWiarygodnosc).not.toHaveBeenCalled();
  });

  it('błąd pobrania → panel błędu', async () => {
    mockedWiarygodnosc.mockRejectedValue(new Error('boom'));
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc-blad')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.blad)).toBeTruthy();
  });

  it('gotowe → tabela z węzłami, statusy PL i podsumowanie', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    expect(mockedWiarygodnosc).toHaveBeenCalledWith('sc-1');
    expect(screen.getByText('Szyna A')).toBeTruthy();
    expect(screen.getByText('poza zakresem wiarygodności')).toBeTruthy();
    const podsum = screen.getByTestId('mvd-jakosc-wiarygodnosc-podsumowanie');
    expect(within(podsum).getAllByTestId('mvd-jakosc-chip')).toHaveLength(4);
  });

  it('kolumna blokady OSD pokazuje Tak/Nie', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    expect(screen.getAllByText('Tak').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nie').length).toBeGreaterThan(0);
  });

  it('wybór wiersza pokazuje why_pl w panelu szczegółu', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    // przed wyborem: panel pusty
    expect(screen.getByTestId('mvd-jakosc-wiarygodnosc-szczegol-pusty')).toBeTruthy();
    const wiersz = screen.getByText('Szyna B').closest('tr');
    fireEvent.click(wiersz!);
    const szczegol = screen.getByTestId('mvd-jakosc-wiarygodnosc-szczegol');
    expect(within(szczegol).getByText(WIARYGODNOSC_FIXTURE.items[1].why_pl)).toBeTruthy();
  });

  it('identyfikator węzła ukryty w trybie podstawowym', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    fireEvent.click(screen.getByText('Szyna A').closest('tr')!);
    expect(screen.queryByText('bus-A')).toBeNull();
  });

  it('identyfikator węzła widoczny w trybie eksperckim', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    render(<SekcjaWiarygodnosci {...propsWiarygodnosc({ trybZaawansowania: 'expert' })} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy());
    expect(screen.getAllByText('bus-A').length).toBeGreaterThan(0);
  });
});

describe('SekcjaWalidacji — stany', () => {
  it('brak przebiegu rozpływu → uczciwa instrukcja', () => {
    render(<SekcjaWalidacji {...propsWalidacja({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-walidacja-brak')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.brakPrzebieguRozplywu)).toBeTruthy();
    expect(mockedWalidacja).not.toHaveBeenCalled();
  });

  it('błąd pobrania → panel błędu', async () => {
    mockedWalidacja.mockRejectedValue(new Error('boom'));
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja-blad')).toBeTruthy());
  });

  it('gotowe → wszystkie rodzaje kontroli po polsku', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    expect(mockedWalidacja).toHaveBeenCalledWith('pf-1');
    for (const etykieta of [
      'Obciążenie gałęzi',
      'Obciążenie transformatora',
      'Odchylenie napięcia',
      'Budżet strat',
      'Bilans mocy biernej',
    ]) {
      expect(screen.getByText(etykieta)).toBeTruthy();
    }
  });

  it('progi z konfiguracji obecne w sekcji ZAŁOŻENIA', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.zalProgObciazeniaOstrz)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.zalProgNapieciaPrzekr)).toBeTruthy();
  });

  it('podsumowanie ma 4 chipy statusów', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    const podsum = screen.getByTestId('mvd-jakosc-walidacja-podsumowanie');
    expect(within(podsum).getAllByTestId('mvd-jakosc-chip')).toHaveLength(4);
  });

  it('wybór wiersza pokazuje why_pl i status PL w szczególe', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    render(<SekcjaWalidacji {...propsWalidacja()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    fireEvent.click(screen.getByText('Odchylenie napięcia').closest('tr')!);
    const szczegol = screen.getByTestId('mvd-jakosc-walidacja-szczegol');
    expect(within(szczegol).getByText(WALIDACJA_FIXTURE.items[2].why_pl)).toBeTruthy();
    expect(within(szczegol).getByText('Przekroczenie')).toBeTruthy();
  });
});
