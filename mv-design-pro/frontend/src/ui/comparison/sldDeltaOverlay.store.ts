/**
 * SC Comparison Store -- PR-21 (Zustand)
 *
 * State management for SC comparisons.
 * Deterministic sorting by created_at (descending).
 * Polish error messages. No heuristics.
 */

import { create } from 'zustand';
import type {
  SCComparison,
  CreateComparisonRequest,
} from './sldDeltaOverlay.types';
import * as api from './sldDeltaOverlay.api';

interface ComparisonState {
  // Data
  studyCaseId: string | null;
  comparisons: SCComparison[];
  selectedComparisonId: string | null;
  selectedComparison: SCComparison | null;

  // Loading states
  isLoading: boolean;
  isCreating: boolean;

  // Error
  error: string | null;

  // Actions
  setStudyCaseId: (studyCaseId: string) => void;
  loadComparisons: (studyCaseId: string) => Promise<void>;
  createComparison: (
    studyCaseId: string,
    request: CreateComparisonRequest
  ) => Promise<SCComparison>;
  selectComparison: (comparisonId: string | null) => void;
  loadComparisonDetail: (comparisonId: string) => Promise<void>;
  clearError: () => void;
}

export const useComparisonStore = create<ComparisonState>(
  (set, get) => ({
    // Initial state
    studyCaseId: null,
    comparisons: [],
    selectedComparisonId: null,
    selectedComparison: null,
    isLoading: false,
    isCreating: false,
    error: null,

    setStudyCaseId: (studyCaseId) => {
      set({ studyCaseId });
      get().loadComparisons(studyCaseId);
    },

    loadComparisons: async (studyCaseId) => {
      set({ isLoading: true, error: null });
      try {
        const response = await api.listComparisons(studyCaseId);
        // Sort by created_at descending -- deterministic
        const sorted = [...response.comparisons].sort(
          (a, b) => b.created_at.localeCompare(a.created_at)
        );
        set({ comparisons: sorted, isLoading: false });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Blad ladowania porownan';
        set({ error: message, isLoading: false });
      }
    },

    createComparison: async (studyCaseId, request) => {
      set({ isCreating: true, error: null });
      try {
        const comparison = await api.createComparison(studyCaseId, request);
        // Reload list
        const { studyCaseId: currentCaseId } = get();
        if (currentCaseId) {
          await get().loadComparisons(currentCaseId);
        }
        set({ isCreating: false, selectedComparison: comparison, selectedComparisonId: comparison.comparison_id });
        return comparison;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Blad tworzenia porownania';
        set({ error: message, isCreating: false });
        throw err;
      }
    },

    selectComparison: (comparisonId) => {
      set({ selectedComparisonId: comparisonId });
      if (comparisonId) {
        get().loadComparisonDetail(comparisonId);
      } else {
        set({ selectedComparison: null });
      }
    },

    loadComparisonDetail: async (comparisonId) => {
      try {
        const comparison = await api.getComparison(comparisonId);
        set({ selectedComparison: comparison });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Blad ladowania szczegolow porownania';
        set({ error: message });
      }
    },

    clearError: () => set({ error: null }),
  })
);
