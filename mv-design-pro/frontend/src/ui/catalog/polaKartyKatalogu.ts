/**
 * Schemat panelu ogólnego karty pozycji katalogu — KAŻDE pole, które serwer wysyła dla
 * kategorii przeglądarki typów, także `null` i pominięte w pozycji.
 *
 * Po co: panel ogólny (`TypeLibraryBrowser`) pokazywał wyłącznie pola z wartością, więc brak
 * danej był niewidoczny — projektant nie wiedział, że karta pozycji nie podaje parametru
 * (zasada nr 4: brak ma być jawny, „brak danych”). Schemat bierze się z rekordu tylko
 * częściowo: pozycja może pominąć klucz opcjonalny, którego nie ma.
 *
 * Jedno źródło: serializacja backendu (`api/catalog.py`, funkcje obsługi
 * `GET /api/catalog/...`) — lustro przypina wyrocznia harnessu
 * `harness-fixtures/generated/pola_kart_katalogu.json` (`backend/scripts/
 * eksport_fixtur_harnessu.py::pola_kart_katalogu`), test
 * `ui/catalog/__tests__/polaKartyKatalogu.test.ts`. Urządzenia zabezpieczeniowe front
 * przemapowuje sam (`fetchProtectionDeviceTypes`) — ich schemat wiąże typ
 * `ProtectionDeviceType`.
 */
import type {
  AparatPunktuRozgalezienia,
  BESSInverterCatalogType,
  BranchPointCatalogType,
  CableType,
  CatalogType,
  ConverterType,
  CTCatalogType,
  LineType,
  LoadCatalogType,
  LVApparatusType,
  LVCableType,
  LVRcdType,
  MetadaneKatalogu,
  MetadaneKataloguBezNoty,
  MVApparatusType,
  OverheadConductorType,
  ParametryModeluPrzeksztaltnika,
  ParametryPunktuRozgalezienia,
  PortTrasyPunktuRozgalezienia,
  ProtectionDeviceType,
  PtpireeGeneratorCertificateCatalogType,
  PVInverterCatalogType,
  ShuntCapacitorCatalogType,
  SourceSystemCatalogType,
  SurgeArresterCatalogType,
  SwitchEquipmentType,
  SynchronousGeneratorCatalogType,
  TapChangerCatalogType,
  TransformerType,
  TypeCategory,
  VTCatalogType,
} from './types';

/** Kategorie z dedykowanym budowniczym wierszy (`wierszeKartyKatalogu.ts`) — jedno źródło
 *  typu i predykatu `maBudowniczegoWierszy`. */
export const KATEGORIE_Z_BUDOWNICZYM_WIERSZY = [
  'LINE',
  'CABLE',
  'TRANSFORMER',
  'SWITCH_EQUIPMENT',
] as const satisfies readonly TypeCategory[];
export type KategoriaZBudowniczymWierszy = (typeof KATEGORIE_Z_BUDOWNICZYM_WIERSZY)[number];

/** Kategorie pokazywane przez panel ogólny karty pozycji. */
export type KategoriaPaneluOgolnego = Exclude<TypeCategory, KategoriaZBudowniczymWierszy>;

/**
 * Pola urządzenia zabezpieczeniowego po mapowaniu frontu. `name_pl` jest tylko wejściem
 * mapowania (trafia do `name`), więc nie jest polem karty.
 */
const POLA_URZADZENIA_ZABEZPIECZENIOWEGO = {
  id: true,
  name: true,
  manufacturer: true,
  vendor: true,
  model: true,
  series: true,
  rated_current_a: true,
  notes_pl: true,
  source_catalog: true,
  unverified: true,
  unverified_ranges: true,
  functions_supported: true,
  curves_supported: true,
} as const satisfies Readonly<Record<Exclude<keyof ProtectionDeviceType, 'name_pl'>, true>>;

