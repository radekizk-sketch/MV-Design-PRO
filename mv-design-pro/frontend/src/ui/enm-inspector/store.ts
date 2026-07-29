/**
 * Zustand store — Inspektor ENM (v4.2).
 *
 * Stan inspektora: wybrany element, filtr severity, aktywny tab.
 */

import { create } from 'zustand';
import type { DiagnosticSeverity } from './types';

type InspectorTab = 'tree' | 'diagnostics' | 'preflight' | 'diff' | 'reference';

interface EnmInspectorState {
  /** Aktualnie wybrany tab */
  activeTab: InspectorTab;
  /** Filtr severity (null = pokaż wszystkie) */
  severityFilter: DiagnosticSeverity | null;
  /** Wybrany element ENM (ref_id) */
  selectedElementId: string | null;
  /** Rozwinięte węzły drzewa */
  expandedNodes: Set<string>;
  /** Wyszukiwarka drzewa */
  searchQuery: string;

  // Actions
  setActiveTab: (tab: InspectorTab) => void;
  setSeverityFilter: (severity: DiagnosticSeverity | null) => void;
  setSelectedElementId: (id: string | null) => void;
  toggleNode: (nodeId: string) => void;
  setSearchQuery: (query: string) => void;
  reset: () => void;
}

export const useEnmInspectorStore = create<EnmInspectorState>((set) => ({
  activeTab: 'tree',
  severityFilter: null,
  selectedElementId: null,
  expandedNodes: new Set<string>(),
  searchQuery: '',

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSeverityFilter: (severity) => set({ severityFilter: severity }),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
  toggleNode: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { expandedNodes: next };
    }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  reset: () =>
    set({
      activeTab: 'tree',
      severityFilter: null,
      selectedElementId: null,
      expandedNodes: new Set<string>(),
      searchQuery: '',
    }),
}));
