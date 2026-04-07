/**
 * Results Workspace Page Tests â€” PR-22
 *
 * INVARIANTS VERIFIED:
 * - Component renders without errors
 * - Empty state shows correct message
 * - Mode switching updates panel visibility
 * - Polish labels displayed
 * - No codenames in output
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultsWorkspacePage } from '../ResultsWorkspacePage';
import { useResultsWorkspaceStore } from '../store';
import { useAppStateStore } from '../../app-state/store';
import { useResultsInspectorStore } from '../../results-inspector/store';
import { useSnapshotStore } from '../../topology/snapshotStore';

const inspectorMocks = vi.hoisted(() => ({
  selectRun: vi.fn(),
  loadBusResults: vi.fn(),
  loadBranchResults: vi.fn(),
  loadShortCircuitResults: vi.fn(),
  loadExtendedTrace: vi.fn(),
  loadRunSnapshot: vi.fn(),
  setSldOverlay: vi.fn(),
  selectComparison: vi.fn(),
}));

function buildDefaultResultsInspectorState() {
  return {
    selectedRunId: null,
    resultsIndex: null,
    busResults: null,
    branchResults: null,
    shortCircuitResults: null,
    extendedTrace: null,
    runSnapshot: null,
    isLoadingBuses: false,
    isLoadingBranches: false,
    isLoadingShortCircuit: false,
    isLoadingTrace: false,
    isLoadingIndex: false,
    isLoadingRunSnapshot: false,
    error: null,
    selectRun: inspectorMocks.selectRun,
    loadBusResults: inspectorMocks.loadBusResults,
    loadBranchResults: inspectorMocks.loadBranchResults,
    loadShortCircuitResults: inspectorMocks.loadShortCircuitResults,
    loadExtendedTrace: inspectorMocks.loadExtendedTrace,
    loadRunSnapshot: inspectorMocks.loadRunSnapshot,
    setSldOverlay: inspectorMocks.setSldOverlay,
  };
}

// Mock API to prevent real network calls
vi.mock('../api', () => ({
  fetchWorkspaceProjection: vi.fn().mockResolvedValue({
    study_case_id: 'case-1',
    runs: [],
    batches: [],
    comparisons: [],
    latest_done_run_id: null,
    deterministic_hash: 'a'.repeat(64),
    content_hash: 'a'.repeat(64),
    source_run_ids: [],
    source_batch_ids: [],
    source_comparison_ids: [],
    metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:00:00Z' },
  }),
}));

// Mock results inspector store
vi.mock('../../results-inspector/store', () => ({
  useResultsInspectorStore: vi.fn((selector) =>
    selector(buildDefaultResultsInspectorState())
  ),
}));

// Mock comparison store
vi.mock('../../comparisons/store', () => ({
  useComparisonStore: vi.fn((selector) =>
    selector({
      selectedComparison: null,
      selectComparison: inspectorMocks.selectComparison,
    })
  ),
}));

// Mock overlay stores
vi.mock('../../sld-overlay/overlayStore', () => ({
  useOverlayStore: vi.fn((selector) =>
    selector({
      activeRunId: null,
      overlay: null,
      enabled: true,
      toggleOverlay: vi.fn(),
    })
  ),
}));

vi.mock('../../sld-overlay/sldDeltaOverlayStore', () => ({
  useSldDeltaOverlayStore: vi.fn((selector) =>
    selector({
      activeComparisonId: null,
      deltaPayload: null,
      enabled: false,
      isLoading: false,
      error: null,
    })
  ),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  window.location.hash = '#results';
  inspectorMocks.selectRun.mockReset();
  inspectorMocks.loadBusResults.mockReset();
  inspectorMocks.loadBranchResults.mockReset();
  inspectorMocks.loadShortCircuitResults.mockReset();
  inspectorMocks.loadExtendedTrace.mockReset();
  inspectorMocks.loadRunSnapshot.mockReset();
  inspectorMocks.setSldOverlay.mockReset();
  inspectorMocks.selectComparison.mockReset();
  vi.mocked(useResultsInspectorStore).mockImplementation((selector) =>
    selector(buildDefaultResultsInspectorState())
  );

  // Reset workspace store
  useResultsWorkspaceStore.setState({
    studyCaseId: null,
    projection: null,
    mode: 'RUN',
    selectedRunId: null,
    selectedBatchId: null,
    selectedComparisonId: null,
    overlayMode: 'result',
    snapshotViewMode: 'RUN_SNAPSHOT',
    filter: 'ALL',
    isLoading: false,
    error: null,
  });

  // Reset app state
  useAppStateStore.setState({
    activeProjectId: null,
    activeProjectName: null,
    activeCaseId: null,
    activeCaseName: null,
    activeCaseKind: null,
    activeCaseResultStatus: 'NONE',
    activeMode: 'RESULT_VIEW',
    activeRunId: null,
    activeSnapshotId: null,
    activeAnalysisType: null,
    caseManagerOpen: false,
    issuePanelOpen: false,
  });

  useSnapshotStore.setState({ snapshot: null });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultsWorkspacePage', () => {
  it('renders empty state when no active case', () => {
    render(<ResultsWorkspacePage />);
    expect(screen.getByTestId('workspace-no-case')).toBeTruthy();
    expect(
      screen.getByText(/Wybierz aktywny przypadek obliczeniowy/i)
    ).toBeTruthy();
  });

  it('renders workspace layout when case is active', () => {
    useAppStateStore.setState({
      activeCaseId: 'case-123',
      activeCaseName: 'Przypadek testowy',
    });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      projection: {
        study_case_id: 'case-123',
        runs: [],
        batches: [],
        comparisons: [],
        latest_done_run_id: null,
        deterministic_hash: 'a'.repeat(64),
    content_hash: 'a'.repeat(64),
    source_run_ids: [],
    source_batch_ids: [],
    source_comparison_ids: [],
    metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:00:00Z' },
      },
    });

    render(<ResultsWorkspacePage />);
    expect(screen.getByTestId('results-workspace')).toBeTruthy();
    expect(screen.getByTestId('workspace-header')).toBeTruthy();
    expect(screen.getByTestId('workspace-sidebar')).toBeTruthy();
    expect(screen.getByTestId('sld-overlay-panel')).toBeTruthy();
  });

  it('shows RUN view by default', () => {
    useAppStateStore.setState({ activeCaseId: 'case-123' });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      mode: 'RUN',
      projection: {
        study_case_id: 'case-123',
        runs: [],
        batches: [],
        comparisons: [],
        latest_done_run_id: null,
        deterministic_hash: 'b'.repeat(64),
        content_hash: 'b'.repeat(64),
        source_run_ids: [],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:00:00Z' },
      },
    });

    render(<ResultsWorkspacePage />);
    expect(screen.getByTestId('run-view-empty')).toBeTruthy();
  });

  it('shows error banner when error present', () => {
    useAppStateStore.setState({ activeCaseId: 'case-123' });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      error: 'Test error message',
      projection: {
        study_case_id: 'case-123',
        runs: [],
        batches: [],
        comparisons: [],
        latest_done_run_id: null,
        deterministic_hash: 'c'.repeat(64),
        content_hash: 'c'.repeat(64),
        source_run_ids: [],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:00:00Z' },
      },
    });

    render(<ResultsWorkspacePage />);
    expect(screen.getByTestId('workspace-error')).toBeTruthy();
    expect(screen.getByText('Test error message')).toBeTruthy();
  });

  it('shows polling banner for an active run in progress', () => {
    window.location.hash = '#results?mode=run&run=run-1';
    useAppStateStore.setState({ activeCaseId: 'case-123' });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      selectedRunId: 'run-1',
      projection: {
        study_case_id: 'case-123',
        runs: [
          {
            run_id: 'run-1',
            analysis_type: 'SC_3F',
            status: 'RUNNING',
            solver_input_hash: 'abc123',
            created_at: '2025-01-15T10:00:00Z',
            finished_at: null,
            error_message: null,
          },
        ],
        batches: [],
        comparisons: [],
        latest_done_run_id: null,
        deterministic_hash: 'f'.repeat(64),
        content_hash: 'f'.repeat(64),
        source_run_ids: ['run-1'],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:00:00Z' },
      },
    });

    render(<ResultsWorkspacePage />);
    expect(screen.getByTestId('workspace-run-polling-banner')).toBeTruthy();
    expect(screen.getByText(/odswieza sie automatycznie co 3 sekundy/i)).toBeTruthy();
    expect(inspectorMocks.selectRun).toHaveBeenCalledWith('run-1');
  });

  it('loads canonical result tables for a finished run', () => {
    window.location.hash = '#results?mode=run&run=run-2';
    useAppStateStore.setState({ activeCaseId: 'case-123' });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      selectedRunId: 'run-2',
      projection: {
        study_case_id: 'case-123',
        runs: [
          {
            run_id: 'run-2',
            analysis_type: 'SC_3F',
            status: 'DONE',
            solver_input_hash: 'def456',
            created_at: '2025-01-15T10:00:00Z',
            finished_at: '2025-01-15T10:01:30Z',
            error_message: null,
          },
        ],
        batches: [],
        comparisons: [],
        latest_done_run_id: 'run-2',
        deterministic_hash: 'g'.repeat(64),
        content_hash: 'g'.repeat(64),
        source_run_ids: ['run-2'],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:01:30Z' },
      },
    });

    vi.mocked(useResultsInspectorStore).mockImplementation((selector) =>
      selector({
        selectedRunId: 'run-2',
        resultsIndex: {
          run_header: {
            run_id: 'run-2',
            project_id: 'proj-1',
            case_id: 'case-123',
            snapshot_id: 'snap-1',
            created_at: '2025-01-15T10:00:00Z',
            status: 'DONE',
            result_state: 'FRESH',
            solver_kind: 'short_circuit_sn',
            input_hash: 'hash',
          },
          tables: [
            { table_id: 'buses', label_pl: 'Szyny', row_count: 1, columns: [] },
            { table_id: 'branches', label_pl: 'Gałęzie', row_count: 1, columns: [] },
            { table_id: 'short-circuit', label_pl: 'Zwarcia', row_count: 1, columns: [] },
          ],
        },
        busResults: null,
        branchResults: null,
        shortCircuitResults: null,
        extendedTrace: null,
        runSnapshot: null,
        isLoadingBuses: false,
        isLoadingBranches: false,
        isLoadingShortCircuit: false,
        isLoadingTrace: false,
        isLoadingIndex: false,
        isLoadingRunSnapshot: false,
        error: null,
        selectRun: inspectorMocks.selectRun,
        loadBusResults: inspectorMocks.loadBusResults,
        loadBranchResults: inspectorMocks.loadBranchResults,
        loadShortCircuitResults: inspectorMocks.loadShortCircuitResults,
        loadExtendedTrace: inspectorMocks.loadExtendedTrace,
        loadRunSnapshot: inspectorMocks.loadRunSnapshot,
        setSldOverlay: inspectorMocks.setSldOverlay,
      })
    );

    render(<ResultsWorkspacePage />);

    expect(inspectorMocks.loadBusResults).toHaveBeenCalled();
    expect(inspectorMocks.loadBranchResults).toHaveBeenCalled();
    expect(inspectorMocks.loadShortCircuitResults).toHaveBeenCalled();
    expect(inspectorMocks.loadExtendedTrace).toHaveBeenCalled();
    expect(inspectorMocks.loadRunSnapshot).toHaveBeenCalled();
  });

  it('pins active snapshot to the run snapshot when workspace is in run-snapshot mode', () => {
    window.location.hash = '#results?mode=run&run=run-2&context=run';
    useAppStateStore.setState({ activeCaseId: 'case-123' });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      selectedRunId: 'run-2',
      snapshotViewMode: 'RUN_SNAPSHOT',
      projection: {
        study_case_id: 'case-123',
        runs: [
          {
            run_id: 'run-2',
            analysis_type: 'SC_3F',
            status: 'DONE',
            solver_input_hash: 'def456',
            created_at: '2025-01-15T10:00:00Z',
            finished_at: '2025-01-15T10:01:30Z',
            error_message: null,
          },
        ],
        batches: [],
        comparisons: [],
        latest_done_run_id: 'run-2',
        deterministic_hash: 'h'.repeat(64),
        content_hash: 'h'.repeat(64),
        source_run_ids: ['run-2'],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:01:30Z' },
      },
    });

    vi.mocked(useResultsInspectorStore).mockImplementation((selector) =>
      selector({
        ...buildDefaultResultsInspectorState(),
        selectedRunId: 'run-2',
        resultsIndex: {
          run_header: {
            run_id: 'run-2',
            project_id: 'proj-1',
            case_id: 'case-123',
            snapshot_id: 'snap-run-2',
            created_at: '2025-01-15T10:00:00Z',
            status: 'DONE',
            result_state: 'FRESH',
            solver_kind: 'short_circuit_sn',
            input_hash: 'hash',
          },
          tables: [],
        },
      })
    );

    render(<ResultsWorkspacePage />);

    expect(useAppStateStore.getState().activeSnapshotId).toBe('snap-run-2');
  });

  it('switches active snapshot to the current model when workspace is in current-model mode', () => {
    window.location.hash = '#results?mode=run&run=run-2&context=current';
    useAppStateStore.setState({ activeCaseId: 'case-123' });
    useSnapshotStore.setState({
      snapshot: {
        header: { hash_sha256: 'snap-current-2' },
        buses: [],
        branches: [],
        transformers: [],
        sources: [],
        loads: [],
        generators: [],
      } as never,
    });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      selectedRunId: 'run-2',
      snapshotViewMode: 'CURRENT_MODEL',
      projection: {
        study_case_id: 'case-123',
        runs: [
          {
            run_id: 'run-2',
            analysis_type: 'SC_3F',
            status: 'DONE',
            solver_input_hash: 'def456',
            created_at: '2025-01-15T10:00:00Z',
            finished_at: '2025-01-15T10:01:30Z',
            error_message: null,
          },
        ],
        batches: [],
        comparisons: [],
        latest_done_run_id: 'run-2',
        deterministic_hash: 'i'.repeat(64),
        content_hash: 'i'.repeat(64),
        source_run_ids: ['run-2'],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:01:30Z' },
      },
    });

    vi.mocked(useResultsInspectorStore).mockImplementation((selector) =>
      selector({
        ...buildDefaultResultsInspectorState(),
        selectedRunId: 'run-2',
        resultsIndex: {
          run_header: {
            run_id: 'run-2',
            project_id: 'proj-1',
            case_id: 'case-123',
            snapshot_id: 'snap-run-2',
            created_at: '2025-01-15T10:00:00Z',
            status: 'DONE',
            result_state: 'FRESH',
            solver_kind: 'short_circuit_sn',
            input_hash: 'hash',
          },
          tables: [],
        },
      })
    );

    render(<ResultsWorkspacePage />);

    expect(useAppStateStore.getState().activeSnapshotId).toBe('snap-current-2');
  });

  it('nie zawiera nazw kodowych projektu', () => {
    useAppStateStore.setState({ activeCaseId: 'case-123' });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      projection: {
        study_case_id: 'case-123',
        runs: [],
        batches: [],
        comparisons: [],
        latest_done_run_id: null,
        deterministic_hash: 'd'.repeat(64),
        content_hash: 'd'.repeat(64),
        source_run_ids: [],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:00:00Z' },
      },
    });

    const { container } = render(<ResultsWorkspacePage />);
    const html = container.innerHTML;

    // Verify no project codenames appear in rendered HTML
    expect(html).not.toMatch(/\bP\d{1,3}\b/);
  });

  it('shows Polish labels for mode buttons', () => {
    useAppStateStore.setState({ activeCaseId: 'case-123' });
    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-123',
      projection: {
        study_case_id: 'case-123',
        runs: [],
        batches: [],
        comparisons: [],
        latest_done_run_id: null,
        deterministic_hash: 'e'.repeat(64),
        content_hash: 'e'.repeat(64),
        source_run_ids: [],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:00:00Z' },
      },
    });

    render(<ResultsWorkspacePage />);
    expect(screen.getByText(/Wyniki oblicz/i)).toBeTruthy();
    expect(screen.getByText(/Obliczenia wsadowe/i)).toBeTruthy();
    expect(screen.getByText(/Por.*wnanie wynik/i)).toBeTruthy();
  });
});
