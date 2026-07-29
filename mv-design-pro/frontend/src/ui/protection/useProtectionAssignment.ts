/**
 * P16a — useProtectionAssignment Hook (READ-ONLY)
 *
 * Hook adaptera do pobierania przypisań zabezpieczeń do elementów.
 *
 * ŹRÓDŁO DANYCH (Audyt E, E-5):
 * Realny endpoint read modelu `GET /api/cases/{caseId}/enm/protection-view`
 * (backend `application/protection_read_model`). Hook `useProtectionView`
 * pobiera widok dla aktywnego case'u, a `assignmentsForElement` filtruje
 * przypisania po `elementId` zaznaczonego elementu. Brak przypisania ⇒
 * pusta lista (uczciwy stan zerowy). ZERO fizyki w UI — wartości z backendu.
 *
 * Bulk (`useProtectionAssignments`) dla nakładki SLD nadal czeka na
 * dedykowany endpoint zbiorczy — patrz komentarz przy tym hooku niżej.
 */

import { useMemo } from 'react';
import type { ElementProtectionAssignment } from './element-assignment';
import { PROTECTION_ASSIGNMENT_FIXTURES } from './element-assignment';
import { useProtectionView } from './useProtectionView';
import { assignmentsForElement } from './protection-view';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Fixture data are kept for the SLD-overlay bulk hook (tests/Storybook only).
 * Runtime hooks must not create protection assignments that are not present
 * in project data/API.
 */
const USE_FIXTURE_DATA = false;

// =============================================================================
// Hook: useProtectionAssignment
// =============================================================================

interface UseProtectionAssignmentResult {
  /** Wszystkie przypisania dla danego elementu */
  assignments: ElementProtectionAssignment[];

  /** Czy element ma przypisane zabezpieczenia */
  hasProtection: boolean;

  /** Czy dane są ładowane */
  isLoading: boolean;

  /** Błąd ładowania (jeśli wystąpił) */
  error: string | null;
}

/**
 * Hook do pobierania przypisań zabezpieczeń dla elementu.
 *
 * @param elementId - ID elementu sieci (SldSymbol.elementId)
 * @returns Przypisania zabezpieczeń i stan ładowania
 *
 * @example
 * ```tsx
 * function ProtectionSection({ elementId }) {
 *   const { assignments, hasProtection, isLoading } = useProtectionAssignment(elementId);
 *
 *   if (!hasProtection) return null;
 *
 *   return (
 *     <div>
 *       {assignments.map(a => (
 *         <ProtectionBadge key={a.device_id} assignment={a} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useProtectionAssignment(
  elementId: string | null | undefined
): UseProtectionAssignmentResult {
  // Realny read model zabezpieczeń dla aktywnego case'u (E-5).
  const { data, isLoading, error } = useProtectionView();

  // Filtr po elemencie — stabilna referencja dla renderu.
  const assignments = useMemo(
    () => assignmentsForElement(data, elementId),
    [data, elementId]
  );

  const hasProtection = assignments.length > 0;

  return {
    assignments,
    hasProtection,
    isLoading,
    error,
  };
}

// =============================================================================
// Hook: useProtectionAssignments (bulk)
// =============================================================================

interface UseProtectionAssignmentsResult {
  /** Mapa: elementId → przypisania */
  assignmentsByElement: Map<string, ElementProtectionAssignment[]>;

  /** Zbiór elementów z zabezpieczeniami */
  elementsWithProtection: Set<string>;

  /** Czy dane są ładowane */
  isLoading: boolean;

  /** Błąd ładowania (jeśli wystąpił) */
  error: string | null;
}

/**
 * Hook do pobierania wszystkich przypisań zabezpieczeń (bulk).
 * Używane do renderowania nakładki SLD.
 *
 * @param projectId - ID projektu
 * @param diagramId - ID diagramu SLD
 * @returns Mapa przypisań i stan ładowania
 */
export function useProtectionAssignments(
  projectId: string | null | undefined,
  diagramId: string | null | undefined
): UseProtectionAssignmentsResult {
  const assignmentsByElement = useMemo(() => {
    const map = new Map<string, ElementProtectionAssignment[]>();

    if (!projectId || !diagramId) return map;

    if (USE_FIXTURE_DATA) {
      // Grupowanie fixture po element_id (tylko testy/Storybook).
      for (const assignment of PROTECTION_ASSIGNMENT_FIXTURES) {
        const existing = map.get(assignment.element_id) || [];
        existing.push(assignment);
        map.set(assignment.element_id, existing);
      }
      return map;
    }

    // Bulk endpoint dla nakładki SLD nie jest jeszcze dostępny. Pusta mapa
    // = "brak przypisań" — nakładka nie pokaże fałszywych badge'ów. Po
    // dodaniu endpointu: GET /api/projects/{id}/protection-assignments → JSON.
    return map;
  }, [projectId, diagramId]);

  const elementsWithProtection = useMemo(() => {
    return new Set(assignmentsByElement.keys());
  }, [assignmentsByElement]);

  return {
    assignmentsByElement,
    elementsWithProtection,
    isLoading: false,
    error: null,
  };
}
