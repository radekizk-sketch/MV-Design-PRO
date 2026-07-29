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
          wywod: [
            { tekst: 'Wzor: funkcja celu utrzymania napiecia.', latex: 'J(n) = \\left|U(n) - U_{cel}\\right|' },
          ],
        },
      },
    });
    render(<EkranBadanOltc />);
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
