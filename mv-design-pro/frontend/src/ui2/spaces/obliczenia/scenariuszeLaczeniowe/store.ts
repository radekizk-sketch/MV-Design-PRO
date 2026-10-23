/*
 * Magazyn scenariuszy łączeniowych aktywnego przypadku (karta GPZ-H5-APARATURA, defekt 5).
 * Jedno źródło listy dla panelu „Scenariusze łączeniowe” (lista, zapis, rewizja) i dla
 * wyboru stanu łączeniowego w „Uruchom obliczenie” — dwa ekrany nie trzymają dwóch list.
 * Lista jest związana z przypadkiem, z którego ją odczytano (`caseId`): wybór w biegu
 * czyta ją wyłącznie dla tego samego przypadku.
 */

import { create } from 'zustand';

import {
  pobierzScenariuszeLaczeniowe,
  zapiszScenariuszLaczeniowy,
  type ScenariuszLaczeniowy,
  type ZapisScenariuszaLaczeniowego,
} from './api';

export interface StanScenariuszyLaczeniowych {
  caseId: string | null;
  scenariusze: ScenariuszLaczeniowy[];
  ladowanie: boolean;
  blad: string | null;
  wczytaj: (caseId: string) => Promise<void>;
  /** Zapis z odświeżeniem listy; odmowa backendu jest rzucana dalej (błędy pól formularza). */
  zapisz: (caseId: string, zadanie: ZapisScenariuszaLaczeniowego) => Promise<ScenariuszLaczeniowy>;
}

export const useScenariuszeLaczenioweStore = create<StanScenariuszyLaczeniowych>((set, get) => ({
  caseId: null,
  scenariusze: [],
  ladowanie: false,
  blad: null,
  wczytaj: async (caseId) => {
    if (get().caseId !== caseId) set({ caseId, scenariusze: [], blad: null });
    set({ ladowanie: true });
    try {
      const scenariusze = await pobierzScenariuszeLaczeniowe(caseId);
      if (get().caseId === caseId) set({ scenariusze, blad: null });
    } catch (error) {
      if (get().caseId === caseId) {
        set({
          scenariusze: [],
          blad: error instanceof Error ? error.message : 'Nie udało się wczytać scenariuszy',
        });
      }
    } finally {
      if (get().caseId === caseId) set({ ladowanie: false });
    }
  },
  zapisz: async (caseId, zadanie) => {
    const zapisany = await zapiszScenariuszLaczeniowy(caseId, zadanie);
    await get().wczytaj(caseId);
    return zapisany;
  },
}));

const BRAK: ScenariuszLaczeniowy[] = [];

/** Scenariusze łączeniowe przypadku `caseId` (pusta lista, gdy magazyn trzyma inny przypadek). */
export function useScenariuszeLaczeniowePrzypadku(caseId: string | null): ScenariuszLaczeniowy[] {
  const caseIdMagazynu = useScenariuszeLaczenioweStore((stan) => stan.caseId);
  const scenariusze = useScenariuszeLaczenioweStore((stan) => stan.scenariusze);
  return caseId !== null && caseIdMagazynu === caseId ? scenariusze : BRAK;
}
