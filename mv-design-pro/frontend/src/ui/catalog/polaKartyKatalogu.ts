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
import type { ProtectionDeviceType, TypeCategory } from './types';

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

export const POLA_KARTY_KATEGORII: Readonly<Record<KategoriaPaneluOgolnego, readonly string[]>> = {
  HV_OVERHEAD_CONDUCTOR: [
    'alfa_1_per_k', 'catalog_status', 'conductor_material', 'contract_version',
    'cross_section_mm2', 'gmr_mm', 'id', 'jth_1s_a_per_mm2', 'liczba_drutow_al',
    'liczba_drutow_st', 'manufacturer', 'masa_kg_per_km', 'max_temperature_c', 'name',
    'oznaczenie', 'przekroj_stali_mm2', 'przeznaczenie', 'r20_dc_ohm_per_km', 'rated_current_a',
    'short_circuit_temperature_c', 'source_reference', 'srednica_drutu_al_mm',
    'srednica_drutu_st_mm', 'srednica_mm', 'srednica_rdzenia_mm', 'standard',
    'thermal_source_reference', 'verification_note', 'verification_status', 'voltage_rating_kv',
    'warstwy_al', 'wytrzymalosc_kn',
  ],
  MV_APPARATUS: [
    'break_time_s', 'breaking_capacity_ka', 'card_field_status', 'catalog_status',
    'contract_version', 'device_kind', 'i_dyn_ka', 'i_dyn_pochodzenie', 'i_n_a', 'i_th_duration_s',
    'i_th_ka', 'i_th_pochodzenie', 'id', 'making_capacity_ka', 'manufacturer', 'name',
    'source_reference', 'u_n_kv', 'verification_note', 'verification_status', 'wartosci_robocze',
  ],
  LV_APPARATUS: [
    'breaking_capacity_ka', 'catalog_status', 'conditional_sc_current_ka', 'contract_version',
    'curve_ref', 'device_kind', 'i_cu_ka', 'i_n_a', 'ics_ka', 'icw_ka', 'id', 'ii_range',
    'ir_range', 'isd_range', 'manufacturer', 'name', 'poles', 'source_reference', 'tr_range',
    'trip_unit', 'tsd_range', 'u_m_kv', 'u_n_kv', 'verification_note', 'verification_status',
  ],
  LV_RCD: [
    'catalog_status', 'contract_version', 'i_delta_n_a', 'id', 'in_a', 'manufacturer', 'name',
    'poles', 'rcd_type', 'selective', 'source_reference', 't_a_2idn_s', 't_a_5idn_s', 't_a_s',
    't_nieczuly_min_s', 'u_n_kv', 'verification_note', 'verification_status',
  ],
  LV_CABLE: [
    'catalog_status', 'conductor_material', 'contract_version', 'core_functions',
    'cross_section_mm2', 'i_max_a', 'id', 'insulation_type', 'ith_1s_a', 'jth_1s_a_per_mm2',
    'manufacturer', 'max_temperature_c', 'name', 'number_of_cores', 'r0_ohm_per_km',
    'r_ohm_per_km', 'return_conductor_cross_section_mm2', 'return_conductor_r_ohm_per_km_20c',
    'return_conductor_x_ohm_per_km', 'short_circuit_temperature_c', 'source_reference', 'standard',
    'u_n_kv', 'verification_note', 'verification_status', 'x0_ohm_per_km', 'x_ohm_per_km',
  ],
  LOAD: [
    'a_p', 'a_q', 'b_p', 'b_q', 'c_p', 'c_q', 'catalog_status', 'contract_version', 'cos_phi',
    'cos_phi_mode', 'f0_hz', 'id', 'k_pf', 'k_qf', 'manufacturer', 'model', 'name', 'p_kw',
    'profile_id', 'q_kvar', 'source_reference', 'v0_pu', 'verification_status',
  ],
  CT: [
    'accuracy_class', 'accuracy_limit_factor', 'application', 'burden_va', 'catalog_status',
    'contract_version', 'fs_safety_factor', 'id', 'idyn_ka_peak', 'ith_ka_1s', 'manufacturer',
    'name', 'ratio_primary_a', 'ratio_secondary_a', 'rct_ohm', 'source_reference',
    'verification_note', 'verification_status',
  ],
  VT: [
    'accuracy_class', 'accuracy_class_metering', 'application', 'burden_va', 'catalog_status',
    'contract_version', 'has_residual_winding', 'id', 'manufacturer', 'name',
    'rated_voltage_factor', 'ratio_primary_v', 'ratio_secondary_v', 'source_reference',
    'verification_note', 'verification_status', 'voltage_factor_duration_s',
  ],
  MEASUREMENT_TRANSFORMER: [
    'accuracy_class', 'accuracy_class_metering', 'accuracy_limit_factor', 'application',
    'burden_va', 'catalog_status', 'contract_version', 'fs_safety_factor', 'has_residual_winding',
    'id', 'idyn_ka_peak', 'ith_ka_1s', 'manufacturer', 'name', 'rated_voltage_factor',
    'ratio_primary_a', 'ratio_primary_v', 'ratio_secondary_a', 'ratio_secondary_v', 'rct_ohm',
    'source_reference', 'verification_note', 'verification_status', 'voltage_factor_duration_s',
  ],
  PV_INVERTER: [
    'card_field_status', 'catalog_status', 'contract_version', 'control_delay_ms', 'control_mode',
    'cos_phi_max', 'cos_phi_min', 'current_loop_bandwidth_hz', 'dynamic_profile_id', 'filter_l_pu',
    'filter_r_pu', 'flicker_c', 'grid_code', 'id', 'k_sc', 'manufacturer', 'name',
    'p_installed_mw', 'p_max_kw', 'pll_bandwidth_hz', 'pn_ac_mw', 'pq_curve',
    'ptpiree_certificate_condition', 'ptpiree_certificate_ref', 'ptpiree_document_acceptance_date',
    'ptpiree_document_number', 'ptpiree_note', 'ptpiree_ppm_scope', 'ptpiree_publication_date',
    'ptpiree_source_url', 'ptpiree_status', 'ptpiree_wipwc_version', 'ptpiree_wos_version',
    's_n_kva', 'source_reference', 'un_kv', 'verification_note', 'verification_status',
    'voltage_loop_bandwidth_hz',
  ],
  BESS_INVERTER: [
    'card_field_status', 'catalog_status', 'contract_version', 'control_delay_ms',
    'current_loop_bandwidth_hz', 'dynamic_profile_id', 'e_kwh', 'filter_l_pu', 'filter_r_pu',
    'flicker_c', 'id', 'k_sc', 'manufacturer', 'name', 'p_charge_kw', 'p_discharge_kw',
    'p_installed_mw', 'pll_bandwidth_hz', 'pn_ac_mw', 'pq_curve', 'ptpiree_certificate_condition',
    'ptpiree_certificate_ref', 'ptpiree_document_acceptance_date', 'ptpiree_document_number',
    'ptpiree_note', 'ptpiree_ppm_scope', 'ptpiree_publication_date', 'ptpiree_source_url',
    'ptpiree_status', 'ptpiree_wipwc_version', 'ptpiree_wos_version', 's_n_kva',
    'source_reference', 'un_kv', 'verification_note', 'verification_status',
    'voltage_loop_bandwidth_hz',
  ],
  CONVERTER: [
    'card_field_status', 'catalog_status', 'contract_version', 'control_delay_ms', 'control_mode',
    'cos_phi_max', 'cos_phi_min', 'current_loop_bandwidth_hz', 'dynamic_profile_id', 'e_kwh',
    'filter_l_pu', 'filter_r_pu', 'flicker_c', 'grid_code', 'id', 'k_sc', 'manufacturer', 'name',
    'p_charge_kw', 'p_discharge_kw', 'p_installed_mw', 'p_max_kw', 'pll_bandwidth_hz', 'pn_ac_mw',
    'pq_curve', 'ptpiree_certificate_condition', 'ptpiree_certificate_ref',
    'ptpiree_document_acceptance_date', 'ptpiree_document_number', 'ptpiree_note',
    'ptpiree_ppm_scope', 'ptpiree_publication_date', 'ptpiree_source_url', 'ptpiree_status',
    'ptpiree_wipwc_version', 'ptpiree_wos_version', 's_n_kva', 'source_reference', 'un_kv',
    'verification_note', 'verification_status', 'voltage_loop_bandwidth_hz',
  ],
  SYSTEM_SOURCE: [
    'catalog_number', 'catalog_status', 'contract_version', 'data_source', 'id', 'ik3_ka',
    'ik3_min_ka', 'manufacturer', 'name', 'operator_name', 'rx_ratio', 'rx_ratio_min', 'series',
    'short_circuit_model', 'sk3_min_mva', 'sk3_mva', 'source_reference', 'supply_role',
    'verification_note', 'verification_status', 'voltage_rating_kv',
  ],
  SURGE_ARRESTER: [
    'application', 'bil_protected_kv', 'catalog_status', 'contract_version',
    'energy_absorption_kj_per_kv', 'energy_class', 'id', 'manufacturer', 'mcov_kv', 'model',
    'name', 'neutral_system', 'source_reference', 'standard', 'tov_10s_kv', 'u_m_kv', 'u_rated_kv',
    'u_residual_at_10ka_kv', 'verification_note', 'verification_status',
  ],
  SHUNT_CAPACITOR: [
    'catalog_status', 'contract_version', 'dlawik_indukcyjnosc_mh', 'dlawik_ograniczajacy', 'id',
    'liczba_stopni', 'loss_kw', 'manufacturer', 'name', 'rated_kv', 'rated_mvar',
    'rezystory_rozladowcze_wewnetrzne', 'source_reference', 'tolerancja_pojemnosci_max_proc',
    'tolerancja_pojemnosci_min_proc', 'uklad_polaczen', 'verification_status',
  ],
  PTPIREE_CERTIFICATE: [
    'accepted_from', 'catalog_status', 'contract_version', 'device_type',
    'document_acceptance_date', 'document_number', 'firmware_version', 'id', 'manufacturer',
    'manufacturer_key', 'model', 'model_key', 'name', 'ppm_scope', 'publication_date',
    'source_reference', 'source_url', 'verification_note', 'verification_status', 'wipwc_version',
    'wos_version',
  ],
  BRANCH_POLE: [
    'id', 'name', 'params',
  ],
  ZKSN: [
    'id', 'name', 'params',
  ],
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
