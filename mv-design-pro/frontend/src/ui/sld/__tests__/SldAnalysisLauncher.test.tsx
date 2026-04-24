import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SldAnalysisLauncher,
  resolveAnalysisLauncherBlockMessage,
} from '../SldAnalysisLauncher';
import { useSnapshotStore } from '../../topology/snapshotStore';

const {
  analysisEligibilityState,
  appState,
  resultsInspectorState,
  executionRunsState,
  studyCasesState,
  sldModeState,
  notifyMock,
} = vi.hoisted(() => ({
  analysisEligibilityState: {
    data: null as null | {
      case_id: string;
      matrix: unknown[];
      overall: { eligible_all: boolean; eligible_any: boolean; blockers_total: number };
    },
    loading: false,
    error: null as string | null,
    load: vi.fn(async () => {}),
    clear: vi.fn(),
  },
  appState: {
    setActiveMode: vi.fn(),
    setActiveAnalysisType: vi.fn(),
    setActiveCaseResultStatus: vi.fn(),
  },
  resultsInspectorState: {
    hydrateResultsView: vi.fn(),
    toggleOverlay: vi.fn(),
  },
  executionRunsState: {
    runs: [] as Array<{ id: string; status: string; analysis_type: string }>,
    isLoadingRuns: false,
    runError: null as string | null,
    activeStudyCaseId: 'case-1',
    setActiveStudyCaseId: vi.fn(),
    setActiveRun: vi.fn(),
    loadRuns: vi.fn(async () => {}),
    createAndExecuteRun: vi.fn(),
    pollRunStatus: vi.fn(),
  },
  studyCasesState: {
    projectId: 'project-1',
    activeCase: null as null | { id: string; config: Record<string, unknown> },
    loadActiveCase: vi.fn(async () => {}),
    loadCases: vi.fn(async () => {}),
  },
  sldModeState: {
    setMode: vi.fn(),
  },
  notifyMock: vi.fn(),
}));

vi.mock('../../analysis-eligibility/AnalysisEligibilityPanel', () => ({
  AnalysisEligibilityPanel: () => <div data-testid="analysis-eligibility-panel-stub" />,
}));

vi.mock('../../analysis-eligibility/store', () => ({
  useAnalysisEligibilityStore: Object.assign(
    (selector: (state: typeof analysisEligibilityState) => unknown) => selector(analysisEligibilityState),
    {
      getState: () => analysisEligibilityState,
    },
  ),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../comparison/api', () => ({
  compareRuns: vi.fn(),
}));

vi.mock('../../results-inspector/store', () => ({
  useResultsInspectorStore: (selector: (state: typeof resultsInspectorState) => unknown) =>
    selector(resultsInspectorState),
}));

vi.mock('../../results-inspector/api', () => ({
  fetchBranchResults: vi.fn(),
  fetchBusResults: vi.fn(),
  fetchExtendedTrace: vi.fn(),
  fetchResultsIndex: vi.fn(),
  fetchSldOverlay: vi.fn(),
  fetchRunSnapshot: vi.fn(),
  fetchShortCircuitResults: vi.fn(),
}));

