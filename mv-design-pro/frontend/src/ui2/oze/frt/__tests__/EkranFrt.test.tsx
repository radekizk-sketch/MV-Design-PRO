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
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExecutionAnalysisType, ExecutionRun, RunStatus } from '../../../../ui/study-cases/types';
import { EkranFrt } from '../EkranFrt';
import {
  katalogNcRfgFixture,
  widokLvrtWObwiedniFixture,
  widokModulWypadlFixture,
  widokSekwencjiNiezaliczonaFixture,
  widokSekwencjiZaliczonaFixture,
} from './fixtures';

const pobierzKatalog = vi.fn();
const pobierzTrajektorie = vi.fn();
const pobierzSekwencja = vi.fn();

vi.mock('../../api', () => ({
  pobierzKatalogKlasNcRfg: () => pobierzKatalog(),
  pobierzTrajektorieFrt: (zapytanie: unknown) => pobierzTrajektorie(zapytanie),
  pobierzSekwencjeFrt: (zapytanie: unknown) => pobierzSekwencja(zapytanie),
}));

const DER_REF = 'conv-pv-1mw-15kv';

function biegFixture(
  over: Partial<ExecutionRun> & { analysis_type: ExecutionAnalysisType; status: RunStatus },
): ExecutionRun {
  return {
    id: 'run-1',
    study_case_id: 'case-1',
    solver_input_hash: 'hash-1',
    started_at: '2026-07-10T09:59:00Z',
    finished_at: '2026-07-10T10:00:00Z',
    error_message: null,
    ...over,
  };
}

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
  useExecutionRunsStore.setState({ runs: [] });
  pobierzKatalog.mockResolvedValue(katalogNcRfgFixture());
});
afterEach(() => {
  useExecutionRunsStore.setState({ runs: [] });
  vi.clearAllMocks();
});

async function wczytajISkonfiguruj(tryb: 'basic' | 'expert' = 'basic') {
  dodajModul(DER_REF);
  render(<EkranFrt trybZaawansowania={tryb} />);
  await screen.findByTestId('mvd-frt-dobor');
  fireEvent.change(screen.getByTestId('mvd-frt-modul'), { target: { value: 'der-1' } });
  fireEvent.change(screen.getByTestId('mvd-frt-operator'), { target: { value: 'pse' } });
}

