/**
 * Synchronizacja ekranu zwarć ze schematem (karta W-C, ZWARCIA-PRO F4 pkt 6) —
 * REUŻYCIE wzorca V12K-073 (`kreatory/rama/selekcjaPoOperacji.ts`): selekcja
 * we wspólnym store (`selectElement`) + centrowanie SLD (`centerSldOnElement`)
 * + nawigacja (`navigateToSld`). Ten sam łańcuch, inne źródło refu: element_id
 * WIERSZA KANONICZNEGO wyniku zwarciowego (dane backendu, nie domysł UI).
 *
 * Dodatkowo (pkt 7 — wpięcie minimalne): przed nawigacją ładowany jest overlay
 * rozpływu zwarciowego do produkcyjnego `useOverlayStore.loadOverlay` (ta sama
 * ścieżka, którą karmi orkiestrator legacy — `adaptRawOverlayToTyped` →
 * `loadOverlay`), zbudowany czystym adapterem rodziny overlay
 * (`adaptShortCircuitFlowToOverlay`) z danych wiersza. Zero fizyki, zero
 * mutacji modelu.
 */
import { useCallback } from 'react';

import { navigateToSld } from '../../../ui/navigation/routes';
import type { ShortCircuitRow } from '../../../ui/results-inspector/types';
import { useSelectionStore } from '../../../ui/selection';
import { adaptShortCircuitFlowToOverlay } from '../../../ui/sld-overlay';
import { useOverlayStore } from '../../../ui/sld-overlay/overlayStore';

/**
 * Hook: zwraca akcję „Pokaż na schemacie" dla wiersza punktu zwarcia.
 * Ref i nazwa pochodzą z wiersza kanonicznego (element_id/target_id,
 * target_name); typ elementu punktu zwarcia = szyna (`Bus` — punkty zwarcia
 * toru kanonicznego to węzły sieci).
 */
export function usePokazZwarcieNaSchemacie(): (
  row: ShortCircuitRow,
  runId: string | null,
) => void {
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const loadOverlay = useOverlayStore((s) => s.loadOverlay);

  return useCallback(
    (row: ShortCircuitRow, runId: string | null) => {
      const ref = row.element_id ?? row.target_id;
      selectElement({ id: ref, type: 'Bus', name: row.target_name ?? ref });
      centerSldOnElement(ref);
      if (runId) {
        // Overlay rozpływu: wpisy wiersza (lub sam znacznik punktu zwarcia,
        // gdy starszy wynik nie niesie rozpływu — uczciwie bez gałęzi).
        loadOverlay(
          adaptShortCircuitFlowToOverlay({
            run_id: runId,
            fault_type: row.fault_type,
            fault_element_ref: ref,
            flows: row.branch_contributions ?? [],
          }),
        );
      }
      navigateToSld();
    },
    [centerSldOnElement, loadOverlay, selectElement],
  );
}
