/*
 * Testy okna „Walidacja modelu falownika" (karta U4 P38, kryteria §3). Weryfikują:
 * uczciwy stan „brak modułów DER", wczytanie katalogu operatorów i jego błąd, dobór
 * modułu (typ przekształtnika) + operatora + rodzaju testu i JAWNY bieg, uczciwy stan
 * „moduł bez typu przekształtnika" (bieg zablokowany, bez API), wykres trajektorii,
 * tabelę scenariuszy z tagiem utrzymania, werdykt całości (agregacja) oraz
 * odsłanianie identyfikatorów wyłącznie w trybie eksperckim. API mockowane; moduły
 * DER czytane z realnego store'a; fixtures 1:1 z backendem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { EkranFrt } from '../EkranFrt';
import {
  katalogNcRfgFixture,
  widokLvrtWObwiedniFixture,
  widokModulWypadlFixture,
} from './fixtures';

const pobierzKatalog = vi.fn();
const pobierzTrajektorie = vi.fn();

vi.mock('../../api', () => ({
  pobierzKatalogKlasNcRfg: () => pobierzKatalog(),
  pobierzTrajektorieFrt: (zapytanie: unknown) => pobierzTrajektorie(zapytanie),
}));

const DER_REF = 'conv-pv-1mw-15kv';

function dodajModul(deviceRef: string | null, id = 'der-1', name = 'Farma PV 1 MW') {
  useStationDerStore.getState().attachDer({
    id,
    project_id: 'proj-1',
    station_id: 'st-1',
    der_kind: 'PV',
    name,
    connection_side: 'SN',
    catalogs: { device_catalog_ref: deviceRef },
  });
}

beforeEach(() => {
  useStationDerStore.getState().reset();
  pobierzKatalog.mockResolvedValue(katalogNcRfgFixture());
});
afterEach(() => vi.clearAllMocks());

async function wczytajISkonfiguruj(tryb: 'basic' | 'expert' = 'basic') {
  dodajModul(DER_REF);
  render(<EkranFrt trybZaawansowania={tryb} />);
  await screen.findByTestId('mvd-frt-dobor');
  fireEvent.change(screen.getByTestId('mvd-frt-modul'), { target: { value: 'der-1' } });
  fireEvent.change(screen.getByTestId('mvd-frt-operator'), { target: { value: 'pse' } });
}

describe('EkranFrt — stany wejściowe', () => {
  it('brak modułów DER → uczciwy stan, bez pobierania biegu', () => {
    render(<EkranFrt trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-frt-brak-modulow')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-frt-dobor')).not.toBeInTheDocument();
    expect(pobierzTrajektorie).not.toHaveBeenCalled();
  });

  it('błąd katalogu operatorów → jawny stan błędu, bez formularza doboru', async () => {
    dodajModul(DER_REF);
    pobierzKatalog.mockRejectedValue(new Error('500 katalog'));
    render(<EkranFrt trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-frt-katalog-blad')).toHaveTextContent('500 katalog');
    expect(screen.queryByTestId('mvd-frt-dobor')).not.toBeInTheDocument();
  });

  it('po wczytaniu pokazuje dobór modułu/operatora/rodzaju oraz stan „uruchom"', async () => {
    dodajModul(DER_REF);
    render(<EkranFrt trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-frt-dobor')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-frt-rodzaj')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-frt-idle')).toBeInTheDocument();
    expect(pobierzTrajektorie).not.toHaveBeenCalled();
  });
});

describe('EkranFrt — moduł bez typu przekształtnika (kryterium 1)', () => {
  it('wybór modułu bez typu → uczciwy komunikat, bieg zablokowany, bez API', async () => {
    dodajModul(null, 'der-x', 'Magazyn bez urządzenia');
    render(<EkranFrt trybZaawansowania="basic" />);
    await screen.findByTestId('mvd-frt-dobor');
    fireEvent.change(screen.getByTestId('mvd-frt-modul'), { target: { value: 'der-x' } });
    fireEvent.change(screen.getByTestId('mvd-frt-operator'), { target: { value: 'pse' } });
    expect(screen.getByTestId('mvd-frt-modul-bez-typu')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-frt-oblicz')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    expect(pobierzTrajektorie).not.toHaveBeenCalled();
  });

  it('lista modułów oznacza moduł bez typu adnotacją PL', async () => {
    dodajModul(null, 'der-x', 'Magazyn bez urządzenia');
    render(<EkranFrt trybZaawansowania="basic" />);
    await screen.findByTestId('mvd-frt-dobor');
    expect(screen.getByTestId('mvd-frt-modul')).toHaveTextContent(
      'brak wskazanego typu przekształtnika',
    );
  });
});

describe('EkranFrt — jawny bieg (kryterium 1)', () => {
  it('moduł z typem + operator + rodzaj → klik woła API z parametrami', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtWObwiedniFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    expect(await screen.findByTestId('mvd-frt-wynik')).toBeInTheDocument();
    expect(pobierzTrajektorie).toHaveBeenCalledWith({
      derRef: DER_REF,
      operatorId: 'pse',
      testKind: 'lvrt',
    });
  });

  it('rodzaj HVRT jest przekazywany do biegu', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtWObwiedniFixture());
    await wczytajISkonfiguruj();
    fireEvent.change(screen.getByTestId('mvd-frt-rodzaj'), { target: { value: 'hvrt' } });
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    expect(pobierzTrajektorie).toHaveBeenCalledWith({
      derRef: DER_REF,
      operatorId: 'pse',
      testKind: 'hvrt',
    });
  });

  it('nie woła API przed kliknięciem (jawny bieg)', async () => {
    await wczytajISkonfiguruj();
    expect(pobierzTrajektorie).not.toHaveBeenCalled();
    expect(screen.getByTestId('mvd-frt-idle')).toBeInTheDocument();
  });

  it('błąd końcówki → jawny stan błędu z komunikatem PL końcówki', async () => {
    pobierzTrajektorie.mockRejectedValue(
      new Error("Moduł DER 'x' nie istnieje w katalogu przekształtników."),
    );
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    expect(await screen.findByTestId('mvd-frt-blad')).toHaveTextContent(
      'nie istnieje w katalogu przekształtników',
    );
  });
});

describe('EkranFrt — prezentacja wyniku (kryteria 2, 3, 4)', () => {
  it('renderuje wykres trajektorii', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtWObwiedniFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    expect(await screen.findByTestId('mvd-frt-wykres')).toBeInTheDocument();
  });

  it('tabela scenariuszy pokazuje werdykt i tag utrzymania pracy', async () => {
    pobierzTrajektorie.mockResolvedValue(widokModulWypadlFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    const tabela = await screen.findByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('moduł wypadł');
    expect(tabela).toHaveTextContent('Nie');
    expect(screen.getAllByTestId('mvd-wyn-tag-ostrzezenie').length).toBeGreaterThan(0);
  });

  it('werdykt całości „w obwiedni" → baner ok', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtWObwiedniFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    const werdykt = await screen.findByTestId('mvd-frt-werdykt');
    expect(werdykt.className).toContain('mvd-frt-werdykt--ok');
    expect(werdykt).toHaveTextContent('odzwierciedla wymagania profilu');
  });

  it('werdykt całości „moduł wypadł" → baner błędu', async () => {
    pobierzTrajektorie.mockResolvedValue(widokModulWypadlFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    const werdykt = await screen.findByTestId('mvd-frt-werdykt');
    expect(werdykt.className).toContain('mvd-frt-werdykt--err');
  });
});

describe('EkranFrt — tryb ekspercki (identyfikatory)', () => {
  it('tryb podstawowy ukrywa identyfikatory modułu i operatora', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtWObwiedniFixture());
    await wczytajISkonfiguruj('basic');
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    expect(screen.queryByTestId('mvd-frt-eksp')).not.toBeInTheDocument();
  });

  it('tryb ekspercki odsłania der_ref i operator_id', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtWObwiedniFixture());
    await wczytajISkonfiguruj('expert');
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    const eksp = screen.getByTestId('mvd-frt-eksp');
    expect(eksp).toHaveTextContent(DER_REF);
    expect(eksp).toHaveTextContent('pse');
  });
});
