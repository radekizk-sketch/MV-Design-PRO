/**
 * P20c — Power Flow Comparison Types (Frontend)
 *
 * CANONICAL ALIGNMENT:
 * - P20c: Power Flow A/B Comparison
 * - Matches backend DTOs from domain/power_flow_comparison.py
 *
 * RULES (BINDING):
 * - These types are READ-ONLY views of backend comparison data
 * - No physics calculations in frontend
 * - Polish labels for UI display
 * - 100% deterministic (same inputs → same outputs)
 */

// =============================================================================
// Issue Types
// =============================================================================

/**
 * Issue codes for power flow comparison ranking.
 * Backend: domain/power_flow_comparison.py → PowerFlowIssueCode
 */
export type PowerFlowIssueCode =
  | 'NON_CONVERGENCE_CHANGE'
  | 'VOLTAGE_DELTA_HIGH'
  | 'ANGLE_SHIFT_HIGH'
  | 'LOSSES_INCREASED'
  | 'LOSSES_DECREASED'
  | 'SLACK_POWER_CHANGED';

/**
 * Polish labels for issue codes.
 */
export const ISSUE_CODE_LABELS: Record<PowerFlowIssueCode, string> = {
  NON_CONVERGENCE_CHANGE: 'Zmiana zbieznosci',
  VOLTAGE_DELTA_HIGH: 'Duza zmiana napiecia',
  ANGLE_SHIFT_HIGH: 'Duze przesuniecie kata',
  LOSSES_INCREASED: 'Wzrost strat',
  LOSSES_DECREASED: 'Spadek strat',
  SLACK_POWER_CHANGED: 'Zmiana mocy bilansowej',
};

/**
 * Severity levels (1-5).
 * Backend: domain/power_flow_comparison.py → PowerFlowIssueSeverity
 */
export type IssueSeverity = 1 | 2 | 3 | 4 | 5;

/**
 * Polish labels for severity levels.
 */
export const SEVERITY_LABELS: Record<IssueSeverity, string> = {
  1: 'Informacyjny',
  2: 'Niski',
  3: 'Umiarkowany',
  4: 'Wysoki',
  5: 'Krytyczny',
};

/**
 * Colors for severity levels (Tailwind classes).
 */
export const SEVERITY_COLORS: Record<IssueSeverity, string> = {
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-amber-100 text-amber-700',
  4: 'bg-orange-100 text-orange-700',
  5: 'bg-red-100 text-red-700',
};

// =============================================================================
// Bus Diff Row
// =============================================================================

/**
 * Single bus diff row.
 * Backend: domain/power_flow_comparison.py → PowerFlowBusDiffRow
 */
export interface PowerFlowBusDiffRow {
  bus_id: string;
  v_pu_a: number;
  v_pu_b: number;
  angle_deg_a: number;
  angle_deg_b: number;
  p_injected_mw_a: number;
  p_injected_mw_b: number;
  q_injected_mvar_a: number;
  q_injected_mvar_b: number;
  delta_v_pu: number;
  delta_angle_deg: number;
  delta_p_mw: number;
  delta_q_mvar: number;
}

// =============================================================================
// Branch Diff Row
// =============================================================================

/**
 * Single branch diff row.
 * Backend: domain/power_flow_comparison.py → PowerFlowBranchDiffRow
 */
export interface PowerFlowBranchDiffRow {
  branch_id: string;
  p_from_mw_a: number;
  p_from_mw_b: number;
  q_from_mvar_a: number;
  q_from_mvar_b: number;
  p_to_mw_a: number;
  p_to_mw_b: number;
  q_to_mvar_a: number;
  q_to_mvar_b: number;
  losses_p_mw_a: number;
  losses_p_mw_b: number;
  losses_q_mvar_a: number;
  losses_q_mvar_b: number;
  delta_p_from_mw: number;
  delta_q_from_mvar: number;
  delta_p_to_mw: number;
  delta_q_to_mvar: number;
  delta_losses_p_mw: number;
  delta_losses_q_mvar: number;
}

// =============================================================================
// Ranking Issue
// =============================================================================

/**
 * Single ranking issue.
 * Backend: domain/power_flow_comparison.py → PowerFlowRankingIssue
 */
