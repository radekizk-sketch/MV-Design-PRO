/**
 * PORÓWNANIE A/B Z KANWY (karta S9-13, audyt W-8) — stan sekcji „Porównanie
 * A/B" panelu filtrów warstwy wynikowej.
 *
 * DŁUG, KTÓRY TEN MODUŁ ZAMYKA. Nakładka różnic A/B miała dostawcę
 * (`POST /api/short-circuit-comparisons/sld-overlay`) i konsumenta (warstwa
 * etykiet kanwy), ale JEDYNE wejście prowadziło przez ekran porównań — z
 * poziomu schematu porównanie było nieosiągalne (audyt W-8: elementy
 * porównawcze panelu nie pojawiały się po biegu). Ten moduł daje kanwie
 * WŁASNE wejście: wybór drugiego UKOŃCZONEGO przebiegu tego samego rodzaju
 * i przypadku, z uczciwym stanem zablokowanym, gdy porównać się nie da.
 *
 * JEDNO ŹRÓDŁO PREDYKATÓW (reguła KLASA-NIE-INSTANCJA pkt 3): zbiór kandydatów
 * ORAZ powód blokady pochodzą z tej samej funkcji `stanPorownaniaZKanwy` —
 * sekcja nie może pokazać selektora bez kandydatów ani blokady przy istniejących
 * kandydatach, bo oba fakty rozstrzyga jeden przebieg rachunku.
 *
 * GRANICE: zero fizyki, zero mutacji, zero wołań API — czysta funkcja na
 * danych, które kanwa już ma (payload wyniku, lista przebiegów runStore,
 * status świeżości przypadku).
 */

import type { ExecutionRun } from '../../../study-cases/types';
import { normalizeResultLabelAnalysis } from './resultLabelTemplates';

/** Akcja naprawcza stanu zablokowanego — obie prowadzą w REALNE miejsca
 *  aplikacji (zero martwych klików): `obliczenia` = przestrzeń obliczeń
 *  (`#case-config`, tam uruchamia się bieg), `ekran-porownan` = zakładka
 *  „Porównanie" przestrzeni wyników (tam żyje porównanie tabelaryczne,
 *  m.in. rozpływu). */
export type AkcjaPorownaniaZKanwy = 'obliczenia' | 'ekran-porownan';

/** Stan sekcji „Porównanie A/B" panelu filtrów. `nieaktywne` = trwa tryb
 *  różnic (sekcję zastępuje podsumowanie „Różnice A/B" z wyjściem). */
export type StanPorownaniaZKanwy =
  | { readonly rodzaj: 'nieaktywne' }
  | {
      readonly rodzaj: 'zablokowane';
      readonly powod: string;
      readonly akcja: AkcjaPorownaniaZKanwy | null;
      readonly etykietaAkcji: string | null;
    }
  | { readonly rodzaj: 'gotowe'; readonly kandydaci: readonly ExecutionRun[] };

// ---------------------------------------------------------------------------
// Powody blokady — STAŁE współdzielone z asercjami testów (jedna prawda treści).
// ---------------------------------------------------------------------------

/** TEN SAM łańcuch, którym tryb porównawczy kolejnych biegów komunikuje
 *  nieaktualność — oba tryby blokuje jeden fakt (`activeCaseResultStatus ===
 *  'OUTDATED'`), więc i komunikat jest jeden. */
export const POWOD_WYNIKI_NIEAKTUALNE = 'Wyniki nieaktualne — porównanie zablokowane';

export const POWOD_BRAK_BIEGU =
  'Brak wyniku biegu na schemacie — uruchom obliczenie, aby porównać przebiegi.';

/** Uczciwa granica dostawcy: nakładkę różnic na schemacie serwuje dziś
 *  WYŁĄCZNIE końcówka porównania zwarciowego. Porównanie rozpływu istnieje
 *  jako tabela na ekranie porównań — akcja tam prowadzi. */
export const POWOD_RODZAJ_BEZ_NAKLADKI =
  'Nakładka różnic na schemacie jest dostępna dla biegów zwarciowych. '
  + 'Porównanie tego rodzaju biegu znajdziesz na ekranie porównań.';

export const POWOD_BRAK_DRUGIEGO_BIEGU =
  'Brak drugiego ukończonego biegu tego samego rodzaju w tym przypadku.';

export const ETYKIETA_AKCJI_OBLICZENIA = 'Przejdź do obliczeń';
export const ETYKIETA_AKCJI_EKRAN_POROWNAN = 'Otwórz ekran porównań';

// ---------------------------------------------------------------------------
// Rachunek stanu
// ---------------------------------------------------------------------------

