/**
 * P11c — Results Comparison Types (Frontend)
 *
 * CANONICAL ALIGNMENT:
 * - CASE_COMPARISON_UI_CONTRACT.md: Case A vs B comparison
 * - RESULTS_BROWSER_CONTRACT.md: Run history and filtering
 * - Matches backend DTOs from application/comparison/
 *
 * RULES (BINDING):
 * - These types are READ-ONLY views of backend comparison data
 * - No physics calculations in frontend
 * - Polish labels for UI display
 * - 100% deterministic (same inputs → same outputs)
 */

// =============================================================================
// Numeric Delta (from backend)
// =============================================================================

/**
 * Numeric delta between two values.
 * Backend: domain/results.py → NumericDelta
 */
export interface NumericDelta {
  value_a: number;
  value_b: number;
  delta: number; // value_b - value_a
  percent: number | null; // ((value_b - value_a) / value_a) * 100
  sign: number; // -1, 0, +1
}

// =============================================================================
// Complex Delta (for impedance, power)
// =============================================================================

/**
 * Complex delta between two complex values.
 * Backend: domain/results.py → ComplexDelta
 */
export interface ComplexDelta {
  re_a: number;
  im_a: number;
  re_b: number;
  im_b: number;
  delta_re: number;
  delta_im: number;
  magnitude_a: number;
  magnitude_b: number;
  delta_magnitude: number;
  percent_magnitude: number | null;
}

// =============================================================================
// Short Circuit Comparison
// =============================================================================

/**
 * Short circuit comparison (IEC 60909).
 * Backend: domain/results.py → ShortCircuitComparison
 */
export interface ShortCircuitComparison {
  ikss_delta: NumericDelta;
  sk_delta: NumericDelta;
  zth_delta: ComplexDelta;
  ip_delta: NumericDelta;
  ith_delta: NumericDelta;
  /**
   * Addytywne delty pełnego bilansu IEC 60909 (karta S-C, 2026-07-22):
   * X/R oraz I²t [kA²s]; null dla starszych wyników bez pól źródłowych
   * (uczciwy brak — delty Rk/Xk/|Zk| niesie zth_delta).
   */
  xr_ratio_delta?: NumericDelta | null;
  i2t_delta?: NumericDelta | null;
}

// =============================================================================
// Power Flow Comparison
// =============================================================================

/**
 * Bus voltage comparison (per-bus).
 * Backend: domain/results.py → BusVoltageComparison
 */
export interface BusVoltageComparison {
  bus_id: string;
  u_kv_delta: NumericDelta;
  u_pu_delta: NumericDelta;
}

/** @deprecated Use BusVoltageComparison instead. */
export type NodeVoltageComparison = BusVoltageComparison;

/**
 * Branch power comparison (per-branch).
 * Backend: domain/results.py → BranchPowerComparison
 */
export interface BranchPowerComparison {
  branch_id: string;
  p_mw_delta: NumericDelta;
  q_mvar_delta: NumericDelta;
}

/**
 * Power flow comparison (aggregate + per-element).
 * Backend: domain/results.py → PowerFlowComparison
 */
export interface PowerFlowComparison {
  total_losses_p_delta: NumericDelta;
  total_losses_q_delta: NumericDelta;
  slack_p_delta: NumericDelta;
  slack_q_delta: NumericDelta;
  bus_voltages: BusVoltageComparison[]; // formerly node_voltages
  branch_powers: BranchPowerComparison[];
}

// =============================================================================
// Run Comparison Result (top-level)
// =============================================================================

/**
 * Full run comparison result.
 * Backend: domain/results.py → RunComparisonResult
 */
export interface RunComparisonResult {
  run_a_id: string;
  run_b_id: string;
  project_id: string;
  analysis_type: string;
  compared_at: string;
  short_circuit: ShortCircuitComparison | null;
  power_flow: PowerFlowComparison | null;
}

// =============================================================================
// Run History (for Results Browser tree)
// =============================================================================

/**
 * Single run in history list.
 * Used for displaying run history in Results Browser tree.
 */
export interface RunHistoryItem {
  run_id: string;
  case_id: string;
  case_name: string;
  snapshot_id: string | null;
  created_at: string;
  status: string;
  result_state: 'NONE' | 'FRESH' | 'OUTDATED';
  solver_kind: string; // 'PF', 'short_circuit_sn', etc.
  input_hash: string;
}

// =============================================================================
// UI State Types
// =============================================================================

/**
 * Status change classification for comparison UI.
 * Per CASE_COMPARISON_UI_CONTRACT.md § 3.3.2
 */
export type ComparisonStatusChange = 'IMPROVED' | 'REGRESSED' | 'NO_CHANGE';

/**
 * Polish labels for status change.
 */
export const COMPARISON_STATUS_LABELS: Record<ComparisonStatusChange, string> = {
  IMPROVED: 'Poprawa',
  REGRESSED: 'Pogorszenie',
  NO_CHANGE: 'Bez zmian',
};

/**
 * Colors for status change.
 * Per CASE_COMPARISON_UI_CONTRACT.md § 3.3.2
 */
export const COMPARISON_STATUS_COLORS: Record<ComparisonStatusChange, string> = {
  IMPROVED: 'bg-green-100 text-green-700',
  REGRESSED: 'bg-red-100 text-red-700',
  NO_CHANGE: 'bg-gray-50 text-gray-600',
};

/**
 * Element type for comparison table.
 */
export type ComparisonElementType = 'BUS' | 'BRANCH' | 'SHORT_CIRCUIT';

/**
 * Polish labels for element types in comparison.
 */
export const COMPARISON_ELEMENT_LABELS: Record<ComparisonElementType, string> = {
  BUS: 'Szyna',
  BRANCH: 'Gałąź',
  SHORT_CIRCUIT: 'Zwarcie',
};
