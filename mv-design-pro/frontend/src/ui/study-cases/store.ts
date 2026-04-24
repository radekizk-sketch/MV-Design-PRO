/**
 * Study Cases Store (Zustand) — P10 FULL MAX
 *
 * CANONICAL ALIGNMENT:
 * - P10: Study Cases / Variants (Canonical-grade)
 * - SYSTEM_SPEC.md: Operating modes and result lifecycle
 *
 * STATE MANAGEMENT:
 * - Maintains list of study cases for current project
 * - Tracks active case (exactly one per project)
 * - Syncs result status with backend
 * - Enables/disables calculate button based on active case
 *
 * INVARIANTS:
 * - One active case per project
 * - Result status: NONE → FRESH → OUTDATED
 * - Case config never mutates NetworkModel
 */

import { create } from 'zustand';
import type {
  StudyCase,
  StudyCaseListItem,
  StudyCaseComparison,
  StudyCaseResultStatus,
  CreateStudyCaseRequest,
  UpdateStudyCaseRequest,
} from './types';
import * as api from './api';

/**
 * Study cases store state.
 */
interface StudyCasesState {
  // Current project ID
  projectId: string | null;

  // List of study cases for current project
  cases: StudyCaseListItem[];

  // Currently active case (full details)
  activeCase: StudyCase | null;

  // Selected case for editing (if different from active)
  selectedCaseId: string | null;

  // Comparison state
  comparisonResult: StudyCaseComparison | null;
  comparisonCaseIds: [string, string] | null;

  // Loading states
  isLoading: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  isCloning: boolean;
  isActivating: boolean;
  isComparing: boolean;

  // Error state
  error: string | null;

  // Actions
  setProjectId: (projectId: string) => void;
  loadCases: (projectId: string) => Promise<void>;
  createCase: (request: CreateStudyCaseRequest) => Promise<StudyCase>;
  updateCase: (caseId: string, request: UpdateStudyCaseRequest) => Promise<StudyCase>;
  deleteCase: (caseId: string) => Promise<boolean>;
  cloneCase: (caseId: string, newName?: string) => Promise<StudyCase>;
  activateCase: (caseId: string) => Promise<StudyCase>;
  loadActiveCase: (projectId: string) => Promise<void>;
  compareCases: (caseAId: string, caseBId: string) => Promise<StudyCaseComparison>;
  clearComparison: () => void;
  invalidateAllCases: () => Promise<void>;
  selectCase: (caseId: string | null) => void;
  clearError: () => void;
}

/**
 * Zustand store for study cases.
 */
