/**
 * Komunikaty sukcesu (toast) per kanoniczna operacja domenowa.
 *
 * Forma dokonana ("Dodano X") — właściwa dla potwierdzenia sukcesu.
 * Źródło terminologii: backend domain/canonical_operations.py (description_pl),
 * skrócone do potwierdzeń zgodnych z PSE/IRiESD/PN-EN.
 *
 * Operacje wewnętrzne (refresh/undo/redo/load) celowo POMINIĘTE — nie pokazują toast.
 */

/** Operacje wewnętrzne — bez toast sukcesu. */
export const SILENT_OPERATIONS: ReadonlySet<string> = new Set([
  'refresh_snapshot',
  'undo',
  'redo',
  'load_snapshot',
]);

/** Mapa nazwa operacji → komunikat sukcesu (forma dokonana, PL). */
export const OPERATION_SUCCESS_MESSAGES: Record<string, string> = {
  // SN network
  add_grid_source_sn: 'Dodano źródło zasilające GPZ',
  continue_trunk_segment_sn: 'Przedłużono magistralę SN',
  insert_station_on_segment_sn: 'Wstawiono stację na segmencie SN',
  start_branch_segment_sn: 'Rozpoczęto odgałęzienie SN',
  insert_section_switch_sn: 'Wstawiono łącznik sekcyjny',
  insert_branch_pole_on_segment_sn: 'Wstawiono słup odgałęźny',
  insert_zksn_on_segment_sn: 'Wstawiono ZKSN na segmencie',
  connect_secondary_ring_sn: 'Zamknięto pierścień wtórny',
  set_normal_open_point: 'Ustawiono punkt normalnie otwarty (NOP)',
  // Bays / transformers / fields
  add_sn_bay: 'Dodano pole SN',
  edit_bay: 'Zaktualizowano pole SN',
  add_transformer_sn_nn: 'Dodano transformator SN/nN',
  add_nn_outgoing_field: 'Dodano pole nN',
  add_nn_load: 'Dodano obciążenie nN',
  // Catalog / parameters
  assign_catalog_to_element: 'Przypisano typ katalogowy',
  update_element_parameters: 'Zaktualizowano parametry elementu',
  // DER / sources
  add_converter_source: 'Dodano źródło przekształtnikowe (OZE)',
  add_genset_nn: 'Dodano zespół prądotwórczy nN',
  add_ups_nn: 'Dodano zasilacz UPS nN',
  set_source_operating_mode: 'Ustawiono tryb pracy źródła',
  set_dynamic_profile: 'Przypisano profil dynamiczny',
  // Protection
  add_ct: 'Dodano przekładnik prądowy (CT)',
  add_vt: 'Dodano przekładnik napięciowy (VT)',
  add_relay: 'Dodano przekaźnik zabezpieczeniowy',
  update_relay_settings: 'Zaktualizowano nastawy przekaźnika',
  link_relay_to_field: 'Powiązano przekaźnik z polem',
  calculate_tcc_curve: 'Obliczono krzywą TCC',
  validate_selectivity: 'Zwalidowano selektywność',
  // Study cases
  create_study_case: 'Utworzono przypadek obliczeniowy',
  set_case_switch_state: 'Ustawiono stan łącznika w przypadku',
  set_case_normal_state: 'Ustawiono stan normalny w przypadku',
  set_case_source_mode: 'Ustawiono tryb źródła w przypadku',
  set_case_time_profile: 'Ustawiono profil czasowy w przypadku',
  // Runs
  run_short_circuit: 'Uruchomiono obliczenia zwarciowe',
  run_power_flow: 'Uruchomiono rozpływ mocy',
  run_time_series_power_flow: 'Uruchomiono serię rozpływów mocy',
  compare_study_cases: 'Porównano przypadki obliczeniowe',
  // Editing
  delete_element: 'Usunięto element',
  rename_element: 'Zmieniono nazwę elementu',
  set_label: 'Ustawiono etykietę',
  // V12K-263: dwie operacje kanoniczne kończyły się BEZ własnego potwierdzenia.
  // Fallback („Operacja zakończona powodzeniem") nie mówił, CO się zmieniło, więc
  // projektant nie miał sygnału, że zapisały się akurat warunki przyłączenia albo
  // wiązania katalogowe wytwórcy — a obie zmieniają wynik analiz.
  set_connection_conditions: 'Zapisano warunki przyłączenia OSD',
  set_der_catalog_bindings: 'Zapisano wiązania katalogowe wytwórcy',
  // DER variants (nN bus/feeder/source-field)
  bus_nn_add_converter_source_pv: 'Dodano PV na szynie nN',
  bus_nn_add_converter_source_bess: 'Dodano magazyn BESS na szynie nN',
  bus_nn_add_converter_source_fw: 'Dodano farmę wiatrową na szynie nN',
  feeder_nn_add_converter_source_pv: 'Dodano PV na polu nN',
  feeder_nn_add_converter_source_bess: 'Dodano magazyn BESS na polu nN',
  feeder_nn_add_converter_source_fw: 'Dodano farmę wiatrową na polu nN',
  source_field_nn_add_converter_source_pv: 'Dodano PV w polu źródłowym nN',
  source_field_nn_add_converter_source_bess: 'Dodano magazyn BESS w polu źródłowym nN',
  source_field_nn_add_converter_source_bess_energy: 'Dodano magazyn BESS (energetyczny) nN',
  source_field_nn_add_converter_source_fw: 'Dodano farmę wiatrową w polu źródłowym nN',
};

/**
 * Zwraca komunikat sukcesu dla operacji, albo null jeśli operacja jest cicha.
 * Dla nieznanych operacji zwraca generyczny komunikat (fail-safe — zawsze jest feedback).
 */
export function getOperationSuccessMessage(opName: string): string | null {
  if (SILENT_OPERATIONS.has(opName)) {
    return null;
  }
  return OPERATION_SUCCESS_MESSAGES[opName] ?? 'Operacja zakończona powodzeniem';
}
