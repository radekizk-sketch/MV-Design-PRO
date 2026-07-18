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

  projectPrefix: 'Projekt',
  emptyValue: '—',

  spacesHeading: 'Przestrzenie',

  activeCase: 'Zakres obliczeń',
  fingerprint: 'Odcisk wyników SHA-256',

  modeGroup: 'Tryb',
  modeBasic: 'Podstawowy',
  modeExtended: 'Rozszerzony',
  modeExpert: 'Ekspercki',

  save: 'Zapisz',
  calculate: 'Oblicz',
  reconnect: 'Połącz ponownie',
  openProject: 'Otwórz projekt',
  resetLayout: 'Przywróć układ domyślny',
  viewMenu: 'Widok',

  toggleLeft: 'Nawigacja',
  toggleRight: 'Zwiń lub rozwiń panel inspektora',
  themeGroup: 'Motyw',
  themeToggleHint: 'Przełącz motyw ekranu: ciemny (dyspozytorski) / jasny (techniczny)',

  inspectorHeading: 'Inspektor',
  inspectorEmpty: 'Zaznacz obiekt, aby zobaczyć szczegóły',

  backendConnected: 'Serwer: połączono',
  backendError: 'Serwer: brak połączenia',
  backendConnecting: 'Serwer: łączenie…',

  modelValidated: 'Model: zwalidowany',
  modelPending: 'Model: w budowie',

  resultsFresh: 'Wyniki: aktualne',
  resultsOutdated: 'Wyniki: nieaktualne',
  resultsNone: 'Wyniki: do obliczenia',

  searchPlaceholder: 'Szukaj poleceń, obiektów, okien…',
  searchHint: 'Wyszukiwarka poleceń — pełna wersja w kolejnym kroku (W-105).',

  bottomProblemy: 'Problemy',
  bottomPrzebiegi: 'Przebiegi',
  bottomDziennik: 'Dziennik operacji',
  bottomHint: 'Panel dolny — zawartość w kolejnym kroku (E1.4).',
  closeBottom: 'Zamknij panel dolny',

  loadingShell: 'Wczytywanie powłoki…',
  workspaceLabel: 'Warsztat',
  workspaceHint: 'Warsztat — zawartość przestrzeni w kolejnych kartach.',
} as const;

/** „Przypadków: {n}". */
export function caseCountLabel(count: number | null): string {
  return `Przypadków: ${count == null ? SHELL_STRINGS.emptyValue : count}`;
}

/** „Model: rew. {n}". */
export function modelRevisionLabel(revision: number | null): string {
  return `Model: rew. ${revision == null ? SHELL_STRINGS.emptyValue : revision}`;
}

/** „Przebieg: {czas}". */
export function runLabel(when: string | null): string {
  return `Przebieg: ${when == null ? SHELL_STRINGS.emptyValue : when}`;
}

/** „Gotowość: brak uwag" / „Gotowość: {n} ostrzeżenie|ostrzeżenia|ostrzeżeń". */
export function readinessLabel(warnings: number, blockers: number): string {
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
