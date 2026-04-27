import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../app-state/store';
import { useReadinessLiveStore } from '../../engineering-readiness/readinessLiveStore';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { WorkspaceOperationalBar } from '../WorkspaceOperationalBar';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  SCREEN_MATRIX,
  SURFACE_REGISTRY,
} from '../types';

const fetchMock = vi.fn();

const mockAnalysisRunDetail = {
  id: 'run-1',
  analysis_type: 'PF',
  status: 'FINISHED',
  result_status: 'VALID',
  results_valid: true,
  created_at: '2026-04-20T08:00:00Z',
  finished_at: '2026-04-20T08:05:00Z',
  input_hash: 'hash-1',
  proof_pack_ref: 'proof-pack-1',
  export_artifact: {
    export_ref: 'export-1',
    export_kind: 'json',
    analysis_case_ref: 'case-1',
    proof_pack_ref: 'proof-pack-1',
    result_hash: 'result-hash-1',
    input_hash: 'hash-1',
    generated_at: '2026-04-20T08:05:00Z',
    generated_by_version: 'v12_5_export_artifact/1.0',
    completeness_status: 'complete',
  },
  export_policy: {
    export_kind: 'json',
    allows_partial: true,
    requires_confirmation: false,
    carries_analysis_case_context: true,
    carries_proof_pack_ref: true,
    carries_result_hash: true,
    carries_input_hash: true,
    carries_generated_at: true,
    carries_generated_by_version: true,
    null_rendering: 'null',
    not_applicable_rendering: 'label',
    partial_rendering: 'status_field',
  },
  summary_json: {
    converged: true,
    iterations: 5,
    summary: {
      total_losses_p_mw: 1.25,
    },
  },
  trace_summary: {
    count: 3,
    first_step: 'prepare_input',
    last_step: 'finalize',
    phases: ['prepare', 'solve', 'finalize'],
    duration_ms: 42,
    warnings: [],
  },
  analysis_case_context: {
    case_ref: 'case-1',
    case_kind: 'ROZPLYW_MAX_OBC',
    snapshot_ref: 'snapshot-001',
    variant_ref: 'variant-a',
    run_ref: 'run-1',
    proof_pack_ref: 'proof-pack-1',
    quality_gate: 'G4',
    applicability_scope: ['PF', 'REPORT'],
    completeness: 'complete',
    completeness_legacy: 'complete',
    missing_prerequisites: [],
    assumptions: {
      source_assumptions_ref: 'pf_source_nominal',
      load_assumptions_ref: 'pf_load_max',
      switching_state_ref: 'snapshot_switching_state',
      grounding_assumptions_ref: 'network_grounding_snapshot',
      temperature_assumptions_ref: 'temperature_operating',
      transformer_tap_assumptions_ref: 'oltc_active',
      ibg_assumptions_ref: 'ibg_model_snapshot',
    },
    lineage: {
      project_ref: 'project-1',
      run_ref: 'run-1',
      analysis_type: 'PF',
      snapshot_ref: 'snapshot-001',
    },
    reproducibility: {
      solver_family: 'NR',
      solver_version: '1.0.0',
      method_version: '2026.04',
      formula_set_version: '2026.04',
      standard_basis_ref: ['IEC-60909'],
      input_hash: 'hash-1',
      result_hash: 'result-hash-1',
      domain_model_version: 'dm-1',
      bay_contract_version: 'bay-1',
      results_contract_version: 'results-1',
      proof_renderer_version: 'proof-1',
      catalog_snapshot_ref: 'catalog-1',
      catalog_schema_version: 'schema-1',
      tolerance_policy_ref: 'tol-1',
      rounding_policy_ref: 'round-1',
      quality_gate_policy_version: 'gate-1',
    },
  },
};

function mockJsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    statusText: 'OK',
    json: async () => payload,
  });
}

vi.stubGlobal('fetch', fetchMock);

vi.mock('../../study-cases/RunHistoryPanel', () => ({
  RunHistoryPanel: ({ onSelectRun }: { onSelectRun?: (runId: string) => void }) => (
    <button type="button" data-testid="run-history-panel" onClick={() => onSelectRun?.('run-1')}>
      Run history
    </button>
  ),
}));

vi.mock('../../results-inspector', () => ({
  ResultsInspectorPage: ({ forcedTab }: { forcedTab?: string }) => (
    <div data-testid="results-inspector-page">{forcedTab ?? 'RESULTS'}</div>
  ),
}));

