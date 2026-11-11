/*
 * Pomocnik testów wejść na schemat (karta SLD-SKALA-I-NAWIGACJA).
 *
 * Jedna droga „pokaż element na schemacie" (`ui2/shell/zaznaczElementModelu.ts`)
 * działa wyłącznie dla elementu OBECNEGO w migawce modelu, a wskazanie kamery przy
 * przeglądaniu idzie tylko wtedy, gdy kanwa schematu jest zamontowana (rejestr
 * `ui2/shell/widokKanwySchematu.ts`). Testy budują więc REALNĄ migawkę w sklepie
 * (`useSnapshotStore`) i — gdy badają ekran z kanwą — rejestrują montaż kanwy tą
 * samą funkcją, której używa produkcyjny `KanwaSchematu`. Zero mocków sklepów.
 */

import { renderHook } from '@testing-library/react';

import type { EnergyNetworkModel } from '../types/enm';
import { useSnapshotStore } from '../ui/topology/snapshotStore';
import { useRejestracjaKanwySchematu } from '../ui2/shell/widokKanwySchematu';

/** Kolekcje migawki, z których rozwiązywacz selekcji czyta rodzaj elementu. */
export type KolekcjaMigawki =
  | 'buses'
  | 'branches'
  | 'transformers'
  | 'sources'
  | 'loads'
  | 'generators'
  | 'substations'
  | 'bays'
  | 'measurements';

const KOLEKCJE: readonly KolekcjaMigawki[] = [
  'buses',
  'branches',
  'transformers',
  'sources',
  'loads',
  'generators',
  'substations',
  'bays',
  'measurements',
];

export interface ElementMigawki {
  readonly kolekcja: KolekcjaMigawki;
  readonly id: string;
  readonly name?: string;
  /** Pola dodatkowe rekordu (np. `type: 'cable'` gałęzi, `voltage_kv` szyny). */
  readonly pola?: Readonly<Record<string, unknown>>;
}

/** Migawka modelu z podanymi elementami (pozostałe kolekcje puste). */
export function migawkaZElementami(elementy: readonly ElementMigawki[]): EnergyNetworkModel {
  const migawka: Record<string, unknown[]> = {
    junctions: [],
    corridors: [],
    protection_assignments: [],
    branch_points: [],
  };
  for (const k of KOLEKCJE) migawka[k] = [];
  for (const e of elementy) {
    migawka[e.kolekcja].push({ id: e.id, ref_id: e.id, name: e.name ?? e.id, ...e.pola });
  }
  return migawka as unknown as EnergyNetworkModel;
}

/** Wstawia migawkę z elementami do sklepu migawki (realny sklep, bez mocka). */
export function ustawMigawkeZElementami(elementy: readonly ElementMigawki[]): EnergyNetworkModel {
  const migawka = migawkaZElementami(elementy);
  useSnapshotStore.setState({ snapshot: migawka });
  return migawka;
}

/**
 * Rejestruje zamontowaną kanwę schematu (jak `KanwaSchematu`). Zwraca funkcję
 * odmontowania — wołaj ją w sprzątaniu testu, rejestr jest modułowy.
 */
export function zamontujKanweSchematu(): () => void {
  const { unmount } = renderHook(() => useRejestracjaKanwySchematu());
  return unmount;
}

/** Elementy siedmiu rodzajów z karty (szyna, kabel, transformator, łącznik, pole, stacja, źródło). */
export const ELEMENTY_SIEDMIU_RODZAJOW = [
  { rodzaj: 'szyna', typ: 'Bus', element: { kolekcja: 'buses', id: 'bus-sn-1', name: 'Szyna SN 1', pola: { voltage_kv: 15 } } },
  { rodzaj: 'linia/kabel', typ: 'LineBranch', element: { kolekcja: 'branches', id: 'kab-1', name: 'Kabel K1', pola: { type: 'cable', from_bus_ref: 'bus-sn-1', to_bus_ref: 'bus-sn-2' } } },
  { rodzaj: 'transformator', typ: 'TransformerBranch', element: { kolekcja: 'transformers', id: 'tr-1', name: 'Transformator T1' } },
  { rodzaj: 'łącznik', typ: 'Switch', element: { kolekcja: 'branches', id: 'q-1', name: 'Wyłącznik Q1', pola: { type: 'breaker', from_bus_ref: 'bus-sn-1', to_bus_ref: 'bus-sn-2' } } },
  { rodzaj: 'pole', typ: 'BaySN', element: { kolekcja: 'bays', id: 'pole-1', name: 'Pole liniowe 1', pola: { bus_ref: 'bus-sn-1' } } },
  { rodzaj: 'stacja', typ: 'Station', element: { kolekcja: 'substations', id: 'st-1', name: 'Stacja S1', pola: { station_type: 'mv_lv' } } },
  { rodzaj: 'źródło', typ: 'Source', element: { kolekcja: 'sources', id: 'zr-1', name: 'Sieć zasilająca', pola: { bus_ref: 'bus-sn-1' } } },
] as const satisfies readonly { rodzaj: string; typ: string; element: ElementMigawki }[];