/** Dane wejściowe rachunku — wszystkie z istniejących store'ów kanwy. */
export interface WejsciePorownaniaZKanwy {
  /** Wynik biegu pokazywany na schemacie (`rawResultOverlayStore.payload`). */
  readonly payload: { readonly run_id: string; readonly analysis_type: string } | null;
  /** `true` = nakładka różnic już trwa (sekcję wyboru zastępuje podsumowanie). */
  readonly nakladkaAktywna: boolean;
  /** `true` = wyniki przypadku nieaktualne (jedno źródło świeżości S9-11:
   *  `activeCaseResultStatus === 'OUTDATED'`, ten sam predykat co stale-badge). */
  readonly wynikiNieaktualne: boolean;
  /** Przebiegi aktywnego przypadku (`useExecutionRunsStore.runs`). */
  readonly runs: readonly ExecutionRun[];
  /** Aktywny przypadek (`useAppStateStore.activeCaseId`). */
  readonly activeCaseId: string | null;
}

/** Data przebiegu do sortowania/etykiety: zakończenie, przy braku rozpoczęcie. */
export function dataPrzebiegu(run: ExecutionRun): string | null {
  return run.finished_at ?? run.started_at;
}

/**
 * JEDYNY predykat kandydata na przebieg odniesienia (A): UKOŃCZONY (`DONE`)
 * × ten sam rodzaj analizy co bieg na schemacie × ten sam przypadek × inny
 * przebieg niż pokazywany. Sortowanie deterministyczne: najnowszy pierwszy
 * (po dacie, remis → id) — jak w selektorach ekranu porównań.
 */
export function kandydaciPorownaniaZKanwy(
  runs: readonly ExecutionRun[],
  biezacyRunId: string,
  biezacyTypAnalizy: string,
  activeCaseId: string | null,
): ExecutionRun[] {
  return runs
    .filter(
      (run) =>
        run.status === 'DONE'
        && run.analysis_type === biezacyTypAnalizy
        && run.id !== biezacyRunId
        && (activeCaseId === null || run.study_case_id === activeCaseId),
    )
    .slice()
    .sort((a, b) => {
      const da = dataPrzebiegu(a) ?? '';
      const db = dataPrzebiegu(b) ?? '';
      if (da !== db) return da < db ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * Stan sekcji „Porównanie A/B" — kolejność rozstrzygnięć (pierwsze prawdziwe
 * wygrywa, powody wzajemnie wykluczające):
 * 1. nakładka różnic trwa ⇒ `nieaktywne` (podsumowanie ma własną sekcję),
 * 2. brak wyniku na schemacie ⇒ blokada + akcja „obliczenia",
 * 3. wyniki nieaktualne ⇒ blokada (ta sama treść co tryb porównawczy),
 * 4. rodzaj biegu bez dostawcy nakładki (nie-zwarciowy) ⇒ blokada + akcja
 *    „ekran porównań" (tam żyje porównanie tabelaryczne),
 * 5. zero kandydatów ⇒ blokada + akcja „obliczenia",
 * 6. inaczej ⇒ `gotowe` z kandydatami.
 */
export function stanPorownaniaZKanwy(wejscie: WejsciePorownaniaZKanwy): StanPorownaniaZKanwy {
  if (wejscie.nakladkaAktywna) return { rodzaj: 'nieaktywne' };
  if (!wejscie.payload) {
    return {
      rodzaj: 'zablokowane',
      powod: POWOD_BRAK_BIEGU,
      akcja: 'obliczenia',
      etykietaAkcji: ETYKIETA_AKCJI_OBLICZENIA,
    };
  }
  if (wejscie.wynikiNieaktualne) {
    return {
      rodzaj: 'zablokowane',
      powod: POWOD_WYNIKI_NIEAKTUALNE,
      akcja: null,
      etykietaAkcji: null,
    };
  }
  if (normalizeResultLabelAnalysis(wejscie.payload.analysis_type) !== 'short_circuit') {
    return {
      rodzaj: 'zablokowane',
      powod: POWOD_RODZAJ_BEZ_NAKLADKI,
      akcja: 'ekran-porownan',
      etykietaAkcji: ETYKIETA_AKCJI_EKRAN_POROWNAN,
    };
  }
  const kandydaci = kandydaciPorownaniaZKanwy(
    wejscie.runs,
    wejscie.payload.run_id,
    wejscie.payload.analysis_type,
    wejscie.activeCaseId,
  );
  if (kandydaci.length === 0) {
    return {
      rodzaj: 'zablokowane',
      powod: POWOD_BRAK_DRUGIEGO_BIEGU,
      akcja: 'obliczenia',
      etykietaAkcji: ETYKIETA_AKCJI_OBLICZENIA,
    };
  }
  return { rodzaj: 'gotowe', kandydaci };
}
