/*
 * Wspólny store biegu NC RfG (strumień OZE, karty P39 + P47).
 *
 * Jeden stan biegu zgodności PTPiREE współdzielony przez macierz wymogów
 * (ui2/oze/macierz) i pulpit instalacji OZE (ui2/oze/pulpit): katalog wymogów,
 * operator sieci, status biegu, wynik i błędy. Bieg uruchomiony na jednej
 * powierzchni jest natychmiast widoczny na drugiej (jeden stan, zero duplikatu).
 *
 * Granice (NOT-A-SOLVER / Single Model): store tylko przechowuje stan i wywołuje
 * ISTNIEJĄCEGO klienta `ui/ncrfg-tests/api` — zero fizyki, zero ocen własnych.
 * Werdykty pochodzą WYŁĄCZNIE z `NcRfgRunResult`. Logika przeniesiona 1:1 z
 * lokalnego stanu `MacierzNcRfg` (bez zmiany zachowania).
 */

import { create } from 'zustand';

import { useAppStateStore } from '../../ui/app-state';
import {
  fetchNcRfgTestCatalog,
  runNcRfgPtpireeTests,
  type NcRfgModuleInput,
  type NcRfgRunResult,
  type NcRfgTestCatalogResponse,
} from '../../ui/ncrfg-tests/api';
import { MACIERZ_STRINGS } from './macierz/strings';

/** Status biegu NC RfG (spójny z lokalnym stanem sprzed przeniesienia). */
export type StatusBieguNcRfg = 'idle' | 'running' | 'ready' | 'error';

/**
 * K5-B (H-3 pkt 4): wynik walidacji FRT/HVRT zapisany z okna „Walidacja modelu
 * falownika" (EkranFrt). Werdykt POCHODZI z biegu solvera trajektorii — store
 * tylko go przechowuje per moduł (klucz = id modułu DER, ta sama tożsamość co
 * kolumny macierzy `zbudujModuly` → `der.id`), żeby macierz NC RfG pokazywała
 * wynik FRT obok werdyktów testów PTPiREE.
 */
export interface ZapisanyWynikFrt {
  /** Rodzaj testu, z którego pochodzi werdykt. */
  readonly testKind: 'lvrt' | 'hvrt';
  /** Tekst werdyktu PL (agregacja słownikowa z pól solvera — frtModel). */
  readonly tekst: string;
  readonly istotnosc: 'ok' | 'warn' | 'err';
  /** Operator OSD, wobec którego przeprowadzono walidację. */
  readonly operatorId: string;
}

export interface NcRfgStoreState {
  /** Katalog wymogów procedury (pobrany jednorazowo). */
  readonly katalog: NcRfgTestCatalogResponse | null;
  readonly bladKatalogu: string | null;
  /** Wybrany operator sieci (domyślnie pierwszy z katalogu). */
  readonly operatorId: string;
  readonly status: StatusBieguNcRfg;
  /** Wynik ostatniego biegu (źródło werdyktów). */
  readonly wynik: NcRfgRunResult | null;
  readonly bladBiegu: string | null;
  /**
   * Wejścia modułów użyte do ostatniego zakończonego biegu — źródło żądania
   * certyfikatu zgodności (1:1 z danymi, które wyprodukowały `wynik`).
   */
  readonly ostatnieWejscia: readonly NcRfgModuleInput[] | null;
  /**
   * Wyniki walidacji FRT/HVRT per moduł DER (klucz zewnętrzny = id modułu,
   * klucz wewnętrzny = rodzaj testu — LVRT i HVRT trwają niezależnie).
   */
  readonly wynikiFrt: Readonly<Record<string, Partial<Record<'lvrt' | 'hvrt', ZapisanyWynikFrt>>>>;

  /** Pobiera katalog wymogów (idempotentnie — pomija, gdy już wczytany). */
  zaladujKatalog: () => Promise<void>;
  /** Ustawia operatora sieci. */
  ustawOperator: (operatorId: string) => void;
  /** Przeprowadza bieg dla gotowych modułów (wejścia zbudowane przez warstwę). */
  przeprowadzTesty: (
    modules: readonly NcRfgModuleInput[],
    procedureVersion?: string,
  ) => Promise<void>;
  /** K5-B: zapis wyniku walidacji FRT/HVRT dla modułu (macierz go pokazuje). */
  zapiszWynikFrt: (derRef: string, wynik: ZapisanyWynikFrt) => void;
  /** Reset do stanu początkowego (testy / nowy projekt). */
  reset: () => void;
}

const STAN_POCZATKOWY = {
  katalog: null,
  bladKatalogu: null,
  operatorId: 'enea',
  status: 'idle' as StatusBieguNcRfg,
  wynik: null,
  bladBiegu: null,
  ostatnieWejscia: null,
  wynikiFrt: {},
};

export const useNcRfgStore = create<NcRfgStoreState>((set, get) => ({
  ...STAN_POCZATKOWY,

  zaladujKatalog: async () => {
    if (get().katalog) return;
    try {
      const payload = await fetchNcRfgTestCatalog();
      set({
        katalog: payload,
        bladKatalogu: null,
        operatorId: payload.operators[0]?.operator_id ?? get().operatorId,
      });
    } catch (err) {
      set({ bladKatalogu: err instanceof Error ? err.message : MACIERZ_STRINGS.bladKatalogu });
    }
  },

  ustawOperator: (operatorId) => set({ operatorId }),

  przeprowadzTesty: async (modules, procedureVersion) => {
    if (modules.length === 0) return;
    set({ status: 'running', bladBiegu: null });
    try {
      // Aktywny przypadek → backend dopina dowód certyfikatu PTPiREE z tabliczek
      // urządzeń modelu (bez niego certificate_evidence wraca z pustymi polami).
      const payload = await runNcRfgPtpireeTests(
        {
          modules,
          procedure_version: procedureVersion,
        },
        useAppStateStore.getState().activeCaseId,
      );
      set({ wynik: payload, status: 'ready', ostatnieWejscia: modules });
    } catch (err) {
      set({
        bladBiegu: err instanceof Error ? err.message : MACIERZ_STRINGS.bladBiegu,
        status: 'error',
      });
    }
  },

  zapiszWynikFrt: (derRef, wynik) =>
    set((stan) => ({
      wynikiFrt: {
        ...stan.wynikiFrt,
        [derRef]: { ...stan.wynikiFrt[derRef], [wynik.testKind]: wynik },
      },
    })),

  reset: () => set({ ...STAN_POCZATKOWY }),
}));
