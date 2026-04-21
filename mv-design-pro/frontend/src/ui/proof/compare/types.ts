/**
 * Typy dla porównania śladów obliczeń (Trace Comparison)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Porównanie Case/Run A vs B
 * - SYSTEM_SPEC.md: READ-ONLY result display
 * - UI 100% po polsku
 *
 * RULES (BINDING):
 * - READ-ONLY: Porównujemy tylko teksty/stringi źródłowe
 * - Brak obliczeń w UI (żadnych przeliczeń wartości)
 * - Deterministyczny algorytm (klucz: key → step → index)
 */

import type { TraceStep } from '../../results-inspector/types';

// =============================================================================
// Diff Status
// =============================================================================

/**
 * Status różnicy dla kroku śladu.
 */
export type TraceDiffStatus =
  | 'UNCHANGED'  // Bez zmian
  | 'CHANGED'    // Zmieniono
  | 'ADDED'      // Tylko w B (dodany)
  | 'REMOVED';   // Tylko w A (usunięty)

/**
 * Polskie etykiety dla statusu diff.
 */
export const TRACE_DIFF_STATUS_LABELS: Record<TraceDiffStatus, string> = {
  UNCHANGED: 'Bez zmian',
  CHANGED: 'Zmieniono',
  ADDED: 'Dodano',
  REMOVED: 'Usunięto',
};

/**
 * Tailwind classes dla statusu diff.
 */
export const TRACE_DIFF_STATUS_COLORS: Record<TraceDiffStatus, string> = {
  UNCHANGED: 'bg-slate-50 text-slate-600',
  CHANGED: 'bg-amber-50 text-amber-700',
  ADDED: 'bg-green-50 text-green-700',
  REMOVED: 'bg-red-50 text-red-700',
};

/**
 * Tailwind border colors dla statusu diff.
 */
export const TRACE_DIFF_STATUS_BORDER: Record<TraceDiffStatus, string> = {
  UNCHANGED: 'border-slate-200',
  CHANGED: 'border-amber-300',
  ADDED: 'border-green-300',
  REMOVED: 'border-red-300',
};

// =============================================================================
// Field Diff
// =============================================================================

/**
 * Zmiana w pojedynczym polu kroku.
 */
export interface TraceFieldDiff {
  field: string;
  label_pl: string;
  value_a: string | null;
  value_b: string | null;
  is_changed: boolean;
}

// =============================================================================
// Step Diff
// =============================================================================

/**
 * Porównanie pojedynczego kroku śladu.
 *
 * Klucz kroku (determinizm):
 * 1. Jeśli step.key istnieje → użyj key
 * 2. Jeśli step.step istnieje → użyj "step_<step>"
 * 3. Fallback → użyj indeksu "idx_<index>"
 */
export interface TraceDiffStep {
  /**
   * Stabilny klucz identyfikujący krok.
   * Używany do dopasowania kroków między A i B.
   */
  step_key: string;

  /**
   * Status różnicy.
   */
  status: TraceDiffStatus;

  /**
   * Krok z trace A (null jeśli ADDED).
   */
  step_a: TraceStep | null;

  /**
   * Indeks kroku w trace A (null jeśli ADDED).
   */
  index_a: number | null;

  /**
   * Krok z trace B (null jeśli REMOVED).
   */
  step_b: TraceStep | null;

  /**
   * Indeks kroku w trace B (null jeśli REMOVED).
   */
  index_b: number | null;

  /**
   * Lista zmian w polach (tylko gdy CHANGED).
   */
  field_diffs: TraceFieldDiff[];

  /**
   * Tytuł kroku do wyświetlenia.
   * Bierze z A jeśli dostępne, inaczej z B.
   */
  display_title: string;

  /**
   * Numer kroku do wyświetlenia.
   */
  display_step: number | null;

  /**
   * Faza kroku (INITIALIZATION, CALCULATION, etc.)
   */
  phase: string | null;
}

// =============================================================================
// Comparison Result
// =============================================================================

/**
 * Metadane trace dla porównania.
 */
export interface TraceCompareMetadata {
  run_id: string;
  snapshot_id: string | null;
  input_hash: string;
  step_count: number;
}

/**
 * Podsumowanie porównania.
 */
export interface TraceDiffSummary {
  total_steps: number;
  unchanged_count: number;
  changed_count: number;
  added_count: number;
  removed_count: number;
}

/**
 * Pełny wynik porównania śladów obliczeń.
 */
export interface TraceComparisonResult {
  /**
   * Metadane trace A.
   */
  metadata_a: TraceCompareMetadata;

  /**
   * Metadane trace B.
   */
  metadata_b: TraceCompareMetadata;

  /**
   * Lista porównań kroków (deterministycznie posortowana).
   */
  steps: TraceDiffStep[];

  /**
   * Podsumowanie zmian.
   */
  summary: TraceDiffSummary;

  /**
   * Timestamp porównania (ISO).
   */
  compared_at: string;
}

// =============================================================================
// Filter Options
// =============================================================================

/**
 * Filtr dla wyświetlania diff.
 */
export type TraceDiffFilter =
  | 'ALL'        // Wszystkie
  | 'CHANGES'    // Tylko zmiany (CHANGED + ADDED + REMOVED)
  | 'CHANGED'    // Tylko zmienione
  | 'ADDED'      // Tylko dodane
  | 'REMOVED';   // Tylko usunięte

/**
 * Polskie etykiety dla filtrów.
 */
export const TRACE_DIFF_FILTER_LABELS: Record<TraceDiffFilter, string> = {
  ALL: 'Wszystkie',
  CHANGES: 'Tylko zmiany',
  CHANGED: 'Zmienione',
  ADDED: 'Dodane',
  REMOVED: 'Usunięte',
};

// =============================================================================
// Export Types
// =============================================================================

/**
 * Struktura eksportu JSON.
 */
export interface TraceDiffExport {
  version: '1.0';
  export_type: 'trace_comparison';
  exported_at: string;
  metadata_a: TraceCompareMetadata;
  metadata_b: TraceCompareMetadata;
  summary: TraceDiffSummary;
  steps: TraceDiffStep[];
}
