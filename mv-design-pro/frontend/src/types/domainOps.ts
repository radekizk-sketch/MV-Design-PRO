/**
 * Typy operacji domenowych — budowa sieci SN od GPZ.
 * Lustrzane odbicie backend domain_ops_models.py.
 */

import type { FixActionSurfaceDescriptor } from './fixActionSurface';

// --- Envelope ---
export interface DomainOpEnvelope {
  project_id: string;
  snapshot_base_hash: string;
  operation: {
    name: CanonicalOpName;
    idempotency_key: string;
    payload: Record<string, unknown>;
  };
}

// --- Canonical operation names ---
export type CanonicalOpName =
  | 'add_grid_source_sn'
  | 'add_sn_bay'
  | 'continue_trunk_segment_sn'
  | 'insert_station_on_segment_sn'
  | 'insert_branch_pole_on_segment_sn'
  | 'insert_zksn_on_segment_sn'
  | 'start_branch_segment_sn'
  | 'insert_section_switch_sn'
  | 'connect_secondary_ring_sn'
  | 'set_normal_open_point'
  | 'add_transformer_sn_nn'
  | 'assign_catalog_to_element'
  | 'update_element_parameters'
  // Operacje nN / źródła
  | 'add_nn_outgoing_field'
  | 'add_converter_source'
  | 'add_genset_nn'
  | 'add_ups_nn'
  | 'add_nn_load'
  | 'add_ct'
  | 'add_vt'
  | 'add_relay'
  | 'delete_element'
  | 'refresh_snapshot';

export const CANONICAL_OPERATION_NAMES = [
  'add_grid_source_sn',
  'add_sn_bay',
  'continue_trunk_segment_sn',
  'insert_station_on_segment_sn',
  'insert_branch_pole_on_segment_sn',
  'insert_zksn_on_segment_sn',
  'start_branch_segment_sn',
  'insert_section_switch_sn',
  'connect_secondary_ring_sn',
  'set_normal_open_point',
  'add_transformer_sn_nn',
  'assign_catalog_to_element',
  'update_element_parameters',
  'add_nn_outgoing_field',
  'add_converter_source',
  'add_genset_nn',
  'add_ups_nn',
  'add_nn_load',
  'add_ct',
  'add_vt',
  'add_relay',
  'delete_element',
  'refresh_snapshot',
] as const satisfies readonly CanonicalOpName[];

const CANONICAL_OPERATION_SET = new Set<string>(CANONICAL_OPERATION_NAMES);

export function isCanonicalOpName(name: string): name is CanonicalOpName {
  return CANONICAL_OPERATION_SET.has(name);
}

export function assertCanonicalOpName(name: string): CanonicalOpName {
  if (!isCanonicalOpName(name)) {
    throw new Error(`Niekanoniczna nazwa operacji: ${name}`);
  }
  return name;
}

export function canonicalOperationInput<T extends CanonicalOpName>(
  name: T,
  context?: Record<string, unknown>,
): {
  canonicalOp: T;
  context?: Record<string, unknown>;
} {
  return { canonicalOp: name, context };
}

// --- Response ---
export interface DomainOpResponse {
  snapshot: Record<string, unknown>;
  logical_views: Record<string, unknown>;
  readiness: ReadinessInfo;
  fix_actions: FixActionItem[];
  changes: ChangeSet;
  selection_hint: SelectionHint | null;
  audit_trail: AuditEntry[];
  domain_events: DomainEvent[];
  materialized_params?: MaterializedParamsEnvelope;
  layout?: {
    layout_hash: string;
    layout_version: string;
  };
}

export interface MaterializedCatalogParams {
  catalog_item_id: string;
  catalog_item_version: string | null;
  [key: string]: unknown;
}

export interface MaterializedParamsEnvelope {
  lines_sn: Record<string, MaterializedCatalogParams>;
  transformers_sn_nn: Record<string, MaterializedCatalogParams>;
  [namespace: string]: Record<string, MaterializedCatalogParams>;
}

export interface ReadinessInfo {
  ready: boolean;
  blockers: ReadinessBlocker[];
  warnings: ReadinessWarning[];
}

