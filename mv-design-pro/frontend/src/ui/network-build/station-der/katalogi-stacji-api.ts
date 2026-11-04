/**
 * Klient katalogów konfiguracji stacji i pakietu dowodów rozszerzeń stacji.
 *
 * Katalogi (`/api/v1/catalog/konfiguracja-stacji/*`): tryby pracy magazynu, przełączniki
 * zaczepów, wkładki bezpiecznikowe SN, krzywe P(f), transformatory dedykowane — backend jest
 * JEDYNYM źródłem (karty FAB-J/FAB-L/FAB-M skasowały statyczne kopie we froncie). Zero
 * fallbacku lokalnego: niedostępność backendu jest stanem błędu/ładowania widocznym w UI.
 *
 * Karta JEDNA-SCIEZKA-EDYCJI: dane stacji (tryby magazynu, przełącznik zaczepów, wkładka
 * i przekładnik napięciowy pola) żyją WYŁĄCZNIE w modelu sieci i zmieniają się operacjami
 * domenowymi. Dawny magazyn „konfiguracji stacji" obok modelu (zapis, odczyt, usunięcie)
 * skasowano razem z klientem; pakiet dowodów i uziemienie SN pól czytają model
 * (`/api/v1/projects/{id}/stations/...`).
 */

import type { TypPunktuNeutralnego } from '../../../types/uziemienie';
import type { DanaPrzyjeta } from '../../../ui2/wyniki/wzorzec/werdykt';
import type { DoziemienieSieci } from '../../results-inspector/types';

/**
 * Krzywa P(f) (eng.9, NC RfG art. 13/15) — kształt 1:1 z backendu
 * (`network_model/catalog/katalogi_stacji.py::PfCurveItem.to_dict`).
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
 * (`network_model/catalog/katalogi_stacji.py::BlockTransformerItem.to_dict`).
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
 * (`network_model/catalog/katalogi_stacji.py::BessOperationModeItem.to_dict`).
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
 * (`network_model/catalog/katalogi_stacji.py::TapChangerItem.to_dict`).
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
 * (`network_model/catalog/katalogi_stacji.py::HvFusePasmoTcc.to_dict`).
 */
export interface HvFusePasmoTcc {
  readonly zrodlo_url: string;
  readonly punkty: ReadonlyArray<{ readonly prad_a: number; readonly czas_s: number }>;
}

/**
 * Bezpiecznik SN/HV (eng.17) — kształt 1:1 z backendu
 * (`network_model/catalog/katalogi_stacji.py::HvFuseItem.to_dict`).
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

/** Snapshot katalogów konfiguracji stacji — kształt 1:1 z `SnapshotKatalogowStacji.to_dict`. */
export interface KatalogiStacjiSnapshot {
  readonly bess_operation_modes: readonly BessOperationModeItem[];
  readonly tap_changers: readonly TapChangerItem[];
  readonly hv_fuses: readonly HvFuseItem[];
  readonly pf_curves: readonly PfCurveItem[];
  readonly block_transformers: readonly BlockTransformerItem[];
}

const BASE = '/api/v1/catalog/konfiguracja-stacji';

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

/** Snapshot wszystkich katalogów konfiguracji stacji. */
export async function fetchKatalogiStacjiSnapshot(): Promise<KatalogiStacjiSnapshot> {
  return getJson<KatalogiStacjiSnapshot>(`${BASE}/snapshot`);
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

/** Adres zasobów stacji projektu czytanych z modelu sieci. */
function stacjeProjektuUrl(projectId: string, stationId?: string): string {
  const base = `/api/v1/projects/${encodeURIComponent(projectId)}/stations`;
  return stationId ? `${base}/${encodeURIComponent(stationId)}` : base;
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
    `${stacjeProjektuUrl(args.projectId, args.stationId)}/_uziemienie-sn`,
    { pola: args.pola },
  );
}

// =============================================================================
// Pakiet dowodów rozszerzeń stacji + raport
// =============================================================================

