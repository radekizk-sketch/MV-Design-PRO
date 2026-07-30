/**
 * Type Catalog Types
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md § 4: Type Catalog (Library)
 * - ADR-007: Type Library Strategy
 * - backend/src/network_model/catalog/types.py (source of truth)
 *
 * These types mirror backend catalog structures for UI consumption.
 */

/**
 * Base type for all catalog types.
 */
export interface CatalogType {
  id: string;
  name: string;
  manufacturer?: string;
}

/**
 * Line Type (overhead line).
 * Source: backend LineType dataclass.
 */
export interface LineType extends CatalogType {
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  b_us_per_km: number;
  rated_current_a: number;
  standard?: string;
  max_temperature_c: number;
  voltage_rating_kv: number;
  conductor_material?: string;
  cross_section_mm2: number;
}

/**
 * Cable Type (underground cable).
 * Source: backend CableType dataclass.
 */
export interface CableType extends CatalogType {
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  c_nf_per_km: number;
  rated_current_a: number;
  voltage_rating_kv: number;
  insulation_type?: string;
  standard?: string;
  conductor_material?: string;
  cross_section_mm2: number;
  return_conductor_cross_section_mm2?: number | null;
  return_conductor_material?: string | null;
  return_conductor_r_ohm_per_km_20c?: number | null;
  return_conductor_jth_1s_a_per_mm2?: number | null;
  return_conductor_ith_1s_a?: number | null;
  max_temperature_c: number;
  number_of_cores?: number;
  base_type_id?: string | null;
  trade_name?: string | null;
}

/**
 * Transformer Type.
 * Source: backend TransformerType dataclass.
 */
export interface TransformerType extends CatalogType {
  rated_power_mva: number;
  voltage_hv_kv: number;
  voltage_lv_kv: number;
  uk_percent: number;
  pk_kw: number;
  i0_percent: number;
  p0_kw: number;
  vector_group: string;
  cooling_class?: string;
  tap_min: number;
  tap_max: number;
  tap_step_percent: number;
}

/**
 * Tap-changer catalog type (OLTC/DETC).
 * Source: backend TapChangerItem dataclass (audit2 catalog, eng.13).
 */
export interface TapChangerCatalogType {
  id: string;
  catalog_namespace: string;
  catalog_version: string;
  label_pl: string;
  type: 'oltc' | 'detc';
  neutral_position: number;
  tap_count: number;
  step_percent: number;
  range_percent: number;
  regulated_side: 'hv' | 'lv';
  switching_time_s: number;
  operations_before_maintenance_thousand: number;
  supports_avr: boolean;
  applicable_to: string[];
}

/**
 * Switch Equipment Type.
 * Source: backend SwitchEquipmentType dataclass.
 */
export interface SwitchEquipmentType extends CatalogType {
  equipment_kind: string;
  un_kv: number;
  in_a: number;
  ik_ka: number;
  icw_ka: number;
  medium?: string;
}

/**
 * Converter Type (PV/Wind/BESS inverter).
 * Source: backend ConverterType dataclass.
 */
export interface ConverterType extends CatalogType {
  kind: 'PV' | 'WIND' | 'BESS';
  un_kv: number;
  sn_mva: number;
  pmax_mw: number;
  qmin_mvar?: number;
  qmax_mvar?: number;
  cosphi_min?: number;
  cosphi_max?: number;
  e_kwh?: number;
  model?: string;
  control_mode?: string | null;
  grid_code?: string | null;
  dynamic_profile_id?: string | null;
  ptpiree_status?: 'POWIAZANY' | 'NIEPOWIAZANY' | string;
  ptpiree_certificate_ref?: string | null;
  ptpiree_document_number?: string | null;
  ptpiree_document_acceptance_date?: string | null;
  ptpiree_wos_version?: string | null;
  ptpiree_wipwc_version?: string | null;
  ptpiree_ppm_scope?: string | null;
  ptpiree_source_url?: string | null;
  ptpiree_publication_date?: string | null;
  verification_status?: string | null;
  source_reference?: string | null;
  catalog_status?: string | null;
}

