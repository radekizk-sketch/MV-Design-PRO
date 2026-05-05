/**
 * Results Lifecycle Store (Canonical-grade)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md Â§ B.2: Result freshness states
 * - SYSTEM_SPEC.md Â§ 5: Result lifecycle management
 *
 * STATE MACHINE:
 *   NONE → FRESH (po obliczeniach)
 *   FRESH → OUTDATED (mutacja modelu/topologii)
 *   OUTDATED → FRESH (po ponownych obliczeniach)
 *   Any → NONE (reset/nowy projekt)
 *
 * CANONICAL PARITY:
 * - Brak auto-run — jawny przycisk [Oblicz]
 * - Overlay wynikĂłw tylko dla FRESH
 * - KaĹĽda zmiana → OUTDATED
 */

import { create } from 'zustand';
import type { ResultStatus } from '../types';

/**
 * Result data structure (minimal, no solver details).
 */
export interface CalculationResult {
  calculationId: string;
  timestamp: string;
  snapshotId: string;
  analysisType?: 'SC_3F' | 'SC_1F' | 'LOAD_FLOW';
  elementCount?: number;
}

/**
 * Run history entry for tracking all past runs.
 */
export interface RunHistoryEntry {
  runId: string;
  analysisType: 'SC_3F' | 'SC_1F' | 'LOAD_FLOW';
  timestamp: string;
  status: 'FRESH' | 'OUTDATED';
  caseName: string;
}

/**
 * Results lifecycle state.
 */
interface ResultsState {
  // Current result status (NONE | FRESH | OUTDATED)
  status: ResultStatus;

  // Last calculation result (if any)
  lastResult: CalculationResult | null;

  // Selected run ID for results viewing
  selectedRunId: string | null;

  // Run history (all past runs, sorted newest first)
  runHistory: RunHistoryEntry[];

  // Validation state for [Oblicz] button
  isValidForCalculation: boolean;
  validationErrors: string[];

  // Calculation in progress
  isCalculating: boolean;

  // Actions
  markFresh: (result: CalculationResult) => void;
  markOutdated: () => void;
  reset: () => void;
  setValidation: (isValid: boolean, errors?: string[]) => void;
  setCalculating: (calculating: boolean) => void;
  selectRun: (runId: string | null) => void;
  addRunHistory: (entry: RunHistoryEntry) => void;
}

/**
 * Zustand store for results lifecycle.
 *
 * Usage:
 * ```tsx
 * const { status, markFresh, markOutdated } = useResultsStore();
 * ```
 */
export const useResultsStore = create<ResultsState>((set, _get) => ({
  // Initial state: no results
  status: 'NONE',
  lastResult: null,
  selectedRunId: null,
  runHistory: [],
  isValidForCalculation: false,
  validationErrors: [],
  isCalculating: false,

  /**
   * Mark results as FRESH after successful calculation.
   * Transition: NONE|OUTDATED → FRESH
   */
  markFresh: (result) =>
    set(() => ({
      status: 'FRESH',
      lastResult: result,
      isCalculating: false,
    })),

  /**
   * Mark results as OUTDATED after model mutation.
   * Transition: FRESH → OUTDATED
   * (NONE stays NONE — no results to invalidate)
   */
  markOutdated: () =>
    set((state) => ({
      status: state.status === 'NONE' ? 'NONE' : 'OUTDATED',
    })),

  /**
   * Reset to initial state (new project, clear results).
   * Transition: Any → NONE
   */
  reset: () =>
    set(() => ({
      status: 'NONE',
      lastResult: null,
      isCalculating: false,
    })),

  /**
   * Update validation state for [Oblicz] button.
   */
  setValidation: (isValid, errors = []) =>
    set(() => ({
      isValidForCalculation: isValid,
      validationErrors: errors,
    })),

  /**
   * Set calculation in progress state.
   */
  setCalculating: (calculating) =>
    set(() => ({
      isCalculating: calculating,
    })),

  /**
   * Select a specific run for viewing.
   */
  selectRun: (runId) =>
    set(() => ({
      selectedRunId: runId,
    })),

  /**
   * Add a run to history.
   * Maintains newest-first ordering (deterministic).
   */
  addRunHistory: (entry) =>
    set((state) => ({
      runHistory: [entry, ...state.runHistory],
    })),
}));

/**
 * Hook: Is overlay visible?
 * Overlay is visible ONLY when results are FRESH.
 */
export function useIsOverlayVisible(): boolean {
  return useResultsStore((state) => state.status === 'FRESH');
}

/**
 * Hook: Is [Oblicz] button enabled?
 * Enabled when: validation passes AND not currently calculating.
 */
export function useIsCalculateEnabled(): boolean {
  return useResultsStore(
    (state) => state.isValidForCalculation && !state.isCalculating
  );
}

/**
 * Hook: Get result status message (PF-like, Polish).
 */
export function useResultStatusMessage(): {
  message: string;
  severity: 'info' | 'warning' | 'success';
} {
  const status = useResultsStore((state) => state.status);

  switch (status) {
    case 'NONE':
      return {
        message: 'Brak wyników — uruchom obliczenia',
        severity: 'info',
      };
    case 'FRESH':
      return {
        message: 'Wyniki aktualne',
        severity: 'success',
      };
    case 'OUTDATED':
      return {
        message: 'Wyniki nieaktualne — wymagane ponowne obliczenie',
        severity: 'warning',
      };
  }
}

/**
 * Hook: Can enter RESULT_VIEW mode?
 * Only allowed when results are FRESH.
 */
export function useCanEnterResultView(): boolean {
  return useResultsStore((state) => state.status === 'FRESH');
}

/**
 * Hook: Get selected run ID for results viewing.
 */
export function useSelectedRunId(): string | null {
  return useResultsStore((state) => state.selectedRunId);
}

/**
 * Hook: Get run history.
 */
export function useRunHistory(): RunHistoryEntry[] {
  return useResultsStore((state) => state.runHistory);
}

/**
 * Hook: Get last analysis type.
 */
export function useLastAnalysisType(): string | null {
  return useResultsStore((state) => state.lastResult?.analysisType ?? null);
}