/**
 * KLUCZE TYPÓW POZYCJI KATALOGU — lustro serializacji serwera WIĄŻĄCE typy `types.ts`.
 *
 * Każdy obiekt niżej ma dokładnie klucze swojego interfejsu: `satisfies KluczeTypu<T>` nie
 * skompiluje się, gdy interfejs ma pole spoza obiektu, a nadmiarowy klucz własny obiektu też
 * jest błędem kompilacji. Test `polaKartyKatalogu.test.ts` porównuje każdy obiekt z kluczami,
 * które serwer naprawdę wysyła (wyrocznia `pola_kart_katalogu.json`). Pole fantomowe w typie
 * (np. dawne `voltage_kv` falownika albo pola punktu rozgałęzienia „na wierzchu” zamiast
 * w `params`) zapala więc czerwień: najpierw w kompilacji, a po dopisaniu go tutaj — w teście.
 */
type KluczeTypu<T> = { readonly [K in keyof Required<T>]: true };

const KLUCZE_POZYCJI = {
  id: true,
  name: true,
  manufacturer: true,
} as const satisfies KluczeTypu<CatalogType>;

const KLUCZE_METADANYCH = {
  verification_status: true,
  source_reference: true,
  catalog_status: true,
  contract_version: true,
  verification_note: true,
} as const satisfies KluczeTypu<MetadaneKatalogu>;

const KLUCZE_METADANYCH_BEZ_NOTY = {
  verification_status: true,
  source_reference: true,
  catalog_status: true,
  contract_version: true,
} as const satisfies KluczeTypu<MetadaneKataloguBezNoty>;

const KLUCZE_MODELU_PRZEKSZTALTNIKA = {
  card_field_status: true,
  control_delay_ms: true,
  current_loop_bandwidth_hz: true,
  voltage_loop_bandwidth_hz: true,
  pll_bandwidth_hz: true,
  filter_l_pu: true,
  filter_r_pu: true,
  flicker_c: true,
  p_installed_mw: true,
  pn_ac_mw: true,
  pq_curve: true,
  ptpiree_certificate_condition: true,
  ptpiree_note: true,
} as const satisfies KluczeTypu<ParametryModeluPrzeksztaltnika>;

const KLUCZE_PRZEWODU_LINII_WN = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  alfa_1_per_k: true,
  conductor_material: true,
  cross_section_mm2: true,
  gmr_mm: true,
  jth_1s_a_per_mm2: true,
  liczba_drutow_al: true,
  liczba_drutow_st: true,
  masa_kg_per_km: true,
  max_temperature_c: true,
  oznaczenie: true,
  przekroj_stali_mm2: true,
  przeznaczenie: true,
  r20_dc_ohm_per_km: true,
  rated_current_a: true,
  short_circuit_temperature_c: true,
  srednica_drutu_al_mm: true,
  srednica_drutu_st_mm: true,
  srednica_mm: true,
  srednica_rdzenia_mm: true,
  standard: true,
  thermal_source_reference: true,
  voltage_rating_kv: true,
  warstwy_al: true,
  wytrzymalosc_kn: true,
} as const satisfies KluczeTypu<OverheadConductorType>;

const KLUCZE_APARATU_SN = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  break_time_s: true,
  breaking_capacity_ka: true,
  card_field_status: true,
  device_kind: true,
  i_dyn_ka: true,
  i_dyn_pochodzenie: true,
  i_n_a: true,
  i_th_duration_s: true,
  i_th_ka: true,
  i_th_pochodzenie: true,
  making_capacity_ka: true,
  u_n_kv: true,
  wartosci_robocze: true,
} as const satisfies KluczeTypu<MVApparatusType>;

const KLUCZE_APARATU_NN = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  breaking_capacity_ka: true,
  conditional_sc_current_ka: true,
  curve_ref: true,
  device_kind: true,
  i_cu_ka: true,
  i_n_a: true,
  ics_ka: true,
  icw_ka: true,
  ii_range: true,
  ir_range: true,
  isd_range: true,
  poles: true,
  tr_range: true,
  trip_unit: true,
  tsd_range: true,
  u_m_kv: true,
  u_n_kv: true,
} as const satisfies KluczeTypu<LVApparatusType>;

const KLUCZE_RCD_NN = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  i_delta_n_a: true,
  in_a: true,
  poles: true,
  rcd_type: true,
  selective: true,
  t_a_2idn_s: true,
  t_a_5idn_s: true,
  t_a_s: true,
  t_nieczuly_min_s: true,
  u_n_kv: true,
} as const satisfies KluczeTypu<LVRcdType>;

