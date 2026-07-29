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
 * Reużywa istniejącej infrastruktury wiązania (V12K-073): `selectElement`
 * (property-grid) + `centerSldOnElement` (zoom na SLD) + `setActiveSpace`
 * + `setWynikiTab` (deep-link zakładki — wzorzec z `HubDokumentacji`).
 * ZERO fizyki, ZERO mutacji modelu — wyłącznie selekcja i nawigacja.
 */

import { useCallback } from 'react';

import { useSelectionStore } from '../../../ui/selection/store';
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
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  return useCallback(
    (ref, typ, nazwa, rodzaj) => {
      const { cel } = akcjaNaprawcza(rodzaj);
      selectElement({ id: ref, type: typ, name: nazwa });
      if (cel.rodzaj === 'wyniki-zakladka') {
        // Akcja kontekstowa: zakładka przestrzeni „Wyniki" (bez zoomu SLD —
        // schemat nie jest celem, odroczony zoom byłby zaskoczeniem).
        // R2-B: deep-link niesie ref elementu przekroczenia — okno docelowe
        // (np. „Dobór kompensacji") pre-selekcjonuje węzeł zamiast kazać
        // inżynierowi wybierać go ponownie ręcznie.
        setWynikiTab(cel.zakladka, ref);
        setActiveSpace('wyniki');
      } else {
        centerSldOnElement(ref);
        setActiveSpace('schemat');
      }
    },
    [selectElement, centerSldOnElement, setActiveSpace, setWynikiTab],
  );
}
