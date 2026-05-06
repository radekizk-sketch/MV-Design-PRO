/**
 * FIX-03 — Results Browser Store (Zustand)
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: READ-ONLY result display
 * - Zustand pattern from existing modules
 *
 * STATE MANAGEMENT:
 * - View mode selection
 * - Results data per view
 * - Filtering and sorting
 * - Run selection for comparison
 */

import { create } from 'zustand';
import type {
  ResultsViewMode,
  BusVoltageRow,
  BranchFlowRow,
  LossesRow,
  ViolationRow,
  ConvergenceRow,
  FilterState,
  SortConfig,
  RunHeaderCompare,
} from './types';
import {
  fetchBusVoltages,
  fetchBranchFlows,
  fetchLosses,
  fetchViolations,
  fetchConvergence,
  fetchRunsForComparison,
} from './api';

// =============================================================================
// Store State Interface
// =============================================================================

interface ResultsBrowserState {
  // Context
  projectId: string | null;
  caseId: string | null;
  runId: string | null;

  // PR-4: Stale result blocking
  resultsValid: boolean;

  // View mode
  viewMode: ResultsViewMode;

  // Results data
  busVoltages: BusVoltageRow[];
  branchFlows: BranchFlowRow[];
  losses: LossesRow[];
  violations: ViolationRow[];
  convergence: ConvergenceRow[];

  // Available runs for comparison
  availableRuns: RunHeaderCompare[];
  selectedRunIds: string[];

  // Filtering and sorting
  filters: FilterState;
  sortConfig: SortConfig | null;

  // Loading states
  isLoadingBusVoltages: boolean;
  isLoadingBranchFlows: boolean;
  isLoadingLosses: boolean;
  isLoadingViolations: boolean;
  isLoadingConvergence: boolean;
  isLoadingRuns: boolean;

  // Error state
  error: string | null;

  // Actions
  setContext: (projectId: string, caseId: string, runId: string) => void;
  setResultsValid: (valid: boolean) => void;
  setViewMode: (mode: ResultsViewMode) => void;
  setFilters: (filters: FilterState) => void;
  setSortConfig: (config: SortConfig | null) => void;
  toggleRunSelection: (runId: string) => void;
  clearRunSelection: () => void;

  // Data loading
  loadBusVoltages: () => Promise<void>;
  loadBranchFlows: () => Promise<void>;
  loadLosses: () => Promise<void>;
  loadViolations: () => Promise<void>;
  loadConvergence: () => Promise<void>;
  loadAvailableRuns: () => Promise<void>;
  loadCurrentViewData: () => Promise<void>;

