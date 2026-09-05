/**
 * Ekran „Badania regulacji OLTC" (H2) — realna ścieżka użytkownika (Zero-Debt §5):
 * render → wybór badania → natywny klik „Uruchom" → operacja run API → render wyniku.
 * Mockowane wyłącznie store'y i końcówki run API (nie sam ekran).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EkranBadanOltc } from '../EkranBadanOltc';

const createRunMock = vi.fn();
const executeRunMock = vi.fn();
const getRunResultsMock = vi.fn();
const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };

/**
 * Kanoniczny rejestr kodów gotowości (kształt 1:1 z `GET /api/readiness/registry`).
 * Zdania pochodzą z `domain/canonical_operations.READINESS_CODES` — ekran nie ma
 * własnej tablicy kodów, więc test wstrzykuje kanon zamiast go duplikować.
 */
const REJESTR_GOTOWOSCI = new Map([
  [
    'oltc.deadband_missing',
    {
      code: 'oltc.deadband_missing',
      message_pl:
        'Przełącznik zaczepów nie ma pasma nieczułości regulatora — bez niego nie '
        + 'wiadomo, jaka odchyłka napięcia jest jeszcze dopuszczalna',
      level: 'WARNING',
    },
  ],
  [
    'oltc.target_voltage_missing',
    {
      code: 'oltc.target_voltage_missing',
      message_pl:
        'Badanie doboru zaczepów nie ma napięcia docelowego — podaj napięcie, '
        + 'które ma być utrzymywane na szynie regulowanej',
      level: 'WARNING',
    },
  ],
]);
const klientRejestru = () => Promise.resolve(REJESTR_GOTOWOSCI);

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: { activeCaseId: string | null }) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/study-cases/api', () => ({
  createRun: (...args: unknown[]) => createRunMock(...args),
  executeRun: (...args: unknown[]) => executeRunMock(...args),
  getRunResults: (...args: unknown[]) => getRunResultsMock(...args),
}));

/** Wywód dyplomowy {tekst, latex} — kształt 1:1 z `TapSweepResult.to_dict()["wywod"]`. */
const WYWOD_SWEEP = [
  { tekst: 'Badanie: przeglad pozycji zaczepow (sweep).', latex: null },
  {
    tekst: 'Wzor: przekladnia zaczepu t(n) = 1 + (n - n0) * du / 100',
    latex: 't(n) = 1 + \\frac{(n - n_{0}) \\cdot \\Delta u}{100}',
  },
  {
    tekst: 'Pozycja n = -1: t = 0.987500.',
    latex: 't(-1) = 1 + \\frac{(-1 - 0) \\cdot 1.2500}{100} = 0.987500',
  },
];

const SWEEP_RESULT = {
  global_results: {
    oltc_sweep: {
      branch_id: 'TR1',
      controlled_bus_id: 'b_sn',
      points: [
        { position: -1, tap_ratio: 0.9875, converged: true, controlled_bus_kv: 15.1, losses_mw: 0.21, min_bus_kv: 14.9, max_bus_kv: 15.1 },
        { position: 0, tap_ratio: 1.0, converged: true, controlled_bus_kv: 14.9, losses_mw: 0.2, min_bus_kv: 14.7, max_bus_kv: 14.9 },
      ],
      wywod: WYWOD_SWEEP,
    },
  },
};

