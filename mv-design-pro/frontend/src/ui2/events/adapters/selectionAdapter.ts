/**
 * Adapter: tlumaczy zmiany store'u selekcji na zdarzenie magistrali 'selekcja'.
 *
 * Zrodlo store'u (WYLACZNIE odczyt/subscribe — zero zapisu, zero wolan API):
 * frontend/src/ui/selection/store.ts — useSelectionStore.selectedElement.id
 * -> obiektId. To jedyny, jednoznaczny globalny store selekcji w repo (patrz
 * naglowek pliku: "Single source of truth for selection state and cross-view
 * synchronization").
 *
 * TODO-KARTA (pytanie do zarzadcy — patrz raport E15.1 pkt 4 "mapowanie
 * adapterow -> store zrodlowy"):
 * Kontrakt karty (§3) wymaga pola `zrodlo` = "id okna emitujacego" zmiane
 * selekcji. `useSelectionStore` NIE przechowuje tej informacji: akcja
 * `selectElement(element)` (i pochodne: selectElements/toggleElement/...) nie
 * przyjmuje parametru zrodla, a magistrala w tej karcie WYLACZNIE obserwuje
 * istniejacy store (subscribe) — nie wolno jej pisac do store'u ani zgadywac.
 * W repo nie istnieje jeszcze rejestr "window id"/"surface id" (powloka
 * ui2/shell dopiero powstaje w rownoleglej karcie E1.1, ktorej nie wolno tu
 * dotykac). Zamiast zgadywac wartosc per-wywolanie, adapter emituje `zrodlo`
 * jako udokumentowana, stala wartosc ZRODLO_STORE_SELEKCJI ('selection-store')
 * — jawnie oznaczajaca "zmiana zaobserwowana przez pasywna subskrypcje
 * globalnego store'u selekcji, bez atrybucji konkretnego okna". Docelowo, gdy
 * powstana karty poszczegolnych okien (patrz SPEC_POWIAZANIA_WARSTW_2026-07.md
 * §5 wzorzec deklaracji), okna powinny emitowac wlasne zdarzenia 'selekcja'
 * z prawdziwym `zrodlo` bezposrednio przy interakcji uzytkownika (klik), a
 * ten adapter pozostanie fallbackiem tlumaczacym zmiany store'u pochodzace
 * z miejsc jeszcze nie zmigrowanych na bezposrednia emisje.
 */

import { useSelectionStore } from '../../../ui/selection/store';
import { emituj } from '../bus';

export const ZRODLO_STORE_SELEKCJI = 'selection-store';

let ostrzezonoRaz = false;
function ostrzezRaz(komunikat: string, err: unknown): void {
  if (ostrzezonoRaz) {
    return;
  }
  ostrzezonoRaz = true;
  console.warn(komunikat, err);
}

/**
 * Uruchamia subskrypcje selection store -> magistrala. Wywolac raz przy
 * starcie powloki. Zwraca funkcje odsubskrybowania.
 */
export function startSelectionAdapter(): () => void {
  let ostatniObiektId: string | null;
  try {
    ostatniObiektId = useSelectionStore.getState().selectedElement?.id ?? null;
  } catch (err) {
    ostrzezRaz('[ui2/events] selectionAdapter: store selekcji niedostepny — adapter no-op', err);
    return () => {};
  }

  try {
    return useSelectionStore.subscribe((stan) => {
      const obiektId = stan.selectedElement?.id ?? null;
      if (obiektId === ostatniObiektId) {
        return;
      }
      ostatniObiektId = obiektId;
      emituj({ typ: 'selekcja', obiektId, zrodlo: ZRODLO_STORE_SELEKCJI });
    });
  } catch (err) {
    ostrzezRaz('[ui2/events] selectionAdapter: subskrypcja niedostepna — adapter no-op', err);
    return () => {};
  }
}
