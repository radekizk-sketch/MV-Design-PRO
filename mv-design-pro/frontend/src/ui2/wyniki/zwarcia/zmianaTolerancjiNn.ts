/**
 * Przejście „Zmień wartość” założenia biegu `fault.c_tolerancja_nn_robocza` → kreator edycji
 * parametrów elementu zasilającego sieć nN.
 *
 * Zasada nr 4 (V12K-351, karta TOLERANCJA-NN-WARTOSC-ROBOCZA): brak deklaracji tolerancji
 * napięcia sieci nN nie blokuje zwarć — bieg liczy na wartości roboczej rejestru (+10 %,
 * IEC 60909-0 tab. 1) i zapisuje założenie, które nazywa element zasilający sieć nN
 * (`element_ref`), jego rodzaj w modelu (`element_type`: `Transformer` albo `Source`) i pole
 * deklaracji (`parametr`: `lv_voltage_tolerance`). Akcja zaznacza ten element, przechodzi do
 * budowy sieci i otwiera ISTNIEJĄCY kreator `update_element_parameters` z kursorem w polu
 * deklaracji; zapis, walidacja i unieważnienie wyników należą do operacji domenowej —
 * tu wyłącznie selekcja i nawigacja (wzorzec `aparatura/zmianaWartosciAparatu.ts`).
 */

import { useCallback } from 'react';

import { navigateToNetworkBuild } from '../../../ui/navigation/routes';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection';
import type { ElementType } from '../../../ui/types';

/** Rodzaj elementu w modelu (`raw_result.zalozenia[].element_type`) → typ selekcji SLD. */
const TYP_SELEKCJI: Readonly<Record<string, ElementType>> = {
  Transformer: 'TransformerBranch',
  Source: 'Source',
};

/** Cel zmiany: element i pole wskazane przez założenie biegu (dane backendu). */
export interface CelZmianyZalozenia {
  elementRef: string;
  elementType: string;
  parametr: string;
  nazwa: string;
}

/**
 * Typ selekcji dla rodzaju elementu założenia; `null` = rodzaj spoza mapowania (akcji nie
 * pokazujemy — przycisk prowadzący donikąd byłby martwym klikiem).
 */
export function typSelekcjiZalozenia(elementType: string): ElementType | null {
  return TYP_SELEKCJI[elementType] ?? null;
}

export function useZmienTolerancjeNn(): (cel: CelZmianyZalozenia) => void {
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  return useCallback(
    (cel: CelZmianyZalozenia) => {
      const typ = typSelekcjiZalozenia(cel.elementType);
      if (typ === null) return;
      selectElement({ id: cel.elementRef, type: typ, name: cel.nazwa });
      centerSldOnElement(cel.elementRef);
      navigateToNetworkBuild();
      openOperationForm('update_element_parameters', {
        element_ref: cel.elementRef,
        element_type: typ,
        field: cel.parametr,
      });
    },
    [centerSldOnElement, openOperationForm, selectElement],
  );
}
