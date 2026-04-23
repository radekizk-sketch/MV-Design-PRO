export const CANONICAL_ISSUE_CODES = [
  'surface.revision_conflict',
  'surface.parent_dirty',
  'surface.invalid_route',
  'surface.entity_deleted',
  'surface.context_changed',
  'surface.child_active',
  'surface.historical_record',
  'surface.migration_incomplete',
  'analysis.missing_z0',
  'analysis.missing_curve_family',
  'analysis.missing_ct_vt_ratio',
  'analysis.missing_fault_path',
  'analysis.missing_source_model',
  'analysis.missing_branch_mapping',
  'analysis.missing_device_rating',
  'analysis.missing_busbar_section',
  'analysis.missing_q_limits',
  'analysis.missing_prerequisite',
  'analysis.solver_cutoff_reached',
  'analysis.pqsi_inconsistent',
  'analysis.sc_chain_inconsistent',
  'analysis.rounding_policy_mismatch',
  'analysis.mixed_mv_lv_apparatus',
  'report.partial_confirmation_required',
  'report.blocked',
  'export.incomplete',
  'migration.failed',
  'migration.partial',
  'docs.archived_source_referenced',
  'quality.missing_lineage',
  'quality.missing_quality_dimension',
] as const;

export type AnalysisFamily =
  | 'short_circuit'
  | 'load_flow'
  | 'protection'
  | 'grid_code'
  | 'quality'
  | 'source_contributions'
  | 'thermal_dynamic'
  | 'report_bundle';

export type AnalysisSubcase =
  | 'sc_k3_max'
  | 'sc_k3_min'
  | 'sc_k2_max'
  | 'sc_k2_min'
  | 'sc_k1_max'
  | 'sc_k1_min'
  | 'sc_k2e_max'
  | 'sc_k2e_min'
  | 'pf_max_load'
  | 'pf_min_load'
  | 'pf_max_generation'
  | 'pf_min_generation'
  | 'protection_coordination'
  | 'symmetrical_components'
  | 'grid_code_compliance'
  | 'quality_audit'
  | 'source_contributions'
  | 'thermal_dynamic_verification'
  | 'load_flow_convergence'
  | 'report_bundle';

export type CaseInputReadinessStatus = 'blocked' | 'degraded' | 'ready';
export type RunExecutionStatus = 'not_run' | 'running' | 'failed' | 'succeeded' | 'not_applicable';
export type ResultCompletenessStatus = 'empty' | 'partial' | 'complete';
export type QualityGateLevel = 'blocked' | 'warning' | 'accepted';

export type CanonicalIssueCode = (typeof CANONICAL_ISSUE_CODES)[number];

export interface CanonicalIssue {
  code: CanonicalIssueCode;
  severity: 'info' | 'warning' | 'error' | 'blocking';
  messagePl: string;
  entityRef: string | null;
  fieldPath: string | null;
}

export interface CanonicalIssuePolicy {
  blocksAnalysis: boolean;
  blocksReport: boolean;
  blocksExport: boolean;
  allowedInPartial: boolean;
}

export interface ApplicabilityScope {
  kind:
    | 'whole_case'
    | 'selected_feeder'
    | 'selected_field'
    | 'selected_path'
    | 'selected_object'
    | 'report_bundle';
  entityRefs: string[];
}

export interface WhiteBoxBinding {
  proofPackRef: string;
  equationSetId: string;
  stepIds: string[];
  inputHash: string;
  resultHash: string | null;
  tolerancePolicyRef: string;
  roundingPolicyRef: string;
}

export interface EngineeringReasoningBinding {
  reasoningId: string;
  claims: string[];
  affectedResults: string[];
  qualityImpact: 'none' | 'low' | 'medium' | 'high';
  reportImpact: 'none' | 'low' | 'medium' | 'high';
  complianceImpact: 'none' | 'low' | 'medium' | 'high';
  settingsImpact: 'none' | 'low' | 'medium' | 'high';
}

export interface AnalysisCaseContext {
  caseRef: string;
  analysisFamily: AnalysisFamily;
  analysisSubcase: AnalysisSubcase;
  networkRevision: string;
  modelStateRef: string | null;
  variantRef: string | null;
  runRef: string | null;
  catalogSnapshotRef: string;
  tolerancePolicyRef: string;
  roundingPolicyRef: string;
  assumptionsSummaryRef: string;
  lineageRef: string;
  proofPackRef: string | null;
  inputReadiness: CaseInputReadinessStatus;
  applicabilityScope: ApplicabilityScope;
  missingPrerequisites: CanonicalIssue[];
  qualityGate: QualityGateLevel;
  qualityImpactSummary: CanonicalIssue[];
  inputHash: string;
  sourceRefs: string[];
  generatedAt: string;
  generatedByVersion: string;
  reproducibility: {
    solverFamily: string;
    solverVersion: string;
    methodVersion: string;
    formulaSetVersion: string;
    domainModelVersion: string;
    resultsContractVersion: string;
    proofRendererVersion: string;
  };
}

