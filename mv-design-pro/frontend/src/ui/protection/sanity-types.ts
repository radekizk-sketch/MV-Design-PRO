/**
 * Protection Sanity Check Types (Frontend)
 *
 * CANONICAL ALIGNMENT:
 * - backend/src/application/analyses/protection/sanity_checks/models.py
 * - 100% POLISH UI
 *
 * READ-ONLY: Typy dla wynikow walidacji zabezpieczen.
 * Bez obliczen, bez zmian backendu.
 */

import type { ElementType } from '../types';

// =============================================================================
// Severity - poziom waznosci
// =============================================================================

/**
 * Poziom waznosci wyniku walidacji.
 */
export type SanityCheckSeverity = 'ERROR' | 'WARN' | 'INFO';

/**
 * Polskie etykiety severity.
 */
export const SEVERITY_LABELS_PL: Record<SanityCheckSeverity, string> = {
  ERROR: 'Błąd',
  WARN: 'Ostrzeżenie',
  INFO: 'Informacja',
};

/**
 * Kolory severity (dla UI).
 */
export const SEVERITY_COLORS: Record<SanityCheckSeverity, {
  bg: string;
  border: string;
  text: string;
  marker: string;
}> = {
  ERROR: {
    bg: 'bg-rose-50',
    border: 'border-rose-500',
    text: 'text-rose-700',
    marker: 'bg-rose-500',
  },
  WARN: {
    bg: 'bg-amber-50',
    border: 'border-amber-500',
    text: 'text-amber-700',
    marker: 'bg-amber-500',
  },
  INFO: {
    bg: 'bg-blue-50',
    border: 'border-blue-500',
    text: 'text-blue-700',
    marker: 'bg-blue-500',
  },
};

/**
 * Kolejnosc severity (do sortowania: ERROR > WARN > INFO).
 */
export const SEVERITY_ORDER: Record<SanityCheckSeverity, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
};

// =============================================================================
// Sanity Check Codes - stabilne kody regul
// =============================================================================

/**
 * Kody regul walidacji (stabilne dla UI/raportow).
 * Zgodne z backend SanityCheckCode.
 */
export type SanityCheckCode =
  // Napieciowe (27/59)
  | 'VOLT_MISSING_UN'
  | 'VOLT_OVERLAP'
  | 'VOLT_U_LT_TOO_LOW'
  | 'VOLT_U_GT_TOO_HIGH'
  // Czestotliwosciowe (81U/81O)
  | 'FREQ_OVERLAP'
  | 'FREQ_F_LT_TOO_LOW'
  | 'FREQ_F_GT_TOO_HIGH'
  // ROCOF (81R)
  | 'ROCOF_NON_POSITIVE'
  | 'ROCOF_TOO_HIGH'
  // Nadpradowe (50/51)
  | 'OC_MISSING_IN'
  | 'OC_OVERLAP'
  | 'OC_I_GT_TOO_LOW'
  | 'OC_I_INST_TOO_LOW'
  // SPZ (79)
  | 'SPZ_NO_TRIP_FUNCTION'
  | 'SPZ_MISSING_CYCLE_DATA'
  // Ogolne
  | 'GEN_NEGATIVE_SETPOINT'
  | 'GEN_PARTIAL_ANALYSIS';

/**
 * Polskie etykiety kodow regul.
 */
export const SANITY_CHECK_CODE_LABELS_PL: Record<SanityCheckCode, string> = {
  // Napieciowe
  VOLT_MISSING_UN: 'Brak wartości Un dla nastawy napięciowej',
  VOLT_OVERLAP: 'Nakładanie się progów U< i U> (U< >= U>)',
  VOLT_U_LT_TOO_LOW: 'Próg U< zbyt niski (< 0,5×Un)',
  VOLT_U_GT_TOO_HIGH: 'Próg U> zbyt wysoki (> 1,2×Un)',
  // Czestotliwosciowe
  FREQ_OVERLAP: 'Nakładanie się progów f< i f> (f< >= f>)',
  FREQ_F_LT_TOO_LOW: 'Próg f< zbyt niski (< 45 Hz)',
  FREQ_F_GT_TOO_HIGH: 'Próg f> zbyt wysoki (> 55 Hz)',
  // ROCOF
  ROCOF_NON_POSITIVE: 'df/dt niedodatnie (<= 0)',
  ROCOF_TOO_HIGH: 'df/dt zbyt wysokie (> 10 Hz/s)',
  // Nadpradowe
  OC_MISSING_IN: 'Brak wartości In dla nastawy prądowej',
  OC_OVERLAP: 'Nakładanie się progów I> i I>> (I> >= I>>)',
  OC_I_GT_TOO_LOW: 'Próg I> zbyt niski (< 1,0×In)',
  OC_I_INST_TOO_LOW: 'Próg I>> zbyt niski (< 1,5×In)',
  // SPZ
  SPZ_NO_TRIP_FUNCTION: 'SPZ aktywne bez funkcji wyzwalającej',
  SPZ_MISSING_CYCLE_DATA: 'Brak danych cyklu SPZ',
  // Ogolne
  GEN_NEGATIVE_SETPOINT: 'Nastawa niefizyczna (ujemna)',
  GEN_PARTIAL_ANALYSIS: 'Brak danych bazowych — analiza częściowa',
};

