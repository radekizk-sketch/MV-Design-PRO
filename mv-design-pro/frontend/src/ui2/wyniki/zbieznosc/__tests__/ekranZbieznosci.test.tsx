/**
 * Testy ekranu „Zbieżność rozpływu i zaczepy" (E-30, karta P-2).
 * Kliki natywne (userEvent) — Zero-Debt pkt 5 (żadnych syntetycznych dispatchEvent).
 * Realna ścieżka wejścia: karta huba analiz → powierzchnia E-30.
 * Dane przebiegu mockowane przez `fetch` 1:1 z kontraktem
 * `ui/power-flow-results/api.ts` (GET /power-flow-runs/:id, /results, /trace)
 * — ekran niczego nie liczy, tylko renderuje odpowiedzi backendu.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { usePowerFlowResultsStore } from '../../../../ui/power-flow-results/store';
import type { PowerFlowResultV1, PowerFlowTrace } from '../../../../ui/power-flow-results/types';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useSelectionStore } from '../../../../ui/selection/store';
import { useShellStore } from '../../../shell/useShellStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import { EkranAnalizTechnicznych } from '../../analizy/EkranAnalizTechnicznych';
import { EkranZbieznosci } from '../EkranZbieznosci';
import { ZBIEZNOSC_STRINGS as T } from '../strings';
import {
  naWierszeOltcPrzebiegu,
  naWierszeWysp,
  naWierszZaczepowModelu,
  naZalozeniaZbieznosci,
  wybierzPrzebiegRozplywu,
} from '../zbieznoscModel';

const RUN_LF: ExecutionRun = {
  id: 'run-lf-1',
  study_case_id: 'case-1',
  analysis_type: 'LOAD_FLOW',
  solver_input_hash: 'hash-lf-1',
  status: 'DONE',
  finished_at: '2026-07-20T10:00:00Z',
  started_at: '2026-07-20T09:59:00Z',
  error_message: null,
};

const RUN_SC: ExecutionRun = {
  id: 'run-sc-1',
  study_case_id: 'case-1',
  analysis_type: 'SC_3F',
  solver_input_hash: 'hash-sc-1',
  status: 'DONE',
  finished_at: '2026-07-20T08:00:00Z',
  started_at: '2026-07-20T07:59:00Z',
  error_message: null,
};

const HEADER = {
  id: 'run-lf-1',
  project_id: 'project-1',
  study_case_id: 'case-1',
  status: 'FINISHED',
  result_status: 'VALID',
  created_at: '2026-07-20T09:59:00Z',
  finished_at: '2026-07-20T10:00:00Z',
  input_hash: 'hash-1',
  converged: true,
  iterations: 4,
};

function wynikFixture(over: Partial<PowerFlowResultV1> = {}): PowerFlowResultV1 {
  return {
    result_version: '1.0',
    converged: true,
    iterations_count: 4,
    tolerance_used: 1e-6,
    base_mva: 100,
    slack_bus_id: 'BUS-GPZ',
    bus_results: [],
    branch_results: [],
    summary: {
      total_losses_p_mw: 0.1234,
      total_losses_q_mvar: 0.0456,
      min_v_pu: 0.978,
      max_v_pu: 1.012,
      slack_p_mw: 5.4321,
      slack_q_mvar: 1.2345,
    },
    ...over,
  };
}

function sladFixture(over: Partial<PowerFlowTrace> = {}): PowerFlowTrace {
  return {
    solver_version: 'load-flow-newton-raphson-v1',
    solver_method: 'newton-raphson',
    input_hash: 'hash-1',
    snapshot_id: 'snap-1',
    case_id: 'case-1',
    run_id: 'run-lf-1',
    init_state: {},
    init_method: 'flat_start',
    tolerance: 1e-6,
    max_iterations: 50,
    base_mva: 100,
    slack_bus_id: 'BUS-GPZ',
    pq_bus_ids: [],
    pv_bus_ids: [],
    iterations: [
      { k: 1, norm_mismatch: 0.5, max_mismatch_pu: 0.2 },
      { k: 2, norm_mismatch: 0.001, max_mismatch_pu: 0.0005 },
    ],
    converged: true,
    final_iterations_count: 4,
    oltc_control: {
      regulators: [
        {
          branch_id: 'uuid-tr-1',
          regulated_winding: 'HV',
          controlled_bus_id: 'BUS-SN',
          setpoint_kv: 15.2,
          deadband_kv: 0.2,
          initial_position: 0,
          min_position: -9,
          max_position: 9,
        },
      ],
      converged: true,
      iterations_count: 2,
      switch_counts: { 'uuid-tr-1': 2 },
      total_switch_count: 2,
      final_positions: { 'uuid-tr-1': -2 },
      initial_positions: { 'uuid-tr-1': 0 },
    },
    ...over,
  };
}

const SNAPSHOT_Z_TRANSFORMATOREM = {
  header: { revision: 7, hash_sha256: 'abcdef1234567890' },
  buses: [],
  branches: [],
  transformers: [
    {
      ref_id: 'TR-1',
      name: 'TR 110/15',
      hv_bus_ref: 'B1',
      lv_bus_ref: 'B2',
      sn_mva: 16,
      uhv_kv: 110,
      ulv_kv: 15,
      uk_percent: 10,
      pk_kw: 80,
      tap_changer: {
        regulation_type: 'OLTC',
        regulated_winding: 'HV',
        neutral_position: 0,
        current_position: -1,
        min_position: -9,
        max_position: 9,
        step_percent: 1.25,
        control_mode: 'AUTOMATIC',
        voltage_setpoint_kv: 15.2,
        deadband_kv: 0.2,
      },
    },
  ],
  sources: [],
  loads: [],
  generators: [],
  substations: [],
  bays: [],
  junctions: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
} as never;

function mockFetchPrzebiegu(wynik: PowerFlowResultV1, slad: PowerFlowTrace | null) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/power-flow-runs/run-lf-1') {
      return { ok: true, status: 200, json: async () => HEADER } as Response;
    }
    if (url === '/api/power-flow-runs/run-lf-1/results') {
      return { ok: true, status: 200, json: async () => wynik } as Response;
    }
    if (url === '/api/power-flow-runs/run-lf-1/trace') {
      if (!slad) {
        return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => slad } as Response;
    }
    throw new Error(`Niespodziewane wywołanie fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function ustawKompletnyKontekst() {
  useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
  useExecutionRunsStore.setState({ runs: [RUN_LF, RUN_SC] });
  useSnapshotStore.setState({ snapshot: SNAPSHOT_Z_TRANSFORMATOREM });
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  usePowerFlowResultsStore.getState().reset();
  useSnapshotStore.setState({ snapshot: null });
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EkranZbieznosci — realna ścieżka wejścia (karta huba → zakładka warsztatu Wyników)', () => {
  // INTENCJA bez zmian (karta huba prowadzi do realnego dostawcy); kanon K3-A3:
  // dostawcą E-30 jest zakładka „zbieznosc" warsztatu Wyników (deep-link
  // setWynikiTab, wzorzec E-33/E-34), nie powierzchnia trasowa mostu.
  it('klik „Otwórz" na karcie zbieżności prowadzi do zakładki „zbieznosc" (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<EkranAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-zbieznosc');
    await user.click(within(karta).getByRole('button', { name: 'Otwórz' }));
    expect(useShellStore.getState().wynikiTab).toBe('zbieznosc');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });
});

describe('EkranZbieznosci — rama prowadząca i uczciwe stany zerowe', () => {
  it('nagłówek: eyebrow obszaru, tytuł i zdanie celu inżynierskiego', () => {
    render(<EkranZbieznosci />);
    expect(screen.getByText(T.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: T.tytul })).toBeInTheDocument();
    expect(screen.getByText(T.cel)).toBeInTheDocument();
  });

  it('bez aktywnego projektu: stan zerowy z akcją do przestrzeni Projekt', async () => {
    const user = userEvent.setup();
    render(<EkranZbieznosci />);
    expect(screen.getByTestId('mvd-zbieznosc-brak-projektu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-zbieznosc-werdykt')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-zbieznosc-brak-projektu-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('projekt bez zakończonego rozpływu (jest tylko zwarcie): akcja do Obliczeń', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    useExecutionRunsStore.setState({ runs: [RUN_SC] });
    render(<EkranZbieznosci />);
    expect(screen.getByTestId('mvd-zbieznosc-brak-przebiegu')).toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-zbieznosc-brak-przebiegu-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });
});

describe('EkranZbieznosci — werdykt, założenia, bilans i zaczepy z realnych kontraktów', () => {
  it('przebieg zbieżny: werdykt + metoda z śladu + bilans + tabela OLTC + założenia modelu', async () => {
    ustawKompletnyKontekst();
    mockFetchPrzebiegu(wynikFixture(), sladFixture());
    render(<EkranZbieznosci />);

    // Werdykt zbieżności z liczbą iteracji (kontrakt wyniku).
    const werdykt = await screen.findByTestId('mvd-zbieznosc-werdykt');
    expect(werdykt.getAttribute('data-werdykt')).toBe('zbiezny');
    expect(within(werdykt).getByText(T.werdyktZbiezny)).toBeInTheDocument();
    expect(within(werdykt).getByText(T.werdyktZbieznyOpis(4))).toBeInTheDocument();

    // Założenia: metoda z śladu (token newton-raphson → PL), tolerancja, baza, szyna.
    expect(screen.getByText('Newtona–Raphsona (NR)')).toBeInTheDocument();
    expect(screen.getByText('BUS-GPZ')).toBeInTheDocument();

    // Bilans przebiegu z summary kontraktu.
    const bilans = screen.getByTestId('mvd-zbieznosc-bilans');
    expect(within(bilans).getByText(T.bilansStratyP)).toBeInTheDocument();
    expect(within(bilans).getByText(/0,1234/)).toBeInTheDocument();

    // Tabela OLTC ze śladu pętli regulacji (pozycja końcowa, przełączenia).
    const oltc = await screen.findByTestId('mvd-zbieznosc-oltc-tabela');
    expect(within(oltc).getByText('uuid-tr-1')).toBeInTheDocument();
    expect(within(oltc).getByText('-2')).toBeInTheDocument();
    expect(within(oltc).getByText('2')).toBeInTheDocument();

    // Założenia zaczepów modelu ze snapshotu ENM.
    const model = screen.getByTestId('mvd-zbieznosc-model-tabela');
    expect(within(model).getByText('TR 110/15')).toBeInTheDocument();
    expect(within(model).getByText(T.regulacjaOltc)).toBeInTheDocument();
    expect(within(model).getByText('-1')).toBeInTheDocument();
  });

  it('przebieg NIEZBIEŻNY: uczciwy werdykt z instrukcją i akcją do Obliczeń', async () => {
    const user = userEvent.setup();
    ustawKompletnyKontekst();
    mockFetchPrzebiegu(
      wynikFixture({ converged: false, iterations_count: 50 }),
      sladFixture({ converged: false }),
    );
    render(<EkranZbieznosci />);

    const werdykt = await screen.findByTestId('mvd-zbieznosc-werdykt');
    expect(werdykt.getAttribute('data-werdykt')).toBe('niezbiezny');
    expect(within(werdykt).getByText(T.werdyktNiezbiezny)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-zbieznosc-instrukcja')).toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-zbieznosc-napraw-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('ślad bez oltc_control: uczciwa informacja o stałych zaczepach (bez tabeli)', async () => {
    ustawKompletnyKontekst();
    const slad = sladFixture();
    delete (slad as { oltc_control?: unknown }).oltc_control;
    mockFetchPrzebiegu(wynikFixture(), slad);
    render(<EkranZbieznosci />);

    expect(await screen.findByTestId('mvd-zbieznosc-oltc-brak')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-zbieznosc-oltc-tabela')).not.toBeInTheDocument();
  });

  it('ślad iteracji renderuje się NA ŻĄDANIE (klik natywny przełącznika)', async () => {
    const user = userEvent.setup();
    ustawKompletnyKontekst();
    mockFetchPrzebiegu(wynikFixture(), sladFixture());
    render(<EkranZbieznosci />);

    await screen.findByTestId('mvd-zbieznosc-werdykt');
    expect(screen.queryByTestId('mvd-zbieznosc-slad-tabela')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-zbieznosc-slad-przelacznik'));
    const tabela = await screen.findByTestId('mvd-zbieznosc-slad-tabela');
    // Wiersze 1:1 z trace.iterations (norma w notacji wykładniczej, przecinek PL).
    expect(within(tabela).getByText('5,000e-1')).toBeInTheDocument();
  });

  it('następny krok: akcje prowadzą do zakładek warsztatu wyników (rozpływ / badania OLTC)', async () => {
    const user = userEvent.setup();
    ustawKompletnyKontekst();
    mockFetchPrzebiegu(wynikFixture(), sladFixture());
    render(<EkranZbieznosci />);
    await screen.findByTestId('mvd-zbieznosc-werdykt');

    await user.click(screen.getByTestId('mvd-zbieznosc-otworz-rozplyw'));
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useShellStore.getState().wynikiTab).toBe('rozplyw');

    await user.click(screen.getByTestId('mvd-zbieznosc-otworz-oltc'));
    expect(useShellStore.getState().wynikiTab).toBe('regulacja-oltc');
  });

  it('powrót do huba czyści powierzchnię trasową (klik natywny)', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-30');
    render(<EkranZbieznosci />);
    await user.click(screen.getByTestId('mvd-zbieznosc-powrot'));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });
});

describe('EkranZbieznosci — rozpływ liczony per wyspa (CV-4.3 K3b)', () => {
  const sladDwochWysp = (): PowerFlowTrace =>
    sladFixture({
      slack_bus_id: 'BUS-GPZ',
      wyspy: [
        {
          slack_bus_id: 'BUS-GPZ',
          zrodlo_ref: 'src',
          pq_bus_ids: ['BUS-A1', 'BUS-A2', 'BUS-A3'],
          pv_bus_ids: [],
          init_state: {},
          iterations: [{ k: 1, norm_mismatch: 0.4, max_mismatch_pu: 0.1, slack_bus_id: 'BUS-GPZ' }],
          converged: true,
          final_iterations_count: 3,
        },
        {
          slack_bus_id: 'BUS-GPZ2',
          zrodlo_ref: 'src2',
          pq_bus_ids: ['BUS-B1'],
          pv_bus_ids: ['BUS-B2'],
          init_state: {},
          iterations: [{ k: 1, norm_mismatch: 0.2, max_mismatch_pu: 0.05, slack_bus_id: 'BUS-GPZ2' }],
          converged: false,
          final_iterations_count: 50,
        },
      ],
    });

  it('ślad z dwiema wyspami: tabela wysp (szyna, źródło, szyny PQ/PV, iteracje, zbieżność) i obie szyny bilansujące w założeniach', async () => {
    ustawKompletnyKontekst();
    mockFetchPrzebiegu(wynikFixture(), sladDwochWysp());
    render(<EkranZbieznosci />);
    const tabela = await screen.findByTestId('mvd-zbieznosc-wyspy-tabela');
    expect(tabela.querySelectorAll('tbody tr')).toHaveLength(2);
    const pierwsza = screen.getByTestId('mvd-zbieznosc-wyspa-BUS-GPZ');
    expect(pierwsza.textContent).toContain('src');
    expect(pierwsza.textContent).toContain('3');
    expect(pierwsza.textContent).toContain(T.wyspyZbiezna);
    const druga = screen.getByTestId('mvd-zbieznosc-wyspa-BUS-GPZ2');
    expect(druga.textContent).toContain('src2');
    expect(druga.textContent).toContain(T.wyspyNiezbiezna);
    expect(screen.getByText(T.wyspyOpis)).toBeInTheDocument();
    expect(screen.getByText('BUS-GPZ, BUS-GPZ2')).toBeInTheDocument();
  });

  it('ślad z jedną wyspą (bez `wyspy`): sekcja wysp nie istnieje, założenia z jedną szyną', async () => {
    ustawKompletnyKontekst();
    mockFetchPrzebiegu(wynikFixture(), sladFixture());
    render(<EkranZbieznosci />);
    await screen.findByTestId('mvd-zbieznosc-oltc-tabela');
    expect(screen.queryByTestId('mvd-zbieznosc-wyspy-tabela')).toBeNull();
    expect(screen.queryByText(T.wyspyOpis)).toBeNull();
  });

  it('naWierszeWysp: pusta lista bez śladu albo z jedną wyspą; wiersze per wyspa z liczbami z kontraktu', () => {
    expect(naWierszeWysp(null)).toEqual([]);
    expect(naWierszeWysp(sladFixture())).toEqual([]);
    const wiersze = naWierszeWysp(sladDwochWysp());
    expect(wiersze).toEqual([
      { szynaBilansujaca: 'BUS-GPZ', zrodloRef: 'src', liczbaSzynPq: 3, liczbaSzynPv: 0, iteracje: 3, zbiezna: true },
      { szynaBilansujaca: 'BUS-GPZ2', zrodloRef: 'src2', liczbaSzynPq: 1, liczbaSzynPv: 1, iteracje: 50, zbiezna: false },
    ]);
    const zalozenia = naZalozeniaZbieznosci(wynikFixture(), sladDwochWysp());
    const szyna = zalozenia.find((z) => z.etykieta === T.zalSzynaBilansujaca)!;
    expect(szyna.wartosc).toBe('BUS-GPZ, BUS-GPZ2');
    expect(szyna.uwaga).toBe(T.zalSzynyBilansujaceUwaga);
    expect(naZalozeniaZbieznosci(wynikFixture(), sladFixture()).find((z) => z.etykieta === T.zalSzynaBilansujaca)!.wartosc).toBe('BUS-GPZ');
  });
});

describe('zbieznoscModel — czyste projekcje kontraktów', () => {
  it('wybierzPrzebiegRozplywu preferuje aktywny zakończony rozpływ, inaczej najnowszy', () => {
    const starszy: ExecutionRun = { ...RUN_LF, id: 'run-lf-0', finished_at: '2026-07-19T10:00:00Z' };
    expect(wybierzPrzebiegRozplywu([RUN_SC], null)).toBeNull();
    expect(wybierzPrzebiegRozplywu([starszy, RUN_LF], null)?.id).toBe('run-lf-1');
    expect(wybierzPrzebiegRozplywu([starszy, RUN_LF], 'run-lf-0')?.id).toBe('run-lf-0');
    // Aktywny przebieg innego rodzaju nie przechwytuje wyboru.
    expect(wybierzPrzebiegRozplywu([starszy, RUN_LF], 'run-sc-1')?.id).toBe('run-lf-1');
  });

  it('naWierszeOltcPrzebiegu: uczciwa kreska, gdy final_positions nie niesie regulatora', () => {
    const slad = sladFixture();
    const oltc = {
      ...slad.oltc_control!,
      final_positions: {},
      switch_counts: {},
    };
    const wiersze = naWierszeOltcPrzebiegu(oltc);
    expect(wiersze[0].pozycjaKoncowa).toBe(T.kreska);
    expect(wiersze[0].przelaczenia).toBe(0);
  });

  it('naWierszZaczepowModelu: transformator bez przełącznika zaczepów → kreski', () => {
    const wiersz = naWierszZaczepowModelu({
      ref_id: 'TR-2',
      name: 'TR bez regulacji',
      hv_bus_ref: 'B1',
      lv_bus_ref: 'B2',
      sn_mva: 1,
      uhv_kv: 15,
      ulv_kv: 0.4,
      uk_percent: 6,
      pk_kw: 10,
    } as never);
    expect(wiersz.regulacja).toBe(T.kreska);
    expect(wiersz.pozycja).toBe(T.kreska);
    expect(wiersz.zakres).toBe(T.kreska);
  });
});

describe('EkranZbieznosci — wskazanie transformatora (F-K4, znalezisko Z4)', () => {
  it('klik w tabeli zaczepów prowadzi do TRANSFORMATORA w modelu (akcja inspekcyjna)', async () => {
    const user = userEvent.setup();
    ustawKompletnyKontekst();
    mockFetchPrzebiegu(wynikFixture(), sladFixture());
    useSelectionStore.setState({ selectedElement: null, sldCenterOnElement: null } as never);
    render(<EkranZbieznosci />);

    const model = await screen.findByTestId('mvd-zbieznosc-model-tabela');
    const przycisk = within(model).getAllByTestId('mvd-zbieznosc-popraw')[0];
    expect(przycisk).toHaveTextContent('Pokaż na schemacie');
    await user.click(przycisk);

    expect(useSelectionStore.getState().selectedElement?.type).toBe('TransformerBranch');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });
});
