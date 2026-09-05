/**
 * Katalogi DER pobierane WYŁĄCZNIE z backendu (karta FAB-J).
 *
 * Zastępuje statyczne mirrory usunięte z `catalogs.ts` (pomiar klasy karty
 * FAB-I, rozliczony tutaj):
 *  - `NC_RFG_PROFILE_CATALOG` / `LVRT_CURVE_CATALOG` / `HVRT_CURVE_CATALOG` →
 *    `GET /api/ncrfg-tests/catalog` (kontrakt backendu jest prawdą — operator
 *    + JEDNA para krzywych LVRT/HVRT na operatora; backend nie różnicuje
 *    krzywej wg modułu, więc front też przestaje to udawać).
 *  - `LV_VOLTAGE_LEVEL_CATALOG` → wyprowadzone z `GET /api/catalog/converter-types`
 *    (`un_kv` < 1 kV) — jedyna prawda o tym, na jakim napięciu istnieją
 *    urządzenia; zero nowej końcówki.
 *  - `BESS_BATTERY_CATALOG` → `GET /api/catalog/bess-battery-types`.
 *  - klasyfikacja modułu NC RfG (dawne `deriveModuleTypesForPowerKw`,
 *    UI-owe i bez kryterium napięcia) → `GET /api/ncrfg-tests/modul`
 *    (`compliance/nc_rfg_modul.py` — JEDYNE źródło progów, zero duplikacji).
 *
 * `PF_CURVE_CATALOG` / `BLOCK_TRANSFORMER_CATALOG` NIE są tutaj — te dwa
 * czyta się ze snapshotu audytu 2 już pobieranego przez kreator
 * (`useAudit2CatalogSnapshot`, `audit2-hooks.ts`), zgodnie z decyzją karty
 * (zero nowego zapytania sieciowego dla danych, które i tak już przychodzą).
 *
 * Karta FAB-L dopisuje:
 *  - `DER_DYNAMIC_MODEL_CATALOG` → `GET /api/catalog/der-dynamic-profiles`
 *    (`network_model.catalog.der_dynamic`, jedyne źródło konsumowane przez
 *    solvery `stability_rms`/`frt_hvrt`; dawny katalog frontu niósł pola
 *    ZMYŚLONE — `k_factor_iq_over_du`, `voltage_drop_detection_time_ms` — bez
 *    odpowiednika w realnym profilu).
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchDerConverterTypes } from '../../catalog/api';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// =============================================================================
// NC RfG: operatorzy + krzywe ride-through
// Kontrakt: `api/ncrfg_ptpiree_tests.py::get_ncrfg_test_catalog`.
// =============================================================================

export interface RideThroughCurvePoint {
  readonly time_s: number;
  readonly voltage_pu: number;
}

export interface NcRfgOperatorItem {
  readonly operator_id: string;
  readonly operator_name_pl: string;
  readonly last_revision: string;
  readonly reactive_power: {
    readonly q_range_pct_pn_min: number;
    readonly q_range_pct_pn_max: number;
    readonly cos_phi_min: number;
    readonly voltage_control_modes: readonly string[];
  };
  readonly ride_through: {
    readonly lvrt: readonly RideThroughCurvePoint[];
    readonly hvrt: readonly RideThroughCurvePoint[];
  };
}

interface NcRfgCatalogResponse {
  readonly operators: readonly NcRfgOperatorItem[];
}

export async function fetchNcRfgOperators(): Promise<readonly NcRfgOperatorItem[]> {
  const payload = await getJson<NcRfgCatalogResponse>('/api/ncrfg-tests/catalog');
  // Uczciwy stan pusty zamiast `undefined` — React Query traktuje wynik
  // zapytania `undefined` jako błąd konfiguracji hooka, nie „brak danych".
  return Array.isArray(payload?.operators) ? payload.operators : [];
}

/** Pobiera profil operatora po `operator_id` — odpowiednik dawnego `getNcRfgProfile`. */
export function getNcRfgOperator(
  operators: readonly NcRfgOperatorItem[],
  operatorId: string | null,
): NcRfgOperatorItem | null {
  if (!operatorId) return null;
  return operators.find((item) => item.operator_id === operatorId) ?? null;
}

export function useNcRfgOperatorCatalog(): UseQueryResult<readonly NcRfgOperatorItem[], Error> {
  return useQuery({
    queryKey: ['ncrfg', 'operator-catalog'],
    queryFn: fetchNcRfgOperators,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  });
}

