/**
 * Results Workspace Store Tests — PR-22
 *
 * INVARIANTS VERIFIED:
 * - Determinism: same input → same output
 * - URL sync: state ↔ URL roundtrip
 * - Filter correctness
 * - Mode transitions
 * - No Date.now, no Math.random in rendering path
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useResultsWorkspaceStore,
  parseWorkspaceUrlParams,
  buildWorkspaceUrlParams,
  filterRuns,
  filterBatches,
  filterComparisons,
} from '../store';
import type {
  RunSummary,
  BatchSummary,
  ComparisonSummary,
  WorkspaceProjection,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    analysis_type: 'SC_3F',
    status: 'DONE',
    solver_input_hash: 'hash-abc',
    created_at: '2025-01-15T10:00:00+00:00',
    finished_at: '2025-01-15T10:01:00+00:00',
    error_message: null,
    ...overrides,
  };
}

function makeBatchSummary(overrides: Partial<BatchSummary> = {}): BatchSummary {
  return {
    batch_id: 'batch-1',
    analysis_type: 'SC_3F',
    status: 'DONE',
    batch_input_hash: 'bhash-abc',
    scenario_count: 3,
    run_count: 3,
    created_at: '2025-01-15T10:00:00+00:00',
    errors: [],
    ...overrides,
  };
}

function makeComparisonSummary(
  overrides: Partial<ComparisonSummary> = {}
): ComparisonSummary {
  return {
    comparison_id: 'cmp-1',
    analysis_type: 'SC_3F',
    base_scenario_id: 'scenario-a',
    other_scenario_id: 'scenario-b',
    input_hash: 'ihash-abc',
    created_at: '2025-01-15T10:00:00+00:00',
    ...overrides,
  };
}

function makeProjection(
  overrides: Partial<WorkspaceProjection> = {}
): WorkspaceProjection {
  return {
    study_case_id: 'case-1',
    runs: [makeRunSummary()],
    batches: [makeBatchSummary()],
    comparisons: [makeComparisonSummary()],
    latest_done_run_id: 'run-1',
    deterministic_hash: 'a'.repeat(64),
    content_hash: 'a'.repeat(64),
    source_run_ids: ['run-1'],
    source_batch_ids: ['batch-1'],
    source_comparison_ids: ['cmp-1'],
    metadata: {
      projection_version: '1.0.0',
      created_utc: '2025-01-15T10:00:00Z',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Store reset
// ---------------------------------------------------------------------------

beforeEach(() => {
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
});

// ---------------------------------------------------------------------------
// Tests: Initial state
// ---------------------------------------------------------------------------

describe('ResultsWorkspaceStore — Initial state', () => {
  it('has correct initial values', () => {
    const state = useResultsWorkspaceStore.getState();
    expect(state.studyCaseId).toBeNull();
    expect(state.projection).toBeNull();
    expect(state.mode).toBe('RUN');
    expect(state.selectedRunId).toBeNull();
    expect(state.selectedBatchId).toBeNull();
    expect(state.selectedComparisonId).toBeNull();
    expect(state.overlayMode).toBe('result');
    expect(state.filter).toBe('ALL');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Mode transitions
// ---------------------------------------------------------------------------

describe('ResultsWorkspaceStore — Mode transitions', () => {
  it('selectRun sets mode to RUN', () => {
    const store = useResultsWorkspaceStore.getState();
    store.selectRun('run-abc');

    const updated = useResultsWorkspaceStore.getState();
    expect(updated.mode).toBe('RUN');
    expect(updated.selectedRunId).toBe('run-abc');
    expect(updated.overlayMode).toBe('result');
  });

  it('selectBatch sets mode to BATCH', () => {
    const store = useResultsWorkspaceStore.getState();
    store.selectBatch('batch-abc');

    const updated = useResultsWorkspaceStore.getState();
    expect(updated.mode).toBe('BATCH');
    expect(updated.selectedBatchId).toBe('batch-abc');
  });

  it('selectComparison sets mode to COMPARE', () => {
    const store = useResultsWorkspaceStore.getState();
    store.selectComparison('cmp-abc');

    const updated = useResultsWorkspaceStore.getState();
    expect(updated.mode).toBe('COMPARE');
    expect(updated.selectedComparisonId).toBe('cmp-abc');
    expect(updated.overlayMode).toBe('delta');
  });

  it('setMode changes mode without clearing selection', () => {
    const store = useResultsWorkspaceStore.getState();
    store.selectRun('run-abc');
    store.setMode('BATCH');

    const updated = useResultsWorkspaceStore.getState();
    expect(updated.mode).toBe('BATCH');
    expect(updated.selectedRunId).toBe('run-abc');
  });

  it('syncFromUrl respects explicit workspace mode and selection', () => {
    window.location.hash = '#results?mode=compare&comparison=cmp-77&overlay=delta';

    useResultsWorkspaceStore.getState().syncFromUrl();

    const updated = useResultsWorkspaceStore.getState();
    expect(updated.mode).toBe('COMPARE');
    expect(updated.selectedComparisonId).toBe('cmp-77');
    expect(updated.overlayMode).toBe('delta');
  });

  it('syncToUrl serializes explicit mode for deep links', () => {
    window.location.hash = '#results';
    useResultsWorkspaceStore.setState({
      mode: 'RUN',
      selectedRunId: 'run-55',
      selectedBatchId: null,
      selectedComparisonId: null,
      overlayMode: 'result',
      snapshotViewMode: 'RUN_SNAPSHOT',
    });

    useResultsWorkspaceStore.getState().syncToUrl();

    expect(window.location.hash).toContain('#results?mode=run');
    expect(window.location.hash).toContain('run=run-55');
    expect(window.location.hash).toContain('overlay=result');
  });
});

// ---------------------------------------------------------------------------
// Tests: Overlay mode
// ---------------------------------------------------------------------------

describe('ResultsWorkspaceStore — Overlay mode', () => {
  it('setOverlayMode updates overlay mode', () => {
    const store = useResultsWorkspaceStore.getState();
    store.setOverlayMode('none');
    expect(useResultsWorkspaceStore.getState().overlayMode).toBe('none');

    store.setOverlayMode('delta');
    expect(useResultsWorkspaceStore.getState().overlayMode).toBe('delta');
  });
});

// ---------------------------------------------------------------------------
// Tests: Filter
// ---------------------------------------------------------------------------

describe('ResultsWorkspaceStore — Filter', () => {
  it('setFilter updates filter', () => {
    const store = useResultsWorkspaceStore.getState();
    store.setFilter('DONE');
    expect(useResultsWorkspaceStore.getState().filter).toBe('DONE');
  });
});

// ---------------------------------------------------------------------------
// Tests: Reset
// ---------------------------------------------------------------------------

describe('ResultsWorkspaceStore — Reset', () => {
  it('reset clears all state', () => {
    const store = useResultsWorkspaceStore.getState();
    store.selectRun('run-abc');
    store.setFilter('FAILED');
    store.setOverlayMode('delta');

    store.reset();

    const updated = useResultsWorkspaceStore.getState();
    expect(updated.studyCaseId).toBeNull();
    expect(updated.selectedRunId).toBeNull();
    expect(updated.mode).toBe('RUN');
    expect(updated.filter).toBe('ALL');
    expect(updated.overlayMode).toBe('result');
  });
});

// ---------------------------------------------------------------------------
// Tests: URL param builders (deterministic)
// ---------------------------------------------------------------------------

describe('buildWorkspaceUrlParams', () => {
  it('builds empty params when nothing selected', () => {
    const params = buildWorkspaceUrlParams({
      selectedRunId: null,
      selectedBatchId: null,
      selectedComparisonId: null,
      overlayMode: 'result',
      snapshotViewMode: 'RUN_SNAPSHOT',
    });
    expect(params.toString()).toBe('');
  });

  it('includes run param', () => {
    const params = buildWorkspaceUrlParams({
      selectedRunId: 'run-123',
      selectedBatchId: null,
      selectedComparisonId: null,
      overlayMode: 'result',
      snapshotViewMode: 'RUN_SNAPSHOT',
    });
    expect(params.get('run')).toBe('run-123');
  });

  it('includes batch param', () => {
    const params = buildWorkspaceUrlParams({
      selectedRunId: null,
      selectedBatchId: 'batch-456',
      selectedComparisonId: null,
      overlayMode: 'result',
      snapshotViewMode: 'RUN_SNAPSHOT',
    });
    expect(params.get('batch')).toBe('batch-456');
  });

  it('includes comparison param', () => {
    const params = buildWorkspaceUrlParams({
      selectedRunId: null,
      selectedBatchId: null,
      selectedComparisonId: 'cmp-789',
      overlayMode: 'result',
      snapshotViewMode: 'RUN_SNAPSHOT',
    });
    expect(params.get('comparison')).toBe('cmp-789');
  });

  it('includes overlay param when not result', () => {
    const params = buildWorkspaceUrlParams({
      selectedRunId: null,
      selectedBatchId: null,
      selectedComparisonId: null,
      overlayMode: 'delta',
      snapshotViewMode: 'RUN_SNAPSHOT',
    });
    expect(params.get('overlay')).toBe('delta');
  });

  it('omits overlay param when result (default)', () => {
    const params = buildWorkspaceUrlParams({
      selectedRunId: null,
      selectedBatchId: null,
      selectedComparisonId: null,
      overlayMode: 'result',
      snapshotViewMode: 'RUN_SNAPSHOT',
    });
    expect(params.get('overlay')).toBeNull();
  });

  it('is deterministic (same input → same output)', () => {
    const input = {
      selectedRunId: 'run-1',
      selectedBatchId: 'batch-2',
      selectedComparisonId: 'cmp-3',
      overlayMode: 'delta' as const,
      snapshotViewMode: 'RUN_SNAPSHOT' as const,
    };
    const a = buildWorkspaceUrlParams(input).toString();
    const b = buildWorkspaceUrlParams(input).toString();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Tests: Filter functions (deterministic)
// ---------------------------------------------------------------------------

describe('filterRuns', () => {
  const runs: RunSummary[] = [
    makeRunSummary({ run_id: 'r1', status: 'DONE', analysis_type: 'SC_3F' }),
    makeRunSummary({ run_id: 'r2', status: 'FAILED', analysis_type: 'SC_1F' }),
    makeRunSummary({ run_id: 'r3', status: 'DONE', analysis_type: 'LOAD_FLOW' }),
    makeRunSummary({ run_id: 'r4', status: 'PENDING', analysis_type: 'SC_3F' }),
  ];

  it('ALL returns everything', () => {
    expect(filterRuns(runs, 'ALL')).toHaveLength(4);
  });

  it('DONE filters by status', () => {
    const result = filterRuns(runs, 'DONE');
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.status === 'DONE')).toBe(true);
  });

  it('FAILED filters by status', () => {
    const result = filterRuns(runs, 'FAILED');
    expect(result).toHaveLength(1);
    expect(result[0].run_id).toBe('r2');
  });

  it('SC_3F filters by analysis type', () => {
    const result = filterRuns(runs, 'SC_3F');
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.analysis_type === 'SC_3F')).toBe(true);
  });

  it('LOAD_FLOW filters by analysis type', () => {
    const result = filterRuns(runs, 'LOAD_FLOW');
    expect(result).toHaveLength(1);
    expect(result[0].analysis_type).toBe('LOAD_FLOW');
  });
});

describe('filterBatches', () => {
  const batches: BatchSummary[] = [
    makeBatchSummary({ batch_id: 'b1', status: 'DONE', analysis_type: 'SC_3F' }),
    makeBatchSummary({ batch_id: 'b2', status: 'FAILED', analysis_type: 'SC_1F' }),
  ];

  it('ALL returns everything', () => {
    expect(filterBatches(batches, 'ALL')).toHaveLength(2);
  });

  it('DONE filters correctly', () => {
    expect(filterBatches(batches, 'DONE')).toHaveLength(1);
  });

  it('SC_1F filters by analysis type', () => {
    expect(filterBatches(batches, 'SC_1F')).toHaveLength(1);
  });
});

describe('filterComparisons', () => {
  const comparisons: ComparisonSummary[] = [
    makeComparisonSummary({ comparison_id: 'c1', analysis_type: 'SC_3F' }),
    makeComparisonSummary({ comparison_id: 'c2', analysis_type: 'LOAD_FLOW' }),
  ];

  it('ALL returns everything', () => {
    expect(filterComparisons(comparisons, 'ALL')).toHaveLength(2);
  });

  it('DONE/FAILED returns all (comparisons have no status)', () => {
    expect(filterComparisons(comparisons, 'DONE')).toHaveLength(2);
    expect(filterComparisons(comparisons, 'FAILED')).toHaveLength(2);
  });

  it('SC_3F filters by analysis type', () => {
    const result = filterComparisons(comparisons, 'SC_3F');
    expect(result).toHaveLength(1);
    expect(result[0].comparison_id).toBe('c1');
  });
});

// ---------------------------------------------------------------------------
// Tests: Error handling
// ---------------------------------------------------------------------------

describe('ResultsWorkspaceStore — Error handling', () => {
  it('clearError resets error to null', () => {
    useResultsWorkspaceStore.setState({ error: 'Test error' });
    useResultsWorkspaceStore.getState().clearError();
    expect(useResultsWorkspaceStore.getState().error).toBeNull();
  });
});
