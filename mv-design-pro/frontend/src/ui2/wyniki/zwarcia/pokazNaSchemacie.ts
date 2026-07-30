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
 *
 * Karta S-B (pkt 7 — domknięcie strzałek kierunku): TE SAME dane wiersza idą
 * dodatkowo do kanału kierunku `loadFaultFlow` (`useOverlayStore.faultFlow`) —
 * `OverlayPayloadV1` (lustro backendu 1:1) nie niesie kierunku, a strzałki na
 * kanwie v3 potrzebują "from_to"/"to_from" per wpis. Kolejność ISTOTNA:
 * `loadFaultFlow` PO `loadOverlay` (loadOverlay zeruje faultFlow — invariant
 * „replaces ALL previous state").
 */
import { useCallback } from 'react';

import { navigateToSld } from '../../../ui/navigation/routes';
import type { ShortCircuitBranchFlow, ShortCircuitRow } from '../../../ui/results-inspector/types';
import { useSelectionStore } from '../../../ui/selection';
import { adaptShortCircuitFlowToOverlay } from '../../../ui/sld-overlay';
import { useOverlayStore } from '../../../ui/sld-overlay/overlayStore';

/**
 * Hook: zwraca akcję „Pokaż na schemacie" dla wiersza punktu zwarcia.
 * Ref i nazwa pochodzą z wiersza kanonicznego (element_id/target_id,
 * target_name); typ elementu punktu zwarcia = szyna (`Bus` — punkty zwarcia
 * toru kanonicznego to węzły sieci).
 *
 * V12K-281 (K13): rozpływ gałęziowy przychodzi JAWNYM parametrem (dostawca na
 * żądanie `useRozplywZwarciowy` w ekranie) — wiersze zbiorcze nie niosą już
 * rozpływu; pole wiersza zostaje torem zapasowym (mock/starszy pełny zapis).
 */
export function usePokazZwarcieNaSchemacie(): (
  row: ShortCircuitRow,
  runId: string | null,
  rozplyw?: readonly ShortCircuitBranchFlow[] | null,
) => void {
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const loadOverlay = useOverlayStore((s) => s.loadOverlay);
  const loadFaultFlow = useOverlayStore((s) => s.loadFaultFlow);

  return useCallback(
    (
      row: ShortCircuitRow,
      runId: string | null,
      rozplyw?: readonly ShortCircuitBranchFlow[] | null,
    ) => {
      const ref = row.element_id ?? row.target_id;
      selectElement({ id: ref, type: 'Bus', name: row.target_name ?? ref });
      centerSldOnElement(ref);
      if (runId) {
        // Overlay rozpływu: wpisy z dostawcy na żądanie (lub z pola wiersza —
        // tor zapasowy), a gdy rozpływ niedostępny (starszy wynik) — sam
        // znacznik punktu zwarcia, uczciwie bez gałęzi.
        const wejscie = {
          run_id: runId,
          fault_type: row.fault_type,
          fault_element_ref: ref,
          flows: [...(rozplyw ?? row.branch_contributions ?? [])],
        };
        loadOverlay(adaptShortCircuitFlowToOverlay(wejscie));
        // Karta S-B: kanał KIERUNKU dla strzałek kanwy v3 (loadOverlay wyżej
        // zeruje faultFlow — kolejność istotna, patrz nagłówek pliku).
        loadFaultFlow(wejscie);
      }
      navigateToSld();
    },
    [centerSldOnElement, loadFaultFlow, loadOverlay, selectElement],
  );
}