// =============================================================================
// Klasyfikacja modułu NC RfG — jedyne źródło progów: `compliance/nc_rfg_modul.py`.
// =============================================================================

export type NcRfgModuleLetter = 'A' | 'B' | 'C' | 'D';

export async function fetchNcRfgModuleClassification(args: {
  readonly pMaxMw: number;
  readonly napiecieKv: number;
}): Promise<NcRfgModuleLetter> {
  const params = new URLSearchParams({
    p_max_mw: String(args.pMaxMw),
    napiecie_kv: String(args.napiecieKv),
  });
  const payload = await getJson<{ readonly modul: NcRfgModuleLetter }>(
    `/api/ncrfg-tests/modul?${params.toString()}`,
  );
  return payload.modul;
}

/**
 * Hook: moduł NC RfG oczekiwany dla (moc, napięcie) — cache kluczowany parą,
 * żeby zmiana mocy/napięcia w formularzu przeliczała klasyfikację na żywo.
 */
export function useNcRfgModuleClassification(
  pMaxMw: number | null,
  napiecieKv: number | null,
): UseQueryResult<NcRfgModuleLetter, Error> {
  return useQuery({
    queryKey: ['ncrfg', 'modul', pMaxMw, napiecieKv],
    queryFn: () =>
      fetchNcRfgModuleClassification({ pMaxMw: pMaxMw as number, napiecieKv: napiecieKv as number }),
    enabled: typeof pMaxMw === 'number' && pMaxMw > 0 && typeof napiecieKv === 'number' && napiecieKv > 0,
    staleTime: Infinity,
  });
}

// =============================================================================
// BESS: pakiet baterii — sprzęt oddzielny od PCS/przekształtnika.
// Kontrakt: `api/catalog.py::list_bess_battery_types`.
// =============================================================================

export interface BessBatteryItem {
  readonly id: string;
  readonly name: string;
  readonly chemistry: 'LFP' | 'NMC' | 'LTO';
  readonly capacity_kwh: number;
  readonly nominal_voltage_dc_v: number;
  readonly c_rate: number;
  readonly verification_status: string;
  readonly source_reference: string;
  readonly catalog_status: string;
  readonly contract_version: string;
}

export async function fetchBessBatteryTypes(): Promise<readonly BessBatteryItem[]> {
  const payload = await getJson<readonly BessBatteryItem[]>('/api/catalog/bess-battery-types');
  // Uczciwy stan pusty zamiast `undefined`/kształtu spoza kontraktu — patrz
  // `fetchNcRfgOperators` (ten sam mechanizm: React Query odrzuca `undefined`).
  return Array.isArray(payload) ? payload : [];
}

export function useBessBatteryTypes(): UseQueryResult<readonly BessBatteryItem[], Error> {
  return useQuery({
    queryKey: ['catalog', 'bess-battery-types'],
    queryFn: fetchBessBatteryTypes,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  });
}

// =============================================================================
// Poziomy napięcia nN — wyprowadzone z katalogu przekształtników (zero nowej
// końcówki: jedyna prawda o tym, na jakim napięciu istnieją urządzenia).
// =============================================================================

export async function fetchLvVoltageLevelsKv(): Promise<readonly number[]> {
  const converters = await fetchDerConverterTypes();
  const poziomy = new Set<number>();
  for (const converter of Array.isArray(converters) ? converters : []) {
    if (typeof converter.un_kv === 'number' && converter.un_kv > 0 && converter.un_kv < 1) {
      poziomy.add(converter.un_kv);
    }
  }
  return [...poziomy].sort((a, b) => a - b);
}

export function useLvVoltageLevelsKv(): UseQueryResult<readonly number[], Error> {
  return useQuery({
    queryKey: ['catalog', 'lv-voltage-levels'],
    queryFn: fetchLvVoltageLevelsKv,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  });
}

/** Etykieta poziomu napięcia — WYŁĄCZNIE wartość zmierzona, zero opisu użycia
 *  wymyślonego przez UI (dawne `typical_use_pl` katalogu statycznego). */
export function formatLvVoltageLabelPl(kv: number): string {
  return `${kv.toString().replace('.', ',')} kV`;
}

// =============================================================================
// Modele dynamiczne DER (PV/BESS/FW) — karta FAB-L.
// Kontrakt: `api/catalog.py::list_der_dynamic_profiles` →
// `network_model.catalog.der_dynamic` (konsumowany przez solvery RMS/FRT-HVRT).
// =============================================================================