vi.mock('../../notifications/store', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

vi.mock('../sldModeStore', () => ({
  useSldModeStore: (selector: (state: typeof sldModeState) => unknown) => selector(sldModeState),
}));

vi.mock('../../study-cases/RunHistoryPanel', () => ({
  RunHistoryPanel: () => <div data-testid="run-history-panel-stub" />,
}));

vi.mock('../../study-cases/runStore', () => ({
  useExecutionRunsStore: (selector: (state: typeof executionRunsState) => unknown) =>
    selector(executionRunsState),
}));

vi.mock('../../study-cases/store', () => ({
  useStudyCasesStore: (selector: (state: typeof studyCasesState) => unknown) => selector(studyCasesState),
}));

describe('SldAnalysisLauncher', () => {
  beforeEach(() => {
    analysisEligibilityState.data = null;
    analysisEligibilityState.loading = false;
    analysisEligibilityState.error = null;
    analysisEligibilityState.load.mockClear();
    analysisEligibilityState.clear.mockClear();
    executionRunsState.runs = [];
    executionRunsState.isLoadingRuns = false;
    executionRunsState.runError = null;
    executionRunsState.activeStudyCaseId = 'case-1';
    executionRunsState.setActiveStudyCaseId.mockClear();
    executionRunsState.setActiveRun.mockClear();
    executionRunsState.loadRuns.mockClear();
    executionRunsState.createAndExecuteRun.mockClear();
    executionRunsState.pollRunStatus.mockClear();
    studyCasesState.activeCase = null;
    studyCasesState.loadActiveCase.mockClear();
    studyCasesState.loadCases.mockClear();
    appState.setActiveMode.mockClear();
    appState.setActiveAnalysisType.mockClear();
    appState.setActiveCaseResultStatus.mockClear();
    resultsInspectorState.hydrateResultsView.mockClear();
    resultsInspectorState.toggleOverlay.mockClear();
    sldModeState.setMode.mockClear();
    notifyMock.mockClear();
    useSnapshotStore.setState({
      snapshot: null,
      logicalViews: null,
      fixActions: [],
      materializedParams: null,
    } as never);
  });

  it('zwraca kanoniczny komunikat blokady dla źródła i pustego modelu', () => {
    expect(
      resolveAnalysisLauncherBlockMessage({
        reason: 'NO_SOURCE',
        title: 'Brak źródła zasilania',
        description: 'Brak GPZ.',
        nextStep: 'Dodaj GPZ.',
      }),
    ).toBe(
      'Brak źródła zasilania. Najpierw dodaj GPZ, a potem wyprowadź pierwszy odcinek magistrali.',
    );
    expect(
      resolveAnalysisLauncherBlockMessage({
        reason: 'NO_MODEL',
        title: 'Pusty schemat jednokreskowy',
        description: 'Brak elementów.',
        nextStep: 'Wstaw pierwszy odcinek.',
      }),
    ).toBe('Brak modelu na schemacie. Najpierw zbuduj sieć.');
    expect(resolveAnalysisLauncherBlockMessage(null)).toBeNull();
  });

  it('blokuje szybkie i pełne obliczenie, gdy w stanie modelu brakuje źródła', async () => {
    const user = userEvent.setup();
    useSnapshotStore.setState({
      snapshot: {
        sources: [],
        substations: [],
        transformers: [],
        generators: [],
        buses: [],
        branches: [],
      } as never,
      logicalViews: {
        trunks: [],
        terminals: [],
        branches: [],
      } as never,
    } as never);

    render(
      <SldAnalysisLauncher
        isOpen
        caseId="case-1"
        caseName="Wariant 1"
        projectName="Projekt 1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('analysis-launcher-blocked')).toBeInTheDocument();
    expect(screen.getByText('Brak źródła zasilania')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Wykonaj szybkie obliczenie' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Pełna analiza' }));

    expect(screen.getByRole('button', { name: 'Wykonaj pełną analizę' })).toBeDisabled();
    expect(analysisEligibilityState.load).not.toHaveBeenCalled();
  });

  it('nie przecieka technicznym stanem NO_SNAPSHOT i pokazuje blokadę operacyjną', () => {
    render(
      <SldAnalysisLauncher
        isOpen
        caseId="case-1"
        caseName="Wariant 1"
        projectName="Projekt 1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('analysis-launcher-blocked')).toBeInTheDocument();
    expect(screen.getByText('Brak źródła zasilania')).toBeInTheDocument();
    expect(screen.queryByText('Brak aktywnej migawki')).toBeNull();
  });

  it('czyści i ukrywa starą macierz eligibility, gdy warsztat wraca w blokadę', async () => {
    const user = userEvent.setup();
    analysisEligibilityState.data = {
      case_id: 'case-1',
      matrix: [
        { analysis_type: 'SC_3F', status: 'ELIGIBLE', blockers: [] },
      ],
      overall: { eligible_all: true, eligible_any: true, blockers_total: 0 },
    };
    useSnapshotStore.setState({
      snapshot: {
        sources: [],
        substations: [],
        transformers: [],
        generators: [],
        buses: [],
        branches: [],
      } as never,
      logicalViews: {
        trunks: [],
        terminals: [],
        branches: [],
      } as never,
    } as never);

    render(
      <SldAnalysisLauncher
        isOpen
        caseId="case-1"
        caseName="Wariant 1"
        projectName="Projekt 1"
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Pełna analiza' }));

    expect(analysisEligibilityState.clear).toHaveBeenCalled();
    expect(screen.queryByTestId('analysis-eligibility-panel-stub')).toBeNull();
    expect(screen.getByTestId('analysis-launcher-blocked')).toBeInTheDocument();
  });

  it('odblokowuje szybkie obliczenie, gdy stan modelu ma źródło i topologię', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'source-1', name: 'GPZ 1' }],
        substations: [{ id: 'st-1', name: 'Stacja 1' }],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1', name: 'Szyna 1' }],
        branches: [{ ref_id: 'line-1', type: 'cable' }],
      } as never,
      logicalViews: {
        trunks: [{ corridor_ref: 'trunk-1', segments: ['line-1'] }],
        terminals: [],
        branches: [],
      } as never,
    } as never);

    render(
      <SldAnalysisLauncher
        isOpen
        caseId="case-1"
        caseName="Wariant 1"
        projectName="Projekt 1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('analysis-launcher-blocked')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Wykonaj szybkie obliczenie' }),
    ).toBeEnabled();
  });
});
