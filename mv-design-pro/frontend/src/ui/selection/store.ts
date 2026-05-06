/**
 * Selection State Store
 *
 * Single source of truth for selection state and cross-view synchronization.
 * CASE_CONFIG remains a compatibility alias only and is normalized by helper
 * hooks to the writable shell state.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getOperatingModeLabel,
  normalizeOperatingMode,
  type RuntimeOperatingMode,
} from '../operatingMode';
import type {
  MultiSelection,
  OperatingMode,
  ResultStatus,
  SelectedElement,
} from '../types';

interface SelectionState {
  selectedElements: SelectedElement[];
  selectedElement: SelectedElement | null;
  mode: RuntimeOperatingMode;
  resultStatus: ResultStatus;
  propertyGridOpen: boolean;
  treeExpandedNodes: Set<string>;
  sldCenterOnElement: string | null;
  selectElement: (element: SelectedElement | null) => void;
  selectElements: (elements: SelectedElement[]) => void;
  toggleElement: (element: SelectedElement) => void;
  extendSelection: (element: SelectedElement) => void;
  removeFromSelection: (elementId: string) => void;
  getMultiSelection: () => MultiSelection | null;
  setMode: (mode: OperatingMode | RuntimeOperatingMode) => void;
  setResultStatus: (status: ResultStatus) => void;
  togglePropertyGrid: (open?: boolean) => void;
  expandTreeNode: (nodeId: string) => void;
  collapseTreeNode: (nodeId: string) => void;
  centerSldOnElement: (elementId: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set, get) => ({
      selectedElements: [],
      selectedElement: null,
      mode: 'MODEL_EDIT',
      resultStatus: 'NONE',
      propertyGridOpen: false,
      treeExpandedNodes: new Set<string>(),
      sldCenterOnElement: null,

      selectElement: (element) =>
        set((state) => ({
          selectedElements: element ? [element] : [],
          selectedElement: element ?? null,
          propertyGridOpen: element !== null || state.propertyGridOpen,
        })),

      selectElements: (elements) =>
        set((state) => {
          const sorted = [...elements].sort((a, b) => a.id.localeCompare(b.id));
          return {
            selectedElements: sorted,
            selectedElement: sorted[0] ?? null,
            propertyGridOpen: sorted.length > 0 || state.propertyGridOpen,
          };
        }),

      // Iteracja 12: toggle (Ctrl+click) — dodaj/usuń element z multi-selection.
      toggleElement: (element) =>
        set((state) => {
          const exists = state.selectedElements.some((e) => e.id === element.id);
          const next = exists
            ? state.selectedElements.filter((e) => e.id !== element.id)
            : [...state.selectedElements, element].sort((a, b) => a.id.localeCompare(b.id));
          return {
            selectedElements: next,
            selectedElement: next[0] ?? null,
            propertyGridOpen: next.length > 0 || state.propertyGridOpen,
          };
        }),

      // Iteracja 12: extend (Shift+click) — dodaje element do selekcji bez usuwania.
      extendSelection: (element) =>
        set((state) => {
          if (state.selectedElements.some((e) => e.id === element.id)) {
            return state;
          }
          const next = [...state.selectedElements, element].sort((a, b) =>
            a.id.localeCompare(b.id),
          );
          return {
            selectedElements: next,
            selectedElement: next[0] ?? null,
            propertyGridOpen: next.length > 0 || state.propertyGridOpen,
          };
        }),

      // Iteracja 12: usuwa konkretny element z multi-selection.
      removeFromSelection: (elementId) =>
        set((state) => {
          const next = state.selectedElements.filter((e) => e.id !== elementId);
          return {
            selectedElements: next,
            selectedElement: next[0] ?? null,
          };
        }),

      getMultiSelection: () => {
        const state = get();
        if (state.selectedElements.length === 0) {
          return null;
        }

        const firstType = state.selectedElements[0].type;
        const allSameType = state.selectedElements.every((element) => element.type === firstType);

        return {
          elements: state.selectedElements,
          commonType: allSameType ? firstType : null,
        };
      },

      setMode: (mode) =>
        set(() => ({
          mode: normalizeOperatingMode(mode),
          resultStatus: normalizeOperatingMode(mode) === 'MODEL_EDIT' ? 'OUTDATED' : 'NONE',
        })),

      setResultStatus: (resultStatus) => set(() => ({ resultStatus })),

      togglePropertyGrid: (open) =>
        set((state) => ({
          propertyGridOpen: open !== undefined ? open : !state.propertyGridOpen,
        })),

      expandTreeNode: (nodeId) =>
        set((state) => {
          const expanded = new Set(state.treeExpandedNodes);
          expanded.add(nodeId);
          return { treeExpandedNodes: expanded };
        }),

      collapseTreeNode: (nodeId) =>
        set((state) => {
          const expanded = new Set(state.treeExpandedNodes);
          expanded.delete(nodeId);
          return { treeExpandedNodes: expanded };
        }),

      centerSldOnElement: (elementId) => set(() => ({ sldCenterOnElement: elementId })),

      clearSelection: () =>
        set(() => ({
          selectedElements: [],
          selectedElement: null,
          sldCenterOnElement: null,
        })),
    }),
    {
      name: 'mv-design-selection-store',
      partialize: (state) => ({
        treeExpandedNodes: state.treeExpandedNodes,
        propertyGridOpen: state.propertyGridOpen,
      }),
      storage: {
        getItem: (name) => {
          const stored = localStorage.getItem(name);
          if (!stored) {
            return null;
          }
          const parsed = JSON.parse(stored);
          if (parsed.state?.treeExpandedNodes) {
            parsed.state.treeExpandedNodes = new Set(parsed.state.treeExpandedNodes);
          }
          return parsed;
        },
        setItem: (name, value) => {
          const serialized = {
            ...value,
            state: {
              ...value.state,
              treeExpandedNodes: value.state?.treeExpandedNodes
                ? Array.from(value.state.treeExpandedNodes)
                : [],
            },
          };
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

export function useCanEdit(): boolean {
  const mode = useSelectionStore((state) => state.mode);
  return mode === 'MODEL_EDIT';
}

export function useIsMutationBlocked(): boolean {
  const mode = useSelectionStore((state) => state.mode);
  return mode === 'RESULT_VIEW';
}

export function useModeLabel(): string {
  const mode = useSelectionStore((state) => state.mode);
  return getOperatingModeLabel(mode);
}

export function useResultStatusLabel(): string {
  const status = useSelectionStore((state) => state.resultStatus);
  switch (status) {
    case 'NONE':
      return 'Brak wynikow';
    case 'FRESH':
      return 'Wyniki aktualne';
    case 'OUTDATED':
      return 'Wyniki nieaktualne';
    default:
      return status;
  }
}

export function useIsResultViewMode(): boolean {
  return useSelectionStore((state) => state.mode === 'RESULT_VIEW');
}

export function useIsOverlayAllowed(): boolean {
  return useSelectionStore((state) => state.mode === 'RESULT_VIEW' && state.resultStatus === 'FRESH');
}

export function useCanEnterResultView(): boolean {
  return useSelectionStore((state) => state.resultStatus === 'FRESH');
}

export function useBlockedActionMessage(): string | null {
  const mode = useSelectionStore((state) => state.mode);
  if (mode === 'RESULT_VIEW') {
    return 'Edycja zablokowana w analizie i wynikach. Wroc do modelu sieci.';
  }
  return null;
}

export function useContextMenuConfig(): {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewProperties: boolean;
  canViewResults: boolean;
} {
  const mode = useSelectionStore((state) => state.mode);

  if (mode === 'RESULT_VIEW') {
    return {
      canAdd: false,
      canEdit: false,
      canDelete: false,
      canViewProperties: true,
      canViewResults: true,
    };
  }

  return {
    canAdd: true,
    canEdit: true,
    canDelete: true,
    canViewProperties: true,
    canViewResults: false,
  };
}

export function usePropertyGridEditable(): boolean {
  return useSelectionStore((state) => state.mode === 'MODEL_EDIT');
}

export function useMultiSelection(): MultiSelection | null {
  return useSelectionStore((state) => state.getMultiSelection());
}

export function useSelectedElements(): SelectedElement[] {
  return useSelectionStore((state) => state.selectedElements);
}
