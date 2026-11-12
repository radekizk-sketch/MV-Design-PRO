/**
 * usePoprawWModelu (karta F-E6.1, FLOW etap E6 — pętla decyzji wynik→model;
 * rozszerzenie K1 / F-E6.3 — akcje kontekstowe per rodzaj przekroczenia).
 *
 * Prowadzi inżyniera OD WYNIKU Z PRZEKROCZENIEM WPROST do miejsca decyzji:
 * domyślnie zaznacza element na schemacie (SLD) i przechodzi do przestrzeni
 * „Schemat", gdzie żyją konfiguratory/property-grid (dobór kabla, nastawy itd.).
 * Z opcjonalnym `rodzaj` (4. parametr, addytywny — brak = zachowanie 1:1 jak
 * dotąd) wykonuje akcję WŁAŚCIWĄ dla rodzaju przekroczenia wg rejestru
 * `akcjeNaprawcze.ts` (np. bilans mocy biernej → okno „Dobór kompensacji"
 * w przestrzeni „Wyniki" przez deep-link `setWynikiTab`).
 *
 * Cel „schemat" idzie JEDNĄ drogą wejścia na schemat (`pokazElementNaSchemacie`,
 * karta SLD-SKALA-I-NAWIGACJA, część W: zaznaczenie + kadr + przestrzeń „Schemat"
 * + powrót do ekranu wyniku). Cel „zakładka wyników" — `selectElement` +
 * `setWynikiTab` (deep-link zakładki — wzorzec z `HubDokumentacji`).
 *
 * C-12 (klasa akcji naprawczych): przejście idzie JEDNĄ nawigacją powłoki
 * (`przejdzDoPrzestrzeni`, kanon D1) — dawny goły `setActiveSpace` zostawiał trasę
 * nadrzędną (np. `#analysis` przebiegu), która przykrywała przestrzeń docelową.
 * Pilnuje `nawigacja_jeden_kanon_guard` (reguła F).
 * ZERO fizyki, ZERO mutacji modelu — wyłącznie selekcja i nawigacja.
 */

import { useCallback } from 'react';

import { useSelectionStore } from '../../../ui/selection/store';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { elementNaSchemacie, pokazElementNaSchemacie } from '../../shell/zaznaczElementModelu';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useShellStore } from '../../shell/useShellStore';
import type { ElementType } from '../../../ui/types';
import { akcjaNaprawcza, type RodzajPrzekroczenia } from './akcjeNaprawcze';

export function usePoprawWModelu(): (
  ref: string,
  typ: ElementType,
  nazwa: string,
  rodzaj?: RodzajPrzekroczenia,
) => void {
  const selectElement = useSelectionStore((s) => s.selectElement);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  return useCallback(
    (ref, typ, nazwa, rodzaj) => {
      const { cel } = akcjaNaprawcza(rodzaj);
      if (cel.rodzaj === 'wyniki-zakladka') {
        selectElement({ id: ref, type: typ, name: nazwa });
        // Akcja kontekstowa: zakładka przestrzeni „Wyniki" (bez zoomu SLD —
        // schemat nie jest celem, odroczony zoom byłby zaskoczeniem).
        // R2-B: deep-link niesie ref elementu przekroczenia — okno docelowe
        // (np. „Dobór kompensacji") pre-selekcjonuje węzeł zamiast kazać
        // inżynierowi wybierać go ponownie ręcznie.
        setWynikiTab(cel.zakladka, ref);
        przejdzDoPrzestrzeni('wyniki');
      } else {
        pokazElementNaSchemacie(ref, 'petla-wynik-model');
      }
    },
    [selectElement, setWynikiTab],
  );
}

/**
 * Czy akcja pętli decyzji dla `ref` ma dokąd prowadzić (karta SLD-SKALA-I-NAWIGACJA,
 * część W, pkt 5): cel „zakładka wyników" — zawsze; cel „schemat" — wyłącznie dla
 * elementu obecnego na schemacie (TEN SAM predykat co `pokazElementNaSchemacie`).
 * Przycisk bez celu się nie renderuje — brak akcji zamiast martwego kliku.
 */
export function celDecyzjiOsiagalny(ref: string | null | undefined, rodzaj?: RodzajPrzekroczenia): boolean {
  return akcjaNaprawcza(rodzaj).cel.rodzaj !== 'schemat' || elementNaSchemacie(ref) !== null;
}

/** Hook predykatu z subskrypcją migawki (przycisk znika razem z elementem modelu). */
export function useCelDecyzjiOsiagalny(): typeof celDecyzjiOsiagalny {
  useSnapshotStore((s) => s.snapshot);
  return celDecyzjiOsiagalny;
}