/**
 * Measurement Transformer Type (CT/VT).
 * Derived from backend MeasurementRating + catalog patterns.
 */
export interface MeasurementTransformerType extends CatalogType {
  measurement_kind: 'CT' | 'VT';
  ratio_primary: number;
  ratio_secondary: number;
  accuracy_class: string;
  burden_va: number;
}

/**
 * Protection Device Type.
 * Source: backend ProtectionDeviceType dataclass.
 */
export interface ProtectionDeviceType extends CatalogType {
  /**
   * Nazwa polska rekordu z KANONICZNEGO katalogu MV (`/mv-protection-device-types`).
   * Biblioteka analityczna koordynacji zwraca `name`; katalog MV — `name_pl`.
   */
  name_pl?: string;
  vendor?: string;
  model?: string;
  series?: string;
  rated_current_a?: number;
  notes_pl?: string;
  source_catalog?: string;
  unverified?: boolean;
  unverified_ranges?: boolean;
  functions_supported?: string[];
  curves_supported?: string[];
}

// =============================================================================
// Phase 1 — Extended catalog namespaces
// =============================================================================

/**
 * LV Cable Type (KABEL_NN).
 * Source: backend LVCableType dataclass.
 */
export interface LVCableType extends CatalogType {
  u_n_kv: number;
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  i_max_a: number;
  conductor_material?: string;
  insulation_type?: string;
  cross_section_mm2: number;
  number_of_cores: number;
}

/**
 * Load Type (OBCIAZENIE).
 * Source: backend LoadType dataclass.
 */
export interface LoadCatalogType extends CatalogType {
  model: string;
  p_kw: number;
  q_kvar?: number;
  cos_phi?: number;
  cos_phi_mode: string;
  profile_id?: string;
}

/**
 * MV Apparatus Type (APARAT_SN).
 * Source: backend MVApparatusType dataclass.
 */
export interface MVApparatusType extends CatalogType {
  device_kind: string;
  u_n_kv: number;
  i_n_a: number;
  breaking_capacity_ka?: number;
  making_capacity_ka?: number;
}

/**
 * LV Apparatus Type (APARAT_NN).
 * Source: backend LVApparatusType dataclass.
 */
export interface LVApparatusType extends CatalogType {
  device_kind: string;
  u_n_kv: number;
  i_n_a: number;
  breaking_capacity_ka?: number;
}

/**
 * CT Type (Przekładnik prądowy).
 * Source: backend CTType dataclass.
 */
export interface CTCatalogType extends CatalogType {
  ratio_primary_a: number;
  ratio_secondary_a: number;
  accuracy_class?: string;
  burden_va?: number;
  /**
   * Rodzaj rdzenia WYPROWADZONY z klasy w katalogu (IEC 61869-2, V12K-239): klasa
   * z literą P ⇒ `protection`, klasa liczbowa ⇒ `metering`. `null`/brak = nie da się
   * ustalić (klasa nieznana albo zapis złożony opisujący dwa rdzenie).
   *
   * `dual` katalog referencyjny wystawi dopiero z DANĄ producenta o konstrukcji
   * dwurdzeniowej — dziś żaden z 12 typów jej nie ma, więc warunek 87T pozostaje
   * nierozstrzygalny (jawny brak danych, nie luka kontraktu).
   */
  application?: 'protection' | 'metering' | 'dual' | null;
  /**
   * Znamionowa graniczna liczba dokładności rdzenia zabezpieczeniowego (ALF, liczba po
   * literze P — IEC 61869-2 § 3.4.201). Rdzeń pomiarowy jej nie ma (`null`).
   */
  accuracy_limit_factor?: number | null;
}

/**
 * VT Type (Przekładnik napięciowy).
 * Source: backend VTType dataclass.
 */
