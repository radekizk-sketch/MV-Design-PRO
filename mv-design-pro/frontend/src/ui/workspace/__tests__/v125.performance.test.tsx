import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../app-state/store';
import { useReadinessLiveStore } from '../../engineering-readiness/readinessLiveStore';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { SLDViewCanvas } from '../../sld/SLDViewCanvas';
import { buildReferenceScenario } from '../../sld/core/referenceTopologies';
import type { ViewportState } from '../../sld/types';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import { getScreenDefinition, type CanonicalScreenCode } from '../screenCanonRegistry';
import type { WorkspaceSurfaceCode } from '../types';

const fetchMock = vi.fn();

const mockAnalysisRunDetail = {
  id: 'run-v125',
  analysis_type: 'PF',
  status: 'FINISHED',
  result_status: 'VALID',
  results_valid: true,
  created_at: '2026-04-20T08:00:00Z',
  finished_at: '2026-04-20T08:05:00Z',
  input_hash: 'hash-v125',
  summary_json: {
    converged: true,
    iterations: 4,
    summary: {
      total_losses_p_mw: 0.75,
    },
  },
  trace_summary: {
    count: 3,
    first_step: 'prepare_input',
    last_step: 'finalize',
    phases: ['prepare', 'solve', 'finalize'],
    duration_ms: 24,
    warnings: [],
  },
  analysis_case_context: {
    case_ref: 'case-v125',
    case_kind: 'ROZPLYW_MAX_OBC',
    snapshot_ref: 'snapshot-v125',
    variant_ref: 'variant-v125',
    run_ref: 'run-v125',
    proof_pack_ref: 'proof-pack-v125',
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
      project_ref: 'project-v125',
      run_ref: 'run-v125',
      analysis_type: 'PF',
      snapshot_ref: 'snapshot-v125',
    },
    reproducibility: {
      solver_family: 'NR',
      solver_version: '1.0.0',
      method_version: '2026.04',
      formula_set_version: '2026.04',
      standard_basis_ref: ['IEC-60909'],
      input_hash: 'hash-v125',
      result_hash: 'result-hash-v125',
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

fetchMock.mockImplementation(() => mockJsonResponse(mockAnalysisRunDetail));
vi.stubGlobal('fetch', fetchMock);

vi.mock('../../study-cases/RunHistoryPanel', () => ({
  RunHistoryPanel: () => <div data-testid="perf-run-history">Run history</div>,
}));

vi.mock('../../results-inspector', () => ({
  ResultsInspectorPage: ({ forcedTab }: { forcedTab?: string }) => (
    <div data-testid="perf-results-inspector">{forcedTab ?? 'RESULTS'}</div>
  ),
}));

vi.mock('../../power-flow-results', () => ({
  PowerFlowResultsInspectorPage: () => <div data-testid="perf-power-flow-results">PF</div>,
}));

vi.mock('../../protection-results', () => ({
  ProtectionResultsInspectorPage: () => <div data-testid="perf-protection-results">PROT</div>,
}));

vi.mock('../../comparison/ResultsComparisonPage', () => ({
  ResultsComparisonPage: () => <div data-testid="perf-results-comparison">CMP</div>,
}));

type PerfProfile = 'quick' | 'full';

interface PerfProfileConfig {
  readonly warmups: number;
  readonly samples: number;
}

interface PerfTargetResult {
  readonly targetId: string;
  readonly label: string;
  readonly measurementKind: 'mount' | 'pipeline+mount';
  readonly sampleMs: number[];
  readonly meanMs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
}

interface PerfHarnessReport {
  readonly profile: PerfProfile;
  readonly warmups: number;
  readonly samples: number;
  readonly measuredAt: string;
  readonly targets: PerfTargetResult[];
}

const PERF_PROFILE: PerfProfile = process.env.V125_PERF_PROFILE === 'quick' ? 'quick' : 'full';
const PERF_PROFILE_CONFIG: Record<PerfProfile, PerfProfileConfig> = {
  quick: { warmups: 1, samples: 3 },
  full: { warmups: 2, samples: 7 },
};
const PERF_OUTPUT_PATH = process.env.V125_PERF_OUTPUT ?? '';
const PERF_RESULTS: PerfTargetResult[] = [];

const VIEWPORT: ViewportState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

function roundMs(value: number): number {
  return Number(value.toFixed(2));
}

function percentile(samples: readonly number[], ratio: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function summarizeSamples(
  targetId: string,
  label: string,
  measurementKind: 'mount' | 'pipeline+mount',
  sampleMs: number[],
): PerfTargetResult {
  const total = sampleMs.reduce((acc, value) => acc + value, 0);
  return {
    targetId,
    label,
    measurementKind,
    sampleMs: sampleMs.map(roundMs),
    meanMs: roundMs(total / sampleMs.length),
    medianMs: roundMs(percentile(sampleMs, 0.5)),
    p95Ms: roundMs(percentile(sampleMs, 0.95)),
    minMs: roundMs(Math.min(...sampleMs)),
    maxMs: roundMs(Math.max(...sampleMs)),
  };
}

function resetSurfaceStores() {
  cleanup();
  useNetworkBuildStore.getState().reset();
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.getState().reset();
  useReadinessLiveStore.getState().clear();
}

function seedResultsContext() {
  useAppStateStore.getState().setActiveProject('project-v125', 'Projekt V12.5');
  useAppStateStore.getState().setActiveCase('case-v125', 'Wariant A', 'PowerFlowCase', 'FRESH');
  useAppStateStore.getState().setActiveMode('RESULT_VIEW');
  useAppStateStore.getState().setActiveSnapshot('snapshot-v125');
  useAppStateStore.getState().setActiveRun('run-v125');
  useExecutionRunsStore.setState({
    runs: [
      {
        id: 'run-v125',
        study_case_id: 'case-v125',
        analysis_type: 'LOAD_FLOW',
        solver_input_hash: 'hash-v125',
        status: 'DONE',
        started_at: '2026-04-20T08:00:00Z',
        finished_at: '2026-04-20T08:00:10Z',
        error_message: null,
      },
    ],
  });
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
}

async function measureTarget(
  targetId: string,
  label: string,
  measurementKind: 'mount' | 'pipeline+mount',
  renderScenario: () => () => void,
) {
  const config = PERF_PROFILE_CONFIG[PERF_PROFILE];
  const sampleMs: number[] = [];

  for (let index = 0; index < config.warmups; index += 1) {
    resetSurfaceStores();
    const assertMounted = renderScenario();
    assertMounted();
    cleanup();
  }

  for (let index = 0; index < config.samples; index += 1) {
    resetSurfaceStores();
    const start = performance.now();
    const assertMounted = renderScenario();
    const elapsed = performance.now() - start;
    assertMounted();
    sampleMs.push(elapsed);
    cleanup();
  }

  const summary = summarizeSamples(targetId, label, measurementKind, sampleMs);
  PERF_RESULTS.push(summary);
  console.info(
    `[v125-perf] ${targetId} mean=${summary.meanMs.toFixed(2)}ms median=${summary.medianMs.toFixed(2)}ms p95=${summary.p95Ms.toFixed(2)}ms`,
  );
  expect(summary.sampleMs).toHaveLength(config.samples);
}

function renderSurfaceTarget(
  screenCode: WorkspaceSurfaceCode,
  region: 'main' | 'panel',
  expectedHeading?: string,
): () => void {
  seedResultsContext();
  const heading = expectedHeading ?? getScreenDefinition(screenCode as CanonicalScreenCode).labelFull;
  useNetworkBuildStore.getState().openRouteSurface(screenCode, {
    openMode: region === 'main' ? 'expand_workspace' : 'replace_right_panel',
  });
  render(<WorkspaceSurfaceRouter region={region} />);
  return () => {
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
  };
}

function renderMiniSldTarget(): () => void {
  seedResultsContext();
  useNetworkBuildStore.getState().openRouteSurface('variants_runs');
  render(<WorkspaceSurfaceRouter region="main" />);
  return () => {
    expect(screen.getByRole('heading', { level: 2, name: 'Przebiegi obliczen' })).toBeInTheDocument();
    expect(screen.getByTestId('workspace-mini-sld')).toBeInTheDocument();
  };
}

function renderFullSldTarget(): () => void {
  const scenario = buildReferenceScenario('terrain');
  render(
    <SLDViewCanvas
      symbols={scenario.symbols}
      connections={scenario.connections as any}
      canonicalAnnotations={scenario.canonicalAnnotations ?? undefined}
      selectedId={null}
      onSymbolClick={() => {}}
      viewport={VIEWPORT}
      showGrid
      width={1600}
      height={900}
    />,
  );
  return () => {
    expect(screen.getByTestId('sld-view-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('sld-empty-state')).not.toBeInTheDocument();
  };
}

afterAll(() => {
  if (!PERF_OUTPUT_PATH) {
    return;
  }

  const config = PERF_PROFILE_CONFIG[PERF_PROFILE];
  const report: PerfHarnessReport = {
    profile: PERF_PROFILE,
    warmups: config.warmups,
    samples: config.samples,
    measuredAt: new Date().toISOString(),
    targets: PERF_RESULTS,
  };

  mkdirSync(dirname(PERF_OUTPUT_PATH), { recursive: true });
  writeFileSync(PERF_OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');
});

describe('V12.5 performance harness', () => {
  it('measures mini-SLD helper surface mount', async () => {
    await measureTarget(
      'mini-sld',
      'Mini-SLD helper surface',
      'mount',
      renderMiniSldTarget,
    );
  });

  it('measures full SLD pipeline and canvas mount', async () => {
    await measureTarget(
      'full-sld',
      'Full SLD terrain pipeline + canvas',
      'pipeline+mount',
      renderFullSldTarget,
    );
  });

  it('measures E-06 analysis surface mount', async () => {
    await measureTarget(
      'E-06',
      'Nakładki wynikowe SLD',
      'mount',
      () => renderSurfaceTarget('E-06', 'main'),
    );
  });

  it('measures E-37 report surface mount', async () => {
    await measureTarget(
      'E-37',
      'Raporty OSD i audytowe',
      'mount',
      () => renderSurfaceTarget('E-37', 'main'),
    );
  });

  it('measures E-28 protection coordination surface mount', async () => {
    await measureTarget(
      'E-28',
      'Koordynacja zabezpieczeń',
      'mount',
      () => renderSurfaceTarget('E-28', 'main'),
    );
  });

  it('measures E-29 symmetrical components surface mount', async () => {
    await measureTarget(
      'E-29',
      'Sieć zerowa i składowe symetryczne',
      'mount',
      () => renderSurfaceTarget('E-29', 'main'),
    );
  });

  it('measures E-30 load-flow surface mount', async () => {
    await measureTarget(
      'E-30',
      'Rozpływ mocy',
      'mount',
      () => renderSurfaceTarget('E-30', 'main'),
    );
  });

  it('measures E-33 source contributions surface mount', async () => {
    await measureTarget(
      'E-33',
      'Wkłady źródeł',
      'mount',
      () => renderSurfaceTarget('E-33', 'main'),
    );
  });

  it('measures E-34 thermal dynamic surface mount', async () => {
    await measureTarget(
      'E-34',
      'Weryfikacja cieplna i dynamiczna',
      'mount',
      () => renderSurfaceTarget('E-34', 'panel'),
    );
  });
});
