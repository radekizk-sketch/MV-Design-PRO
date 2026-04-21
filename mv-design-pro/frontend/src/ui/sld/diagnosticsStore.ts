/**
 * SLD Diagnostics Store (Zustand)
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results/diagnostics as overlay
 * - ui_canonical_parity.md § A.3: URL reflects navigation state
 * - 100% POLISH UI
 *
 * Store for diagnostics overlay state:
 * - Visibility toggle
 * - Severity filter
 * - URL persistence (diag, diag_sev)
 *
 * READ-ONLY: No model mutations.
 */

import { create } from 'zustand';
import type { DiagnosticsSeverityFilter } from '../protection';
import {
  readDiagnosticsFromUrl,
  updateUrlWithDiagnostics,
} from '../navigation/urlState';

// =============================================================================
// Store State Interface
// =============================================================================

interface DiagnosticsStoreState {
  /** Diagnostics overlay visibility */
  diagnosticsVisible: boolean;

  /** Severity filter */
  diagnosticsFilter: DiagnosticsSeverityFilter;

  /** Toggle visibility */
  toggleDiagnostics: (visible?: boolean) => void;

  /** Set filter */
  setDiagnosticsFilter: (filter: DiagnosticsSeverityFilter) => void;

  /** Reset to defaults */
  resetDiagnostics: () => void;
}

// =============================================================================
// Initial State (from URL if available)
// =============================================================================

/**
 * Get initial state from URL or defaults.
 */
function getInitialState(): { diagnosticsVisible: boolean; diagnosticsFilter: DiagnosticsSeverityFilter } {
  if (typeof window === 'undefined') {
    return {
      diagnosticsVisible: false,
      diagnosticsFilter: 'ALL',
    };
  }
  const urlState = readDiagnosticsFromUrl();
  return {
    diagnosticsVisible: urlState.visible,
    diagnosticsFilter: urlState.filter,
  };
}

const initialState = getInitialState();

// =============================================================================
// Store
// =============================================================================

/**
 * Zustand store for SLD diagnostics overlay state.
 *
 * @example
 * ```tsx
 * const { diagnosticsVisible, toggleDiagnostics } = useDiagnosticsStore();
 * ```
 */
export const useDiagnosticsStore = create<DiagnosticsStoreState>((set) => ({
  ...initialState,

  /**
   * Toggle diagnostics overlay visibility.
   * If `visible` is provided, sets to that value.
   * Otherwise, toggles current state.
   * Syncs to URL.
   */
  toggleDiagnostics: (visible) =>
    set((state) => {
      const newVisible = visible !== undefined ? visible : !state.diagnosticsVisible;
      // Sync to URL
      updateUrlWithDiagnostics({
        visible: newVisible,
        filter: state.diagnosticsFilter,
      });
      return { diagnosticsVisible: newVisible };
    }),

  /**
   * Set severity filter.
   * Syncs to URL.
   */
  setDiagnosticsFilter: (filter) =>
    set((state) => {
      // Sync to URL
      updateUrlWithDiagnostics({
        visible: state.diagnosticsVisible,
        filter: filter,
      });
      return { diagnosticsFilter: filter };
    }),

  /**
   * Reset to initial state.
   */
  resetDiagnostics: () => {
    updateUrlWithDiagnostics({ visible: false, filter: 'ALL' });
    set({ diagnosticsVisible: false, diagnosticsFilter: 'ALL' });
  },
}));

// =============================================================================
// Derived Hooks
// =============================================================================

/**
 * Hook: Check if diagnostics overlay is visible.
 */
export function useDiagnosticsVisible(): boolean {
  return useDiagnosticsStore((state) => state.diagnosticsVisible);
}

/**
 * Hook: Get current filter.
 */
export function useDiagnosticsFilter(): DiagnosticsSeverityFilter {
  return useDiagnosticsStore((state) => state.diagnosticsFilter);
}