describe('EkranFrt — stany wejściowe', () => {
  it('brak modułów DER → uczciwy stan, bez pobierania biegu', async () => {
    render(<EkranFrt trybZaawansowania="basic" />);
    // Montaż pobiera katalog operatorów (mikrotaski), ale bez modułów DER
    // formularz doboru (a z nim select operatora) nie jest renderowany — skutek
    // fetchu nie ma reprezentacji w UI, więc nie ma na co czekać przez
    // findBy*/waitFor. Puste act(async) domyka te mikrotaski w act — bez niego
    // React zgłasza „An update to EkranFrt was not wrapped in act(...)".
    await act(async () => {});
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

  it('wywód z backendu → ślad obliczeń na żądanie z wzorami KaTeX (zasada 2026-07-22)', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtWObwiedniFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    // Domyślnie zwinięty (bez przeładowania ekranu) — dostępny na klik.
    expect(screen.queryByTestId('mvd-frt-slad-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-frt-slad-0-btn'));
    const slad = screen.getByTestId('mvd-frt-slad-0');
    const wzory = slad.querySelectorAll('[data-testid="math-rendered"]');
    expect(wzory.length).toBe(2);
    // Wzór ogólny marginesu i podstawienie liczbowe z pól solvera (LaTeX).
    expect(wzory[0].getAttribute('data-latex')).toContain('m_{U} = \\min_{t \\ge t_{z}}');
    expect(wzory[1].getAttribute('data-latex')).toContain('m_{U} = 0.000000');
    // Kroki danych/werdyktu tekstowe (latex=null).
    expect(slad).toHaveTextContent('Werdykt: w obwiedni.');
  });

  it('brak wywodu w odpowiedzi → uczciwy brak przycisku śladu', async () => {
    pobierzTrajektorie.mockResolvedValue(widokModulWypadlFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    expect(screen.queryByTestId('mvd-frt-slad-0-btn')).not.toBeInTheDocument();
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

describe('EkranFrt — sekcja „Sekwencja zapadów"', () => {
  it('bez wybranego operatora → uczciwy stan, edytor ukryty, bez biegu', async () => {
    dodajModul(DER_REF);
    render(<EkranFrt trybZaawansowania="basic" />);
    await screen.findByTestId('mvd-frt-dobor');
    // Sekcja obecna, lecz bez kompletnego doboru — brak edytora i wywołań API.
    expect(screen.getByTestId('mvd-frt-sekw-brak-doboru')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-frt-sekw-edytor')).not.toBeInTheDocument();
    expect(pobierzSekwencja).not.toHaveBeenCalled();
  });

  it('po doborze modułu i operatora → edytor z jednym zapadem i stan „uruchom"', async () => {
    await wczytajISkonfiguruj();
    expect(screen.getByTestId('mvd-frt-sekw-edytor')).toBeInTheDocument();
    expect(screen.getAllByTestId('mvd-frt-sekw-wiersz')).toHaveLength(1);
    expect(screen.getByTestId('mvd-frt-sekw-idle')).toBeInTheDocument();
    expect(pobierzSekwencja).not.toHaveBeenCalled();
  });

  it('dodanie i usunięcie wiersza zmienia liczbę zapadów (usuwanie zablokowane przy jednym)', async () => {
    await wczytajISkonfiguruj();
    expect(screen.getByTestId('mvd-frt-sekw-usun-0')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-dodaj'));
    expect(screen.getAllByTestId('mvd-frt-sekw-wiersz')).toHaveLength(2);
    expect(screen.getByTestId('mvd-frt-sekw-usun-0')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-usun-1'));
    expect(screen.getAllByTestId('mvd-frt-sekw-wiersz')).toHaveLength(1);
  });

  it('uruchomienie serializuje zapady i woła API z modułem oraz operatorem', async () => {
    pobierzSekwencja.mockResolvedValue(widokSekwencjiZaliczonaFixture());
    await wczytajISkonfiguruj();
    fireEvent.change(screen.getByTestId('mvd-frt-sekw-glebokosc-0'), { target: { value: '0.3' } });
    fireEvent.change(screen.getByTestId('mvd-frt-sekw-czas-0'), { target: { value: '0.2' } });
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    await screen.findByTestId('mvd-frt-sekw-wynik');
    expect(pobierzSekwencja).toHaveBeenCalledWith({
      derRef: DER_REF,
      operatorId: 'pse',
      zapady: [{ glebokoscPu: 0.3, czasS: 0.2 }],
    });
  });

  it('werdykt sekwencji zaliczonej → odznaka ok, założenia i tabela zapadów', async () => {
    pobierzSekwencja.mockResolvedValue(widokSekwencjiZaliczonaFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    const werdykt = await screen.findByTestId('mvd-frt-sekw-werdykt');
    expect(werdykt.className).toContain('mvd-frt-sekw-odznaka--ok');
    expect(werdykt).toHaveTextContent('sekwencja w obwiedni');
    expect(screen.getByTestId('mvd-frt-sekw-zalozenia')).toHaveTextContent(
      'nie jest modelowany',
    );
    // Bez kontekstu siły sieci: uczciwy powód PL.
    expect(screen.getByTestId('mvd-frt-sekw-kontekst-powod')).toHaveTextContent(
      'kontekst siły sieci',
    );
  });

  it('werdykt sekwencji niezaliczonej → odznaka błędu i kontekst siły sieci (SCR)', async () => {
    pobierzSekwencja.mockResolvedValue(widokSekwencjiNiezaliczonaFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    const werdykt = await screen.findByTestId('mvd-frt-sekw-werdykt');
    expect(werdykt.className).toContain('mvd-frt-sekw-odznaka--err');
    expect(werdykt).toHaveTextContent('zapad 2');
    const kontekst = screen.getByTestId('mvd-frt-sekw-kontekst-dane');
    expect(kontekst).toHaveTextContent('2,250');
    expect(kontekst).toHaveTextContent('sieć słaba');
  });

  it('ślad WHITE BOX kontekstu siły sieci — domyślnie zwinięty, klik odsłania kroki wywodu', async () => {
    pobierzSekwencja.mockResolvedValue(widokSekwencjiNiezaliczonaFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    await screen.findByTestId('mvd-frt-sekw-wynik');
    // Uzasadnienie oceny (why_pl) widoczne od razu; ślad NA ŻĄDANIE.
    expect(screen.getByTestId('mvd-frt-sekw-kontekst-why')).toHaveTextContent(
      'poniżej progu sieci słabej',
    );
    const przycisk = screen.getByTestId('mvd-frt-sekw-slad-otworz');
    expect(przycisk).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('mvd-frt-sekw-slad')).not.toBeInTheDocument();
    // Realna ścieżka: natywny klik w przycisk odsłania listę kroków z backendu.
    fireEvent.click(przycisk);
    expect(przycisk).toHaveAttribute('aria-expanded', 'true');
    const slad = screen.getByTestId('mvd-frt-sekw-slad');
    expect(within(slad).getByTestId('mvd-oze-slad-kroki')).toHaveTextContent('SCR = 45,0 / 20,0');
    expect(within(slad).getByTestId('mvd-oze-slad-kroki')).toHaveTextContent('SCR = 2,25');
    // Ponowny klik zwija ślad.
    fireEvent.click(przycisk);
    expect(screen.queryByTestId('mvd-frt-sekw-slad')).not.toBeInTheDocument();
  });

  it('kontekst bez kroków śladu → brak przycisku (zero fabrykacji wywodu w UI)', async () => {
    const widok = widokSekwencjiNiezaliczonaFixture();
    pobierzSekwencja.mockResolvedValue({
      ...widok,
      kontekst_sily_sieci: widok.kontekst_sily_sieci
        ? { ...widok.kontekst_sily_sieci, white_box: [] }
        : null,
    });
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    await screen.findByTestId('mvd-frt-sekw-wynik');
    expect(screen.queryByTestId('mvd-frt-sekw-slad-otworz')).not.toBeInTheDocument();
  });

  it('błąd końcówki sekwencji → jawny stan błędu z komunikatem PL', async () => {
    pobierzSekwencja.mockRejectedValue(
      new Error('Sekwencja zawiera 11 zapadów; dozwolone maksimum to 10.'),
    );
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    expect(await screen.findByTestId('mvd-frt-sekw-blad')).toHaveTextContent(
      'dozwolone maksimum',
    );
  });
});

describe('EkranFrt — kontekst siły sieci sekwencji (run_id / bus_ref)', () => {
  it('selektor kontekstu listuje wyłącznie zakończone przebiegi zwarciowe', async () => {
    useExecutionRunsStore.setState({
      runs: [
        biegFixture({ id: 'sc-done', analysis_type: 'SC_3F', status: 'DONE' }),
        biegFixture({ id: 'sc-run', analysis_type: 'SC_1F', status: 'RUNNING' }),
        biegFixture({ id: 'lf-done', analysis_type: 'LOAD_FLOW', status: 'DONE' }),
      ],
    });
    await wczytajISkonfiguruj();
    const selektor = screen.getByTestId('mvd-frt-sekw-run');
    expect(within(selektor).getByRole('option', { name: /Zwarcie trójfazowe/ })).toBeInTheDocument();
    expect(
      within(selektor).queryByRole('option', { name: /Zwarcie jednofazowe/ }),
    ).not.toBeInTheDocument();
    expect(within(selektor).queryByRole('option', { name: /Rozpływ mocy/ })).not.toBeInTheDocument();
  });

  it('brak zakończonych przebiegów zwarciowych → uczciwy komunikat PL', async () => {
    await wczytajISkonfiguruj();
    expect(screen.getByTestId('mvd-frt-sekw-run-brak')).toBeInTheDocument();
  });

  it('wybór przebiegu i węzła dołącza run_id oraz bus_ref do biegu', async () => {
    useExecutionRunsStore.setState({
      runs: [biegFixture({ id: 'sc-done', analysis_type: 'SC_3F', status: 'DONE' })],
    });
    pobierzSekwencja.mockResolvedValue(widokSekwencjiZaliczonaFixture());
    await wczytajISkonfiguruj();
    fireEvent.change(screen.getByTestId('mvd-frt-sekw-run'), { target: { value: 'sc-done' } });
    fireEvent.change(screen.getByTestId('mvd-frt-sekw-bus'), { target: { value: 'SZYNA-GPZ' } });
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    await screen.findByTestId('mvd-frt-sekw-wynik');
    expect(pobierzSekwencja).toHaveBeenCalledWith({
      derRef: DER_REF,
      operatorId: 'pse',
      zapady: [{ glebokoscPu: 0.05, czasS: 0.15 }],
      runId: 'sc-done',
      busRef: 'SZYNA-GPZ',
    });
  });

  it('bez wyboru kontekstu → run_id i bus_ref pominięte (zachowanie dzisiejsze)', async () => {
    useExecutionRunsStore.setState({
      runs: [biegFixture({ id: 'sc-done', analysis_type: 'SC_3F', status: 'DONE' })],
    });
    pobierzSekwencja.mockResolvedValue(widokSekwencjiZaliczonaFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    await screen.findByTestId('mvd-frt-sekw-wynik');
    expect(pobierzSekwencja).toHaveBeenCalledWith({
      derRef: DER_REF,
      operatorId: 'pse',
      zapady: [{ glebokoscPu: 0.05, czasS: 0.15 }],
    });
  });
});
