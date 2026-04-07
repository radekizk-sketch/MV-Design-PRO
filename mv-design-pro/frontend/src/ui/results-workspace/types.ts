/**
 * Results Workspace Types — PR-22
 *
 * TypeScript types for unified results workspace.
 * Aligned with backend application/read_models/results_workspace_projection.py.
 * All labels in Polish. No project codenames.
 *
 * INVARIANTS:
 * - Read-only views of backend data
 * - No physics calculations
 * - Deterministic sorting (lexicographic)
 */

// =============================================================================
// Workspace Mode
// =============================================================================

/**
 * Active view mode in workspace.
 */
export type WorkspaceMode = 'RUN' | 'BATCH' | 'COMPARE';

/**
 * Polish labels for workspace modes.
 */
export const WORKSPACE_MODE_LABELS: Readonly<Record<WorkspaceMode, string>> = {
  RUN: 'Wyniki obliczeń',
  BATCH: 'Obliczenia wsadowe',
  COMPARE: 'Porównanie wyników',
} as const;

// =============================================================================
// Overlay Mode
// =============================================================================

/**
 * SLD overlay display mode.
 */
export type OverlayDisplayMode = 'result' | 'delta' | 'none';

/**
 * Polish labels for overlay modes.
 */
export const OVERLAY_MODE_LABELS: Readonly<Record<OverlayDisplayMode, string>> = {
  result: 'Wynik',
  delta: 'Różnice',
  none: 'Brak nakładki',
} as const;

// =============================================================================
// Snapshot Context Mode
// =============================================================================

export type SnapshotViewMode = 'RUN_SNAPSHOT' | 'CURRENT_MODEL';

export const SNAPSHOT_VIEW_MODE_LABELS: Readonly<Record<SnapshotViewMode, string>> = {
  RUN_SNAPSHOT: 'Migawka uruchomienia',
  CURRENT_MODEL: 'Model bieżący',
} as const;

// =============================================================================
// Run Summary
// =============================================================================

/**
 * Run status values.
 */
export type RunStatusValue = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

/**
 * Polish labels for run statuses.
 */
export const RUN_STATUS_LABELS: Readonly<Record<RunStatusValue, string>> = {
  PENDING: 'Oczekuje',
  RUNNING: 'W trakcie',
  DONE: 'Zakończone',
  FAILED: 'Niepowodzenie',
} as const;

/**
 * CSS styles for run status badges.
 */
export const RUN_STATUS_STYLES: Readonly<
  Record<RunStatusValue, { bg: string; text: string; border: string }>
> = {
  PENDING: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
  RUNNING: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300' },
  DONE: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
  FAILED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300' },
} as const;

/**
 * Run summary from workspace projection API.
 */
export interface RunSummary {
  run_id: string;
  analysis_type: string;
  status: RunStatusValue;
  solver_input_hash: string;
  created_at: string;
  finished_at: string | null;
  error_message: string | null;
}

// =============================================================================
// Batch Summary
// =============================================================================

/**
 * Batch status values.
 */
export type BatchStatusValue = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

/**
 * Polish labels for batch statuses.
 */
export const BATCH_STATUS_LABELS: Readonly<Record<BatchStatusValue, string>> = {
  PENDING: 'Oczekuje',
  RUNNING: 'W trakcie',
  DONE: 'Zakończone',
  FAILED: 'Niepowodzenie',
} as const;

/**
 * CSS styles for batch status badges.
 */
export const BATCH_STATUS_STYLES: Readonly<
  Record<BatchStatusValue, { bg: string; text: string; border: string }>
> = {
  PENDING: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
  RUNNING: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300' },
  DONE: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
  FAILED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300' },
} as const;

/**
 * Batch summary from workspace projection API.
 */
export interface BatchSummary {
  batch_id: string;
  analysis_type: string;
  status: BatchStatusValue;
  batch_input_hash: string;
  scenario_count: number;
  run_count: number;
  created_at: string;
  errors: string[];
}

// =============================================================================
// Comparison Summary
// =============================================================================

/**
 * Comparison summary from workspace projection API.
 */
export interface ComparisonSummary {
  comparison_id: string;
  analysis_type: string;
  base_scenario_id: string;
  other_scenario_id: string;
  input_hash: string;
  created_at: string;
}

// =============================================================================
// Workspace Projection
// =============================================================================

/**
 * Projection metadata from backend (PR-23).
 */
export interface ProjectionMetadata {
  projection_version: string;
  created_utc: string;
}

/**
 * Full workspace projection response from backend.
 *
 * PR-23 CONTRACT: This schema is FROZEN.
 * All fields are required. No dynamic fields allowed.
 */
export interface WorkspaceProjection {
  study_case_id: string;
  runs: RunSummary[];
  batches: BatchSummary[];
  comparisons: ComparisonSummary[];
  latest_done_run_id: string | null;
  deterministic_hash: string;
  content_hash: string;
  source_run_ids: string[];
  source_batch_ids: string[];
  source_comparison_ids: string[];
  metadata: ProjectionMetadata;
}

/**
 * PR-23: Required top-level keys in workspace projection response.
 * Used for contract validation in tests.
 */
export const WORKSPACE_PROJECTION_REQUIRED_KEYS: readonly string[] = [
  'study_case_id',
  'runs',
  'batches',
  'comparisons',
  'latest_done_run_id',
  'deterministic_hash',
  'content_hash',
  'source_run_ids',
  'source_batch_ids',
  'source_comparison_ids',
  'metadata',
] as const;

// =============================================================================
// Analysis Type Labels
// =============================================================================

/**
 * Polish labels for analysis types.
 */
export const ANALYSIS_TYPE_LABELS: Readonly<Record<string, string>> = {
  SC_3F: 'Zwarcie trójfazowe',
  SC_1F: 'Zwarcie jednofazowe',
  SC_2F: 'Zwarcie dwufazowe',
  LOAD_FLOW: 'Rozpływ mocy',
} as const;

/**
 * Get Polish label for analysis type.
 */
export function getAnalysisTypeLabel(type: string): string {
  return ANALYSIS_TYPE_LABELS[type] ?? type;
}

// =============================================================================
// URL State
// =============================================================================

/**
 * Workspace URL parameter keys.
 */
export const WORKSPACE_URL_PARAMS = {
  RUN: 'run',
  BATCH: 'batch',
  COMPARISON: 'comparison',
  OVERLAY: 'overlay',
  CONTEXT: 'context',
  SCENARIO: 'scenario',
} as const;

// =============================================================================
// Filter
// =============================================================================

/**
 * Workspace filter criteria.
 */
export type WorkspaceFilter =
  | 'ALL'
  | 'DONE'
  | 'FAILED'
  | 'SC_3F'
  | 'SC_2F'
  | 'SC_1F'
  | 'LOAD_FLOW';

/**
 * Polish labels for workspace filters.
 */
export const WORKSPACE_FILTER_LABELS: Readonly<Record<WorkspaceFilter, string>> = {
  ALL: 'Wszystkie',
  DONE: 'Zakończone',
  FAILED: 'Niepowodzenie',
  SC_3F: 'Zwarcie 3F',
  SC_2F: 'Zwarcie 2F',
  SC_1F: 'Zwarcie 1F',
  LOAD_FLOW: 'Rozpływ mocy',
} as const;
