/**
 * Magistrala zdarzen powloki (E15.1) — publiczne API modulu.
 * Kontrakt: docs/uiux/karty/U1_E15_1_MAGISTRALA.md.
 */

export type {
  ZdarzenieMagistrali,
  ZdarzenieModelZmieniony,
  ZdarzenieWynikiGotowe,
  ZdarzenieWynikiNiewazne,
  ZdarzenieSelekcja,
  ZdarzeniePrzypadekAktywny,
  ZdarzenieGotowoscZmieniona,
  TypZdarzenia,
  ZdarzenieTypu,
  ObsluznikZdarzenia,
} from './types';

export { MagistralaZdarzen, magistrala, emituj, subskrybuj, subskrybujWszystkie } from './bus';
export { useBusEvent } from './useBusEvent';

export { startSnapshotAdapter } from './adapters/snapshotAdapter';
export { startCaseAdapter } from './adapters/caseAdapter';
export { startSelectionAdapter, ZRODLO_STORE_SELEKCJI } from './adapters/selectionAdapter';

import { startSnapshotAdapter } from './adapters/snapshotAdapter';
import { startCaseAdapter } from './adapters/caseAdapter';
import { startSelectionAdapter } from './adapters/selectionAdapter';

/**
 * Uruchamia wszystkie adaptery istniejacych store'ow -> magistrala. Wywolac raz
 * przy starcie powloki. Zwraca funkcje zatrzymujaca wszystkie subskrypcje.
 */
export function startEventBusAdapters(): () => void {
  const zatrzymajSnapshot = startSnapshotAdapter();
  const zatrzymajCase = startCaseAdapter();
  const zatrzymajSelection = startSelectionAdapter();
  return () => {
    zatrzymajSnapshot();
    zatrzymajCase();
    zatrzymajSelection();
  };
}
