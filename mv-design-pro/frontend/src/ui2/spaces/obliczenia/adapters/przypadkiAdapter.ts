/*
 * Adapter menedżera przypadków obliczeniowych (przestrzeń „Obliczenia", W-501,
 * karta E7.1). Czyta WYŁĄCZNIE istniejące store'y study-cases read-only i mapuje
 * je na modele widoku. Akcje (aktywacja/utworzenie/klonowanie/wczytanie pełnej
 * karty) delegują do ISTNIEJĄCYCH akcji store'u / funkcji API — zero fizyki, zero
 * mutacji NetworkModelu (Case Immutability Rule). Funkcje `mapuj*`/`roznice*` są
 * czyste (bez React) i testowalne fixture'ami; hooki `use*` spinają je z Zustandem.
 *
 * ŹRÓDŁA DANYCH — read-only (mapowanie plik:linia — karta §2):
 * - Lista przypadków: `useSortedCases` (`ui/study-cases/store.ts:372`, sort
 *   `localeCompare('pl')`) → `StudyCaseListItem` (`ui/study-cases/types.ts:105-114`:
 *   id, name, description, result_status, results_valid, is_active, updated_at).
 * - Stan ładowania listy: `useStudyCasesStore.isLoading` (`store.ts:52`), obecność
 *   projektu: `useAppStateStore.activeProjectId` (`ui/app-state/store.ts:87`).
 * - Pełna karta (konfiguracja): `api.getStudyCase` (`ui/study-cases/api.ts:63`) →
 *   `StudyCase.config` (`types.ts:91`, `StudyCaseConfig` `types.ts:46-71`). Lista
 *   niesie tylko streszczenie (bez `config`), więc karta i porównanie muszą pobrać
 *   pełny rekord (odczyt, bez mutacji).
 *
 * AKCJE — istniejące akcje store/API (karta §2, „udokumentuj plik:linia"):
 * - Aktywacja: (1) UTRWALENIE `is_active` — `useStudyCasesStore.activateCase`
 *   (`store.ts:224` → `api.setActiveStudyCase` `api.ts:133`); wymaga ustawionego
 *   `projectId` (`store.ts:225-228`) — gdy brak, utrwalenie pomijamy, bez rzucania.
 *   (2) ATOMOWA zmiana kontekstu CAŁEJ POWŁOKI — `useAppStateStore.setActiveCase`
 *   (`ui/app-state/store.ts:239`), która resetuje snapshot/readiness/run
 *   (`store.ts:240-253`) — to jest „akcja atomowa dla całej powłoki" (SPEC §3.2),
 *   której odzwierciedlenie sprawdza test karty §3 (kryterium 3).
 * - Utworzenie: `useStudyCasesStore.createCase` (`store.ts:136` → `api.createStudyCase`
 *   `api.ts:51`). Klonowanie (dziedziczenie „jak…, ale…"): `useStudyCasesStore.cloneCase`
 *   (`store.ts:204` → `api.cloneStudyCase` `api.ts:107`).
 *
 * TODO-KARTA (ograniczenia — brak źródła w typach read-only, karta §2 „NIE zgaduj"):
 * 1. „Temperatura przewodów" oraz „Stan łączeń" NIE są polami `StudyCaseConfig`
 *    (`types.ts:46-71`; temperatura nieobecna, stany łączeń utrwalane osobną operacją
 *    domenową `set_case_switch_state`, niewystawianą przez store study-cases) →
 *    w sekcji „Założenia" renderowane jako „wkrótce", bez fabrykowania wartości.
 * 2. `CaseKind` (`ui/app-state/store.ts:56`) nie jest niesiony przez `StudyCase`;
 *    przy aktywacji ustawiamy `'ShortCircuitCase'` — tak jak istniejący orkiestrator
 *    powłoki (`ui2/legacy/useLegacyOrchestrator.ts:688-692`). Docelowe źródło rodzaju
 *    przypadku → osobna karta.
 * 3. Klonowanie (`api.cloneStudyCase`) przyjmuje wyłącznie `new_name` — nie ustawia
 *    aktywności ani opisu; „Ustaw jako aktywny" dotyczy tylko ścieżki „nowy pusty"
 *    (`createCase.set_active`).
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  StudyCase,
  StudyCaseConfig,
  StudyCaseListItem,
  StudyCaseResultStatus,
} from '../../../../ui/study-cases/types';
import { CONFIG_FIELD_LABELS } from '../../../../ui/study-cases/types';
import { getStudyCase } from '../../../../ui/study-cases/api';
import { useStudyCasesStore, useSortedCases } from '../../../../ui/study-cases/store';
import { useAppStateStore } from '../../../../ui/app-state/store';
import { formatWartoscKonfiguracji } from '../strings';

// ---------------------------------------------------------------------------
// Modele widoku (projekcja read-only)
// ---------------------------------------------------------------------------

/** Stan listy przestrzeni (karta §3): brak projektu / ładowanie / lista. */
export type StanListy = 'brak-projektu' | 'ladowanie' | 'lista';

