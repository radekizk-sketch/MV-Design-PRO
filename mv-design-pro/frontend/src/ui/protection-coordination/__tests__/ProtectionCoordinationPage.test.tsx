/**
 * Strona koordynacji zabezpieczeń — realna ścieżka użytkownika (karta F-K4 faza 3b).
 *
 * Test powstał razem z naprawą dwóch defektów:
 * 1. FABRYKACJA PRĄDÓW: dodanie urządzenia tworzyło prądy zwarciowe i roboczy
 *    z `Math.random()`, więc marginesy selektywności liczyły się na losowych
 *    danych i wyglądały jak wynik obliczeń.
 * 2. WERDYKT BEZ DROGI: tabela selektywności miała `onRowClick`, ale nikt go nie
 *    przekazywał — klik w wiersz miskoordynacji nie prowadził nigdzie.
 *
 * Kliki natywne (fireEvent na realnych kontrolkach), API mockowane na granicy
 * modułu klienta — ćwiczymy stan strony, nie implementację fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useAppStateStore } from '../../app-state/store';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { ProtectionCoordinationPage } from '../ProtectionCoordinationPage';
import { LABELS } from '../types';

const fetchSC = vi.fn();
const fetchBranches = vi.fn();
const fetchSnapshot = vi.fn();
const runAnalysis = vi.fn();
const getResult = vi.fn();

vi.mock('../../results-inspector/api', () => ({
  fetchShortCircuitResults: (id: string) => fetchSC(id),
  fetchBranchResults: (id: string) => fetchBranches(id),
  fetchCurrentCaseSnapshot: (id: string) => fetchSnapshot(id),
}));

vi.mock('../api', () => ({
  runCoordinationAnalysis: (...args: unknown[]) => runAnalysis(...args),
  getCoordinationResult: (...args: unknown[]) => getResult(...args),
  getExportPdfUrl: () => 'about:blank',
  getExportDocxUrl: () => 'about:blank',
}));

const BIEG_SC_MAX = {
  id: 'run-sc-max',
  study_case_id: 'case-1',
  analysis_type: 'SC_3F',
  solver_input_hash: 'h1',
  status: 'DONE',
  started_at: null,
  finished_at: '2026-07-25T10:00:00Z',
  error_message: null,
} as never;

const BIEG_SC_MIN = { ...(BIEG_SC_MAX as object), id: 'run-sc-min' } as never;
const BIEG_LF = {
  ...(BIEG_SC_MAX as object),
  id: 'run-lf',
  analysis_type: 'LOAD_FLOW',
} as never;

function wierszSC(cFactor: number, ikssKa: number) {
  return {
    target_id: 'bus_1',
    element_id: 'bus_1',
    target_name: 'Szyna 1',
    ikss_ka: ikssKa,
    ip_ka: null,
    ith_ka: null,
    sk_mva: null,
    fault_type: '3F',
    flags: [],
    c_factor: cFactor,
  };
}

/**
 * Migawka modelu przypadku — źródło listy lokalizacji (V12K-262). `ref_id` jest
 * tą samą przestrzenią nazw co `element_id` wiersza wyniku, więc wskazanie
 * elementu z listy DAJE dopasowanie prądów; wpisanie identyfikatora z ręki
 * (poprzednie pole tekstowe) nie dawało go nigdy.
 */
const MIGAWKA = {
  buses: [
    { id: 'b1', ref_id: 'bus_1', name: 'Szyna 1' },
    { id: 'b2', ref_id: 'bus_2', name: 'Szyna 2' },
  ],
  branches: [],
  transformers: [],
};

/** Realna droga projektanta: dodaj urządzenie → wskaż element → zapisz. */
async function dodajUrzadzenieWLokalizacji(refId: string): Promise<void> {
  fireEvent.click(screen.getByText(LABELS.devices.add));
  const wybor = await screen.findByTestId('device-location-select');
  fireEvent.change(wybor, { target: { value: refId } });
  fireEvent.click(screen.getByText(LABELS.actions.save));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' } as never);
  useExecutionRunsStore.setState({ runs: [], activeRunId: null } as never);
  fetchSC.mockResolvedValue({ run_id: 'run-sc-max', rows: [] });
  fetchBranches.mockResolvedValue({ run_id: 'run-lf', rows: [] });
  fetchSnapshot.mockResolvedValue(MIGAWKA);
});

