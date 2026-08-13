/*
 * Wybór pakietu referencyjnego — JEDNO ŹRÓDŁO PRAWDY dla wszystkich miejsc
 * oceny zgodności (karta REF-PAKIET).
 *
 * DLACZEGO TUTAJ, A NIE W PRZYPADKU OBLICZENIOWYM (rozstrzygnięcie pomiarem):
 *  - `StudyCaseConfig` (`backend/src/domain/study_case.py`) przechowuje WYŁĄCZNIE
 *    parametry obliczeniowe solverów (c_max/c_min, base_mva, tolerancja,
 *    tryb wejścia zwarciowego…). Pomiar: w całym backendzie poza pakietem
 *    `reference_engine` nie ma ANI JEDNEGO pola `pack_id`/`pack_ids` — przypadek
 *    nie zna pojęcia „wybrany pakiet referencyjny";
 *  - raport zgodności NIE jest wynikiem biegu zapisywanym w przypadku: końcówka
 *    `GET /api/cases/{id}/reference/compliance` liczy go na żądanie z modelu
 *    (ENM) i przyjmuje zawężenie `?packs=` jako parametr ZAPYTANIA;
 *  - reguła Case Immutability (CLAUDE.md #4) mówi, że przypadek trzyma parametry
 *    OBLICZENIOWE. Filtr prezentacji oceny zgodności nie wpływa na żaden solver,
 *    więc dokładanie go do konfiguracji przypadku wciągałoby zmianę kontraktu
 *    przypadku, jego serializacji i archiwum ZIP — bez żadnego zysku dla wyniku.
 *
 * Wybór jest zatem USTAWIENIEM WIDOKU projektanta („którą referencję teraz
 * oglądam"), dokładnie jak `podgladSchematu` w `ui2/shell/useShellStore.ts`:
 * trwałość localStorage, zero danych modelu, zero fizyki.
 *
 * `pakietId === null` ⇒ „wszystkie pakiety" — to NIE jest domysł UI, tylko
 * udokumentowane domyślne zachowanie backendu (`?packs` pominięty ⇒ wszystkie
 * pakiety rejestru, `api/reference_engine.py`). Żadnego „pakietu domyślnego"
 * po stronie UI nie wymyślamy — takiego pojęcia backend nie ma.
 *
 * Determinizm: brak zegara i losowości, klucz magazynu stały.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface WyborPakietuState {
  /** Identyfikator wybranego pakietu; `null` = wszystkie pakiety (domyślnie). */
  pakietId: string | null;
  /** Ustaw wybór (`null` = wszystkie). Identyfikator MUSI pochodzić z listy backendu. */
  ustawPakiet: (pakietId: string | null) => void;
}

export const useWyborPakietu = create<WyborPakietuState>()(
  persist(
    (set) => ({
      pakietId: null,
      ustawPakiet: (pakietId) => set({ pakietId }),
    }),
    {
      name: 'mvd-referencje-wybor-local',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ pakietId: state.pakietId }),
    },
  ),
);

/**
 * Zawężenie dla klienta zgodności: `null` ⇒ brak parametru `packs`
 * (backend ocenia wszystkie), inaczej jednoelementowa lista.
 */
export function zawezenieDlaWyboru(pakietId: string | null): readonly string[] | undefined {
  return pakietId === null ? undefined : [pakietId];
}
