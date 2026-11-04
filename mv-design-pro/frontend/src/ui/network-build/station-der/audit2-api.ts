/**
 * API client dla katalogow audytu 2 (Phase 2 backend integration).
 *
 * Pobiera katalogi z backendu (`/api/v1/catalog/audit2/*`) zamiast uzywac
 * frontendowych staticow.
 *
 * Karta FAB-L: `bess_operation_modes`/`tap_changers` dopisane jako typy 1:1
 * z backendem (dotad `ReadonlyArray<unknown>`) — front czyta je WYLACZNIE stad,
 * statyczne mirrory (`BESS_OPERATION_MODE_CATALOG`, `TAP_CHANGER_CATALOG`)
 * skasowane z `catalogs.ts`. Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: katalog
 * „wariantow uziemienia punktu neutralnego SN" skasowany na amen — sposob
 * uziemienia niesie zespol uziemiajacy sekcji w modelu, a konfigurator czyta go
 * z backendu (`fetchUziemienieSnStacji`). Zero fallbacku lokalnego — backend jest jedynym zrodlem;
 * niedostepnosc backendu jest stanem bledu/ladowania widocznym w UI, nie
 * cichym podstawieniem drugiej kopii danych.
 *
 * Karta FAB-M: `hv_fuses` dopisane jako typ 1:1 z backendem (dotad
 * `ReadonlyArray<unknown>`) — front czyta je WYLACZNIE stad, statyczny mirror
 * (`HV_FUSE_CATALOG` w `protection-catalogs.ts`, 4 pozycje identyczne z
 * backendowym `audit2_catalogs.HV_FUSE_CATALOG`) skasowany. Zero fallbacku
 * lokalnego — backend jest jedynym zrodlem; niedostepnosc backendu jest
 * stanem bledu/ladowania widocznym w UI, nie cichym podstawieniem drugiej
 * kopii danych.
 */

import type { TypPunktuNeutralnego } from '../../../types/uziemienie';
import type { DanaPrzyjeta } from '../../../ui2/wyniki/wzorzec/werdykt';
import type { DoziemienieSieci } from '../../results-inspector/types';

/**
 * Krzywa P(f) (eng.9, NC RfG art. 13/15) — kształt 1:1 z backendu
 * (`network_model/catalog/audit2_catalogs.py::PfCurveItem.to_dict`).
 * Karta FAB-J: JEDYNE źródło — front nie ma już własnej kopii (`PF_CURVE_CATALOG`
 * usunięty z `catalogs.ts`).
 */
export interface PfCurveItem {
  readonly id: string;
  readonly catalog_namespace: string;
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly f_ref_hz: number;
  readonly droop_percent: number;
  readonly f_min_hz: number;
  readonly f_max_hz: number;
  readonly deadband_hz: number;
  readonly zrodlo_pl: string;
}

/**
 * Transformator dedykowany DER (B.5) — kształt 1:1 z backendu
 * (`network_model/catalog/audit2_catalogs.py::BlockTransformerItem.to_dict`).
 * Karta FAB-J: JEDYNE źródło — front nie ma już własnej kopii
 * (`BLOCK_TRANSFORMER_CATALOG` usunięty z `catalogs.ts`).
 */
export interface BlockTransformerItem {
  readonly id: string;
  readonly catalog_namespace: string;
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly transformer_type_ref: string;
  readonly sn_kva: number;
  readonly hv_kv: number;
  readonly lv_kv: number;
  readonly uk_percent: number;
  readonly pk_kw: number;
  readonly p0_kw: number;
  readonly i0_percent: number;
  readonly vector_group: string;
  readonly is_mv_to_mv: boolean;
  readonly applicable_der_kinds: readonly string[];
  readonly galvanic_isolation: boolean;
  readonly source_reference: string;
  readonly verification_status: string;
}

/**
 * Tryb pracy magazynu (BESS) — kształt 1:1 z backendu
 * (`network_model/catalog/audit2_catalogs.py::BessOperationModeItem.to_dict`).
 * Karta FAB-L: JEDYNE źródło — front nie ma już własnej kopii
 * (`BESS_OPERATION_MODE_CATALOG` usunięty z `catalogs.ts`).
 */
export interface BessOperationModeItem {
  readonly id: string;
  readonly catalog_namespace: string;
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly description_pl: string;
  readonly mode_code:
    | 'peak_shaving'
    | 'arbitrage'
    | 'fcr_n'
    | 'fcr_d_up'
    | 'fcr_d_down'
    | 'afrr'
    | 'mfrr'
    | 'voltage_support'
    | 'island_backup'
    | 'self_consumption';
  readonly requires_four_quadrant: boolean;
  readonly requires_grid_forming: boolean;
}

