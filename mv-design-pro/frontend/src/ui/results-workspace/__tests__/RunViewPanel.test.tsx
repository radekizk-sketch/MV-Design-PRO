import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { RunViewPanel } from '../RunViewPanel';
import { useResultsWorkspaceStore } from '../store';
import { useResultsInspectorStore } from '../../results-inspector/store';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useAppStateStore } from '../../app-state/store';

const runViewMocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
}));

vi.mock('../../navigation', async () => {
  const actual = await vi.importActual<typeof import('../../navigation')>('../../navigation');
  return {
    ...actual,
    navigateTo: (...args: unknown[]) => runViewMocks.navigateTo(...args),
  };
});

vi.mock('../../results-inspector/ResultsExport', () => ({
  ResultsExport: () => <div data-testid="results-export-stub">Eksport</div>,
}));

describe('RunViewPanel', () => {
  beforeEach(() => {
    runViewMocks.navigateTo.mockReset();

    useResultsWorkspaceStore.setState({
      studyCaseId: 'case-1',
      projection: {
        study_case_id: 'case-1',
        runs: [
          {
            run_id: 'run-1',
            analysis_type: 'SC_3F',
            status: 'DONE',
            solver_input_hash: 'hash-1',
            created_at: '2025-01-15T10:00:00Z',
            finished_at: '2025-01-15T10:01:00Z',
            error_message: null,
          },
        ],
        batches: [],
        comparisons: [],
        latest_done_run_id: 'run-1',
        deterministic_hash: 'a'.repeat(64),
        content_hash: 'a'.repeat(64),
        source_run_ids: ['run-1'],
        source_batch_ids: [],
        source_comparison_ids: [],
        metadata: { projection_version: '1.0.0', created_utc: '2025-01-15T10:01:00Z' },
      },
      mode: 'RUN',
      selectedRunId: 'run-1',
      selectedBatchId: null,
      selectedComparisonId: null,
      overlayMode: 'result',
      filter: 'ALL',
      isLoading: false,
      error: null,
    });

    useResultsInspectorStore.setState({
      selectedRunId: 'run-1',
      resultsIndex: {
        run_header: {
          run_id: 'run-1',
          project_id: 'proj-1',
          case_id: 'case-1',
          snapshot_id: 'snap-1',
          created_at: '2025-01-15T10:00:00Z',
          status: 'DONE',
          result_state: 'FRESH',
          solver_kind: 'short_circuit_sn',
          input_hash: 'hash-1',
        },
        tables: [
          { table_id: 'buses', label_pl: 'Szyny', row_count: 1, columns: [] },
        ],
      },
      busResults: {
        run_id: 'run-1',
        rows: [
          {
            bus_id: 'bus-1',
            name: 'Szyna główna',
            un_kv: 15,
            u_kv: 14.9,
            u_pu: 0.993,
            angle_deg: 0,
            flags: [],
          },
        ],
      },
      branchResults: null,
      shortCircuitResults: null,
      extendedTrace: null,
      activeTab: 'BUSES',
      overlayVisible: true,
      searchQuery: '',
      isLoadingIndex: false,
      isLoadingBuses: false,
      isLoadingBranches: false,
      isLoadingShortCircuit: false,
      isLoadingTrace: false,
      isLoadingOverlay: false,
      error: null,
    });

    useSelectionStore.setState({
      selectedElements: [],
      selectedElement: null,
      mode: 'RESULT_VIEW',
      resultStatus: 'FRESH',
      propertyGridOpen: false,
      treeExpandedNodes: new Set<string>(),
      sldCenterOnElement: null,
    });

    useSnapshotStore.setState({ snapshot: null });
    useAppStateStore.setState({
      activeProjectName: 'Projekt SN',
      activeCaseName: 'Przypadek 01',
    });
  });

  it('renders action bar with model and white-box actions', () => {
    render(<RunViewPanel />);

    expect(screen.getByTestId('run-action-bar')).toBeTruthy();
    expect(screen.getByTestId('run-open-model')).toBeTruthy();
    expect(screen.getByTestId('run-open-proof')).toBeTruthy();
    expect(screen.getByTestId('results-export-stub')).toBeTruthy();
  });

  it('selects model element after clicking a result row', () => {
    render(<RunViewPanel />);

    fireEvent.click(screen.getByText('Szyna główna'));

    const selection = useSelectionStore.getState().selectedElement;
    expect(selection).toEqual({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna',
    });
    expect(useSelectionStore.getState().sldCenterOnElement).toBe('bus-1');
  });

  it('navigates to white box from the action bar', () => {
    render(<RunViewPanel />);

    fireEvent.click(screen.getByTestId('run-open-proof'));

    expect(runViewMocks.navigateTo).toHaveBeenCalled();
  });

  it('shows empty-state message when the run finished but no result rows are available', () => {
    useResultsInspectorStore.setState({
      busResults: { run_id: 'run-1', rows: [] },
      branchResults: { run_id: 'run-1', rows: [] },
      shortCircuitResults: { run_id: 'run-1', rows: [] },
      isLoadingBuses: false,
      isLoadingBranches: false,
      isLoadingShortCircuit: false,
    });

    render(<RunViewPanel />);

    expect(screen.getByText('Brak danych wynikowych dla tego obliczenia')).toBeTruthy();
  });
});
