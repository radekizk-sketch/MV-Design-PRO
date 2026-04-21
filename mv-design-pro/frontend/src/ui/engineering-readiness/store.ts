/**
 * Engineering Readiness Store — PR-13
 *
 * Zustand store for Engineering Readiness Panel.
 * Fetches validation + readiness + fix_action data from backend.
 *
 * INVARIANTS:
 * - No auto-mutations (fix actions are declarative suggestions only)
 * - Deterministic: same ENM → same readiness state
 * - No physics, no solver calls
 */

import { create } from 'zustand';
import type {
  EngineeringReadinessResponse,
  ReadinessIssue,
  ReadinessSeverity,
} from '../types';
import { normalizeEngineeringReadinessResponse } from '../shared/fixActionSurfaceNormalizer';

// =============================================================================
// API Client
// =============================================================================

async function fetchEngineeringReadiness(
  caseId: string,
): Promise<EngineeringReadinessResponse> {
  const response = await fetch(`/api/cases/${caseId}/engineering-readiness`);
  if (!response.ok) {
    throw new Error(`Failed to fetch engineering readiness: ${response.statusText}`);
  }
  return normalizeEngineeringReadinessResponse(await response.json());
}

// =============================================================================
// Store Interface
// =============================================================================

interface EngineeringReadinessState {
  // Data
  data: EngineeringReadinessResponse | null;
  loading: boolean;
  error: string | null;

  // Actions
  load: (caseId: string) => Promise<void>;
  clear: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useEngineeringReadinessStore = create<EngineeringReadinessState>()(
  (set) => ({
    data: null,
    loading: false,
    error: null,

    load: async (caseId: string) => {
      set({ loading: true, error: null });
      try {
        const data = await fetchEngineeringReadiness(caseId);
        set({ data, loading: false });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'Unknown error',
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

export function useReadinessIssues(): ReadinessIssue[] {
  return useEngineeringReadinessStore((state) => state.data?.issues ?? []);
}

export function useReadinessStatus(): 'OK' | 'WARN' | 'FAIL' | null {
  return useEngineeringReadinessStore((state) => state.data?.status ?? null);
}

export function useReadinessReady(): boolean {
  return useEngineeringReadinessStore((state) => state.data?.ready ?? false);
}

export function useReadinessBySeverity(): Record<ReadinessSeverity, number> {
  return useEngineeringReadinessStore(
    (state) => state.data?.by_severity ?? { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
  );
}
