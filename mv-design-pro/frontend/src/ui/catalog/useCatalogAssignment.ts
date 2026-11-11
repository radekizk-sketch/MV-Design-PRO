/**
 * Catalog Assignment Hook — reusable w drzewie, context menu, property grid, wizard.
 *
 * Łączy: elementCatalogRegistry → TypePicker → executeDomainOperation
 *
 * INVARIANTS:
 * - Nie zgaduje namespace — czyta z rejestru
 * - Używa backend operation 'assign_catalog_to_element' (canonical)
 * - Po przypisaniu odświeża snapshot (readiness, materialized_params)
 * - 100% Polish labels w stanach błędu
 */

import { useState, useCallback } from 'react';
import {
  getNamespaceForElement,
  getPickerCategory,
  getNamespaceLabelPl,
  requiresCatalogBinding,
} from './elementCatalogRegistry';
import type { CatalogNamespace, TypeCategory } from './types';
import { buildCatalogBinding } from './catalogBinding';

// =============================================================================
// Types
// =============================================================================

export interface CatalogAssignmentTarget {
  /** Element ref_id z ENM snapshot */
  elementRef: string;
  /** Pole `type` z ENM snapshot (np. 'line_overhead', 'cable', 'transformer') */
  enmElementType: string;
  /** Aktualnie przypisany catalog_ref (null = brak) */
  currentCatalogRef: string | null;
}

export interface CatalogAssignmentState {
  /** Czy picker jest otwarty */
  isPickerOpen: boolean;
  /** Namespace katalogu dla aktualnego elementu */
  namespace: CatalogNamespace | null;
  /** Kategoria pickera */
  pickerCategory: TypeCategory | null;
  /** Polska etykieta namespace */
  namespaceLabelPl: string | null;
  /** Aktualny target (element do przypisania) */
  target: CatalogAssignmentTarget | null;
  /** Czy element wymaga katalogu */
  requiresCatalog: boolean;
  /** Błąd (jeśli wystąpił) */
  error: string | null;
}

export interface CatalogAssignmentActions {
  /**
   * Otwórz picker dla danego elementu.
   *
   * Automatycznie określa namespace i kategorię na podstawie rejestru.
   * Nie otwiera pickera jeśli element nie wymaga katalogu.
   */
  openPicker: (target: CatalogAssignmentTarget) => void;

  /** Zamknij picker */
  closePicker: () => void;

  /**
   * Potwierdź wybór typu z katalogu.
   *
   * Wywołuje backend operation 'assign_catalog_to_element'.
   *
   * @param typeId - UUID wybranego typu z katalogu
   * @param typeName - Nazwa typu (dla audit)
   * @param executeDomainOp - Funkcja z snapshotStore
   */
  confirmAssignment: (
    typeId: string,
    typeName: string,
    executeDomainOp: (
      caseId: string,
      opName: string,
      payload: Record<string, unknown>
    ) => Promise<unknown>,
    caseId: string
  ) => Promise<boolean>;

  /**
   * Próba odpięcia katalogu.
   *
   * W trybie katalog-first jest blokowana dla elementów technicznych.
   */
  clearAssignment: (
    executeDomainOp: (
      caseId: string,
      opName: string,
      payload: Record<string, unknown>
    ) => Promise<unknown>,
    caseId: string
  ) => Promise<boolean>;
}

// =============================================================================
// Hook
// =============================================================================

export function useCatalogAssignment(): [CatalogAssignmentState, CatalogAssignmentActions] {
  const [state, setState] = useState<CatalogAssignmentState>({
    isPickerOpen: false,
    namespace: null,
    pickerCategory: null,
    namespaceLabelPl: null,
    target: null,
    requiresCatalog: false,
    error: null,
  });

  const openPicker = useCallback((target: CatalogAssignmentTarget) => {
    const ns = getNamespaceForElement(target.enmElementType);
    if (!ns) {
      setState((prev) => ({
        ...prev,
        error: `Element typu '${target.enmElementType}' nie wymaga katalogu`,
        isPickerOpen: false,
        target,
        requiresCatalog: false,
      }));
      return;
    }

    setState({
      isPickerOpen: true,
      namespace: ns,
      pickerCategory: getPickerCategory(ns),
      namespaceLabelPl: getNamespaceLabelPl(ns),
      target,
      requiresCatalog: requiresCatalogBinding(target.enmElementType),
      error: null,
    });
  }, []);

  const closePicker = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isPickerOpen: false,
      error: null,
    }));
  }, []);

  const confirmAssignment = useCallback(
    async (
      typeId: string,
      _typeName: string,
      executeDomainOp: (
        caseId: string,
        opName: string,
        payload: Record<string, unknown>
      ) => Promise<unknown>,
      caseId: string
    ): Promise<boolean> => {
      if (!state.target) {
        setState((prev) => ({ ...prev, error: 'Brak wybranego elementu' }));
        return false;
      }

      try {
        await executeDomainOp(caseId, 'assign_catalog_to_element', {
          element_ref: state.target.elementRef,
          catalog_binding: state.namespace
            ? buildCatalogBinding(state.namespace, typeId)
            : undefined,
        });

        setState((prev) => ({
          ...prev,
          isPickerOpen: false,
          error: null,
        }));
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Nieznany błąd przypisania katalogu';
        setState((prev) => ({ ...prev, error: message }));
        return false;
      }
    },
    [state.target]
  );

  const clearAssignment = useCallback(
    async (
      _executeDomainOp: (
        caseId: string,
        opName: string,
        payload: Record<string, unknown>
      ) => Promise<unknown>,
      _caseId: string
    ): Promise<boolean> => {
      if (!state.target) {
        setState((prev) => ({ ...prev, error: 'Brak wybranego elementu' }));
        return false;
      }

      setState((prev) => ({
        ...prev,
        error: 'Odpięcie katalogu dla elementu technicznego jest niedopuszczalne.',
      }));
      return false;
    },
    [state.namespace, state.target]
  );

  return [state, { openPicker, closePicker, confirmAssignment, clearAssignment }];
}
