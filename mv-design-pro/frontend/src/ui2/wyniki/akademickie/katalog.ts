/*
 * Mapowanie rodzaju analizy na przestrzeń nazw katalogu danych odniesienia
 * (`GET /api/catalog/v126/{namespace}` — `api/v126_academic.py::get_v126_catalog`).
 *
 * Do 2026-08-07 katalog V12.6 nie miał we froncie ANI JEDNEGO konsumenta (klasa
 * DOSTAWCA-BEZ-KLIENTA): backend wystawiał pięć przestrzeni nazw, z których żadna
 * nie docierała do projektanta. `analysis-types` konsumuje `api.ts` (jedyne źródło
 * listy rodzajów), pozostałe cztery — sekcja „Dane odniesienia" okna.
 */

import type { RodzajAnalizy } from './api';

/** Przestrzeń nazw katalogu z danymi odniesienia rodzaju (albo brak). */
export const KATALOG_RODZAJU: Record<RodzajAnalizy, string | null> = {
  // Limity THD_U / TDD i limity pojedynczych harmonicznych (PN-EN 50160, IEEE 519).
  power_quality_harmonics: 'harmonic-limits',
  // Tryby pracy przekształtnika (GFL / GFM_droop / VSM / Grid_Supporting).
  ssci_impedance: 'converter-modes',
  voltage_stability: null,
  // Intensywności uszkodzeń i czasy odtworzenia elementów sieci.
  reliability_contingency: 'reliability-defaults',
  earthing_safety: null,
  // Znormalizowane poziomy izolacji U_m / BIL (IEC 60071-1).
  insulation_coordination: 'insulation-levels',
  earth_fault_detection: null,
  transient_trv: null,
  motor_starting: null,
  hosting_capacity: null,
  opf_loss_lcc: null,
  benchmark_validation: null,
  uncertainty_sensitivity: null,
  neutral_earthing_design: null,
};

/** Przestrzeń nazw katalogu dla rodzaju; rodzaj spoza kontraktu okna → brak. */
export function katalogRodzaju(kod: string): string | null {
  return (KATALOG_RODZAJU as Record<string, string | null | undefined>)[kod] ?? null;
}
