/**
 * Inspector Types (READ-ONLY Property Grid)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Property grid jako read-only inspector
 * - wizard_screens.md § 2.4: Inspector wyświetla właściwości wybranego elementu
 *
 * 100% POLISH UI
 */

import type { KryteriaNapieciowe } from '../power-flow-results/types';
import type { ElementType, ValidationMessage } from '../types';

/**
 * Sekcja właściwości w inspektorze.
 */
export interface InspectorSection {
  id: string;
  label: string;
  fields: InspectorField[];
  collapsed?: boolean;
}

/**
 * Pochodzenie (provenance) wartości w inspektorze.
 * Używane w trybie Audyt (TA) do śledzenia źródła wartości.
 */
export interface ValueProvenance {
  /** Skrótowy typ źródła — wyświetlany jako znacznik. */
  sourceLabel: string;
  /** Pełny opis źródła (po polsku). */
  descriptionPl: string;
  /** Identyfikator powiązanego wpisu w katalogu (opcjonalnie). */
  catalogId?: string;
  /** Identyfikator uruchomienia obliczeń (opcjonalnie). */
  runId?: string;
  /** Wersja/rewizja modelu ENM w chwili obliczenia (opcjonalnie). */
  enmRevision?: number;
  /** Czas ostatniej aktualizacji (ISO 8601, opcjonalnie). */
  updatedAt?: string;
  /** Status aktualności: aktualne / nieaktualne / brak. */
  freshness?: 'FRESH' | 'OUTDATED' | 'NONE';
}

/**
 * Pole właściwości w inspektorze (read-only).
 */
export interface InspectorField {
  key: string;
  label: string;
  value: unknown;
  unit?: string;
  source?: 'instance' | 'type' | 'calculated' | 'audit';
  highlight?: 'primary' | 'warning' | 'error';
  /** Opcjonalne dane o pochodzeniu wartości — używane w trybie Audyt (TA). */
  provenance?: ValueProvenance;
}

/**
 * Dane elementu do wyświetlenia w inspektorze.
 */
export interface InspectorElementData {
  id: string;
  type: ElementType;
  name: string;
  sections: InspectorSection[];
  validationMessages?: ValidationMessage[];
}

/**
 * Typ wyniku do wyświetlenia w inspektorze.
 */
export type InspectorResultType = 'bus' | 'branch' | 'short_circuit';

/**
 * Wynik szyny (Bus) do inspektora.
 */
export interface BusResultData {
  bus_id: string;
  name: string;
  un_kv: number | null;
  u_kv: number | null;
  u_pu: number | null;
  angle_deg: number | null;
  flags: string[];
  /** Karta W3-J — kryteria napięciowe biegu (addytywne); brak = kryterium
   * niedostępne w zakładce „Limity" (uczciwy stan, nie domyślna liczba). */
  kryteria_napiecia?: KryteriaNapieciowe | null;
}

/**
 * Wynik gałęzi (Branch) do inspektora.
 */
export interface BranchResultData {
  branch_id: string;
  name: string;
  from_bus: string;
  to_bus: string;
  /** Prąd zacisku początkowego (`od`) [A]. */
  i_a: number | null;
  /**
   * Prąd zacisku końcowego (`do`) [A] — pole ADDYTYWNE kontraktu wiersza gałęzi
   * (decyzja O-51, klasa P9): gałąź z susceptancją albo z przekładnią ma na końcach
   * inne prądy. Opcjonalne tylko dla odpowiedzi sprzed pola; `null` = brak danej.
   */
  i_do_a?: number | null;
  p_mw: number | null;
  q_mvar: number | null;
  s_mva: number | null;
  /** Obciążenie z większego ilorazu prąd zacisku / prąd znamionowy zacisku [%]. */
  loading_pct: number | null;
  /** Powód braku obciążenia (addytywne; `null`, gdy obciążenie policzono). */
  loading_powod_braku_pl?: string | null;
  flags: string[];
}

/**
 * Wynik zwarcia (Short-Circuit) do inspektora.
 */
export interface ShortCircuitResultData {
  target_id: string;
  target_name: string | null;
  fault_type: string | null;
  ikss_ka: number | null;
  ip_ka: number | null;
  ith_ka: number | null;
  sk_mva: number | null;
}

/**
 * Etykiety sekcji (Polish).
 */
export const INSPECTOR_SECTION_LABELS: Record<string, string> = {
  identification: 'Identyfikacja',
  topology: 'Topologia',
  electrical: 'Parametry elektryczne',
  results: 'Wyniki obliczen',
  power_flow: 'Rozpływ mocy',
  short_circuit: 'Prady zwarciowe',
  protection: 'Zabezpieczenia',
  diagnostics: 'Diagnostyka',
  flags: 'Flagi i ostrzezenia',
};

/**
 * Etykiety flag (Polish).
 */
export const FLAG_LABELS: Record<string, string> = {
  VOLTAGE_VIOLATION: 'Przekroczenie napięcia',
  OVERLOAD: 'Przeciążenie',
  SLACK: 'Węzeł bilansujący',
  UNDERVOLTAGE: 'Zbyt niskie napięcie',
  OVERVOLTAGE: 'Zbyt wysokie napięcie',
};
