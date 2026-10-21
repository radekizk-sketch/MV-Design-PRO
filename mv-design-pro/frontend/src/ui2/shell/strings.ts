/*
 * Teksty powłoki MV-DESIGN-PRO (okno W-110) — wyłącznie polski język techniczny
 * (MODEL_INTERAKCJI §2.7). Dokładne stringi wg karty E1.1 §5.
 *
 * Kopia UI jest scentralizowana w tym module (klucze techniczne, nie prop-y UI),
 * dzięki czemu etykiety pierwszoplanowe pozostają w jednym miejscu i są wprost
 * importowane przez testy jako oczekiwane wartości.
 */

export const SHELL_STRINGS = {
  appNameLead: 'MV·DESIGN·',
  appNameAccent: 'PRO',

  emptyValue: '—',

  spacesHeading: 'Przestrzenie',

  // --- pasek projektu (karta K1 POWLOKA: trzy pasy zamiast pięciu) ---
  projectMenuHint: 'Projekt: zmiana projektu i metadane',
  changeProject: 'Zmień projekt…',
  projectMetadata: 'Metadane projektu…',
  openProject: 'Otwórz projekt',
  noProject: 'Brak otwartego projektu',
  /** Etykieta zakresu obliczeń (kontrakt e2e: tekst „Zakres" w pasku projektu). */
  caseLabel: 'Zakres',
  caseOpenHint: 'Otwórz stan wariantów i przebiegów zakresu obliczeń',
  /* K6 / H-6 R4: pasek stanu pokazuje odcisk SHA-256 MIGAWKI MODELU (realne
     źródło), więc etykieta nazywa rzecz po imieniu — „Wersja modelu". */
  wersjaModelu: 'Wersja modelu',

  calculate: 'Oblicz',
  calculating: 'Obliczanie…',
  calculateHint: 'Uruchom obliczenie aktywnego zakresu',
  reconnect: 'Połącz ponownie',

  // --- menu Widok ---
  viewMenu: 'Widok',
  themeItem: 'Motyw ekranu',
  viewModeItem: 'Widok schematu',
  viewModeHint: 'Roboczy: sama sieć do pracy. Arkusz: rama, pola odniesienia i tabliczka jak w eksporcie.',
  viewModeWorking: 'roboczy',
  viewModeSheet: 'arkusz',
  auditDetails: 'Szczegóły audytowe',
  auditDetailsHint:
    'Pokaż identyfikatory techniczne, odciski danych, ślady obliczeń i zakładki analiz akademickich',
  toggleLeft: 'Panel nawigacji',
  toggleRight: 'Inspektor',
  toggleBottom: 'Panel dolny',
  resetLayout: 'Przywróć układ domyślny',

  // --- pasek narzędzi bieżącej przestrzeni ---
  toolbarLabel: 'Narzędzia przestrzeni',
  search: 'Szukaj',
  searchHint: 'Szukaj poleceń, obiektów modelu i okien (Ctrl+K)',
  catalog: 'Katalog',
  catalogHint: 'Katalog techniczny typów urządzeń',
  review: 'Przegląd zbiorczy',
  reviewHint: 'Przegląd zbiorczy: katalogi, transformatory, łączniki, źródła OZE, gotowość, stacje',
  history: 'Historia',
  historyHint: 'Historia wersji układu i audyt',
  modelCounts: 'Liczniki modelu',
  modelCountsHint: 'Liczniki elementów modelu sieci',

  inspectorHeading: 'Inspektor',
  inspectorEmpty: 'Zaznacz obiekt, aby zobaczyć szczegóły',

  // --- pasek stanu ---
  backendConnected: 'Serwer: połączono',
  backendError: 'Serwer: brak połączenia',
  backendConnecting: 'Serwer: łączenie…',
  readinessHint: 'Przejdź do przestrzeni Gotowość',
  revisionHint: 'Otwórz dziennik operacji modelu',
  runHint: 'Otwórz rejestr przebiegów',

  // Statusy wyników — spójne ze STATUS_WYNIKOW_LABEL (brak/aktualne/nieaktualne;
  // karta K4/D1). Spójność pilnowana testem znacznikSwiezosci.test.ts.
  resultsFresh: 'Wyniki: aktualne',
  resultsOutdated: 'Wyniki: nieaktualne',
  resultsNone: 'Wyniki: brak',
  /* CV-2-W: status wyników przypadku jest WYPROWADZANY przez backend (z biegów
     i koperty rewizji), więc werdykt jest zawsze jeden z trzech słownikowych,
     a jego PRZYCZYNĘ (`result_status_reason_pl`) chip pokazuje zdaniem z serwera. */
  resultsOutdatedHint: 'Przejdź do przestrzeni Obliczenia, aby przeliczyć wyniki',
  resultsFreshHint: 'Otwórz wyniki aktywnego zakresu',

  searchPlaceholder: 'Szukaj poleceń, obiektów, okien…',

  // --- panel dolny ---
  bottomPanelLabel: 'Panel dolny',
  bottomProblemy: 'Problemy',
  bottomPrzebiegi: 'Przebiegi',
  bottomDziennik: 'Dziennik operacji',
  bottomWyniki: 'Wyniki',
  bottomDowody: 'Dowody',
  bottomResizeHint: 'Zmień wysokość panelu dolnego',
  closeBottom: 'Zamknij panel dolny',

  loadingShell: 'Wczytywanie powłoki…',
  workspaceLabel: 'Warsztat',
} as const;

/** „Model: rew. {n}". */
export function modelRevisionLabel(revision: number | null): string {
  return `Model: rew. ${revision == null ? SHELL_STRINGS.emptyValue : revision}`;
}

/** „Przebieg: {czas}". */
export function runLabel(when: string | null): string {
  return `Przebieg: ${when == null ? SHELL_STRINGS.emptyValue : when}`;
}

/** „Obliczanie: {analiza} · {stan}" — trwający bieg (§9: stan obliczeń widoczny globalnie). */
export function runInProgressLabel(analiza: string | null, stan: string | null): string {
  return ['Obliczanie', [analiza, stan].filter(Boolean).join(' · ')].filter(Boolean).join(': ');
}

/**
 * „Gotowość: brak uwag" / „Gotowość: {n} ostrzeżenie|ostrzeżenia|ostrzeżeń".
 *
 * `ustalona === false` (gotowości NIKT nie policzył — `podsumujGotowosc().ustalona`)
 * daje umowną kreskę braku danej, tę samą, którą ten moduł stosuje dla nieznanej
 * rewizji i przebiegu (`modelRevisionLabel`, `runLabel`). Bez tego rozróżnienia chip mówił „Gotowość: brak uwag" dokładnie
 * wtedy, gdy odczyt gotowości padł — ta sama klasa defektu co V12K-309 poz. 1.
 * Docelowe nazewnictwo stanu nieustalonego w chromie pozostaje decyzją właściciela
 * (AUDYT_SZCZYTU_2026-08-01 §4 pkt 3); kreska jest brakiem danej, nie nową nazwą.
 */
export function readinessLabel(warnings: number, blockers: number, ustalona: boolean): string {
  if (!ustalona) {
    return `Gotowość: ${SHELL_STRINGS.emptyValue}`;
  }
  if (blockers > 0) {
    return `Gotowość: ${blockers} ${pluralPl(blockers, 'blokada', 'blokady', 'blokad')}`;
  }
  if (warnings > 0) {
    return `Gotowość: ${warnings} ${pluralPl(warnings, 'ostrzeżenie', 'ostrzeżenia', 'ostrzeżeń')}`;
  }
  return 'Gotowość: brak uwag';
}

function pluralPl(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