vi.mock('../../power-flow-results', () => ({
  PowerFlowResultsInspectorPage: () => <div data-testid="power-flow-results-page">PF</div>,
}));

vi.mock('../../protection-results', () => ({
  ProtectionResultsInspectorPage: () => <div data-testid="protection-results-page">PROT</div>,
}));

vi.mock('../../comparison/ResultsComparisonPage', () => ({
  ResultsComparisonPage: () => <div data-testid="results-comparison-page">CMP</div>,
}));

describe('workspace shell V12.5 surfaces', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => mockJsonResponse(mockAnalysisRunDetail));
    useNetworkBuildStore.getState().reset();
    useAppStateStore.getState().reset();
    useExecutionRunsStore.getState().reset();
    useSnapshotStore.getState().reset();
    useReadinessLiveStore.getState().clear();
  });

  it('renderuje przemyslowy surface E-30 w glownym shellu', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-30', {
      subjectKind: 'analysis_case',
      subjectRef: 'case-1',
      openMode: 'expand_workspace',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(
      screen.getByRole('heading', { level: 2, name: SURFACE_REGISTRY['E-30'].titlePl }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('workspace-mini-sld')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Zbieznosc rozplywu/i })).toBeInTheDocument();
    expect(screen.queryByText(/^E-\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Powierzchnia pomocnicza/i)).not.toBeInTheDocument();
  });

  it('renderuje panelowy surface E-31 z analysis_case_context aktywnego runu', async () => {
    useAppStateStore.getState().setActiveRun('run-1');
    useNetworkBuildStore.getState().openRouteSurface('E-31', {
      titlePl: SURFACE_REGISTRY['E-31'].titlePl,
      sizeClass: 'B',
      openMode: 'replace_right_panel',
      supportsMiniSld: false,
      tabId: 'fazy',
      subjectKind: 'analysis_run',
      subjectRef: 'case-1',
    });

    render(<WorkspaceSurfaceRouter region="panel" />);

    expect(screen.getByRole('heading', { level: 2, name: SURFACE_REGISTRY['E-31'].titlePl })).toBeInTheDocument();
    expect(await screen.findByText('pf_source_nominal')).toBeInTheDocument();
    expect(screen.getAllByText('proof-pack-1').length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/Kontrakt przypadku musi wskazywac aktywne zalozenia zrodlowe/i),
    ).not.toBeInTheDocument();
  });

  it('renderuje surface E-37 z kontraktem eksportu dla aktywnego runu', async () => {
    useAppStateStore.getState().setActiveRun('run-1');
    useNetworkBuildStore.getState().openRouteSurface('E-37', {
      titlePl: SURFACE_REGISTRY['E-37'].titlePl,
      sizeClass: 'C',
      supportsMiniSld: true,
      subjectKind: 'report',
      subjectRef: 'run-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByRole('heading', { level: 2, name: SURFACE_REGISTRY['E-37'].titlePl })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: /Kontrakt raportu i eksportu/i })).toBeInTheDocument();
    expect(screen.getAllByText('json').length).toBeGreaterThan(0);
    expect(screen.getByText('status_field')).toBeInTheDocument();
    expect(screen.getAllByText('proof-pack-1').length).toBeGreaterThan(0);
  });

  it('renderuje mini-SLD dla helper surface wariantow', () => {
    useNetworkBuildStore.getState().openRouteSurface('variants_runs');

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Przebiegi obliczen' })).toBeInTheDocument();
    expect(screen.getByTestId('workspace-mini-sld')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Aktywny kontekst wariantu' })).toBeInTheDocument();
    expect(screen.queryByTestId('case-manager')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parametry analizy' })).toBeInTheDocument();
  });

  it('otwiera dedykowany surface E-28 z launchera koordynacji', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Poziom analityczny',
      subjectKind: 'analysis_run',
      subjectRef: 'run-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    await user.click(screen.getByRole('button', { name: 'Koordynacja zabezpieczen' }));

    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-28');
    expect(
      screen.getByRole('heading', { level: 2, name: SURFACE_REGISTRY['E-28'].titlePl }),
    ).toBeInTheDocument();
  });

  it.each([
    ['Koordynacja zabezpieczen', 'E-28'],
    ['Charakterystyki FRT/LVRT/HVRT', 'E-26'],
    ['Rozplyw mocy NR/GS/FD', 'E-30'],
    ['Stan fazowy SN', 'E-31'],
    ['Stabilnosc dynamiczna', 'E-32'],
    ['Wklady zrodel rozszerzone', 'E-33'],
    ['Weryfikacja cieplna i dynamiczna', 'E-34'],
  ] as const)(
    'launcher "%s" otwiera %s z kanonicznym title/class/tab',
    async (label, screenCode) => {
      const user = userEvent.setup();
      useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
        subjectKind: 'analysis_run',
        subjectRef: 'run-1',
      });

      render(<WorkspaceSurfaceRouter region="main" />);

      await user.click(screen.getByRole('button', { name: label }));

      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe(screenCode);
      expect(activeSurface?.titlePl).toBe(SURFACE_REGISTRY[screenCode].titlePl);
      expect(activeSurface?.sizeClass).toBe(SURFACE_REGISTRY[screenCode].sizeClass);
      expect(activeSurface?.tabId).toBe(SCREEN_MATRIX[screenCode].defaultTabId);
    },
  );

  it.each([
    ['Uzasadnienie inzynierskie', 'E-36'],
    ['Wklady zrodel', 'E-33'],
  ] as const)(
    'launcher raportowy "%s" otwiera %s z kanonicznym title/class/tab',
    async (label, screenCode) => {
      const user = userEvent.setup();
      useNetworkBuildStore.getState().openRouteSurface(REPORT_SURFACE_SCREEN_CODE, {
        subjectKind: 'report',
        subjectRef: 'report-1',
      });

      render(<WorkspaceSurfaceRouter region="main" />);

      await user.click(screen.getByRole('button', { name: label }));

      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe(screenCode);
      expect(activeSurface?.titlePl).toBe(SURFACE_REGISTRY[screenCode].titlePl);
      expect(activeSurface?.sizeClass).toBe(SURFACE_REGISTRY[screenCode].sizeClass);
      expect(activeSurface?.tabId).toBe(SCREEN_MATRIX[screenCode].defaultTabId);
    },
  );
});

