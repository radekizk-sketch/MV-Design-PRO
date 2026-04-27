import type {
  CanonicalIssueCode,
  CanonicalIssuePolicy,
  ReportProfile,
} from './shared';
import type {
  HelperSurfaceCode,
  ScreenCode,
  ScreenMatrixEntry,
  ScreenTransitionPolicy,
  SurfaceCommitPolicy,
} from './frontend-shell';
import {
  DEFAULT_LOCK_SCOPE_BY_SCREEN as WORKSPACE_DEFAULT_LOCK_SCOPE_BY_SCREEN,
  EXPORT_POLICY_MATRIX as WORKSPACE_EXPORT_POLICY_MATRIX,
  HELPER_SURFACE_REGISTRY as WORKSPACE_HELPER_SURFACE_REGISTRY,
  SCREEN_MATRIX as WORKSPACE_SCREEN_MATRIX,
  SCREEN_TRANSITIONS as WORKSPACE_SCREEN_TRANSITIONS,
  SURFACE_COMMIT_POLICY_MATRIX as WORKSPACE_SURFACE_COMMIT_POLICY_MATRIX,
  SURFACE_REGISTRY as WORKSPACE_SURFACE_REGISTRY,
} from '../workspace/types';

export type ActiveGeneratorCode =
  | 'report_generator'
  | 'export_pipeline'
  | 'whitebox_renderer'
  | 'verification_runner';

export interface ActiveGeneratorContract {
  generatorId: ActiveGeneratorCode;
  allowedSources: Array<
    | 'analysis_case_context'
    | 'module_results'
    | 'issue_matrix'
    | 'screen_matrix'
    | 'whitebox_package'
    | 'migration_audit'
  >;
  forbiddenDocRoots: readonly string[];
  forbiddenCodeRoots: readonly string[];
}

export type PerformanceEventKind =
  | 'tab_switch'
  | 'open_child_surface'
  | 'overlay_change'
  | 'analysis_entry'
  | 'report_entry'
  | 'history_restore'
  | 'return_to_parent';

export interface PerformanceBudgetEntry {
  eventKind: PerformanceEventKind;
  datasetRef: string;
  metricKind: 'p95_ms' | 'max_full_rerenders' | 'max_memory_mb' | 'stabilization_ms';
  threshold: number;
}

export type DomainEntityFamily =
  | 'protection_devices'
  | 'ct_vt'
  | 'fault_scope'
  | 'grounding_model'
  | 'zero_sequence_network'
  | 'der_sources'
  | 'pcc_measurements'
  | 'protection_assignments'
  | 'lineage_records'
  | 'assumptions'
  | 'quality_gates'
  | 'active_sources'
  | 'branch_mapping'
  | 'field_mapping'
  | 'device_ratings'
  | 'busbar_sections'
  | 'oltc_model'
  | 'q_limits'
  | 'pv_nodes'
  | 'frt_profile'
  | 'dynamic_model'
  | 'switching_sequence'
  | 'phase_measurements';

export type RequiredModuleResult =
  | 'E-26.frt_compliance'
  | 'E-27.protection_base'
  | 'E-29.short_circuit'
  | 'E-30.load_flow'
  | 'E-32.dynamic_stability'
  | 'E-35.any_completed_module'
  | 'E-28'
  | 'E-33';

export interface BenchmarkRegistryEntry {
  benchmarkId: string;
  family: 'radial' | 'der';
  datasetRef: string;
  requiredMetrics: string[];
  blockingDeviationPct: number;
  warningDeviationPct: number;
}

export interface AnalysisModuleSpecEntry {
  screenCode: 'E-26' | 'E-27' | 'E-28' | 'E-29' | 'E-30' | 'E-31' | 'E-32' | 'E-33' | 'E-34';
  inputContract: string;
  moduleDataContract: string;
  requiredEntities: DomainEntityFamily[];
  requiredResultFamilies: string[];
  requiresModuleResults: RequiredModuleResult[];
  invalidIfMissing: CanonicalIssueCode[];
  partialReasons: CanonicalIssueCode[];
  failedReasons: CanonicalIssueCode[];
  notApplicableReasons: CanonicalIssueCode[];
  exportPolicyKey: string;
  minimumCaseInputReadinessRequired: 'blocked' | 'degraded' | 'ready';
  supportedCaseInputReadiness: Array<'blocked' | 'degraded' | 'ready'>;
  blocksReportProfiles: ReportProfile[];
}

