/*
 * JEDNA ścieżka zaznaczenia elementu modelu z chromu powłoki (karta K1 POWLOKA):
 * wyszukiwarka poleceń (obiekty modelu), zakładki „Problemy" i „Dziennik" panelu
 * dolnego oraz panel gotowości.
 *
 * 1. Element jest rozwiązywany w migawce modelu (`resolveSelectedElementFromSnapshot`)
 *    i zaznaczany w store selekcji — schemat podświetla go i KADRUJE kanwę
 *    (`centerSldOnElement`, tryb „kadruj" — karta K2, akcja kamery `'kadruj'`).
 * 2. Na szynie zdarzeń idzie `selekcja` z PRAWDZIWYM źródłem (inspektor powłoki).
 * Ref nieobecny w migawce (np. element usunięty) nie trafia do store'u selekcji —
 * zostaje wyłącznie zdarzenie, a inspektor pokazuje uczciwy brak obiektu.
 */

import { emituj } from '../events';
import { useSelectionStore } from '../../ui/selection/store';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { resolveSelectedElementFromSnapshot } from '../../ui/shared/selectionResolution';
import { przejdzDoPrzestrzeni } from './przejsciaPrzestrzeni';

/** Zaznacza element; zwraca `true`, gdy ref istnieje w migawce modelu. */
export function zaznaczElementModelu(ref: string, zrodlo: string): boolean {
  const element = resolveSelectedElementFromSnapshot(useSnapshotStore.getState().snapshot, ref);
  if (element) {
    const selekcja = useSelectionStore.getState();
    selekcja.selectElement(element);
    selekcja.centerSldOnElement(element.id, 'kadruj');
  }
  emituj({ typ: 'selekcja', obiektId: ref, zrodlo });
  return element !== null;
}

/**
 * K2 (W5-UI-14, rozstrzygnięcie §0.6): „pokaż problem na schemacie" — klik
 * problemu w gotowości albo w panelu dolnym ZAZNACZA element, PRZEŁĄCZA na
 * przestrzeń „Schemat" i kadruje element (wskazanie w trybie „kadruj" obsługuje
 * przestrzeń schematu po zamontowaniu — `sldWskazanie` w store selekcji).
 * Ref nieobecny w migawce nie przełącza przestrzeni: nie ma czego pokazać, więc
 * projektant zostaje tam, gdzie był (zdarzenie `selekcja` idzie jak zawsze).
 */
export function pokazElementNaSchemacie(ref: string, zrodlo: string): boolean {
  const zaznaczony = zaznaczElementModelu(ref, zrodlo);
  if (zaznaczony) przejdzDoPrzestrzeni('schemat');
  return zaznaczony;
}