const KLUCZE_KABLA_NN = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  conductor_material: true,
  core_functions: true,
  cross_section_mm2: true,
  i_max_a: true,
  insulation_type: true,
  ith_1s_a: true,
  jth_1s_a_per_mm2: true,
  max_temperature_c: true,
  number_of_cores: true,
  r0_ohm_per_km: true,
  r_ohm_per_km: true,
  return_conductor_cross_section_mm2: true,
  return_conductor_r_ohm_per_km_20c: true,
  return_conductor_x_ohm_per_km: true,
  short_circuit_temperature_c: true,
  standard: true,
  u_n_kv: true,
  x0_ohm_per_km: true,
  x_ohm_per_km: true,
} as const satisfies KluczeTypu<LVCableType>;

const KLUCZE_ODBIORU = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH_BEZ_NOTY,
  a_p: true,
  a_q: true,
  b_p: true,
  b_q: true,
  c_p: true,
  c_q: true,
  cos_phi: true,
  cos_phi_mode: true,
  f0_hz: true,
  k_pf: true,
  k_qf: true,
  model: true,
  p_kw: true,
  profile_id: true,
  q_kvar: true,
  v0_pu: true,
} as const satisfies KluczeTypu<LoadCatalogType>;

const KLUCZE_PRZEKLADNIKA_PRADOWEGO = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  accuracy_class: true,
  accuracy_limit_factor: true,
  application: true,
  burden_va: true,
  fs_safety_factor: true,
  idyn_ka_peak: true,
  ith_ka_1s: true,
  ratio_primary_a: true,
  ratio_secondary_a: true,
  rct_ohm: true,
} as const satisfies KluczeTypu<CTCatalogType>;

const KLUCZE_PRZEKLADNIKA_NAPIECIOWEGO = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  accuracy_class: true,
  accuracy_class_metering: true,
  application: true,
  burden_va: true,
  has_residual_winding: true,
  rated_voltage_factor: true,
  ratio_primary_v: true,
  ratio_secondary_v: true,
  voltage_factor_duration_s: true,
} as const satisfies KluczeTypu<VTCatalogType>;

const KLUCZE_FALOWNIKA_PV = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  ...KLUCZE_MODELU_PRZEKSZTALTNIKA,
  control_mode: true,
  cos_phi_max: true,
  cos_phi_min: true,
  dynamic_profile_id: true,
  grid_code: true,
  k_sc: true,
  p_max_kw: true,
  ptpiree_certificate_ref: true,
  ptpiree_document_acceptance_date: true,
  ptpiree_document_number: true,
  ptpiree_ppm_scope: true,
  ptpiree_publication_date: true,
  ptpiree_source_url: true,
  ptpiree_status: true,
  ptpiree_wipwc_version: true,
  ptpiree_wos_version: true,
  s_n_kva: true,
  un_kv: true,
} as const satisfies KluczeTypu<PVInverterCatalogType>;

const KLUCZE_FALOWNIKA_MAGAZYNU = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  ...KLUCZE_MODELU_PRZEKSZTALTNIKA,
  dynamic_profile_id: true,
  e_kwh: true,
  k_sc: true,
  p_charge_kw: true,
  p_discharge_kw: true,
  ptpiree_certificate_ref: true,
  ptpiree_document_acceptance_date: true,
  ptpiree_document_number: true,
  ptpiree_ppm_scope: true,
  ptpiree_publication_date: true,
  ptpiree_source_url: true,
  ptpiree_status: true,
  ptpiree_wipwc_version: true,
  ptpiree_wos_version: true,
  s_n_kva: true,
  un_kv: true,
} as const satisfies KluczeTypu<BESSInverterCatalogType>;

const KLUCZE_ZRODLA_SYSTEMOWEGO = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  catalog_number: true,
  data_source: true,
  ik3_ka: true,
  ik3_min_ka: true,
  operator_name: true,
  rx_ratio: true,
  rx_ratio_min: true,
  series: true,
  short_circuit_model: true,
  sk3_min_mva: true,
  sk3_mva: true,
  supply_role: true,
  voltage_rating_kv: true,
} as const satisfies KluczeTypu<SourceSystemCatalogType>;

