import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EkranJakosci } from '../EkranJakosci';
import { JAKOSC_STRINGS } from '../strings';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import {
  MIGOTANIE_FIXTURE,
  WALIDACJA_FIXTURE,
  CIEPLNA_FIXTURE,
  WARUNKI_FIXTURE,
  WIARYGODNOSC_FIXTURE,
  przebiegTestowy,
} from './fixtures';

vi.mock('../api', () => ({
  fetchWiarygodnoscZwarciowa: vi.fn(),
  fetchWalidacjaEnergetyczna: vi.fn(),
  fetchMigotanie: vi.fn(),
  // Karta F-K2: sekcja warunków przyłączenia pobiera dane od razu po montażu,
  // więc jej brak w tym mocku wywracał całą kompozycję (undefined nie jest funkcją).
  fetchWarunkiPrzylaczenia: vi.fn(),
  // Karta F-K1 faza 4: sekcja cieplna rowniez pobiera dane od razu po montazu.
  fetchWytrzymaloscCieplna: vi.fn(),
}));

import {
  fetchMigotanie,
  fetchWalidacjaEnergetyczna,
  fetchWarunkiPrzylaczenia,
  fetchWiarygodnoscZwarciowa,
  fetchWytrzymaloscCieplna,
} from '../api';

const mockedWiarygodnosc = vi.mocked(fetchWiarygodnoscZwarciowa);
const mockedWalidacja = vi.mocked(fetchWalidacjaEnergetyczna);
const mockedMigotanie = vi.mocked(fetchMigotanie);
const mockedWarunki = vi.mocked(fetchWarunkiPrzylaczenia);
const mockedCieplna = vi.mocked(fetchWytrzymaloscCieplna);

function props(over = {}) {
  return { trybZaawansowania: 'basic' as const, onOtworzDowod: vi.fn(), ...over };
}

beforeEach(() => {
  useExecutionRunsStore.getState().reset();
  mockedWiarygodnosc.mockReset();
  mockedWalidacja.mockReset();
  mockedMigotanie.mockReset();
  mockedWarunki.mockReset();
  // Sekcja warunków przyłączenia jest stałym elementem kompozycji i pobiera dane od
  // razu, gdy istnieje bieg rozpływu. Domyślna odpowiedź zdejmuje ją z drogi testom
  // skupionym na innych sekcjach; jej własne zachowanie sprawdza warunkiPrzylaczenia.test.
  mockedWarunki.mockResolvedValue(WARUNKI_FIXTURE);
  mockedCieplna.mockResolvedValue(CIEPLNA_FIXTURE);
});

describe('EkranJakosci — kompozycja sekcji', () => {
  it('bez przebiegów w rejestrze → piec sekcji w stanie „brak przebiegu"', () => {
    render(<EkranJakosci {...props()} />);
    expect(screen.getByTestId('mvd-jakosc-wiarygodnosc-brak')).toBeTruthy();
    expect(screen.getByTestId('mvd-jakosc-walidacja-brak')).toBeTruthy();
    expect(screen.getByTestId('mvd-jakosc-migotanie-brak')).toBeTruthy();
    expect(screen.getByTestId('mvd-jakosc-warunki-brak')).toBeTruthy();
    expect(screen.getByTestId('mvd-jakosc-cieplna-brak')).toBeTruthy();
    expect(mockedWiarygodnosc).not.toHaveBeenCalled();
    expect(mockedWalidacja).not.toHaveBeenCalled();
    expect(mockedMigotanie).not.toHaveBeenCalled();
    expect(mockedWarunki).not.toHaveBeenCalled();
    expect(mockedCieplna).not.toHaveBeenCalled();
  });

  it('z przebiegami SC + LOAD_FLOW → pięć sekcji pobiera i renderują wynik', async () => {
    mockedWiarygodnosc.mockResolvedValue(WIARYGODNOSC_FIXTURE);
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    mockedMigotanie.mockResolvedValue(MIGOTANIE_FIXTURE);
    mockedWarunki.mockResolvedValue(WARUNKI_FIXTURE);
    useExecutionRunsStore.setState({
      runs: [przebiegTestowy('sc-1', 'SC_3F'), przebiegTestowy('pf-1', 'LOAD_FLOW')],
      activeRunId: null,
    });
    render(<EkranJakosci {...props()} />);
    await waitFor(() => {
      expect(screen.getByTestId('mvd-jakosc-wiarygodnosc')).toBeTruthy();
      expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy();
      expect(screen.getByTestId('mvd-jakosc-migotanie')).toBeTruthy();
    });
    expect(mockedWiarygodnosc).toHaveBeenCalledWith('sc-1');
    expect(mockedWalidacja).toHaveBeenCalledWith('pf-1');
    // Migotanie korzysta z tego samego przebiegu zwarciowego co wiarygodność.
    expect(mockedMigotanie).toHaveBeenCalledWith('sc-1');
    // Warunki przyłączenia korzystają z tego samego biegu rozpływu co walidacja (F-K2).
    expect(mockedWarunki).toHaveBeenCalledWith('pf-1');
    // Wytrzymalosc cieplna korzysta z biegu ZWARCIOWEGO (F-K1).
    expect(mockedCieplna).toHaveBeenCalledWith('sc-1');
  });

  it('niezależny dobór: tylko LOAD_FLOW → sekcja wiarygodności zgłasza brak przebiegu', async () => {
    mockedWalidacja.mockResolvedValue(WALIDACJA_FIXTURE);
    useExecutionRunsStore.setState({
      runs: [przebiegTestowy('pf-1', 'LOAD_FLOW')],
      activeRunId: null,
    });
    render(<EkranJakosci {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    expect(screen.getByTestId('mvd-jakosc-wiarygodnosc-brak')).toBeTruthy();
    expect(mockedWiarygodnosc).not.toHaveBeenCalled();
  });

  it('renderuje kontener okna jakości', () => {
    render(<EkranJakosci {...props()} />);
    expect(screen.getByTestId('mvd-jakosc-ekran')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.sekcjaWiarygodnosc)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.sekcjaWalidacja)).toBeTruthy();
  });
});
