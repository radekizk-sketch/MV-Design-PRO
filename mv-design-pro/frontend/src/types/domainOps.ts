/**
 * Typy operacji domenowych — budowa sieci SN od GPZ.
 *
 * Wyłącznie typy, których front faktycznie używa. Jedna prawda pól ładunku to klucze
 * czytane przez handler operacji (`backend/src/enm/domain_operations*.py`), spisane
 * w `CANONICAL_OPERATIONS` (`backend/src/domain/canonical_operations.py`) i przypięte
 * testem `backend/tests/ci/test_spec_operacji_rowna_odczytom_handlera.py`; interfejs
 * ładunku bez konsumenta nie jest tu utrzymywany (lustro bez użycia rozjeżdżało się
 * z handlerem bez śladu).
 */

import type { FixActionSurfaceDescriptor } from './fixActionSurface';
import type { DeklaracjeModulu, NastawyZabezpieczenModulu } from './enm';
import type { UziemienieEkranuKabla } from './uziemienie';

// --- Canonical operation names ---
//
// JEDNO źródło prawdy: tablica poniżej. Typ `CanonicalOpName` jest z niej WYPROWADZONY.
// Wcześniej typ (unia) i tablica runtime były zapisane osobno, a `satisfies readonly
// CanonicalOpName[]` pilnowało tylko JEDNEGO kierunku (tablica ⊆ unia). Nazwa obecna w unii,
// ale pominięta w tablicy, przechodziła kontrolę typów i kompilację, a w runtime
// `assertCanonicalOpName` odrzucał ją wyjątkiem — kontrolka w UI była martwa mimo poprawnego
// handlera w backendzie (tak zginęły `add_shunt_compensator_sn` i `add_surge_arrester_sn`).
// Wyprowadzenie typu z tablicy usuwa tę klasę błędu: rozjazd jest niewyrażalny.
export const CANONICAL_OPERATION_NAMES = [
  'add_grid_source_sn',
  'add_sn_bay',
  'continue_trunk_segment_sn',
  'insert_station_on_segment_sn',
  'append_station_on_endpoint',
  'insert_branch_pole_on_segment_sn',
  'insert_zksn_on_segment_sn',
  'start_branch_segment_sn',
  'insert_section_switch_sn',
  'connect_secondary_ring_sn',
  // POLA-W-TORZE: akcja naprawcza kontroli W042 — element z szyny głównej stacji na zacisk pola.
  'przepnij_element_na_pole',
  'set_normal_open_point',
  // W5-C: bieżące położenie łącznika w modelu bazowym (pozycja normalna bez zmian) —
  // karta łącznika i menu pola/aparatu na kanwie.
  'open_switch',
  'close_switch',
  // W5-C: wyposażenie pola SN (tryb katalog / szablon / wyczyść) — karta pola E-11.
  'set_bay_equipment',
  // Karta UX-04/POLE-LINIOWE-WZORZEC: stan obiektu pola (istniejący / projektowany) — karta pola E-11.
  'set_object_state',
  // Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC: położenie łącznika pola bez własnej gałęzi
  // (odłącznik, uziemnik, łącznik trójpołożeniowy) — menu aparatu na kanwie.
  'set_bay_apparatus_position',
  'add_transformer_sn_nn',
  'assign_catalog_to_element',
  'update_element_parameters',
  // Operacje nN / źródła
  'add_nn_outgoing_field',
  'add_converter_source',
  'add_genset_nn',
  'add_ups_nn',
  'add_shunt_compensator_sn',
  'add_surge_arrester_sn',
  // Odbiór i generator synchroniczny wprost na szynie SN — menu sekcji na schemacie.
  'add_load_sn',
  'add_generator_sn',
  'add_nn_load',
  // P0.9 (nN STUDIO, karta F §3): odcinek/rozdzielnica/aparat/sekcja nN — operacje
  // ISTNIEJĄ w backendzie od P0.1 (enm/domain_operations_v2.py), brak wpisu tutaj
  // czynił je niewywoływalnymi z UI (assertCanonicalOpName), tak jak K5-B poniżej.
  'add_nn_cable_segment',
  'add_nn_distribution_board',
  'add_nn_switch_device',
  'add_nn_section_coupler',
  'set_nn_cable_laying_conditions',
  // W5-E-TTIT: wyłącznik różnicowoprądowy (RCD) w torze instalacji odbiorczej nN —
  // operacja ISTNIEJE w backendzie (enm/domain_operations_v2.py::add_nn_rcd).
  'add_nn_rcd',
  // Menu kontekstowe schematu nN stacji (odcinek kablowy, aparat odpływowy, zacisk).
  'split_nn_segment',
  'merge_nn_segments',
  'copy_nn_feeder',
  // K5-B (H-3): nastawy trybu pracy źródła — operacja ISTNIEJE w backendzie
  // (V2_CANONICAL_OPS, enm/domain_operations_v2.py); brak wpisu tutaj czynił ją
  // niewywoływalną z UI (assertCanonicalOpName).
  'set_source_operating_mode',
  'add_ct',
  'add_vt',
  'add_relay',
  // Karta CT-JEDEN-WERDYKT: zapis obwodu wtórnego ISTNIEJĄCEGO przekładnika (obciążenie,
  // przewody, klasa) — edytor nastaw zabezpieczenia oraz edytor na karcie pola E-11;
  // operacja w V2_CANONICAL_OPS backendu od W3-B; bez wpisu tutaj sekcja obwodu byłaby
  // martwa (assertCanonicalOpName), a wiarygodność punktu oceny nieustalona.
  'set_measurement_secondary_circuit',
  // Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): pisarz nastaw zabezpieczenia w modelu.
  'update_protection_settings',
  // Warunki przyłączenia OSD (nagłówek modelu, krok E1 flow projektanta)
  'set_connection_conditions',
  // Karta modeli odbiorów: wiązanie odbioru z profilem modelu dynamicznego (ekran dynamiki,
  // akcja naprawcza `load.dynamika_missing`) — operacja w V2_CANONICAL_OPS backendu.
  'set_load_dynamic_binding',
  // Karta widmowa z pliku do katalogu projektu — panel „Karty widmowe" przestrzeni Model.
  'dodaj_karte_widmowa_projektu',
  // Wiązania katalogowe wytwórcy; klucz `karty_widmowe_ref` (przypisanie kart widmowych do
  // generatora) idzie przez domain-ops z panelu „Karty widmowe" — końcówka wiązań wytwórcy
  // (`/generators/{ref}/bindings`) tego klucza nie niesie.
  'set_der_catalog_bindings',
  // Phase 0B-3: CRUD GPZ sekcji (StationCard editor)
  'add_gpz_section',
  'update_gpz_section',
  'delete_gpz_section',
  'delete_element',
  'refresh_snapshot',
] as const;