export interface VTCatalogType extends CatalogType {
  ratio_primary_v: number;
  ratio_secondary_v: number;
  accuracy_class?: string;
  /** Klasa uzwojenia POMIAROWEGO w przekładniku dwuuzwojeniowym (V12K-255). */
  accuracy_class_metering?: string | null;
  /** Rodzaj uzwojenia wyprowadzony z klasy przez backend (IEC 61869-3). */
  application?: string | null;
  /** Współczynnik napięciowy F_v i czas jego obowiązywania (IEC 61869-3 tab. 2). */
  rated_voltage_factor?: number | null;
  voltage_factor_duration_s?: number | null;
  burden_va?: number | null;
  /** Czy przekładnik ma uzwojenie resztkowe do pomiaru napięcia zerowego. */
  has_residual_winding?: boolean | null;
}

/**
 * PV Inverter Type (ZRODLO_NN_PV).
 * Source: backend PVInverterType dataclass.
 */
export interface PVInverterCatalogType extends CatalogType {
  s_n_kva: number;
  p_max_kw: number;
  un_kv?: number;
  u_n_kv?: number;
  voltage_kv?: number;
  voltage_lv_kv?: number;
  cos_phi_min?: number;
  cos_phi_max?: number;
  control_mode?: string;
  grid_code?: string;
  dynamic_profile_id?: string | null;
  ptpiree_status?: 'POWIAZANY' | 'NIEPOWIAZANY' | string;
  ptpiree_certificate_ref?: string | null;
  ptpiree_document_number?: string | null;
  ptpiree_document_acceptance_date?: string | null;
  ptpiree_wos_version?: string | null;
  ptpiree_wipwc_version?: string | null;
  ptpiree_ppm_scope?: string | null;
  ptpiree_source_url?: string | null;
  ptpiree_publication_date?: string | null;
}

/**
 * BESS Inverter Type (ZRODLO_NN_BESS).
 * Source: backend BESSInverterType dataclass.
 */
export interface BESSInverterCatalogType extends CatalogType {
  p_charge_kw: number;
  p_discharge_kw: number;
  e_kwh: number;
  s_n_kva?: number;
  un_kv?: number;
  u_n_kv?: number;
  voltage_kv?: number;
  voltage_lv_kv?: number;
  dynamic_profile_id?: string | null;
  ptpiree_status?: 'POWIAZANY' | 'NIEPOWIAZANY' | string;
  ptpiree_certificate_ref?: string | null;
  ptpiree_document_number?: string | null;
  ptpiree_document_acceptance_date?: string | null;
  ptpiree_wos_version?: string | null;
  ptpiree_wipwc_version?: string | null;
  ptpiree_ppm_scope?: string | null;
  ptpiree_source_url?: string | null;
  ptpiree_publication_date?: string | null;
}

/**
 * Generic inverter catalog type (INVERTER).
 * Source: backend InverterType dataclass.
 */
export interface InverterCatalogType extends CatalogType {
  kind: 'PV' | 'WIND' | 'BESS' | 'INVERTER' | string;
  un_kv: number;
  sn_mva: number;
  pmax_mw: number;
  qmin_mvar?: number | null;
  qmax_mvar?: number | null;
  cosphi_min?: number | null;
  cosphi_max?: number | null;
  model?: string | null;
  ptpiree_status?: 'POWIAZANY' | 'NIEPOWIAZANY' | string;
  ptpiree_certificate_ref?: string | null;
  ptpiree_document_number?: string | null;
  ptpiree_document_acceptance_date?: string | null;
  ptpiree_wos_version?: string | null;
  ptpiree_wipwc_version?: string | null;
  ptpiree_ppm_scope?: string | null;
  ptpiree_source_url?: string | null;
  ptpiree_publication_date?: string | null;
}

/**
 * MV surge arrester type (OGRANICZNIK_SN).
 * Source: backend SurgeArresterType dataclass.
 */
export interface SurgeArresterCatalogType extends CatalogType {
  u_m_kv: number;
  mcov_kv: number;
  u_rated_kv: number;
  u_residual_at_10ka_kv: number;
  tov_10s_kv: number;
  energy_class: number;
  energy_absorption_kj_per_kv: number;
  bil_protected_kv: number;
  application?: string;
  neutral_system?: string | null;
  model?: string | null;
  standard?: string;
}

/**
 * Shunt capacitor bank type (KOMPENSATOR_SN).
 * Source: backend ShuntCapacitorType dataclass.
 */
