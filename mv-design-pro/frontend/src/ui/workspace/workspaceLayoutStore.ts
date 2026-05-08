/**
 * WorkspaceLayoutStore (R55) — stan geometrii powłoki roboczej.
 *
 * Persystowany w localStorage pod kluczem `mv-design-pro.workspace.layout.v2`.
 * Separuje stan layoutu od stanu projektu (appState) i stanu selekcji.
 *
 * Invarianty:
 * - leftWidth ∈ [220, 480]
 * - rightWidth ∈ [280, 760]
 * - sldViewport.zoom ∈ [0.1, 8.0]
 * - Zmiana layoutu NIE unieważnia wyników obliczeń (layout ≠ topologia)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

export interface SldViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkspaceLayoutState {
  /** Panel lewy (kontekst obszaru) zwinięty */
  leftCollapsed: boolean;
  /** Panel prawy (inspektor techniczny) zwinięty */
  rightCollapsed: boolean;
  /** Szerokość lewego panelu w px (gdy rozwinięty) */
  leftWidth: number;
  /** Szerokość prawego panelu w px (gdy rozwinięty) */
  rightWidth: number;
  /** Aktywny krok przepływu inżynierskiego (np. identyfikator ekranu E-XX) */
  activeWorkflowStep: string;
  /** Sekcje lewego panelu rozwinięte (klucz = id sekcji) */
  expandedLeftSections: Record<string, boolean>;
  /** Wybrany element (sync z selectionStore — kopia dla persist) */
  selectedElementId: string | null;
  /** Viewport SLD — pozycja + zoom */
  sldViewport: SldViewport;

  // Actions
  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setActiveWorkflowStep: (step: string) => void;
  toggleLeftSection: (sectionId: string) => void;
  setExpandedLeftSections: (sections: Record<string, boolean>) => void;
  setSelectedElementId: (id: string | null) => void;
  setSldViewport: (viewport: Partial<SldViewport>) => void;
  resetLayout: () => void;
}

// =============================================================================
// Constraints
// =============================================================================

const LEFT_WIDTH_MIN = 220;
const LEFT_WIDTH_MAX = 480;
const RIGHT_WIDTH_MIN = 280;
const RIGHT_WIDTH_MAX = 760;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8.0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// =============================================================================
// Initial state
// =============================================================================

const INITIAL_STATE = {
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 280,
  rightWidth: 360,
  activeWorkflowStep: '',
  expandedLeftSections: {} as Record<string, boolean>,
  selectedElementId: null as string | null,
  sldViewport: { x: 0, y: 0, zoom: 1.0 } as SldViewport,
};

// =============================================================================
// Store
// =============================================================================

export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setLeftCollapsed: (collapsed) => set({ leftCollapsed: collapsed }),

      setRightCollapsed: (collapsed) => set({ rightCollapsed: collapsed }),

      setLeftWidth: (width) =>
        set({ leftWidth: clamp(width, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX) }),

      setRightWidth: (width) =>
        set({ rightWidth: clamp(width, RIGHT_WIDTH_MIN, RIGHT_WIDTH_MAX) }),

      setActiveWorkflowStep: (step) => set({ activeWorkflowStep: step }),

      toggleLeftSection: (sectionId) =>
        set((state) => ({
          expandedLeftSections: {
            ...state.expandedLeftSections,
            [sectionId]: !state.expandedLeftSections[sectionId],
          },
        })),

      setExpandedLeftSections: (sections) =>
        set({ expandedLeftSections: sections }),

      setSelectedElementId: (id) => set({ selectedElementId: id }),

      setSldViewport: (viewport) =>
        set((state) => ({
          sldViewport: {
            x: viewport.x ?? state.sldViewport.x,
            y: viewport.y ?? state.sldViewport.y,
            zoom: viewport.zoom != null
              ? clamp(viewport.zoom, ZOOM_MIN, ZOOM_MAX)
              : state.sldViewport.zoom,
          },
        })),

      resetLayout: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'mv-design-pro.workspace.layout.v2',
      partialize: (state) => ({
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        leftWidth: state.leftWidth,
        rightWidth: state.rightWidth,
        activeWorkflowStep: state.activeWorkflowStep,
        expandedLeftSections: state.expandedLeftSections,
        sldViewport: state.sldViewport,
        // selectedElementId NIE jest persystowany — session-only
      }),
    },
  ),
);

// =============================================================================
// Selectors (stabilne referencje)
// =============================================================================

export const selectLeftCollapsed = (s: WorkspaceLayoutState) => s.leftCollapsed;
export const selectRightCollapsed = (s: WorkspaceLayoutState) => s.rightCollapsed;
export const selectLeftWidth = (s: WorkspaceLayoutState) => s.leftWidth;
export const selectRightWidth = (s: WorkspaceLayoutState) => s.rightWidth;
export const selectSldViewport = (s: WorkspaceLayoutState) => s.sldViewport;
export const selectActiveWorkflowStep = (s: WorkspaceLayoutState) => s.activeWorkflowStep;
export const selectExpandedLeftSections = (s: WorkspaceLayoutState) => s.expandedLeftSections;