export type CanonicalOpName = (typeof CANONICAL_OPERATION_NAMES)[number];

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
  /**
   * Naruszenia semantyki sieci po operacji (PR-C konsolidacji UI).
   * Walidator semantyczny w backendzie sprawdza po każdej operacji:
   * - kabel/słup (branch_pole musi być na linii napowietrznej)
   * - ZKSN/overhead (zksn musi być na kablu)
   * - DER/typ pola (generator OZE w polu o roli zgodnej)
   * Lista może być pusta. Frontend wyświetla je w SemanticIssuesBanner.
   */
  semantic_issues?: SemanticIssue[];
}

export interface SemanticIssue {
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
  element_id: string | null;
  field: string | null;
  suggested_fix: string | null;
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
// Tryby czytane przez handlery operacji wstawienia (`wspolczynnik_podzialu`,
// backend/src/enm/domain_operations.py) — tryb spoza słownika kończy się odmową.
export type InsertAtMode = 'RATIO' | 'ODLEGLOSC_OD_POCZATKU_M';

export interface InsertAt {
  mode: InsertAtMode;
  value: number;
}

export interface CatalogBindingPayload {
  catalog_namespace: string;
  catalog_item_id: string;
  catalog_item_version: string;
  materialize?: boolean;
  snapshot_mapping_version?: string;
}

// =============================================================================
// P0.9 (nN STUDIO): odcinek/rozdzielnica/aparat/sekcja nN — lustro
// enm/domain_operations_v2.py (add_nn_cable_segment, add_nn_distribution_board,
// add_nn_switch_device, add_nn_section_coupler, set_nn_cable_laying_conditions).
// =============================================================================

/** Warunki ułożenia odcinka nN (PN-HD 60364-5-52, karta P0.5a/G-D1) — obiekt
 *  opisu SUROWEGO wyboru (solver składa współczynniki na nowo z tablic przy
 *  każdym odczycie); alternatywnie napis „warunki katalogowe" = brak korekty. */
export interface NNCableLayingConditionsDescription {
  environment: 'powietrze' | 'grunt';
  insulation: 'PVC' | 'XLPE';
  ambient_temperature_c: number;
  circuit_count: number;
  /** Wymagane WYŁĄCZNIE dla `environment: 'grunt'`. */
  soil_thermal_resistivity_km_w?: number | null;
}

/**
 * Opis warunków ułożenia albo jawny powrót do warunków katalogowych. Nazwa zestawu MUSI być
 * identyczna z backendem (`cable_ampacity_derating.NAZWA_WARUNKI_KATALOGOWE`) — dawna wartość
 * z odstępem była odrzucana przez parser jako „nieznany zestaw".
 */
export const WARUNKI_KATALOGOWE_NN = 'warunki_katalogowe' as const;
export type NNCableLayingConditionsPayload =
  | NNCableLayingConditionsDescription
  | typeof WARUNKI_KATALOGOWE_NN;

export interface AddNNCableSegmentPayload {
  from_bus_ref?: string | null;
  from_ref?: string | null;
  to_bus_ref?: string | null;
  to_bus_name?: string | null;
  length_m: number;
  n_parallel?: number;
  catalog_binding?: CatalogBindingPayload | null;
  catalog_ref?: string | null;
  cable_laying_conditions?: NNCableLayingConditionsPayload | null;
  name?: string | null;
  /** W5-A: układ uziemienia ekranu kabla (deklaracja projektanta; brak = układ odniesienia katalogu). */
  screen_bonding?: UziemienieEkranuKabla | null;
}

export interface AddNNDistributionBoardPayload {
  voltage_kv: number;
  name?: string | null;
  designation?: string | null;
  construction_type?: string | null;
  /** Zasilenie nowej rozdzielnicy — wewnętrzne wywołanie `add_nn_cable_segment`
   *  z `to_bus_ref` wymuszonym na nową szynę główną (`to_bus_ref` w tym obiekcie
   *  jest ignorowany przez backend i nadpisywany). */
  supply?: Omit<AddNNCableSegmentPayload, 'to_bus_ref' | 'to_bus_name'> | null;
}

export type NNSwitchDeviceClass = 'switch' | 'fuse';

export interface AddNNSwitchDevicePayload {
  from_bus_ref: string;
  to_bus_ref: string;
  device_class?: NNSwitchDeviceClass;
  catalog_binding?: CatalogBindingPayload | null;
  catalog_ref?: string | null;
  name?: string | null;
}

/** W5-E-TTIT: lustro `enm/domain_operations_v2.py::add_nn_rcd` — RCD wstawiany w tor
 *  zasilania instalacji odbioru nN (`load_ref`), pozycja katalogu `APARAT_NN_RCD`. */
export interface AddNNRcdPayload {
  load_ref: string;
  catalog_binding?: CatalogBindingPayload | null;
  catalog_ref?: string | null;
  name?: string | null;
}

export interface AddNNSectionCouplerPayload {
  station_ref: string;
  catalog_binding?: CatalogBindingPayload | null;
  catalog_ref?: string | null;
  name?: string | null;
}

export interface SetNNCableLayingConditionsPayload {
  segment_ref: string;
  cable_laying_conditions: NNCableLayingConditionsPayload;
}

/** Podział odcinka kabla nN nową szyną pośrednią w odległości `split_at_m` od początku. */
export interface SplitNNSegmentPayload {
  segment_ref: string;
  split_at_m: number;
}

// --- SourceNN Types (FAZA 5: model danych źródeł nN) ---

export type NNSourceType = 'PV_INVERTER' | 'BESS_INVERTER' | 'FW_INVERTER' | 'GENSET' | 'UPS';

export type NNSwitchKind = 'WYLACZNIK' | 'ROZLACZNIK' | 'BEZPIECZNIK';
export type NNSwitchState = 'OTWARTY' | 'ZAMKNIETY';

export type ConverterSourceTechnology = 'PV' | 'BESS' | 'FW';
export type ConverterConnectionVariant = 'nn_side' | 'block_transformer';

export type GensetOperationMode = 'PRACA_CIAGLA' | 'PRACA_AWARYJNA' | 'PRACA_SZCZYTOWA' | 'WYLACZONE';

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

// --- DER-SN topology contract (W2b-DANE, POLECENIE_DER_SN_TOPOLOGIA_2026-07) ---
// Lustro kontraktu backendu (DerTopologyPayload). Kompletny tor DER po stronie SN:
// szyna nN producenta → TR blokowy (osobny element) → kabel SN → pole źródłowe SN.
export type DerConnectionLevel = 'nn' | 'sn';
export type LvSwitchgearVariant =
  | 'none'
  | 'single-bus'
  | 'multi-feeder'
  | 'combiner'
  | 'integrated-skid';
export type DerMvSwitchingDevice = 'CB' | 'LBS';

// D1 wymaganie 9: jawny „sposób przyłączenia" DER (kanon RECENZJA_DER_SN_DOBORY_2026-07).
// Mapowany JAWNIE na connection_level/has_block_transformer/has_manufacturer_lv_switchgear;
// walidacja spójności zapada w backendzie (der_sn_validation).
export type DerConnectionMethod =
  | 'der_za_tr_stacji'
  | 'der_z_tr_blokowym'
  | 'der_bezposrednio_sn'
  | 'der_przez_rozdzielnie_producenta';

export interface DerBlockTransformerSpec {
  rated_power_mva: number | null;
  primary_voltage_kv: number | null;
  secondary_voltage_kv: number | null;
  uk_percent: number | null;
  vector_group: string | null;
  /** @deprecated Pole kompatybilności; kanonicznie używaj catalog_binding. */
  catalog_ref?: string | null;
  catalog_binding: CatalogBindingPayload | null;
  // D1 wymaganie 5: dopuszczalne obciążenie (przeciążalność) TR [pu]; brak → backend 1,0.
  loadability_pu?: number | null;
}

export interface DerMvFieldConfigurationSpec {
  switching_device: DerMvSwitchingDevice;
  ct: boolean;
  vt: boolean;
  earthing_switch: boolean;
  surge_arrester: boolean;
  protection_relay: boolean;
  cable_head: boolean;
  field_name: string | null;
  bay_template_ref: string | null;
  apparatus_catalog_binding: CatalogBindingPayload | null;
  cable_catalog_ref: string | null;
  cable_catalog_binding: CatalogBindingPayload | null;
  cable_length_km: number | null;
  /** W5-A: układ uziemienia ekranu kabla SN (deklaracja; null = układ odniesienia katalogu). */
  cable_screen_bonding?: UziemienieEkranuKabla | null;
  /**
   * V12K-207 (karta F-K7): warunki UŁOŻENIA kabla przyjęte w doborze obciążalności —
   * ADDYTYWNE (brak/null → backend przyjmuje warunki katalogowe, czyli zachowanie
   * dotychczasowe co do bitu). Nazwa zestawu jest WALIDOWANA przy wejściu do modelu.
   */
  cable_laying_conditions?: DerCableLayingConditionsPayload | null;
}

/** Opis warunków ułożenia kabla: nazwa zestawu albo współczynniki własne z opisem. */
export interface DerCableLayingConditionsPayload {
  set_name: string;
  f_grunt?: number;
  f_wiazka?: number;
  f_grupa?: number;
  opis_pl?: string;
}

export interface DerTopologyPayload {
  connection_level: DerConnectionLevel;
  inverter_output_voltage_kv: number | null;
  has_manufacturer_lv_switchgear: boolean;
  lv_switchgear_variant: LvSwitchgearVariant;
  has_block_transformer: boolean;
  block_transformer: DerBlockTransformerSpec | null;
  mv_field_configuration: DerMvFieldConfigurationSpec | null;
  mv_bus_ref: string | null;
  // D1 wymaganie 9: jawny „sposób przyłączenia" (ADDYTYWNY — brak → dotychczasowe zachowanie).
  connection_method?: DerConnectionMethod | null;
  // D1 wymaganie 5: współczynnik jednoczesności źródeł na wspólnym torze [pu]; brak → backend 1,0.
  simultaneity_factor?: number | null;
}

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
  // W2b-DANE: kompletny tor DER-SN (ADDYTYWNY — brak = dotychczasowe zachowanie).
  der_topology?: DerTopologyPayload | null;
  // Plan AB O-50 pkt 5: pola NC RfG modułu zapisywane razem z wytwórcą (ten sam walidator co
  // `update_element_parameters`: `enm/deklaracje_modulu.py::pola_nc_rfg_generatora`; kody
  // odmowy `generator.{modul_istniejacy,data_umowy,nastawy_zabezpieczen,deklaracje_modulu}_invalid`).
  modul_istniejacy?: boolean | null;
  data_umowy_przylaczeniowej?: string | null;
  nastawy_zabezpieczen?: NastawyZabezpieczenModulu | null;
  deklaracje_modulu?: DeklaracjeModulu | null;
}

