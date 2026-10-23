/**
 * Przejście „Zmień wartość” parametru aparatu (ekran wytrzymałości) → kreator edycji parametrów.
 *
 * Zasada nr 4 (V12K-351): wartość robocza aparatu jest jawna i ZMIENIALNA. Akcja zaznacza
 * aparat na schemacie, przechodzi do budowy sieci i otwiera ISTNIEJĄCY kreator
 * `update_element_parameters` z kursorem w polu wskazanego parametru (sekcja wartości
 * projektanta aparatu SN). Zapis i walidacja należą do operacji domenowej — tu wyłącznie
 * selekcja i nawigacja (wzorzec `przejscieDoStacji.ts`).
 */

import { useCallback } from 'react';

import { navigateToNetworkBuild } from '../../../../ui/navigation/routes';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../../ui/selection';

export function useZmienWartoscAparatu(): (
  aparatRef: string,
  aparatNazwa: string,
  parametr: string,
) => void {
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  return useCallback(
    (aparatRef: string, aparatNazwa: string, parametr: string) => {
      selectElement({ id: aparatRef, type: 'Switch', name: aparatNazwa });
      centerSldOnElement(aparatRef);
      navigateToNetworkBuild();
      openOperationForm('update_element_parameters', {
        element_ref: aparatRef,
        element_type: 'Switch',
        field: parametr,
      });
    },
    [centerSldOnElement, openOperationForm, selectElement],
  );
}