export const useStudyCasesStore = create<StudyCasesState>((set, get) => ({
  // Initial state
  projectId: null,
  cases: [],
  activeCase: null,
  selectedCaseId: null,
  comparisonResult: null,
  comparisonCaseIds: null,
  isLoading: false,
  isCreating: false,
  isDeleting: false,
  isCloning: false,
  isActivating: false,
  isComparing: false,
  error: null,

  /**
   * Set the current project ID and load cases.
   */
  setProjectId: (projectId) => {
    set({ projectId });
    get().loadCases(projectId);
    get().loadActiveCase(projectId);
  },

  /**
   * Load all cases for a project.
   */
  loadCases: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const cases = await api.listStudyCases(projectId);
      set({ cases, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd ładowania wariantów pracy';
      set({ error: message, isLoading: false });
    }
  },

  /**
   * Load the active case for a project.
   */
  loadActiveCase: async (projectId) => {
    try {
      const activeCase = await api.getActiveStudyCase(projectId);
      set({ activeCase });
    } catch (err) {
      // Ignore error - no active case is valid state
      set({ activeCase: null });
    }
  },

  /**
   * Create a new study case.
   */
  createCase: async (request) => {
    set({ isCreating: true, error: null });
    try {
      const newCase = await api.createStudyCase(request);
      const { projectId } = get();
      if (projectId) {
        await get().loadCases(projectId);
        if (newCase.is_active) {
          set({ activeCase: newCase });
        }
      }
      set({ isCreating: false });
      return newCase;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd tworzenia wariantu pracy';
      set({ error: message, isCreating: false });
      throw err;
    }
  },

  /**
   * Update a study case.
   */
  updateCase: async (caseId, request) => {
    set({ error: null });
    try {
      const updatedCase = await api.updateStudyCase(caseId, request);
      const { projectId, activeCase } = get();
      if (projectId) {
        await get().loadCases(projectId);
      }
      if (activeCase?.id === caseId) {
        set({ activeCase: updatedCase });
      }
      return updatedCase;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd aktualizacji wariantu pracy';
      set({ error: message });
      throw err;
    }
  },

  /**
   * Delete a study case.
   */
  deleteCase: async (caseId) => {
    set({ isDeleting: true, error: null });
    try {
      await api.deleteStudyCase(caseId);
      const { projectId, activeCase } = get();
      if (projectId) {
        await get().loadCases(projectId);
      }
      if (activeCase?.id === caseId) {
        set({ activeCase: null });
      }
      set({ isDeleting: false });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd usuwania wariantu pracy';
      set({ error: message, isDeleting: false });
      return false;
    }
  },

  /**
   * Clone a study case.
   */
  cloneCase: async (caseId, newName) => {
    set({ isCloning: true, error: null });
    try {
      const clonedCase = await api.cloneStudyCase(caseId, newName);
      const { projectId } = get();
      if (projectId) {
        await get().loadCases(projectId);
      }
      set({ isCloning: false });
      return clonedCase;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd klonowania wariantu pracy';
      set({ error: message, isCloning: false });
      throw err;
    }
  },

  /**
   * Set a case as active.
   */
  activateCase: async (caseId) => {
    const { projectId } = get();
    if (!projectId) {
      throw new Error('Brak aktywnego projektu');
    }

    set({ isActivating: true, error: null });
    try {
      const activatedCase = await api.setActiveStudyCase(projectId, caseId);
      await get().loadCases(projectId);
      set({ activeCase: activatedCase, isActivating: false });
      return activatedCase;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd aktywacji wariantu pracy';
      set({ error: message, isActivating: false });
      throw err;
    }
  },

  /**
   * Compare two study cases.
   */
  compareCases: async (caseAId, caseBId) => {
    set({ isComparing: true, error: null, comparisonCaseIds: [caseAId, caseBId] });
    try {
      const comparison = await api.compareStudyCases(caseAId, caseBId);
      set({ comparisonResult: comparison, isComparing: false });
      return comparison;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd porównywania wariantów pracy';
      set({ error: message, isComparing: false });
      throw err;
    }
  },

  /**
   * Clear comparison state.
   */
  clearComparison: () => {
    set({ comparisonResult: null, comparisonCaseIds: null });
  },

  /**
   * Invalidate all cases in the project (mark as OUTDATED).
   * Called when NetworkModel changes.
   */
  invalidateAllCases: async () => {
    const { projectId } = get();
    if (!projectId) return;

    try {
      await api.invalidateAllCases(projectId);
      await get().loadCases(projectId);
      await get().loadActiveCase(projectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd oznaczania wariantów pracy';
      set({ error: message });
    }
  },

  /**
   * Select a case for editing.
   */
  selectCase: (caseId) => {
    set({ selectedCaseId: caseId });
  },

  /**
   * Clear error state.
   */
  clearError: () => {
    set({ error: null });
  },
}));

// =============================================================================
// Derived Hooks
// =============================================================================

/**
 * Hook: Get the active case (if any).
 */
export function useActiveCase(): StudyCase | null {
  return useStudyCasesStore((state) => state.activeCase);
}

/**
 * Hook: Check if there's an active case.
 */
export function useHasActiveCase(): boolean {
  return useStudyCasesStore((state) => state.activeCase !== null);
}

/**
 * Hook: Get the result status of the active case.
 */
export function useActiveCaseResultStatus(): StudyCaseResultStatus | null {
  return useStudyCasesStore((state) => state.activeCase?.result_status ?? null);
}

/**
 * Hook: Get count of study cases.
 */
export function useCasesCount(): number {
  return useStudyCasesStore((state) => state.cases.length);
}

/**
 * Hook: Check if cases are loading.
 */
export function useIsLoading(): boolean {
  return useStudyCasesStore((state) => state.isLoading);
}

/**
 * Hook: Get result status label in Polish.
 */
export function useActiveCaseStatusLabel(): string {
  const status = useActiveCaseResultStatus();
  if (!status) return 'Brak aktywnego wariantu pracy';

  switch (status) {
    case 'NONE':
      return 'Brak wyników';
    case 'FRESH':
      return 'Wyniki aktualne';
    case 'OUTDATED':
      return 'Wyniki nieaktualne — wymagane przeliczenie';
    default:
      return status;
  }
}

/**
 * PR-4: Hook — Are active case results valid for use/export?
 *
 * Returns true ONLY when result_status === 'FRESH'.
 * UI MUST check this before allowing result access or export.
 */
export function useActiveCaseResultsValid(): boolean {
  return useStudyCasesStore(
    (state) => state.activeCase?.results_valid ?? false
  );
}

/**
 * Hook: Get cases sorted by name.
 */
export function useSortedCases(): StudyCaseListItem[] {
  return useStudyCasesStore((state) =>
    [...state.cases].sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  );
}
