/**
 * Testy ekranu „Stabilność dynamiczna" (E-32, karta P-3).
 * Interakcje natywne (userEvent.click) — Zero-Debt pkt 5. Dostawca danych
 * mockuje `fetch` 1:1 z endpointami results/dynamic-stability i
 * results/automation-trace — bez fabrykacji danych po stronie ekranu.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { useSelectionStore } from '../../../../ui/selection/store';
import { EkranStabilnosci } from '../EkranStabilnosci';
import { POLA_SCENARIUSZA_STABILNOSCI } from '../model';
import { STABILNOSC_STRINGS as T } from '../strings';

const CASE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** Wartości scenariusza KOMPLETNE — jedna dla wszystkich testów formularza,
 *  żeby test iloczynu cech (walidacja per pole) nie duplikował literałów. */
const WARTOSCI_SCENARIUSZA: Record<string, string> = {
  faulted_element_id: 'line/gpz/1',
  clearing_time_ms: '120',
  cleared_by_element_ids: 'cb-a, cb-b',
  pre_fault_angle_deg: '10',
  during_fault_angle_deg: '75',
  post_fault_angle_deg: '28',
  post_fault_voltage_pu: '0,97',
  post_fault_frequency_pu: '0.99',
  recovery_time_constant_s: '0,3',
};

const RUN_DYN = {
  id: 'run-dyn',
  analysis_type: 'DYNAMIC_STABILITY',
  status: 'DONE',
  finished_at: '2026-07-21T10:00:00Z',
  started_at: '2026-07-21T09:59:00Z',
} as never;

const WYNIK = {
  run_id: 'run-dyn',
  rows: [
    {
      scenario_id: 'dyn-1',
      source_id: 'src/pv/1',
      faulted_element_id: 'line/gpz/1',
      cleared_by_element_ids: ['cb-main'],
      stable: true,
      status: 'STABLE',
      criteria_version: 'dynamic_stability_fault_clear_v1',
      stability_index: 0.812,
      clearing_time_ms: 120,
      max_clearing_time_ms: 150,
      clearing_margin_ms: 30,
      angle_swing_deg: 65,
      post_fault_voltage_pu: 0.97,
      post_fault_frequency_pu: 0.99,
      limiting_factor: 'angle_swing',
      violated_checks: [],
      checks: {
        clearing_time: true,
        angle_swing: true,
        voltage_recovery: true,
        frequency_recovery: true,
      },
      threshold_criteria: [
        {
          key: 'max_clearing_time_ms',
          label_pl: 'Maksymalny czas wyłączenia zwarcia',
          value: 150,
          unit: 'ms',
          source_pl: 'Kryterium przyjęte w opcjach biegu tej analizy.',
        },
        {
          key: 'max_angle_swing_deg',
          label_pl: 'Maksymalne wychylenie kąta mocy',
          value: 120,
          unit: '°',
          source_pl: 'Kryterium przyjęte w opcjach biegu tej analizy.',
        },
      ],
      reporting_status_pl: 'raportowalny',
      proof_status_pl: 'pelny',
      reporting_limitations: [],
    },
  ],
};

const SLAD = {
  run_id: 'run-dyn',
  topology_effect: { network_state: 'ISLANDED_SECTION', outage_scope: 'SECTION' },
  rows: [
    { event_seq: 2, event_type: 'FAULT_APPLIED', element_id: 'line/gpz/1', detail: 'Fault applied' },
    { event_seq: 1, event_type: 'AUTOMATION_STARTED', element_id: null, detail: 'Start' },
  ],
};

const PRZEBIEG = {
  run_id: 'run-dyn',
  has_time_series: true,
  time_unit: 's',
  criteria_version: 'dynamic_stability_fault_clear_v1',
  quantities: [
    { key: 'voltage_pu', label_pl: 'Napięcie', unit: 'p.u.' },
    { key: 'frequency_pu', label_pl: 'Częstotliwość', unit: 'p.u.' },
  ],
  points: [
    { t_s: -0.1, voltage_pu: 1.0, frequency_pu: 1.0 },
    { t_s: 0.0, voltage_pu: 0.0, frequency_pu: 1.0 },
    { t_s: 0.12, voltage_pu: 0.0, frequency_pu: 1.0 },
    { t_s: 0.5, voltage_pu: 0.74, frequency_pu: 1.0 },
    { t_s: 2.0, voltage_pu: 0.97, frequency_pu: 0.99 },
  ],
};

