/**
 * useSanityChecks Hook (READ-ONLY)
 *
 * CANONICAL ALIGNMENT:
 * - backend/src/application/analyses/protection/sanity_checks/
 * - 100% POLISH UI
 *
 * Hook do pobierania wynikow walidacji zabezpieczen.
 *
 * STATUS: API adapter placeholder.
 *
 * UWAGA:
 * Runtime nie pokazuje danych testowych. Po dodaniu endpointu API
 * implementacja zostanie zaktualizowana tak, aby zasilać panel danymi systemowymi.
 */

import { useMemo } from 'react';
import type {
  ProtectionSanityCheckResult,
  ElementDiagnostics,
  DiagnosticsSeverityFilter,
} from './sanity-types';
import {
  groupResultsByElement,
  matchesSeverityFilter,
} from './sanity-types';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Fixture data are exported for unit tests only. Runtime hooks must not
 * synthesize diagnostics when the backend has not returned them.
 */
const USE_FIXTURE_DATA = false;

// =============================================================================
// Fixture Data (dla testow UI)
// =============================================================================

/**
 * Przykladowe dane fixture.
 *
 * Mapowanie element_id do fixture elementow z element-assignment.ts:
 * - switch-001, switch-002 (Switch)
 * - trafo-001 (TransformerBranch)
 * - connection_node-001 (Bus - punkt wspolnego przylaczenia)
 * - line-001 (LineBranch)
 */
export const SANITY_CHECK_FIXTURES: ProtectionSanityCheckResult[] = [
  // ERROR: Nakladanie progow I> i I>> dla switch-001
  {
    severity: 'ERROR',
    code: 'OC_OVERLAP',
    message_pl: 'Nakladanie sie progow I> i I>> (I> >= I>>): prog I>=600 A >= prog I>>=500 A',
    element_id: 'switch-001',
    element_type: 'Switch',
    function_ansi: '50/51',
    function_code: 'OVERCURRENT',
    evidence: {
      i_gt_a: 600,
      i_inst_a: 500,
    },
  },

  // WARN: Prog I> zbyt niski dla switch-002
  {
    severity: 'WARN',
    code: 'OC_I_GT_TOO_LOW',
    message_pl: 'Prog I> zbyt niski (< 1,0×In): 0,8×In = 402 A',
    element_id: 'switch-002',
    element_type: 'Switch',
    function_ansi: '51',
    function_code: 'OVERCURRENT_TIME',
    evidence: {
      i_gt_multiplier: 0.8,
      i_rated_a: 503,
      i_gt_a: 402,
    },
  },

  // ERROR: Nakladanie U< i U> dla connection_node-001 (BoundaryNode)
  {
    severity: 'ERROR',
    code: 'VOLT_OVERLAP',
    message_pl: 'Nakladanie sie progow U< i U> (U< >= U>): U<=0,9×Un >= U>=0,85×Un',
    element_id: 'connection_node-001',
    element_type: 'Bus',
    function_ansi: '27/59',
    function_code: 'VOLTAGE',
    evidence: {
      u_lt_multiplier: 0.9,
      u_gt_multiplier: 0.85,
    },
  },

  // WARN: Prog f< zbyt niski dla connection_node-001
  {
    severity: 'WARN',
    code: 'FREQ_F_LT_TOO_LOW',
    message_pl: 'Prog f< zbyt niski (< 45 Hz): 44,5 Hz',
    element_id: 'connection_node-001',
    element_type: 'Bus',
    function_ansi: '81U',
    function_code: 'UNDERFREQUENCY',
    evidence: {
      f_lt_hz: 44.5,
    },
  },

  // INFO: Brak danych bazowych dla trafo-001
  {
    severity: 'INFO',
    code: 'GEN_PARTIAL_ANALYSIS',
    message_pl: 'Brak danych bazowych — analiza czesciowa (brak In dla strony WN)',
    element_id: 'trafo-001',
    element_type: 'TransformerBranch',
    function_ansi: '87',
    function_code: 'DIFFERENTIAL',
  },

  // WARN: SPZ bez funkcji wyzwalajacej dla connection_node-001
  {
    severity: 'WARN',
    code: 'SPZ_NO_TRIP_FUNCTION',
    message_pl: 'SPZ aktywne bez funkcji wyzwalajacej — brak I> lub I>> do wyzwolenia SPZ',
    element_id: 'connection_node-001',
    element_type: 'Bus',
    function_ansi: '79',
    function_code: 'RECLOSING',
  },

  // ERROR: Brak In dla line-001 (zablokowane urzadzenie)
  {
    severity: 'ERROR',
    code: 'OC_MISSING_IN',
    message_pl: 'Brak wartosci In dla nastawy pradowej — nie mozna obliczyc progow',
    element_id: 'line-001',
    element_type: 'LineBranch',
    function_ansi: '50/51',
    function_code: 'OVERCURRENT',
  },
];

