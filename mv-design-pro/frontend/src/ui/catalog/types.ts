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
  max_temperature_c: number;
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
}

/**
 * VT Type (Przekładnik napięciowy).
 * Source: backend VTType dataclass.
 */
export interface VTCatalogType extends CatalogType {
  ratio_primary_v: number;
  ratio_secondary_v: number;
  accuracy_class?: string;
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
  | 'OBCIAZENIE'
  | 'ZRODLO_NN_PV'
  | 'ZRODLO_NN_BESS'
  | 'ZABEZPIECZENIE'
  | 'NASTAWY_ZABEZPIECZEN'
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
  | 'BRANCH_POLE' | 'ZKSN';

/**
 * Type reference in element (points to catalog).
 */
export interface TypeReference {
  type_ref: string | null; // UUID or null
  type_name?: string; // Resolved name for display
  type_category?: TypeCategory;
}
