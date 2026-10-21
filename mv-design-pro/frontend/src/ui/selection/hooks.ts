/**
 * Zaznaczenie z dowolnej powierzchni (wyniki, dowód, schemat) — jeden hook.
 *
 * K2: usunięte martwe hooki `useSldSelection`, `useTreeSelection`,
 * `useSelectionSync`, `usePropertyGridSelection` i `useContextMenuState` (zero
 * konsumentów poza re-eksportami; `useSelectionSync` był jedynym, nigdy
 * niemontowanym czytelnikiem `sldCenterOnElement`). Wskazanie elementu na
 * schemacie czyta przestrzeń schematu (`SldCanvasV3Workspace`, `sldWskazanie`).
 */

import { useCallback } from 'react';
import type { ElementType } from '../types';
import { useSelectionStore } from './store';

export function useGlobalSelectionSync() {
  const {
    selectElement,
    selectedElement,
    selectedElements,
    centerSldOnElement,
    propertyGridOpen,
    togglePropertyGrid,
  } = useSelectionStore();

  const selectFromAnySource = useCallback(
    (
      elementId: string,
      elementType: ElementType,
      elementName: string,
      options?: {
        centerSld?: boolean;
        openInspector?: boolean;
      }
    ) => {
      selectElement({ id: elementId, type: elementType, name: elementName });

      if (options?.centerSld) {
        centerSldOnElement(elementId);
      }

      if (options?.openInspector && !propertyGridOpen) {
        togglePropertyGrid(true);
      }
    },
    [centerSldOnElement, propertyGridOpen, selectElement, togglePropertyGrid]
  );

  const selectFromResults = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectFromAnySource(elementId, elementType, elementName, {
        centerSld: true,
        openInspector: true,
      });
    },
    [selectFromAnySource]
  );

  const selectFromSld = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectFromAnySource(elementId, elementType, elementName, {
        centerSld: false,
        openInspector: true,
      });
    },
    [selectFromAnySource]
  );

  const selectFromProof = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectFromAnySource(elementId, elementType, elementName, {
        centerSld: true,
        openInspector: true,
      });
    },
    [selectFromAnySource]
  );

  const clearSelection = useCallback(() => {
    selectElement(null);
  }, [selectElement]);

  return {
    selectedElement,
    selectedElements,
    hasSelection: selectedElement !== null,
    selectFromSld,
    selectFromResults,
    selectFromProof,
    selectFromAnySource,
    clearSelection,
    centerSldOnElement,
  };
}
