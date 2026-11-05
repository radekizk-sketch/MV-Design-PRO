/**
 * Przejście „Parametry aparatu” (ekran wytrzymałości) → kreator edycji parametrów aparatu.
 *
 * Zasada nr 4 (V12K-351): wartości robocze aparatu są jawne i ZMIENIALNE. Akcja zaznacza
 * aparat na schemacie, przechodzi do budowy sieci i otwiera ISTNIEJĄCY kreator
 * `update_element_parameters` na sekcji wartości projektanta aparatu SN (`field: 'overrides'`
 * — kursor w pierwszym parametrze sekcji, `KreatorEdycjiParametrow`). Jeden przycisk na pole
 * zamiast osobnego „Zmień wartość” przy każdym parametrze (karta APARATURA-TABELA, wymaganie 7);
 * zapis i walidacja należą do operacji domenowej — tu wyłącznie selekcja i nawigacja.
 */

import { useCallback } from 'react';

import { navigateToNetworkBuild } from '../../../../ui/navigation/routes';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../../ui/selection';

/** Klucz sekcji wartości projektanta aparatu SN w kreatorze edycji parametrów. */
export const SEKCJA_PARAMETROW_APARATU = 'overrides';

export function useParametryAparatu(): (aparatRef: string, aparatNazwa: string) => void {
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  return useCallback(
    (aparatRef: string, aparatNazwa: string) => {
      selectElement({ id: aparatRef, type: 'Switch', name: aparatNazwa });
      centerSldOnElement(aparatRef);
      navigateToNetworkBuild();
      openOperationForm('update_element_parameters', {
        element_ref: aparatRef,
        element_type: 'Switch',
        field: SEKCJA_PARAMETROW_APARATU,
      });
    },
    [centerSldOnElement, openOperationForm, selectElement],
  );
}
