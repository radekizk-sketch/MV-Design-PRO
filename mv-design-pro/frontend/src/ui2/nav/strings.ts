/*
 * Teksty drzewa kontekstowego (karta E1.2 §5) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Słownik V12K-026: „przypadek
 * obliczeniowy" / „kreator" dozwolone w ui2.
 */

export const NAV_STRINGS = {
  filtrProblemy: 'Filtruj: tylko z problemami',
  brakElementow: 'Brak elementów',
  brakWynikowFiltra: 'Brak elementów spełniających filtr',
  ladowanie: 'Wczytywanie…',

  // K6 / H-5: akcje pustego drzewa per przestrzeń (slot `akcjaPusty` był martwy).
  pustyModelAkcja: 'Przejdź do schematu',
  pustyObliczeniaAkcja: 'Nowy przypadek',
  pustyWynikiAkcja: 'Przejdź do przypadków',

  trybDrzewa: 'Tryb drzewa',
  trybZasilania: 'Zasilania',
  trybAdministracyjny: 'Administracyjny',
  trybObwodowy: 'Obwodowy',
} as const;

const TRYB_DRZEWA_LABELS = {
  zasilania: NAV_STRINGS.trybZasilania,
  administracyjny: NAV_STRINGS.trybAdministracyjny,
  obwodowy: NAV_STRINGS.trybObwodowy,
} as const;

export function trybDrzewaLabel(tryb: keyof typeof TRYB_DRZEWA_LABELS): string {
  return TRYB_DRZEWA_LABELS[tryb];
}

/** „Blokady: {n}, ostrzeżenia: {m}" — treść dymka licznika (§5). */
export function licznikTitle(blokady: number, ostrzezenia: number): string {
  return `Blokady: ${blokady}, ostrzeżenia: ${ostrzezenia}`;
}
