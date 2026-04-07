/**
 * Results Workspace Store
 *
 * URL remains the single source of truth for run selection, overlay mode
 * and snapshot context mode.
 */

import { create } from 'zustand';
import type {
  WorkspaceProjection,
  WorkspaceMode,
  OverlayDisplayMode,
  SnapshotViewMode,
  WorkspaceFilter,
  RunSummary,
  BatchSummary,
  ComparisonSummary,
} from './types';
import { WORKSPACE_URL_PARAMS } from './types';
import * as api from './api';

interface ResultsWorkspaceState {
  studyCaseId: string | null;
  projection: WorkspaceProjection | null;
  mode: WorkspaceMode;
  selectedRunId: string | null;
  selectedBatchId: string | null;
  selectedComparisonId: string | null;
  overlayMode: OverlayDisplayMode;
  snapshotViewMode: SnapshotViewMode;
  filter: WorkspaceFilter;
  isLoading: boolean;
  error: string | null;
  setStudyCaseId: (id: string | null) => void;
  loadProjection: (studyCaseId: string) => Promise<void>;
  setMode: (mode: WorkspaceMode) => void;
  selectRun: (runId: string | null) => void;
  selectBatch: (batchId: string | null) => void;
  selectComparison: (comparisonId: string | null) => void;
  setOverlayMode: (mode: OverlayDisplayMode) => void;
  setSnapshotViewMode: (mode: SnapshotViewMode) => void;
  setFilter: (filter: WorkspaceFilter) => void;
  syncFromUrl: () => void;
  syncToUrl: () => void;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  studyCaseId: null as string | null,
  projection: null as WorkspaceProjection | null,
  mode: 'RUN' as WorkspaceMode,
  selectedRunId: null as string | null,
  selectedBatchId: null as string | null,
  selectedComparisonId: null as string | null,
  overlayMode: 'result' as OverlayDisplayMode,
  snapshotViewMode: 'RUN_SNAPSHOT' as SnapshotViewMode,
  filter: 'ALL' as WorkspaceFilter,
  isLoading: false,
  error: null as string | null,
};

export function parseWorkspaceUrlParams(): {
  runId: string | null;
  batchId: string | null;
  comparisonId: string | null;
  overlayMode: OverlayDisplayMode | null;
  snapshotViewMode: SnapshotViewMode | null;
} {
  if (typeof window === 'undefined') {
    return {
      runId: null,
      batchId: null,
      comparisonId: null,
      overlayMode: null,
      snapshotViewMode: null,
    };
  }

  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) {
    return {
      runId: null,
      batchId: null,
      comparisonId: null,
      overlayMode: null,
      snapshotViewMode: null,
    };
  }

  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  const overlayRaw = params.get(WORKSPACE_URL_PARAMS.OVERLAY);
  const contextRaw = params.get(WORKSPACE_URL_PARAMS.CONTEXT);

  return {
    runId: params.get(WORKSPACE_URL_PARAMS.RUN),
    batchId: params.get(WORKSPACE_URL_PARAMS.BATCH),
    comparisonId: params.get(WORKSPACE_URL_PARAMS.COMPARISON),
    overlayMode:
      overlayRaw === 'result' || overlayRaw === 'delta' || overlayRaw === 'none'
        ? overlayRaw
        : null,
    snapshotViewMode:
      contextRaw === 'current'
        ? 'CURRENT_MODEL'
        : contextRaw === 'run'
          ? 'RUN_SNAPSHOT'
          : null,
  };
}

