/*
 * Teksty przestrzeni „Schemat (SLD)" w ui2 (karta K4-E2) — wyłącznie polski
 * język techniczny (MODEL_INTERAKCJI §2.7). Centralizacja tekstu = jedno
 * źródło etykiet (testy importują wartości wprost), brak literałów w JSX.
 */

export const SCHEMAT_STRINGS = {
  // Sekcja „Następny krok" (K4-E2: model niepusty → jawne przejście E2→E3)
  nastepnyKrokTytul: 'Następny krok',
  nastepnyKrokOpis:
    'Model zawiera elementy — bramka gotowości wskaże, czy układ jest kompletny do obliczeń.',
  nastepnyKrokAkcja: 'Sprawdź gotowość obliczeniową',

  // Tryb pracy kanwy (KD-4, luka L-1) — edycja vs podgląd tylko do odczytu
  trybEtykieta: 'TRYB PRACY',
  trybEdycja: 'Edycja',
  trybPodglad: 'Podgląd',
  trybPodgladOpis: 'Kanwa zablokowana do odczytu — operacje edycyjne są odrzucane.',
} as const;
