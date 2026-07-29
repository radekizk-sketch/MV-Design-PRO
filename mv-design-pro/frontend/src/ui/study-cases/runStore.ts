/**
 * Execution Runs Store (Zustand) — PR-14: StudyCase → Run → ResultSet
 *
 * STATE MANAGEMENT:
 * - Tracks active study case ID for run context
 * - Maintains run history per study case
 * - Caches result sets for completed runs
 * - Manages run lifecycle (create → execute → poll → results)
 *
 * INVARIANTS:
 * - Run is created in PENDING, transitioned to RUNNING, then DONE or FAILED
 * - ResultSet available ONLY for DONE runs
 * - activeRunId tracks the most recent run for UI display
 * - runResultsCache stores fetched result sets to avoid re-fetching
 */

import { create } from 'zustand';
import type {
  ExecutionRun,
  ExecutionResultSet,
  RunStatus,
  CreateRunRequest,
} from './types';
import * as api from './api';

/**
 * Execution runs store state.
 */
interface ExecutionRunsState {
  // Active study case context
  activeStudyCaseId: string | null;

  // Active run (most recent for display)
  activeRunId: string | null;

  // Current run status
  runStatus: RunStatus | null;

  // Run history for active case
  runs: ExecutionRun[];

  // Cached result sets (run_id → ResultSet)
  runResultsCache: Record<string, ExecutionResultSet>;

  // Loading states
  isCreatingRun: boolean;
  isExecutingRun: boolean;
  isLoadingRuns: boolean;
  isLoadingResults: boolean;

  // Error state
  runError: string | null;

  // Actions
  setActiveStudyCaseId: (caseId: string | null) => void;
  createAndExecuteRun: (caseId: string, request: CreateRunRequest) => Promise<ExecutionRun>;
  loadRuns: (caseId: string) => Promise<void>;
  loadRunResults: (runId: string) => Promise<ExecutionResultSet>;
  pollRunStatus: (runId: string) => Promise<ExecutionRun>;
  setActiveRun: (runId: string | null) => void;
  clearRunError: () => void;
  reset: () => void;
}

const initialState = {
  activeStudyCaseId: null,
  activeRunId: null,
  runStatus: null,
  runs: [],
  runResultsCache: {},
  isCreatingRun: false,
  isExecutingRun: false,
  isLoadingRuns: false,
  isLoadingResults: false,
  runError: null,
};

/**
 * Zustand store for execution runs.
 */
