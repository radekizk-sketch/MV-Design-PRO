/**
 * P16a — useProtectionAssignment Hook (READ-ONLY)
 *
 * Hook adaptera do pobierania przypisań zabezpieczeń do elementów.
 *
 * STATUS: API adapter placeholder.
 *
 * UWAGA:
 * Runtime nie pokazuje przypisań testowych. Po rozszerzeniu modelu NetworkModel
 * lub dodaniu endpointu API, implementacja zostanie zaktualizowana.
 *
 * DOCELOWA IMPLEMENTACJA:
 * - Opcja A: Pobieranie z NetworkModel (jeśli model zostanie rozszerzony)
 * - Opcja B: Osobny endpoint API: GET /api/projects/{id}/protection-assignments
 * - Opcja C: Dane osadzone w Protection Case Config
 */

import { useMemo } from 'react';
import type { ElementProtectionAssignment } from './element-assignment';
import { PROTECTION_ASSIGNMENT_FIXTURES } from './element-assignment';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Fixture data are kept for tests only. Runtime hooks must not create
 * protection assignments that are not present in project data/API.
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
  // Memoized filter dla stabilności referencji
  const assignments = useMemo(() => {
    if (!elementId) return [];

    if (USE_FIXTURE_DATA) {
      // Placeholder: zwraca fixture data dla znanych elementów
      return PROTECTION_ASSIGNMENT_FIXTURES.filter((a) => a.element_id === elementId);
    }

    // TODO: Implementacja rzeczywistego pobierania danych
    // const data = await fetchProtectionAssignments(projectId, elementId);
    return [];
  }, [elementId]);

  const hasProtection = assignments.length > 0;

  return {
    assignments,
    hasProtection,
    isLoading: false, // Fixture data nie wymaga ładowania
    error: null,
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
      // Grupuj fixture data po element_id
      for (const assignment of PROTECTION_ASSIGNMENT_FIXTURES) {
        const existing = map.get(assignment.element_id) || [];
        existing.push(assignment);
        map.set(assignment.element_id, existing);
      }
      return map;
    }

    // TODO: Implementacja rzeczywistego pobierania danych
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