const PRZEBIEG_BRAK = {
  run_id: 'run-dyn',
  has_time_series: false,
  time_unit: 's',
  quantities: [],
  points: [],
};

function mockFetchStabilnosci(przebieg: unknown = PRZEBIEG) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = url.endsWith('/results/dynamic-stability/time-series')
      ? przebieg
      : url.endsWith('/results/dynamic-stability')
        ? WYNIK
        : url.endsWith('/results/automation-trace')
          ? SLAD
          : null;
    if (json === null) throw new Error(`Nieoczekiwany URL w teście: ${url}`);
    return { ok: true, status: 200, json: async () => json } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useNetworkBuildStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EkranStabilnosci — kontrakt ekranu prowadzącego (FLOW §0.3)', () => {
  it('nagłówek: eyebrow, tytuł i zdanie celu inżynierskiego', () => {
    render(<EkranStabilnosci />);
    expect(screen.getByText(T.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: T.tytul })).toBeInTheDocument();
    expect(screen.getByText(T.cel)).toBeInTheDocument();
  });

  it('brak zakończonego przebiegu stabilności → uczciwy stan zerowy z formularzem, nie werdykt', async () => {
    const user = userEvent.setup();
    render(<EkranStabilnosci />);

    const zero = screen.getByTestId('mvd-stabilnosc-zero');
    expect(zero).toBeInTheDocument();
    expect(zero).toHaveTextContent(T.zeroTytul);
    expect(screen.queryByTestId('mvd-stabilnosc-werdykt')).not.toBeInTheDocument();
    // Stan zerowy pokazuje FORMULARZ scenariusza, nie tylko akcję nawigacyjną.
    expect(screen.getByTestId('mvd-stabilnosc-formularz')).toBeInTheDocument();
    for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
      expect(screen.getByTestId(`mvd-stabilnosc-pole-${pole.klucz}`)).toHaveValue('');
    }

    await user.click(screen.getByTestId('mvd-stabilnosc-zero-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });
});

describe('EkranStabilnosci — formularz scenariusza (karta W2 pkt 1, zero fabrykacji)', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeCaseId: CASE_ID, activeProjectId: 'projekt-1' } as never);
    useSnapshotStore.setState({ readiness: { ready: true, blockers: [], warnings: [] } } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
    );
  });

  it('brak KAŻDEGO pola z osobna blokuje wysyłkę (iloczyn cech, nie przykład z karty)', async () => {
    for (const pominietePole of POLA_SCENARIUSZA_STABILNOSCI) {
      cleanup();
      const user = userEvent.setup();
      const createAndExecuteRun = vi.fn();
      useExecutionRunsStore.setState({ runs: [], createAndExecuteRun } as never);
      render(<EkranStabilnosci />);

      for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
        if (pole.klucz === pominietePole.klucz) continue;
        await user.type(
          screen.getByTestId(`mvd-stabilnosc-pole-${pole.klucz}`),
          WARTOSCI_SCENARIUSZA[pole.klucz],
        );
      }
      await user.click(screen.getByTestId('mvd-stabilnosc-formularz-uruchom'));

      expect(
        screen.getByTestId(`mvd-stabilnosc-pole-${pominietePole.klucz}-blad`),
        `pole ${pominietePole.klucz}: brak komunikatu błędu`,
      ).toBeInTheDocument();
      expect(
        createAndExecuteRun,
        `pole ${pominietePole.klucz}: bieg NIE powinien wystartować`,
      ).not.toHaveBeenCalled();
    }
  });

  it('natywny klik „Uruchom ocenę progową" z kompletem pól wysyła DOKŁADNIE kontrakt opcji biegu', async () => {
    const user = userEvent.setup();
    // Sygnatura mocka jawna (caseId, zadanie), zeby `mock.calls[0]` bylo typem krotki bez
    // rzutowania `[] as [string, unknown]` (dlug typow poza bramka, tsconfig_gate_guard).
    const createAndExecuteRun = vi.fn(async (_caseId: string, _zadanie: unknown) => ({
      id: 'run-nowy',
      study_case_id: CASE_ID,
      analysis_type: 'DYNAMIC_STABILITY',
      solver_input_hash: 'hash',
      status: 'DONE',
      started_at: '2026-09-09T10:00:00Z',
      finished_at: '2026-09-09T10:00:01Z',
      error_message: null,
    }));
    useExecutionRunsStore.setState({
      runs: [],
      createAndExecuteRun,
      pollRunStatus: vi.fn(),
      loadRuns: vi.fn(),
    } as never);
    render(<EkranStabilnosci />);

    for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
      await user.type(
        screen.getByTestId(`mvd-stabilnosc-pole-${pole.klucz}`),
        WARTOSCI_SCENARIUSZA[pole.klucz],
      );
    }
    await user.click(screen.getByTestId('mvd-stabilnosc-formularz-uruchom'));

    expect(createAndExecuteRun).toHaveBeenCalledTimes(1);
    const [wolanyCaseId, zadanie] = createAndExecuteRun.mock.calls[0];
    expect(wolanyCaseId).toBe(CASE_ID);
    expect(zadanie).toEqual({
      analysis_type: 'DYNAMIC_STABILITY',
      solver_input: {
        faulted_element_id: 'line/gpz/1',
        clearing_time_ms: 120,
        cleared_by_element_ids: ['cb-a', 'cb-b'],
        pre_fault_angle_deg: 10,
        during_fault_angle_deg: 75,
        post_fault_angle_deg: 28,
        post_fault_voltage_pu: 0.97,
        post_fault_frequency_pu: 0.99,
        recovery_time_constant_s: 0.3,
      },
    });
  });

  it('czas wyłączenia i stała czasowa <= 0 dają błąd „wartość musi być dodatnia"', async () => {
    const user = userEvent.setup();
    const createAndExecuteRun = vi.fn();
    useExecutionRunsStore.setState({ runs: [], createAndExecuteRun } as never);
    render(<EkranStabilnosci />);

    for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
      const wartosc =
        pole.klucz === 'clearing_time_ms' || pole.klucz === 'recovery_time_constant_s'
          ? '0'
          : WARTOSCI_SCENARIUSZA[pole.klucz];
      await user.type(screen.getByTestId(`mvd-stabilnosc-pole-${pole.klucz}`), wartosc);
    }
    await user.click(screen.getByTestId('mvd-stabilnosc-formularz-uruchom'));

    expect(screen.getByTestId('mvd-stabilnosc-pole-clearing_time_ms-blad')).toHaveTextContent(
      T.bladDodatnie,
    );
    expect(
      screen.getByTestId('mvd-stabilnosc-pole-recovery_time_constant_s-blad'),
    ).toHaveTextContent(T.bladDodatnie);
    expect(createAndExecuteRun).not.toHaveBeenCalled();
  });
});