export function buildWorkspaceUrlParams(state: {
  selectedRunId: string | null;
  selectedBatchId: string | null;
  selectedComparisonId: string | null;
  overlayMode: OverlayDisplayMode;
  snapshotViewMode: SnapshotViewMode;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (state.selectedRunId) params.set(WORKSPACE_URL_PARAMS.RUN, state.selectedRunId);
  if (state.selectedBatchId) params.set(WORKSPACE_URL_PARAMS.BATCH, state.selectedBatchId);
  if (state.selectedComparisonId) {
    params.set(WORKSPACE_URL_PARAMS.COMPARISON, state.selectedComparisonId);
  }
  if (state.overlayMode !== 'result') {
    params.set(WORKSPACE_URL_PARAMS.OVERLAY, state.overlayMode);
  }
  if (state.snapshotViewMode !== 'RUN_SNAPSHOT') {
    params.set(WORKSPACE_URL_PARAMS.CONTEXT, 'current');
  }
  return params;
}

export interface WorkspaceUrlState {
  mode: WorkspaceMode;
  selectedRunId: string | null;
  selectedBatchId: string | null;
  selectedComparisonId: string | null;
  overlayMode: OverlayDisplayMode;
  snapshotViewMode: SnapshotViewMode;
}

export function buildUrlFromState(state: WorkspaceUrlState): string {
  const params = new URLSearchParams();

  params.set('mode', state.mode.toLowerCase());
  params.set(WORKSPACE_URL_PARAMS.OVERLAY, state.overlayMode);
  params.set(
    WORKSPACE_URL_PARAMS.CONTEXT,
    state.snapshotViewMode === 'CURRENT_MODEL' ? 'current' : 'run'
  );

  if (state.selectedRunId) {
    params.set(WORKSPACE_URL_PARAMS.RUN, state.selectedRunId);
  }
  if (state.selectedBatchId) {
    params.set(WORKSPACE_URL_PARAMS.BATCH, state.selectedBatchId);
  }
  if (state.selectedComparisonId) {
    params.set(WORKSPACE_URL_PARAMS.COMPARISON, state.selectedComparisonId);
  }

  return params.toString();
}

export function parseStateFromUrl(search: string): WorkspaceUrlState {
  const params = new URLSearchParams(search);

  const modeRaw = params.get('mode');
  let mode: WorkspaceMode = 'RUN';
  if (modeRaw === 'batch') mode = 'BATCH';
  if (modeRaw === 'compare') mode = 'COMPARE';

  const overlayRaw = params.get(WORKSPACE_URL_PARAMS.OVERLAY);
  let overlayMode: OverlayDisplayMode = 'result';
  if (overlayRaw === 'delta' || overlayRaw === 'none' || overlayRaw === 'result') {
    overlayMode = overlayRaw;
  }

  const contextRaw = params.get(WORKSPACE_URL_PARAMS.CONTEXT);
  let snapshotViewMode: SnapshotViewMode = 'RUN_SNAPSHOT';
  if (contextRaw === 'current') {
    snapshotViewMode = 'CURRENT_MODEL';
  }

  const runId = params.get(WORKSPACE_URL_PARAMS.RUN);
  const batchId = params.get(WORKSPACE_URL_PARAMS.BATCH);
  const comparisonId = params.get(WORKSPACE_URL_PARAMS.COMPARISON);

  if (!modeRaw) {
    if (comparisonId) mode = 'COMPARE';
    else if (batchId) mode = 'BATCH';
    else if (runId) mode = 'RUN';
  }

  return {
    mode,
    selectedRunId: runId,
    selectedBatchId: batchId,
    selectedComparisonId: comparisonId,
    overlayMode,
    snapshotViewMode,
  };
}

export function filterRuns(runs: RunSummary[], filter: WorkspaceFilter): RunSummary[] {
  if (filter === 'ALL') return runs;
  if (filter === 'DONE') return runs.filter((r) => r.status === 'DONE');
  if (filter === 'FAILED') return runs.filter((r) => r.status === 'FAILED');
  return runs.filter((r) => r.analysis_type === filter);
}

export function filterBatches(
  batches: BatchSummary[],
  filter: WorkspaceFilter
): BatchSummary[] {
  if (filter === 'ALL') return batches;
  if (filter === 'DONE') return batches.filter((b) => b.status === 'DONE');
  if (filter === 'FAILED') return batches.filter((b) => b.status === 'FAILED');
  return batches.filter((b) => b.analysis_type === filter);
}

export function filterComparisons(
  comparisons: ComparisonSummary[],
  filter: WorkspaceFilter
): ComparisonSummary[] {
  if (filter === 'ALL') return comparisons;
  if (filter === 'DONE' || filter === 'FAILED') return comparisons;
  return comparisons.filter((c) => c.analysis_type === filter);
}

export const useResultsWorkspaceStore = create<ResultsWorkspaceState>((set, get) => ({
  ...initialState,

  setStudyCaseId: (id) => {
    const current = get().studyCaseId;
    if (current !== id) {
      set({ studyCaseId: id, projection: null, error: null });
      if (id) {
        void get().loadProjection(id);
      }
    }
  },

  loadProjection: async (studyCaseId) => {
    set({ isLoading: true, error: null });
    try {
      const projection = await api.fetchWorkspaceProjection(studyCaseId);
      set({ projection, isLoading: false });
      const { selectedRunId } = get();
      if (!selectedRunId && projection.latest_done_run_id) {
        set({
          selectedRunId: projection.latest_done_run_id,
          snapshotViewMode: 'RUN_SNAPSHOT',
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Błąd ładowania przestrzeni roboczej wyników';
      set({ error: message, isLoading: false });
    }
  },

  setMode: (mode) => {
    set({ mode });
    get().syncToUrl();
  },

  selectRun: (runId) => {
    set({
      selectedRunId: runId,
      mode: 'RUN',
      overlayMode: 'result',
      snapshotViewMode: 'RUN_SNAPSHOT',
    });
    get().syncToUrl();
  },

  selectBatch: (batchId) => {
    set({
      selectedBatchId: batchId,
      mode: 'BATCH',
    });
    get().syncToUrl();
  },

  selectComparison: (comparisonId) => {
    set({
      selectedComparisonId: comparisonId,
      mode: 'COMPARE',
      overlayMode: 'delta',
    });
    get().syncToUrl();
  },

  setOverlayMode: (overlayMode) => {
    set({ overlayMode });
    get().syncToUrl();
  },

  setSnapshotViewMode: (snapshotViewMode) => {
    set({ snapshotViewMode });
    get().syncToUrl();
  },

  setFilter: (filter) => {
    set({ filter });
  },

  syncFromUrl: () => {
    if (typeof window === 'undefined') {
      return;
    }

    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    const rawSearch = queryIndex === -1 ? '' : hash.slice(queryIndex + 1);
    const urlState = parseStateFromUrl(rawSearch);

    set({
      mode: urlState.mode,
      selectedRunId: urlState.selectedRunId,
      selectedBatchId: urlState.selectedBatchId,
      selectedComparisonId: urlState.selectedComparisonId,
      overlayMode: urlState.overlayMode,
      snapshotViewMode: urlState.snapshotViewMode,
    });
  },

  syncToUrl: () => {
    if (typeof window === 'undefined') return;

    const state = get();
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    const baseHash = queryIndex !== -1 ? hash.slice(0, queryIndex) : hash;
    const canonicalBaseHash = baseHash === '#results-workspace' ? '#results' : baseHash;
    const queryString = buildUrlFromState({
      mode: state.mode,
      selectedRunId: state.selectedRunId,
      selectedBatchId: state.selectedBatchId,
      selectedComparisonId: state.selectedComparisonId,
      overlayMode: state.overlayMode,
      snapshotViewMode: state.snapshotViewMode,
    });
    const newHash = queryString ? `${canonicalBaseHash}?${queryString}` : canonicalBaseHash;
    const newUrl = `${window.location.pathname}${newHash}`;
    window.history.replaceState(null, '', newUrl);
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));

export function useFilteredRuns(): RunSummary[] {
  return useResultsWorkspaceStore((state) => filterRuns(state.projection?.runs ?? [], state.filter));
}

export function useFilteredBatches(): BatchSummary[] {
  return useResultsWorkspaceStore((state) =>
    filterBatches(state.projection?.batches ?? [], state.filter)
  );
}

export function useFilteredComparisons(): ComparisonSummary[] {
  return useResultsWorkspaceStore((state) =>
    filterComparisons(state.projection?.comparisons ?? [], state.filter)
  );
}

export function useSelectedRunDetail(): RunSummary | null {
  return useResultsWorkspaceStore((state) => {
    if (!state.selectedRunId || !state.projection) return null;
    return state.projection.runs.find((run) => run.run_id === state.selectedRunId) ?? null;
  });
}

export function useSelectedBatchDetail(): BatchSummary | null {
  return useResultsWorkspaceStore((state) => {
    if (!state.selectedBatchId || !state.projection) return null;
    return state.projection.batches.find((batch) => batch.batch_id === state.selectedBatchId) ?? null;
  });
}

export function useSelectedComparisonDetail(): ComparisonSummary | null {
  return useResultsWorkspaceStore((state) => {
    if (!state.selectedComparisonId || !state.projection) return null;
    return (
      state.projection.comparisons.find(
        (comparison) => comparison.comparison_id === state.selectedComparisonId
      ) ?? null
    );
  });
}

export function useProjectionHash(): string | null {
  return useResultsWorkspaceStore((state) => state.projection?.deterministic_hash ?? null);
}