export interface ReadinessBlocker {
  code: string;
  severity: 'BLOKUJACE';
  message_pl: string;
  element_ref: string | null;
}

export interface ReadinessWarning {
  code: string;
  severity: 'OSTRZEZENIE';
  message_pl: string;
  element_ref: string | null;
}

export interface FixActionItem {
  code: string;
  action_type: 'OPEN_MODAL' | 'NAVIGATE_TO_ELEMENT' | 'SELECT_CATALOG' | 'ADD_MISSING_DEVICE';
  element_ref: string | null;
  modal_type: string | null;
  panel: string | null;
  step: string | null;
  focus: string | null;
  payload_hint?: Record<string, unknown> | null;
  surface_descriptor?: FixActionSurfaceDescriptor | null;
  message_pl: string;
}

export interface ChangeSet {
  created_element_ids: string[];
  updated_element_ids: string[];
  deleted_element_ids: string[];
}

export interface SelectionHint {
  element_id: string | null;
  element_type: string | null;
  zoom_to: boolean;
}

export interface AuditEntry {
  step: number;
  action: string;
  element_id: string | null;
  detail: string;
}

export interface DomainEvent {
  event_seq: number;
  event_type: string;
  element_id: string | null;
  detail: string;
}

// --- InsertAt ---
export type InsertAtMode = 'RATIO' | 'ODLEGLOSC_OD_POCZATKU_M' | 'ANCHOR';

export interface InsertAt {
  mode: InsertAtMode;
  value: number | AnchorValue;
}

export interface AnchorValue {
  anchor_id: string;
  offset_m: number;
}

// --- Insert at UI labels (mapping) ---
export function mapUILabelToInsertAt(label: string, value?: number): InsertAt {
  switch (label) {
    case 'SRODEK_ODCINKA':
      return { mode: 'RATIO', value: 0.5 };
    case 'PODZIAL_WSPOLCZYNNIKIEM':
      return { mode: 'RATIO', value: value ?? 0.5 };
    case 'ODLEGLOSC_OD_POCZATKU':
      return { mode: 'ODLEGLOSC_OD_POCZATKU_M', value: value ?? 0 };
    default:
      return { mode: 'RATIO', value: 0.5 };
  }
}

// --- Segment spec ---
export interface SegmentSpec {
  rodzaj: 'KABEL' | 'LINIA_NAPOWIETRZNA';
  dlugosc_m: number;
  name: string | null;
  catalog_binding?: CatalogBindingPayload | null;
  /** @deprecated Pole kompatybilności; kanonicznie używaj catalog_binding. */
  catalog_ref?: string | null;
}

export interface CatalogBindingPayload {
  catalog_namespace: string;
  catalog_item_id: string;
  catalog_item_version: string;
  materialize?: boolean;
  snapshot_mapping_version?: string;
}

// --- Station ---
export type StationType = 'inline' | 'branch' | 'terminal' | 'sectional';

export interface StationSpec {
  station_type: StationType;
  station_role: 'STACJA_SN_NN';
  station_name: string | null;
  sn_voltage_kv: number;
  nn_voltage_kv: number;
}

// --- SN Field ---
export type SNFieldRole = 'LINIA_IN' | 'LINIA_OUT' | 'LINIA_ODG' | 'TRANSFORMATOROWE' | 'SPRZEGLO';

export interface SNFieldSpec {
  field_role: SNFieldRole;
  catalog_bindings: CatalogBindings | null;
}

export interface CatalogBindings {
  line_catalog_ref: string | null;
  switch_catalog_ref: string | null;
  ct_catalog_ref: string | null;
  vt_catalog_ref: string | null;
}

// --- Transformer ---
export interface TransformerSpec {
  create: true;
  catalog_binding?: CatalogBindingPayload | null;
  /** @deprecated Pole kompatybilności; kanonicznie używaj catalog_binding. */
  transformer_catalog_ref?: string | null;
  model_type: 'DWU_UZWOJENIOWY';
  tap_changer_present: boolean;
}

