/**
 * P11b — Results Inspector Store (Zustand)
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: READ-ONLY result display, no physics
 * - wizard_screens.md: RESULT_VIEW mode
 * - powerfactory_ui_parity.md: Deterministic result tables
 * - sld_rules.md: Overlay as separate layer
 *
 * STATE MANAGEMENT:
 * - Tracks selected run for inspection
 * - Caches fetched results (buses, branches, SC, trace)
 * - Manages active tab state
 * - Controls SLD overlay visibility
 *
 * INVARIANTS:
 * - No physics calculations
 * - No model mutations
 * - All data from backend via P11a endpoints
 */

import { create } from 'zustand';
import type {
  BranchResults,
  BusResults,
  ExtendedTrace,
  ResultsIndex,
  ResultsInspectorTab,
  ShortCircuitResults,
  SldResultOverlay,
} from './types';
import type { EnergyNetworkModel } from '../../types/enm';
import * as api from './api';

/**
 * Results Inspector store state.
 */
interface ResultsInspectorState {
  // Selected run ID
  selectedRunId: string | null;

  // Results index (available tables)
  resultsIndex: ResultsIndex | null;

  // Cached results
  busResults: BusResults | null;
  branchResults: BranchResults | null;
  shortCircuitResults: ShortCircuitResults | null;
  extendedTrace: ExtendedTrace | null;
  runSnapshot: EnergyNetworkModel | null;

  // SLD overlay
  sldOverlay: SldResultOverlay | null;
  overlayVisible: boolean;

  // Active tab
  activeTab: ResultsInspectorTab;

  // Search/filter state
  searchQuery: string;

  // Loading states
  isLoadingIndex: boolean;
  isLoadingBuses: boolean;
  isLoadingBranches: boolean;
  isLoadingShortCircuit: boolean;
  isLoadingTrace: boolean;
  isLoadingRunSnapshot: boolean;
  isLoadingOverlay: boolean;

  // Error state
  error: string | null;

  // Actions
  selectRun: (runId: string) => Promise<void>;
  clearRun: () => void;
  setActiveTab: (tab: ResultsInspectorTab) => void;
  setSearchQuery: (query: string) => void;
  toggleOverlay: (visible?: boolean) => void;
  loadBusResults: () => Promise<void>;
  loadBranchResults: () => Promise<void>;
  loadShortCircuitResults: () => Promise<void>;
  loadExtendedTrace: () => Promise<void>;
  loadRunSnapshot: () => Promise<void>;
  loadSldOverlay: (projectId: string, diagramId: string) => Promise<void>;
  setSldOverlay: (overlay: SldResultOverlay | null) => void;
  reset: () => void;
}

/**
 * Initial state values.
 */
const initialState = {
  selectedRunId: null,
  resultsIndex: null,
  busResults: null,
  branchResults: null,
  shortCircuitResults: null,
  extendedTrace: null,
  runSnapshot: null,
  sldOverlay: null,
  overlayVisible: true,
  activeTab: 'BUSES' as ResultsInspectorTab,
  searchQuery: '',
  isLoadingIndex: false,
  isLoadingBuses: false,
  isLoadingBranches: false,
  isLoadingShortCircuit: false,
  isLoadingTrace: false,
  isLoadingRunSnapshot: false,
  isLoadingOverlay: false,
  error: null,
};

/**
 * Zustand store for Results Inspector.
 */
