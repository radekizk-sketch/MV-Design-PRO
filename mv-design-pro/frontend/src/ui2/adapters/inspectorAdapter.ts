/**
 * Adapter inspektora (karta E1.4 — integracja): snapshot ENM → ObiektInspektora.
 *
 * Źródło (WYŁĄCZNIE odczyt): ui/topology/snapshotStore.ts — useSnapshotStore.snapshot
 * (EnergyNetworkModel). Adapter buduje MINIMALNĄ, uczciwą projekcję obiektu dla
 * inspektora powłoki: sekcja „Podstawowe" + szczegóły techniczne (tryb Ekspercki).
 *
 * TODO-KARTA (E5/E8): pełne mapowanie właściwości katalogowych per typ elementu
 * oraz zakładek Wyniki/Dowody należy do kart przestrzeni Model/Wyniki — ten adapter
 * celowo nie zgaduje pól specyficznych typów (zero zgadywania).
 */
import { useMemo } from 'react';

import type { EnergyNetworkModel, ENMElement } from '../../types/enm';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import type { ObiektInspektora } from '../inspector';

/** Kolekcje modelu przeszukiwane przez adapter + polskie etykiety typów. */
const KOLEKCJE: ReadonlyArray<{
  klucz: keyof EnergyNetworkModel;
  typ: string;
  typEtykieta: string;
}> = [
  { klucz: 'buses', typ: 'szyna', typEtykieta: 'Szyna' },
  { klucz: 'branches', typ: 'odcinek', typEtykieta: 'Odcinek' },
  { klucz: 'transformers', typ: 'transformator', typEtykieta: 'Transformator' },
  { klucz: 'sources', typ: 'zrodlo', typEtykieta: 'Źródło' },
  { klucz: 'loads', typ: 'odbior', typEtykieta: 'Odbiór' },
  { klucz: 'generators', typ: 'generator', typEtykieta: 'Generator' },
  { klucz: 'substations', typ: 'stacja', typEtykieta: 'Stacja' },
  { klucz: 'bays', typ: 'pole', typEtykieta: 'Pole' },
  { klucz: 'junctions', typ: 'wezel', typEtykieta: 'Węzeł' },
];

interface Znaleziony {
  element: ENMElement;
  typ: string;
  typEtykieta: string;
}

function znajdzElement(model: EnergyNetworkModel, id: string): Znaleziony | null {
  for (const kolekcja of KOLEKCJE) {
    const lista = model[kolekcja.klucz];
    if (!Array.isArray(lista)) continue;
    for (const kandydat of lista as unknown[]) {
      const el = kandydat as ENMElement;
      if (el && (el.id === id || el.ref_id === id)) {
        return { element: el, typ: kolekcja.typ, typEtykieta: kolekcja.typEtykieta };
      }
    }
  }
  return null;
}

/** Czysta funkcja mapująca (testowalna bez Reacta). */
export function mapowanieObiektuInspektora(
  model: EnergyNetworkModel | null,
  id: string | null,
): ObiektInspektora | null {
  if (!model || !id) return null;
  const znaleziony = znajdzElement(model, id);
  if (!znaleziony) return null;
  const { element, typ, typEtykieta } = znaleziony;
  return {
    id: element.id,
    typ,
    typEtykieta,
    nazwa: element.name || element.ref_id,
    wlasciwosci: [
      {
        id: 'podstawowe',
        tytul: 'Podstawowe',
        wiersze: [
          { etykieta: 'Nazwa', wartosc: { wartosc: element.name || element.ref_id } },
          { etykieta: 'Typ elementu', wartosc: { wartosc: typEtykieta } },
        ],
      },
    ],
    wyniki: [],
    dowody: [],
    powiazania: { wchodzace: [], wychodzace: [] },
    szczegolyTechniczne: [
      { klucz: 'Identyfikator', wartosc: element.id },
      { klucz: 'Odnośnik', wartosc: element.ref_id },
    ],
  };
}

/** Hook: obiekt inspektora dla bieżącej selekcji (read-only ze snapshotu). */
export function useObiektInspektora(id: string | null): ObiektInspektora | null {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  return useMemo(() => mapowanieObiektuInspektora(snapshot, id), [snapshot, id]);
}

/** Hook: bieżąca rewizja modelu (0, gdy brak projektu). */
export function useRewizjaModelu(): number {
  return useSnapshotStore((s) => s.snapshot?.header.revision ?? 0);
}
