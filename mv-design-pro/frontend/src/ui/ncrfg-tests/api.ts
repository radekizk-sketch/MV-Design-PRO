export type NcRfgCertificateStatus = 'ptpiree_verified' | 'none' | 'expired' | 'unknown';
export type NcRfgVerdict = 'pass' | 'fail' | 'no_data' | 'not_required';

export interface NcRfgTestDefinition {
  readonly test_id: string;
  readonly ability_pl: string;
  readonly procedure_basis_pl: string;
  readonly default_for_modules: readonly string[];
  readonly conditional_pl?: string | null;
}

export interface NcRfgOperatorProfile {
  readonly operator_id: string;
  readonly operator_name_pl: string;
  readonly last_revision: string;
}

export interface NcRfgTestCatalogResponse {
  readonly procedure_version: string;
  readonly source_ref: string;
  readonly operators: readonly NcRfgOperatorProfile[];
  readonly tests: readonly NcRfgTestDefinition[];
}

export interface NcRfgModuleInput {
  readonly der_ref: string;
  readonly der_name?: string | null;
  readonly der_kind: 'PV' | 'BESS' | 'FW' | 'OTHER';
  readonly module_family: 'PPM' | 'SyPGM' | 'Morski_PPM';
  readonly operator_id: string;
  readonly p_max_kw: number;
  readonly p_min_kw?: number | null;
  readonly voltage_kv: number;
  readonly certificate_status: NcRfgCertificateStatus;
  readonly has_lvrt_curve: boolean;
  readonly has_hvrt_curve: boolean;
  readonly has_pf_droop: boolean;
  readonly has_qu_curve: boolean;
  readonly has_dynamic_model: boolean;
  readonly has_scada_communication: boolean;
  readonly has_disturbance_recorder: boolean;
  readonly active_power_control_enabled: boolean;
  readonly stop_generation_enabled: boolean;
  readonly reduction_generation_enabled: boolean;
  readonly island_operation_required: boolean;
  readonly island_operation_capable: boolean;
  readonly black_start_required: boolean;
  readonly black_start_capable: boolean;
  readonly power_oscillation_damping_required: boolean;
  readonly power_oscillation_damping_enabled: boolean;
  readonly droop_percent?: number | null;
  readonly dead_band_hz?: number | null;
  readonly ramp_rate_pct_per_min?: number | null;
  readonly cos_phi_min?: number | null;
  readonly q_range_pct_pn_min?: number | null;
  readonly q_range_pct_pn_max?: number | null;
  readonly reactive_current_gain?: number | null;
  readonly p_recovery_time_s?: number | null;
  readonly harmonic_thdu_percent?: number | null;
}

export interface NcRfgRunRequest {
  readonly modules: readonly NcRfgModuleInput[];
  readonly requested_test_ids?: readonly string[];
  readonly procedure_version?: string;
}

export interface NcRfgTestResult {
  readonly test_id: string;
  readonly ability_pl: string;
  readonly required: boolean;
  readonly required_reason_pl: string;
  readonly verdict: NcRfgVerdict;
  readonly summary_pl: string;
  readonly metrics: Record<string, unknown>;
  readonly trace_refs: readonly string[];
  readonly fix_actions: readonly string[];
}

export interface NcRfgModuleResult {
  readonly der_ref: string;
  readonly der_name: string | null;
  readonly operator_id: string;
  readonly operator_name_pl: string;
  readonly module_type: string;
  readonly module_family: string;
  readonly p_max_kw: number;
  readonly voltage_kv: number;
  readonly required_count: number;
  readonly pass_count: number;
  readonly fail_count: number;
  readonly no_data_count: number;
  readonly not_required_count: number;
  readonly overall_status: 'zgodny' | 'niezgodny' | 'brak_danych';
  readonly tests: readonly NcRfgTestResult[];
}

export interface NcRfgRunResult {
  readonly contract: 'NcRfgPtpireeTestResultV1';
  readonly procedure_version: string;
  readonly solver_version: string;
  readonly input_hash: string;
  readonly deterministic_hash: string;
  readonly modules: readonly NcRfgModuleResult[];
  readonly test_catalog: readonly NcRfgTestDefinition[];
  readonly white_box_trace: readonly {
    readonly step: number;
    readonly test_id: string;
    readonly key: string;
    readonly formula: string;
    readonly data: Record<string, unknown>;
    readonly substitution: string;
    readonly result: Record<string, unknown>;
    readonly unit_check: string;
    readonly proof_ref: string;
  }[];
  readonly report_pl: string;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function fetchNcRfgTestCatalog(): Promise<NcRfgTestCatalogResponse> {
  return getJson<NcRfgTestCatalogResponse>('/api/ncrfg-tests/catalog');
}

export function runNcRfgPtpireeTests(request: NcRfgRunRequest): Promise<NcRfgRunResult> {
  return postJson<NcRfgRunResult>('/api/ncrfg-tests/run', request);
}