afterEach(() => {
  cleanup();
});

describe('ProtectionCoordinationPage — prądy tylko z biegów (naprawa fabrykacji)', () => {
  it('dodanie urządzenia BEZ biegów nie tworzy prądów i pokazuje, czego brakuje', async () => {
    render(<ProtectionCoordinationPage />);

    await dodajUrzadzenieWLokalizacji('bus_1');

    const panel = await screen.findByTestId('coordination-missing-currents');
    expect(panel.textContent).toContain('Brak prądów zwarciowych');
    // Kluczowe: żadne wywołanie API wyników nie miało czego wczytać, a mimo to
    // urządzenie NIE dostało wartości zastępczych — panel mówi to wprost.
    expect(fetchSC).not.toHaveBeenCalled();
  });

  it('uruchomienie analizy bez prądów jest zablokowane komunikatem, nie zgadywaniem', async () => {
    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieWLokalizacji('bus_1');
    await screen.findByTestId('coordination-missing-currents');

    fireEvent.click(screen.getByTestId('run-analysis-button'));

    // ODMOWA MUSI BYĆ WIDOCZNA (V12K-262): bramka ustawiała `error`, ale zostawiała
    // `status: 'IDLE'`, więc blok komunikatu w ogóle się nie renderował — klik w
    // „Wykonaj analizę" nie dawał ŻADNEJ reakcji. Asercja celuje w ten blok.
    const status = await screen.findByTestId('coordination-status');
    expect(status.textContent).toContain('Brak prądów zwarciowych');
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('dwa biegi zwarciowe (c = 1,10 i c = 0,95) + rozpływ dają komplet prądów', async () => {
    useExecutionRunsStore.setState({ runs: [BIEG_SC_MAX, BIEG_SC_MIN, BIEG_LF] } as never);
    fetchSC.mockImplementation(async (id: string) => ({
      run_id: id,
      rows: id === 'run-sc-max' ? [wierszSC(1.1, 8.4)] : [wierszSC(0.95, 3.1)],
    }));
    fetchBranches.mockResolvedValue({
      run_id: 'run-lf',
      rows: [
        {
          branch_id: 'line-1',
          element_id: 'bus_1',
          name: 'Magistrala',
          from_bus: 'a',
          to_bus: 'b',
          i_a: 180,
          s_mva: null,
          p_mw: null,
          q_mvar: null,
          loading_pct: null,
          flags: [],
        },
      ],
    });

    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieWLokalizacji('bus_1');

    // Urządzenie wskazuje `bus_1` — dopasowanie do wiersza wyniku po `element_id`.
    await waitFor(() => expect(fetchSC).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByTestId('coordination-missing-currents')).toBeNull(),
    );
  });
  it('brak biegu rozpływu → panel mówi wprost, że prąd roboczy jest niedostępny', async () => {
    // Same biegi zwarciowe: kryterium przeciążenia zostaje niesprawdzalne i to
    // musi być widoczne, a nie ukryte zerem.
    useExecutionRunsStore.setState({ runs: [BIEG_SC_MAX, BIEG_SC_MIN] } as never);
    fetchSC.mockImplementation(async (id: string) => ({
      run_id: id,
      rows: id === 'run-sc-max' ? [wierszSC(1.1, 8.4)] : [wierszSC(0.95, 3.1)],
    }));

    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieWLokalizacji('bus_1');

    const panel = await screen.findByTestId('coordination-missing-currents');
    expect(panel.textContent).toContain('prądu roboczego');
    expect(fetchBranches).not.toHaveBeenCalled();
  });
});

/**
 * V12K-262 — koniec wymyślonej lokalizacji.
 *
 * Ekran nadawał nowemu urządzeniu `bus_${n+1}`, a klonowi `${ref}_copy`. Oba
 * identyfikatory były zmyślone, oba trafiały do zapytania analizy, a klon dodatkowo
 * PRZEPISYWAŁ na siebie prądy elementu źródłowego. Te testy pilnują, żeby żadna z
 * tych trzech rzeczy nie wróciła.
 */
describe('ProtectionCoordinationPage — lokalizacja z modelu, nie z wyobraźni', () => {
  it('nowe urządzenie NIE dostaje wymyślonego identyfikatora elementu', async () => {
    render(<ProtectionCoordinationPage />);

    fireEvent.click(screen.getByText(LABELS.devices.add));

    const opis = await screen.findByText(
      (tekst) => tekst.includes(LABELS.validation.lokalizacjaNieWskazana),
    );
    expect(opis).toBeInTheDocument();
    // Wiersz urządzenia NIE niesie żadnego identyfikatora elementu — dawniej stało
    // tu `bus_1`. Sprawdzamy sam wiersz, bo `bus_1` jest legalnie w LIŚCIE WYBORU.
    expect(opis.textContent).not.toContain('bus_');
  });

  it('lista wyboru zawiera elementy MIGAWKI MODELU (po ref_id)', async () => {
    render(<ProtectionCoordinationPage />);
    fireEvent.click(screen.getByText(LABELS.devices.add));

    const wybor = (await screen.findByTestId('device-location-select')) as HTMLSelectElement;
    expect([...wybor.options].map((o) => o.value)).toEqual(['', 'bus_1', 'bus_2']);
    expect(fetchSnapshot).toHaveBeenCalledWith('case-1');
  });

  it('analiza jest zablokowana, dopóki któreś urządzenie nie ma elementu', async () => {
    useExecutionRunsStore.setState({ runs: [BIEG_SC_MAX, BIEG_SC_MIN, BIEG_LF] } as never);
    render(<ProtectionCoordinationPage />);
    fireEvent.click(screen.getByText(LABELS.devices.add));
    fireEvent.click(await screen.findByText(LABELS.actions.save));

    fireEvent.click(screen.getByTestId('run-analysis-button'));

    const status = await screen.findByTestId('coordination-status');
    expect(status.textContent).toBe(LABELS.validation.brakLokalizacji);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('klon NIE przejmuje lokalizacji ani prądów urządzenia źródłowego', async () => {
    useExecutionRunsStore.setState({ runs: [BIEG_SC_MAX, BIEG_SC_MIN, BIEG_LF] } as never);
    fetchSC.mockImplementation(async (id: string) => ({
      run_id: id,
      rows: id === 'run-sc-max' ? [wierszSC(1.1, 8.4)] : [wierszSC(0.95, 3.1)],
    }));
    fetchBranches.mockResolvedValue({
      run_id: 'run-lf',
      rows: [
        {
          branch_id: 'line-1', element_id: 'bus_1', name: 'Magistrala',
          from_bus: 'a', to_bus: 'b', i_a: 180, s_mva: null, p_mw: null,
          q_mvar: null, loading_pct: null, flags: [],
        },
      ],
    });

    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieWLokalizacji('bus_1');
    await waitFor(() =>
      expect(screen.queryByTestId('coordination-missing-currents')).toBeNull(),
    );

    fireEvent.click(screen.getByTitle(LABELS.devices.clone));

    // Klon nie dostaje `bus_1_copy` (element, którego nie ma w modelu) ani prądów
    // przepisanych z `bus_1` — jego lokalizacja jest pusta i wymaga wskazania.
    await waitFor(() =>
      expect(
        screen.getAllByText(
          (tekst) => tekst.includes(LABELS.validation.lokalizacjaNieWskazana),
        ).length,
      ).toBe(1),
    );
    expect(screen.queryByText(/bus_1_copy/)).toBeNull();

    fireEvent.click(screen.getByTestId('run-analysis-button'));
    await waitFor(() =>
      expect(screen.getByText(LABELS.validation.brakLokalizacji)).toBeInTheDocument(),
    );
    expect(runAnalysis).not.toHaveBeenCalled();
  });
});