export interface PowerFlowRankingIssue {
  issue_code: PowerFlowIssueCode;
  severity: IssueSeverity;
  element_ref: string;
  description_pl: string;
  evidence_ref: number;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Comparison summary statistics.
 * Backend: domain/power_flow_comparison.py → PowerFlowComparisonSummary
 */
export interface PowerFlowComparisonSummary {
  total_buses: number;
  total_branches: number;
  converged_a: boolean;
  converged_b: boolean;
  total_losses_p_mw_a: number;
  total_losses_p_mw_b: number;
  delta_total_losses_p_mw: number;
  max_delta_v_pu: number;
  max_delta_angle_deg: number;
  total_issues: number;
  critical_issues: number;
  major_issues: number;
  moderate_issues: number;
  minor_issues: number;
}

// =============================================================================
// Comparison Result (Full)
// =============================================================================

/**
 * Full power flow comparison result.
 * Backend: domain/power_flow_comparison.py → PowerFlowComparisonResult
 */
export interface PowerFlowComparisonResult {
  comparison_id: string;
  run_a_id: string;
  run_b_id: string;
  project_id: string;
  bus_diffs: PowerFlowBusDiffRow[];
  branch_diffs: PowerFlowBranchDiffRow[];
  ranking: PowerFlowRankingIssue[];
  summary: PowerFlowComparisonSummary;
  input_hash: string;
  created_at: string;
}

// =============================================================================
// Trace Types
// =============================================================================

/**
 * Single trace step.
 * Backend: domain/power_flow_comparison.py → PowerFlowComparisonTraceStep
 */
export interface PowerFlowComparisonTraceStep {
  step: string;
  description_pl: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

/**
 * Full comparison trace.
 * Backend: domain/power_flow_comparison.py → PowerFlowComparisonTrace
 */
export interface PowerFlowComparisonTrace {
  comparison_id: string;
  run_a_id: string;
  run_b_id: string;
  snapshot_id_a: string | null;
  snapshot_id_b: string | null;
  input_hash_a: string;
  input_hash_b: string;
  solver_version: string;
  ranking_thresholds: Record<string, number>;
  steps: PowerFlowComparisonTraceStep[];
  created_at: string;
}

// =============================================================================
// Power Flow Run (for selectors)
// =============================================================================

/**
 * Power flow run item for selector dropdowns.
 */
export interface PowerFlowRunItem {
  id: string;
  project_id: string;
  study_case_id: string;
  status: string;
  result_status: string;
  created_at: string;
  finished_at: string | null;
  input_hash: string;
  converged: boolean | null;
  iterations: number | null;
}

// =============================================================================
// UI State Types
// =============================================================================

/**
 * Active tab in Power Flow Comparison page.
 */
export type PowerFlowComparisonTab = 'BUSES' | 'BRANCHES' | 'RANKING' | 'TRACE';

/**
 * Polish tab labels.
 */
export const COMPARISON_TAB_LABELS: Record<PowerFlowComparisonTab, string> = {
  BUSES: 'Szyny - roznice',
  BRANCHES: 'Galezie - roznice',
  RANKING: 'Ranking problemow',
  TRACE: 'Slad porownania',
};

/**
 * Convergence status labels (Polish).
 */
export const CONVERGENCE_LABELS: Record<string, string> = {
  true: 'Zbiezny',
  false: 'Niezbiezny',
};

/**
 * Get delta color based on value.
 * Positive = rose (increase), Negative = green (decrease), Zero = gray
 */
export function getDeltaColor(value: number, threshold = 0): string {
  if (Math.abs(value) <= threshold) return 'text-slate-500';
  if (value > 0) return 'text-rose-600 font-medium';
  return 'text-green-600 font-medium';
}

/**
 * Get voltage delta color based on significance.
 */
export function getVoltageDeltaColor(deltaVPu: number): string {
  const absDelta = Math.abs(deltaVPu);
  if (absDelta >= 0.05) return 'bg-red-100 text-red-700';
  if (absDelta >= 0.02) return 'bg-orange-100 text-orange-700';
  if (absDelta >= 0.01) return 'bg-amber-100 text-amber-700';
  return '';
}
