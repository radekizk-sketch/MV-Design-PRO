/**
 * Reference Networks UI Types
 *
 * Mirrors backend Pydantic models from /api/v1/reference-networks endpoints.
 */

export interface ReferenceNetworkSummary {
  id: string;
  name_pl: string;
  description_pl: string;
  source: string;
  voltage_kv: number;
  has_der: boolean;
  is_unbalanced: boolean;
  supported_solvers: string[];
}

export interface ReferenceNetworkDetail extends ReferenceNetworkSummary {
  bus_count: number;
  branch_count: number;
  has_pf_expected: boolean;
  has_sc_expected: boolean;
  has_dynamic_expected: boolean;
  expected_pf_count: number;
  expected_sc_count: number;
}

export interface ElementComparison {
  element_id: string;
  quantity: string;
  actual: number;
  expected: number;
  rtol: number;
  abs_diff: number;
  rel_diff: number;
  status: 'PASS' | 'FAIL';
  note: string;
}

export interface ValidationReport {
  network_id: string;
  network_name_pl: string;
  source: string;
  solver_version: string;
  overall_status: 'PASS' | 'FAIL';
  pf_comparisons: ElementComparison[];
  pf_branch_comparisons: ElementComparison[];
  sc_comparisons: ElementComparison[];
  pf_pass_count: number;
  pf_fail_count: number;
  pf_branch_pass_count: number;
  pf_branch_fail_count: number;
  sc_pass_count: number;
  sc_fail_count: number;
  trace_step_count: number;
}

export interface ValidationResponse {
  report: ValidationReport;
}

export interface RunResponse {
  network_id: string;
  solver_kind: string;
  success: boolean;
  result: Record<string, unknown>;
  error: string | null;
}

export interface SimilarityMatchScore {
  network_id: string;
  name_pl: string;
  confidence_pct: number;
  matched_features: string[];
}

export interface SimilarityMatchResponse {
  matches: SimilarityMatchScore[];
}

export interface NcRfgComplianceResponse {
  network_id: string;
  applicable: boolean;
  status: 'compliant' | 'audit_required' | 'non_compliant' | 'not_applicable';
  passed_count: number;
  total_count: number;
  missing_items: string[];
}