export type NNConnectionType = 'JEDNOFAZOWY' | 'TROJFAZOWY';

// =============================================================================
// Phase 0B-3: CRUD GPZ sekcji (StationCard editor)
// =============================================================================

export type GpzSectionSide = 'lv' | 'hv';

export interface AddGpzSectionPayload {
  substation_ref: string;
  side?: GpzSectionSide;
  section_id: string;
  bus_ref: string;
  order?: number;
  name?: string;
  line_field_name?: string;
}

export interface UpdateGpzSectionPayload {
  substation_ref: string;
  side?: GpzSectionSide;
  section_id: string;
  updates: {
    name?: string | null;
    order?: number;
    bus_ref?: string;
    left_coupler_ref?: string | null;
    right_coupler_ref?: string | null;
    line_field_name?: string | null;
  };
}

export interface DeleteGpzSectionPayload {
  substation_ref: string;
  side?: GpzSectionSide;
  section_id: string;
}

// =============================================================================
// K5-B (H-3): tryb pracy źródła (lustrzane odbicie backendu:
// enm/domain_operations_v2.py `set_source_operating_mode` — payload czytany
// kluczami `source_ref`/`mode`).
// =============================================================================

/** Słownik trybów pracy źródła — 1:1 z `BaySourceEndpoint.operating_mode`
 *  (enm/models.py) i walidacją read-modelu (`field_read_model._OPERATING_MODES`);
 *  wartość spoza słownika jest przez read-model ignorowana (default „gotowosc"). */
export type SourceOperatingMode =
  | 'praca_sieciowa'
  | 'ladowanie'
  | 'rozladowanie'
  | 'gotowosc'
  | 'odstawione';