describe('EkranStabilnosci — dane przebiegu (fetch 1:1 z endpointami)', () => {
  beforeEach(() => {
    mockFetchStabilnosci();
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
  });

  it('założenia scenariusza i werdykt backendu (STABLE → STABILNY)', async () => {
    render(<EkranStabilnosci />);
    const werdykt = await screen.findByTestId('mvd-stabilnosc-werdykt');
    expect(werdykt).toHaveAttribute('data-werdykt', 'STABLE');
    // Nagłówek wyniku (karta W2 pkt 1): ocena progowa, jawnie NIE symulacja RMS.
    expect(werdykt).toHaveTextContent(T.werdyktTytul);
    expect(screen.getByTestId('mvd-stabilnosc-werdykt-status')).toHaveTextContent(T.werdyktStabilny);
    expect(screen.getByTestId('mvd-stabilnosc-wskaznik')).toHaveTextContent('0,812');
    expect(screen.getByTestId('mvd-stabilnosc-margines')).toHaveTextContent('30,0 ms');
    expect(screen.getByTestId('mvd-stabilnosc-czynnik')).toHaveTextContent(
      'wychylenie kąta wirnika',
    );
    // Założenia: element zakłócenia + czas wyłączenia scenariusza.
    expect(screen.getByText('line/gpz/1')).toBeInTheDocument();
  });

  it('kryteria oceny progowej JAWNIE nazwane, z etykietą, progiem i pochodzeniem', async () => {
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');
    const kryteria = screen.getByTestId('mvd-stabilnosc-kryteria');
    expect(kryteria).toHaveTextContent('Maksymalny czas wyłączenia zwarcia');
    expect(screen.getByTestId('mvd-stabilnosc-kryterium-max_clearing_time_ms')).toHaveTextContent(
      '150,000 ms',
    );
    expect(kryteria).toHaveTextContent('Kryterium przyjęte w opcjach biegu tej analizy.');
  });

  it('tabela wielkości ze statusami kryteriów backendu + jawna nota o braku szeregu czasowego', async () => {
    render(<EkranStabilnosci />);
    expect(await screen.findByTestId('mvd-stabilnosc-wielkosci')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-stabilnosc-wielkosc-angle_swing')).toHaveTextContent('65,0 °');
    expect(screen.getByTestId('mvd-stabilnosc-wielkosc-voltage_recovery')).toHaveTextContent(
      '0,970 p.u.',
    );
    expect(screen.getByTestId('mvd-stabilnosc-brak-szeregu')).toHaveTextContent(
      T.brakSzereguCzasowego,
    );
  });

  it('ślad automatyki na żądanie (natywny klik) — zdarzenia w kolejności event_seq', async () => {
    const user = userEvent.setup();
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    expect(screen.queryByTestId('mvd-stabilnosc-zdarzenia')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-stabilnosc-slad-btn'));

    const tabela = screen.getByTestId('mvd-stabilnosc-zdarzenia');
    const wiersze = tabela.querySelectorAll('tbody tr');
    expect(wiersze).toHaveLength(2);
    expect(wiersze[0]).toHaveTextContent('start sekwencji automatyki');
    expect(wiersze[1]).toHaveTextContent('wystąpienie zwarcia');
    expect(screen.getByTestId('mvd-stabilnosc-topologia')).toHaveTextContent('ISLANDED_SECTION');
  });

  it('akcja „Otwórz pełny dowód obliczeń" otwiera zakładkę dowodu przebiegu', async () => {
    const user = userEvent.setup();
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    await user.click(screen.getByTestId('mvd-stabilnosc-dowod'));
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-dyn');
  });

  it('raportowalność PL z backendu; powrót do huba czyści powierzchnię trasową', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-32', { openMode: 'expand_workspace' });
    render(<EkranStabilnosci />);

    expect(await screen.findByTestId('mvd-stabilnosc-raport-status')).toHaveTextContent(
      'raportowalny',
    );
    await user.click(screen.getByTestId('mvd-stabilnosc-powrot'));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });
});

describe('EkranStabilnosci — przebieg czasowy na żądanie (ST-1)', () => {
  it('nie pobiera przebiegu przed klikiem (na żądanie); klik ładuje wykres i chowa notę', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchStabilnosci();
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    // Na żądanie: endpoint szeregu NIE jest wołany przed klikiem.
    const wolaniaPrzed = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('/time-series'),
    );
    expect(wolaniaPrzed).toHaveLength(0);
    // Zanim pobierzemy szereg — nota o braku szeregu jest widoczna.
    expect(screen.getByTestId('mvd-stabilnosc-brak-szeregu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-stabilnosc-wykres')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-stabilnosc-przebieg-btn'));

    // Wykres pojawia się z danymi i seriami PL; nota o braku szeregu znika.
    expect(await screen.findByTestId('mvd-stabilnosc-wykres')).toBeInTheDocument();
    // Nazwa serii występuje w przełączniku i w legendzie wykresu.
    expect(screen.getAllByText(T.przebiegSeriaNapiecie).length).toBeGreaterThan(0);
    expect(screen.getAllByText(T.przebiegSeriaCzestotliwosc).length).toBeGreaterThan(0);
    expect(screen.getByTestId('mvd-stabilnosc-serie-voltage_pu')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByTestId('mvd-stabilnosc-brak-szeregu')).not.toBeInTheDocument();
    // Endpoint szeregu wołany dokładnie raz (po kliku).
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/time-series')),
    ).toHaveLength(1);
  });

  it('starszy bieg bez szeregu → uczciwy stan zerowy, nota o braku szeregu zostaje', async () => {
    const user = userEvent.setup();
    mockFetchStabilnosci(PRZEBIEG_BRAK);
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    await user.click(screen.getByTestId('mvd-stabilnosc-przebieg-btn'));

    expect(await screen.findByTestId('mvd-stabilnosc-przebieg-brak')).toHaveTextContent(
      T.przebiegBrak,
    );
    expect(screen.queryByTestId('mvd-stabilnosc-wykres')).not.toBeInTheDocument();
    // Bieg bez szeregu → nota o braku szeregu zostaje (usuwana TYLKO dla biegów z szeregiem).
    expect(screen.getByTestId('mvd-stabilnosc-brak-szeregu')).toBeInTheDocument();
  });

  it('błąd endpointu przebiegu → uczciwy komunikat, bez wykresu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/results/dynamic-stability/time-series')) {
          return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
        const json = url.endsWith('/results/dynamic-stability')
          ? WYNIK
          : { run_id: 'run-dyn', rows: [], topology_effect: null };
        return { ok: true, status: 200, json: async () => json } as Response;
      }),
    );
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    await user.click(screen.getByTestId('mvd-stabilnosc-przebieg-btn'));
    expect(await screen.findByTestId('mvd-stabilnosc-przebieg-blad')).toHaveTextContent(
      T.przebiegBlad,
    );
    expect(screen.queryByTestId('mvd-stabilnosc-wykres')).not.toBeInTheDocument();
  });
});