// =============================================================================
// Hook: useSanityChecks
// =============================================================================

interface UseSanityChecksResult {
  /** Wszystkie wyniki walidacji */
  results: ProtectionSanityCheckResult[];

  /** Wyniki zgrupowane po elemencie */
  byElement: Map<string, ElementDiagnostics>;

  /** Zbiór elementow z diagnostyka */
  elementsWithDiagnostics: Set<string>;

  /** Liczba bledow */
  errorCount: number;

  /** Liczba ostrzezen */
  warnCount: number;

  /** Liczba informacji */
  infoCount: number;

  /** Czy sa jakiekolwiek wyniki */
  hasResults: boolean;

  /** Czy dane sa ladowane */
  isLoading: boolean;

  /** Blad ladowania */
  error: string | null;
}

/**
 * Hook do pobierania wszystkich wynikow walidacji zabezpieczen.
 *
 * @param projectId - ID projektu
 * @param diagramId - ID diagramu SLD
 */
export function useSanityChecks(
  projectId: string | null | undefined,
  diagramId: string | null | undefined
): UseSanityChecksResult {
  const results = useMemo(() => {
    if (!projectId || !diagramId) return [];

    if (USE_FIXTURE_DATA) {
      return SANITY_CHECK_FIXTURES;
    }

    // TODO: Implementacja rzeczywistego pobierania z API
    return [];
  }, [projectId, diagramId]);

  const byElement = useMemo(() => groupResultsByElement(results), [results]);

  const elementsWithDiagnostics = useMemo(
    () => new Set(byElement.keys()),
    [byElement]
  );

  const { errorCount, warnCount, infoCount } = useMemo(() => {
    let errors = 0;
    let warns = 0;
    let infos = 0;
    for (const result of results) {
      switch (result.severity) {
        case 'ERROR':
          errors++;
          break;
        case 'WARN':
          warns++;
          break;
        case 'INFO':
          infos++;
          break;
      }
    }
    return { errorCount: errors, warnCount: warns, infoCount: infos };
  }, [results]);

  return {
    results,
    byElement,
    elementsWithDiagnostics,
    errorCount,
    warnCount,
    infoCount,
    hasResults: results.length > 0,
    isLoading: false,
    error: null,
  };
}

// =============================================================================
// Hook: useSanityChecksByElement
// =============================================================================

interface UseSanityChecksByElementResult {
  /** Wyniki dla elementu */
  diagnostics: ElementDiagnostics | null;

  /** Czy element ma diagnostyke */
  hasDiagnostics: boolean;

  /** Czy dane sa ladowane */
  isLoading: boolean;

  /** Blad ladowania */
  error: string | null;
}

/**
 * Hook do pobierania wynikow walidacji dla konkretnego elementu.
 *
 * @param elementId - ID elementu sieci
 */
export function useSanityChecksByElement(
  elementId: string | null | undefined
): UseSanityChecksByElementResult {
  const diagnostics = useMemo(() => {
    if (!elementId) return null;

    if (USE_FIXTURE_DATA) {
      const elementResults = SANITY_CHECK_FIXTURES.filter(
        (r) => r.element_id === elementId
      );
      if (elementResults.length === 0) return null;

      const map = groupResultsByElement(elementResults);
      return map.get(elementId) ?? null;
    }

    // TODO: Implementacja rzeczywistego pobierania z API
    return null;
  }, [elementId]);

  return {
    diagnostics,
    hasDiagnostics: diagnostics !== null,
    isLoading: false,
    error: null,
  };
}

// =============================================================================
// Hook: useFilteredSanityChecks
// =============================================================================

interface UseFilteredSanityChecksResult extends UseSanityChecksResult {
  /** Przefiltrowane wyniki (widoczne markery) */
  filteredResults: ProtectionSanityCheckResult[];

  /** Przefiltrowane wyniki zgrupowane po elemencie */
  filteredByElement: Map<string, ElementDiagnostics>;

  /** Zbiór elementow z widoczna diagnostyka */
  visibleElements: Set<string>;
}

/**
 * Hook do pobierania przefiltrowanych wynikow.
 *
 * @param projectId - ID projektu
 * @param diagramId - ID diagramu SLD
 * @param filter - Filtr severity
 */
export function useFilteredSanityChecks(
  projectId: string | null | undefined,
  diagramId: string | null | undefined,
  filter: DiagnosticsSeverityFilter
): UseFilteredSanityChecksResult {
  const base = useSanityChecks(projectId, diagramId);

  const filteredResults = useMemo(() => {
    return base.results.filter((r) => matchesSeverityFilter(r.severity, filter));
  }, [base.results, filter]);

  const filteredByElement = useMemo(
    () => groupResultsByElement(filteredResults),
    [filteredResults]
  );

  const visibleElements = useMemo(
    () => new Set(filteredByElement.keys()),
    [filteredByElement]
  );

  return {
    ...base,
    filteredResults,
    filteredByElement,
    visibleElements,
  };
}