// --- NN Block ---
export type NNFeederRole =
  | 'ODPLYW_NN'
  | 'ODPLYW_REZERWOWY'
  | 'ZRODLO_NN_PV'
  | 'ZRODLO_NN_BESS'
  | 'ZRODLO_NN_FW'
  | 'ZRODLO_NN_AGREGAT'
  | 'ZRODLO_NN_UPS';

export interface NNFeederSpec {
  feeder_role: NNFeederRole;
  catalog_bindings: CatalogBindings | null;
}

export interface NNBlockSpec {
  create_nn_bus: true;
  main_breaker_nn: true;
  outgoing_feeders_nn_count: number;
  outgoing_feeders_nn: NNFeederSpec[];
}

// --- SourceNN Types (FAZA 5: model danych źródeł nN) ---

export type NNSourceType = 'PV_INVERTER' | 'BESS_INVERTER' | 'FW_INVERTER' | 'GENSET' | 'UPS';

export type NNSwitchKind = 'WYLACZNIK' | 'ROZLACZNIK' | 'BEZPIECZNIK';
export type NNSwitchState = 'OTWARTY' | 'ZAMKNIETY';

export interface NNSwitchSpec {
  switch_kind: NNSwitchKind;
  normal_state: NNSwitchState;
  catalog_binding: CatalogBindingPayload | null;
}

export type SourceFieldKind = 'PV' | 'BESS' | 'FW' | 'AGREGAT' | 'UPS';

export interface NNSourceFieldSpec {
  source_field_kind: SourceFieldKind;
  switch_spec: NNSwitchSpec;
  voltage_nn_kv: number;
  field_name: string | null;
  field_label: string | null;
}

export type PVControlMode = 'STALY_COS_PHI' | 'Q_OD_U' | 'P_OD_U' | 'WYLACZONE';
export type PVMeasurementPoint = 'UTWORZ_NOWY' | 'UZYJ_ISTNIEJACEGO' | 'BRAK';

export type BESSOperationMode = 'TYLKO_GENERACJA' | 'TYLKO_MAGAZYNOWANIE' | 'DWUKIERUNKOWY' | 'WYLACZONE';
export type BESSControlStrategy = 'STALA_MOC' | 'PROFIL' | 'REGULACJA_NAPIECIA' | 'REGULACJA_MOCY_BIERNEJ';
export type ConverterSourceTechnology = 'PV' | 'BESS' | 'FW';
export type ConverterConnectionVariant = 'nn_side' | 'block_transformer';

export type GensetOperationMode = 'PRACA_CIAGLA' | 'PRACA_AWARYJNA' | 'PRACA_SZCZYTOWA' | 'WYLACZONE';

export interface GensetSpec {
  catalog_item_id: string | null;
  catalog_item_version: string | null;
  rated_power_kw: number;
  rated_voltage_kv: number;
  power_factor: number;
  operation_mode: GensetOperationMode;
  fuel_type: 'DIESEL' | 'GAZ' | 'BIOPALIWO' | 'INNY' | null;
  source_name: string | null;
  source_label: string | null;
}

export type UPSOperationMode = 'ONLINE' | 'LINE_INTERACTIVE' | 'OFFLINE' | 'WYLACZONE';

export interface UPSSpec {
  catalog_item_id: string | null;
  catalog_item_version: string | null;
  rated_power_kw: number;
  backup_time_min: number;
  operation_mode: UPSOperationMode;
  battery_type: 'LI_ION' | 'VRLA' | 'NICD' | 'INNY' | null;
  source_name: string | null;
  source_label: string | null;
}

export interface MaterializedSourceParams {
  catalog_item_id: string;
  catalog_item_version: string;
  sn_mva: number | null;
  pmax_mw: number | null;
  un_kv: number | null;
  k_sc: number | null;
  cos_phi_min: number | null;
  cos_phi_max: number | null;
  e_kwh: number | null;
}

export interface SourceNN {
  element_id: string;
  source_type: NNSourceType;
  field_id: string;
  switch_id: string;
  bus_nn_ref: string;
  station_ref: string;
  catalog_item_id: string | null;
  catalog_item_version: string | null;
  materialized_params: MaterializedSourceParams | null;
  operation_mode: string;
  constraints: Record<string, unknown>;
  readiness_codes: string[];
  name: string | null;
  label: string | null;
  in_service: boolean;
}

