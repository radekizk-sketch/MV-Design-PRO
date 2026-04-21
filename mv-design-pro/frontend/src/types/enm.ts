/**
 * EnergyNetworkModel (ENM) — TypeScript canonical types.
 *
 * Mirror of backend Pydantic v2 models.
 * Discriminated union on Branch.type.
 */

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface GroundingConfig {
  type: 'isolated' | 'petersen_coil' | 'directly_grounded' | 'resistor_grounded';
  r_ohm?: number | null;
  x_ohm?: number | null;
}

export interface BusLimits {
  u_min_pu?: number | null;
  u_max_pu?: number | null;
}

export interface BranchRating {
  in_a?: number | null;
  ith_ka?: number | null;
  idyn_ka?: number | null;
}

export interface GenLimits {
  p_min_mw?: number | null;
  p_max_mw?: number | null;
  q_min_mvar?: number | null;
  q_max_mvar?: number | null;
}

export interface MeasurementRating {
  ratio_primary: number;
  ratio_secondary: number;
  accuracy_class?: string | null;
  burden_va?: number | null;
}

export interface ProtectionSetting {
  function_type: 'overcurrent_50' | 'overcurrent_51' | 'earth_fault_50N'
    | 'earth_fault_51N' | 'directional_67' | 'directional_67N';
  threshold_a?: number | null;
  time_delay_s?: number | null;
  curve_type?: 'DT' | 'IEC_SI' | 'IEC_VI' | 'IEC_EI' | 'IEC_LI' | null;
  is_directional?: boolean;
}

// ---------------------------------------------------------------------------
// Catalog-first: parameter source & overrides
// ---------------------------------------------------------------------------

export type ParameterSource = 'CATALOG' | 'OVERRIDE';
export type CatalogSourceMode = 'KATALOG' | 'MIGRACJA' | 'EKSPERCKI_RECZNY';

