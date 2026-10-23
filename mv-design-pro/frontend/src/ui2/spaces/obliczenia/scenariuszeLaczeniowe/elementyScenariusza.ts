/*
 * Elementy modelu, które scenariusz łączeniowy może przestawić albo wyłączyć (karta
 * GPZ-H5-APARATURA, defekt 5). Czysta funkcja nad migawką ENM — zero fizyki.
 *
 * Dwa zbiory są LUSTREM backendu (`backend/src/enm/topology.py::TYPY_LACZNIKOW_ENM` i
 * `backend/src/enm/scenariusze.py::KOLEKCJE_WYLACZALNE`); zgodność przypina test backendu
 * `tests/api/test_scenariusze_laczeniowe_api.py::test_lustro_frontu_zbiorow_scenariusza`.
 * Kontrolka spoza tych zbiorów byłaby odrzucona przez backend (phantom), a brak elementu
 * z tych zbiorów odcinałby projektanta od zdolności backendu.
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { StanLacznika } from './api';

/** Typy gałęzi, których położenie przestawia scenariusz (lustro `TYPY_LACZNIKOW_ENM`). */
export const TYPY_LACZNIKOW_SCENARIUSZA = [
  'breaker',
  'bus_coupler',
  'disconnector',
  'fuse',
  'switch',
] as const;

/** Kolekcje modelu, z których scenariusz wyłącza element (lustro `KOLEKCJE_WYLACZALNE`). */
export const KOLEKCJE_WYLACZALNE = [
  'branches',
  'transformers',
  'generators',
  'loads',
  'sources',
  'shunt_capacitors',
] as const;

export type KolekcjaWylaczalna = (typeof KOLEKCJE_WYLACZALNE)[number];

export const ETYKIETY_KOLEKCJI: Record<KolekcjaWylaczalna, string> = {
  branches: 'Gałęzie (linie, kable, łączniki)',
  transformers: 'Transformatory',
  generators: 'Wytwórcy',
  loads: 'Odbiory',
  sources: 'Źródła zasilania (sieć zasilająca)',
  shunt_capacitors: 'Baterie kondensatorów',
};

export interface LacznikScenariusza {
  ref: string;
  nazwa: string;
  /** Położenie w modelu (`status`) — wartość, którą scenariusz bez wpisu zostawia. */
  stanModelu: StanLacznika;
}

export interface ElementWylaczalny {
  ref: string;
  nazwa: string;
}

export interface GrupaWylaczalnych {
  kolekcja: KolekcjaWylaczalna;
  etykieta: string;
  elementy: ElementWylaczalny[];
}

export interface ElementyScenariusza {
  laczniki: LacznikScenariusza[];
  grupy: GrupaWylaczalnych[];
}

function porzadek(a: { nazwa: string; ref: string }, b: { nazwa: string; ref: string }): number {
  return a.nazwa.localeCompare(b.nazwa, 'pl') || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
}

function nazwa(element: { name?: string | null; ref_id: string }): string {
  return element.name && element.name.trim() ? element.name : element.ref_id;
}

const TYPY_LACZNIKOW: ReadonlySet<string> = new Set(TYPY_LACZNIKOW_SCENARIUSZA);

export function elementyScenariusza(model: EnergyNetworkModel | null): ElementyScenariusza {
  if (model === null) return { laczniki: [], grupy: [] };
  const laczniki = (model.branches ?? [])
    .filter((g) => TYPY_LACZNIKOW.has(g.type))
    .map((g) => ({ ref: g.ref_id, nazwa: nazwa(g), stanModelu: g.status }))
    .sort(porzadek);
  const grupy = KOLEKCJE_WYLACZALNE.map((kolekcja) => {
    const elementy = ((model[kolekcja] ?? []) as { name?: string | null; ref_id: string }[])
      .map((e) => ({ ref: e.ref_id, nazwa: nazwa(e) }))
      .sort(porzadek);
    return { kolekcja, etykieta: ETYKIETY_KOLEKCJI[kolekcja], elementy };
  }).filter((g) => g.elementy.length > 0);
  return { laczniki, grupy };
}

/** Nazwa elementu modelu po `ref_id` (lista scenariuszy pokazuje nazwy, nie identyfikatory). */
export function nazwyElementow(model: EnergyNetworkModel | null): Map<string, string> {
  const wynik = new Map<string, string>();
  if (model === null) return wynik;
  for (const kolekcja of KOLEKCJE_WYLACZALNE) {
    for (const e of (model[kolekcja] ?? []) as { name?: string | null; ref_id: string }[]) {
      wynik.set(e.ref_id, nazwa(e));
    }
  }
  return wynik;
}
