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

  // S9-3 / W-6: po zakończonym biegu podpowiedź NIE może dalej odsyłać do
  // bramki gotowości — obliczenia właśnie się wykonały. Zdanie mówi FAKT o
  // przebiegu (bieg się zakończył wynikiem) i NIE orzeka o świeżości wyniku:
  // świeżość ma jedno źródło (chip paska przypadku), a druga ocena w tym samym
  // ekranie byłaby kolejnym rozjazdem wskaźników (W-5).
  nastepnyKrokPoBieguOpis:
    'Ostatni bieg zakończył się wynikiem — obejrzyj wartości i dowód obliczeń.',
  nastepnyKrokPoBieguAkcja: 'Otwórz wyniki i dowody',

  // Tryb pracy kanwy (KD-4, luka L-1) — edycja vs podgląd tylko do odczytu
  trybEtykieta: 'TRYB PRACY',
  trybEdycja: 'Edycja',
  trybPodglad: 'Podgląd',
  trybPodgladOpis: 'Kanwa zablokowana do odczytu — operacje edycyjne są odrzucane.',
} as const;
