/*
 * Teksty inspektora kontekstowego (okno W-110/W-602) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Dokładne stringi wg karty E1.3 §5.
 *
 * Centralny słownik: etykiety pierwszoplanowe w jednym miejscu, importowane wprost
 * przez testy jako oczekiwane wartości. Identyfikatory kodowe NIE pojawiają się
 * w pierwszym planie — wyłącznie w sekcji „Szczegóły techniczne" (tryb Ekspercki).
 */

export const INSPECTOR_STRINGS = {
  // Zakładki stałe
  tabWlasciwosci: 'Właściwości',
  tabWyniki: 'Wyniki',
  tabDowod: 'Dowód',
  tabPowiazania: 'Powiązania',

  // Akordeon
  zaawansowane: 'Zaawansowane',

  // Pinezka
  przypnij: 'Przypnij',
  odepnij: 'Odepnij',
  sekcjaPrzypiety: 'Przypięty',
  sekcjaBiezacy: 'Bieżąca selekcja',

  // Dostępna nazwa listy zakładek (a11y)
  zakladkiInspektora: 'Zakładki inspektora',

  // Stany
  brakSelekcji: 'Zaznacz obiekt, aby zobaczyć szczegóły',
  brakWynikow: 'Brak wyników dla tego obiektu',
  brakDowodow: 'Brak dowodu dla tego obiektu',
  brakPowiazan: 'Brak powiązań dla tego obiektu',

  // Świeżość
  przelicz: 'Przelicz',
  aktualne: 'aktualne',

  // Powiązania — nagłówki kierunków
  powiazaniaWchodzace: 'Wchodzące',
  powiazaniaWychodzace: 'Wychodzące',

  // Dowód
  pokazDowod: 'Pokaż dowód',

  // Tryb ekspercki
  szczegolyTechniczne: 'Szczegóły techniczne',
} as const;

/** „nieaktualne (rew. {a} → {b})" — rozjazd rewizji danej pochodnej względem modelu. */
export function znacznikNieaktualne(rewizjaDanej: number, rewizjaModelu: number): string {
  return `nieaktualne (rew. ${rewizjaDanej} → ${rewizjaModelu})`;
}

/** „Pochodzenie: {zrodlo}" — dymek pochodzenia wartości. */
export function pochodzenieLabel(zrodlo: string): string {
  return `Pochodzenie: ${zrodlo}`;
}
