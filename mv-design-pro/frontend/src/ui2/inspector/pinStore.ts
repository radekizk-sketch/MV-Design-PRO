/*
 * Lokalny stan prezentacji inspektora (karta E1.3 §2/§3) — WYŁĄCZNIE ustawienia UI,
 * NIE dane modelu. Zgodnie z kontraktem „w pełni sterowany propsami": jedyny stan
 * lokalny to pinezka i stan akordeonów. Dane obiektu ZAWSZE wchodzą propsami.
 *
 * Trwałość: localStorage. Przechowujemy:
 *   - `pinnedId`   — INTENCJA przypięcia (identyfikator), nie snapshot danych obiektu;
 *                    dane przypiętego obiektu żyją w pamięci komponentu (projekcja propa).
 *   - `accordions` — stan zwinięcia sekcji akordeonu PER TYP OBIEKTU (karta §1).
 *
 * Determinizm: brak niedeterministycznych źródeł (zegar/losowość); klucze stałe.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Mapa: typ obiektu → (id sekcji → czy otwarta). */
type AccordionMap = Record<string, Record<string, boolean>>;

interface PinState {
  /** Identyfikator przypiętego obiektu (intencja), lub null gdy brak pinezki. */
  pinnedId: string | null;
  /** Stan akordeonów per typ obiektu. */
  accordions: AccordionMap;

  pin: (id: string) => void;
  unpin: () => void;
  togglePin: (id: string) => void;

  /** Czy sekcja jest otwarta — zwraca zapamiętany stan lub `domyslnieOtwarta`. */
  isSectionOpen: (typ: string, sekcjaId: string, domyslnieOtwarta: boolean) => boolean;
  /** Przełącza stan sekcji (rozwiązując najpierw wartość domyślną). */
  toggleSection: (typ: string, sekcjaId: string, domyslnieOtwarta: boolean) => void;
}

function sectionState(map: AccordionMap, typ: string): Record<string, boolean> {
  return map[typ] ?? {};
}

export const usePinStore = create<PinState>()(
  persist(
    (set, get) => ({
      pinnedId: null,
      accordions: {},

      pin: (id) => set({ pinnedId: id }),
      unpin: () => set({ pinnedId: null }),
      togglePin: (id) => set((state) => ({ pinnedId: state.pinnedId === id ? null : id })),

      isSectionOpen: (typ, sekcjaId, domyslnieOtwarta) => {
        const stored = sectionState(get().accordions, typ)[sekcjaId];
        return stored === undefined ? domyslnieOtwarta : stored;
      },

      toggleSection: (typ, sekcjaId, domyslnieOtwarta) =>
        set((state) => {
          const forType = sectionState(state.accordions, typ);
          const current = forType[sekcjaId] === undefined ? domyslnieOtwarta : forType[sekcjaId];
          return {
            accordions: {
              ...state.accordions,
              [typ]: { ...forType, [sekcjaId]: !current },
            },
          };
        }),
    }),
    {
      name: 'mvd-inspector-ui-local',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pinnedId: state.pinnedId,
        accordions: state.accordions,
      }),
    },
  ),
);