  // Reset
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState = {
  projectId: null,
  caseId: null,
  runId: null,
  resultsValid: true,
  viewMode: 'bus_voltages' as ResultsViewMode,
  busVoltages: [],
  branchFlows: [],
  losses: [],
  violations: [],
  convergence: [],
  availableRuns: [],
  selectedRunIds: [],
  filters: {},
  sortConfig: null,
  isLoadingBusVoltages: false,
  isLoadingBranchFlows: false,
  isLoadingLosses: false,
  isLoadingViolations: false,
  isLoadingConvergence: false,
  isLoadingRuns: false,
  error: null,
};

// =============================================================================
// Store Implementation
// =============================================================================

export const useResultsBrowserStore = create<ResultsBrowserState>((set, get) => ({
  ...initialState,

  // Context actions
  setContext: (projectId, caseId, runId) => {
    set({ projectId, caseId, runId, error: null });
    // Load data for current view
    get().loadCurrentViewData();
  },

  // PR-4: Set results validity flag
  setResultsValid: (valid) => {
    set({ resultsValid: valid });
    if (!valid) {
      // Clear loaded data when results become invalid
      set({
        error: 'Wyniki nieaktualne — wymagane ponowne obliczenie',
      });
    }
  },

  // View mode actions
  setViewMode: (mode) => {
    set({ viewMode: mode, error: null });
    get().loadCurrentViewData();
  },

  // Filter/sort actions
  setFilters: (filters) => set({ filters }),
  setSortConfig: (config) => set({ sortConfig: config }),

  // Run selection for comparison
  toggleRunSelection: (runId) => {
    const { selectedRunIds } = get();
    if (selectedRunIds.includes(runId)) {
      set({ selectedRunIds: selectedRunIds.filter((id) => id !== runId) });
    } else {
      set({ selectedRunIds: [...selectedRunIds, runId] });
    }
  },

  clearRunSelection: () => set({ selectedRunIds: [] }),

  // Data loading actions
  loadBusVoltages: async () => {
    const { runId } = get();
    if (!runId) return;

    set({ isLoadingBusVoltages: true, error: null });
    try {
      const data = await fetchBusVoltages(runId);
      set({ busVoltages: data, isLoadingBusVoltages: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Błąd wczytywania napięć',
        isLoadingBusVoltages: false,
      });
    }
  },

  loadBranchFlows: async () => {
    const { runId } = get();
    if (!runId) return;

    set({ isLoadingBranchFlows: true, error: null });
    try {
      const data = await fetchBranchFlows(runId);
      set({ branchFlows: data, isLoadingBranchFlows: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Błąd wczytywania przepływów',
        isLoadingBranchFlows: false,
      });
    }
  },

  loadLosses: async () => {
    const { runId } = get();
    if (!runId) return;

    set({ isLoadingLosses: true, error: null });
    try {
      const data = await fetchLosses(runId);
      set({ losses: data, isLoadingLosses: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Błąd wczytywania strat',
        isLoadingLosses: false,
      });
    }
  },

  loadViolations: async () => {
    const { runId } = get();
    if (!runId) return;

    set({ isLoadingViolations: true, error: null });
    try {
      const data = await fetchViolations(runId);
      set({ violations: data, isLoadingViolations: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Błąd wczytywania naruszeń',
        isLoadingViolations: false,
      });
    }
  },

  loadConvergence: async () => {
    const { runId } = get();
    if (!runId) return;

    set({ isLoadingConvergence: true, error: null });
    try {
      const data = await fetchConvergence(runId);
      set({ convergence: data, isLoadingConvergence: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Błąd wczytywania zbieżności',
        isLoadingConvergence: false,
      });
    }
  },

  loadAvailableRuns: async () => {
    const { projectId } = get();
    if (!projectId) return;

    set({ isLoadingRuns: true, error: null });
    try {
      const data = await fetchRunsForComparison(projectId);
      set({ availableRuns: data, isLoadingRuns: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Błąd wczytywania listy obliczeń',
        isLoadingRuns: false,
      });
    }
  },

  loadCurrentViewData: async () => {
    const { viewMode, resultsValid } = get();

    // PR-4: Block loading stale results
    if (!resultsValid) {
      set({
        error: 'Wyniki nieaktualne — wymagane ponowne obliczenie',
      });
      return;
    }

    switch (viewMode) {
      case 'bus_voltages':
        await get().loadBusVoltages();
        break;
      case 'branch_flows':
        await get().loadBranchFlows();
        break;
      case 'losses':
        await get().loadLosses();
        break;
      case 'violations':
        await get().loadViolations();
        break;
      case 'convergence':
        await get().loadConvergence();
        break;
      case 'white_box':
        // White box uses convergence data
        await get().loadConvergence();
        break;
    }
  },

  reset: () => set(initialState),
}));

// =============================================================================
// Derived Selectors (Hooks)
// =============================================================================

/**
 * Check if any data is currently loading.
 */
export function useIsAnyLoading(): boolean {
  return useResultsBrowserStore((state) =>
    state.isLoadingBusVoltages ||
    state.isLoadingBranchFlows ||
    state.isLoadingLosses ||
    state.isLoadingViolations ||
    state.isLoadingConvergence ||
    state.isLoadingRuns
  );
}

/**
 * Get filtered bus voltages based on current filters.
 */
export function useFilteredBusVoltages(): BusVoltageRow[] {
  return useResultsBrowserStore((state) => {
    let rows = state.busVoltages;
    const { filters, sortConfig } = state;

    // Apply search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.bus_name.toLowerCase().includes(query) ||
          row.bus_id.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filters.statusFilter && filters.statusFilter !== 'ALL') {
      rows = rows.filter((row) => row.status === filters.statusFilter);
    }

    // Apply sorting
    if (sortConfig) {
      rows = applySorting(rows, sortConfig);
    }

    return rows;
  });
}