export interface ShuntCapacitorCatalogType extends CatalogType {
  rated_mvar: number;
  rated_kv: number;
  loss_kw?: number | null;
}

/**
 * PTPiREE certificate snapshot record.
 * Source: backend PtpireeGeneratorCertificate dataclass.
 */
export interface PtpireeGeneratorCertificateCatalogType extends CatalogType {
  manufacturer: string;
  model: string;
  device_type: string;
  document_number: string;
  document_acceptance_date: string;
  wos_version: string;
  wipwc_version: string;
  ppm_scope: string;
  firmware_version?: string | null;
  source_url: string;
  publication_date?: string | null;
  accepted_from?: string | null;
  manufacturer_key: string;
  model_key: string;
}

/**
 * MV System Source Type (ZRODLO_SN).
 * Source: backend SourceSystemType dataclass.
 */
export interface SourceSystemCatalogType extends CatalogType {
  voltage_rating_kv: number;
  sk3_mva: number;
  ik3_ka?: number;
  rx_ratio?: number;
  earthing_system?: string;
  short_circuit_model?: string;
  operator_name?: string;
  supply_role?: string;
  series?: string;
  catalog_number?: string;
  data_source?: string;
}

/**
 * Branch Point Type (słup rozgałęźny / ZKSN).
 * Source: backend mv_branch_point_catalog.py.
 */
export interface BranchPointCatalogType extends CatalogType {
  kind: 'BRANCH_POLE' | 'ZKSN';
  medium: 'LINE_OVERHEAD' | 'CABLE';
  series?: string;
  switch_device_kind?: string;
  switch_rated_current_a?: number;
  branch_ports_count: number;
  topology_role?: string;
  catalog_namespace?: 'mv_branch_points';
}

export interface MVApparatusCatalogType extends CatalogType {
  device_kind: string;
  u_n_kv: number;
  i_n_a: number;
  breaking_capacity_ka?: number;
  making_capacity_ka?: number;
}

/**
 * Catalog Binding — links element to catalog item with version.
 * Source: backend CatalogBinding / CatalogBindingPayload.
 */
export interface CatalogBinding {
  catalog_namespace: CatalogNamespace;
  catalog_item_id: string;
  catalog_item_version: string;
  materialize?: boolean;
  snapshot_mapping_version?: string;
}

/**
 * Canonical catalog namespace identifiers.
 */
export type CatalogNamespace =
  | 'KABEL_SN'
  | 'LINIA_SN'
  | 'ZRODLO_SN'
  | 'TRAFO_SN_NN'
  | 'APARAT_SN'
  | 'APARAT_NN'
  | 'KABEL_NN'
  | 'CT'
  | 'VT'
  | 'OGRANICZNIK_SN'
  | 'KOMPENSATOR_SN'
  | 'OBCIAZENIE'
  | 'ZRODLO_NN_PV'
  | 'ZRODLO_NN_BESS'
  | 'ZABEZPIECZENIE'
  | 'NASTAWY_ZABEZPIECZEN'
  | 'PTPIREE_CERTYFIKAT_GENERATORA'
  | 'CONVERTER'
  | 'INVERTER'
  | 'mv_branch_points';

/**
 * Union of all catalog type categories.
 */
export type TypeCategory = 'LINE' | 'CABLE' | 'TRANSFORMER' | 'SWITCH_EQUIPMENT'
  | 'CONVERTER' | 'MEASUREMENT_TRANSFORMER' | 'PROTECTION_DEVICE'
  | 'LV_CABLE' | 'LOAD' | 'MV_APPARATUS' | 'LV_APPARATUS'
  | 'CT' | 'VT' | 'PV_INVERTER' | 'BESS_INVERTER' | 'SYSTEM_SOURCE'
  | 'SURGE_ARRESTER' | 'SHUNT_CAPACITOR' | 'PTPIREE_CERTIFICATE' | 'BRANCH_POLE' | 'ZKSN';

/**
 * Type reference in element (points to catalog).
 */
export interface TypeReference {
  type_ref: string | null; // UUID or null
  type_name?: string; // Resolved name for display
  type_category?: TypeCategory;
}
