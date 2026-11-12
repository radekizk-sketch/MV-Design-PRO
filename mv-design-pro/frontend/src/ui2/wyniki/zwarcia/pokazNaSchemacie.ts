/**
 * Synchronizacja ekranu zwarć ze schematem (karta W-C, ZWARCIA-PRO F4 pkt 6).
 * Wejście na schemat idzie JEDNĄ drogą (`pokazElementNaSchemacie` — karta
 * SLD-SKALA-I-NAWIGACJA, część W: zaznaczenie + kadr + przestrzeń „Schemat"
 * + „Wróć do: Wyniki — Zwarcia"); źródło refu: element_id WIERSZA KANONICZNEGO
 * wyniku zwarciowego (dane backendu, nie domysł UI) — `refPunktuZwarcia`.
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

import type { ShortCircuitBranchFlow, ShortCircuitRow } from '../../../ui/results-inspector/types';
import { adaptShortCircuitFlowToOverlay } from '../../../ui/sld-overlay';
import { useOverlayStore } from '../../../ui/sld-overlay/overlayStore';

/** Ref elementu punktu zwarcia — JEDEN dla przycisku i dla nakładki (predykaty parami). */
export function refPunktuZwarcia(row: ShortCircuitRow): string {
  return row.element_id ?? row.target_id;
}

/**
 * Hook: czynność „przed wejściem" akcji „Pokaż na schemacie" wiersza punktu
 * zwarcia — nakładka rozpływu zwarciowego biegu na schemat.
 *
 * V12K-281 (K13): rozpływ gałęziowy przychodzi JAWNYM parametrem (dostawca na
 * żądanie `useRozplywZwarciowy` w ekranie) — wiersze zbiorcze nie niosą już
 * rozpływu; pole wiersza zostaje torem zapasowym (mock/starszy pełny zapis).
 */
export function useNakladkaZwarciaNaSchemacie(): (
  row: ShortCircuitRow,
  runId: string | null,
  rozplyw?: readonly ShortCircuitBranchFlow[] | null,
) => void {
  const loadOverlay = useOverlayStore((s) => s.loadOverlay);
  const loadFaultFlow = useOverlayStore((s) => s.loadFaultFlow);

  return useCallback(
    (
      row: ShortCircuitRow,
      runId: string | null,
      rozplyw?: readonly ShortCircuitBranchFlow[] | null,
    ) => {
      if (!runId) return;
      // Overlay rozpływu: wpisy z dostawcy na żądanie (lub z pola wiersza —
      // tor zapasowy), a gdy rozpływ niedostępny (starszy wynik) — sam
      // znacznik punktu zwarcia, uczciwie bez gałęzi.
      const wejscie = {
        run_id: runId,
        fault_type: row.fault_type,
        fault_element_ref: refPunktuZwarcia(row),
        flows: [...(rozplyw ?? row.branch_contributions ?? [])],
      };
      loadOverlay(adaptShortCircuitFlowToOverlay(wejscie));
      // Karta S-B: kanał KIERUNKU dla strzałek kanwy v3 (loadOverlay wyżej
      // zeruje faultFlow — kolejność istotna, patrz nagłówek pliku).
      loadFaultFlow(wejscie);
    },
    [loadFaultFlow, loadOverlay],
  );
}
