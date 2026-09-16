/**
 * SekcjaPorownaniaMetod — walidacja krzyżowa metod rozpływu NR↔FD (karta
 * W3-G1). Testy sprawdzają REALNĄ ścieżkę: odkrycie najnowszego biegu NR i
 * FD przypadku (przez ślad, nie przez zgadywanie), poczwórny stan zerowy
 * (brak rozpływu / brak FD / brak NR / błąd) i renderowanie tabeli delty
 * per szyna z DANYCH backendu (tor P20c, reużyty — zero nowej fizyki).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SekcjaPorownaniaMetod } from '../SekcjaPorownaniaMetod';
import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { CreateRunRequest, ExecutionRun } from '../../../../ui/study-cases/types';
import { fetchPowerFlowTrace } from '../../../../ui/power-flow-results/api';
import type { PowerFlowTrace } from '../../../../ui/power-flow-results/types';
import { createPowerFlowComparison } from '../../../../ui/power-flow-comparison/api';
import type { PowerFlowComparisonResult } from '../../../../ui/power-flow-comparison/types';

vi.mock('../../../../ui/power-flow-results/api', () => ({
  fetchPowerFlowTrace: vi.fn(),
}));
vi.mock('../../../../ui/power-flow-comparison/api', () => ({
  createPowerFlowComparison: vi.fn(),
}));

const mockedTrace = vi.mocked(fetchPowerFlowTrace);
const mockedComparison = vi.mocked(createPowerFlowComparison);

const CASE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function bieg(id: string, finished_at: string): ExecutionRun {
  return {
    id,
    study_case_id: CASE_ID,
    analysis_type: 'LOAD_FLOW',
    solver_input_hash: 'hash',
    status: 'DONE',
    started_at: finished_at,
    finished_at,
    error_message: null,
  };
}

function slad(metoda: string, over: Partial<PowerFlowTrace> = {}): PowerFlowTrace {
  return {
    solver_version: `load-flow-${metoda}-v1`,
    solver_method: metoda,
    input_hash: 'h',
    snapshot_id: 's',
    case_id: CASE_ID,
    run_id: 'r',
    init_state: {},
    init_method: 'flat_start',
    tolerance: 1e-6,
    max_iterations: 30,
    base_mva: 10,
    slack_bus_id: 'A',
    pq_bus_ids: ['B'],
    pv_bus_ids: [],
    iterations: [],
    converged: true,
    final_iterations_count: metoda === 'newton-raphson' ? 4 : 62,
    ...over,
  };
}

function porownanie(over: Partial<PowerFlowComparisonResult> = {}): PowerFlowComparisonResult {
  return {
    comparison_id: 'nr-1::fd-1',
    run_a_id: 'nr-1',
    run_b_id: 'fd-1',
    project_id: 'projekt-1',
    bus_diffs: [
      {
        bus_id: 'B',
        v_pu_a: 1.0,
        v_pu_b: 0.998,
        angle_deg_a: -1.2,
        angle_deg_b: -1.25,
        p_injected_mw_a: 0,
        p_injected_mw_b: 0,
        q_injected_mvar_a: 0,
        q_injected_mvar_b: 0,
        delta_v_pu: -0.002,
        delta_angle_deg: -0.05,
        delta_p_mw: 0,
        delta_q_mvar: 0,
      },
    ],
    branch_diffs: [],
    ranking: [],
    summary: {
      total_buses: 1,
      total_branches: 0,
      converged_a: true,
      converged_b: true,
      total_losses_p_mw_a: 0.01,
      total_losses_p_mw_b: 0.011,
      delta_total_losses_p_mw: 0.001,
      max_delta_v_pu: -0.002,
      max_delta_angle_deg: -0.05,
      total_issues: 0,
      critical_issues: 0,
      major_issues: 0,
      moderate_issues: 0,
      minor_issues: 0,
    },
    input_hash: 'cmp-hash',
    provenance_a: {
      run_id: 'nr-1',
      analysis_type: 'PF',
      status: 'FINISHED',
      snapshot_hash: 'sh-a',
      input_hash: 'ih-a',
      finished_at: '2026-09-10T10:00:05Z',
      envelope: null,
    },
    provenance_b: {
      run_id: 'fd-1',
      analysis_type: 'PF',
      status: 'FINISHED',
      snapshot_hash: 'sh-b',
      input_hash: 'ih-b',
      finished_at: '2026-09-10T11:00:05Z',
      envelope: null,
    },
    created_at: '2026-09-10T12:00:00Z',
    ...over,
  };
}

let createAndExecuteRun: Mock<[caseId: string, request: CreateRunRequest], Promise<ExecutionRun>>;

beforeEach(() => {
  mockedTrace.mockReset();
  mockedComparison.mockReset();
  createAndExecuteRun = vi.fn(async (_caseId: string, _request: CreateRunRequest) =>
    bieg('nowy-bieg', '2026-09-10T13:00:00Z'),
  );
  useAppStateStore.setState({ activeProjectId: 'projekt-1', activeCaseId: CASE_ID });
  useSnapshotStore.setState({ readiness: { ready: true, blockers: [], warnings: [] } } as never);
  useExecutionRunsStore.setState({
    runs: [],
    activeRunId: null,
    runStatus: null,
    createAndExecuteRun,
  } as never);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const T = (id: string) => screen.getByTestId(id);

describe('SekcjaPorownaniaMetod — walidacja krzyżowa NR↔FD', () => {
  it('brak jakiegokolwiek biegu rozpływu: stan zerowy bez zapytania o ślad', () => {
    useExecutionRunsStore.setState({ runs: [] } as never);

    render(<SekcjaPorownaniaMetod trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);

    expect(T('mvd-jakosc-metody-brak')).toBeInTheDocument();
    expect(mockedTrace).not.toHaveBeenCalled();
  });

  it('tylko bieg NR: stan „brak FD", akcja Uruchom FD wysyła solver_method fast-decoupled', async () => {
    useExecutionRunsStore.setState({
      runs: [bieg('nr-1', '2026-09-10T10:00:00Z')],
    } as never);
    mockedTrace.mockResolvedValue(slad('newton-raphson'));

    render(<SekcjaPorownaniaMetod trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);

    await waitFor(() => expect(T('mvd-jakosc-metody-brak-fd')).toBeInTheDocument());
    expect(mockedComparison).not.toHaveBeenCalled();

    await userEvent.click(T('mvd-jakosc-metody-brak-fd-akcja'));

    await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
    expect(createAndExecuteRun).toHaveBeenCalledWith(CASE_ID, {
      analysis_type: 'LOAD_FLOW',
      solver_input: { solver_method: 'fast-decoupled' },
    });
  });

  it('tylko bieg FD: stan „brak NR", akcja Uruchom NR wysyła solver_method newton-raphson', async () => {
    useExecutionRunsStore.setState({
      runs: [bieg('fd-1', '2026-09-10T10:00:00Z')],
    } as never);
    mockedTrace.mockResolvedValue(slad('fast-decoupled'));

    render(<SekcjaPorownaniaMetod trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);

    await waitFor(() => expect(T('mvd-jakosc-metody-brak-nr')).toBeInTheDocument());

    await userEvent.click(T('mvd-jakosc-metody-brak-nr-akcja'));

    await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
    expect(createAndExecuteRun).toHaveBeenCalledWith(CASE_ID, {
      analysis_type: 'LOAD_FLOW',
      solver_input: { solver_method: 'newton-raphson' },
    });
  });

  it('bieg NR i FD obecne: porównanie z backendu (NR jako baseline A, FD jako B), tabela delty per szyna', async () => {
    useExecutionRunsStore.setState({
      runs: [bieg('nr-1', '2026-09-10T10:00:00Z'), bieg('fd-1', '2026-09-10T11:00:00Z')],
    } as never);
    mockedTrace.mockImplementation(async (runId: string) =>
      runId === 'nr-1' ? slad('newton-raphson') : slad('fast-decoupled'),
    );
    mockedComparison.mockResolvedValue(porownanie());

    render(<SekcjaPorownaniaMetod trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);

    await waitFor(() => expect(mockedComparison).toHaveBeenCalledWith('nr-1', 'fd-1'));
    expect(screen.getByTestId('mvd-wyn-tabela')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    // Założenia: metoda A (referencja) i metoda B (walidacja) obie nazwane.
    expect(screen.getByText(/Newtona–Raphsona/)).toBeInTheDocument();
    expect(screen.getByText(/szybka rozprzężona/)).toBeInTheDocument();
  });

  it('odkrycie zatrzymuje się, gdy znajdzie NAJNOWSZY NR i FD — starsze biegi NIE są odpytywane', async () => {
    useExecutionRunsStore.setState({
      runs: [
        bieg('stary-nr', '2026-09-10T08:00:00Z'),
        bieg('nr-1', '2026-09-10T10:00:00Z'),
        bieg('fd-1', '2026-09-10T11:00:00Z'),
      ],
    } as never);
    mockedTrace.mockImplementation(async (runId: string) =>
      runId === 'nr-1' || runId === 'stary-nr' ? slad('newton-raphson') : slad('fast-decoupled'),
    );
    mockedComparison.mockResolvedValue(porownanie());

    render(<SekcjaPorownaniaMetod trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);

    await waitFor(() => expect(mockedComparison).toHaveBeenCalledTimes(1));
    expect(mockedTrace).not.toHaveBeenCalledWith('stary-nr');
  });

  it('błąd porównania: uczciwy stan błędu (nie ukrywa awarii tabelą pustą)', async () => {
    useExecutionRunsStore.setState({
      runs: [bieg('nr-1', '2026-09-10T10:00:00Z'), bieg('fd-1', '2026-09-10T11:00:00Z')],
    } as never);
    mockedTrace.mockImplementation(async (runId: string) =>
      runId === 'nr-1' ? slad('newton-raphson') : slad('fast-decoupled'),
    );
    mockedComparison.mockRejectedValue(new Error('backend down'));

    render(<SekcjaPorownaniaMetod trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);

    await waitFor(() => expect(T('mvd-jakosc-metody-blad')).toBeInTheDocument());
  });
});
