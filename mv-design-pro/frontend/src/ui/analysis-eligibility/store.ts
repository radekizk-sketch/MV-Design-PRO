/**
 * Analysis Eligibility Store — PR-17
 *
 * Zustand store for Analysis Eligibility Matrix.
 * Fetches eligibility data from backend API.
 *
 * INVARIANTS:
 * - No auto-mutations (eligibility is read-only diagnostic)
 * - Deterministic: same ENM -> same eligibility state
 * - No physics, no solver calls
 */

import { create } from 'zustand';
import type {
  AnalysisEligibilityMatrixResponse,
  AnalysisEligibilityResult,
  EligibilityAnalysisType,
} from '../types';
import { normalizeAnalysisEligibilityResponse } from '../shared/fixActionSurfaceNormalizer';

// =============================================================================
// API Client
// =============================================================================

async function fetchAnalysisEligibility(
  caseId: string,
): Promise<AnalysisEligibilityMatrixResponse> {
  const response = await fetch(`/api/cases/${caseId}/analysis-eligibility`);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać macierzy eligibility: ${response.statusText}`);
  }
  return normalizeAnalysisEligibilityResponse(await response.json());
}

// =============================================================================
// Store Interface
// =============================================================================

interface AnalysisEligibilityState {
  // Data
  data: AnalysisEligibilityMatrixResponse | null;
  loading: boolean;
  error: string | null;

  // Actions
  load: (caseId: string) => Promise<void>;
  clear: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useAnalysisEligibilityStore = create<AnalysisEligibilityState>()(
  (set) => ({
    data: null,
    loading: false,
    error: null,

    load: async (caseId: string) => {
      set({ loading: true, error: null });
      try {
        const data = await fetchAnalysisEligibility(caseId);
        set({ data, loading: false });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'Nieznany błąd',
          loading: false,
          data: null,
        });
      }
    },

    clear: () => {
      set({ data: null, loading: false, error: null });
    },
  }),
);

// =============================================================================
// Derived Selectors
// =============================================================================

export function useEligibilityMatrix(): AnalysisEligibilityResult[] {
  return useAnalysisEligibilityStore((state) => state.data?.matrix ?? []);
}

export function useEligibilityForAnalysis(
  analysisType: EligibilityAnalysisType,
): AnalysisEligibilityResult | null {
  return useAnalysisEligibilityStore(
    (state) =>
      state.data?.matrix.find((r) => r.analysis_type === analysisType) ?? null,
  );
}

export function useIsAnalysisEligible(
  analysisType: EligibilityAnalysisType,
): boolean {
  return useAnalysisEligibilityStore(
    (state) =>
      state.data?.matrix.find((r) => r.analysis_type === analysisType)?.status ===
      'ELIGIBLE',
  );
}

export function useEligibilityOverall(): {
  eligible_any: boolean;
  eligible_all: boolean;
  blockers_total: number;
} {
  return useAnalysisEligibilityStore(
    (state) =>
      state.data?.overall ?? {
        eligible_any: false,
        eligible_all: false,
        blockers_total: 0,
      },
  );
}
