/**
 * P20b — Power Flow Results Inspector Store (Zustand)
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: READ-ONLY result display, no physics
 * - wizard_screens.md: RESULT_VIEW mode
 * - ui_canonical_parity.md: Deterministic result tables
 * - sld_rules.md: Overlay as separate layer
 *
 * STATE MANAGEMENT:
 * - Tracks selected run for inspection
 * - Caches fetched results (buses, branches, summary, trace)
 * - Manages active tab state
 * - Controls SLD overlay visibility
 *
 * INVARIANTS:
 * - No physics calculations
 * - No model mutations
 * - All data from backend via P20a/P20b endpoints
 */

import { create } from 'zustand';
import type {
  PowerFlowRunHeader,
  PowerFlowResultV1,
  PowerFlowTrace,
  PowerFlowResultsTab,
  PowerFlowInterpretation,
  LoadFlowOverlayMode,
} from './types';
import * as api from './api';

/**
 * Power Flow Results Inspector store state.
 */
interface PowerFlowResultsState {
  // Selected run ID
  selectedRunId: string | null;

  // Run header metadata
  runHeader: PowerFlowRunHeader | null;

  // Cached results
  results: PowerFlowResultV1 | null;
  trace: PowerFlowTrace | null;
  interpretation: PowerFlowInterpretation | null;  // P22

  // SLD overlay
  overlayVisible: boolean;
  overlayMode: LoadFlowOverlayMode;

  // Active tab
  activeTab: PowerFlowResultsTab;

  // Search/filter state
  searchQuery: string;

  // Loading states
  isLoadingHeader: boolean;
  isLoadingResults: boolean;
  isLoadingTrace: boolean;
  isLoadingInterpretation: boolean;  // P22

  // Error state
  error: string | null;

  // Actions
  selectRun: (runId: string) => Promise<void>;
  clearRun: () => void;
  setActiveTab: (tab: PowerFlowResultsTab) => void;
  setSearchQuery: (query: string) => void;
  toggleOverlay: (visible?: boolean) => void;
  setOverlayMode: (mode: LoadFlowOverlayMode) => void;
  loadResults: () => Promise<void>;
  loadTrace: () => Promise<void>;
  loadInterpretation: () => Promise<void>;  // P22
  reset: () => void;
}

/**
 * Initial state values.
 */
const initialState = {
  selectedRunId: null,
  runHeader: null,
  results: null,
  trace: null,
  interpretation: null,  // P22
  overlayVisible: true,
  overlayMode: 'voltage' as LoadFlowOverlayMode,
  activeTab: 'BUSES' as PowerFlowResultsTab,
  searchQuery: '',
  isLoadingHeader: false,
  isLoadingResults: false,
  isLoadingTrace: false,
  isLoadingInterpretation: false,  // P22
  error: null,
};

/**
 * Zustand store for Power Flow Results Inspector.
 */
export const usePowerFlowResultsStore = create<PowerFlowResultsState>((set, get) => ({
  ...initialState,

  /**
   * Select a run and load its header.
   */
  selectRun: async (runId) => {
    set({
      selectedRunId: runId,
      isLoadingHeader: true,
      error: null,
      // Clear cached results when switching runs
      results: null,
      trace: null,
      interpretation: null,  // P22
    });

    try {
      const runHeader = await api.fetchPowerFlowRunHeader(runId);
      set({
        runHeader,
        isLoadingHeader: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Blad ladowania metadanych obliczenia';
      set({ error: message, isLoadingHeader: false });
    }
  },

  /**
   * Clear selected run.
   */
  clearRun: () => {
    set(initialState);
  },

  /**
   * Set active tab.
   */
  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  /**
   * Set search query for filtering.
   */
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  /**
   * Toggle SLD overlay visibility.
   */
  toggleOverlay: (visible) => {
    set((state) => ({
      overlayVisible: visible !== undefined ? visible : !state.overlayVisible,
    }));
  },

  /**
   * Set overlay display mode (voltage/loading/flow).
   */
  setOverlayMode: (mode) => {
    set({ overlayMode: mode });
  },

  /**
   * Load power flow results for selected run.
   */
  loadResults: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingResults: true, error: null });
    try {
      const results = await api.fetchPowerFlowResults(selectedRunId);
      set({ results, isLoadingResults: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Blad ladowania wynikow';
      set({ error: message, isLoadingResults: false });
    }
  },

  /**
   * Load power flow trace for selected run.
   */
  loadTrace: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingTrace: true, error: null });
    try {
      const trace = await api.fetchPowerFlowTrace(selectedRunId);
      set({ trace, isLoadingTrace: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Blad ladowania sladu obliczen';
      set({ error: message, isLoadingTrace: false });
    }
  },

  /**
   * P22: Load power flow interpretation for selected run.
   */
  loadInterpretation: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingInterpretation: true, error: null });
    try {
      const interpretation = await api.fetchPowerFlowInterpretation(selectedRunId);
      set({ interpretation, isLoadingInterpretation: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Blad ladowania interpretacji';
      set({ error: message, isLoadingInterpretation: false });
    }
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
 * Hook: Check if a run is selected.
 */
export function useHasSelectedRun(): boolean {
  return usePowerFlowResultsStore((state) => state.selectedRunId !== null);
}

/**
 * Hook: Get filtered bus results based on search query.
 */
export function useFilteredBusResults(): PowerFlowResultV1['bus_results'] {
  return usePowerFlowResultsStore((state) => {
    const rows = state.results?.bus_results ?? [];
    const query = state.searchQuery.toLowerCase().trim();
    if (!query) return rows;
    return rows.filter((row) => row.bus_id.toLowerCase().includes(query));
  });
}

/**
 * Hook: Get filtered branch results based on search query.
 */
export function useFilteredBranchResults(): PowerFlowResultV1['branch_results'] {
  return usePowerFlowResultsStore((state) => {
    const rows = state.results?.branch_results ?? [];
    const query = state.searchQuery.toLowerCase().trim();
    if (!query) return rows;
    return rows.filter((row) => row.branch_id.toLowerCase().includes(query));
  });
}

/**
 * Hook: Check if any data is loading.
 */
export function useIsAnyLoading(): boolean {
  return usePowerFlowResultsStore(
    (state) =>
      state.isLoadingHeader || state.isLoadingResults || state.isLoadingTrace || state.isLoadingInterpretation
  );
}

/**
 * Hook: Get convergence status label.
 */
export function useConvergenceLabel(): string {
  return usePowerFlowResultsStore((state) => {
    const converged = state.results?.converged;
    if (converged === null || converged === undefined) return 'Brak danych';
    return converged ? 'Zbiezny' : 'Niezbiezny';
  });
}
