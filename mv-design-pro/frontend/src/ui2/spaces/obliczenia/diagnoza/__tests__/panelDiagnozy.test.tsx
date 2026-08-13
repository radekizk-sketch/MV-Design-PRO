/*
 * Panel „Diagnoza przebiegu" — stany ekranu i interakcje ŚCIEŻKĄ NATYWNĄ.
 *
 * Interakcje idą przez `userEvent` (realne zdarzenia wskaźnika/klawiatury), nie
 * przez `fireEvent.click` — Zero-Debt pkt 5: test, który omija realną ścieżkę
 * użytkownika, maskuje martwy klik zamiast go wykrywać.
 *
 * Iloczyn cech (KLASA, nie instancja): stan danych (zerowy bez przypadku /
 * zerowy bez biegu / błąd / gotowe) × werdykt biegu (zbieżny / niezbieżny /
 * nieiteracyjny) × kontrola przed obliczeniem (bez blokad / z blokadami).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { PanelDiagnozy } from '../PanelDiagnozy';
import { ZDANIA_DIAGNOZY_PRZEBIEGU, ZDANIA_PRZYCZYN_PRZERWANIA, ZDANIA_REGUL } from '../kodyDiagnozy';
import { DIAGNOZA_STRINGS as T } from '../strings';
import {
  diagnostykaFixture,
  diagnostykaZBrakamiFixture,
  diagnozaNiezbieznaFixture,
  diagnozaZbieznaFixture,
  diagnozaZwarciowaFixture,
  preflightFixture,
  preflightZablokowanyFixture,
} from './fixtures';

const fetchMock = vi.fn();

function odpowiedz(dane: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => dane };
}

function ustawBackend({
  preflight = preflightFixture(),
  diagnostyka = diagnostykaFixture(),
  diagnoza = diagnozaZbieznaFixture(),
}: {
  preflight?: unknown;
  diagnostyka?: unknown;
  diagnoza?: unknown;
} = {}) {
  fetchMock.mockImplementation((adres: string) => {
    if (adres.includes('/diagnostics/preflight')) return Promise.resolve(odpowiedz(preflight));
    if (adres.includes('/execution/runs/')) return Promise.resolve(odpowiedz(diagnoza));
    return Promise.resolve(odpowiedz(diagnostyka));
  });
}

function bieg(id: string) {
  return {
    id,
    study_case_id: 'K1',
    analysis_type: 'LOAD_FLOW' as const,
    solver_input_hash: 'h',
    status: 'DONE' as const,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}

function props(over: Partial<Parameters<typeof PanelDiagnozy>[0]> = {}) {
  return { onPrzejdzDoUruchomienia: vi.fn(), ...over };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  ustawBackend();
  useExecutionRunsStore.setState({
    activeStudyCaseId: 'K1',
    activeRunId: null,
    runStatus: null,
    runs: [bieg('run-1')],
    isLoadingRuns: false,
    runError: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stan zerowy — brak przypadku', () => {
  it('mówi czego brakuje i co zrobić, bez wołania backendu', async () => {
    useExecutionRunsStore.setState({ activeStudyCaseId: null, runs: [] });

    render(<PanelDiagnozy {...props()} />);

    expect(await screen.findByTestId('mvd-diagnoza-brak-przypadku')).toHaveTextContent(
      T.brakPrzypadku,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('stan zerowy — przypadek bez biegu', () => {
  beforeEach(() => {
    useExecutionRunsStore.setState({ runs: [] });
  });

  it('proponuje uruchomienie obliczenia zamiast udawać diagnozę', async () => {
    render(<PanelDiagnozy {...props()} />);

    const pusto = await screen.findByTestId('mvd-diagnoza-brak-przebiegu');
    expect(pusto).toHaveTextContent(T.brakPrzebiegu);
    expect(within(pusto).getByRole('button', { name: T.brakPrzebieguAkcja })).toBeInTheDocument();
  });

  it('akcja stanu zerowego działa NATYWNYM kliknięciem', async () => {
    const uzytkownik = userEvent.setup();
    const onPrzejdzDoUruchomienia = vi.fn();
    render(<PanelDiagnozy {...props({ onPrzejdzDoUruchomienia })} />);
    const przycisk = await screen.findByRole('button', { name: T.brakPrzebieguAkcja });

    await uzytkownik.click(przycisk);

    expect(onPrzejdzDoUruchomienia).toHaveBeenCalledTimes(1);
  });

  it('akcja stanu zerowego jest osiągalna z klawiatury', async () => {
    const uzytkownik = userEvent.setup();
    const onPrzejdzDoUruchomienia = vi.fn();
    render(<PanelDiagnozy {...props({ onPrzejdzDoUruchomienia })} />);
    await screen.findByRole('button', { name: T.brakPrzebieguAkcja });

    await uzytkownik.tab();
    await uzytkownik.keyboard('{Enter}');

    expect(onPrzejdzDoUruchomienia).toHaveBeenCalledTimes(1);
  });

  it('kontrola przed obliczeniem jest widoczna MIMO braku biegu', async () => {
    render(<PanelDiagnozy {...props()} />);

    // To jest sedno powierzchni: „co sprawdzono przed biegiem" ma sens także
    // wtedy, gdy biegu jeszcze nie było.
    expect(await screen.findByTestId('mvd-diagnoza-kontrola')).toBeInTheDocument();
  });
});

describe('stan błędu', () => {
  it('melduje błąd i pozwala ponowić NATYWNYM kliknięciem', async () => {
    const uzytkownik = userEvent.setup();
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) }),
    );
    render(<PanelDiagnozy {...props()} />);
    const alert = await screen.findByTestId('mvd-diagnoza-blad');
    expect(alert).toHaveTextContent(T.blad);

    ustawBackend();
    await uzytkownik.click(within(alert).getByRole('button', { name: T.bladPonow }));

    expect(await screen.findByTestId('mvd-diagnoza-werdykt')).toBeInTheDocument();
  });
});

describe('werdykt biegu zbieżnego', () => {
  it('mówi wprost, że diagnoza nie wykryła problemów', async () => {
    render(<PanelDiagnozy {...props()} />);

    const werdykt = await screen.findByTestId('mvd-diagnoza-werdykt');
    expect(werdykt).toHaveTextContent(ZDANIA_DIAGNOZY_PRZEBIEGU['PRZ-ZBIEZNY']);
    expect(screen.getByText(T.werdyktBezProblemow)).toBeInTheDocument();
  });

  it('pokazuje dowód liczbowy: iteracje wobec limitu i dokładność', async () => {
    render(<PanelDiagnozy {...props()} />);
    await screen.findByTestId('mvd-diagnoza-werdykt');

    expect(screen.getByText('3 z 30')).toBeInTheDocument();
    expect(screen.getByText(T.etykietaTolerancja)).toBeInTheDocument();
  });

  it('pokazuje przebieg zbieżności jako dowód WHITE BOX', async () => {
    render(<PanelDiagnozy {...props()} />);

    const tabela = await screen.findByTestId('mvd-diagnoza-iteracje');
    expect(within(tabela).getAllByRole('row')).toHaveLength(4); // nagłówek + 3 iteracje
  });
});

describe('werdykt braku zbieżności', () => {
  beforeEach(() => {
    ustawBackend({ diagnoza: diagnozaNiezbieznaFixture() });
  });

  it('nazywa przyczynę po polsku, bez surowego kodu solvera', async () => {
    render(<PanelDiagnozy {...props()} />);

    const werdykt = await screen.findByTestId('mvd-diagnoza-werdykt');
    expect(werdykt).toHaveTextContent(ZDANIA_DIAGNOZY_PRZEBIEGU['PRZ-NIEZBIEZNY-LIMIT']);
    expect(screen.getByText(ZDANIA_PRZYCZYN_PRZERWANIA.max_iter)).toBeInTheDocument();
    expect(screen.queryByText(/max_iter/)).not.toBeInTheDocument();
  });

  it('nie twierdzi, że wszystko w porządku', async () => {
    render(<PanelDiagnozy {...props()} />);
    await screen.findByTestId('mvd-diagnoza-werdykt');

    expect(screen.queryByText(T.werdyktBezProblemow)).not.toBeInTheDocument();
  });
});

describe('analiza nieiteracyjna', () => {
  it('uczciwie mówi, że zbieżność jej nie dotyczy, i nie pokazuje pustej tabeli', async () => {
    ustawBackend({ diagnoza: diagnozaZwarciowaFixture() });

    render(<PanelDiagnozy {...props()} />);

    const werdykt = await screen.findByTestId('mvd-diagnoza-werdykt');
    expect(werdykt).toHaveTextContent(ZDANIA_DIAGNOZY_PRZEBIEGU['PRZ-BEZ-ITERACJI']);
    expect(screen.queryByTestId('mvd-diagnoza-iteracje')).not.toBeInTheDocument();
    expect(screen.queryByText(T.etykietaTolerancja)).not.toBeInTheDocument();
  });
});

describe('kontrola przed obliczeniem z blokadami', () => {
  beforeEach(() => {
    ustawBackend({
      preflight: preflightZablokowanyFixture(),
      diagnostyka: diagnostykaZBrakamiFixture(),
    });
  });

  it('tłumaczy kody blokujące na zdania inżynierskie', async () => {
    render(<PanelDiagnozy {...props()} />);

    const tabela = await screen.findByTestId('mvd-diagnoza-kontrola');
    expect(within(tabela).getAllByText(ZDANIA_REGUL['E-D01']).length).toBeGreaterThan(0);
    expect(within(tabela).getByText(ZDANIA_REGUL['E-D05'])).toBeInTheDocument();
  });

  it('NIE renderuje backendowego uzasadnienia, bo wkleja ono surowe kody', async () => {
    render(<PanelDiagnozy {...props()} />);
    await screen.findByTestId('mvd-diagnoza-kontrola');

    // `reason_pl` z backendu brzmi „…zablokowane: E-D01, E-D05".
    expect(screen.queryByText(/E-D01/)).not.toBeInTheDocument();
    expect(screen.queryByText(/E-D05/)).not.toBeInTheDocument();
  });

  it('pokazuje braki modelu z wagą po polsku i wskazówkami backendu', async () => {
    render(<PanelDiagnozy {...props()} />);

    const problemy = await screen.findByTestId('mvd-diagnoza-problemy');
    expect(within(problemy).getByText('BLOKADA')).toBeInTheDocument();
    expect(within(problemy).getByText(/Macierz admitancji będzie osobliwa/)).toBeInTheDocument();
    expect(within(problemy).getByText('Ustaw R i/lub X > 0 [Ω/km]')).toBeInTheDocument();
  });

  it('nie pokazuje angielskich etykiet dostępności', async () => {
    render(<PanelDiagnozy {...props()} />);
    await screen.findByTestId('mvd-diagnoza-kontrola');

    expect(screen.queryByText('BLOCKED')).not.toBeInTheDocument();
    expect(screen.queryByText('AVAILABLE')).not.toBeInTheDocument();
    expect(screen.getAllByText('Zablokowana').length).toBeGreaterThan(0);
  });
});

describe('model bez braków', () => {
  it('melduje brak braków zamiast pustej listy', async () => {
    render(<PanelDiagnozy {...props()} />);

    expect(await screen.findByTestId('mvd-diagnoza-bez-problemow')).toHaveTextContent(
      T.problemyBrak,
    );
  });
});