/**
 * Przełącznik zaczepów transformatora — kształt 1:1 z backendu
 * (`network_model/catalog/audit2_catalogs.py::TapChangerItem.to_dict`).
 * Karta FAB-L: JEDYNE źródło — front nie ma już własnej kopii
 * (`TAP_CHANGER_CATALOG` usunięty z `catalogs.ts`).
 */
export interface TapChangerItem {
  readonly id: string;
  readonly catalog_namespace: string;
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly type: 'oltc' | 'detc';
  readonly neutral_position: number;
  readonly tap_count: number;
  readonly step_percent: number;
  readonly range_percent: number;
  readonly regulated_side: 'hv' | 'lv';
  readonly supports_avr: boolean;
  readonly applicable_to: readonly string[];
}

/**
 * Pasmo czasowo-prądowe wkładki SN — kształt 1:1 z backendu
 * (`network_model/catalog/audit2_catalogs.py::HvFusePasmoTcc.to_dict`).
 */
export interface HvFusePasmoTcc {
  readonly zrodlo_url: string;
  readonly punkty: ReadonlyArray<{ readonly prad_a: number; readonly czas_s: number }>;
}

/**
 * Bezpiecznik SN/HV (eng.17) — kształt 1:1 z backendu
 * (`network_model/catalog/audit2_catalogs.py::HvFuseItem.to_dict`).
 * Karta FAB-M: JEDYNE źródło — front nie ma już własnej kopii
 * (`HV_FUSE_CATALOG` usunięty z `protection-catalogs.ts`, gdzie był DRUGĄ
 * kopią tych samych 4 pozycji, identyczne identyfikatory `fuse_15kv_50a_full`
 * i in.). `pasmo_brak_powod_pl`/`pasmo_brak_etykieta_pl` liczone przez backend
 * per pozycja (`None` gdy `pasmo_tcc` istnieje) — front czyta je wprost,
 * zamiast trzymać własną kopię tych samych dwóch zdań PL.
 */
export interface HvFuseItem {
  readonly id: string;
  readonly catalog_namespace: string;
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly nominal_voltage_kv: number;
  readonly nominal_current_a: number;
  readonly class: 'general_purpose' | 'full_range' | 'back_up';
  readonly application: 'transformer' | 'feeder' | 'motor' | 'capacitor';
  readonly pasmo_tcc: HvFusePasmoTcc | null;
  readonly pasmo_brak_powod_pl: string | null;
  readonly pasmo_brak_etykieta_pl: string | null;
}

/**
 * `device_withstand` NIE typowane tu: ma już konsumenta typowanego osobno
 * (`DeviceWithstandCatalogItem` niżej, przez `fetchDeviceWithstandCatalog`, nie
 * przez snapshot). Karty FAB-L/FAB-M: `bess_operation_modes`/`tap_changers`/
 * `hv_fuses` typowane 1:1 z backendem — ZERO `unknown`
 * tam, gdzie front te dane konsumuje.
 */