const KLUCZE_OGRANICZNIKA = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  application: true,
  bil_protected_kv: true,
  energy_absorption_kj_per_kv: true,
  energy_class: true,
  mcov_kv: true,
  model: true,
  neutral_system: true,
  standard: true,
  tov_10s_kv: true,
  u_m_kv: true,
  u_rated_kv: true,
  u_residual_at_10ka_kv: true,
} as const satisfies KluczeTypu<SurgeArresterCatalogType>;

const KLUCZE_KOMPENSATORA = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH_BEZ_NOTY,
  dlawik_indukcyjnosc_mh: true,
  dlawik_ograniczajacy: true,
  liczba_stopni: true,
  loss_kw: true,
  rated_kv: true,
  rated_mvar: true,
  rezystory_rozladowcze_wewnetrzne: true,
  tolerancja_pojemnosci_max_proc: true,
  tolerancja_pojemnosci_min_proc: true,
  uklad_polaczen: true,
} as const satisfies KluczeTypu<ShuntCapacitorCatalogType>;

const KLUCZE_CERTYFIKATU_PTPIREE = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  accepted_from: true,
  device_type: true,
  document_acceptance_date: true,
  document_number: true,
  firmware_version: true,
  manufacturer_key: true,
  model: true,
  model_key: true,
  ppm_scope: true,
  publication_date: true,
  source_url: true,
  wipwc_version: true,
  wos_version: true,
} as const satisfies KluczeTypu<PtpireeGeneratorCertificateCatalogType>;

const KLUCZE_PUNKTU_ROZGALEZIENIA = {
  id: true,
  name: true,
  params: true,
} as const satisfies KluczeTypu<BranchPointCatalogType>;

const KLUCZE_LINII = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  b0_siemens_per_km: true,
  b_us_per_km: true,
  base_type_id: true,
  conductor_material: true,
  cross_section_mm2: true,
  dane_cieplne_kompletne: true,
  ith_1s_a: true,
  jth_1s_a_per_mm2: true,
  max_temperature_c: true,
  r0_ohm_per_km: true,
  r_ohm_per_km: true,
  rated_current_a: true,
  short_circuit_temperature_c: true,
  standard: true,
  thermal_source_reference: true,
  trade_name: true,
  voltage_rating_kv: true,
  wartosci_robocze: true,
  x0_ohm_per_km: true,
  x_ohm_per_km: true,
} as const satisfies KluczeTypu<LineType>;

const KLUCZE_KABLA = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  b0_siemens_per_km: true,
  base_type_id: true,
  c_nf_per_km: true,
  conductor_material: true,
  cross_section_mm2: true,
  dane_cieplne_kompletne: true,
  insulation_type: true,
  ith_1s_a: true,
  jth_1s_a_per_mm2: true,
  max_temperature_c: true,
  number_of_cores: true,
  r0_ohm_per_km: true,
  r_ohm_per_km: true,
  rated_current_a: true,
  return_conductor_cross_section_mm2: true,
  return_conductor_ith_1s_a: true,
  return_conductor_jth_1s_a_per_mm2: true,
  return_conductor_material: true,
  return_conductor_r_ohm_per_km_20c: true,
  short_circuit_temperature_c: true,
  standard: true,
  trade_name: true,
  voltage_rating_kv: true,
  wartosci_robocze: true,
  x0_ohm_per_km: true,
  x_ohm_per_km: true,
  z0_reference_bonding: true,
} as const satisfies KluczeTypu<CableType>;

const KLUCZE_TRANSFORMATORA = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  cooling_class: true,
  i0_percent: true,
  p0_kw: true,
  pk_kw: true,
  rated_power_mva: true,
  tap_max: true,
  tap_min: true,
  tap_step_percent: true,
  uk_percent: true,
  vector_group: true,
  voltage_hv_kv: true,
  voltage_lv_kv: true,
} as const satisfies KluczeTypu<TransformerType>;

const KLUCZE_LACZNIKA = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  card_field_status: true,
  equipment_kind: true,
  i_cu_ka: true,
  icw_ka: true,
  ik_ka: true,
  in_a: true,
  medium: true,
  u_m_kv: true,
  un_kv: true,
} as const satisfies KluczeTypu<SwitchEquipmentType>;