export const ACTIVE_DOC_ROOTS = [
  'docs/INDEX.md',
  'docs/INDEX_KANONICZNY.md',
  'docs/system',
  'docs/proof_engine',
  'docs/ui',
  'docs/sld',
  'docs/analysis',
  'docs/domain',
  'docs/catalog',
  'docs/tests',
] as const;

export const ARCHIVE_DOC_ROOTS = [
  'docs/archive',
  'docs/spec',
  'docs/audit/historical_execplans',
  'docs/designer-wizard',
] as const;

export const ACTIVE_GENERATOR_REGISTRY: Record<ActiveGeneratorCode, ActiveGeneratorContract> = {
  report_generator: {
    generatorId: 'report_generator',
    allowedSources: ['analysis_case_context', 'module_results', 'issue_matrix', 'screen_matrix'],
    forbiddenDocRoots: ARCHIVE_DOC_ROOTS,
    forbiddenCodeRoots: ['frontend/src/ui/wizard', 'frontend/src/ui/case-manager', 'frontend/src/ui/compat'],
  },
  export_pipeline: {
    generatorId: 'export_pipeline',
    allowedSources: ['analysis_case_context', 'module_results', 'issue_matrix', 'whitebox_package'],
    forbiddenDocRoots: ARCHIVE_DOC_ROOTS,
    forbiddenCodeRoots: ['frontend/src/ui/wizard', 'frontend/src/ui/case-manager', 'frontend/src/ui/compat'],
  },
  whitebox_renderer: {
    generatorId: 'whitebox_renderer',
    allowedSources: ['analysis_case_context', 'module_results', 'whitebox_package'],
    forbiddenDocRoots: ARCHIVE_DOC_ROOTS,
    forbiddenCodeRoots: ['frontend/src/ui/wizard', 'frontend/src/ui/case-manager', 'frontend/src/ui/compat'],
  },
  verification_runner: {
    generatorId: 'verification_runner',
    allowedSources: ['analysis_case_context', 'module_results', 'issue_matrix', 'screen_matrix', 'migration_audit'],
    forbiddenDocRoots: ARCHIVE_DOC_ROOTS,
    forbiddenCodeRoots: ['frontend/src/ui/wizard', 'frontend/src/ui/case-manager', 'frontend/src/ui/compat'],
  },
};

const issuePolicy = (
  blocksAnalysis: boolean,
  blocksReport: boolean,
  blocksExport: boolean,
  allowedInPartial: boolean,
): CanonicalIssuePolicy => ({
  blocksAnalysis,
  blocksReport,
  blocksExport,
  allowedInPartial,
});

