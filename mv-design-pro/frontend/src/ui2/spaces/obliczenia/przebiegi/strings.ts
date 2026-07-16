/*
 * Teksty okna „Przebiegi obliczeń" (W-503, przestrzeń „Obliczenia", karta E7.2)
 * — wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7). Słownik V12K-026:
 * „przypadek obliczeniowy" dozwolony w ui2. Etykiety statusu/analizy NIE są
 * duplikowane — importowane wprost z `RUN_STATUS_LABELS`/`ANALYSIS_TYPE_LABELS`
 * (`ui/study-cases/types.ts:270-289`, karta §2 „importuj, nie duplikuj").
 *
 * Formatowanie czasu/czasu trwania — funkcje CZYSTE, bez `Date.now`/losowości
 * (karta §2). `formatCzas` powtarza wzorzec `formatCzasPrzebiegu` z przestrzeni
 * „Projekt" (`ui2/spaces/projekt/strings.ts:90`) — regex na stałym znaczniku ISO,
 * bez obiektu `Date`. `formatCzasTrwania` różni dwa stałe znaczniki ISO przez
 * `Date.parse` (deterministyczna funkcja WEJŚCIA, nie odczyt zegara systemowego
 * — odróżnić od zakazanego `Date.now()`/`new Date()` bez argumentu).
 */

import type { ExecutionAnalysisType, RunStatus } from '../../../../ui/study-cases/types';
import { ANALYSIS_TYPE_LABELS, RUN_STATUS_LABELS } from '../../../../ui/study-cases/types';

export { ANALYSIS_TYPE_LABELS, RUN_STATUS_LABELS };

export const PRZEBIEGI_STRINGS = {
  // Nagłówek okna
  tytul: 'Przebiegi obliczeń',
  podtytul: 'Historia i stan przebiegów aktywnego przypadku obliczeniowego.',

  // Stany okna
  brakPrzypadku: 'Brak aktywnego przypadku z historią przebiegów',
  brakPrzypadkuOpis:
    'Uruchom obliczenie z poziomu przypadku obliczeniowego, aby zobaczyć jego przebiegi tutaj.',
  ladowanie: 'Wczytywanie przebiegów…',
  blad: 'Nie udało się wczytać przebiegów',
  brakPrzebiegow: 'Brak wykonanych przebiegów dla tego przypadku.',

  // Kolumny listy
  kolAnaliza: 'Analiza',
  kolStatus: 'Status',
  kolPoczatek: 'Początek',
  kolCzasTrwania: 'Czas trwania',
  kolRewizja: 'Rewizja modelu',

  // Szczegóły przebiegu
  szczegolyBrakWyboru: 'Wybierz przebieg z listy, aby zobaczyć jego szczegóły.',
  sekcjaParametry: 'Parametry przebiegu (odtwarzalność)',
  sekcjaWkrotce: 'Dane niedostępne w rekordzie przebiegu',
  sekcjaTechniczna: 'Szczegóły techniczne',
  etykietaPoczatek: 'Początek',
  etykietaZakonczenie: 'Zakończenie',
  etykietaCzasTrwania: 'Czas trwania',
  etykietaOdcisk: 'Odcisk danych wejściowych (SHA-256)',
  etykietaRewizjaModelu: 'Rewizja modelu w chwili liczenia',
  etykietaParametryWejsciowe: 'Wartości parametrów wejściowych solvera',
  etykietaBlad: 'Komunikat błędu',
  etykietaId: 'Identyfikator przebiegu',
  etykietaPrzypadekId: 'Identyfikator przypadku',
  pochodzenieWkrotce: 'Wkrótce — brak źródła w rekordzie przebiegu',
  wToku: 'w toku',
  brakWartosci: '—',

  // Akcja „Pokaż wyniki"
  przyciskPokazWyniki: 'Pokaż wyniki',
  przyciskPokazWynikiOpis: 'Dostępne po zakończeniu przebiegu (status: Zakończony).',

  // ARIA — ogłoszenie na żywo (magistrala, karta §3 kryterium 2)
  ariaWynikiGotowe: 'Lista przebiegów odświeżona — nowe wyniki są gotowe.',
  ariaWynikiNiewazne: (rev: number): string =>
    `Model zmieniony do rewizji ${rev} — wyniki poprzednich przebiegów mogą być nieaktualne.`,
} as const;

/**
 * Format czasu ze znacznika ISO (deterministyczny, bez `Date`/strefy — wzorzec
 * `formatCzasPrzebiegu`, `ui2/spaces/projekt/strings.ts:90`).
 * „2026-07-15T14:32:00Z" → „2026-07-15 14:32". Wejście spoza wzorca zwracane
 * bez zmian; `null` → „—".
 */
export function formatCzas(iso: string | null): string {
  if (!iso) return PRZEBIEGI_STRINGS.brakWartosci;
  const dopasowanie = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return dopasowanie ? `${dopasowanie[1]} ${dopasowanie[2]}` : iso;
}

/**
 * Czas trwania przebiegu — różnica dwóch STAŁYCH znaczników ISO (`started_at`/
 * `finished_at` z rekordu przebiegu), czysta funkcja wejścia→wyjścia (karta §2:
 * „zero Date.now"). `Date.parse` czyta wyłącznie podane argumenty — nie zegar
 * systemowy — więc ten sam wpis zawsze daje ten sam wynik (Determinism Rule).
 * Brak `started_at` → „—"; brak `finished_at` (przebieg trwa) → „w toku";
 * znacznik spoza formatu ISO → „—" (bez zgadywania). Wynik: „45 s" / „2 min 05 s".
 */
export function formatCzasTrwania(started: string | null, finished: string | null): string {
  if (!started) return PRZEBIEGI_STRINGS.brakWartosci;
  if (!finished) return PRZEBIEGI_STRINGS.wToku;
  const poczatekMs = Date.parse(started);
  const koniecMs = Date.parse(finished);
  if (Number.isNaN(poczatekMs) || Number.isNaN(koniecMs)) return PRZEBIEGI_STRINGS.brakWartosci;
  const sekundyCalkowite = Math.round(Math.max(0, koniecMs - poczatekMs) / 1000);
  const minuty = Math.floor(sekundyCalkowite / 60);
  const sekundy = sekundyCalkowite % 60;
  return minuty === 0 ? `${sekundy} s` : `${minuty} min ${String(sekundy).padStart(2, '0')} s`;
}

/** Skrócony odcisk (pierwsze 10 znaków skrótu) — pełny w atrybucie `title`. */
export function formatOdcisk(hash: string): string {
  return hash.slice(0, 10);
}

/** Etykieta PL analizy — z istniejącego słownika (bez fallbacku „zgadywanego"). */
export function etykietaAnalizy(typ: ExecutionAnalysisType): string {
  return ANALYSIS_TYPE_LABELS[typ] ?? typ;
}

/** Etykieta PL statusu przebiegu — z istniejącego słownika. */
export function etykietaStatusu(status: RunStatus): string {
  return RUN_STATUS_LABELS[status] ?? status;
}