export interface SourceRevisionDescriptor {
  networkRevision: string;
  catalogRevision: string;
  assumptionsRevision: string;
  solverRevision: string;
  variantRevision: string | null;
  runRevision: string | null;
}

export interface RepairSurfaceDescriptor {
  targetScreen: string;
  targetEntityRef: string | null;
  targetTabId: string | null;
  focusFieldId: string | null;
  prefilledPayloadRef: string | null;
  openMode: 'replace' | 'push_child' | 'modal_blocking';
}

export interface ModuleResultEnvelope {
  moduleId: string;
  executionStatus: RunExecutionStatus;
  resultCompleteness: ResultCompletenessStatus;
  primaryEntityRef: string | null;
  affectedEntityRefs: string[];
  partialReasons: CanonicalIssue[];
  notApplicableReason: CanonicalIssue | null;
  failedReason: CanonicalIssue | null;
  inputHash: string;
  resultHash: string | null;
  sourceRevision: SourceRevisionDescriptor;
  whiteBoxBinding: WhiteBoxBinding | null;
  engineeringReasoningBinding: EngineeringReasoningBinding | null;
  repairSurface: RepairSurfaceDescriptor | null;
  exportPolicyKey: string;
  generatedAt: string;
  generatedByVersion: string;
}

export interface ModuleResult<TData> {
  contextRef: string;
  envelope: ModuleResultEnvelope;
  data: TData;
}

export interface CanonicalWriteRequestPreconditions {
  expectedEntityRef: string;
  expectedRevision: string;
  expectedLineageRef: string | null;
  expectedLeaseRef: string | null;
  expectedParentDraftRef: string | null;
  expectedCommitPolicyRef: string;
}

export interface CanonicalWritePreconditionEvaluation {
  entityRef: string;
  satisfied: boolean;
  failedChecks: CanonicalIssue[];
  repairSurface: RepairSurfaceDescriptor | null;
}

export interface EntitySuccessorMapping {
  sourceEntityRef: string;
  successorEntityRefs: string[];
  disposition: 'replaced' | 'split' | 'merged' | 'deleted';
}

export interface GeometryOverrideImpact {
  affectedEntityRefs: string[];
  relayoutRequired: boolean;
  miniSldRefreshRequired: boolean;
  selectionInvalidated: boolean;
  viewportResetRequired: boolean;
}

export interface OperationTransactionResult {
  transactionId: string;
  status: 'committed' | 'rejected' | 'conflict';
  issues: CanonicalIssue[];
  newNetworkRevision: string | null;
  changedEntityRefs: string[];
  successorMappings: EntitySuccessorMapping[];
  geometryImpact: GeometryOverrideImpact;
}

export interface MigrationAuditEntry {
  entityRef: string;
  entityType: string;
  batchRef: string;
  migratedFromVersion: string;
  migratedToVersion: string;
  migrationStatus: 'ok' | 'partial' | 'failed' | 'skipped';
  postMigrationDisposition: 'active' | 'historical_only' | 'rejected';
  warnings: CanonicalIssue[];
  inputHash: string;
  outputHash: string | null;
  idempotent: boolean;
  rollbackPossible: boolean;
  dryRun: boolean;
  timestamp: string;
}

export type ReportProfile = 'minimal' | 'standard' | 'full' | 'audit' | 'osd' | 'execution';

export interface ExportPolicyEntry {
  exportKind: 'pdf' | 'docx' | 'csv' | 'xlsx' | 'json' | 'whitebox_package';
  reportProfile: ReportProfile;
  requiredModules: string[];
  artifactVersion: string;
  allowsPartial: boolean;
  requiresPartialConfirmation: boolean;
  requiresAuditBanner: boolean;
  carriesAnalysisCaseContext: boolean;
  carriesProofPackRef: boolean;
  carriesInputHash: boolean;
  carriesResultHash: boolean;
  carriesGeneratedAt: boolean;
  carriesGeneratedByVersion: boolean;
  nullRendering: 'dash' | 'empty_cell' | 'null';
  notApplicableRendering: 'label' | 'empty_cell';
  failedRendering: 'error_block' | 'omit_with_error';
}

export type BenchmarkMetric =
  | 'voltage_profile'
  | 'branch_current'
  | 'branch_loading'
  | 'node_power'
  | 'short_circuit_ikss'
  | 'short_circuit_ip'
  | 'short_circuit_ith';

export interface BenchmarkComparisonResult {
  benchmarkId: string;
  metric: BenchmarkMetric;
  maxDeviationPct: number;
  tolerancePct: number;
  status: 'pass' | 'warn' | 'fail';
  comparedEntityRefs: string[];
}