/** Szczegóły dowodu bilansu eksportu stacji (`HOSTING_CAPACITY_EXPORT`) — liczone w backendzie. */
export interface SzczegolyBilansuEksportu {
  readonly station_id: string;
  readonly p_export_kw: number;
  readonly p_import_kw: number;
  readonly p_net_export_kw: number;
  /** `null` przy imporcie zerowym — stosunek nie istnieje (karta PROOFPACK-KONTRAKT). */
  readonly export_to_import_ratio: number | null;
  readonly status: 'no_export' | 'normal_export' | 'high_export_warning' | 'requires_ramp_down';
  readonly message_pl: string;
}

/** Rodzaj dowodu rozszerzeń stacji (kod maszynowy — ekran pokazuje `rodzaj_pl`). */
export type RodzajDowoduRozszerzen =
  | 'BESS_OPERATION_MODES'
  | 'TAP_CHANGER_PLAN'
  | 'HOSTING_CAPACITY_EXPORT'
  | 'VT_GROUNDING_VALIDATION';

export interface DowodRozszerzenStacji {
  readonly proof_id: string;
  readonly proof_type: RodzajDowoduRozszerzen;
  /** Polska nazwa rodzaju dowodu (backend, jedno źródło etykiet). */
  readonly rodzaj_pl: string;
  readonly pass_status: boolean;
  readonly summary_pl: string;
  readonly details: Record<string, unknown>;
  readonly formulas_latex: readonly string[];
  readonly generated_at: string;
}

/** Rodzaj (albo pozycja) dowodu, którego nie da się wygenerować — brak danych ≠ spełnia. */
export interface BrakDanychDowodu {
  readonly proof_type: RodzajDowoduRozszerzen;
  readonly rodzaj_pl: string;
  readonly przyczyna_pl: string;
}

/** Pakiet dowodów jednej stacji — kształt 1:1 z `PakietRozszerzenStacji.to_dict`. */
export interface PakietRozszerzenStacji {
  readonly station_id: string;
  /** Nazwa stacji z modelu (albo „Stacja spoza modelu") — ekran nigdy nie pokazuje id. */
  readonly station_nazwa: string;
  readonly all_pass: boolean;
  readonly fail_count: number;
  readonly proof_count: number;
  readonly proofs: readonly DowodRozszerzenStacji[];
  readonly braki_danych: readonly BrakDanychDowodu[];
  readonly generated_at: string;
}

/** Pakiety dowodów KAŻDEJ stacji modelu sieci projektu. */
export interface PakietRozszerzenProjektu {
  readonly project_id: string;
  readonly all_pass: boolean;
  readonly station_count: number;
  readonly per_station: readonly PakietRozszerzenStacji[];
}

/**
 * Pakiet dowodów rozszerzeń projektu — składa go BACKEND z modelu sieci (karty
 * PROOFPACK-KONTRAKT, JEDNA-SCIEZKA-EDYCJI): nazwy z modelu, bilans mocy w backendzie,
 * rodzaj bez danych jawnie oznaczony z przyczyną.
 */
export async function generatePakietRozszerzenProjektu(
  projectId: string,
): Promise<PakietRozszerzenProjektu> {
  return postJson<PakietRozszerzenProjektu>(`${stacjeProjektuUrl(projectId)}/_validate-all`, {});
}

export interface RaportRozszerzenRequest {
  readonly project_name: string;
  readonly station_id: string;
  /** Nazwa stacji z modelu — raport pokazuje ją projektantowi zamiast identyfikatora. */
  readonly station_name: string;
  readonly proof_pack: PakietRozszerzenStacji;
  readonly operator_pl?: string;
  readonly generated_at_iso?: string;
  readonly formats?: readonly ('json' | 'text_pl' | 'latex')[];
}

export interface RaportRozszerzenResponse {
  readonly json?: Record<string, unknown>;
  readonly text_pl?: string;
  readonly latex?: string;
}

export async function generateRaportRozszerzen(
  req: RaportRozszerzenRequest,
): Promise<RaportRozszerzenResponse> {
  return postJson<RaportRozszerzenResponse>(`${BASE}/generate-report`, req);
}