/**
 * Get filtered branch flows based on current filters.
 */
export function useFilteredBranchFlows(): BranchFlowRow[] {
  return useResultsBrowserStore((state) => {
    let rows = state.branchFlows;
    const { filters, sortConfig } = state;

    // Apply search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.branch_name.toLowerCase().includes(query) ||
          row.branch_id.toLowerCase().includes(query) ||
          row.from_bus.toLowerCase().includes(query) ||
          row.to_bus.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filters.statusFilter && filters.statusFilter !== 'ALL') {
      rows = rows.filter((row) => row.status === filters.statusFilter);
    }

    // Apply sorting
    if (sortConfig) {
      rows = applySorting(rows, sortConfig);
    }

    return rows;
  });
}

/**
 * Get filtered losses based on current filters.
 */
export function useFilteredLosses(): LossesRow[] {
  return useResultsBrowserStore((state) => {
    let rows = state.losses;
    const { filters, sortConfig } = state;

    // Apply search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.branch_name.toLowerCase().includes(query) ||
          row.branch_id.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (sortConfig) {
      rows = applySorting(rows, sortConfig);
    }

    return rows;
  });
}

/**
 * Get filtered violations based on current filters.
 */
export function useFilteredViolations(): ViolationRow[] {
  return useResultsBrowserStore((state) => {
    let rows = state.violations;
    const { filters, sortConfig } = state;

    // Apply search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.element_name.toLowerCase().includes(query) ||
          row.element_id.toLowerCase().includes(query)
      );
    }

    // Apply severity filter
    if (filters.statusFilter && filters.statusFilter !== 'ALL') {
      rows = rows.filter((row) => row.severity === filters.statusFilter);
    }

    // Apply sorting
    if (sortConfig) {
      rows = applySorting(rows, sortConfig);
    }

    return rows;
  });
}

/**
 * Get data for current view mode.
 */
export function useCurrentViewData(): unknown[] {
  return useResultsBrowserStore((state) => {
    switch (state.viewMode) {
      case 'bus_voltages':
        return state.busVoltages;
      case 'branch_flows':
        return state.branchFlows;
      case 'losses':
        return state.losses;
      case 'violations':
        return state.violations;
      case 'convergence':
      case 'white_box':
        return state.convergence;
      default:
        return [];
    }
  });
}

/**
 * PR-4: Check if results are valid for display/export.
 *
 * Returns false when results are stale (model/config changed after calculation).
 * UI MUST use this to block result access and export when false.
 */
export function useResultsValid(): boolean {
  return useResultsBrowserStore((state) => state.resultsValid);
}

/**
 * PR-4: Check if export is allowed.
 *
 * Export is blocked when results are stale.
 */
export function useCanExport(): boolean {
  return useResultsBrowserStore(
    (state) => state.resultsValid && state.runId !== null
  );
}

/**
 * Check if comparison is possible (2+ runs selected).
 */
export function useCanCompare(): boolean {
  return useResultsBrowserStore((state) => state.selectedRunIds.length >= 2);
}

/**
 * Get violation summary counts.
 */
export function useViolationSummary(): { high: number; warn: number; info: number; total: number } {
  return useResultsBrowserStore((state) => {
    const violations = state.violations;
    return {
      high: violations.filter((v) => v.severity === 'HIGH').length,
      warn: violations.filter((v) => v.severity === 'WARN').length,
      info: violations.filter((v) => v.severity === 'INFO').length,
      total: violations.length,
    };
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

function applySorting<T>(
  rows: T[],
  sortConfig: SortConfig
): T[] {
  return [...rows].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[sortConfig.key];
    const bVal = (b as Record<string, unknown>)[sortConfig.key];

    // Handle nulls
    if (aVal === null || aVal === undefined) return sortConfig.direction === 'asc' ? 1 : -1;
    if (bVal === null || bVal === undefined) return sortConfig.direction === 'asc' ? -1 : 1;

    // Compare
    let comparison = 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal), 'pl');
    }

    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });
}
