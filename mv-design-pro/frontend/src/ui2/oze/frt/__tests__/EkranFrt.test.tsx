/*
 * Testy okna „Walidacja modelu falownika" (karta U4 P38, kryteria §3). Weryfikują:
 * uczciwy stan „brak modułów DER", wczytanie katalogu operatorów i jego błąd, dobór
 * modułu (typ przekształtnika) + operatora + rodzaju testu i JAWNY bieg, uczciwy stan
 * „moduł bez typu przekształtnika" (bieg zablokowany, bez API), wykres trajektorii,
 * tabelę scenariuszy z etykietą oceny z rekordu, sekcję audytową pól solvera oraz
 * odsłanianie identyfikatorów wyłącznie w trybie eksperckim. API mockowane; moduły
 * DER czytane z realnego store'a; fixtures 1:1 z backendem.
 *
 * Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): werdykt FRT, baner „werdyktu
 * całości" i odznaka sekwencji skasowane — pełny iloczyn cech „brak werdyktu" pilnuje
 * `uczciwosc.test.tsx`; tu testy przepisane zachowują intencję (co ekran pokazuje
 * i gdzie), odwrócone tam, gdzie przypinały fałszywy werdykt.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { ExecutionAnalysisType, ExecutionRun, RunStatus } from '../../../../ui/study-cases/types';
import { EkranFrt } from '../EkranFrt';
import {
  REKORDY_OCENY_FRT,
  katalogNcRfgFixture,
  widokBrakModeluFixture,
  widokLvrtFixture,
  widokModulOdlaczonyFixture,
  widokSekwencjiFixture,
  widokSekwencjiZKontekstemFixture,
} from './fixtures';

const pobierzKatalog = vi.fn();
const pobierzTrajektorie = vi.fn();
const pobierzSekwencja = vi.fn();

// Katalog NC RfG z JEDNEGO klienta V2 (`ui2/oze/ncrfg/api`, karta AB-1a Pakiet D2).
vi.mock('../../ncrfg/api', () => ({
  pobierzKatalogNcRfg: () => pobierzKatalog(),
}));

vi.mock('../../api', () => ({
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
    connection_side: 'nN',
    catalogs: { device_catalog_ref: deviceRef },
  });
}

beforeEach(() => {
  useStationDerStore.getState().reset();
  useExecutionRunsStore.setState({ runs: [] });
  // Migawka modelu z szyną przyłączenia — sekcja sekwencji dobiera szynę z listy po nazwie.
  useSnapshotStore.setState({
    snapshot: { buses: [{ ref_id: 'SZYNA-GPZ', id: 'b1', name: 'Szyna GPZ', voltage_kv: 15 }] },
  } as never);
  pobierzKatalog.mockResolvedValue(katalogNcRfgFixture());
});
afterEach(() => {
  useExecutionRunsStore.setState({ runs: [] });
  useSnapshotStore.setState({ snapshot: null } as never);
  vi.clearAllMocks();
});

async function wczytajISkonfiguruj(tryb: 'basic' | 'expert' = 'basic') {
  dodajModul(DER_REF);
  render(<EkranFrt trybZaawansowania={tryb} onOtworzDowod={vi.fn()} />);
  await screen.findByTestId('mvd-frt-dobor');
  fireEvent.change(screen.getByTestId('mvd-frt-modul'), { target: { value: 'der-1' } });
  fireEvent.change(screen.getByTestId('mvd-frt-operator'), { target: { value: 'pse' } });
}

describe('EkranFrt — stany wejściowe', () => {
  it('brak modułów DER → uczciwy stan, bez pobierania biegu', async () => {
    render(<EkranFrt trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
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
    render(<EkranFrt trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(await screen.findByTestId('mvd-frt-katalog-blad')).toHaveTextContent('500 katalog');
    expect(screen.queryByTestId('mvd-frt-dobor')).not.toBeInTheDocument();
  });

  it('po wczytaniu pokazuje dobór modułu/operatora/rodzaju oraz stan „uruchom"', async () => {
    dodajModul(DER_REF);
    render(<EkranFrt trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    expect(await screen.findByTestId('mvd-frt-dobor')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-frt-rodzaj')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-frt-idle')).toBeInTheDocument();
    expect(pobierzTrajektorie).not.toHaveBeenCalled();
  });
});

describe('EkranFrt — moduł bez typu przekształtnika (kryterium 1)', () => {
  it('wybór modułu bez typu → uczciwy komunikat, bieg zablokowany, bez API', async () => {
    dodajModul(null, 'der-x', 'Magazyn bez urządzenia');
    render(<EkranFrt trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
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
    render(<EkranFrt trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
    await screen.findByTestId('mvd-frt-dobor');
    expect(screen.getByTestId('mvd-frt-modul')).toHaveTextContent(
      'brak wskazanego typu przekształtnika',
    );
  });
});

describe('EkranFrt — jawny bieg (kryterium 1)', () => {
  it('moduł z typem + operator + rodzaj → klik woła API z parametrami', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
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
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
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

  it('karta S-4: status_solvera "blocked" (no_module zmapowany na granicy) → panel dedykowany, nie wykres z pustych danych', async () => {
    pobierzTrajektorie.mockResolvedValue(widokBrakModeluFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    expect(await screen.findByTestId('mvd-frt-brak-modelu')).toHaveTextContent(
      'Brak modelu dynamicznego DER w wejściu solvera.',
    );
    expect(screen.queryByTestId('mvd-frt-wynik')).not.toBeInTheDocument();
  });
});

describe('EkranFrt — prezentacja wyniku (kryteria 2, 3, 4)', () => {
  it('renderuje wykres trajektorii', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    expect(await screen.findByTestId('mvd-frt-wykres')).toBeInTheDocument();
  });

  // Intencja zachowana: tabela pierwszego planu i pola solvera są dostępne.
  // Zmiana kanonu: werdykt „moduł wypadł" i tag ostrzegawczy (odwrócone) — pierwszy
  // plan niesie etykietę oceny z rekordu, pola solvera są w sekcji audytowej bez tagów.
  it('tabela scenariuszy: etykieta oceny z rekordu; meldunek solvera tylko w audycie, bez tagu', async () => {
    pobierzTrajektorie.mockResolvedValue(widokModulOdlaczonyFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    const tabela = await screen.findByTestId('mvd-wyn-tabela');
    expect(tabela).toHaveTextContent('Ocena niewykonana');
    expect(tabela).not.toHaveTextContent('Nie');
    fireEvent.click(screen.getByTestId('mvd-frt-audyt-przelacz'));
    expect(screen.getByTestId('mvd-frt-audyt-tresc')).toHaveTextContent('Nie');
    expect(screen.queryAllByTestId('mvd-wyn-tag-ostrzezenie')).toHaveLength(0);
  });

  // Odwrócone: dawny baner „werdyktu całości" (ok/err) nie istnieje; zamiast niego
  // rekord oceny z backendu.
  it('zamiast banera werdyktu całości — rekord oceny z backendu', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    expect(screen.queryByTestId('mvd-frt-werdykt')).not.toBeInTheDocument();
    const rekord = REKORDY_OCENY_FRT.trajektoria_lvrt.widok;
    expect(
      screen.getByTestId(`mvd-werdykt-${rekord.kryterium_id}-zdanie`),
    ).toHaveTextContent(rekord.wyjasnienie.zdanie_pl);
  });

  // Intencja zachowana: wywód z backendu dostępny na żądanie (zasada 2026-07-22).
  // Zmiana kanonu: wywód nie liczy marginesu ani werdyktu — echo wejścia, charakter
  // trajektorii i powód braku oceny (same kroki tekstowe, bez wzorów).
  it('wywód z backendu → ślad na żądanie: echo, charakter trajektorii, powód braku oceny', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    // Domyślnie zwinięty (bez przeładowania ekranu) — dostępny na klik.
    expect(screen.queryByTestId('mvd-frt-slad-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-frt-slad-0-btn'));
    const slad = screen.getByTestId('mvd-frt-slad-0');
    expect(slad.querySelectorAll('[data-testid="math-rendered"]')).toHaveLength(0);
    expect(slad).toHaveTextContent('echo wejscia solvera');
    expect(slad).toHaveTextContent('nie rozwiazanie sieci');
    expect(slad).toHaveTextContent('Ocena niewykonana:');
    expect(slad).not.toHaveTextContent('Werdykt');
  });

  it('brak wywodu w odpowiedzi → uczciwy brak przycisku śladu', async () => {
    pobierzTrajektorie.mockResolvedValue(widokModulOdlaczonyFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    expect(screen.queryByTestId('mvd-frt-slad-0-btn')).not.toBeInTheDocument();
  });
});

describe('EkranFrt — tryb ekspercki (identyfikatory)', () => {
  it('tryb podstawowy ukrywa identyfikatory modułu i operatora', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
    await wczytajISkonfiguruj('basic');
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    expect(screen.queryByTestId('mvd-frt-eksp')).not.toBeInTheDocument();
  });

  it('identyfikatory typu i operatora wyłącznie w „Informacjach audytowych" (karta #145)', async () => {
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
    await wczytajISkonfiguruj('expert');
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    // Pierwszy plan (zwinięte informacje audytowe) bez identyfikatora typu przekształtnika.
    expect(screen.getByTestId('mvd-frt-wynik')).not.toHaveTextContent(DER_REF);
    fireEvent.click(screen.getByTestId('mvd-frt-informacje-audytowe-przelacz'));
    const lista = screen.getByTestId('mvd-frt-informacje-audytowe-lista');
    expect(lista).toHaveTextContent(DER_REF);
    expect(lista).toHaveTextContent('pse');
  });
});

describe('EkranFrt — sekcja „Sekwencja zapadów"', () => {
  it('bez wybranego operatora → uczciwy stan, edytor ukryty, bez biegu', async () => {
    dodajModul(DER_REF);
    render(<EkranFrt trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
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
    pobierzSekwencja.mockResolvedValue(widokSekwencjiFixture());
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

  // Odwrócone: dawna odznaka „sekwencja w obwiedni" (ok) — sekwencja nie jest oceniana.
  it('sekwencja: rekord oceny zamiast odznaki, założenia i tabela zapadów', async () => {
    pobierzSekwencja.mockResolvedValue(widokSekwencjiFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    await screen.findByTestId('mvd-frt-sekw-wynik');
    expect(screen.queryByTestId('mvd-frt-sekw-werdykt')).not.toBeInTheDocument();
    const rekord = REKORDY_OCENY_FRT.sekwencja_bez_kontekstu.widok;
    expect(
      screen.getByTestId(`mvd-werdykt-${rekord.kryterium_id}-etykieta`),
    ).toHaveTextContent('Ocena niewykonana');
    expect(screen.getByTestId('mvd-frt-sekw-zalozenia')).toHaveTextContent(
      'nie jest modelowany',
    );
    // Bez kontekstu siły sieci: uczciwy powód PL.
    expect(screen.getByTestId('mvd-frt-sekw-kontekst-powod')).toHaveTextContent(
      'kontekst siły sieci',
    );
  });

  // Odwrócone: dawna odznaka „sekwencja niezaliczona — zapad 2" (err). Intencja
  // zachowana: kontekst siły sieci (SCR) z backendu obok sekwencji.
  it('sekwencja z kontekstem: bez odznaki werdyktu, kontekst siły sieci (SCR) z backendu', async () => {
    pobierzSekwencja.mockResolvedValue(widokSekwencjiZKontekstemFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    await screen.findByTestId('mvd-frt-sekw-wynik');
    expect(screen.queryByTestId('mvd-frt-sekw-werdykt')).not.toBeInTheDocument();
    const kontekst = screen.getByTestId('mvd-frt-sekw-kontekst-dane');
    expect(kontekst).toHaveTextContent('2,250');
    expect(kontekst).toHaveTextContent('sieć słaba');
  });

  it('ślad WHITE BOX kontekstu siły sieci — domyślnie zwinięty, klik odsłania kroki wywodu', async () => {
    pobierzSekwencja.mockResolvedValue(widokSekwencjiZKontekstemFixture());
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
    const widok = widokSekwencjiZKontekstemFixture();
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
    pobierzSekwencja.mockResolvedValue(widokSekwencjiFixture());
    await wczytajISkonfiguruj();
    fireEvent.change(screen.getByTestId('mvd-frt-sekw-run'), { target: { value: 'sc-done' } });
    // Karta #145: szyna wybierana z listy szyn modelu po nazwie (nie wpisywana referencja).
    const opcja = within(screen.getByTestId('mvd-frt-sekw-bus')).getByRole('option', {
      name: 'Szyna GPZ',
    });
    expect(opcja).toHaveValue('SZYNA-GPZ');
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
    pobierzSekwencja.mockResolvedValue(widokSekwencjiFixture());
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

describe('EkranFrt — zapis stanu oceny do zgodności NC RfG (K5-B / H-3 pkt 4)', () => {
  // Intencja zachowana: zapis per MODUŁ (id modułu, nie typ przekształtnika).
  // Zmiana kanonu: zapisywany jest stan oceny z rekordu (etykieta + semantyka), nie werdykt.
  it('„Zapisz wynik do zgodności NC RfG" zapisuje stan oceny per MODUŁ (id modułu, nie typ przekształtnika)', async () => {
    const { useNcRfgStore } = await import('../../ncRfgStore');
    useNcRfgStore.getState().reset();
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');

    // Realna ścieżka: natywny klik akcji przy wyniku.
    fireEvent.click(screen.getByTestId('mvd-frt-zapisz-wynik'));

    const zapisany = useNcRfgStore.getState().wynikiFrt['der-1']?.lvrt;
    expect(zapisany).toBeDefined();
    expect(zapisany?.tekst).toBe('Ocena niewykonana');
    expect(zapisany?.istotnosc).toBe('neutralna');
    expect(zapisany?.operatorId).toBe('pse');
    // Klucz to id MODUŁU (tożsamość kolumn macierzy), nie ref typu z katalogu.
    expect(useNcRfgStore.getState().wynikiFrt[DER_REF]).toBeUndefined();
    useNcRfgStore.getState().reset();
  });

  it('stany oceny LVRT i HVRT trwają niezależnie (dwa rodzaje testu, jeden moduł)', async () => {
    const { useNcRfgStore } = await import('../../ncRfgStore');
    useNcRfgStore.getState().reset();
    pobierzTrajektorie.mockResolvedValue(widokLvrtFixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    fireEvent.click(screen.getByTestId('mvd-frt-zapisz-wynik'));

    // Drugi bieg: HVRT, w którym solver meldował odłączenie modułu — nadal ocena niewykonana.
    pobierzTrajektorie.mockResolvedValue({
      ...widokModulOdlaczonyFixture(),
      test_kind: 'hvrt',
    });
    fireEvent.change(screen.getByTestId('mvd-frt-rodzaj'), { target: { value: 'hvrt' } });
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    fireEvent.click(screen.getByTestId('mvd-frt-zapisz-wynik'));

    const wyniki = useNcRfgStore.getState().wynikiFrt['der-1'];
    expect(wyniki?.lvrt?.testKind).toBe('lvrt');
    expect(wyniki?.hvrt?.testKind).toBe('hvrt');
    expect(wyniki?.lvrt?.istotnosc).toBe('neutralna');
    expect(wyniki?.hvrt?.istotnosc).toBe('neutralna');
    useNcRfgStore.getState().reset();
  });
});