export const useResultsInspectorStore = create<ResultsInspectorState>((set, get) => ({
  ...initialState,

  /**
   * Select a run and load its results index.
   */
  selectRun: async (runId) => {
    set({
      selectedRunId: runId,
      isLoadingIndex: true,
      error: null,
      // Clear cached results when switching runs
      busResults: null,
      branchResults: null,
      shortCircuitResults: null,
      extendedTrace: null,
      runSnapshot: null,
      sldOverlay: null,
    });

    try {
      const resultsIndex = await api.fetchResultsIndex(runId);
      set({
        resultsIndex,
        isLoadingIndex: false,
      });

      // Auto-select appropriate tab based on available tables
      const { tables } = resultsIndex;
      const hasShortCircuit = tables.some((t) => t.table_id === 'short-circuit');
      if (hasShortCircuit) {
        set({ activeTab: 'SHORT_CIRCUIT' });
      } else if (tables.some((t) => t.table_id === 'buses')) {
        set({ activeTab: 'BUSES' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania wyników';
      set({ error: message, isLoadingIndex: false });
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
   * Load bus results for selected run.
   */
  loadBusResults: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingBuses: true, error: null });
    try {
      const busResults = await api.fetchBusResults(selectedRunId);
      set({ busResults, isLoadingBuses: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania wyników węzłowych';
      set({ error: message, isLoadingBuses: false });
    }
  },

  /**
   * Load branch results for selected run.
   */
  loadBranchResults: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingBranches: true, error: null });
    try {
      const branchResults = await api.fetchBranchResults(selectedRunId);
      set({ branchResults, isLoadingBranches: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania wyników gałęziowych';
      set({ error: message, isLoadingBranches: false });
    }
  },

  /**
   * Load short-circuit results for selected run.
   */
  loadShortCircuitResults: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingShortCircuit: true, error: null });
    try {
      const shortCircuitResults = await api.fetchShortCircuitResults(selectedRunId);
      set({ shortCircuitResults, isLoadingShortCircuit: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania wyników zwarciowych';
      set({ error: message, isLoadingShortCircuit: false });
    }
  },

  /**
   * Load extended trace for selected run.
   */
  loadExtendedTrace: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingTrace: true, error: null });
    try {
      const extendedTrace = await api.fetchExtendedTrace(selectedRunId);
      set({ extendedTrace, isLoadingTrace: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania śladu obliczeń';
      set({ error: message, isLoadingTrace: false });
    }
  },

  loadRunSnapshot: async () => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingRunSnapshot: true, error: null });
    try {
      const runSnapshot = await api.fetchRunSnapshot(selectedRunId);
      set({ runSnapshot, isLoadingRunSnapshot: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania migawki uruchomienia';
      set({ error: message, isLoadingRunSnapshot: false });
    }
  },

  /**
   * Load SLD overlay for selected run.
   */
  loadSldOverlay: async (projectId, diagramId) => {
    const { selectedRunId } = get();
    if (!selectedRunId) return;

    set({ isLoadingOverlay: true, error: null });
    try {
      const sldOverlay = await api.fetchSldOverlay(projectId, diagramId, selectedRunId);
      set({ sldOverlay, isLoadingOverlay: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania nakładki SLD';
      set({ error: message, isLoadingOverlay: false });
    }
  },

  setSldOverlay: (sldOverlay) => {
    set({ sldOverlay });
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
  return useResultsInspectorStore((state) => state.selectedRunId !== null);
}

/**
 * Hook: Get available table IDs for current run.
 */
export function useAvailableTables(): string[] {
  return useResultsInspectorStore((state) =>
    state.resultsIndex?.tables.map((t) => t.table_id) ?? []
  );
}

/**
 * Hook: Check if short-circuit tab should be visible.
 */
export function useHasShortCircuitResults(): boolean {
  return useResultsInspectorStore((state) =>
    state.resultsIndex?.tables.some((t) => t.table_id === 'short-circuit') ?? false
  );
}

/**
 * Hook: Get filtered bus results based on search query.
 */
export function useFilteredBusResults(): BusResults['rows'] {
  return useResultsInspectorStore((state) => {
    const rows = state.busResults?.rows ?? [];
    const query = state.searchQuery.toLowerCase().trim();
    if (!query) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.bus_id.toLowerCase().includes(query)
    );
  });
}

/**
 * Hook: Get filtered branch results based on search query.
 */
export function useFilteredBranchResults(): BranchResults['rows'] {
  return useResultsInspectorStore((state) => {
    const rows = state.branchResults?.rows ?? [];
    const query = state.searchQuery.toLowerCase().trim();
    if (!query) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.branch_id.toLowerCase().includes(query) ||
        row.from_bus.toLowerCase().includes(query) ||
        row.to_bus.toLowerCase().includes(query)
    );
  });
}

/**
 * Hook: Get run result status label.
 */
export function useRunResultStatusLabel(): string {
  return useResultsInspectorStore((state) => {
    const resultState = state.resultsIndex?.run_header.result_state;
    if (!resultState) return 'Brak wyników';
    switch (resultState) {
      case 'VALID':
      case 'FRESH':
        return 'Wyniki aktualne';
      case 'OUTDATED':
        return 'Wyniki nieaktualne';
      default:
        return 'Brak wyników';
    }
  });
}

/**
 * Hook: Check if any data is loading.
 */
export function useIsAnyLoading(): boolean {
  return useResultsInspectorStore(
    (state) =>
      state.isLoadingIndex ||
      state.isLoadingBuses ||
      state.isLoadingBranches ||
      state.isLoadingShortCircuit ||
      state.isLoadingTrace ||
      state.isLoadingOverlay
  );
}
