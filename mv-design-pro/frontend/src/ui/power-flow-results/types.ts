/**
 * P20b — Power Flow Results Inspector Types (Frontend)
 *
 * CANONICAL ALIGNMENT:
 * - Matches backend DTOs from P20a power_flow_runs.py
 * - SYSTEM_SPEC.md: READ-ONLY result display
 * - wizard_screens.md: RESULT_VIEW mode
 * - ui_canonical_parity.md: Deterministic sorting
 *
 * RULES (BINDING):
 * - These types are READ-ONLY views of backend data
 * - No physics calculations in frontend
 * - Polish labels for UI display
 */

import type { AnalysisCaseContext, ExportArtifact } from '../shared/analysisCaseContext';
import type { AnalysisInputMetadata } from '../results-inspector/analysisCaseContextView';
import type { ExportPolicy } from '../results-inspector/types';

// =============================================================================
// Run Header
// =============================================================================

/**
 * Power flow run header metadata.
 */
export interface PowerFlowRunHeader {
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
  analysis_case_context?: AnalysisCaseContext | null;
  proof_pack_ref?: string | null;
  export_artifact?: ExportArtifact | null;
  export_policy?: ExportPolicy | null;
  input_metadata?: AnalysisInputMetadata | null;
}

/**
 * Power flow run list response.
 */
export interface PowerFlowRunListResponse {
  runs: PowerFlowRunHeader[];
  total: number;
}

// =============================================================================
// Bus Results (Szyny)
// =============================================================================

/**
 * Single bus result row from PowerFlowResultV1.
 */
export interface PowerFlowBusResult {
  bus_id: string;
  v_pu: number;
  angle_deg: number;
  p_injected_mw: number;
  q_injected_mvar: number;
}

// =============================================================================
// Branch Results (Galezie)
// =============================================================================

/**
 * Single branch result row from PowerFlowResultV1.
 */
export interface PowerFlowBranchResult {
  branch_id: string;
  p_from_mw: number;
  q_from_mvar: number;
  p_to_mw: number;
  q_to_mvar: number;
  losses_p_mw: number;
  losses_q_mvar: number;
}

// =============================================================================
// Summary (Podsumowanie)
// =============================================================================

/**
 * Power flow summary.
 */
export interface PowerFlowSummary {
  total_losses_p_mw: number;
  total_losses_q_mvar: number;
  min_v_pu: number;
  max_v_pu: number;
  slack_p_mw: number;
  slack_q_mvar: number;
}

// =============================================================================
// Full Result (PowerFlowResultV1)
// =============================================================================

/**
 * Complete power flow result (PowerFlowResultV1 from backend).
 */
export interface PowerFlowResultV1 {
  result_version: string;
  converged: boolean;
  iterations_count: number;
  tolerance_used: number;
  base_mva: number;
  slack_bus_id: string;
  bus_results: PowerFlowBusResult[];
  branch_results: PowerFlowBranchResult[];
  summary: PowerFlowSummary;
}

// =============================================================================
// Trace (Slad obliczen)
// =============================================================================

/**
 * Single iteration trace from Newton-Raphson solver.
 */
export interface PowerFlowIterationTrace {
  k: number;
  norm_mismatch: number;
  max_mismatch_pu: number;
  mismatch_per_bus?: Record<string, { delta_p_pu: number; delta_q_pu: number }>;
  jacobian_size?: { rows: number; cols: number };
  pv_to_pq_switches?: string[];
  cause_if_failed?: string | null;
}

/**
 * Complete power flow trace (PowerFlowTrace from backend).
 */
export interface PowerFlowTrace {
  solver_version: string;
  input_hash: string;
  snapshot_id: string | null;
  case_id: string | null;
  run_id: string;
  init_state: Record<string, { v_pu: number; theta_rad: number }>;
  init_method: string;
  tolerance: number;
  max_iterations: number;
  base_mva: number;
  slack_bus_id: string;
  pq_bus_ids: string[];
  pv_bus_ids: string[];
  ybus_trace?: Record<string, unknown>;
  iterations: PowerFlowIterationTrace[];
  converged: boolean;
  final_iterations_count: number;
}

// =============================================================================
// UI State Types
// =============================================================================

/**
 * Active tab in Power Flow Results Inspector.
 * P22: Added INTERPRETATION tab.
 */
export type PowerFlowResultsTab = 'BUSES' | 'BRANCHES' | 'SUMMARY' | 'TRACE' | 'INTERPRETATION';