/** Wiersz listy przypadków obliczeniowych. */
export interface PrzypadekWiersz {
  id: string;
  nazwa: string;
  konfiguracja: string;
  statusWynikow: StudyCaseResultStatus;
  zmienionoISO: string | null;
  aktywny: boolean;
}

/** Wynik pobrania pełnych rekordów (karta / porównanie). */
export interface StanPelnychPrzypadkow {
  przypadki: StudyCase[];
  ladowanie: boolean;
  blad: string | null;
}

/** Wiersz tabeli porównania konfiguracji (jedno pole × wszystkie przypadki). */
export interface WierszRoznicy {
  pole: keyof StudyCaseConfig;
  etykieta: string;
  wartosci: string[];
  rozne: boolean;
}

// ---------------------------------------------------------------------------
// Mapowania czyste (bez React)
// ---------------------------------------------------------------------------

/** Mapuje streszczenia `StudyCaseListItem` na wiersze widoku. */
export function mapujWiersze(cases: StudyCaseListItem[]): PrzypadekWiersz[] {
  return cases.map((c) => ({
    id: c.id,
    nazwa: c.name,
    konfiguracja: c.description.trim() || '—',
    statusWynikow: c.result_status,
    zmienionoISO: c.updated_at || null,
    aktywny: c.is_active,
  }));
}

/** Uporządkowana lista kluczy konfiguracji (kolejność deterministyczna wg typu). */
const POLA_KONFIGURACJI = Object.keys(CONFIG_FIELD_LABELS) as Array<keyof StudyCaseConfig>;

/**
 * Buduje tabelę różnic konfiguracji dla 2+ przypadków. Dla każdego pola zbiera
 * sformatowane wartości ze wszystkich przypadków i zaznacza `rozne`, gdy nie są
 * identyczne (porównanie po surowej wartości, nie po sformatowanym tekście).
 * Kolejność pól deterministyczna. Zwraca `[]` dla < 2 przypadków.
 */
export function rozniceKonfiguracji(przypadki: StudyCase[]): WierszRoznicy[] {
  if (przypadki.length < 2) return [];
  return POLA_KONFIGURACJI.map((pole) => {
    const surowe = przypadki.map((p) => p.config[pole]);
    const rozne = surowe.some((w) => w !== surowe[0]);
    return {
      pole,
      etykieta: CONFIG_FIELD_LABELS[pole],
      wartosci: przypadki.map((p) => formatWartoscKonfiguracji(pole, p.config[pole])),
      rozne,
    };
  });
}

// ---------------------------------------------------------------------------
// Hooki read-only (spięcie ze store'ami)
// ---------------------------------------------------------------------------

/** Stan listy: brak projektu → gdy brak aktywnego projektu; ładowanie; inaczej lista. */
export function useStanListy(): StanListy {
  const projectId = useAppStateStore((s) => s.activeProjectId);
  const ladowanie = useStudyCasesStore((s) => s.isLoading);
  if (!projectId) return 'brak-projektu';
  if (ladowanie) return 'ladowanie';
  return 'lista';
}

