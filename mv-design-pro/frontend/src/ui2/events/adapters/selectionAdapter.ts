/**
 * Adapter: tlumaczy zmiany store'u selekcji na zdarzenie magistrali 'selekcja'.
 *
 * Zrodlo store'u (WYLACZNIE odczyt/subscribe — zero zapisu, zero wolan API):
 * frontend/src/ui/selection/store.ts — useSelectionStore.selectedElement.id
 * -> obiektId. To jedyny, jednoznaczny globalny store selekcji w repo (patrz
 * naglowek pliku: "Single source of truth for selection state and cross-view
 * synchronization").
 *
 * STAN FAKTYCZNY (karta §3, pole `zrodlo` = "id okna emitujacego" zmiane
 * selekcji; rejestr wywolan zweryfikowany grepem `emituj({ typ: 'selekcja'`
 * w `frontend/src/ui2`): `useSelectionStore` (`selectElement`/pochodne) nadal
 * NIE przyjmuje parametru zrodla, wiec ta magistrala — ktora WYLACZNIE
 * obserwuje istniejacy store (subscribe), nigdy do niego nie pisze i niczego
 * nie zgaduje — nie moze odtworzyc atrybucji z samej zmiany store'u. Rejestr
 * "window id"/"surface id" nie powstal jako osobna abstrakcja; zamiast tego
 * przyjeta droga (SPEC_POWIAZANIA_WARSTW_2026-07.md §5) jest juz w produkcji:
 * okna interaktywne emituja WLASNE zdarzenia 'selekcja' z prawdziwym `zrodlo`
 * bezposrednio przy interakcji uzytkownika, np. `AppRoot.tsx`
 * (`zrodlo: 'inspektor'`, `'drzewo-kontekstowe'`, `'pulpit-projektu'`).
 * Ten adapter pozostaje udokumentowanym FALLBACKIEM: tlumaczy zmiany store'u
 * pochodzace z miejsc, ktore jeszcze nie emituja bezposrednio (np. zmiana
 * selekcji z wnetrza kanwy SLD), pod stala, jawna wartoscia
 * ZRODLO_STORE_SELEKCJI ('selection-store') — "zmiana zaobserwowana przez
 * pasywna subskrypcje globalnego store'u selekcji, bez atrybucji konkretnego
 * okna". Oba mechanizmy (emisja bezposrednia + fallback obserwacyjny) sa
 * DOCELOWYM stanem, nie etapem przejsciowym do zastapienia.
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
