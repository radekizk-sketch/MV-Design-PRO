/**
 * Study Cases Types — P10 FULL MAX
 *
 * Type definitions for study case management.
 * Matches backend domain models for type safety.
 */

/**
 * Study case result status (Canonical-grade).
 */
export type StudyCaseResultStatus = 'NONE' | 'FRESH' | 'OUTDATED';

/**
 * Study case configuration parameters.
 */
/**
 * Supported operator profiles (NC RfG / IRiESD per OSD).
 * Source of truth: backend/src/catalog/profiles/nc_rfg/{id}.yaml
 */
export type OperatorProfileId = 'enea' | 'energa' | 'pge' | 'pse' | 'tauron';

/**
 * Operator profile metadata (UI-visible labels).
 * Reflects YAML profiles in backend/src/catalog/profiles/nc_rfg/.
 * For full narrative wymagań IRiESD: REQUIRES_SOURCE (vendor documentation,
 * not fabricated — see V12K-014 ENEA narrative blocker).
 */
export const OPERATOR_PROFILES: Array<{
  id: OperatorProfileId;
  label_pl: string;
}> = [
  { id: 'enea', label_pl: 'ENEA Operator (domyślny)' },
  { id: 'energa', label_pl: 'Energa Operator' },
  { id: 'pge', label_pl: 'PGE Dystrybucja' },
  { id: 'pse', label_pl: 'PSE (operator przesyłowy)' },
  { id: 'tauron', label_pl: 'Tauron Dystrybucja' },
];

export interface StudyCaseConfig {
  // Short-circuit parameters
  c_factor_max: number;
  c_factor_min: number;

  // Power flow parameters
  base_mva: number;
  max_iterations: number;
  tolerance: number;

  // Analysis options
  include_motor_contribution: boolean;
  include_inverter_contribution: boolean;
  thermal_time_seconds: number;

  // Operator profile (NC RfG / IRiESD per OSD)
  // Default: 'enea' per /goal V12K (ENEA Operator first in priority)
  operator_profile_id: OperatorProfileId;
}

/**
 * Study case result reference.
 */
export interface StudyCaseResultRef {
  analysis_run_id: string;
  analysis_type: string;
  calculated_at: string;
  input_hash: string;
}

/**
 * Study case entity.
 */
export interface StudyCase {
  id: string;
  project_id: string;
  name: string;
  description: string;
  config: StudyCaseConfig;
  result_status: StudyCaseResultStatus;
  /** PR-4: Explicit flag — true only when result_status === 'FRESH'. */
  results_valid: boolean;
  is_active: boolean;
  result_refs: StudyCaseResultRef[];
  revision: number;
  created_at: string;
  updated_at: string;
}

/**
 * Study case list item (summary).
 */
export interface StudyCaseListItem {
  id: string;
  name: string;
  description: string;
  result_status: StudyCaseResultStatus;
  /** PR-4: Explicit flag — true only when result_status === 'FRESH'. */
  results_valid: boolean;
  is_active: boolean;
  updated_at: string;
}

/**
 * Study case comparison result.
 */
export interface StudyCaseComparison {
  case_a_id: string;
  case_b_id: string;
  case_a_name: string;
  case_b_name: string;
  config_differences: Array<{
    field: string;
    value_a: unknown;
    value_b: unknown;
  }>;
  status_a: StudyCaseResultStatus;
  status_b: StudyCaseResultStatus;
}

/**
 * Create study case request.
 */
export interface CreateStudyCaseRequest {
  project_id: string;
  name: string;
  description?: string;
  config?: Partial<StudyCaseConfig>;
  set_active?: boolean;
}

/**
 * Update study case request.
 */
export interface UpdateStudyCaseRequest {
  name?: string;
  description?: string;
  config?: Partial<StudyCaseConfig>;
}

/**
 * Default configuration values.
 */
export const DEFAULT_STUDY_CASE_CONFIG: StudyCaseConfig = {
  c_factor_max: 1.10,
  c_factor_min: 0.95,
  base_mva: 100.0,
  max_iterations: 50,
  tolerance: 1e-6,
  include_motor_contribution: true,
  include_inverter_contribution: true,
  thermal_time_seconds: 1.0,
  operator_profile_id: 'enea',
};

/**
 * Polish labels for result status.
 */
