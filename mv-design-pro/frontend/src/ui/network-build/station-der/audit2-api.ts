/**
 * API client dla katalogow audytu 2 (Phase 2 backend integration).
 *
 * Pobiera katalogi z backendu (`/api/v1/catalog/audit2/*`) zamiast uzywac
 * frontendowych staticow. Lokalne staticki w `catalogs.ts` / `protection-catalogs.ts`
 * pozostaja jako fallback (gdy backend niedostepny lub w testach).
 */

interface AuditCatalogSnapshot {
  readonly bess_operation_modes: ReadonlyArray<unknown>;
  readonly tap_changers: ReadonlyArray<unknown>;
  readonly hv_fuses: ReadonlyArray<unknown>;
  readonly device_withstand: ReadonlyArray<unknown>;
  readonly pf_curves: ReadonlyArray<unknown>;
  readonly block_transformers: ReadonlyArray<unknown>;
  readonly mv_neutral_groundings: ReadonlyArray<unknown>;
}

const BASE = '/api/v1/catalog/audit2';

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
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Pobiera snapshot wszystkich 7 katalogow audytu 2. */
export async function fetchAudit2CatalogSnapshot(): Promise<AuditCatalogSnapshot> {
  return getJson<AuditCatalogSnapshot>(`${BASE}/snapshot`);
}

export interface VtGroundingValidationResponse {
  readonly ok: boolean;
  readonly message_pl: string;
}

/** Naprawa eng.20: walidacja VT vs typ uziemienia (backend). */
export async function validateVtGroundingApi(args: {
  readonly voltage_factor: number;
  readonly grounding_type: 'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded';
}): Promise<VtGroundingValidationResponse> {
  return postJson<VtGroundingValidationResponse>(`${BASE}/validate-vt-grounding`, args);
}

export interface DeviceWithstandValidationResponse {
  readonly ok: boolean;
  readonly i_dyn_ok: boolean;
  readonly i_th_ok: boolean;
  readonly message_pl: string;
  readonly utilization_dyn_percent: number;
  readonly utilization_th_percent: number;
}

/** Naprawa eng.18: walidacja I_dyn / I_th aparatury (backend, IEC 60909). */
export async function validateDeviceWithstandApi(args: {
  readonly device_id: string;
  readonly i_peak_calculated_ka: number;
  readonly i_thermal_calculated_ka: number;
  readonly t_clearing_s: number;
}): Promise<DeviceWithstandValidationResponse> {
  return postJson<DeviceWithstandValidationResponse>(`${BASE}/validate-device-withstand`, args);
}

export interface HostingCapacityExportResponse {
  readonly station_id: string;
  readonly p_export_kw: number;
  readonly p_import_kw: number;
  readonly p_net_export_kw: number;
  readonly export_to_import_ratio: number;
  readonly status: 'no_export' | 'normal_export' | 'high_export_warning' | 'requires_ramp_down';
  readonly message_pl: string;
}

/** Naprawa eng.15: walidacja eksportu vs import (backend). */
export async function validateHostingCapacityExportApi(args: {
  readonly station_id: string;
  readonly p_export_kw: number;
  readonly p_import_kw: number;
}): Promise<HostingCapacityExportResponse> {
  return postJson<HostingCapacityExportResponse>(
    `${BASE}/validate-hosting-capacity-export`,
    args,
  );
}

// =============================================================================
// Station config persistence (Punkt 3 Phase 2)
// =============================================================================

export interface DerAudit2SpecBody {
  readonly der_id: string;
  readonly der_kind: 'PV' | 'BESS' | 'FW';
  readonly bess_operation_mode_refs?: readonly string[] | null;
  readonly block_transformer_catalog_ref?: string | null;
  readonly pf_curve_ref?: string | null;
  // Phase 23: real device + power.
  readonly device_catalog_ref?: string | null;
  readonly nominal_power_kw?: number | null;
}

export interface BayDeviceWithstandSpec {
  readonly device_id: string;
  readonly i_peak_calculated_ka: number;
  readonly i_thermal_calculated_ka: number;
  readonly t_clearing_s: number;
}

export interface StationAudit2ConfigBody {
  readonly mv_neutral_grounding_ref: string | null;
  readonly tap_changer_refs: readonly string[];
  readonly der_specs: readonly DerAudit2SpecBody[];
  readonly transformer_tap_changers?: Readonly<Record<string, string>>;
  readonly bay_hv_fuses?: Readonly<Record<string, string>>;
  readonly bay_vts?: Readonly<Record<string, string>>;
  readonly bay_device_withstand?: Readonly<Record<string, BayDeviceWithstandSpec>>;
}

export interface StationAudit2ConfigResponse extends StationAudit2ConfigBody {
  readonly id: string;
  readonly project_id: string;
  readonly station_id: string;
  readonly created_at: string | null;
  readonly updated_at: string | null;
}