export interface AuditCatalogSnapshot {
  readonly bess_operation_modes: readonly BessOperationModeItem[];
  readonly tap_changers: readonly TapChangerItem[];
  readonly hv_fuses: readonly HvFuseItem[];
  readonly device_withstand: ReadonlyArray<unknown>;
  readonly pf_curves: readonly PfCurveItem[];
  readonly block_transformers: readonly BlockTransformerItem[];
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

/** Pobiera snapshot wszystkich 6 katalogow audytu 2. */
export async function fetchAudit2CatalogSnapshot(): Promise<AuditCatalogSnapshot> {
  return getJson<AuditCatalogSnapshot>(`${BASE}/snapshot`);
}

/** Pozycja katalogu wytrzymalosci aparatury (eng.18, IEC 60909). */
export interface DeviceWithstandCatalogItem {
  readonly id: string;
  readonly label_pl: string;
  readonly device_type: string;
  readonly nominal_voltage_kv: number;
  readonly nominal_current_a: number;
  readonly i_dyn_ka: number;
  readonly i_th_1s_ka: number;
  readonly i_th_duration_s: number;
}

/**
 * Katalog aparatury wytrzymalosciowej — JEDYNE zrodlo (K7-B).
 * Front nie ma juz wlasnej kopii tej listy.
 */
export async function fetchDeviceWithstandCatalog(): Promise<
  readonly DeviceWithstandCatalogItem[]
> {
  return getJson<readonly DeviceWithstandCatalogItem[]>(`${BASE}/device-withstand`);
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
  /** `null` przy imporcie zerowym — stosunek nie istnieje (karta PROOFPACK-KONTRAKT). */
  readonly export_to_import_ratio: number | null;
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

function stationAudit2ConfigUrl(projectId: string, stationId?: string): string {
  const base = `${STATION_CONFIG_BASE}/${encodeURIComponent(projectId)}/audit2-station-config`;
  return stationId ? `${base}/${encodeURIComponent(stationId)}` : base;
}

export async function listStationAudit2Configs(
  projectId: string,
): Promise<readonly StationAudit2ConfigResponse[]> {
  return getJson<readonly StationAudit2ConfigResponse[]>(
    stationAudit2ConfigUrl(projectId),
  );
}

export async function getStationAudit2Config(
  projectId: string,
  stationId: string,
): Promise<StationAudit2ConfigResponse | null> {
  const res = await fetch(
    stationAudit2ConfigUrl(projectId, stationId),
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
    stationAudit2ConfigUrl(args.projectId, args.stationId),
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

/** Typ punktu neutralnego sieci SN pola stacji — z modelu albo z nazwaną przyczyną braku. */
export interface UziemieniePolaSn {
  readonly oznaczenie: string;
  readonly typ_punktu_neutralnego: TypPunktuNeutralnego | null;
  readonly przyczyna_braku: string | null;
}

/** Punkt uziemienia sieci SN (zespół uziemiający albo uzwojenie transformatora). */
export interface PunktUziemieniaSn {
  readonly rodzaj: 'zespol_uziemiajacy' | 'uzwojenie_transformatora';
  readonly element_ref: string;
  readonly bus_ref: string;
  readonly nazwa_pl: string;
  readonly wariant: string;
  readonly odmowa_pl: string | null;
}

/** Sieć SN stacji — kształt 1:1 z `enm.uziemienie_sekcji.UziemienieSekcji.to_dict`. */
export interface UziemienieSekcjiSn {
  readonly szyny: readonly string[];
  readonly napiecie_kv: number;
  readonly wariant: string;
  readonly wariant_awsc_zalaczony: string;
  readonly typ_punktu_neutralnego: TypPunktuNeutralnego;
  readonly punkty: readonly PunktUziemieniaSn[];
  readonly b0_s: number;
  readonly galezie_bez_b0: readonly string[];
  /** Σ I_C [A]; `null`, gdy choć jedna gałąź sieci nie ma B′0 — częściowa suma nie jest wynikiem. */
  readonly prad_pojemnosciowy_a: number | null;
  /** B′0 odcinków z wartości roboczej (jakość ESTIMATED; reguła kabel B′0 = B′1, linia 0,4·B′1). */
  readonly dane_przyjete_pojemnosci: readonly DanaPrzyjeta[];
  /** Σ nastaw dławików w ruchu [A] (nastawa albo wartość robocza) — nie prąd I_L przy doziemieniu. */
  readonly prad_dlawikow_a: number | null;
  /** v = (I_C − I_L)/I_C z solvera doziemienia (I_L z impedancją zerową TU); dodatnie — niedokompensowanie. */
  readonly rozstrojenie: number | null;
  /** Tryb doziemienia sieci (AWSC w spoczynku) — jedno odwzorowanie `network_model.core.uziemienie`. */
  readonly tryb_doziemienia: DoziemienieSieci['tryb'];
  /** Doziemienie metaliczne sieci (AWSC w spoczynku) — solver `doziemienie_sn`. */
  readonly doziemienie: DoziemienieSieci;
  /** Choć jeden punkt w ruchu ma automatykę wymuszania składowej czynnej (Z.13). */
  readonly ma_awsc: boolean;
  /** Doziemienie po załączeniu AWSC (sieć nadal kompensowana); `null` bez AWSC. */
  readonly doziemienie_awsc_zalaczony: DoziemienieSieci | null;
  readonly ostrzezenia: readonly string[];
  readonly odmowy: readonly string[];
  readonly kompletnosc: 'PELNY' | 'NIEPELNY';
  readonly opis_pl: string;
}

export interface UziemienieSnStacjiResponse {
  readonly station_id: string;
  readonly sekcje: readonly UziemienieSekcjiSn[];
  readonly przyczyna_braku: string | null;
  readonly pola: readonly UziemieniePolaSn[];
}

/**
 * Sposób uziemienia punktu neutralnego sieci SN stacji — z MODELU sieci projektu
 * (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, `enm.uziemienie_sekcji`). Konfigurator nie
 * wybiera uziemienia; `pola` — typ dla oznaczeń pól (zgodność przekładników).
 */
export async function fetchUziemienieSnStacji(args: {
  readonly projectId: string;
  readonly stationId: string;
  readonly pola: readonly string[];
}): Promise<UziemienieSnStacjiResponse> {
  return postJson<UziemienieSnStacjiResponse>(
    `${stationAudit2ConfigUrl(args.projectId, args.stationId)}/_uziemienie-sn`,
    { pola: args.pola },
  );
}

export async function deleteStationAudit2Config(args: {
  readonly projectId: string;
  readonly stationId: string;
}): Promise<void> {
  const res = await fetch(
    stationAudit2ConfigUrl(args.projectId, args.stationId),
    { method: 'DELETE' },
  );
  if (res.status !== 204 && res.status !== 404) {
    throw new Error(`DELETE station config failed: ${res.status} ${res.statusText}`);
  }
}

// =============================================================================
// Phase 10/11: ProofPack + Report API clients
// =============================================================================

/** Rodzaj dowodu walidacji rozszerzeń (kod maszynowy — ekran pokazuje `rodzaj_pl`). */
export type Audit2ProofType =
  | 'AUDIT2_BESS_OPERATION_MODES'
  | 'AUDIT2_TAP_CHANGER_PLAN'
  | 'AUDIT2_HOSTING_CAPACITY_EXPORT'
  | 'AUDIT2_DEVICE_WITHSTAND'
  | 'AUDIT2_VT_GROUNDING_VALIDATION';

export interface Audit2Proof {
  readonly proof_id: string;
  readonly proof_type: Audit2ProofType;
  /** Polska nazwa rodzaju dowodu (backend, jedno źródło etykiet). */
  readonly rodzaj_pl: string;
  readonly pass_status: boolean;
  readonly summary_pl: string;
  readonly details: Record<string, unknown>;
  readonly formulas_latex: readonly string[];
  readonly generated_at: string;
}

/** Rodzaj (albo pozycja) dowodu, którego nie da się wygenerować — brak danych ≠ spełnia. */
export interface Audit2BrakDanych {
  readonly proof_type: Audit2ProofType;
  readonly rodzaj_pl: string;
  readonly przyczyna_pl: string;
}

/** Pakiet dowodów jednej stacji — kształt 1:1 z `StationAudit2ProofPack.to_dict`. */
export interface Audit2ProofPackResponse {
  readonly station_id: string;
  /** Nazwa stacji z modelu (albo „Stacja spoza modelu") — ekran nigdy nie pokazuje id. */
  readonly station_nazwa: string;
  readonly all_pass: boolean;
  readonly fail_count: number;
  readonly proof_count: number;
  readonly proofs: readonly Audit2Proof[];
  readonly braki_danych: readonly Audit2BrakDanych[];
  readonly generated_at: string;
}

/** Pakiety dowodów KAŻDEJ stacji z zapisaną konfiguracją projektu. */
export interface Audit2ProjectProofPackResponse {
  readonly project_id: string;
  readonly all_pass: boolean;
  readonly station_count: number;
  readonly per_station: readonly Audit2ProofPackResponse[];
}

/**
 * Pakiet dowodów walidacji rozszerzeń projektu — składa go BACKEND z utrwalonych
 * konfiguracji stacji i z modelu sieci (karta PROOFPACK-KONTRAKT). Dawny klient
 * `generateAudit2ProofPack` (specyfikacje składane w interfejsie, suma mocy w UI,
 * identyfikator stacji `configs[0] ?? 'aggregate'`) usunięty razem z końcówką.
 */
export async function generateProjectAudit2ProofPack(
  projectId: string,
): Promise<Audit2ProjectProofPackResponse> {
  return postJson<Audit2ProjectProofPackResponse>(
    `${stationAudit2ConfigUrl(projectId)}/_validate-all`,
    {},
  );
}

export interface Audit2ReportRequest {
  readonly project_name: string;
  readonly station_id: string;
  /** Nazwa stacji z modelu — raport pokazuje ją projektantowi zamiast identyfikatora. */
  readonly station_name: string;
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