// --- Operation Payloads for nN sources ---

export type SourcePlacement = 'NEW_FIELD' | 'EXISTING_FIELD';

export interface AddConverterSourcePayload {
  source_technology: ConverterSourceTechnology;
  connection_variant: ConverterConnectionVariant;
  bus_nn_ref: string;
  station_ref: string;
  placement: SourcePlacement | null;
  existing_field_ref: string | null;
  source_field: {
    source_field_kind: ConverterSourceTechnology;
    field_name: string | null;
    catalog_binding: CatalogBindingPayload | null;
  } | null;
  source_name: string | null;
  quantity: number | null;
  control_mode: string | null;
  power_setpoint_mw: number | null;
  q_min_mvar: number | null;
  q_max_mvar: number | null;
  bess_mode: string | null;
  soc_min_percent: number | null;
  soc_max_percent: number | null;
  blocking_transformer_ref: string | null;
  catalog_binding: CatalogBindingPayload | null;
  materialized_params: Record<string, unknown> | null;
}

export interface AddGensetNNPayload {
  bus_nn_ref: string;
  station_ref: string;
  placement: SourcePlacement;
  existing_field_ref: string | null;
  source_field: NNSourceFieldSpec | null;
  genset_spec: GensetSpec;
}

export interface AddUPSNNPayload {
  bus_nn_ref: string;
  station_ref: string;
  placement: SourcePlacement;
  existing_field_ref: string | null;
  source_field: NNSourceFieldSpec | null;
  ups_spec: UPSSpec;
}

export type NNLoadKind = 'SKUPIONY' | 'ROZPROSZONY';
export type NNConnectionType = 'JEDNOFAZOWY' | 'TROJFAZOWY';

export interface AddNNLoadPayload {
  feeder_ref: string;
  bus_nn_ref: string;
  load_kind: NNLoadKind;
  active_power_kw: number;
  reactive_power_kvar: number | null;
  cos_phi: number | null;
  load_profile_ref: string | null;
  connection_type: NNConnectionType;
  load_name: string | null;
  load_label: string | null;
}

// --- Operation payloads ---
export interface AddGridSourceSNPayload {
  source_name?: string;
  bus_name?: string;
  voltage_kv: number;
  sk3_mva?: number;
  ik3_ka?: number;
  rx_ratio?: number;
  catalog_binding?: CatalogBindingPayload | null;
  /** @deprecated Pole kompatybilności; kanonicznie używaj catalog_binding. */
  catalog_ref?: string | null;
}

export interface AddSnBayPayload {
  bus_ref: string;
  station_ref?: string | null;
  bay_role?: 'IN' | 'OUT' | 'FEEDER' | 'TR' | 'COUPLER' | 'MEASUREMENT' | 'OZE';
  field_name?: string | null;
  apparatus_kind?: 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'MEASUREMENT' | null;
  gpz_section_id?: string | null;
  catalog_binding?: CatalogBindingPayload | null;
}

export interface ContinueTrunkSegmentSNPayload {
  trunk_id: string;
  from_terminal_id: string;
  segment: SegmentSpec;
  parametry_jawne?: Record<string, unknown>;
}

export interface InsertStationOnSegmentSNPayload {
  segment_id: string;
  insert_at: InsertAt;
  station: StationSpec;
  sn_fields: SNFieldSpec[];
  transformer: TransformerSpec;
  nn_block: NNBlockSpec;
  options: {
    create_transformer_field: boolean;
    create_default_fields: boolean;
    create_nn_bus: boolean;
  };
}

export interface StartBranchSegmentSNPayload {
  from_ref: string;
  from_port?: string;
  segment: SegmentSpec;
}

export interface ConnectSecondaryRingSNPayload {
  from_bus_ref: string;
  to_bus_ref: string;
  segment?: SegmentSpec;
}

export interface SetNormalOpenPointPayload {
  switch_ref: string;
  corridor_ref?: string;
}

