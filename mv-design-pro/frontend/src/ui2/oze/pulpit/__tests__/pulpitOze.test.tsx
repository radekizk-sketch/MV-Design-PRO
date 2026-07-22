/*
 * Testy komponentu pulpitu instalacji OZE (PulpitOze, karta P47) + regresja
 * wspólnego store'a: bieg uruchomiony w pulpicie jest widoczny w macierzy
 * (jeden stan — kryterium 4). API mockowane (determinizm).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { MacierzNcRfg } from '../../macierz';
import { useNcRfgStore } from '../../ncRfgStore';
import { derFixture, katalogFixture, wynikFixture } from '../../macierz/__tests__/fixtures';
import { PulpitOze } from '../PulpitOze';
import { PULPIT_STRINGS } from '../strings';

vi.mock('../../../../ui/ncrfg-tests/api', () => ({
  fetchNcRfgTestCatalog: vi.fn(() => Promise.resolve(katalogFixture())),
  runNcRfgPtpireeTests: vi.fn(() => Promise.resolve(wynikFixture())),
}));

// Sekcje analiz P47a — katalog konwerterów i końcówki D1 mockowane (bez przebiegów
// w store'ie sekcje analiz pozostają w stanie „przeprowadź analizę …").
vi.mock('../../api', () => ({
  pobierzKonwertery: vi.fn(() => Promise.resolve([])),
  pobierzSileSieci: vi.fn(() => Promise.resolve(null)),
  pobierzAdekwatnoscQ: vi.fn(() => Promise.resolve(null)),
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
  useExecutionRunsStore.getState().reset();
  ustawModuly();
});
afterEach(() => {
  useStationDerStore.setState({ ders: {} });
  useNcRfgStore.getState().reset();
  useExecutionRunsStore.getState().reset();
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

  it('brak modułów → komunikat zamiast pulpitu', async () => {
    useStationDerStore.setState({ ders: {} });
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    // Montaż pobiera katalog wymogów (mikrotaski). Czekamy na realny stan
    // końcowy UI — pole „wersja procedury" w nagłówku pojawia się dopiero po
    // załadowaniu katalogu — żeby aktualizacja store'a domknęła się w act.
    expect(await screen.findByText('PTPiREE Procedura testowania v3.0')).toBeInTheDocument();
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

describe('PulpitOze — analizy wpięte (sekcje 4a/4b)', () => {
  it('bez przebiegów sekcje siły sieci i mocy biernej pokazują jawne instrukcje', async () => {
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    expect(await screen.findByTestId('mvd-oze-sila-brak-przebiegu')).toHaveTextContent(
      PULPIT_STRINGS.silaBrakPrzebiegu,
    );
    expect(screen.getByTestId('mvd-oze-adekw-brak-przebiegu')).toHaveTextContent(
      PULPIT_STRINGS.adekwBrakPrzebiegu,
    );
  });
});

describe('PulpitOze — wyróżnienie moduł→węzeł (P47b)', () => {
  it('klik modułu włącza wyróżnienie, ponowny klik je wyłącza (bez martwego klika)', async () => {
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    const pozPv = await screen.findByTestId('mvd-oze-pulpit-poz-pv-1');
    // Przed klikiem moduł nie jest wyróżniony.
    expect(pozPv).not.toHaveAttribute('data-wyrozniony');
    // Pierwszy klik: moduł wybrany i wyróżniony.
    fireEvent.click(pozPv);
    expect(pozPv).toHaveAttribute('data-wyrozniony', 'true');
    expect(pozPv).toHaveAttribute('aria-pressed', 'true');
    // Ponowny klik tego samego modułu: wyróżnienie zdjęte, moduł nadal wybrany.
    fireEvent.click(pozPv);
    expect(pozPv).not.toHaveAttribute('data-wyrozniony');
    expect(pozPv).toHaveAttribute('aria-pressed', 'true');
  });

  it('wyróżnienie przenosi się na inny moduł po jego kliknięciu', async () => {
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    const pozPv = await screen.findByTestId('mvd-oze-pulpit-poz-pv-1');
    const pozBess = screen.getByTestId('mvd-oze-pulpit-poz-bess-1');
    fireEvent.click(pozPv);
    expect(pozPv).toHaveAttribute('data-wyrozniony', 'true');
    fireEvent.click(pozBess);
    expect(pozBess).toHaveAttribute('data-wyrozniony', 'true');
    expect(pozPv).not.toHaveAttribute('data-wyrozniony');
    // Powrót karty na BESS montuje sekcję magazynu od nowa — jej fetch katalogu
    // BESS (mock: pusta lista) kończy się realnym stanem „pozycja katalogowa
    // nieodnaleziona". Czekamy na ten stan końcowy, żeby aktualizacja
    // SekcjaMagazynu domknęła się w act.
    expect(await screen.findByTestId('mvd-oze-magazyn-nieodnaleziona')).toBeInTheDocument();
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
