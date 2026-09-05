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

/**
 * SC parameter input mode (PLAN_E2E_INDUSTRIAL § 3.9 K3 + ENGINEER_WORKFLOW_AUDIT § 3.1).
 * - 'simplified': projektant podaje tylko S″k_SN [MVA] + R/X (wystarczy dla typowego SN)
 * - 'advanced': pełny model 110 kV + TR + GPZ z impedancjami
 */
export type ScInputMode = 'simplified' | 'advanced';

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

  // SC input mode toggle
  // Default: 'simplified' — uproszczona ścieżka dla typowego projektu SN
  sc_input_mode: ScInputMode;
  // Used only when sc_input_mode === 'simplified'
  sc_simplified_sk_mva: number | null;
  sc_simplified_r_x_ratio: number;
}

/**
 * Jedna rewizja modelu powstała PO rewizji wyniku — to ona go unieważniła.
 * Wszystkie pola pochodzą z backendu (kanon operacji + `changes` operacji
 * domenowej); UI ich nie tłumaczy i nie uzupełnia.
 */
export interface ZmianaOdBiegu {
  rewizja: number;
  /** Kanoniczna nazwa operacji; `null` = rewizja bez zarejestrowanej operacji. */
  operacja: string | null;
  opis_pl: string;
  elementy: string[];
}

/**
 * Status wyników przypadku — WYPROWADZANY po stronie backendu z biegów przypadku
 * i koperty rewizji (`application/study_case/status_wynikow.py`). UI wyłącznie go
 * pokazuje: zero własnych tekstów tłumaczących i zero porównywania rewizji na
 * własną rękę.
 */
export interface StatusWynikowPrzypadku {
  result_status: StudyCaseResultStatus;
  /** Explicit flag — true only when result_status === 'FRESH'. */
  results_valid: boolean;
  /** Kod maszynowy przyczyny (stabilny, bez diakrytyków). */
  result_status_reason: string;
  /** Zdanie dla projektanta — JEDYNE źródło tekstu przyczyny w UI. */
  result_status_reason_pl: string;
  /** Rewizja modelu, na której policzono wynik (`null` = brak wyniku). */
  rewizja_biegu: number | null;
  /** Bieżąca rewizja modelu (`null` = model przypadku niedostępny). */
  rewizja_biezaca: number | null;
  /** Które zmiany unieważniły wynik (puste dla FRESH i NONE). */
  zmiany_od_biegu: ZmianaOdBiegu[];
}

/**
 * Study case entity.
 */
export interface StudyCase extends StatusWynikowPrzypadku {
  id: string;
  project_id: string;
  name: string;
  description: string;
  config: StudyCaseConfig;
  is_active: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
}

/**
 * Study case list item (summary).
 */
export interface StudyCaseListItem extends StatusWynikowPrzypadku {
  id: string;
  name: string;
  description: string;
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
  sc_input_mode: 'simplified',
  sc_simplified_sk_mva: null,
  sc_simplified_r_x_ratio: 0.1,
};

/**
 * Polish labels for result status.
 */
export const RESULT_STATUS_LABELS: Record<StudyCaseResultStatus, string> = {
  NONE: 'Wyniki do obliczenia',
  FRESH: 'Wyniki aktualne',
  OUTDATED: 'Wyniki nieaktualne',
};

/*
 * RESULT_STATUS_TOOLTIPS USUNIĘTE (CV-2-W). Był to WŁASNY tekst UI tłumaczący
 * status („model został zmieniony po ostatnim obliczeniu") — zgadywany, bo UI
 * nie znał przyczyny. Backend wyprowadza status z biegów przypadku i podaje
 * PRZYCZYNĘ zdaniem po polsku (`result_status_reason_pl`), także dla przypadków,
 * których UI nie umiał nazwać (zmiana biblioteki typów katalogowych, koperta
 * rewizji niespójna). Ekrany pokazują ten tekst; nie piszą własnego.
 */

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
  sc_input_mode: 'Parametry zwarciowe (tryb)',
  sc_simplified_sk_mva: 'Moc zwarciowa S″k po stronie SN [MVA]',
  sc_simplified_r_x_ratio: 'R/X po stronie SN',
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

// =============================================================================
// Serie przebiegów (wsad) — karta BATCH-ROUTER
// =============================================================================

/**
 * Status serii przebiegów — 1:1 z domeną backendu (`domain/run_batch.py`,
 * karta CV-3.3-C: rejestr trwały `run_batches`). Słownik dzieli wartości z
 * `CanonicalRun.status` (CREATED/RUNNING/FINISHED/FAILED) + PARTIAL, jedyny
 * stan niemożliwy dla pojedynczego biegu (część pozycji FAILED, reszta
 * FINISHED — seria NIGDY nie melduje cicho FINISHED).
 */
export type BatchStatus = 'CREATED' | 'RUNNING' | 'FINISHED' | 'FAILED' | 'PARTIAL';

/** Status WYKONANIA jednej pozycji serii — TEN SAM słownik co bieg kanoniczny
 * (bez PARTIAL — to stan wyłącznie serii, agregat pozycji). */
export type BatchItemStatus = 'CREATED' | 'RUNNING' | 'FINISHED' | 'FAILED';

/**
 * Jedna pozycja serii (kontrakt `items[]`, karta CV-3.3-C). ZERO własnego
 * wyniku — wynik = bieg kanoniczny po `canonical_run_id`
 * (`GET /api/execution/runs/{canonical_run_id}`).
 */
export interface BatchItem {
  position: number;
  scenario_id: string;
  analysis_type: ExecutionAnalysisType;
  options_hash: string;
  canonical_run_id: string | null;
  status: BatchItemStatus;
  error_message: string | null;
  /** Świeżość WYNIKU pozycji względem modelu bieżącego — liczona na żywo
   * (TA SAMA funkcja co nakładka pojedynczego biegu), nie „zielona na zawsze". */
  result_freshness: StudyCaseResultStatus;
  result_freshness_reason: string;
  result_freshness_reason_pl: string;
}

/**
 * Rekord serii przebiegów (kontrakt `GET /api/execution/study-cases/{id}/batches`).
 * Biegi serii (`run_ids`) to zwykłe biegi kanoniczne — szczegóły i wyniki
 * czytane istniejącymi końcówkami biegów.
 */
export interface BatchJob {
  batch_id: string;
  study_case_id: string;
  analysis_type: ExecutionAnalysisType;
  scenario_ids: string[];
  created_at: string;
  finished_at: string | null;
  status: BatchStatus;
  batch_input_hash: string;
  run_ids: string[];
  result_set_ids: string[];
  errors: string[];
  name: string | null;
  envelope: Record<string, unknown> | null;
  items: BatchItem[];
}

/**
 * Żądanie utworzenia serii (kontrakt `POST /api/execution/study-cases/{id}/batches`).
 */
export interface CreateBatchRequest {
  scenario_ids: string[];
}

/**
 * Polskie etykiety statusów serii.
 */
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  CREATED: 'Utworzona',
  RUNNING: 'W trakcie',
  FINISHED: 'Zakończona',
  FAILED: 'Błąd',
  PARTIAL: 'Częściowa',
};