export const RESULT_STATUS_LABELS: Record<StudyCaseResultStatus, string> = {
  NONE: 'Brak wyników',
  FRESH: 'Wyniki aktualne',
  OUTDATED: 'Wyniki nieaktualne',
};

/**
 * Polish tooltips for result status (expanded descriptions).
 * UI-09: Rozbudowane tooltips statusów przypadków.
 */
export const RESULT_STATUS_TOOLTIPS: Record<StudyCaseResultStatus, string> = {
  NONE: 'Brak wyników — obliczenia nie zostały jeszcze wykonane',
  FRESH: 'Wyniki aktualne — obliczenia wykonane po ostatniej zmianie modelu',
  OUTDATED:
    'Wyniki nieaktualne — model został zmieniony po ostatnim obliczeniu. Zalecenie: wykonaj obliczenia ponownie.',
};

/**
 * Polish labels for configuration fields.
 */
export const CONFIG_FIELD_LABELS: Record<keyof StudyCaseConfig, string> = {
  c_factor_max: 'Współczynnik napięciowy (max)',
  c_factor_min: 'Współczynnik napięciowy (min)',
  base_mva: 'Moc bazowa [MVA]',
  max_iterations: 'Maksymalna liczba iteracji',
  tolerance: 'Tolerancja zbieżności',
  include_motor_contribution: 'Wkład silników',
  include_inverter_contribution: 'Wkład inwerterów',
  thermal_time_seconds: 'Czas cieplny [s]',
  operator_profile_id: 'Operator (OSD)',
};

// =============================================================================
// PR-14: Execution Layer Types (StudyCase → Run → ResultSet)
// =============================================================================

/**
 * Analysis type for execution runs.
 */
export type ExecutionAnalysisType =
  | 'SC_3F'
  | 'SC_1F'
  | 'SC_2F'
  | 'SC_2F_G'
  | 'LOAD_FLOW'
  | 'PHASE_STATE_SN'
  | 'DYNAMIC_STABILITY'
  | 'SOURCE_COMPLIANCE';

/**
 * Run lifecycle status.
 */
export type RunStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

/**
 * Execution run record.
 */
export interface ExecutionRun {
  id: string;
  study_case_id: string;
  analysis_type: ExecutionAnalysisType;
  solver_input_hash: string;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

/**
 * Per-element result.
 */
export interface ElementResult {
  element_ref: string;
  element_type: string;
  values: Record<string, unknown>;
}

/**
 * Result set for a completed run.
 */
export interface ExecutionResultSet {
  run_id: string;
  analysis_type: ExecutionAnalysisType;
  validation_snapshot: Record<string, unknown>;
  readiness_snapshot: Record<string, unknown>;
  element_results: ElementResult[];
  global_results: Record<string, unknown>;
  deterministic_signature: string;
}

/**
 * Polish labels for analysis types.
 */
export const ANALYSIS_TYPE_LABELS: Record<ExecutionAnalysisType, string> = {
  SC_3F: 'Zwarcie trójfazowe (3F)',
  SC_1F: 'Zwarcie jednofazowe (1F)',
  SC_2F: 'Zwarcie dwufazowe (2F)',
  SC_2F_G: 'Zwarcie dwufazowe z ziemią (2F+Z)',
  LOAD_FLOW: 'Rozpływ mocy',
  PHASE_STATE_SN: 'Stan fazowy SN',
  DYNAMIC_STABILITY: 'Stabilność dynamiczna',
  SOURCE_COMPLIANCE: 'Zgodność źródła',
};

/**
 * Polish labels for run statuses.
 */
export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  PENDING: 'Oczekuje',
  RUNNING: 'W trakcie',
  DONE: 'Zakończony',
  FAILED: 'Błąd',
};

/**
 * CSS status styling for run status.
 */
export const RUN_STATUS_COLORS: Record<RunStatus, string> = {
  PENDING: 'text-gray-500',
  RUNNING: 'text-blue-500',
  DONE: 'text-green-600',
  FAILED: 'text-red-600',
};

/**
 * Create execution run request.
 */
export interface CreateRunRequest {
  analysis_type: ExecutionAnalysisType;
  solver_input?: Record<string, unknown>;
  readiness?: Record<string, unknown>;
  eligibility?: Record<string, unknown>;
}
