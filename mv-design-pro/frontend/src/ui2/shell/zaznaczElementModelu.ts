/*
 * JEDNA ścieżka zaznaczenia elementu modelu z chromu powłoki (karta K1 POWLOKA):
 * wyszukiwarka poleceń (obiekty modelu) i zakładka „Problemy" panelu dolnego.
 *
 * 1. Element jest rozwiązywany w migawce modelu (`resolveSelectedElementFromSnapshot`)
 *    i zaznaczany w store selekcji — schemat podświetla go i centruje kanwę
 *    (`centerSldOnElement`, ta sama prawda co baner problemów semantycznych).
 * 2. Na szynie zdarzeń idzie `selekcja` z PRAWDZIWYM źródłem (inspektor powłoki).
 * Ref nieobecny w migawce (np. element usunięty) nie trafia do store'u selekcji —
 * zostaje wyłącznie zdarzenie, a inspektor pokazuje uczciwy brak obiektu.
 */

import { emituj } from '../events';
import { useSelectionStore } from '../../ui/selection/store';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { resolveSelectedElementFromSnapshot } from '../../ui/shared/selectionResolution';

export function zaznaczElementModelu(ref: string, zrodlo: string): void {
  const element = resolveSelectedElementFromSnapshot(useSnapshotStore.getState().snapshot, ref);
  if (element) {
    const selekcja = useSelectionStore.getState();
    selekcja.selectElement(element);
    selekcja.centerSldOnElement(element.id);
  }
  emituj({ typ: 'selekcja', obiektId: ref, zrodlo });
}
