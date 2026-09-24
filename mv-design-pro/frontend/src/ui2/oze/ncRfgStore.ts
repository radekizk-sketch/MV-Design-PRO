/*
 * Wspólny store biegu NC RfG (strumień OZE, karty P39 + P47).
 *
 * Katalog wymogów i jawny wybór operatora sieci współdzielone przez macierz wymogów
 * (ui2/oze/macierz), pulpit instalacji OZE (ui2/oze/pulpit) i wniosek do OSD; status, wynik
 * i błędy biegu „co-jeśli" należą do macierzy (formularz danych deklarowanych). Pulpit
 * czyta ocenę zatwierdzonego modelu przypadku (`pobierzZgodnoscPrzypadkuNcRfg`), nie bieg
 * „co-jeśli" — karta AB-1a Pakiet D2.
 *
 * Granice (NOT-A-SOLVER / Single Model): store tylko przechowuje stan i wywołuje
 * JEDYNEGO klienta V2 `ui2/oze/ncrfg/api` — zero fizyki, zero ocen własnych.
 * Rekordy ocen pochodzą WYŁĄCZNIE z `BiegNcRfg` (kontrakt `NcRfgPtpireeTestResultV2`).
 * Bieg jest „co-jeśli" (źródło danych `ZADANIE_KLIENTA`): żądanie niesie wyłącznie moduły —
 * bez wersji procedury (pochodzi z profilu), bez przypadku i bez pola certyfikatu.
 * Operator NIE ma wartości domyślnej: jawny wybór projektanta (`operatorWybor`) liczy się
 * tylko wtedy, gdy model nie rozstrzyga operatora (`ncrfg/operator.ts`).
 */

import { create } from 'zustand';

import { pobierzKatalogNcRfg, uruchomBiegNcRfg } from './ncrfg/api';
import type { BiegNcRfg, KatalogNcRfg, WejscieModuluNcRfg } from './ncrfg/typy';
import { MACIERZ_STRINGS } from './macierz/strings';
import type { SemantykaKoloru } from '../wyniki/wzorzec/werdykt';

/** Status biegu NC RfG (spójny z lokalnym stanem sprzed przeniesienia). */
export type StatusBieguNcRfg = 'idle' | 'running' | 'ready' | 'error';

/**
 * K5-B (H-3 pkt 4): stan oceny FRT/HVRT zapisany z okna „Walidacja modelu
 * falownika" (EkranFrt). Tekst i istotność POCHODZĄ z rekordu oceny backendu —
 * store tylko je przechowuje per moduł (klucz = id modułu DER, ta sama tożsamość
 * co kolumny macierzy `zbudujModuly` → `der.id`), żeby macierz NC RfG pokazywała
 * stan FRT obok werdyktów testów PTPiREE. Od 2026-09-23 (uczciwość natychmiastowa)
 * EkranFrt zapisuje wyłącznie „Ocena niewykonana" z semantyką `neutralna` —
 * trajektoria jest zadana profilem wejściowym, więc werdyktu FRT nie ma.
 */
export interface ZapisanyWynikFrt {
  /** Rodzaj testu, którego dotyczy stan oceny. */
  readonly testKind: 'lvrt' | 'hvrt';
  /** Etykieta PL stanu oceny — z rekordu backendu (`ocena.etykieta.etykieta_pl`). */
  readonly tekst: string;
  /** Semantyka koloru Z REKORDU backendu (`ocena.etykieta.semantyka`) — bez przemapowania. */
  readonly istotnosc: SemantykaKoloru;
  /** Operator OSD, wobec którego przeprowadzono walidację. */
  readonly operatorId: string;
}

export interface NcRfgStoreState {
  /** Katalog testów, wersja procedury i profile operatorów (pobrany jednorazowo). */
  readonly katalog: KatalogNcRfg | null;
  readonly bladKatalogu: string | null;
  /**
   * Jawny wybór operatora przez projektanta — BEZ wartości domyślnej. Używany wyłącznie,
   * gdy model nie rozstrzyga operatora (`ncrfg/operator.ts::operatorZModelu`).
   */
  readonly operatorWybor: string | null;
  readonly status: StatusBieguNcRfg;
  /** Wynik ostatniego biegu „co-jeśli" (rekordy ocen testów i wymagań). */
  readonly wynik: BiegNcRfg | null;
  readonly bladBiegu: string | null;
  /**
   * Wyniki walidacji FRT/HVRT per moduł DER (klucz zewnętrzny = id modułu,
   * klucz wewnętrzny = rodzaj testu — LVRT i HVRT trwają niezależnie).
   */
  readonly wynikiFrt: Readonly<Record<string, Partial<Record<'lvrt' | 'hvrt', ZapisanyWynikFrt>>>>;

  /** Pobiera katalog wymogów (idempotentnie — pomija, gdy już wczytany). */
  zaladujKatalog: () => Promise<void>;
  /** Jawny wybór operatora (`null` — wybór wycofany). */
  ustawOperator: (operatorId: string | null) => void;
  /** Przeprowadza bieg „co-jeśli" dla gotowych modułów (wejścia zbudowane przez warstwę). */
  przeprowadzTesty: (modules: readonly WejscieModuluNcRfg[]) => Promise<void>;
  /** K5-B: zapis wyniku walidacji FRT/HVRT dla modułu (macierz go pokazuje). */
  zapiszWynikFrt: (derRef: string, wynik: ZapisanyWynikFrt) => void;
  /** Reset do stanu początkowego (testy / nowy projekt). */
  reset: () => void;
}

const STAN_POCZATKOWY = {
  katalog: null,
  bladKatalogu: null,
  operatorWybor: null,
  status: 'idle' as StatusBieguNcRfg,
  wynik: null,
  bladBiegu: null,
  wynikiFrt: {},
};

export const useNcRfgStore = create<NcRfgStoreState>((set, get) => ({
  ...STAN_POCZATKOWY,

  zaladujKatalog: async () => {
    if (get().katalog) return;
    try {
      set({ katalog: await pobierzKatalogNcRfg(), bladKatalogu: null });
    } catch (err) {
      set({ bladKatalogu: err instanceof Error ? err.message : MACIERZ_STRINGS.bladKatalogu });
    }
  },

  ustawOperator: (operatorId) => set({ operatorWybor: operatorId }),

  przeprowadzTesty: async (modules) => {
    if (modules.length === 0) return;
    set({ status: 'running', bladBiegu: null });
    try {
      set({ wynik: await uruchomBiegNcRfg({ modules }), status: 'ready' });
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