const KLUCZE_PRZEKSZTALTNIKA = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  ...KLUCZE_MODELU_PRZEKSZTALTNIKA,
  control_mode: true,
  converter_machine_side_voltage_kv: true,
  converter_topology: true,
  cosphi: true,
  cosphi_max: true,
  cosphi_min: true,
  cosphi_p_points: true,
  dynamic_profile_id: true,
  e_kwh: true,
  f0_hz: true,
  generator_machine_type: true,
  generator_rated_power_mw: true,
  generator_stator_frequency_max_hz: true,
  generator_stator_voltage_kv: true,
  grid_code: true,
  k_sc: true,
  kind: true,
  lfsm_allow_increase: true,
  lfsm_deadband_hz: true,
  lfsm_droop_pct: true,
  model: true,
  p_achievable_mw: true,
  p_connection_mw: true,
  pmax_mw: true,
  ptpiree_certificate_ref: true,
  ptpiree_document_acceptance_date: true,
  ptpiree_document_number: true,
  ptpiree_ppm_scope: true,
  ptpiree_publication_date: true,
  ptpiree_source_url: true,
  ptpiree_status: true,
  ptpiree_wipwc_version: true,
  ptpiree_wos_version: true,
  q_absorbing: true,
  qmax_mvar: true,
  qmin_mvar: true,
  qu_deadband_high_pu: true,
  qu_deadband_low_pu: true,
  qu_q_max_mvar: true,
  qu_q_min_mvar: true,
  qu_slope_pu_per_pu: true,
  sc_model: true,
  sc_pq_split: true,
  sc_sustained_k: true,
  sc_transient_k: true,
  sn_mva: true,
  un_kv: true,
} as const satisfies KluczeTypu<ConverterType>;

const KLUCZE_GENERATORA_SN = {
  ...KLUCZE_POZYCJI,
  ...KLUCZE_METADANYCH,
  q_max_mvar: true,
  q_min_mvar: true,
  rated_kv: true,
  rated_mva: true,
} as const satisfies KluczeTypu<SynchronousGeneratorCatalogType>;

const KLUCZE_PRZELACZNIKA_ZACZEPOW = {
  applicable_to: true,
  catalog_namespace: true,
  catalog_version: true,
  id: true,
  label_pl: true,
  neutral_position: true,
  range_percent: true,
  regulated_side: true,
  step_percent: true,
  supports_avr: true,
  tap_count: true,
  type: true,
} as const satisfies KluczeTypu<TapChangerCatalogType>;

const KLUCZE_PARAMETROW_PUNKTU = {
  ...KLUCZE_METADANYCH,
  apparatus_specs: true,
  branch_ports_count: true,
  catalog_namespace: true,
  has_switchgear: true,
  has_transformer: true,
  kind: true,
  manufacturer: true,
  medium: true,
  object_role: true,
  route_ports: true,
  series: true,
  standard_topology: true,
  switch_device_kind: true,
  switch_rated_current_a: true,
  switchgear_kind: true,
  topology_role: true,
} as const satisfies KluczeTypu<ParametryPunktuRozgalezienia>;

const KLUCZE_PORTU_PUNKTU = {
  medium: true,
  port_id: true,
  role: true,
} as const satisfies KluczeTypu<PortTrasyPunktuRozgalezienia>;

const KLUCZE_APARATU_PUNKTU = {
  apparatus_role: true,
  device_kind: true,
  port_id: true,
  rated_current_a: true,
} as const satisfies KluczeTypu<AparatPunktuRozgalezienia>;

const klucze = (obiekt: object): readonly string[] => Object.keys(obiekt).sort();

/** Typy pozycji katalogu poza panelem ogólnym (wyrocznia `typy_pozycji`). */
export const KLUCZE_TYPOW_POZYCJI: Readonly<Record<string, readonly string[]>> = {
  LINE: klucze(KLUCZE_LINII),
  CABLE: klucze(KLUCZE_KABLA),
  TRANSFORMER: klucze(KLUCZE_TRANSFORMATORA),
  SWITCH_EQUIPMENT: klucze(KLUCZE_LACZNIKA),
  PRZEKSZTALTNIK_DER: klucze(KLUCZE_PRZEKSZTALTNIKA),
  GENERATOR_SN: klucze(KLUCZE_GENERATORA_SN),
  PRZELACZNIK_ZACZEPOW: klucze(KLUCZE_PRZELACZNIKA_ZACZEPOW),
};

