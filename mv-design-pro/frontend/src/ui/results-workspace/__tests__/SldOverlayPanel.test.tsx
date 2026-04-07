import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SldOverlayPanel } from '../SldOverlayPanel';
import { useResultsWorkspaceStore } from '../store';
import { useResultsInspectorStore } from '../../results-inspector/store';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useAppStateStore } from '../../app-state/store';
import { ROUTES } from '../../navigation';
import type { EnergyNetworkModel } from '../../../types/enm';

const navigationMocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
}));

vi.mock('../../navigation', async () => {
  const actual = await vi.importActual<typeof import('../../navigation')>('../../navigation');
  return {
    ...actual,
    navigateTo: (...args: unknown[]) => navigationMocks.navigateTo(...args),
  };
});

function makeSnapshot(hash: string): EnergyNetworkModel {
  return {
    header: {
      name: 'Siec testowa SN',
      enm_version: '1.0',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
      created_at: '2025-01-15T10:00:00Z',
      updated_at: '2025-01-15T10:00:00Z',
      revision: 1,
      hash_sha256: hash,
    },
    buses: [
      {
        id: 'bus-main-id',
        ref_id: 'bus-main',
        name: 'Szyna glowna',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
      {
        id: 'bus-load-id',
        ref_id: 'bus-load',
        name: 'Szyna stacji',
        tags: [],
        meta: {},
        voltage_kv: 15,
        phase_system: '3ph',
      },
    ],
    branches: [
      {
        id: 'branch-main-id',
        ref_id: 'branch-main',
        name: 'Kabel magistrali',
        tags: [],
        meta: {},
        type: 'cable',
        from_bus_ref: 'bus-main',
        to_bus_ref: 'bus-load',
        status: 'closed',
      },
    ],
    transformers: [],
    sources: [
      {
        id: 'source-grid-id',
        ref_id: 'src-grid',
        name: 'Zasilanie GPZ',
        tags: [],
        meta: {},
        bus_ref: 'bus-main',
        model: 'short_circuit_power',
        sk3_mva: 250,
        rx_ratio: 0.1,
      },
    ],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    branch_points: [],
  } as unknown as EnergyNetworkModel;
}

beforeEach(() => {
  navigationMocks.navigateTo.mockReset();
  window.history.replaceState(null, '', '/#results');

  useResultsWorkspaceStore.getState().reset();
  useResultsWorkspaceStore.setState({
    studyCaseId: 'case-1',
    projection: {
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
      metadata: {
        projection_version: '1.0.0',
        created_utc: '2025-01-15T10:00:00Z',
      },
    },
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

  useResultsInspectorStore.getState().reset();
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
    activeProjectId: 'project-1',
    activeProjectName: 'Projekt SN',
    activeCaseId: 'case-1',
    activeCaseName: 'Przypadek 1',
    activeCaseKind: 'ShortCircuitCase',
    activeCaseResultStatus: 'FRESH',
    activeSnapshotId: null,
    activeMode: 'RESULT_VIEW',
    activeRunId: null,
    activeAnalysisType: 'SHORT_CIRCUIT',
    caseManagerOpen: false,
    issuePanelOpen: false,
  });
});

function seedSelectedRunState() {
  const runSnapshot = makeSnapshot('snap-run-1234567890abcdef');
  const currentSnapshot = makeSnapshot('snap-current-abcdef1234567890');

  useResultsWorkspaceStore.setState({
    selectedRunId: 'run-1',
    projection: {
      study_case_id: 'case-1',
      runs: [
        {
          run_id: 'run-1',
          analysis_type: 'SC_3F',
          status: 'DONE',
          solver_input_hash: 'hash-run-1',
          created_at: '2025-01-15T10:00:00Z',
          finished_at: '2025-01-15T10:02:00Z',
          error_message: null,
        },
      ],
      batches: [],
      comparisons: [],
      latest_done_run_id: 'run-1',
      deterministic_hash: 'b'.repeat(64),
      content_hash: 'b'.repeat(64),
      source_run_ids: ['run-1'],
      source_batch_ids: [],
      source_comparison_ids: [],
      metadata: {
        projection_version: '1.0.0',
        created_utc: '2025-01-15T10:02:00Z',
      },
    },
  });

  useResultsInspectorStore.setState({
    selectedRunId: 'run-1',
    resultsIndex: {
      run_header: {
        run_id: 'run-1',
        project_id: 'project-1',
        case_id: 'case-1',
        snapshot_id: runSnapshot.header.hash_sha256,
        created_at: '2025-01-15T10:00:00Z',
        status: 'DONE',
        result_state: 'FRESH',
        solver_kind: 'short_circuit_sn',
        input_hash: 'hash-run-1',
      },
      tables: [
        { table_id: 'buses', label_pl: 'Szyny', row_count: 2, columns: [] },
        { table_id: 'branches', label_pl: 'Galezie', row_count: 1, columns: [] },
        { table_id: 'short-circuit', label_pl: 'Zwarcia', row_count: 1, columns: [] },
      ],
    },
    busResults: {
      run_id: 'run-1',
      rows: [
        {
          bus_id: 'bus-main',
          name: 'Szyna glowna',
          un_kv: 15,
          u_kv: 15.1,
          u_pu: 1.006,
          angle_deg: 0,
          flags: [],
        },
        {
          bus_id: 'bus-load',
          name: 'Szyna stacji',
          un_kv: 15,
          u_kv: 14.7,
          u_pu: 0.98,
          angle_deg: -1.2,
          flags: [],
        },
      ],
    },
    branchResults: {
      run_id: 'run-1',
      rows: [
        {
          branch_id: 'branch-main',
          name: 'Kabel magistrali',
          from_bus: 'bus-main',
          to_bus: 'bus-load',
          i_a: 145,
          s_mva: 3.4,
          p_mw: 2.1,
          q_mvar: 0.8,
          loading_pct: 87,
          flags: [],
        },
      ],
    },
    shortCircuitResults: {
      run_id: 'run-1',
      rows: [
        {
          target_id: 'bus-load',
          target_name: 'Szyna stacji',
          ikss_ka: 8.4,
          ip_ka: 20.1,
          ith_ka: 8.4,
          sk_mva: 218,
          fault_type: 'SC_3F',
          flags: [],
        },
      ],
    },
    extendedTrace: null,
    runSnapshot,
    sldOverlay: null,
    overlayVisible: true,
    activeTab: 'SHORT_CIRCUIT',
    searchQuery: '',
    isLoadingIndex: false,
    isLoadingBuses: false,
    isLoadingBranches: false,
    isLoadingShortCircuit: false,
    isLoadingTrace: false,
    isLoadingRunSnapshot: false,
    isLoadingOverlay: false,
    error: null,
  });

  useSnapshotStore.setState({ snapshot: currentSnapshot });
}

describe('SldOverlayPanel', () => {
  it('renders canonical selectors and empty state when no run is selected', () => {
    render(<SldOverlayPanel />);

    expect(screen.getByTestId('sld-overlay-panel')).toBeTruthy();
    expect(screen.getByTestId('overlay-mode-result')).toBeTruthy();
    expect(screen.getByTestId('snapshot-view-run_snapshot')).toBeDisabled();
    expect(screen.getByTestId('snapshot-view-current_model')).toBeTruthy();
    expect(screen.getByTestId('embedded-sld-empty')).toBeTruthy();
    expect(screen.getByText('Brak wybranego uruchomienia')).toBeTruthy();
  });

  it('renders embedded canonical SLD with result overlay and legend for the selected run snapshot', async () => {
    seedSelectedRunState();

    render(<SldOverlayPanel />);

    expect(screen.getByTestId('sld-viewer-area')).toBeTruthy();

    await waitFor(() => {
      expect(useResultsInspectorStore.getState().sldOverlay).not.toBeNull();
    });

    expect(screen.queryByTestId('embedded-sld-empty')).toBeNull();
    expect(screen.getByTestId('sld-results-overlay')).toBeTruthy();
    expect(screen.getByTestId('sld-legend-panel')).toBeTruthy();
    expect(screen.getByText('Legenda')).toBeTruthy();
    expect(screen.getAllByText('Migawka uruchomienia').length).toBeGreaterThan(0);
  });

  it('shows snapshot drift and allows switching to the current model context', async () => {
    seedSelectedRunState();

    render(<SldOverlayPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('snapshot-drift-banner')).toBeTruthy();
    });
    expect(screen.getByText(/Nadal ogladasz oryginalna migawke runu/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId('snapshot-view-current_model'));

    expect(useResultsWorkspaceStore.getState().snapshotViewMode).toBe('CURRENT_MODEL');
    expect(screen.getByText(/Ogladasz biezacy model, ale wynik i White Box/i)).toBeTruthy();
  });

  it('navigates to model, white box and results actions from the operator panel', () => {
    seedSelectedRunState();

    render(<SldOverlayPanel />);

    fireEvent.click(screen.getByTestId('overlay-open-model'));
    fireEvent.click(screen.getByTestId('overlay-open-proof'));
    fireEvent.click(screen.getByTestId('overlay-open-results'));

    expect(navigationMocks.navigateTo).toHaveBeenNthCalledWith(1, ROUTES.SLD);
    expect(navigationMocks.navigateTo).toHaveBeenNthCalledWith(2, ROUTES.PROOF);
    expect(navigationMocks.navigateTo).toHaveBeenNthCalledWith(3, ROUTES.RESULTS);
  });

  it('does not contain English labels or codenames in the rendered HTML', () => {
    seedSelectedRunState();

    const { container } = render(<SldOverlayPanel />);
    const html = container.innerHTML;

    expect(html).not.toContain('>Voltage<');
    expect(html).not.toContain('>Loading<');
    expect(html).not.toContain('>Flow Direction<');
    expect(html).not.toContain('>Legacy<');
    expect(html).not.toMatch(/\bP\d{1,3}\b/);
  });
});
