export type AnalysisCompletenessStatus =
  | 'complete'
  | 'partial'
  | 'failed'
  | 'not_applicable';

export interface AnalysisCaseReproducibility {
  solver_family?: string | null;
  solver_version?: string | null;
  method_version?: string | null;
  formula_set_version?: string | null;
  standard_basis_ref?: string | null;
  input_hash?: string | null;
  result_hash?: string | null;
  domain_model_version?: string | null;
  bay_contract_version?: string | null;
  results_contract_version?: string | null;
  proof_renderer_version?: string | null;
  catalog_snapshot_ref?: string | null;
  catalog_schema_version?: string | null;
  tolerance_policy_ref?: string | null;
  rounding_policy_ref?: string | null;
  quality_gate_policy_version?: string | null;
}

export interface AnalysisCaseContext {
  case_ref: string;
  case_kind?: string | null;
  rodzaj_przypadku?: string | null;
  snapshot_ref: string | null;
  variant_ref?: string | null;
  run_ref: string;
  proof_pack_ref: string;
  quality_gate: string;
  applicability_scope: string[];
  completeness: AnalysisCompletenessStatus;
  completeness_legacy?: string | null;
  missing_prerequisites: string[];
  assumptions?: Record<string, string | null | undefined>;
  lineage?: Record<string, string | null | undefined>;
  reproducibility: AnalysisCaseReproducibility;
}

export interface ExportArtifact {
  export_ref: string;
  export_kind: 'pdf' | 'docx' | 'csv' | 'xlsx' | 'json' | 'whitebox_package';
  analysis_case_ref: string | null;
  proof_pack_ref: string | null;
  result_hash: string | null;
  input_hash: string | null;
  generated_at: string;
  generated_by_version: string;
  completeness_status: AnalysisCompletenessStatus;
}

export const ANALYSIS_COMPLETENESS_LABELS: Record<AnalysisCompletenessStatus, string> = {
  complete: 'Pelny',
  partial: 'Czesciowy',
  failed: 'Nieudany',
  not_applicable: 'Nie dotyczy',
};

export const ANALYSIS_COMPLETENESS_BADGE_CLASS: Record<AnalysisCompletenessStatus, string> = {
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  partial: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  not_applicable: 'border-slate-200 bg-slate-100 text-slate-700',
};

export const QUALITY_GATE_LABELS: Record<string, string> = {
  G0: 'Gate G0',
  G1: 'Gate G1',
  G2: 'Gate G2',
  G3: 'Gate G3',
  G4: 'Gate G4',
};

export const QUALITY_GATE_BADGE_CLASS: Record<string, string> = {
  G0: 'border-rose-200 bg-rose-50 text-rose-700',
  G1: 'border-amber-200 bg-amber-50 text-amber-700',
  G2: 'border-amber-200 bg-amber-50 text-amber-700',
  G3: 'border-sky-200 bg-sky-50 text-sky-700',
  G4: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