describe('EkranStabilnosci — uczciwe braki', () => {
  it('werdykt niedostępny (błąd endpointu) → stan błędu z akcją naprawczą', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response),
    );
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);

    expect(await screen.findByTestId('mvd-stabilnosc-blad')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-stabilnosc-werdykt')).not.toBeInTheDocument();
  });

  it('przebieg bez wiersza wyniku → uczciwy komunikat, bez tabel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = url.endsWith('/results/dynamic-stability')
          ? { run_id: 'run-dyn', rows: [] }
          : { run_id: 'run-dyn', rows: [], topology_effect: null };
        return { ok: true, status: 200, json: async () => json } as Response;
      }),
    );
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);

    expect(await screen.findByTestId('mvd-stabilnosc-brak-wiersza')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-stabilnosc-wielkosci')).not.toBeInTheDocument();
  });
});

describe('EkranStabilnosci — pętla decyzji (F-K4 faza 3, znalezisko Z4)', () => {
  /** Wynik NIESTABILNY z rodzajami elementów z kontraktu (`*_kind` ze snapshotu biegu). */
  function mockNiestabilny(over: Record<string, unknown> = {}) {
    const wiersz = {
      ...WYNIK.rows[0],
      stable: false,
      status: 'UNSTABLE',
      violated_checks: ['angle_swing'],
      faulted_element_kind: 'galaz_liniowa',
      source_kind: 'generator',
      ...over,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = url.endsWith('/results/dynamic-stability')
          ? { run_id: 'run-dyn', rows: [wiersz] }
          : url.endsWith('/results/automation-trace')
            ? SLAD
            : null;
        if (json === null) throw new Error(`Nieoczekiwany URL w teście: ${url}`);
        return { ok: true, status: 200, json: async () => json } as Response;
      }),
    );
  }

  beforeEach(() => {
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
  });

  it('utrata stabilności prowadzi do MIEJSCA ZWARCIA w modelu (typ z kontraktu)', async () => {
    const user = userEvent.setup();
    mockNiestabilny();
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    await user.click(screen.getByTestId('mvd-stabilnosc-popraw'));

    expect(useSelectionStore.getState().selectedElement).toEqual({
      id: 'line/gpz/1',
      type: 'LineBranch',
      name: 'line/gpz/1',
    });
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });

  it('bez rodzaju miejsca zwarcia akcja prowadzi do ŹRÓDŁA (drugi kandydat kontraktu)', async () => {
    const user = userEvent.setup();
    mockNiestabilny({ faulted_element_kind: null });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    await user.click(screen.getByTestId('mvd-stabilnosc-popraw'));

    expect(useSelectionStore.getState().selectedElement).toEqual({
      id: 'src/pv/1',
      type: 'Generator',
      name: 'src/pv/1',
    });
  });

  it('kontrakt BEZ rodzajów (starszy bieg) → brak akcji, bo prowadziłaby w nikąd', async () => {
    mockNiestabilny({ faulted_element_kind: null, source_kind: null });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    expect(screen.queryByTestId('mvd-stabilnosc-popraw')).toBeNull();
  });

  it('wynik STABILNY nie dostaje akcji naprawczej (nie ma czego naprawiać)', async () => {
    mockFetchStabilnosci();
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-werdykt');

    expect(screen.queryByTestId('mvd-stabilnosc-popraw')).toBeNull();
  });
});
