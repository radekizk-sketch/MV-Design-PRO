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
 * - Run is created in PENDING, queued (QUEUED), RUNNING, then DONE, FAILED or CANCELLED
 * - ResultSet available ONLY for DONE runs
 * - sledzonyRunId: bieg ZLECONY z tego magazynu, którego cykl życia opisuje
 *   `runStatus` (zdarzenie „wyniki-gotowe" magistrali). To NIE jest kontekst wyniku:
 *   który bieg pokazują schemat, panel, pasek i ekrany, mówi wyłącznie magazyn
 *   kontekstu wyniku (`ui2/wyniki/kontekst`, karta K8) — dawne `activeRunId` tego
 *   magazynu było drugą kopią „wybranego biegu" i zostało skasowane.
 * - runResultsCache stores fetched result sets to avoid re-fetching
 */

import { create } from 'zustand';
import type {
  ExecutionAnalysisType,
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

  /** Bieg zlecony w tym magazynie, którego stan śledzi `runStatus` (nie kontekst wyniku). */
  sledzonyRunId: string | null;

  // Current run status
  runStatus: RunStatus | null;

  // Run history for active case
  runs: ExecutionRun[];

  // Cached result sets (run_id → ResultSet)
  runResultsCache: Record<string, ExecutionResultSet>;

  /**
   * Rodzaj analizy biegu W TOKU (od zlecenia do stanu końcowego) — pasek stanu
   * powłoki pokazuje, CO się liczy (karta K1 POWLOKA, §9: stan obliczeń widoczny
   * globalnie). Gaśnie razem z `isExecutingRun`.
   */
  trwajacaAnaliza: ExecutionAnalysisType | null;

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
  clearRunError: () => void;
  reset: () => void;
}

const initialState = {
  activeStudyCaseId: null,
  sledzonyRunId: null,
  runStatus: null,
  runs: [],
  runResultsCache: {},
  trwajacaAnaliza: null,
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
      sledzonyRunId: null,
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
   * 2. Zleć bieg (POST /api/runs/{runId}/execute → 202 QUEUED) i odpytuj stan do
   *    DONE/FAILED/CANCELLED jedną ścieżką `api.executeRunAndWait` — odpowiedź 202
   *    nie jest wynikiem; `runStatus` śledzi każdy odczyt stanu (QUEUED → RUNNING →
   *    stan końcowy), a `isExecutingRun` gaśnie dopiero na stanie końcowym.
   * 3. Update local state
   */
  createAndExecuteRun: async (caseId, request) => {
    set({
      isCreatingRun: true,
      isExecutingRun: true,
      trwajacaAnaliza: request.analysis_type,
      runError: null,
    });
    try {
      // Step 1: Create run
      const run = await api.createRun(caseId, request);
      set({
        sledzonyRunId: run.id,
        runStatus: run.status as RunStatus,
        isCreatingRun: false,
      });

      // Step 2: Execute
      const executedRun = await api.executeRunAndWait(run.id, {
        onStan: (bieg) => set({ runStatus: bieg.status as RunStatus }),
      });
      set({
        runStatus: executedRun.status as RunStatus,
        isExecutingRun: false,
        trwajacaAnaliza: null,
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
        trwajacaAnaliza: null,
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