export const ISSUE_MATRIX: Record<CanonicalIssueCode, CanonicalIssuePolicy> = {
  'surface.revision_conflict': issuePolicy(true, true, true, false),
  'surface.parent_dirty': issuePolicy(false, false, false, true),
  'surface.invalid_route': issuePolicy(false, false, false, false),
  'surface.entity_deleted': issuePolicy(true, true, true, false),
  'surface.context_changed': issuePolicy(false, false, false, true),
  'surface.child_active': issuePolicy(false, false, false, true),
  'surface.historical_record': issuePolicy(true, true, true, false),
  'surface.migration_incomplete': issuePolicy(true, true, true, false),
  'analysis.missing_z0': issuePolicy(false, true, true, true),
  'analysis.missing_curve_family': issuePolicy(true, true, true, false),
  'analysis.missing_ct_vt_ratio': issuePolicy(true, true, true, false),
  'analysis.missing_fault_path': issuePolicy(true, true, true, false),
  'analysis.missing_source_model': issuePolicy(true, true, true, false),
  'analysis.missing_branch_mapping': issuePolicy(true, true, true, false),
  'analysis.missing_device_rating': issuePolicy(true, true, true, false),
  'analysis.missing_busbar_section': issuePolicy(true, true, true, false),
  'analysis.missing_q_limits': issuePolicy(true, true, true, false),
  'analysis.missing_prerequisite': issuePolicy(true, true, true, false),
  'analysis.solver_cutoff_reached': issuePolicy(true, true, true, false),
  'analysis.pqsi_inconsistent': issuePolicy(true, true, true, false),
  'analysis.sc_chain_inconsistent': issuePolicy(true, true, true, false),
  'analysis.rounding_policy_mismatch': issuePolicy(false, true, true, false),
  'analysis.mixed_mv_lv_apparatus': issuePolicy(true, true, true, false),
  'report.partial_confirmation_required': issuePolicy(false, false, false, true),
  'report.blocked': issuePolicy(false, true, true, false),
  'export.incomplete': issuePolicy(false, false, true, false),
  'migration.failed': issuePolicy(true, true, true, false),
  'migration.partial': issuePolicy(true, true, true, false),
  'docs.archived_source_referenced': issuePolicy(false, true, true, false),
  'quality.missing_lineage': issuePolicy(false, true, true, true),
  'quality.missing_quality_dimension': issuePolicy(false, true, true, true),
};

export const PERFORMANCE_BUDGET_MATRIX: Record<string, PerformanceBudgetEntry> = {
  e10_tab_switch: { eventKind: 'tab_switch', datasetRef: 'SWITCHGEAR_HEAVY_FIELD_GOLDEN', metricKind: 'p95_ms', threshold: 120 },
  e12_open_child: { eventKind: 'open_child_surface', datasetRef: 'SN_RADIAL_15KV_GOLDEN', metricKind: 'p95_ms', threshold: 250 },
  overlay_change: { eventKind: 'overlay_change', datasetRef: 'SN_RADIAL_15KV_GOLDEN', metricKind: 'p95_ms', threshold: 180 },
  analysis_entry: { eventKind: 'analysis_entry', datasetRef: 'SN_DER_20KV_GOLDEN', metricKind: 'p95_ms', threshold: 900 },
  report_entry: { eventKind: 'report_entry', datasetRef: 'SN_DER_20KV_GOLDEN', metricKind: 'p95_ms', threshold: 800 },
  history_restore: { eventKind: 'history_restore', datasetRef: 'SN_RADIAL_15KV_GOLDEN', metricKind: 'p95_ms', threshold: 300 },
  return_to_parent: { eventKind: 'return_to_parent', datasetRef: 'SN_RADIAL_15KV_GOLDEN', metricKind: 'p95_ms', threshold: 150 },
  tab_rerenders: { eventKind: 'tab_switch', datasetRef: 'SWITCHGEAR_HEAVY_FIELD_GOLDEN', metricKind: 'max_full_rerenders', threshold: 3 },
  shell_memory: { eventKind: 'analysis_entry', datasetRef: 'SN_DER_20KV_GOLDEN', metricKind: 'max_memory_mb', threshold: 512 },
  shell_stabilization: { eventKind: 'history_restore', datasetRef: 'SN_RADIAL_15KV_GOLDEN', metricKind: 'stabilization_ms', threshold: 300 },
};

export const BENCHMARK_REGISTRY: Record<string, BenchmarkRegistryEntry> = {
  mv_oberrhein_radial: {
    benchmarkId: 'mv_oberrhein_radial',
    family: 'radial',
    datasetRef: 'SN_RADIAL_15KV_GOLDEN',
    requiredMetrics: ['voltage_profile', 'branch_current', 'node_power'],
    blockingDeviationPct: 0.5,
    warningDeviationPct: 0.25,
  },
  cigre_mv_der: {
    benchmarkId: 'cigre_mv_der',
    family: 'der',
    datasetRef: 'SN_DER_20KV_GOLDEN',
    requiredMetrics: ['voltage_profile', 'branch_loading', 'short_circuit_ikss', 'short_circuit_ip', 'short_circuit_ith'],
    blockingDeviationPct: 0.5,
    warningDeviationPct: 0.25,
  },
};

