/**
 * Zustand store — Inspektor ENM (v4.2).
 *
 * Stan inspektora: wybrany element, filtr severity, aktywny tab.
 */

import { create } from 'zustand';
import type { DiagnosticSeverity } from './types';

type InspectorTab = 'diagnostics' | 'preflight' | 'reference';

interface EnmInspectorState {
  /** Aktualnie wybrany tab */
  activeTab: InspectorTab;
  /** Filtr severity (null = pokaż wszystkie) */
  severityFilter: DiagnosticSeverity | null;
  /** Wybrany element ENM (ref_id) */
  selectedElementId: string | null;

  // Actions
  setActiveTab: (tab: InspectorTab) => void;
  setSeverityFilter: (severity: DiagnosticSeverity | null) => void;
  setSelectedElementId: (id: string | null) => void;
  reset: () => void;
}

export const useEnmInspectorStore = create<EnmInspectorState>((set) => ({
  activeTab: 'diagnostics',
  severityFilter: null,
  selectedElementId: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSeverityFilter: (severity) => set({ severityFilter: severity }),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
  reset: () =>
    set({
      activeTab: 'diagnostics',
      severityFilter: null,
      selectedElementId: null,
    }),
}));
