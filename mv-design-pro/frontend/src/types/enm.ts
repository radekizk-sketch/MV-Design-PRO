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
  /** Mnożnik czasowy (TMS) dla charakterystyk odwrotnych IEC 60255; null/undefined dla DT. */
  time_multiplier?: number | null;
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

/** Warunki przyłączenia z dokumentu OSD (dane wejściowe projektu — karta K2). */
export interface ConnectionConditions {
  moc_przylaczeniowa_mw?: number | null;
  wymagany_cos_phi?: number | null;
  tryb_pracy?: string | null;
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
  /** Blok addytywny (backend `set_connection_conditions`); brak = nie podano. */
  connection_conditions?: ConnectionConditions | null;
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

/** Referencja do portu pola SN (immutable adres endpointu połączenia). */
export interface PortRef {
  port_id: string;
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
  /** Jawny port endpointu A (od strony from_bus_ref). Opcjonalny dla
   *  wstecznej kompatybilności; brak → readiness blocker E030. */
  endpoint_a_port?: PortRef | null;
  /** Jawny port endpointu B (od strony to_bus_ref). */
  endpoint_b_port?: PortRef | null;
  /**
   * V12K-229: materiał i przekrój żyły przewodu gołego. Backend niesie je od karty
   * F-K1 faza 7, lustro NIE — a bez nich nie da się uzasadnić współczynnika k dla
   * linii napowietrznej (dla przewodu gołego temperaturę graniczną wyznacza utrata
   * wytrzymałości mechanicznej żyły i osprzęt, nie izolacja, której nie ma).
   */
  conductor_material?: string | null;
  cross_section_mm2?: number | null;
  /** Dane CIEPLNE żyły (IEC 60949) — jak w `Cable`. */
  ith_1s_a?: number | null;
  jth_1s_a_per_mm2?: number | null;
  operating_temperature_c?: number | null;
  short_circuit_temperature_c?: number | null;
  thermal_source_ref?: string | null;
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
  conductor_material?: string | null;
  cross_section_mm2?: number | null;
  number_of_cores?: number | null;
  return_conductor_cross_section_mm2?: number | null;
  return_conductor_material?: string | null;
  return_conductor_r_ohm_per_km_20c?: number | null;
  return_conductor_jth_1s_a_per_mm2?: number | null;
  return_conductor_ith_1s_a?: number | null;
  rating?: BranchRating | null;
  /**
   * V12K-229: dodane EPR. Backend przyjmuje `XLPE | EPR | PVC | PAPER`, a katalog SN
   * ma 18 rekordów EPR — lustro deklarowało tę wartość jako NIEMOŻLIWĄ, choć backend
   * ją zwraca. Rozjazd unii jest gorszy od brakującego pola: kod gałęziący się po
   * izolacji „wyczerpująco" pomijał realny przypadek bez ostrzeżenia kompilatora.
   */
  insulation?: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | null;
  /** Jawny port endpointu A (od strony from_bus_ref). Opcjonalny dla
   *  wstecznej kompatybilności; brak → readiness blocker E030. */
  endpoint_a_port?: PortRef | null;
  /** Jawny port endpointu B (od strony to_bus_ref). */
  endpoint_b_port?: PortRef | null;
  /**
   * Dane CIEPLNE żyły fazowej (IEC 60949) — kryterium wytrzymałości zwarciowej
   * przewodu. Backend niesie je od kart F-K1 (V12K-210/211), lustro NIE — więc
   * front nie miał typowanego dostępu do danych, które model już przewozi.
   * Wystarcza JEDNA z dwóch: Ith(1 s) wprost albo gęstość Jth(1 s) do przemnożenia
   * przez przekrój.
   */
  ith_1s_a?: number | null;
  jth_1s_a_per_mm2?: number | null;
  /** Para temperatur uzasadniająca współczynnik k: robocza → graniczna zwarciowa. */
  operating_temperature_c?: number | null;
  short_circuit_temperature_c?: number | null;
  /** Źródło danych cieplnych (norma / karta producenta). */
  thermal_source_ref?: string | null;
  /** Mufy kablowe na odcinku — punkty bez podziału topologii (brief 1 §4 pkt 4). */
  cable_joints?: CableJoint[] | null;
}

/**
 * Mufa kablowa — punkt na segmencie kabla SN bez podziału topologii.
 * Lustro `enm/models.py::CableJoint`. Do V12K-229 pole `cable_joints` nie było w
 * kontrakcie, więc adapter SLD czytał je przez rzutowanie `as unknown as`, ktore
 * wylacza kontrole typow — dokladnie ten mechanizm przepuscil dwie zgadniete nazwy
 * pol w V12K-226.
 */
export interface CableJoint {
  id: string;
  parent_segment_id: string;
  /** Odległość od endpointu A [km]. */
  position_km: number;
  joint_type: 'mufa_termoutwardzalna' | 'mufa_zimna' | 'mufa_olejowa' | 'mufa_zywiczna';
  catalog_ref?: string | null;
  name?: string | null;
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

/**
 * Kanoniczny przełącznik zaczepów (ENM TapChanger). Jedyne źródło prawdy o
 * regulacji transformatora — konsumuje go glif OLTC na SLD (karta SLD-02).
 * None/undefined = brak regulacji (zachowanie jak dla pola bez zaczepów).
 */
export interface TapChanger {
  regulation_type: 'NONE' | 'DETC' | 'OLTC';
  regulated_winding: 'HV' | 'LV';
  neutral_position: number;
  current_position: number;
  min_position: number;
  max_position: number;
  step_percent: number;
  control_mode: 'MANUAL' | 'AUTOMATIC' | 'PROFILE' | 'REMOTE';
  voltage_setpoint_kv?: number | null;
  deadband_kv?: number | null;
}

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
  tap_changer?: TapChanger | null;
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

export type GeneratorConnectionVariant =
  | 'LV_BEHIND_STATION_TRANSFORMER'
  | 'DEDICATED_MV_CONNECTION'
  | 'SOURCE_CONNECTION_STATION'
  | 'nn_side'
  | 'block_transformer';

export interface Generator extends ENMElement {
  bus_ref: string;
  p_mw: number;
  q_mvar?: number | null;
  gen_type?: 'synchronous' | 'pv_inverter' | 'wind_inverter' | 'fw_pmsg' | 'fw_dfig' | 'fw_scig' | 'bess' | null;
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
   * - 'DEDICATED_MV_CONNECTION': przez dedykowane pole SN i transformator przyłączeniowy
   * - 'SOURCE_CONNECTION_STATION': przez osobną stację przyłączeniową źródła
   * - 'nn_side' / 'block_transformer': legacy aliases accepted on input
   * - null: brak informacji → FixAction generator.connection_variant_missing
   */
  connection_variant?: GeneratorConnectionVariant | null;