export const ANALYSIS_MODULE_MATRIX: Record<
  'E-26' | 'E-27' | 'E-28' | 'E-29' | 'E-30' | 'E-31' | 'E-32' | 'E-33' | 'E-34',
  AnalysisModuleSpecEntry
> = {
  'E-26': {
    screenCode: 'E-26',
    inputContract: 'E26FrtLvrtHvrtInput',
    moduleDataContract: 'E26FrtLvrtHvrtComplianceData',
    requiredEntities: ['der_sources', 'pcc_measurements', 'frt_profile', 'q_limits'],
    requiredResultFamilies: ['source_frt_lvrt_hvrt', 'source_compliance'],
    requiresModuleResults: ['E-30.load_flow'],
    invalidIfMissing: ['analysis.missing_source_model', 'analysis.missing_curve_family'],
    partialReasons: ['analysis.missing_curve_family'],
    failedReasons: ['analysis.missing_prerequisite'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_frt_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['standard', 'full', 'audit', 'osd'],
  },
  'E-27': {
    screenCode: 'E-27',
    inputContract: 'E27ProtectionAutomationInput',
    moduleDataContract: 'E27ProtectionAutomationData',
    requiredEntities: ['protection_devices', 'ct_vt', 'protection_assignments'],
    requiredResultFamilies: ['protection_automation'],
    requiresModuleResults: ['E-29.short_circuit'],
    invalidIfMissing: ['analysis.missing_curve_family', 'analysis.missing_ct_vt_ratio'],
    partialReasons: ['analysis.missing_curve_family', 'analysis.missing_ct_vt_ratio'],
    failedReasons: ['analysis.missing_prerequisite'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_protection_automation_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['standard', 'full', 'audit', 'osd', 'execution'],
  },
  'E-28': {
    screenCode: 'E-28',
    inputContract: 'E28ProtectionCoordinationInput',
    moduleDataContract: 'E28ProtectionCoordinationData',
    requiredEntities: ['protection_devices', 'ct_vt', 'fault_scope'],
    requiredResultFamilies: ['protection_coordination'],
    requiresModuleResults: ['E-29.short_circuit', 'E-27.protection_base'],
    invalidIfMissing: ['analysis.missing_curve_family', 'analysis.missing_ct_vt_ratio', 'analysis.missing_fault_path'],
    partialReasons: ['analysis.missing_curve_family', 'analysis.missing_ct_vt_ratio'],
    failedReasons: ['analysis.missing_prerequisite'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_protection_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['standard', 'full', 'audit', 'osd', 'execution'],
  },
  'E-29': {
    screenCode: 'E-29',
    inputContract: 'E29SymmetricalComponentsInput',
    moduleDataContract: 'E29SymmetricalComponentsData',
    requiredEntities: ['grounding_model', 'zero_sequence_network'],
    requiredResultFamilies: ['short_circuit_all_fault_types', 'symmetrical_components'],
    requiresModuleResults: [],
    invalidIfMissing: ['analysis.missing_z0'],
    partialReasons: ['analysis.missing_z0'],
    failedReasons: ['analysis.missing_prerequisite'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_components_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['full', 'audit', 'osd'],
  },
  'E-30': {
    screenCode: 'E-30',
    inputContract: 'E30LoadFlowInput',
    moduleDataContract: 'E30LoadFlowNrGsFdData',
    requiredEntities: ['oltc_model', 'q_limits', 'pv_nodes'],
    requiredResultFamilies: ['load_flow_nr', 'load_flow_gs_diagnostic', 'load_flow_fd_performance'],
    requiresModuleResults: [],
    invalidIfMissing: ['analysis.missing_q_limits', 'analysis.solver_cutoff_reached'],
    partialReasons: ['analysis.missing_q_limits'],
    failedReasons: ['analysis.solver_cutoff_reached'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_load_flow_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['standard', 'full', 'audit', 'osd'],
  },
  'E-31': {
    screenCode: 'E-31',
    inputContract: 'E31PhaseStateSnInput',
    moduleDataContract: 'E31PhaseStateSnData',
    requiredEntities: ['phase_measurements', 'der_sources', 'pcc_measurements'],
    requiredResultFamilies: ['phase_state_sn'],
    requiresModuleResults: ['E-30.load_flow'],
    invalidIfMissing: ['analysis.missing_prerequisite'],
    partialReasons: ['analysis.missing_prerequisite'],
    failedReasons: ['analysis.missing_prerequisite'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_phase_state_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['full', 'audit', 'osd'],
  },
  'E-32': {
    screenCode: 'E-32',
    inputContract: 'E32DynamicStabilityInput',
    moduleDataContract: 'E32DynamicStabilityData',
    requiredEntities: ['dynamic_model', 'switching_sequence', 'fault_scope', 'der_sources'],
    requiredResultFamilies: ['dynamic_stability'],
    requiresModuleResults: ['E-26.frt_compliance', 'E-30.load_flow'],
    invalidIfMissing: ['analysis.missing_source_model', 'analysis.missing_fault_path'],
    partialReasons: ['analysis.missing_source_model', 'analysis.missing_fault_path'],
    failedReasons: ['analysis.missing_prerequisite'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_dynamic_stability_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['full', 'audit', 'osd'],
  },
  'E-33': {
    screenCode: 'E-33',
    inputContract: 'E33SourceContributionsInput',
    moduleDataContract: 'E33SourceContributionsData',
    requiredEntities: ['active_sources', 'branch_mapping', 'field_mapping'],
    requiredResultFamilies: ['source_contributions'],
    requiresModuleResults: ['E-29.short_circuit', 'E-30.load_flow'],
    invalidIfMissing: ['analysis.missing_source_model', 'analysis.missing_branch_mapping'],
    partialReasons: ['analysis.missing_source_model', 'analysis.missing_branch_mapping'],
    failedReasons: ['analysis.missing_prerequisite'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_sources_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['standard', 'full', 'audit', 'osd', 'execution'],
  },
  'E-34': {
    screenCode: 'E-34',
    inputContract: 'E34ThermalDynamicInput',
    moduleDataContract: 'E34ThermalDynamicData',
    requiredEntities: ['device_ratings', 'busbar_sections', 'fault_scope'],
    requiredResultFamilies: ['thermal_dynamic_verification'],
    requiresModuleResults: ['E-29.short_circuit', 'E-28'],
    invalidIfMissing: ['analysis.missing_device_rating', 'analysis.missing_busbar_section'],
    partialReasons: ['analysis.missing_device_rating', 'analysis.missing_busbar_section'],
    failedReasons: ['analysis.missing_prerequisite'],
    notApplicableReasons: [],
    exportPolicyKey: 'analysis_thermal_export',
    minimumCaseInputReadinessRequired: 'degraded',
    supportedCaseInputReadiness: ['degraded', 'ready'],
    blocksReportProfiles: ['full', 'audit', 'osd'],
  },
};

export const SCREEN_MATRIX = WORKSPACE_SCREEN_MATRIX as unknown as Record<ScreenCode, ScreenMatrixEntry>;
export const SCREEN_TRANSITIONS = WORKSPACE_SCREEN_TRANSITIONS as unknown as Record<string, ScreenTransitionPolicy>;
export const SURFACE_COMMIT_MATRIX = WORKSPACE_SURFACE_COMMIT_POLICY_MATRIX as Partial<Record<ScreenCode, SurfaceCommitPolicy>>;
export const SCREEN_REGISTRY = WORKSPACE_SURFACE_REGISTRY;
export const HELPER_SURFACE_REGISTRY = WORKSPACE_HELPER_SURFACE_REGISTRY as Record<
  HelperSurfaceCode,
  {
    titlePl: string;
    allowedCapabilities: string[];
    mayWriteModel: boolean;
    mayOwnResults: boolean;
    mayOwnReportState: boolean;
  }
>;
export const DEFAULT_LOCK_SCOPE_BY_SCREEN = WORKSPACE_DEFAULT_LOCK_SCOPE_BY_SCREEN;
export const EXPORT_POLICY_MATRIX = WORKSPACE_EXPORT_POLICY_MATRIX;