const STATION_CONFIG_BASE = '/api/v1/projects';

export async function listStationAudit2Configs(
  projectId: string,
): Promise<readonly StationAudit2ConfigResponse[]> {
  return getJson<readonly StationAudit2ConfigResponse[]>(
    `${STATION_CONFIG_BASE}/${projectId}/audit2-station-config`,
  );
}

export async function getStationAudit2Config(
  projectId: string,
  stationId: string,
): Promise<StationAudit2ConfigResponse | null> {
  const res = await fetch(
    `${STATION_CONFIG_BASE}/${projectId}/audit2-station-config/${stationId}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GET station config failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<StationAudit2ConfigResponse>;
}

export async function putStationAudit2Config(args: {
  readonly projectId: string;
  readonly stationId: string;
  readonly body: StationAudit2ConfigBody;
}): Promise<StationAudit2ConfigResponse> {
  const res = await fetch(
    `${STATION_CONFIG_BASE}/${args.projectId}/audit2-station-config/${args.stationId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args.body),
    },
  );
  if (!res.ok) {
    throw new Error(`PUT station config failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<StationAudit2ConfigResponse>;
}

export async function deleteStationAudit2Config(args: {
  readonly projectId: string;
  readonly stationId: string;
}): Promise<void> {
  const res = await fetch(
    `${STATION_CONFIG_BASE}/${args.projectId}/audit2-station-config/${args.stationId}`,
    { method: 'DELETE' },
  );
  if (res.status !== 204 && res.status !== 404) {
    throw new Error(`DELETE station config failed: ${res.status} ${res.statusText}`);
  }
}

// =============================================================================
// Phase 10/11: ProofPack + Report API clients
// =============================================================================

export interface Audit2ProofPackRequest {
  readonly station_id: string;
  readonly bess_modes_specs?: readonly Record<string, unknown>[];
  readonly tap_changer_specs?: readonly Record<string, unknown>[];
  readonly hosting_capacity_specs?: readonly Record<string, unknown>[];
  readonly device_withstand_specs?: readonly Record<string, unknown>[];
  readonly vt_grounding_specs?: readonly Record<string, unknown>[];
  readonly generated_at_iso?: string;
}

export interface Audit2ProofPackResponse {
  readonly station_id: string;
  readonly all_pass: boolean;
  readonly fail_count: number;
  readonly proof_count: number;
  readonly proofs: ReadonlyArray<{
    readonly proof_id: string;
    readonly proof_type: string;
    readonly pass_status: boolean;
    readonly summary_pl: string;
    readonly details: Record<string, unknown>;
    readonly formulas_latex: readonly string[];
    readonly generated_at: string;
  }>;
  readonly generated_at: string;
}

export async function generateAudit2ProofPack(
  req: Audit2ProofPackRequest,
): Promise<Audit2ProofPackResponse> {
  return postJson<Audit2ProofPackResponse>(`${BASE}/generate-proof-pack`, req);
}

export interface Audit2ReportRequest {
  readonly project_name: string;
  readonly station_id: string;
  readonly proof_pack: Audit2ProofPackResponse;
  readonly operator_pl?: string;
  readonly generated_at_iso?: string;
  readonly formats?: readonly ('json' | 'text_pl' | 'latex')[];
}

export interface Audit2ReportResponse {
  readonly json?: Record<string, unknown>;
  readonly text_pl?: string;
  readonly latex?: string;
}

export async function generateAudit2Report(
  req: Audit2ReportRequest,
): Promise<Audit2ReportResponse> {
  return postJson<Audit2ReportResponse>(`${BASE}/generate-report`, req);
}

// =============================================================================
// Phase 37: Audit2 Power Flow endpoint client
// =============================================================================

export interface Audit2PowerFlowRequest {
  readonly case_id: string;
  readonly project_id: string;
  readonly station_id: string;
  readonly base_mva?: number;
  readonly slack_node_id?: string;
  readonly snapshot_id?: string;
}

export interface Audit2PowerFlowResponse {
  readonly case_id: string;
  readonly project_id: string;
  readonly station_id: string;
  readonly audit2_applied: Record<string, unknown>;
  readonly solver_attempted: boolean;
  readonly solver_error: string | null;
  readonly audit2_extensions_keys: readonly string[];
  readonly graph_branch_count: number;
  readonly graph_node_count: number;
  readonly graph_inverter_source_count: number;
  readonly snapshot_id_loaded: string | null;
}

export async function runAudit2PowerFlow(
  req: Audit2PowerFlowRequest,
): Promise<Audit2PowerFlowResponse> {
  const res = await fetch('/api/cases/audit2-power-flow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`Audit2 power flow failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<Audit2PowerFlowResponse>;
}
