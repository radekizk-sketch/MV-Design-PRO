/*
 * Teksty przestrzeni „Schemat (SLD)" w ui2 (karta K4-E2) — wyłącznie polski
 * język techniczny (MODEL_INTERAKCJI §2.7). Centralizacja tekstu = jedno
 * źródło etykiet (testy importują wartości wprost), brak literałów w JSX.
 *
 * Karta K1 POWLOKA: baner „Następny krok" nad kanwą skasowany (powtarzał
 * gotowość, której jedynym miejscem w chromie jest pasek stanu; wejście
 * w wyniki niesie znacznik wyników paska projektu). Etykieta trybu pracy
 * zapisana zdaniem, bez wersalików (kontrakt UIUX przemysłowy §8).
 */

export const SCHEMAT_STRINGS = {
  // Tryb pracy kanwy (KD-4, luka L-1) — edycja vs podgląd tylko do odczytu
  trybEtykieta: 'Tryb pracy',
  trybEdycja: 'Edycja',
  trybPodglad: 'Podgląd',
  trybPodgladOpis: 'Kanwa zablokowana do odczytu — operacje edycyjne są odrzucane.',
} as const;
