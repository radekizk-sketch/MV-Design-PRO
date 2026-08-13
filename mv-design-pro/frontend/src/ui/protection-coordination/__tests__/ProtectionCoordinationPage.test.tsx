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
import { useNotificationStore } from '../../notifications/store';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { ProtectionCoordinationPage } from '../ProtectionCoordinationPage';
import type { CoordinationResult } from '../types';
import { LABELS } from '../types';

const fetchSC = vi.fn();
const fetchBranches = vi.fn();
const fetchSnapshot = vi.fn();
const runAnalysis = vi.fn();
const getResult = vi.fn();
// K5-B (H-2): granica modułu klienta konfiguracji przypadku — hydratacja (GET)
// i wykonawca nastaw (PUT) idą przez `study-cases/api`.
const getConfig = vi.fn();
const putConfig = vi.fn();

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

vi.mock('../../study-cases/api', () => ({
  getProtectionConfig: (...args: unknown[]) => getConfig(...args),
  updateProtectionConfig: (...args: unknown[]) => putConfig(...args),
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

const PUSTA_KONFIGURACJA = {
  template_ref: null,
  template_fingerprint: null,
  library_manifest_ref: null,
  overrides: {},
  bound_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' } as never);
  useExecutionRunsStore.setState({ runs: [], activeRunId: null } as never);
  fetchSC.mockResolvedValue({ run_id: 'run-sc-max', rows: [] });
  fetchBranches.mockResolvedValue({ run_id: 'run-lf', rows: [] });
  fetchSnapshot.mockResolvedValue(MIGAWKA);
  getConfig.mockResolvedValue(PUSTA_KONFIGURACJA);
  putConfig.mockResolvedValue(PUSTA_KONFIGURACJA);
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

/**
 * K5-B (H-2) — wykonawca nastaw E-28: urządzenia i nastawy TRWAJĄ w konfiguracji
 * przypadku (PUT /api/study-cases/{id}/protection-config → overrides per
 * urządzenie), a wejście na stronę hydratuje listę z GET. Wynik policzony przed
 * zmianą nastaw jest jawnie nieaktualny (baner + CTA „Przelicz koordynację").
 */
describe('ProtectionCoordinationPage — nastawy trwają w konfiguracji przypadku (K5-B)', () => {
  const URZADZENIE_Z_SERWERA = {
    id: 'dev-serwer',
    name: 'Zabezpieczenie z przypadku',
    device_type: 'RELAY',
    location_element_id: 'bus_2',
    settings: {
      stage_51: {
        enabled: true,
        pickup_current_a: 140,
        directional: false,
        curve_settings: {
          standard: 'IEC',
          variant: 'SI',
          pickup_current_a: 140,
          time_multiplier: 0.3,
        },
      },
    },
  };

  const WYNIK: CoordinationResult = {
    run_id: 'run-coord-1',
    project_id: 'proj-1',
    sensitivity_checks: [],
    selectivity_checks: [],
    overload_checks: [],
    tcc_curves: [],
    fault_markers: [],
    overall_verdict: 'PASS',
    summary: {
      total_devices: 1,
      total_checks: 0,
      sensitivity: { pass: 0, marginal: 0, fail: 0, error: 0 },
      selectivity: { pass: 0, marginal: 0, fail: 0, error: 0 },
      overload: { pass: 0, marginal: 0, fail: 0, error: 0 },
      overall_verdict: 'PASS',
      overall_verdict_pl: 'Zgodne',
    },
    trace_steps: [],
    created_at: '2026-07-29T00:00:00Z',
  };

  it('hydratacja z GET: urządzenie zapisane w przypadku pojawia się na liście', async () => {
    getConfig.mockResolvedValue({
      ...PUSTA_KONFIGURACJA,
      overrides: { 'coordination_device:dev-serwer': URZADZENIE_Z_SERWERA },
    });

    render(<ProtectionCoordinationPage />);

    expect(await screen.findByText('Zabezpieczenie z przypadku')).toBeInTheDocument();
    expect(getConfig).toHaveBeenCalledWith('case-1');
    // Lokalizacja z serwera, nie „lokalizacja niewskazana".
    const wierszLokalizacji = screen.getByTestId('device-location-dev-serwer');
    expect(wierszLokalizacji.textContent).toContain('bus_2');
  });

  it('zapis w edytorze wykonuje PUT z nadpisaniami kluczowanymi per urządzenie', async () => {
    render(<ProtectionCoordinationPage />);

    await dodajUrzadzenieWLokalizacji('bus_1');

    await waitFor(() => expect(putConfig).toHaveBeenCalledTimes(1));
    const [caseId, zadanie] = putConfig.mock.calls[0] as [
      string,
      { overrides: Record<string, { location_element_id: string }> },
    ];
    expect(caseId).toBe('case-1');
    const klucze = Object.keys(zadanie.overrides);
    expect(klucze).toHaveLength(1);
    expect(klucze[0]).toMatch(/^coordination_device:/);
    expect(zadanie.overrides[klucze[0]].location_element_id).toBe('bus_1');

    // Komunikat o zapisie z CTA „Przelicz koordynację" (istniejący system notyfikacji).
    const powiadomienia = useNotificationStore.getState().notifications;
    const zapisane = powiadomienia.find(
      (n) => n.message === LABELS.persistence.zapisano,
    );
    expect(zapisane).toBeDefined();
    expect(zapisane?.actions?.[0]?.label).toBe(LABELS.persistence.przelicz);
  });

  it('usunięcie urządzenia też trwa (PUT bez wpisu urządzenia) — bez fantomu po powrocie', async () => {
    getConfig.mockResolvedValue({
      ...PUSTA_KONFIGURACJA,
      overrides: { 'coordination_device:dev-serwer': URZADZENIE_Z_SERWERA },
    });

    render(<ProtectionCoordinationPage />);
    await screen.findByText('Zabezpieczenie z przypadku');

    fireEvent.click(screen.getByTitle(LABELS.devices.remove));

    await waitFor(() => expect(putConfig).toHaveBeenCalledTimes(1));
    const [, zadanie] = putConfig.mock.calls[0] as [string, { overrides: Record<string, unknown> }];
    expect(Object.keys(zadanie.overrides)).toEqual([]);
  });

  it('zmiana nastawy po biegu pokazuje baner nieaktualności, a CTA przelicza koordynację', async () => {
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
    runAnalysis.mockResolvedValue({ run_id: 'run-coord-1' });
    getResult.mockResolvedValue(WYNIK);

    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieWLokalizacji('bus_1');
    await waitFor(() =>
      expect(screen.queryByTestId('coordination-missing-currents')).toBeNull(),
    );

    fireEvent.click(screen.getByTestId('run-analysis-button'));
    await screen.findByTestId('tab-navigation');
    // Świeży wynik — baner nieaktualności NIE istnieje.
    expect(screen.queryByTestId('coordination-result-stale')).toBeNull();

    // Realna ścieżka korekty nastawy: wybór urządzenia → edytor → zapis.
    fireEvent.click(screen.getByText('Zabezpieczenie 1'));
    fireEvent.click(await screen.findByText(LABELS.actions.save));

    const baner = await screen.findByTestId('coordination-result-stale');
    expect(baner.textContent).toContain(LABELS.persistence.wynikNieaktualny);

    fireEvent.click(screen.getByTestId('coordination-recompute-button'));
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(2));
    // Po świeżym biegu baner znika (wynik znów liczony na bieżących nastawach).
    await waitFor(() =>
      expect(screen.queryByTestId('coordination-result-stale')).toBeNull(),
    );
  });
});
