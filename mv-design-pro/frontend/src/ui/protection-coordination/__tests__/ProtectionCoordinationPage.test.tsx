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
import { useSnapshotStore } from '../../topology/snapshotStore';
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

// Decyzja O-51 (pkt 7): miejsce prądu urządzenia rozstrzyga backend
// (`GET /api/cases/{id}/enm/zacisk-lokalizacji`) — mock na granicy modułu klienta.
const fetchMiejsce = vi.fn();
vi.mock('../miejsceUrzadzenia', () => ({
  fetchMiejsceUrzadzenia: (...args: unknown[]) => fetchMiejsce(...args),
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

/**
 * Odpowiedź biegu zwarciowego w kształcie KONTRAKTU backendu
 * (`api/canonical_run_views.py::build_short_circuit_results_response`):
 * wiersze PLUS `konfiguracja_biegu` z wariantem zapisanym NA BIEGU. Ekran
 * klasyfikuje przypadek maksymalny/minimalny po tym polu — nie po współczynniku
 * `c` wiersza, który na sieci SN nie odróżnia biegów (IEC 60909-0 Tabela 1:
 * c_min = 1,00 powyżej 1 kV).
 */
function odpowiedzSC(
  runId: string,
  scenariusz: 'MAX' | 'MIN',
  cFactor: number,
  ikssKa: number,
) {
  return {
    run_id: runId,
    rows: [wierszSC(cFactor, ikssKa)],
    konfiguracja_biegu: {
      c_factor: { tryb: 'jawny' as const, wartosc: cFactor },
      thermal_time_seconds: { wartosc: 1.0, pochodzenie: 'opcje_biegu' as const },
      metoda: 'IEC 60909',
      scenariusz,
    },
  };
}

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

/** Wiersz zwarciowy szyny `bus_2` (zacisk końcowy linii `line_1`). */
function wierszSC2(cFactor: number, ikssKa: number) {
  return { ...wierszSC(cFactor, ikssKa), target_id: 'bus_2', element_id: 'bus_2', target_name: 'Szyna 2' };
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
  branches: [{ id: 'l1', ref_id: 'line_1', name: 'Magistrala', type: 'cable' }],
  transformers: [],
};

const ZACISKI_LINII = {
  od: { szyna_ref: 'bus_1', etykieta_pl: 'Zacisk początkowy — szyna Szyna 1' },
  do: { szyna_ref: 'bus_2', etykieta_pl: 'Zacisk końcowy — szyna Szyna 2' },
};

const POWOD_BRAK_WSKAZANIA =
  'Model nie wskazuje, przy którym zacisku gałęzi stoi zabezpieczenie — wskaż zacisk.';

/**
 * Odpowiedź backendu w kształcie `opis_miejsca_urzadzenia` (1:1): gałąź wymaga
 * wskazania zacisku (bez niego odmowa nazwana), szyna nie ma zacisków.
 */
function rozstrzygniecie(_caseId: string, lokalizacja: string, zacisk: 'od' | 'do' | null) {
  if (lokalizacja === 'line_1') {
    return {
      lokalizacja_ref: 'line_1',
      rodzaj_lokalizacji: 'galaz',
      zaciski: ZACISKI_LINII,
      galaz_ref: zacisk ? 'line_1' : null,
      zacisk,
      zrodlo_zacisku: zacisk ? 'wskazanie' : null,
      wymaga_wskazania_zacisku: true,
      odmowa_zacisku: zacisk
        ? null
        : { kod: 'protection.relay_terminal_indication_missing', powod_pl: POWOD_BRAK_WSKAZANIA },
    };
  }
  return {
    lokalizacja_ref: lokalizacja,
    rodzaj_lokalizacji: 'szyna',
    zaciski: null,
    galaz_ref: null,
    zacisk: null,
    zrodlo_zacisku: null,
    wymaga_wskazania_zacisku: false,
    odmowa_zacisku: null,
  };
}

/** Wiersz gałęziowy rozpływu linii `line_1` — prądy obu zacisków (kabel z susceptancją). */
const WIERSZ_LINII = {
  branch_id: 'line-1',
  element_id: 'line_1',
  name: 'Magistrala',
  from_bus: 'bus_1',
  to_bus: 'bus_2',
  i_a: 180,
  i_do_a: 175,
  s_mva: null,
  p_mw: null,
  q_mvar: null,
  loading_pct: null,
  flags: [],
};

/** Realna droga projektanta: dodaj urządzenie → wskaż element → zapisz. */
async function dodajUrzadzenieWLokalizacji(refId: string): Promise<void> {
  fireEvent.click(screen.getByText(LABELS.devices.add));
  const wybor = await screen.findByTestId('device-location-select');
  fireEvent.change(wybor, { target: { value: refId } });
  fireEvent.click(screen.getByText(LABELS.actions.save));
}

/**
 * Realna droga dla lokalizacji-GAŁĘZI (decyzja O-51 pkt 7): dodaj urządzenie → wskaż
 * linię z listy modelu → kliknij zacisk (etykieta z backendu) → zapisz.
 */
async function dodajUrzadzenieNaLinii(zacisk: 'od' | 'do'): Promise<void> {
  fireEvent.click(screen.getByText(LABELS.devices.add));
  fireEvent.change(await screen.findByTestId('device-location-select'), {
    target: { value: 'line_1' },
  });
  fireEvent.click(await screen.findByTestId(`device-terminal-${zacisk}`));
  fireEvent.click(screen.getByText(LABELS.actions.save));
}

/** Minimalny kompletny wynik analizy (kształt kontraktu `getCoordinationResult`). */
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
  fetchMiejsce.mockImplementation(async (caseId: string, lok: string, zacisk: 'od' | 'do' | null) =>
    rozstrzygniecie(caseId, lok, zacisk),
  );
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

  /**
   * Klasa P9 (decyzja O-51 pkt 7): prąd roboczy = prąd ZACISKU gałęzi, przy którym stoi
   * urządzenie. Dawny test dopasowywał wiersz GAŁĘZI do lokalizacji-SZYNY (`element_id:
   * 'bus_1'` w wierszu gałęzi) — kształt, którego backend nigdy nie wystawia. Teraz realna
   * droga: wskaż linię z listy modelu, kliknij zacisk (etykieta z backendu), zapisz.
   */
  it('dwa biegi zwarciowe (scenariusz MAX i MIN) + rozpływ + wskazany zacisk dają komplet prądów i żądanie z biegami', async () => {
    useExecutionRunsStore.setState({ runs: [BIEG_SC_MAX, BIEG_SC_MIN, BIEG_LF] } as never);
    fetchSC.mockImplementation(async (id: string) =>
      id === 'run-sc-max'
        ? odpowiedzSC(id, 'MAX', 1.1, 8.4)
        : odpowiedzSC(id, 'MIN', 1.0, 3.1),
    );
    fetchBranches.mockResolvedValue({ run_id: 'run-lf', rows: [WIERSZ_LINII] });
    runAnalysis.mockResolvedValue({ run_id: 'run-coord-1' });
    getResult.mockResolvedValue(WYNIK);

    render(<ProtectionCoordinationPage />);
    fireEvent.click(screen.getByText(LABELS.devices.add));
    fireEvent.change(await screen.findByTestId('device-location-select'), {
      target: { value: 'line_1' },
    });
    const zaciskOd = await screen.findByTestId('device-terminal-od');
    expect(screen.getByTestId('device-terminal').textContent).toContain(
      'Zacisk początkowy — szyna Szyna 1',
    );
    fireEvent.click(zaciskOd);
    fireEvent.click(screen.getByText(LABELS.actions.save));

    // Miejsce prądu rozstrzyga backend dla WSKAZANEGO zacisku.
    await waitFor(() => expect(fetchMiejsce).toHaveBeenCalledWith('case-1', 'line_1', 'od'));
    fireEvent.click(screen.getByTestId('run-analysis-button'));
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));

    // Żądanie niesie: prąd zwarciowy SZYNY zacisku `od` (bus_1) pod lokalizacją linii,
    // prąd roboczy zacisku `od` (i_a = 180 A, nie i_do_a = 175 A), zacisk urządzenia
    // i identyfikatory biegów, którymi backend potwierdza prądy (karta S-2).
    const [, zadanie] = runAnalysis.mock.calls[0] as [string, Record<string, unknown>];
    expect(zadanie.fault_currents).toEqual([
      { location_id: 'line_1', ik_max_3f_a: 8400, ik_min_3f_a: 3100 },
    ]);
    expect(zadanie.operating_currents).toEqual([{ location_id: 'line_1', i_operating_a: 180 }]);
    expect((zadanie.devices as { zacisk?: string }[])[0].zacisk).toBe('od');
    expect(zadanie.sc_run_id).toBe('run-sc-max');
    expect(zadanie.sc_run_id_min).toBe('run-sc-min');
    expect(zadanie.pf_run_id).toBe('run-lf');
    expect(screen.queryByTestId('coordination-missing-currents')).toBeNull();
  });

  it('zacisk `do` → prąd roboczy i prąd zwarciowy z zacisku końcowego', async () => {
    useExecutionRunsStore.setState({ runs: [BIEG_SC_MAX, BIEG_SC_MIN, BIEG_LF] } as never);
    fetchSC.mockImplementation(async (id: string) =>
      id === 'run-sc-max'
        ? { ...odpowiedzSC(id, 'MAX', 1.1, 8.4), rows: [wierszSC(1.1, 8.4), wierszSC2(1.1, 6.0)] }
        : { ...odpowiedzSC(id, 'MIN', 1.0, 3.1), rows: [wierszSC(1.0, 3.1), wierszSC2(1.0, 2.5)] },
    );
    fetchBranches.mockResolvedValue({ run_id: 'run-lf', rows: [WIERSZ_LINII] });
    runAnalysis.mockResolvedValue({ run_id: 'run-coord-1' });
    getResult.mockResolvedValue(WYNIK);

    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieNaLinii('do');
    await waitFor(() => expect(fetchMiejsce).toHaveBeenCalledWith('case-1', 'line_1', 'do'));
    fireEvent.click(screen.getByTestId('run-analysis-button'));
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));

    const [, zadanie] = runAnalysis.mock.calls[0] as [string, Record<string, unknown>];
    expect(zadanie.fault_currents).toEqual([
      { location_id: 'line_1', ik_max_3f_a: 6000, ik_min_3f_a: 2500 },
    ]);
    expect(zadanie.operating_currents).toEqual([{ location_id: 'line_1', i_operating_a: 175 }]);
  });

  it('linia bez wskazanego zacisku → brak prądu roboczego z powodem backendu, nie prąd „od"', async () => {
    useExecutionRunsStore.setState({ runs: [BIEG_SC_MAX, BIEG_SC_MIN, BIEG_LF] } as never);
    fetchSC.mockImplementation(async (id: string) =>
      id === 'run-sc-max'
        ? odpowiedzSC(id, 'MAX', 1.1, 8.4)
        : odpowiedzSC(id, 'MIN', 1.0, 3.1),
    );
    fetchBranches.mockResolvedValue({ run_id: 'run-lf', rows: [WIERSZ_LINII] });

    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieWLokalizacji('line_1');

    const panel = await screen.findByTestId('coordination-missing-currents');
    await waitFor(() => expect(panel.textContent).toContain(POWOD_BRAK_WSKAZANIA));
    expect(fetchMiejsce).toHaveBeenCalledWith('case-1', 'line_1', null);
  });

  it('brak biegu rozpływu → panel mówi wprost, że prąd roboczy jest niedostępny', async () => {
    // Same biegi zwarciowe: kryterium przeciążenia zostaje niesprawdzalne i to
    // musi być widoczne, a nie ukryte zerem.
    useExecutionRunsStore.setState({ runs: [BIEG_SC_MAX, BIEG_SC_MIN] } as never);
    fetchSC.mockImplementation(async (id: string) =>
      id === 'run-sc-max'
        ? odpowiedzSC(id, 'MAX', 1.1, 8.4)
        : odpowiedzSC(id, 'MIN', 1.0, 3.1),
    );

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
    expect([...wybor.options].map((o) => o.value)).toEqual(['', 'bus_1', 'bus_2', 'line_1']);
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
    fetchSC.mockImplementation(async (id: string) =>
      id === 'run-sc-max'
        ? odpowiedzSC(id, 'MAX', 1.1, 8.4)
        : odpowiedzSC(id, 'MIN', 1.0, 3.1),
    );
    fetchBranches.mockResolvedValue({ run_id: 'run-lf', rows: [WIERSZ_LINII] });

    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieNaLinii('od');
    await waitFor(() => expect(fetchMiejsce).toHaveBeenCalledWith('case-1', 'line_1', 'od'));

    fireEvent.click(screen.getByTitle(LABELS.devices.clone));

    // Klon nie dostaje `line_1_copy` (element, którego nie ma w modelu) ani prądów
    // przepisanych z `line_1` — jego lokalizacja jest pusta i wymaga wskazania.
    await waitFor(() =>
      expect(
        screen.getAllByText(
          (tekst) => tekst.includes(LABELS.validation.lokalizacjaNieWskazana),
        ).length,
      ).toBe(1),
    );
    expect(screen.queryByText(/line_1_copy/)).toBeNull();

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


  it('hydratacja z GET: urządzenie zapisane w przypadku pojawia się na liście', async () => {
    getConfig.mockResolvedValue({
      ...PUSTA_KONFIGURACJA,
      overrides: { 'coordination_device:dev-serwer': URZADZENIE_Z_SERWERA },
    });

    // Migawka modelu powłoki — ten sam most nazw co schemat nazywa miejsce urządzenia.
    useSnapshotStore.setState({ snapshot: MIGAWKA } as never);
    render(<ProtectionCoordinationPage />);

    expect(await screen.findByText('Zabezpieczenie z przypadku')).toBeInTheDocument();
    expect(getConfig).toHaveBeenCalledWith('case-1');
    // Lokalizacja z serwera, nie „lokalizacja niewskazana".
    const wierszLokalizacji = screen.getByTestId('device-location-dev-serwer');
    // Karta #145: miejsce nazwane nazwą elementu z modelu, nie referencją.
    expect(wierszLokalizacji.textContent).toContain('Szyna 2');
    expect(wierszLokalizacji.textContent).not.toContain('bus_2');
    useSnapshotStore.setState({ snapshot: null } as never);
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
    fetchSC.mockImplementation(async (id: string) =>
      id === 'run-sc-max'
        ? odpowiedzSC(id, 'MAX', 1.1, 8.4)
        : odpowiedzSC(id, 'MIN', 1.0, 3.1),
    );
    // Prąd roboczy z zacisku linii (decyzja O-51 pkt 7) — dawniej wiersz GAŁĘZI
    // udawał wiersz szyny (`element_id: 'bus_1'`), kształt, którego backend nie wystawia.
    fetchBranches.mockResolvedValue({ run_id: 'run-lf', rows: [WIERSZ_LINII] });
    runAnalysis.mockResolvedValue({ run_id: 'run-coord-1' });
    getResult.mockResolvedValue(WYNIK);

    render(<ProtectionCoordinationPage />);
    await dodajUrzadzenieNaLinii('od');
    await waitFor(() => expect(fetchMiejsce).toHaveBeenCalledWith('case-1', 'line_1', 'od'));

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