describe('EkranBadanOltc — realna ścieżka', () => {
  beforeEach(() => {
    createRunMock.mockReset();
    executeRunMock.mockReset();
    getRunResultsMock.mockReset();
    createRunMock.mockResolvedValue({ id: 'run-1', status: 'PENDING' });
    executeRunMock.mockResolvedValue({ id: 'run-1', status: 'DONE', error_message: null });
    getRunResultsMock.mockResolvedValue(SWEEP_RESULT);
    appState.activeCaseId = 'case-1';
  });

  afterEach(cleanup);

  it('renderuje konfigurację i uczciwy stan zerowy', () => {
    render(<EkranBadanOltc />);
    expect(screen.getByTestId('mvd-oltc-badania')).toBeTruthy();
    expect(screen.getByTestId('mvd-oltc-rodzaj')).toBeTruthy();
    expect(screen.getByTestId('mvd-oltc-stan-zerowy')).toBeTruthy();
  });

  it('uruchamia badanie wrażliwości i rysuje wykres + tabelę (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<EkranBadanOltc />);
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    await waitFor(() => expect(createRunMock).toHaveBeenCalledTimes(1));
    const [caseId, request] = createRunMock.mock.calls[0];
    expect(caseId).toBe('case-1');
    expect(request).toMatchObject({ analysis_type: 'LOAD_FLOW', solver_input: { oltc_study: 'sweep' } });
    await waitFor(() => expect(screen.getByTestId('mvd-oltc-wynik-sweep')).toBeTruthy());
    expect(screen.getByTestId('mvd-oltc-wykres-sweep')).toBeTruthy();
  });

  it('optymalizacja: wybór celu utrzymania napięcia niesie oltc_target_kv', async () => {
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({
      global_results: {
        oltc_optimization: {
          branch_id: 'TR1', objective: 'maintain_voltage', best_position: -2, initial_position: 0,
          switch_count: 2, candidates: [
            { position: -2, converged: true, losses_mw: 0.2, controlled_bus_kv: 15.0, voltage_deviation_kv: 0.0, objective_value: 0.0, feasible: true },
          ],
          feasibility_criterion: { kind: 'voltage_deviation', available: true, source: 'study_target_kv', target_kv: 15.0 },
          wywod: [
            { tekst: 'Wzor: funkcja celu utrzymania napiecia.', latex: 'J(n) = \\left|U(n) - U_{cel}\\right|' },
          ],
        },
      },
    });
    render(<EkranBadanOltc klientRejestru={klientRejestru} />);
    await user.selectOptions(screen.getByTestId('mvd-oltc-rodzaj'), 'optimize');
    await user.selectOptions(screen.getByTestId('mvd-oltc-cel'), 'maintain_voltage');
    expect(screen.getByTestId('mvd-oltc-napiecie-cel')).toBeTruthy();
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    await waitFor(() => expect(createRunMock).toHaveBeenCalled());
    const [, request] = createRunMock.mock.calls[0];
    expect(request.solver_input).toMatchObject({ oltc_study: 'optimize', oltc_objective: 'maintain_voltage', oltc_target_kv: 15 });
    await waitFor(() => expect(screen.getByTestId('mvd-oltc-wynik-optymalizacja')).toBeTruthy());
    expect(screen.getByTestId('mvd-oltc-najlepszy')).toBeTruthy();
    // Ślad obliczeń dostępny na żądanie (wywód w odpowiedzi backendu).
    expect(screen.getByTestId('mvd-oltc-optim-slad-btn')).toBeTruthy();
  });

  it('profil dobowy: edytor kroków i przekazanie profilu', async () => {
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({
      global_results: {
        oltc_annual_profile: {
          steps: [
            { index: 0, label: 'Noc (dolina)', load_scale: 0.3, positions: { TR1: 0 }, switch_count: 0, controlled_bus_kv: { TR1: 15.2 }, within_deadband: { TR1: true } },
          ],
          total_switch_count: 0,
          steps_outside_deadband: 0,
          wywod: [
            { tekst: 'Wzor: skalowanie obciazen kroku profilu', latex: 'P_{i} = s_{i} \\cdot P_{0}' },
          ],
        },
      },
    });
    render(<EkranBadanOltc />);
    await user.selectOptions(screen.getByTestId('mvd-oltc-rodzaj'), 'annual_profile');
    expect(screen.getByTestId('mvd-oltc-profil-edytor')).toBeTruthy();
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    await waitFor(() => expect(createRunMock).toHaveBeenCalled());
    const [, request] = createRunMock.mock.calls[0];
    expect(request.solver_input.oltc_study).toBe('annual_profile');
    expect(Array.isArray(request.solver_input.oltc_load_profile)).toBe(true);
    await waitFor(() => expect(screen.getByTestId('mvd-oltc-wynik-profil')).toBeTruthy());
    // Ślad obliczeń dostępny na żądanie (wywód w odpowiedzi backendu).
    expect(screen.getByTestId('mvd-oltc-profil-slad-btn')).toBeTruthy();
  });

  it('wywód z backendu → ślad obliczeń na żądanie z wzorami KaTeX (zasada 2026-07-22)', async () => {
    const user = userEvent.setup();
    render(<EkranBadanOltc />);
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    await waitFor(() => expect(screen.getByTestId('mvd-oltc-wynik-sweep')).toBeTruthy());
    // Domyślnie zwinięty (bez przeładowania ekranu) — dostępny na klik natywny.
    expect(screen.queryByTestId('mvd-oltc-sweep-slad')).toBeNull();
    await user.click(screen.getByTestId('mvd-oltc-sweep-slad-btn'));
    const slad = screen.getByTestId('mvd-oltc-sweep-slad');
    const wzory = slad.querySelectorAll('[data-testid="math-rendered"]');
    expect(wzory.length).toBe(2);
    expect(wzory[1].getAttribute('data-latex')).toContain('t(-1) = 1 +');
    // Krok tekstowy (latex=null) pozostaje monospace.
    expect(slad.textContent).toContain('Badanie: przeglad pozycji zaczepow (sweep).');
  });

  it('brak wywodu w odpowiedzi → uczciwy brak przycisku śladu', async () => {
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({
      global_results: {
        oltc_sweep: {
          branch_id: 'TR1',
          controlled_bus_id: 'b_sn',
          points: SWEEP_RESULT.global_results.oltc_sweep.points,
        },
      },
    });
    render(<EkranBadanOltc />);
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    await waitFor(() => expect(screen.getByTestId('mvd-oltc-wynik-sweep')).toBeTruthy());
    expect(screen.queryByTestId('mvd-oltc-sweep-slad-btn')).toBeNull();
  });

  it('optymalizacja: kryterium dopuszczalności stoi obok werdyktu z wartością i źródłem', async () => {
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({
      global_results: {
        oltc_optimization: {
          branch_id: 'TR1', objective: 'minimize_switching', best_position: 0, initial_position: -3,
          switch_count: 3,
          candidates: [
            { position: -3, converged: true, losses_mw: 0.3, controlled_bus_kv: 16.465, voltage_deviation_kv: 0.715, objective_value: 0, feasible: false },
            { position: 0, converged: true, losses_mw: 0.2, controlled_bus_kv: 15.818, voltage_deviation_kv: 0.068, objective_value: 3, feasible: true },
          ],
          feasibility_criterion: {
            kind: 'voltage_deadband', available: true, source: 'tap_changer_deadband',
            target_kv: 15.75, band_kv: 0.2, half_band_kv: 0.1,
          },
        },
      },
    });
    render(<EkranBadanOltc klientRejestru={klientRejestru} />);
    await user.selectOptions(screen.getByTestId('mvd-oltc-rodzaj'), 'optimize');
    await user.selectOptions(screen.getByTestId('mvd-oltc-cel'), 'minimize_switching');
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    const kryterium = await screen.findByTestId('mvd-oltc-kryterium');
    expect(kryterium.textContent).toContain('15.750 kV');
    expect(kryterium.textContent).toContain('0.100 kV');
    expect(kryterium.textContent).toContain('0.200 kV');
    expect(kryterium.textContent).toContain('pasmo nieczułości przełącznika zaczepów z modelu');
    // Werdykt bez zastrzeżeń: pozycja i liczba przełączeń z backendu.
    expect(screen.getByTestId('mvd-oltc-wynik-optymalizacja').textContent).toContain('Wymagane przełączenia');
    expect(screen.queryByTestId('mvd-oltc-kryterium-braki')).toBeNull();
  });

  it('optymalizacja bez kryterium: uczciwy stan + zdanie z kanonu gotowości zamiast werdyktu', async () => {
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({
      global_results: {
        oltc_optimization: {
          branch_id: 'TR1', objective: 'minimize_switching', best_position: null, initial_position: 0,
          switch_count: null,
          candidates: [
            { position: -1, converged: true, losses_mw: 0.21, controlled_bus_kv: 15.1, voltage_deviation_kv: 0.35, objective_value: 1, feasible: null },
            { position: 0, converged: true, losses_mw: 0.2, controlled_bus_kv: 14.9, voltage_deviation_kv: 0.55, objective_value: 0, feasible: null },
          ],
          feasibility_criterion: { kind: 'voltage_deadband', available: false, readiness_codes: ['oltc.deadband_missing'] },
          readiness_codes: ['oltc.deadband_missing'],
        },
      },
    });
    render(<EkranBadanOltc klientRejestru={klientRejestru} />);
    await user.selectOptions(screen.getByTestId('mvd-oltc-rodzaj'), 'optimize');
    await user.selectOptions(screen.getByTestId('mvd-oltc-cel'), 'minimize_switching');
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    const kryterium = await screen.findByTestId('mvd-oltc-kryterium');
    expect(kryterium.textContent).toContain('Nieustalone');
    expect(kryterium.textContent).not.toContain('Skąd kryterium');
    // Zdanie z kanonu gotowości (nie własna tablica kodów w UI, nie surowy kod).
    const braki = await screen.findByTestId('mvd-oltc-kryterium-braki');
    expect(braki.textContent).toContain('pasma nieczułości regulatora');
    expect(braki.textContent).not.toContain('oltc.deadband_missing');
    // Zero fabrykacji werdyktu: brak pozycji i brak liczby przełączeń.
    const wynik = screen.getByTestId('mvd-oltc-wynik-optymalizacja');
    expect(wynik.textContent).toContain('nie wskazano');
    expect(screen.queryByTestId('mvd-oltc-najlepszy')).toBeNull();
    // Kolumna „Dopuszczalna" nie kłamie „nie" tam, gdzie oceny nie ma.
    const wiersze = Array.from(wynik.querySelectorAll('tbody tr'));
    expect(wiersze).toHaveLength(2);
    for (const wiersz of wiersze) {
      const komorki = wiersz.querySelectorAll('td');
      expect(komorki[komorki.length - 1].textContent).toBe('—');
    }
  });

  it('profil dobowy bez pasma regulatora: kolumna „W paśmie" pokazuje brak danej, nie „nie"', async () => {
    // BRAMKA (c) karty T4 / znalezisko N3. Odpowiedź backendu przy braku pasma w
    // modelu: znacznik NIEOBECNY (klucz nie istnieje), liczniki niedostępne, kod
    // gotowości. Ekran ma być spójny: kreska w kolumnie, kreska w podsumowaniu i
    // zdanie z kanonu — zamiast trzech „nie" obok „0 kroków poza pasmem".
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({
      global_results: {
        oltc_annual_profile: {
          steps: [
            { index: 0, label: 'Noc (dolina)', load_scale: 0.3, positions: { TR1: 0 }, switch_count: null, controlled_bus_kv: { TR1: 14.124 }, within_deadband: {} },
            { index: 1, label: 'Szczyt', load_scale: 1.6, positions: { TR1: 0 }, switch_count: null, controlled_bus_kv: { TR1: 13.504 }, within_deadband: {} },
          ],
          total_switch_count: null,
          steps_outside_deadband: null,
          readiness_codes: ['oltc.deadband_missing'],
        },
      },
    });
    render(<EkranBadanOltc klientRejestru={klientRejestru} />);
    await user.selectOptions(screen.getByTestId('mvd-oltc-rodzaj'), 'annual_profile');
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    const wynik = await screen.findByTestId('mvd-oltc-wynik-profil');

    const wiersze = Array.from(wynik.querySelectorAll('tbody tr'));
    expect(wiersze).toHaveLength(2);
    for (const wiersz of wiersze) {
      const komorki = wiersz.querySelectorAll('td');
      // Ostatnia kolumna = „W paśmie": brak oceny to kreska, nie werdykt.
      expect(komorki[komorki.length - 1].textContent).toBe('—');
      expect(komorki[komorki.length - 1].textContent).not.toBe('nie');
      // Przedostatnia = „Przełączenia": brak liczby to kreska, nie zero.
      expect(komorki[komorki.length - 2].textContent).toBe('—');
    }
    // Podsumowanie nie przeczy tabeli: obie wielkości nieustalone.
    expect(wynik.textContent).toContain('Łączne przełączenia: —');
    expect(wynik.textContent).toContain('Kroki poza pasmem nieczułości: —');
    // Zdanie z kanonu gotowości (bez własnej tablicy kodów, bez surowego kodu).
    const braki = await screen.findByTestId('mvd-oltc-profil-braki');
    expect(braki.textContent).toContain('pasma nieczułości regulatora');
    expect(braki.textContent).not.toContain('oltc.deadband_missing');
  });

  it('profil dobowy bez nastawy regulatora: kreska w kolumnie i zdanie o brakującym napięciu', async () => {
    // Scenariusz N3 wprost: przełącznik w trybie ręcznym, bez nastawy napięcia.
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({
      global_results: {
        oltc_annual_profile: {
          steps: [
            { index: 0, label: 'Dzień', load_scale: 1.0, positions: { TR1: 0 }, switch_count: 0, controlled_bus_kv: { TR1: 13.807 }, within_deadband: {} },
          ],
          total_switch_count: 0,
          steps_outside_deadband: null,
          readiness_codes: ['oltc.target_voltage_missing'],
        },
      },
    });
    render(<EkranBadanOltc klientRejestru={klientRejestru} />);
    await user.selectOptions(screen.getByTestId('mvd-oltc-rodzaj'), 'annual_profile');
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    const wynik = await screen.findByTestId('mvd-oltc-wynik-profil');
    const komorki = wynik.querySelectorAll('tbody tr td');
    expect(komorki[komorki.length - 1].textContent).toBe('—');
    // Łączenia SĄ znane (regulator ręczny nie łączy) — zero jest tu faktem biegu.
    expect(wynik.textContent).toContain('Łączne przełączenia: 0');
    expect(wynik.textContent).toContain('Kroki poza pasmem nieczułości: —');
    const braki = await screen.findByTestId('mvd-oltc-profil-braki');
    expect(braki.textContent).toContain('napięcie, które ma być utrzymywane na szynie regulowanej');
  });

  it('profil dobowy z pełnymi nastawami: werdykt i liczby bez zastrzeżeń', async () => {
    // Regresja drugiej połowy bramki: komplet danych = tabela mówi „tak"/„nie",
    // liczniki są liczbami, lista braków w ogóle się nie pokazuje.
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({
      global_results: {
        oltc_annual_profile: {
          steps: [
            { index: 0, label: 'Noc (dolina)', load_scale: 0.3, positions: { TR1: -5 }, switch_count: 5, controlled_bus_kv: { TR1: 15.083 }, within_deadband: { TR1: true } },
            { index: 1, label: 'Szczyt', load_scale: 1.6, positions: { TR1: -7 }, switch_count: 1, controlled_bus_kv: { TR1: 14.952 }, within_deadband: { TR1: false } },
          ],
          total_switch_count: 6,
          steps_outside_deadband: 1,
        },
      },
    });
    render(<EkranBadanOltc klientRejestru={klientRejestru} />);
    await user.selectOptions(screen.getByTestId('mvd-oltc-rodzaj'), 'annual_profile');
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    const wynik = await screen.findByTestId('mvd-oltc-wynik-profil');
    const wiersze = Array.from(wynik.querySelectorAll('tbody tr'));
    expect(wiersze[0].querySelectorAll('td')[5].textContent).toBe('tak');
    expect(wiersze[1].querySelectorAll('td')[5].textContent).toBe('nie');
    expect(wynik.textContent).toContain('Łączne przełączenia: 6');
    expect(wynik.textContent).toContain('Kroki poza pasmem nieczułości: 1');
    expect(screen.queryByTestId('mvd-oltc-profil-braki')).toBeNull();
  });

  it('bez aktywnego przypadku pokazuje uczciwy błąd zamiast uruchomienia', async () => {
    const user = userEvent.setup();
    appState.activeCaseId = null;
    render(<EkranBadanOltc />);
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    await waitFor(() => expect(screen.getByTestId('mvd-oltc-blad')).toBeTruthy());
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it('błąd backendu wyświetlany uczciwie', async () => {
    const user = userEvent.setup();
    getRunResultsMock.mockResolvedValue({ global_results: {} });
    render(<EkranBadanOltc />);
    await user.click(screen.getByTestId('mvd-oltc-uruchom'));
    await waitFor(() => expect(screen.getByTestId('mvd-oltc-blad')).toBeTruthy());
    expect(screen.queryByTestId('mvd-oltc-wynik-sweep')).toBeNull();
  });
});
