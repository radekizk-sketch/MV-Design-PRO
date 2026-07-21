/**
 * usePoprawWModelu (karta F-E6.1, FLOW etap E6 — pętla decyzji wynik→model).
 *
 * Prowadzi inżyniera OD WYNIKU Z PRZEKROCZENIEM WPROST do miejsca decyzji:
 * zaznacza element na schemacie (SLD) i przechodzi do przestrzeni „Schemat",
 * gdzie żyją konfiguratory/property-grid (dobór kabla, nastawy itd.). Domyka
 * lukę FLOW E6 „pętla wynik→decyzja→model bez prowadzenia (ręczna nawigacja)".
 *
 * Reużywa istniejącej infrastruktury wiązania (V12K-073): `selectElement`
 * (property-grid) + `centerSldOnElement` (zoom na SLD) + `setActiveSpace`.
 * ZERO fizyki, ZERO mutacji modelu — wyłącznie selekcja i nawigacja.
 */

import { useCallback } from 'react';

import { useSelectionStore } from '../../../ui/selection/store';
import { useShellStore } from '../../shell/useShellStore';
import type { ElementType } from '../../../ui/types';

export function usePoprawWModelu(): (ref: string, typ: ElementType, nazwa: string) => void {
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  return useCallback(
    (ref, typ, nazwa) => {
      selectElement({ id: ref, type: typ, name: nazwa });
      centerSldOnElement(ref);
      setActiveSpace('schemat');
    },
    [selectElement, centerSldOnElement, setActiveSpace],
  );
}