/** Parametry punktu rozgałęzienia w `params` (wyrocznia `parametry_punktu_rozgalezienia`). */
export const KLUCZE_PARAMETROW_PUNKTU_ROZGALEZIENIA: Readonly<Record<string, readonly string[]>> = {
  params: klucze(KLUCZE_PARAMETROW_PUNKTU),
  route_ports: klucze(KLUCZE_PORTU_PUNKTU),
  apparatus_specs: klucze(KLUCZE_APARATU_PUNKTU),
};

/** Schemat panelu ogólnego: klucze typu pozycji kategorii; kategorie złożone przeglądarki
 *  (przekładniki = CT ∪ VT, przekształtniki = PV ∪ BESS) — suma typów składowych. */
export const POLA_KARTY_KATEGORII: Readonly<Record<KategoriaPaneluOgolnego, readonly string[]>> = {
  HV_OVERHEAD_CONDUCTOR: klucze(KLUCZE_PRZEWODU_LINII_WN),
  MV_APPARATUS: klucze(KLUCZE_APARATU_SN),
  LV_APPARATUS: klucze(KLUCZE_APARATU_NN),
  LV_RCD: klucze(KLUCZE_RCD_NN),
  LV_CABLE: klucze(KLUCZE_KABLA_NN),
  LOAD: klucze(KLUCZE_ODBIORU),
  CT: klucze(KLUCZE_PRZEKLADNIKA_PRADOWEGO),
  VT: klucze(KLUCZE_PRZEKLADNIKA_NAPIECIOWEGO),
  MEASUREMENT_TRANSFORMER: klucze({
    ...KLUCZE_PRZEKLADNIKA_PRADOWEGO,
    ...KLUCZE_PRZEKLADNIKA_NAPIECIOWEGO,
  }),
  PV_INVERTER: klucze(KLUCZE_FALOWNIKA_PV),
  BESS_INVERTER: klucze(KLUCZE_FALOWNIKA_MAGAZYNU),
  CONVERTER: klucze({ ...KLUCZE_FALOWNIKA_PV, ...KLUCZE_FALOWNIKA_MAGAZYNU }),
  SYSTEM_SOURCE: klucze(KLUCZE_ZRODLA_SYSTEMOWEGO),
  SURGE_ARRESTER: klucze(KLUCZE_OGRANICZNIKA),
  SHUNT_CAPACITOR: klucze(KLUCZE_KOMPENSATORA),
  PTPIREE_CERTIFICATE: klucze(KLUCZE_CERTYFIKATU_PTPIREE),
  BRANCH_POLE: klucze(KLUCZE_PUNKTU_ROZGALEZIENIA),
  ZKSN: klucze(KLUCZE_PUNKTU_ROZGALEZIENIA),
  PROTECTION_DEVICE: Object.keys(POLA_URZADZENIA_ZABEZPIECZENIOWEGO),
};

/**
 * Pola pokazywane poza panelem ogólnym: identyfikacja w nagłówku karty (`id`, `name`,
 * producent), minimum źródła systemowego w `wierszeZrodlaSystemowegoMin` (etykiety PL, bez
 * duplikatu wartości pod dwiema etykietami), propozycje wartości roboczych we własnej sekcji
 * (V12K-351 — nie są daną karty).
 */
export const POLA_POZA_PANELEM_OGOLNYM: ReadonlySet<string> = new Set([
  'id',
  'name',
  'manufacturer',
  'vendor',
  'sk3_min_mva',
  'ik3_min_ka',
  'rx_ratio_min',
  'wartosci_robocze',
]);

/** Czy kategoria ma dedykowanego budowniczego wierszy (nie panel ogólny). */
export function maBudowniczegoWierszy(
  kategoria: TypeCategory,
): kategoria is KategoriaZBudowniczymWierszy {
  return (KATEGORIE_Z_BUDOWNICZYM_WIERSZY as readonly TypeCategory[]).includes(kategoria);
}
