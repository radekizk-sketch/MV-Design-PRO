/**
 * Store NAKŁADKI RÓŻNIC A/B na schemacie (zustand).
 *
 * ŁAŃCUCH: ekran porównań (tryb zwarciowy) wybiera parę przebiegów → klik
 * „Pokaż różnice na schemacie" → ten store pobiera nakładkę z backendu
 * (`sldDeltaOverlay.api.ts`) → warstwa wynikowa kanwy v3 rysuje różnice jako
 * etykiety per element (`SldCanvasV3Workspace` → `buildResultLabelsForSnapshot`,
 * rodzina szablonów `short_circuit_delta`) i koloruje wagą z backendu.
 *
 * INWARIANTY:
 * - ZERO fizyki i ZERO arytmetyki — różnice, jednostki i wagę liczy backend;
 * - ZERO mutacji modelu;
 * - czysty posiadacz danych: payload wchodzi z jednej końcówki i wychodzi
 *   bez przeliczania;
 * - nakładka jest RÓWNOLEGŁYM kanałem wobec wyniku pojedynczego przebiegu
 *   (`rawResultOverlayStore`) — nie podmienia go, tylko ma pierwszeństwo
 *   w warstwie etykiet, dopóki trwa. Dzięki temu wyjście z trybu różnic
 *   przywraca poprzedni widok wyników bez ponownego pobierania.
 *
 * ŚWIEŻOŚĆ: nakładka NIE trzyma własnego znacznika aktualności. Kanwa czyta
 * status wyników przypadku (`activeCaseResultStatus`) — ten sam, którym
 * bramkuje wyniki pojedynczego przebiegu — więc edycja modelu unieważnia
 * różnice DOKŁADNIE tak samo jak każdy inny wynik. Równoległy tracker byłby
 * drugim źródłem prawdy o tym samym fakcie.
 */

import { create } from 'zustand';

import { pobierzNakladkeRoznic, type NakladkaRoznic } from './sldDeltaOverlay.api';
import type { RawOverlayPayload } from './rawResultOverlayStore';

interface SldDeltaOverlayState {
  /** Nakładka różnic (null = tryb różnic wyłączony). */
  readonly nakladka: NakladkaRoznic | null;
  /** Trwa pobieranie różnic. */
  readonly wTrakcie: boolean;
  /** Komunikat błędu pobrania (polski). */
  readonly blad: string | null;

  /** Pobierz różnice pary przebiegów i włącz tryb różnic na schemacie. */
  readonly wczytajRoznice: (runIdA: string, runIdB: string) => Promise<void>;
  /** Wyłącz tryb różnic (schemat wraca do wyniku pojedynczego przebiegu). */
  readonly wyczyscRoznice: () => void;
}

const STAN_POCZATKOWY = {
  nakladka: null as NakladkaRoznic | null,
  wTrakcie: false,
  blad: null as string | null,
};

export const useSldDeltaOverlayStore = create<SldDeltaOverlayState>((set) => ({
  ...STAN_POCZATKOWY,

  wczytajRoznice: async (runIdA, runIdB) => {
    set({ wTrakcie: true, blad: null });
    try {
      const nakladka = await pobierzNakladkeRoznic(runIdA, runIdB);
      set({ nakladka, wTrakcie: false, blad: null });
    } catch (err) {
      set({
        nakladka: null,
        wTrakcie: false,
        blad: err instanceof Error ? err.message : 'Nie udało się pobrać różnic dla schematu.',
      });
    }
  },

  wyczyscRoznice: () => set({ ...STAN_POCZATKOWY }),
}));

/**
 * Nakładka różnic w kształcie czytanym przez warstwę etykiet kanwy.
 *
 * `run_id` wiąże nakładkę z przebiegiem PORÓWNYWANYM (B) — to stan, który
 * schemat pokazuje wobec odniesienia A; para w całości jest w polach
 * `run_id_a`/`run_id_b` nakładki. `null` = tryb różnic wyłączony.
 */
export function payloadEtykietRoznic(nakladka: NakladkaRoznic | null): RawOverlayPayload | null {
  if (!nakladka) return null;
  return {
    run_id: nakladka.run_id_b,
    analysis_type: nakladka.analysis_type,
    elements: nakladka.elements,
  };
}