  /** Referencja do transformatora blokowego (ref_id). Wymagana przy 'block_transformer'. */
  blocking_transformer_ref?: string | null;

  /** Referencja do stacji (ref_id substacji). Wymagana przy 'nn_side'. */
  station_ref?: string | null;

  /**
   * Moduł NC RFG per ENEA profile (enea.yaml source of truth):
   * A: Mikro (0.8–1000 kW), B: Małe (1–50 MW), C: Duże (50–75 MW), D: B. duże (>75 MW).
   * Ustawiany przez backend przy bind profilem operatora. null = brak profilu.
   */
  nc_rfg_module?: 'A' | 'B' | 'C' | 'D' | null;
}

/**
 * W2b-DANE (POLECENIE_DER_SN_TOPOLOGIA_2026-07): migawka toru DER przyłączonego po
 * stronie SN — zapisywana przez backend na `generator.meta.der_topology`. Lustro
 * kontraktu operacji (`DerTopologyPayload` w domainOps.ts). Falownik siedzi na szynie
 * nN producenta; punkt przyłączenia do sieci to dedykowane pole źródłowe SN.
 */
export interface DerTopologyMeta {
  connection_level: 'nn' | 'sn';
  inverter_output_voltage_kv?: number | null;
  has_manufacturer_lv_switchgear: boolean;
  lv_switchgear_variant: 'none' | 'single-bus' | 'multi-feeder' | 'combiner' | 'integrated-skid';
  has_block_transformer: boolean;
  has_dedicated_mv_field: boolean;
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
  /** Phase 0A audit fix 8/8: GPZ HV side (110 kV) sekcje — eliminuje
   *  synthesize w adapterze SLD. */
  gpz_hv_sections?: GPZSection[] | null;
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
  /** Kody funkcji zabezpieczeniowych ANSI/IEC do wyświetlenia na SLD, np.
   *  ['87T','51','50','51N'] — stringi (NIE enum); lustro mechanizmu
   *  OzeField.protection_codes. Mirror backendowego `Bay.protection_codes`.
   *  Additive, default []. */
  protection_codes?: string[];
  /** Phase 0A audit fix 8/8: kanoniczny ID pola dla dyspozytora ("10", "23/1"). */
  bay_number?: string | null;
  /** Krótka nazwa odpływu/feedera (UI label osobny od bay.name). */
  feeder_short_name?: string | null;
  /** Cel feedera (substation ref docelowej stacji) — eliminuje wnioskowanie
   *  z grafu w adapterze SLD. */
  outgoing_destination_ref?: string | null;
  /** Phase 0B-1: snapshot SCADA telemetry per-pole (CB/DS/ES actual_state,
   *  control_mode, pending_command). Adapter SLD konsumuje gdy obecne;
   *  brak → 'unknown' (Invariant 9). Definicja typu BayRuntimeState niżej. */
  runtime_state?: BayRuntimeState | null;
  /** W1 (RECENZJA_L2 §1/§12.1, V12K-145): aparaty PIERWOTNE pola na snapshocie
   *  ENM — lustro backendowego `Bay.primary_devices` (models.py:855, domknięcie
   *  STOP-notatki F9.2: backend serializuje je na `Bay` w `EnergyNetworkModel`).
   *  Adapter (`projectBayPrimaryDevices`) rysuje tor pierwotny Z DANYCH gdy
   *  niepuste. Additive, default [] (pole bez danych → konwencja §12.4). */
  primary_devices?: BayPrimaryDevice[];
}

import type {
  FixActionSurfaceDescriptor,
  WizardSurfaceStepId,
} from './fixActionSurface';
import type { SemanticIssue } from './domainOps';

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
  | 'BATTERY'
  // F9.6 (SLD_CAD_SPEC_V3 §12.5, V12K-028): ogranicznik przepięć — rysowany
  // WYŁĄCZNIE gdy pochodzi z danych (mirror `backend/src/enm/models.py`).
  | 'SURGE_ARRESTER';

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
  /** F10.6 (SLD_CAD_SPEC_V3 §19.1, D1, V12K-035): identyfikator PER-APARAT
   *  (np. "Q1", "QE1", "T1") jako dana projektowa — lustro
   *  `backend/src/enm/models.py::BayPrimaryDevice.designation`. `null`/brak =
   *  dana niedostarczona, render pozostaje przy fallbacku konwencji. */
  designation?: string | null;
  /** Recenzja NO-GO 2026-07-17 pkt 10 (spec §12.5): typologia uziemienia —
   *  WYŁĄCZNIE dla kind='ES' (albo gałęzi SA): uziemnik pola / ekrany kabla /
   *  konstrukcja / punkt neutralny / gałąź ogranicznika. Lustro
   *  `backend/src/enm/models.py::BayPrimaryDevice.earthing_role`. `null`/brak
   *  = dana niedostarczona (generyczny uziemnik, zero domysłu). */
  earthing_role?: 'field_earth' | 'cable_screen' | 'structure' | 'neutral_point' | 'surge_ground' | null;
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

/**
 * ABB UniSwitch cell types (mirror of the optional `cell_type` Literal on
 * BayBaseModel / SNFieldSpec). The closed set matches catalog §4 "Rodzaje pól".
 * The authoritative frontend enum lives in
 * ui/sld/v2/station-rozdzielnia/abbFieldLibrary.ts; this mirror documents the
 * backend contract.
 */
export type AbbCellTypeSN =
  | 'SDC'
  | 'SDF'
  | 'CBC'
  | 'DBC'
  | 'BRC'
  | 'SEC'
  | 'SBC'
  | 'SMC'
  | 'SDM_V'
  | 'SDM_C';

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
  /** ABB UniSwitch cell type (catalog §4 "Rodzaje pól"). Optional/additive. */
  cell_type?: AbbCellTypeSN | null;
  /** Szablon pola producenta (Reference Engine). Optional/additive. */
  bay_template_ref?: string | null;
  /** Rodzina rozdzielnicy producenta (Reference Engine). Optional/additive. */
  switchgear_family_ref?: string | null;
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
  station_refs?: string[];
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
  /** F10.6 (SLD_CAD_SPEC_V3 §18.3, D3, V12K-036): układ pomiarowy CT —
   *  3×CT fazowe vs przekładnik sumujący/Ferranti dla składowej zerowej I0.
   *  WYŁĄCZNIE dla measurement_type==='CT'; `null`/brak = dana
   *  niedostarczona (WHITE BOX — zero domysłu). */
  ct_arrangement?: '3xCT' | 'ferranti' | null;
  /** F10.6 (SLD_CAD_SPEC_V3 §20.2, D4): układ VT — otwarty trójkąt (3U0,
   *  warunek konieczny dla 67N kierunkowego) vs gwiazda. WYŁĄCZNIE dla
   *  measurement_type==='VT'; `null`/brak = dotychczasowe uproszczenie. */
  vt_arrangement?: 'open_delta' | 'star' | null;
  /** CTVT-MODEL (W5/V12K-173): liczba rdzeni przekładnika prądowego (osobne
   *  uzwojenia wtórne, np. pomiarowe 0,2S + zabezpieczeniowe 5P10; tabliczka
   *  CT wg IEC 61869-2). Dane producenta; WYŁĄCZNIE dla
   *  measurement_type==='CT'; wartość > 0. `null`/brak = dana niedostarczona
   *  (uczciwy brak, zero fabrykacji). Oś odrębna od `ct_arrangement`. */
  ct_cores?: number | null;
  /** CTVT-MODEL (W5/V12K-173): typ montażu przekładnika napięciowego —
   *  szynowy (`bus`) vs kablowy (`cable`). Dane producenta/projektowe;
   *  WYŁĄCZNIE dla measurement_type==='VT'. Oś odrębna od `vt_arrangement`
   *  (open_delta/star = oś 3U0). `null`/brak = dana niedostarczona. */
  vt_mounting?: 'bus' | 'cable' | null;
}

// ---------------------------------------------------------------------------
// ProtectionAssignment (przypięcie zabezpieczenia do wyłącznika)
// ---------------------------------------------------------------------------

export interface ProtectionAssignment extends ENMElement {
  breaker_ref: string;
  ct_ref?: string | null;
  vt_ref?: string | null;
  /** F10.6 (SLD_CAD_SPEC_V3 §20.2, D5, V12K-036): CT dodatkowe strefy
   *  różnicowej (87T wymaga CT po OBU stronach transformatora — `ct_ref`
   *  niesie JEDEN CT, ta lista niesie pozostałe CT granicy strefy). Puste/
   *  brak = strefa 2×CT NIE jest modelowana (degradacja do dotychczasowego
   *  uproszczenia „obecność transformatora"). */
  ct_refs_secondary?: string[];
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

export interface LineRunSegmentRefV1 {
  segment_ref: string;
  order: number;
}

export interface LineRunStationRefV1 {
  substation_ref: string;
  order: number;
}

export interface LineRunV1 {
  id: string;
  name?: string | null;
  run_kind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  starting_bay_ref: string;
  starting_port_ref: string;
  segments: LineRunSegmentRefV1[];
  stations: LineRunStationRefV1[];
  nop_station_ref?: string | null;
  parent_run_ref?: string | null;
  branch_origin_station_ref?: string | null;
}

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
  /** Phase 0B-4: ciągi liniowe — explicit order stacji (zamiast wnioskowania z grafu). */
  line_runs?: LineRunV1[];
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
// ENM v2.0 Projection (z GET /enm/v2-projection)
// ---------------------------------------------------------------------------

export type V2ProjectionQuality = 'pelna' | 'czesciowa' | 'wymaga_decyzji';
export type V2ReadinessStatus = 'gotowy' | 'wymaga_uzupelnienia' | 'zablokowany';

export interface V2Header {
  enm_version: '2.0';
  projection_version: 'v12xx.m1.1';
  source_enm_version: string;
  name: string;
  revision: number;
  source_hash_sha256: string;
}

export interface V2ElementReference {
  id: string;
  ref_id: string;
  name: string;
  kind: string;
  namespace: string;
  catalog_ref: string | null;
  catalog_namespace: string | null;
  quality_status: V2ProjectionQuality;
  readiness_status: V2ReadinessStatus;
}

export interface V2OperatingVariant {
  ref_id: string;
  name: string;
  variant_type: 'uklad_normalny' | 'przelaczeniowy' | 'po_zakloceniu';
  switching_snapshot_ref: string;
  source: 'migracja_m1';
}

export interface V2SwitchingDeviceState {
  device_ref: string;
  state: 'closed' | 'open' | 'unknown';
  device_type: string;
}

export interface V2SwitchingStateSnapshot {
  ref_id: string;
  name: string;
  variant_ref: string;
  source: 'enm_v1_status';
  switch_states: V2SwitchingDeviceState[];
}

export interface V2ZeroSequenceConfig {
  element_ref: string;
  element_kind: 'branch' | 'source' | 'transformer' | 'bus';
  r0: number | null;
  x0: number | null;
  b0: number | null;
  grounding_type: string | null;
  quality_status: V2ProjectionQuality;
}

export interface V2MigrationWarning {
  code: string;
  severity: 'informacja' | 'ostrzezenie' | 'blokada_migracji';
  element_ref: string | null;
  message_pl: string;
}

export interface V2ProjectionSummary {
  buses: number;
  branches: number;
  transformers: number;
  sources: number;
  loads: number;
  generators: number;
  substations: number;
  bays: number;
  measurements: number;
  protection_assignments: number;
  branch_points: number;
  switching_devices: number;
  zero_sequence_configs: number;
  warnings: number;
}

export interface EnergyNetworkModelV2Projection {
  header: V2Header;
  projection_hash_sha256: string;
  element_refs: V2ElementReference[];
  operating_variants: V2OperatingVariant[];
  switching_state_snapshots: V2SwitchingStateSnapshot[];
  zero_sequence_configs: V2ZeroSequenceConfig[];
  operator_profiles: Record<string, unknown>[];
  source_profiles: Record<string, unknown>[];
  frt_profiles: Record<string, unknown>[];
  q_u_profiles: Record<string, unknown>[];
  cos_phi_p_profiles: Record<string, unknown>[];
  load_profiles: Record<string, unknown>[];
  automation_assets: Record<string, unknown>[];
  migration_warnings: V2MigrationWarning[];
  summary: V2ProjectionSummary;
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
  /** Wynik post-hooka validate_semantic (semantic_rules). Puste = brak problemów. */
  semantic_issues?: SemanticIssue[];
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
