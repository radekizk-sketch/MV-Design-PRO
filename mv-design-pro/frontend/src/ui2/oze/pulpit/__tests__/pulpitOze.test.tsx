/*
 * Testy komponentu pulpitu instalacji OZE (PulpitOze, karta P47) + regresja
 * wspólnego store'a: bieg uruchomiony w pulpicie jest widoczny w macierzy
 * (jeden stan — kryterium 4). API mockowane (determinizm).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { MacierzNcRfg } from '../../macierz';
import { useNcRfgStore } from '../../ncRfgStore';
import { derFixture, katalogFixture, wynikFixture } from '../../macierz/__tests__/fixtures';
import { PulpitOze } from '../PulpitOze';
import { PULPIT_STRINGS } from '../strings';

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
        catalogs: { battery_catalog_ref: 'bat-1' },
      }),
    },
  });
}

const noop = (): void => {};

beforeEach(() => {
  useNcRfgStore.getState().reset();
  ustawModuly();
});
afterEach(() => {
  useStationDerStore.setState({ ders: {} });
  useNcRfgStore.getState().reset();
  vi.clearAllMocks();
});

describe('PulpitOze — lista modułów (kryterium 1)', () => {
  it('renderuje moduły projektu, przed biegiem status „nieprzeprowadzone"', async () => {
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    expect(await screen.findByTestId('mvd-oze-pulpit-poz-pv-1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-pulpit-poz-bess-1')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-pulpit-poz-status-pv-1')).toHaveTextContent(
      'testy nieprzeprowadzone',
    );
  });

  it('brak modułów → komunikat zamiast pulpitu', () => {
    useStationDerStore.setState({ ders: {} });
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    expect(screen.getByTestId('mvd-oze-pulpit-pusty')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-oze-pulpit-lista')).not.toBeInTheDocument();
  });
});

describe('PulpitOze — bieg i zgodność (kryteria 1–2)', () => {
  it('po biegu status modułu i podsumowanie zgodności pochodzą z backendu', async () => {
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    fireEvent.click(await screen.findByTestId('mvd-oze-pulpit-przeprowadz'));
    // Domyślnie wybrany bess-1 (sort po id) — niezgodny, z testem niespełnionym.
    expect(await screen.findByTestId('mvd-oze-pulpit-zgodnosc-status')).toHaveTextContent(
      'niezgodny',
    );
    const niespelnione = screen.getAllByTestId('mvd-oze-pulpit-niespelniony');
    expect(niespelnione).toHaveLength(1);
    expect(
      within(niespelnione[0]).getByText('Wybierz krzywą LVRT operatora w profilu modułu.'),
    ).toBeInTheDocument();
  });
});

describe('PulpitOze — praca magazynu (sekcja 3)', () => {
  it('sekcja magazynu widoczna dla BESS z danymi, ukryta dla PV', async () => {
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    // bess-1 wybrany domyślnie i ma katalog baterii → sekcja obecna.
    expect(await screen.findByTestId('mvd-oze-pulpit-magazyn')).toBeInTheDocument();
    // Przełączenie na PV → sekcja pominięta (nie atrapa).
    fireEvent.click(screen.getByTestId('mvd-oze-pulpit-poz-pv-1'));
    expect(screen.queryByTestId('mvd-oze-pulpit-magazyn')).not.toBeInTheDocument();
  });
});

describe('PulpitOze — analizy niewpięte (sekcja 4)', () => {
  it('renderuje jawny stan „analiza niewpięta" i TODO-KARTĘ', async () => {
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    expect(await screen.findByTestId('mvd-oze-pulpit-zdolnosc-stan')).toHaveTextContent(
      PULPIT_STRINGS.analizaNiewpieta,
    );
    expect(screen.getByTestId('mvd-oze-pulpit-jakosc-stan')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-pulpit-todo')).toBeInTheDocument();
  });
});

describe('PulpitOze — dokumenty (sekcja 5)', () => {
  it('przycisk dokumentów woła callback nawigacji z propsów', async () => {
    const onNawiguj = vi.fn();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={onNawiguj} />);
    fireEvent.click(await screen.findByTestId('mvd-oze-pulpit-dokumenty-przejdz'));
    expect(onNawiguj).toHaveBeenCalledWith('dokumentacja');
  });
});

describe('PulpitOze — wspólny store z macierzą (kryterium 4)', () => {
  it('bieg przeprowadzony w pulpicie jest widoczny w macierzy', async () => {
    render(
      <>
        <PulpitOze trybZaawansowania="basic" onNawiguj={noop} />
        <MacierzNcRfg trybZaawansowania="basic" />
      </>,
    );
    // Przed biegiem macierz nie ma komórek wynikowych.
    expect(screen.queryAllByTestId('mvd-oze-komorka-wynik')).toHaveLength(0);
    fireEvent.click(await screen.findByTestId('mvd-oze-pulpit-przeprowadz'));
    // Bieg w pulpicie → macierz wypełniona werdyktami z tego samego stanu.
    expect((await screen.findAllByTestId('mvd-oze-komorka-wynik')).length).toBeGreaterThan(0);
  });

  it('odcisk deterministyczny biegu widoczny w trybie eksperckim', async () => {
    render(<PulpitOze trybZaawansowania="expert" onNawiguj={noop} />);
    fireEvent.click(await screen.findByTestId('mvd-oze-pulpit-przeprowadz'));
    expect(await screen.findByTestId('mvd-oze-pulpit-odcisk')).toHaveTextContent('det-9f8e7d6c');
  });
});