/**
 * SLD Overlay display mode for Load Flow results.
 *
 * INVARIANTS:
 * - No implicit default — must be explicitly selected
 * - Each mode determines which data is shown on the overlay
 * - Token-only coloring (no hex colors, no hardcoded thresholds in UI)
 */
export type LoadFlowOverlayMode = 'voltage' | 'loading' | 'flow';

/**
 * Polish labels for overlay modes.
 */
export const LOAD_FLOW_OVERLAY_MODE_LABELS: Record<LoadFlowOverlayMode, string> = {
  voltage: 'Napięcia',
  loading: 'Obciążenie',
  flow: 'Kierunek przepływu',
};

/**
 * Polish tab labels.
 * P22: Added Interpretacja tab.
 */
export const POWER_FLOW_TAB_LABELS: Record<PowerFlowResultsTab, string> = {
  BUSES: 'Szyny',
  BRANCHES: 'Gałęzie',
  SUMMARY: 'Podsumowanie',
  TRACE: 'Ślad obliczeń',
  INTERPRETATION: 'Interpretacja',
};

/**
 * Result status labels (Polish).
 */
export const RESULT_STATUS_LABELS: Record<string, string> = {
  NONE: 'Brak wyników',
  FRESH: 'Wyniki aktualne',
  VALID: 'Wyniki aktualne',
  OUTDATED: 'Wyniki nieaktualne',
};

/**
 * Result status severity for visual indication.
 */
export const RESULT_STATUS_SEVERITY: Record<string, 'info' | 'success' | 'warning'> = {
  NONE: 'info',
  FRESH: 'success',
  VALID: 'success',
  OUTDATED: 'warning',
};

/**
 * Convergence status labels (Polish).
 */
export const CONVERGENCE_LABELS: Record<string, string> = {
  true: 'Zbieżny',
  false: 'Niezbieżny',
};

// =============================================================================
// P22: Power Flow Interpretation Types
// =============================================================================

/**
 * Finding severity level.
 * INFO: |V - 1.0| < 2%
 * WARN: 2-5%
 * HIGH: >5%
 */
export type FindingSeverity = 'INFO' | 'WARN' | 'HIGH';

/**
 * Voltage finding for a single bus.
 */
export interface VoltageFinding {
  bus_id: string;
  v_pu: number;
  deviation_pct: number;
  severity: FindingSeverity;
  description_pl: string;
  evidence_ref: string;
}

/**
 * Branch loading finding for a single branch.
 */
export interface BranchLoadingFinding {
  branch_id: string;
  loading_pct: number | null;
  losses_p_mw: number;
  losses_q_mvar: number;
  severity: FindingSeverity;
  description_pl: string;
  evidence_ref: string;
}

/**
 * Ranked item in interpretation summary.
 */
export interface InterpretationRankedItem {
  rank: number;
  element_type: 'voltage' | 'branch_loading';
  element_id: string;
  severity: FindingSeverity;
  magnitude: number;
  description_pl: string;
}

/**
 * Interpretation summary with ranking.
 */
export interface InterpretationSummary {
  total_voltage_findings: number;
  total_branch_findings: number;
  high_count: number;
  warn_count: number;
  info_count: number;
  top_issues: InterpretationRankedItem[];
}

/**
 * Interpretation thresholds (BINDING).
 */
export interface InterpretationThresholds {
  voltage_info_max_pct: number;
  voltage_warn_max_pct: number;
  branch_loading_info_max_pct: number | null;
  branch_loading_warn_max_pct: number | null;
}

/**
 * Interpretation trace for auditability.
 */
export interface InterpretationTrace {
  interpretation_id: string;
  power_flow_run_id: string;
  created_at: string;
  thresholds: InterpretationThresholds;
  rules_applied: string[];
  data_sources: string[];
  interpretation_version: string;
}

/**
 * Interpretation context.
 */
export interface InterpretationContext {
  project_name: string | null;
  case_name: string | null;
  run_timestamp: string | null;
  snapshot_id: string | null;
}

/**
 * Complete power flow interpretation result.
 */
export interface PowerFlowInterpretation {
  context: InterpretationContext | null;
  voltage_findings: VoltageFinding[];
  branch_findings: BranchLoadingFinding[];
  summary: InterpretationSummary;
  trace: InterpretationTrace;
}

/**
 * Severity labels (Polish).
 */
export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  INFO: 'Informacja',
  WARN: 'Ostrzeżenie',
  HIGH: 'Istotny problem',
};

/**
 * Severity colors for UI.
 */
export const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  INFO: 'text-slate-600 bg-slate-100',
  WARN: 'text-amber-700 bg-amber-100',
  HIGH: 'text-rose-700 bg-rose-100',
};
