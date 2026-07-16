import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { MacierzNcRfg } from '../MacierzNcRfg';
import { MACIERZ_STRINGS } from '../strings';
import { derFixture, katalogFixture, wynikFixture } from './fixtures';

vi.mock('../../../../ui/ncrfg-tests/api', () => ({
  fetchNcRfgTestCatalog: vi.fn(() => Promise.resolve(katalogFixture())),
  runNcRfgPtpireeTests: vi.fn(() => Promise.resolve(wynikFixture())),
}));

function ustawModuly(): void {
  useStationDerStore.setState({
    ders: {
      'pv-1': derFixture({ id: 'pv-1', name: 'PV Dach A', nominal_power_kw: 500 }),
      'bess-1': derFixture({
        id: 'bess-1',
        name: 'Magazyn energii 1',
        der_kind: 'BESS',
        nominal_power_kw: 800,
      }),
      'fw-1': derFixture({
        id: 'fw-1',
        name: 'Farma wiatrowa',
        der_kind: 'FW',
        voltage_level_ref: null,
        connection_side: 'SN',
      }),
    },
  });
}

beforeEach(() => ustawModuly());
afterEach(() => {
  useStationDerStore.setState({ ders: {} });
  vi.clearAllMocks();
});

describe('MacierzNcRfg — macierz test × moduł (kryterium 1)', () => {
  it('renderuje katalog testów jako wiersze i moduły jako kolumny', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    expect(await screen.findByText('Regulacja mocy czynnej od częstotliwości P(f)')).toBeInTheDocument();
    expect(screen.getAllByTestId('mvd-oze-wiersz')).toHaveLength(3);
    expect(screen.getByTestId('mvd-oze-modul-pv-1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-modul-bess-1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-modul-fw-1')).toBeInTheDocument();
  });

  it('renderuje legendę werdyktów po polsku', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const legenda = await screen.findByTestId('mvd-oze-legenda');
    expect(within(legenda).getByText('spełniony')).toBeInTheDocument();
    expect(within(legenda).getByText('niespełniony')).toBeInTheDocument();
    expect(within(legenda).getByText('niewymagany')).toBeInTheDocument();
  });
});

describe('MacierzNcRfg — bieg i werdykty (kryterium 1)', () => {
  it('przycisk uruchamia bieg i wypełnia komórki werdyktami z solvera', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const komorki = await screen.findAllByTestId('mvd-oze-komorka-wynik');
    expect(komorki.some((b) => b.textContent === 'spełniony')).toBe(true);
    expect(komorki.some((b) => b.textContent === 'niespełniony')).toBe(true);
  });
});

describe('MacierzNcRfg — komórka → szczegół (kryterium 2)', () => {
  it('kliknięcie komórki niespełnionej pokazuje uzasadnienie i akcję naprawczą', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const komorki = await screen.findAllByTestId('mvd-oze-komorka-wynik');
    fireEvent.click(komorki.find((b) => b.textContent === 'niespełniony')!);
    const szczegol = screen.getByTestId('mvd-oze-szczegol-wynik');
    expect(within(szczegol).getByText('Brak krzywej LVRT — moduł nie spełnia wymogu.')).toBeInTheDocument();
    expect(
      within(szczegol).getByText('Wybierz krzywą LVRT operatora w profilu modułu.'),
    ).toBeInTheDocument();
  });

  it('przycisk śladu rozwija kroki WHITE BOX testu inline (kanon pól)', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const komorki = await screen.findAllByTestId('mvd-oze-komorka-wynik');
    fireEvent.click(komorki.find((b) => b.textContent === 'niespełniony')!);
    fireEvent.click(screen.getByTestId('mvd-oze-slad-otworz'));
    const kroki = screen.getByTestId('mvd-oze-slad-kroki');
    expect(within(kroki).getByText('U_sim(t) >= U_LVRT,profile(t)')).toBeInTheDocument();
    expect(within(kroki).getByText('0,05 >= 0,15')).toBeInTheDocument();
    expect(within(kroki).getByText('p.u. vs p.u. — zgodne')).toBeInTheDocument();
    // Zwijanie: ponowny klik ukrywa ślad.
    fireEvent.click(screen.getByTestId('mvd-oze-slad-otworz'));
    expect(screen.queryByTestId('mvd-oze-slad-kroki')).not.toBeInTheDocument();
  });
});

describe('MacierzNcRfg — moduł bez napięcia (kryterium 3)', () => {
  it('moduł bez napięcia przyłączenia → kolumna „brak danych", panel z jawnym powodem', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    // fw-1 (SN, bez voltage_level_ref) — kolumna w stanie brak danych, bez 15 kV z powietrza.
    expect(await screen.findAllByTestId('mvd-oze-komorka-brak-danych')).not.toHaveLength(0);
    fireEvent.click(screen.getByTestId('mvd-oze-modul-fw-1'));
    expect(screen.getByTestId('mvd-oze-panel-blokada')).toHaveTextContent(
      MACIERZ_STRINGS.brakNapiecia,
    );
  });
});

describe('MacierzNcRfg — podsumowania (kryterium 4)', () => {
  it('pokazuje podsumowanie per projekt i per moduł po biegu', async () => {
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    const projekt = await screen.findByTestId('mvd-oze-podsum-projektu');
    expect(within(projekt).getByText('3')).toBeInTheDocument(); // 3 moduły
    const moduly = screen.getByTestId('mvd-oze-podsum-moduly');
    expect(within(moduly).getByText(/PV Dach A/)).toBeInTheDocument();
  });
});

describe('MacierzNcRfg — odcisk deterministyczny (§2.7)', () => {
  it('odcisk ukryty w trybie podstawowym, widoczny w eksperckim po biegu', async () => {
    const { rerender } = render(
      <MacierzNcRfg trybZaawansowania="basic" />,
    );
    fireEvent.click(await screen.findByTestId('mvd-oze-przeprowadz'));
    await screen.findAllByText('spełniony');
    expect(screen.queryByTestId('mvd-oze-odcisk')).not.toBeInTheDocument();
    rerender(<MacierzNcRfg trybZaawansowania="expert" />);
    expect(screen.getByTestId('mvd-oze-odcisk')).toHaveTextContent('det-9f8e7d6c');
  });
});

describe('MacierzNcRfg — stan pusty', () => {
  it('brak modułów → komunikat zamiast macierzy', () => {
    useStationDerStore.setState({ ders: {} });
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-oze-pusty')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-macierz-tabela')).not.toBeInTheDocument();
  });
});