// =============================================================================
// ProtectionSanityCheckResult - wynik walidacji
// =============================================================================

/**
 * Wynik pojedynczej reguly walidacji zabezpieczen.
 *
 * CANONICAL: Zgodne z backend ProtectionSanityCheckResult.
 */
export interface ProtectionSanityCheckResult {
  /** Poziom waznosci */
  severity: SanityCheckSeverity;

  /** Kod reguly (stabilny) */
  code: SanityCheckCode;

  /** Komunikat po polsku */
  message_pl: string;

  /** ID elementu sieci (bijection z SldSymbol.elementId) */
  element_id: string;

  /** Typ elementu */
  element_type: ElementType;

  /** Kod ANSI funkcji (opcjonalny, np. '27', '50') */
  function_ansi?: string;

  /** Kod wewnetrzny funkcji (opcjonalny) */
  function_code?: string;

  /** Dane wejsciowe jako dowod (opcjonalne) */
  evidence?: Record<string, unknown>;
}

// =============================================================================
// Diagnostics Filter - filtr severity
// =============================================================================

/**
 * Tryb filtrowania severity.
 */
export type DiagnosticsSeverityFilter =
  | 'ALL'           // Wszystkie
  | 'ERRORS_ONLY'   // Tylko bledy
  | 'ERRORS_WARNS'; // Bledy + ostrzezenia

/**
 * Polskie etykiety filtrow.
 */
export const SEVERITY_FILTER_LABELS_PL: Record<DiagnosticsSeverityFilter, string> = {
  ALL: 'Wszystkie',
  ERRORS_ONLY: 'Tylko błędy',
  ERRORS_WARNS: 'Błędy + ostrzeżenia',
};

/**
 * Sprawdza czy severity pasuje do filtra.
 */
export function matchesSeverityFilter(
  severity: SanityCheckSeverity,
  filter: DiagnosticsSeverityFilter
): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'ERRORS_ONLY':
      return severity === 'ERROR';
    case 'ERRORS_WARNS':
      return severity === 'ERROR' || severity === 'WARN';
    default:
      return true;
  }
}

// =============================================================================
// Aggregation - grupowanie po elemencie
// =============================================================================

/**
 * Zgrupowane wyniki dla elementu.
 */
export interface ElementDiagnostics {
  /** ID elementu */
  element_id: string;

  /** Typ elementu */
  element_type: ElementType;

  /** Wszystkie wyniki dla elementu */
  results: ProtectionSanityCheckResult[];

  /** Najwyzszy severity (ERROR > WARN > INFO) */
  max_severity: SanityCheckSeverity;

  /** Liczba bledow */
  error_count: number;

  /** Liczba ostrzezen */
  warn_count: number;

  /** Liczba informacji */
  info_count: number;
}

/**
 * Grupuje wyniki po element_id.
 * DETERMINISTYCZNE: sortowanie po severity malejaco, potem element_id rosnaco.
 */
export function groupResultsByElement(
  results: ProtectionSanityCheckResult[]
): Map<string, ElementDiagnostics> {
  const map = new Map<string, ElementDiagnostics>();

  for (const result of results) {
    let entry = map.get(result.element_id);

    if (!entry) {
      entry = {
        element_id: result.element_id,
        element_type: result.element_type,
        results: [],
        max_severity: 'INFO',
        error_count: 0,
        warn_count: 0,
        info_count: 0,
      };
      map.set(result.element_id, entry);
    }

    entry.results.push(result);

    switch (result.severity) {
      case 'ERROR':
        entry.error_count++;
        break;
      case 'WARN':
        entry.warn_count++;
        break;
      case 'INFO':
        entry.info_count++;
        break;
    }

    if (SEVERITY_ORDER[result.severity] < SEVERITY_ORDER[entry.max_severity]) {
      entry.max_severity = result.severity;
    }
  }

  for (const entry of map.values()) {
    entry.results.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }

  return map;
}