/** Wiersze listy przypadków (posortowane wg nazwy, `localeCompare('pl')`). */
export function useWiersze(): PrzypadekWiersz[] {
  const cases = useSortedCases();
  return mapujWiersze(cases);
}

/**
 * Pobiera pełne rekordy przypadków (z konfiguracją) po identyfikatorach —
 * `api.getStudyCase` per id (odczyt). Klucz zależności = złączone id (stabilny),
 * co eliminuje pętle re-fetchu przy nowej referencji tablicy.
 */
export function usePelnePrzypadki(ids: string[]): StanPelnychPrzypadkow {
  const klucz = ids.join('|');
  const [stan, setStan] = useState<StanPelnychPrzypadkow>({
    przypadki: [],
    ladowanie: false,
    blad: null,
  });

  useEffect(() => {
    const lista = klucz ? klucz.split('|') : [];
    if (lista.length === 0) {
      setStan({ przypadki: [], ladowanie: false, blad: null });
      return;
    }
    let anulowane = false;
    setStan((poprz) => ({ ...poprz, ladowanie: true, blad: null }));
    Promise.all(lista.map((id) => getStudyCase(id)))
      .then((przypadki) => {
        if (!anulowane) setStan({ przypadki, ladowanie: false, blad: null });
      })
      .catch((err) => {
        if (!anulowane) {
          const komunikat = err instanceof Error ? err.message : 'Błąd wczytywania przypadku';
          setStan({ przypadki: [], ladowanie: false, blad: komunikat });
        }
      });
    return () => {
      anulowane = true;
    };
  }, [klucz]);

  return stan;
}

// ---------------------------------------------------------------------------
// Akcje (delegacja do istniejących akcji store/API)
// ---------------------------------------------------------------------------

/**
 * Aktywacja przypadku. Zwraca funkcję async: (1) utrwala `is_active` przez
 * `useStudyCasesStore.activateCase` (gdy `projectId` ustawiony), (2) wykonuje
 * atomową zmianę kontekstu powłoki `useAppStateStore.setActiveCase` (SPEC §3.2).
 */
export function useAktywujPrzypadek(): (wiersz: PrzypadekWiersz) => Promise<void> {
  return useCallback(async (wiersz: PrzypadekWiersz) => {
    const scStore = useStudyCasesStore.getState();
    if (scStore.projectId) {
      try {
        await scStore.activateCase(wiersz.id);
      } catch {
        // Błąd utrwalenia trafia do `study-cases store.error`; kontekst powłoki
        // (app-state) pozostaje autorytatywnym źródłem prawdy aktywnego przypadku.
      }
    }
    useAppStateStore
      .getState()
      .setActiveCase(wiersz.id, wiersz.nazwa, 'ShortCircuitCase', wiersz.statusWynikow);
  }, []);
}

/** Stan i akcje tworzenia/klonowania przypadku (delegacja do study-cases store). */
export interface TworzeniePrzypadku {
  utworz: (nazwa: string, opis: string, ustawAktywny: boolean) => Promise<StudyCase>;
  klonuj: (zrodloId: string, nazwa: string) => Promise<StudyCase>;
  tworzenie: boolean;
  blad: string | null;
}

export function useTworzeniePrzypadku(): TworzeniePrzypadku {
  const tworzenie = useStudyCasesStore((s) => s.isCreating || s.isCloning);
  const blad = useStudyCasesStore((s) => s.error);

  const utworz = useCallback(
    async (nazwa: string, opis: string, ustawAktywny: boolean) => {
      const projectId =
        useAppStateStore.getState().activeProjectId ?? useStudyCasesStore.getState().projectId;
      if (!projectId) {
        throw new Error('Otwórz projekt, aby utworzyć przypadek.');
      }
      return useStudyCasesStore.getState().createCase({
        project_id: projectId,
        name: nazwa,
        description: opis,
        set_active: ustawAktywny,
      });
    },
    [],
  );

  const klonuj = useCallback(async (zrodloId: string, nazwa: string) => {
    return useStudyCasesStore.getState().cloneCase(zrodloId, nazwa);
  }, []);

  return { utworz, klonuj, tworzenie, blad };
}