export interface ParameterOverride {
  key: string;
  value: number | string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// ENMElement — base for all elements
// ---------------------------------------------------------------------------

export interface ENMElement {
  id: string;
  ref_id: string;
  name: string;
  tags: string[];
  meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Header + Defaults
// ---------------------------------------------------------------------------

export interface ENMDefaults {
  frequency_hz: number;
  unit_system: 'SI';
}

export interface ENMHeader {
  enm_version: '1.0';
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  hash_sha256: string;
  defaults: ENMDefaults;
}

// ---------------------------------------------------------------------------
// Bus
// ---------------------------------------------------------------------------

export interface Bus extends ENMElement {
  voltage_kv: number;
  frequency_hz?: number | null;
  phase_system: '3ph';
  zone?: string | null;
  grounding?: GroundingConfig | null;
  nominal_limits?: BusLimits | null;
}

// ---------------------------------------------------------------------------
// Branches — discriminated union on `type`
// ---------------------------------------------------------------------------

export interface BranchBase extends ENMElement {
  from_bus_ref: string;
  to_bus_ref: string;
  status: 'closed' | 'open';
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
  parameter_source?: ParameterSource | null;
  source_mode?: CatalogSourceMode | null;
  materialized_params?: Record<string, unknown> | null;
  overrides?: ParameterOverride[] | null;
}

export interface OverheadLine extends BranchBase {
  type: 'line_overhead';
  length_km: number;
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  b_siemens_per_km?: number | null;
  r0_ohm_per_km?: number | null;
  x0_ohm_per_km?: number | null;
  b0_siemens_per_km?: number | null;
  rating?: BranchRating | null;
}

export interface Cable extends BranchBase {
  type: 'cable';
  length_km: number;
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  b_siemens_per_km?: number | null;
  r0_ohm_per_km?: number | null;
  x0_ohm_per_km?: number | null;
  b0_siemens_per_km?: number | null;
  rating?: BranchRating | null;
  insulation?: 'XLPE' | 'PVC' | 'PAPER' | null;
}

export interface SwitchBranch extends BranchBase {
  type: 'switch' | 'breaker' | 'bus_coupler' | 'disconnector';
  r_ohm?: number | null;
  x_ohm?: number | null;
}

export interface FuseBranch extends BranchBase {
  type: 'fuse';
  rated_current_a?: number | null;
  rated_voltage_kv?: number | null;
}

export type Branch = OverheadLine | Cable | SwitchBranch | FuseBranch;

// ---------------------------------------------------------------------------
// Transformer
// ---------------------------------------------------------------------------

export interface Transformer extends ENMElement {
  hv_bus_ref: string;
  lv_bus_ref: string;
  sn_mva: number;
  uhv_kv: number;
  ulv_kv: number;
  uk_percent: number;
  pk_kw: number;
  p0_kw?: number | null;
  i0_percent?: number | null;
  vector_group?: string | null;
  hv_neutral?: GroundingConfig | null;
  lv_neutral?: GroundingConfig | null;
  tap_position?: number | null;
  tap_min?: number | null;
  tap_max?: number | null;
  tap_step_percent?: number | null;
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
  parameter_source?: ParameterSource | null;
  source_mode?: CatalogSourceMode | null;
  materialized_params?: Record<string, unknown> | null;
  overrides?: ParameterOverride[] | null;
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export interface Source extends ENMElement {
  bus_ref: string;
  model: 'thevenin' | 'short_circuit_power' | 'external_grid';
  substation_ref?: string | null;
  gpz_section_id?: string | null;
  sk3_mva?: number | null;
  ik3_ka?: number | null;
  r_ohm?: number | null;
  x_ohm?: number | null;
  rx_ratio?: number | null;
  r0_ohm?: number | null;
  x0_ohm?: number | null;
  z0_z1_ratio?: number | null;
  c_max?: number | null;
  c_min?: number | null;
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
  parameter_source?: ParameterSource | null;
  source_mode?: CatalogSourceMode | null;
  materialized_params?: Record<string, unknown> | null;
  overrides?: ParameterOverride[] | null;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export interface Load extends ENMElement {
  bus_ref: string;
  p_mw: number;
  q_mvar: number;
  model: 'pq' | 'zip';
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
  quantity?: number | null;
  parameter_source?: ParameterSource | null;
  source_mode?: CatalogSourceMode | null;
  materialized_params?: Record<string, unknown> | null;
  overrides?: ParameterOverride[] | null;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export interface Generator extends ENMElement {
  bus_ref: string;
  p_mw: number;
  q_mvar?: number | null;
  gen_type?: 'synchronous' | 'pv_inverter' | 'wind_inverter' | 'bess' | null;
  limits?: GenLimits | null;
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
  quantity?: number | null;
  n_parallel?: number | null;
  parameter_source?: ParameterSource | null;
  source_mode?: CatalogSourceMode | null;
  materialized_params?: Record<string, unknown> | null;
  overrides?: ParameterOverride[] | null;

  /**
   * Wariant przylaczenia PV/BESS:
   * - 'nn_side': po stronie nN stacji (przez transformator stacji SN/nN)
   * - 'block_transformer': przez transformator blokowy do SN
   * - null: brak informacji → FixAction generator.connection_variant_missing
   */
  connection_variant?: 'nn_side' | 'block_transformer' | null;

  /** Referencja do transformatora blokowego (ref_id). Wymagana przy 'block_transformer'. */
  blocking_transformer_ref?: string | null;

  /** Referencja do stacji (ref_id substacji). Wymagana przy 'nn_side'. */
  station_ref?: string | null;
}

// ---------------------------------------------------------------------------
// Substation (stacja SN/nn — kontener logiczny z rozdzielnicami)
// ---------------------------------------------------------------------------

export interface GPZSection {
  section_id: string;
  order: number;
  name?: string | null;
  line_field_name?: string | null;
  bus_ref: string;
  incoming_source_ref?: string | null;
  left_coupler_ref?: string | null;
  right_coupler_ref?: string | null;
}

export interface Substation extends ENMElement {
  station_type: 'gpz' | 'mv_lv' | 'switching' | 'customer' | 'inline' | 'branch' | 'terminal' | 'sectional';
  bus_refs: string[];
  transformer_refs: string[];
  entry_point_ref?: string | null;
  gpz_sections?: GPZSection[] | null;
}

// ---------------------------------------------------------------------------
// Bay (pole rozdzielcze SN)
// ---------------------------------------------------------------------------

export interface Bay extends ENMElement {
  bay_role: 'IN' | 'OUT' | 'TR' | 'COUPLER' | 'FEEDER' | 'MEASUREMENT' | 'OZE';
  substation_ref: string;
  bus_ref: string;
  gpz_section_id?: string | null;
  equipment_refs: string[];
  protection_ref?: string | null;
}

import type {
  FixActionSurfaceDescriptor,
  WizardSurfaceStepId,
} from './fixActionSurface';

// ---------------------------------------------------------------------------
// Bay canonical model V10 (read-model contract)
// ---------------------------------------------------------------------------

export type BayCanonicalRole =
  | 'LINIA_IN'
  | 'LINIA_OUT'
  | 'TRANSFORMATOROWE'
  | 'LINIA_ODG'
  | 'SPRZEGLO'
  | 'POMIAROWE'
  | 'PV_SN'
  | 'BESS_SN'
  | 'FW_SN';

export type BayDeviceState =
  | 'zamkniety'
  | 'otwarty'
  | 'zamkniety_naped_rozbrojony'
  | 'otwarty_naped_rozbrojony'
  | 'nieznany'
  | 'awaria';

export type BayControlMode =
  | 'miejscowe'
  | 'zdalne'
  | 'lokalne_zablokowane'
  | 'odstawione';

export interface BaySwitchState {
  actual_state: BayDeviceState;
  commanded_state?: 'zamknij' | 'otworz' | null;
  control_mode: BayControlMode;
  armed_for_close?: boolean | null;
  armed_for_open?: boolean | null;
  communication_ok: boolean;
  interlock_blocked: boolean;
  cause_code?: string | null;
  last_state_change_at?: string | null;
  last_command_at?: string | null;
}

export interface BayOperatingState {
  normal_position: 'zamkniety' | 'otwarty';
  current_position: 'zamkniety' | 'otwarty' | 'nieznany';
  discrepancy_alarm: boolean;
}

export type BayPrimaryDeviceKind =
  | 'CB'
  | 'LOAD_SWITCH'
  | 'DS'
  | 'ES'
  | 'CT'
  | 'VT'
  | 'CABLE_HEAD'
  | 'TRANSFORMER_DEVICE'
  | 'FUSE'
  | 'GENERATOR_PV'
  | 'GENERATOR_BESS'
  | 'GENERATOR_FW'
  | 'PCS'
  | 'BATTERY';

export type BayPrimaryPlacement =
  | 'UPSTREAM'
  | 'MIDSTREAM'
  | 'DOWNSTREAM'
  | 'OFF_PATH'
  | 'GROUND_BRANCH';

export interface BayPrimaryDevice {
  device_ref: string;
  linked_ref?: string | null;
  catalog_ref?: string | null;
  symbol_ref: string;
  kind: BayPrimaryDeviceKind;
  placement: BayPrimaryPlacement;
  section_side?: 'LEFT' | 'CENTER' | 'RIGHT' | null;
  is_controllable: boolean;
  render_variant?: string | null;
  switch_state?: BaySwitchState | null;
  operating_state?: BayOperatingState | null;
}

export interface BayMeasurements {
  ia_a?: number | null;
  ib_a?: number | null;
  ic_a?: number | null;
  zero_sequence_current_a?: number | null;
  uab_kv?: number | null;
  ubc_kv?: number | null;
  uca_kv?: number | null;
  zero_sequence_voltage_kv?: number | null;
  active_power_mw?: number | null;
  reactive_power_mvar?: number | null;
  apparent_power_mva?: number | null;
  current_a?: number | null;
  power_factor?: number | null;
  frequency_hz?: number | null;
}

export interface BayMeasurementSet {
  side: 'pole' | 'strona_szyn' | 'strona_odplywu' | 'strona_lewa' | 'strona_prawa';
  values: BayMeasurements;
}

export interface BayMeasurementChain {
  chain_ref: string;
  ct_refs: string[];
  vt_refs: string[];
  uses_3i0: boolean;
  uses_3u0: boolean;
  zero_sequence_current_source: 'suma_ct' | 'przekladnik_ferrantiego' | 'zewnetrzne' | 'brak';
  zero_sequence_voltage_source: 'otwarty_trojkat_vt' | 'uzwojenie_resztkowe_vt' | 'obliczone' | 'brak';
  topology: 'ct_only' | 'ct_vt' | 'ct_vt_3u0' | 'vt_only';
  measurement_sets: BayMeasurementSet[];
}

export interface BaySecondaryUnitRef {
  unit_ref: string;
  unit_kind: 'zabezpieczenie' | 'sterownik' | 'pomiar' | 'rejestrator';
  shared_with_bay_refs: string[];
}

export interface BaySecondaryArchitecture {
  type:
    | 'zintegrowane_zabezpieczenie_i_sterownik'
    | 'oddzielne_zabezpieczenie_i_sterownik'
    | 'tylko_zabezpieczenie'
    | 'tylko_sterownik'
    | 'brak_urzadzenia_wtornego';
  measurement_provider:
    | 'zabezpieczenie'
    | 'sterownik'
    | 'osobny_uklad_pomiarowy'
    | 'mieszany'
    | 'brak';
}

export interface ProtectionSettingValue {
  key: string;
  value?: number | string | boolean | null;
  unit?: string | null;
  quality: 'obliczone' | 'reczne' | 'domyslne';
}

export interface ProtectionFunctionState {
  code: string;
  available: boolean;
  enabled: boolean;
  picked_up: boolean;
  tripped: boolean;
  blocked: boolean;
  required_inputs: ('ct' | 'vt' | '3i0' | '3u0')[];
  optional_inputs: ('ct' | 'vt' | '3i0' | '3u0')[];
  missing_input_policy:
    | 'blokada_zapisu'
    | 'blokada_obliczen'
    | 'ostrzezenie'
    | 'degradacja_funkcji'
    | 'wynik_czesciowy';
  settings_ref?: string | null;
  settings: ProtectionSettingValue[];
  execution_mode: 'tylko_alarm' | 'pobudzenie' | 'wyzwolenie';
  execution_device_ref?: string | null;
  starts_spz: boolean;
  blocks_reclose: boolean;
  operator_ack_required_after_trip: boolean;
}

export interface SpzState {
  bound_breaker_ref: string;
  enabled: boolean;
  fast_attempts_max: number;
  slow_attempts_max: number;
  attempts_done: number;
  fast_time_s?: number | null;
  slow_time_s?: number | null;
  blocked: boolean;
  blocked_reason?: string | null;
  state: 'gotowe' | 'w_trakcie' | 'zakonczone' | 'odstawione';
}

export interface AlarmEntry {
  code: string;
  active: boolean;
  acknowledged: boolean;
  severity: 'informacja' | 'ostrzezenie' | 'alarm' | 'awaria';
  timestamp: string;
  message_pl: string;
}

export interface EventEntry {
  code: string;
  timestamp: string;
  source: 'sterowanie' | 'ochrona' | 'pomiar' | 'komunikacja' | 'system';
  message_pl: string;
}

export interface DisturbanceRecorderState {
  available: boolean;
  last_record_at?: string | null;
  records_count: number;
}

export interface TrendState {
  available: boolean;
  channels: string[];
}

export interface BayProtectionControlUnit {
  unit_ref: string;
  manufacturer?: string | null;
  model?: string | null;
  functions: ProtectionFunctionState[];
  measurement_inputs: Record<string, boolean>;
  automation_features: Record<string, boolean>;
  spz?: SpzState | null;
  alarms: AlarmEntry[];
  events: EventEntry[];
  disturbance_recorder: DisturbanceRecorderState;
  trends: TrendState;
  settings_mode: 'automatyczne' | 'reczne';
  settings_ref?: string | null;
}

export interface InterlockEntry {
  code: string;
  active: boolean;
  reason: string;
  blocking_device_refs: string[];
}

export interface BayInterlockSet {
  entries: InterlockEntry[];
}

export interface BayControlSurface {
  controllable_device_refs: string[];
  open_requires_confirmation: boolean;
  close_requires_confirmation: boolean;
  kas_available: boolean;
  local_remote_transfer_supported: boolean;
}

export interface BayCommandExecutionState {
  command_ref: string;
  target_device_ref: string;
  command: 'zamknij' | 'otworz' | 'kas';
  state: 'oczekuje' | 'przyjete' | 'odrzucone' | 'wykonane' | 'przeterminowane';
  rejected_reason?: string | null;
  created_at: string;
  finished_at?: string | null;
}

export interface BayEnergizationSafetyState {
  energized_from_bus_side: boolean;
  energized_from_feeder_side: boolean;
  grounded: boolean;
  visible_isolation_gap: boolean;
  safe_to_work: boolean;
  unsafe_reason_pl?: string | null;
}

export interface BayRuntimeState {
  secondary_communication_status: 'ok' | 'degraded' | 'offline';
  last_good_update_at?: string | null;
  control_availability: 'dostepne' | 'czesciowo_dostepne' | 'niedostepne';
  measurement_availability: 'dostepne' | 'czesciowe' | 'niedostepne';
  primary_device_states: Record<string, BaySwitchState>;
  active_alarms: AlarmEntry[];
  pending_command?: BayCommandExecutionState | null;
  energization_and_safety: BayEnergizationSafetyState;
}

export interface BayScenarioState {
  scenario_ref: string;
  overridden_position?: 'zamkniety' | 'otwarty' | 'nieznany' | null;
  source: 'bazowy' | 'wariant' | 'symulacja_przelaczen' | 'ruch';
}

export interface BaySourceEndpoint {
  source_kind: 'PV' | 'BESS' | 'FW';
  inverter_ref?: string | null;
  storage_ref?: string | null;
  turbine_ref?: string | null;
  block_transformer_ref?: string | null;
  requires_vt: boolean;
  requires_synchrocheck: boolean;
  operating_mode: 'praca_sieciowa' | 'ladowanie' | 'rozladowanie' | 'gotowosc' | 'odstawione';
}

export interface BayBaseModel {
  bay_ref: string;
  bay_role: BayCanonicalRole;
  specialization: 'BRAK' | 'POTRZEBY_WLASNE';
  substation_ref: string;
  gpz_section_id?: string | null;
  primary_devices: BayPrimaryDevice[];
  measurement_chain?: BayMeasurementChain | null;
  secondary_units: BaySecondaryUnitRef[];
  secondary_architecture: BaySecondaryArchitecture;
  protection_config?: BayProtectionControlUnit | null;
  control_surface: BayControlSurface;
  interlocks: BayInterlockSet;
  source_endpoint?: BaySourceEndpoint | null;
}

export interface BayShortCircuitSourceContribution {
  source_ref: string;
  source_kind: 'GPZ' | 'TRANSFORMATOR' | 'PV' | 'BESS' | 'FW' | 'INNE';
  reference_point: string;
  fault_type: '3F' | '2F' | '1F' | '1F_ZIEMIA';
  ikss_ka?: number | null;
  ip_ka?: number | null;
  ith_ka?: number | null;
  percent_share?: number | null;
  zero_sequence_share_percent?: number | null;
  direction: 'do_pola' | 'od_pola';
}

export interface BayPowerFlowSourceContribution {
  source_ref: string;
  source_kind: 'GPZ' | 'TRANSFORMATOR' | 'PV' | 'BESS' | 'FW' | 'INNE';
  reference_point: string;
  p_mw?: number | null;
  q_mvar?: number | null;
  s_mva?: number | null;
  i_a?: number | null;
  percent_share_p?: number | null;
  percent_share_q?: number | null;
  direction: 'do_odplywu' | 'do_szyn';
}

export interface BayEarthFaultPath {
  neutral_grounding_mode: 'izolowany' | 'cewka_petersena' | 'rezystor' | 'bezposrednio_uziemiony' | 'nieznany';
  zero_sequence_current_source: 'suma_ct' | 'przekladnik_ferrantiego' | 'zewnetrzne' | 'brak';
  zero_sequence_voltage_source: 'otwarty_trojkat_vt' | 'uzwojenie_resztkowe_vt' | 'obliczone' | 'brak';
  closure_path_elements: string[];
  transformer_contribution_ref?: string | null;
  grounding_device_ref?: string | null;
}

export interface BayVerificationResult {
  continuous_current_ok?: boolean | null;
  thermal_withstand_ok?: boolean | null;
  dynamic_withstand_ok?: boolean | null;
  ct_ok?: boolean | null;
  vt_ok?: boolean | null;
  cable_head_ok?: boolean | null;
  main_switch_ok?: boolean | null;
  whole_power_path_ok?: boolean | null;
}

export interface BayProofBinding {
  proof_ref: string;
  primary_result_refs: string[];
  secondary_result_refs: string[];
  source_contribution_refs: string[];
  formula_refs: string[];
  input_data_refs: string[];
}

export interface BayProjectResults {
  run_ref: string;
  result_state: 'pelny' | 'czesciowy' | 'bledny';
  result_message_pl?: string | null;
  main_short_circuit_results_ref?: string | null;
  main_power_flow_results_ref?: string | null;
  source_contributions_sc: BayShortCircuitSourceContribution[];
  source_contributions_pf: BayPowerFlowSourceContribution[];
  verification: BayVerificationResult;
  earth_fault_path?: BayEarthFaultPath | null;
  proof_binding: BayProofBinding;
}

export interface BayCanonicalModel {
  schema_version: 'v10.bay.1';
  created_from: 'szablon' | 'recznie' | 'migracja' | 'przebudowa';
  integrity_status: 'kompletny' | 'po_migracji' | 'wymaga_uzupelnienia';
  audit_trail_ref?: string | null;
  base_model: BayBaseModel;
  runtime_state?: BayRuntimeState | null;
  scenario_state?: BayScenarioState | null;
  project_results_ref?: string | null;
}

// ---------------------------------------------------------------------------
// Junction (węzeł T — rozgałęzienie magistrali)
// ---------------------------------------------------------------------------

export interface Junction extends ENMElement {
  connected_branch_refs: string[];
  junction_type: 'T_node' | 'sectionalizer' | 'recloser_point' | 'NO_point';
}

export interface BranchPointSN extends ENMElement {
  branch_point_type: 'branch_pole' | 'zksn';
  parent_segment_id: string;
  bus_ref: string;
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
  catalog_version?: string | null;
  source_mode?: 'KATALOG' | 'MIGRACJA' | 'EKSPERCKI_RECZNY' | null;
  ports: {
    MAIN_IN: string;
    MAIN_OUT: string;
    BRANCH: string[];
  };
  branch_occupied?: Record<string, string> | null;
  switch_state?: 'open' | 'closed' | null;
  materialized_params?: Record<string, unknown> | null;
  completeness_status?: 'KOMPLETNY' | 'NIEKOMPLETNY' | 'BRAK_KATALOGU' | null;
  runtime_inputs?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Corridor (magistrala — ciąg linii SN)
// ---------------------------------------------------------------------------

export interface Corridor extends ENMElement {
  corridor_type: 'radial' | 'ring' | 'mixed';
  ordered_segment_refs: string[];
  no_point_ref?: string | null;
}

// ---------------------------------------------------------------------------
// Measurement (przekładnik CT/VT)
// ---------------------------------------------------------------------------

export interface Measurement extends ENMElement {
  measurement_type: 'CT' | 'VT';
  bus_ref: string;
  bay_ref?: string | null;
  rating: MeasurementRating;
  connection: 'star' | 'delta' | 'single_phase';
  purpose: 'protection' | 'metering' | 'combined';
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
  parameter_source?: ParameterSource | null;
  source_mode?: CatalogSourceMode | null;
  materialized_params?: Record<string, unknown> | null;
  overrides?: ParameterOverride[] | null;
}

// ---------------------------------------------------------------------------
// ProtectionAssignment (przypięcie zabezpieczenia do wyłącznika)
// ---------------------------------------------------------------------------

export interface ProtectionAssignment extends ENMElement {
  breaker_ref: string;
  ct_ref?: string | null;
  vt_ref?: string | null;
  device_type: 'overcurrent' | 'earth_fault' | 'directional_overcurrent'
    | 'distance' | 'differential' | 'custom';
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
  settings: ProtectionSetting[];
  is_enabled: boolean;
  parameter_source?: ParameterSource | null;
  source_mode?: CatalogSourceMode | null;
  materialized_params?: Record<string, unknown> | null;
  overrides?: ParameterOverride[] | null;
}

// ---------------------------------------------------------------------------
// ROOT
// ---------------------------------------------------------------------------

export interface EnergyNetworkModel {
  header: ENMHeader;
  buses: Bus[];
  branches: Branch[];
  transformers: Transformer[];
  sources: Source[];
  loads: Load[];
  generators: Generator[];
  substations: Substation[];
  bays: Bay[];
  junctions: Junction[];
  branch_points?: BranchPointSN[];
  corridors: Corridor[];
  measurements: Measurement[];
  protection_assignments: ProtectionAssignment[];
  /** Opcjonalne widoki logiczne Snapshota (kanoniczne wejście segmentacji SLD). */
  logical_views?: LogicalViewsV1;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  code: string;
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  message_pl: string;
  element_refs: string[];
  wizard_step_hint: string | null;
  wizard_step_id?: WizardSurfaceStepId | null;
  suggested_fix?: string | null;
}

export interface AnalysisAvailability {
  short_circuit_3f: boolean;
  short_circuit_1f: boolean;
  load_flow: boolean;
}

export interface ValidationResult {
  status: 'OK' | 'WARN' | 'FAIL';
  issues: ValidationIssue[];
  analysis_available: AnalysisAvailability;
}

// ---------------------------------------------------------------------------
// Topology Summary (z GET /enm/topology)
// ---------------------------------------------------------------------------

export interface TopologySummary {
  case_id: string;
  substations: Substation[];
  bays: Bay[];
  junctions: Junction[];
  corridors: Corridor[];
  bus_count: number;
  branch_count: number;
  transformer_count: number;
}

// ---------------------------------------------------------------------------
// Readiness Matrix (z GET /enm/readiness)
// ---------------------------------------------------------------------------

export interface AnalysisReadiness {
  short_circuit_3f: boolean;
  short_circuit_1f: boolean;
  load_flow: boolean;
  protection: boolean;
}

export interface TopologyCompleteness {
  has_substations: boolean;
  has_bays: boolean;
  has_junctions: boolean;
  has_corridors: boolean;
}

export interface ElementCounts {
  buses: number;
  branches: number;
  transformers: number;
  sources: number;
  loads: number;
  generators: number;
  substations: number;
  bays: number;
  junctions: number;
  corridors: number;
  measurements: number;
  protection_assignments: number;
}

export interface ReadinessMatrix {
  case_id: string;
  enm_revision: number;
  validation_status: 'OK' | 'WARN' | 'FAIL';
  analysis_readiness: AnalysisReadiness;
  topology_completeness: TopologyCompleteness;
  element_counts: ElementCounts;
}

// ---------------------------------------------------------------------------
// Selection System (SLD ↔ Kreator ↔ Inspektor)
// ---------------------------------------------------------------------------

export interface SelectionRef {
  /** Kanoniczny elementId (= ENMElement.ref_id = ElementRefV1.elementId) */
  elementId: string;
  /** Typ elementu (align z ElementTypeV1) */
  element_type: 'bus' | 'branch' | 'transformer' | 'source' | 'load' | 'generator'
    | 'substation' | 'bay' | 'junction' | 'corridor'
    | 'measurement' | 'protection_assignment';
  /** Krok kreatora powiązany z elementem */
  wizard_step_hint: string | null;
  wizard_step_id?: WizardSurfaceStepId | null;
}

// ---------------------------------------------------------------------------
// Topology Graph Summary (z GET /enm/topology/summary)
// ---------------------------------------------------------------------------

export interface AdjacencyEntry {
  bus_ref: string;
  neighbor_ref: string;
  via_ref: string;
  via_type: string;
}

export interface SpineNode {
  bus_ref: string;
  depth: number;
  is_source: boolean;
  children_refs: string[];
}

export interface TopologyGraphSummary {
  case_id: string;
  enm_revision: number;
  bus_count: number;
  branch_count: number;
  transformer_count: number;
  source_count: number;
  load_count: number;
  generator_count: number;
  measurement_count: number;
  protection_count: number;
  is_radial: boolean;
  has_cycles: boolean;
  adjacency: AdjacencyEntry[];
  spine: SpineNode[];
  lateral_roots: string[];
}

// ---------------------------------------------------------------------------
// Topology Operations (POST /enm/ops)
// ---------------------------------------------------------------------------

export interface TopologyOpIssue {
  code: string;
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  message_pl: string;
  element_ref?: string | null;
}

export interface TopologyOpResult {
  success: boolean;
  op: string;
  created_ref?: string | null;
  issues: TopologyOpIssue[];
  revision: number;
}

// ---------------------------------------------------------------------------
// V1 Domain Operation Response (POST /enm/ops — canonical envelope)
// ---------------------------------------------------------------------------

export type TerminalStatus = 'OTWARTY' | 'ZAJETY' | 'ZAREZERWOWANY_DLA_RINGU';

export interface TerminalRef {
  element_id: string;
  port_id: string;
  trunk_id: string | null;
  branch_id: string | null;
  status: TerminalStatus;
}

export interface TrunkViewV1 {
  corridor_ref: string;
  corridor_type: string;
  segments: string[];
  no_point_ref: string | null;
  terminals: TerminalRef[];
}

export interface BranchViewV1 {
  branch_id: string;
  from_element_id: string;
  from_port_id: string;
  segments: string[];
  terminals: TerminalRef[];
}

export interface SecondaryConnectorViewV1 {
  connector_id: string;
  from_element_id: string;
  to_element_id: string;
  segment_ref: string;
}

export interface LogicalViewsV1 {
  trunks: TrunkViewV1[];
  branches: BranchViewV1[];
  secondary_connectors: SecondaryConnectorViewV1[];
  terminals: TerminalRef[];
}

export interface MaterializedCatalogParams {
  catalog_item_id: string;
  catalog_item_version: string | null;
  [key: string]: unknown;
}

export interface MaterializedLineParams extends MaterializedCatalogParams {
  catalog_item_id: string;
  catalog_item_version: string | null;
  r_ohm_per_km: number | null;
  x_ohm_per_km: number | null;
  i_max_a: number | null;
}

export interface MaterializedTransformerParams extends MaterializedCatalogParams {
  catalog_item_id: string;
  catalog_item_version: string | null;
  u_k_percent: number | null;
  p0_kw: number | null;
  pk_kw: number | null;
  s_n_kva: number | null;
}

export interface MaterializedParams {
  lines_sn: Record<string, MaterializedLineParams>;
  transformers_sn_nn: Record<string, MaterializedTransformerParams>;
  [namespace: string]: Record<string, MaterializedCatalogParams>;
}

export interface LayoutInfo {
  layout_hash: string;
  layout_version: string;
}

export interface ReadinessInfo {
  ready: boolean;
  blockers: Array<{
    code: string;
    message_pl: string;
    element_ref: string | null;
    severity: string;
  }>;
  warnings: Array<{
    code: string;
    message_pl: string;
    element_ref: string | null;
    severity: string;
  }>;
}

export interface FixAction {
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

export interface SelectionHint {
  element_id: string;
  element_type: string;
  zoom_to: boolean;
}

export interface ChangesInfo {
  created_element_ids: string[];
  updated_element_ids: string[];
  deleted_element_ids: string[];
}

export interface DomainEvent {
  event_seq: number;
  event_type: string;
  element_id: string;
}

/** V1 canonical response envelope from POST /enm/ops. */
export interface DomainOpResponseV1 {
  snapshot: EnergyNetworkModel | null;
  logical_views: LogicalViewsV1;
  readiness: ReadinessInfo;
  fix_actions: FixAction[];
  changes: ChangesInfo;
  selection_hint: SelectionHint | null;
  audit_trail: unknown[];
  domain_events: DomainEvent[];
  materialized_params: MaterializedParams;
  layout: LayoutInfo;
  /** Present only on error responses. */
  error?: string;
  error_code?: string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isOverheadLine(b: Branch): b is OverheadLine {
  return b.type === 'line_overhead';
}

export function isCable(b: Branch): b is Cable {
  return b.type === 'cable';
}

export function isSwitchBranch(b: Branch): b is SwitchBranch {
  return ['switch', 'breaker', 'bus_coupler', 'disconnector'].includes(b.type);
}

export function isFuseBranch(b: Branch): b is FuseBranch {
  return b.type === 'fuse';
}