/** Profil falownika (PV/BESS) — pola 1:1 z `InverterDynamicProfile.model_dump()`. */
export interface DerInverterDynamicProfileItem {
  readonly profile_id: string;
  readonly profile_name_pl: string;
  readonly der_kind: 'PV' | 'BESS';
  readonly control_mode: 'grid_following' | 'grid_forming';
  readonly tp_s: number;
  readonly tq_s: number;
  readonly p_f_droop_pu: number;
  readonly p_f_dead_band_hz: number;
  readonly q_u_droop_pu: number;
  readonly q_u_dead_band_pu: number;
  readonly i_max_pu: number;
  readonly v_min_continuous_pu: number;
  readonly v_max_continuous_pu: number;
  readonly frt_response_time_ms: number;
  readonly iq_max_during_fault_pu: number;
  readonly iq_priority_during_fault: boolean;
  readonly p_recovery_rate_pu_per_s: number;
  readonly p_recovery_delay_ms: number;
  readonly virtual_inertia_h_s: number | null;
  readonly source_reference: string;
  readonly standard_compliance: readonly string[];
}

/** Profil turbiny wiatrowej — pola 1:1 z `WindTurbineDynamicProfile.model_dump()`. */
export interface DerWindDynamicProfileItem {
  readonly profile_id: string;
  readonly profile_name_pl: string;
  readonly der_kind: 'FW';
  readonly iec_type: 'type_1' | 'type_2' | 'type_3' | 'type_4';
  readonly h_total_s: number;
  readonly drive_train_stiffness_pu: number;
  readonly tp_s: number;
  readonly tq_s: number;
  readonly pitch_rate_deg_per_s: number;
  readonly pitch_min_deg: number;
  readonly pitch_max_deg: number;
  readonly frt_response_time_ms: number;
  readonly iq_max_during_fault_pu: number;
  readonly p_recovery_rate_pu_per_s: number;
  readonly p_recovery_delay_ms: number;
  readonly slip_steady_pu: number;
  readonly v_min_continuous_pu: number;
  readonly v_max_continuous_pu: number;
  readonly source_reference: string;
  readonly standard_compliance: readonly string[];
}

export type DerDynamicProfileItem = DerInverterDynamicProfileItem | DerWindDynamicProfileItem;

export async function fetchDerDynamicProfiles(): Promise<readonly DerDynamicProfileItem[]> {
  const payload = await getJson<readonly DerDynamicProfileItem[]>(
    '/api/catalog/der-dynamic-profiles',
  );
  return Array.isArray(payload) ? payload : [];
}

export function useDerDynamicProfiles(): UseQueryResult<readonly DerDynamicProfileItem[], Error> {
  return useQuery({
    queryKey: ['catalog', 'der-dynamic-profiles'],
    queryFn: fetchDerDynamicProfiles,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  });
}

/** Pobiera profil dynamiczny po `profile_id` z katalogu podanego przez wołającego. */
export function getDerDynamicProfile(
  profiles: readonly DerDynamicProfileItem[],
  profileId: string | null,
): DerDynamicProfileItem | null {
  if (!profileId) return null;
  return profiles.find((p) => p.profile_id === profileId) ?? null;
}

/** Profile dostępne dla danego rodzaju DER (PV/BESS/FW) — wybór jawny z listy. */
export function selectDerDynamicProfilesForKind(
  profiles: readonly DerDynamicProfileItem[],
  kind: 'PV' | 'BESS' | 'FW',
): readonly DerDynamicProfileItem[] {
  return profiles.filter((p) => p.der_kind === kind);
}

/**
 * Etykieta zwięzła profilu dynamicznego — parametry White Box widoczne wprost
 * (dawny katalog frontu pokazywał WYMYŚLONE `k_factor_iq_over_du`; ten label
 * czyta REALNE pola resolvera: droop P/f dla falowników, typ IEC dla turbin).
 */
export function formatDerDynamicProfileLabelPl(profile: DerDynamicProfileItem): string {
  if (profile.der_kind === 'FW') {
    return `${profile.profile_name_pl} (IEC ${profile.iec_type.replace('type_', 'typu ')}, `
      + `H=${profile.h_total_s.toFixed(1)} s, FRT ${profile.frt_response_time_ms.toFixed(0)} ms)`;
  }
  const tryb = profile.control_mode === 'grid_forming' ? 'grid-forming' : 'grid-following';
  return `${profile.profile_name_pl} (${tryb}, droop P/f=${(profile.p_f_droop_pu * 100).toFixed(0)}%, `
    + `t_odp=${profile.tp_s.toFixed(2)} s)`;
}