describe('WorkspaceOperationalBar', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => mockJsonResponse(mockAnalysisRunDetail));
    useNetworkBuildStore.getState().reset();
    useAppStateStore.getState().reset();
    useExecutionRunsStore.getState().reset();
    useSnapshotStore.getState().reset();
    useReadinessLiveStore.getState().clear();
  });

  it('otwiera surface E-39 po kliknieciu segmentu aktywnej migawki', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveCase('case-1', 'Wariant A', 'PowerFlowCase', 'OUTDATED');
    useAppStateStore.getState().setActiveSnapshot('snapshot-001');
    useExecutionRunsStore.setState({
      runs: [
        {
          id: 'run-1',
          study_case_id: 'case-1',
          analysis_type: 'LOAD_FLOW',
          solver_input_hash: 'hash-1',
          status: 'DONE',
          started_at: '2026-04-19T10:00:00Z',
          finished_at: '2026-04-19T10:01:00Z',
          error_message: null,
        },
      ],
    });
    useAppStateStore.getState().setActiveRun('run-1');
    useReadinessLiveStore.setState({
      issues: [],
      status: 'OK',
      ready: true,
      bySeverity: { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
      loading: false,
      error: null,
      lastRevision: 1,
      collapsedGroups: [],
      autoRefreshEnabled: true,
    });

    render(<WorkspaceOperationalBar validationStatus="valid" />);

    await user.click(screen.getByTestId('workspace-operational-snapshot'));

    const activeSurface = useNetworkBuildStore.getState().activeSurface;
    expect(activeSurface?.screenCode).toBe('E-39');
    expect(activeSurface?.titlePl).toBe('Historia i audyt');
  });

  it('nie pokazuje technicznego jezyka runtime w pasku operacyjnym', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-39', {
      titlePl: 'Historia i audyt',
      sizeClass: 'B',
      subjectKind: 'analysis_run',
      subjectRef: 'case-1',
    });

    render(<WorkspaceOperationalBar validationStatus="valid" />);

    expect(screen.getByText(/Aktywny widok:/)).toBeInTheDocument();
    expect(screen.queryByText(/Aktywny surface:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/surface/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Rama aplikacji pozostaje wspolna dla edycji, analityki i raportu/i),
    ).toBeInTheDocument();
  });
});