export const useExecutionRunsStore = create<ExecutionRunsState>((set, get) => ({
  ...initialState,

  /**
   * Set active study case ID and load its runs.
   */
  setActiveStudyCaseId: (caseId) => {
    set({
      activeStudyCaseId: caseId,
      activeRunId: null,
      runStatus: null,
      runs: [],
    });
    if (caseId) {
      get().loadRuns(caseId);
    }
  },

  /**
   * Create and execute a new run.
   *
   * Steps:
   * 1. Create run (POST /api/study-cases/{caseId}/runs)
   * 2. Execute run (POST /api/runs/{runId}/execute)
   * 3. Update local state
   */
  createAndExecuteRun: async (caseId, request) => {
    set({ isCreatingRun: true, isExecutingRun: true, runError: null });
    try {
      // Step 1: Create run
      const run = await api.createRun(caseId, request);
      set({
        activeRunId: run.id,
        runStatus: run.status as RunStatus,
        isCreatingRun: false,
      });

      // Step 2: Execute
      const executedRun = await api.executeRun(run.id);
      set({
        runStatus: executedRun.status as RunStatus,
        isExecutingRun: false,
      });

      // Reload runs list
      await get().loadRuns(caseId);

      return executedRun;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Błąd tworzenia przebiegu';
      set({
        runError: message,
        isCreatingRun: false,
        isExecutingRun: false,
      });
      throw err;
    }
  },

  /**
   * Load runs for a study case.
   */
  loadRuns: async (caseId) => {
    set({ isLoadingRuns: true, runError: null });
    try {
      const result = await api.listRuns(caseId);
      // Kontrakt: { runs: ExecutionRun[] }. Odpowiedź bez tablicy NIE może
      // zatruć store'u (pole `runs` jest typowane ExecutionRun[]; `undefined`
      // wywracał każdego konsumenta iterującego, np. drzewo przebiegów
      // powłoki — „runs is not iterable"). Błąd protokołu = ścieżka błędu.
      if (!Array.isArray(result?.runs)) {
        throw new Error('Niepoprawna odpowiedź listy przebiegów (brak pola runs)');
      }
      set({ runs: result.runs, isLoadingRuns: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Błąd ładowania przebiegów';
      set({ runError: message, isLoadingRuns: false });
    }
  },

  /**
   * Load result set for a run (with caching).
   */
  loadRunResults: async (runId) => {
    // Check cache first
    const cached = get().runResultsCache[runId];
    if (cached) return cached;

    set({ isLoadingResults: true, runError: null });
    try {
      const resultSet = await api.getRunResults(runId);
      set((state) => ({
        runResultsCache: {
          ...state.runResultsCache,
          [runId]: resultSet,
        },
        isLoadingResults: false,
      }));
      return resultSet;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Błąd ładowania wyników';
      set({ runError: message, isLoadingResults: false });
      throw err;
    }
  },

  /**
   * Poll run status (for tracking RUNNING → DONE/FAILED transitions).
   */
  pollRunStatus: async (runId) => {
    try {
      const run = await api.getRun(runId);
      set({ runStatus: run.status as RunStatus });

      // Update in runs list
      set((state) => ({
        runs: state.runs.map((r) => (r.id === runId ? run : r)),
      }));

      return run;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Błąd sprawdzania statusu';
      set({ runError: message });
      throw err;
    }
  },

  /**
   * Set active run for display.
   */
  setActiveRun: (runId) => {
    set({ activeRunId: runId });
    if (runId) {
      const run = get().runs.find((r) => r.id === runId);
      if (run) {
        set({ runStatus: run.status as RunStatus });
      }
    } else {
      set({ runStatus: null });
    }
  },

  /**
   * Clear run error.
   */
  clearRunError: () => {
    set({ runError: null });
  },

  /**
   * Reset store to initial state.
   */
  reset: () => {
    set(initialState);
  },
}));

// =============================================================================
// Derived Hooks
// =============================================================================

/**
 * Hook: Get active run ID.
 */
export function useActiveRunId(): string | null {
  return useExecutionRunsStore((state) => state.activeRunId);
}

/**
 * Hook: Get current run status.
 */
export function useRunStatus(): RunStatus | null {
  return useExecutionRunsStore((state) => state.runStatus);
}

/**
 * Hook: Get runs for the active study case.
 */
export function useRuns(): ExecutionRun[] {
  return useExecutionRunsStore((state) => state.runs);
}

/**
 * Hook: Check if a run is in progress.
 */
export function useIsRunInProgress(): boolean {
  return useExecutionRunsStore(
    (state) => state.isCreatingRun || state.isExecutingRun
  );
}

/**
 * Hook: Check if the run button should be disabled.
 * Disabled when: no active case, run in progress, readiness not ready,
 * or eligibility INELIGIBLE for the selected analysis type (PR-17).
 */
export function useIsRunButtonDisabled(
  readinessReady: boolean,
  analysisEligible?: boolean,
): boolean {
  const isInProgress = useIsRunInProgress();
  const activeStudyCaseId = useExecutionRunsStore(
    (state) => state.activeStudyCaseId
  );
  const eligibilityBlocked = analysisEligible === false;
  return !activeStudyCaseId || isInProgress || !readinessReady || eligibilityBlocked;
}

/**
 * Hook: Get cached result set for a run.
 */
export function useCachedResultSet(
  runId: string | null
): ExecutionResultSet | undefined {
  return useExecutionRunsStore((state) =>
    runId ? state.runResultsCache[runId] : undefined
  );
}

/**
 * Hook: Get run error message.
 */
export function useRunError(): string | null {
  return useExecutionRunsStore((state) => state.runError);
}
