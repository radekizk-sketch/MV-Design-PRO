/**
 * Topology Store — Zustand store for graph topology state.
 *
 * Holds: TopologyGraphSummary, loading state, topology ops dispatch.
 * DETERMINISTIC: sorted outputs, stable IDs.
 */

import { create } from 'zustand';
import type {
  AdjacencyEntry,
  SpineNode,
  TopologyGraphSummary,
  TopologyOpIssue,
} from '../../types/enm';
import {
  executeTopologyOp,
  fetchTopologyStructure,
  fetchTopologySummary,
  type TopologyStructure,
} from './api';
import { useSnapshotStore } from './snapshotStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopologyState {
  /** Podsumowanie topologiczne (null = nie załadowane). */
  summary: TopologyGraphSummary | null;
  /**
   * Struktura topologiczna (stacje/pola/węzły/magistrale, null = nie załadowana) —
   * TODO-UI2 §1 p. 11: źródło trybów drzewa „administracyjny"/„obwodowy".
   */
  structure: TopologyStructure | null;
  /** Czy trwa ładowanie. */
  loading: boolean;
  /** Ostatni błąd. */
  error: string | null;
  /** Ostatnie issues z operacji. */
  lastOpIssues: TopologyOpIssue[];

  // Actions
  loadSummary: (caseId: string) => Promise<void>;
  loadStructure: (caseId: string) => Promise<void>;
  executeOp: (
    caseId: string,
    op: string,
    data: Record<string, unknown>,
  ) => Promise<{ success: boolean; issues: TopologyOpIssue[] }>;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Selectors (pure, derived)
// ---------------------------------------------------------------------------

/** Pobierz węzły spine posortowane po depth. */
export function selectSpineSorted(summary: TopologyGraphSummary | null): SpineNode[] {
  if (!summary) return [];
  return [...summary.spine].sort((a, b) => a.depth - b.depth || a.bus_ref.localeCompare(b.bus_ref));
}

/** Pobierz sąsiedztwo dla danego węzła. */
export function selectAdjacencyFor(
  summary: TopologyGraphSummary | null,
  busRef: string,
): AdjacencyEntry[] {
  if (!summary) return [];
  return summary.adjacency.filter((e) => e.bus_ref === busRef);
}

/** Sprawdź czy sieć jest radialna. */
export function selectIsRadial(summary: TopologyGraphSummary | null): boolean {
  return summary?.is_radial ?? true;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTopologyStore = create<TopologyState>((set) => ({
  summary: null,
  structure: null,
  loading: false,
  error: null,
  lastOpIssues: [],

  loadSummary: async (caseId: string) => {
    set({ loading: true, error: null });
    try {
      const summary = await fetchTopologySummary(caseId);
      set({ summary, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  loadStructure: async (caseId: string) => {
    try {
      const structure = await fetchTopologyStructure(caseId);
      set({ structure });
    } catch (err) {
      // Struktura zasila WYŁĄCZNIE tryby „administracyjny"/„obwodowy" drzewa —
      // błąd tego pobrania nie może zablokować trybu „zasilania" (summary ma
      // własny stan błędu). Pusta struktura = drzewo tych trybów pokazuje
      // uczciwy stan zerowy (adapter czyta `structure`, nie zgaduje).
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  executeOp: async (
    caseId: string,
    op: string,
    data: Record<string, unknown>,
  ) => {
    set({ error: null, lastOpIssues: [] });
    try {
      const result = await executeTopologyOp(caseId, op, data);
      set({ lastOpIssues: result.issues });

      if (result.success) {
        // Reload summary after successful operation
        const summary = await fetchTopologySummary(caseId);
        set({ summary });
        // Sync snapshotStore — single source of truth for SLD/Tree
        useSnapshotStore.getState().refreshFromBackend(caseId).catch(() => {});
      }

      return { success: result.success, issues: result.issues };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg });
      return { success: false, issues: [{ code: 'API_ERROR', severity: 'BLOCKER' as const, message_pl: errorMsg }] };
    }
  },

  clearError: () => set({ error: null, lastOpIssues: [] }),
}));
