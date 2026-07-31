/**
 * Teksty PL okna „Scenariusze zwarciowe" w powłoce ui2 (karta KD-4, luka L-7).
 * Etykiety wielkości i rodzajów zwarć pochodzą z kontraktu domeny
 * (`ui/fault-scenarios/types.ts`) — tutaj wyłącznie język ekranu.
 */

export const SCENARIUSZE_STRINGS = {
  tytul: 'Scenariusze zwarciowe',
  cel: 'Zdefiniuj punkty i rodzaje zwarć do policzenia w tym przypadku, potem uruchom je stąd.',

  brakPrzypadku: 'Bez aktywnego przypadku obliczeniowego nie ma gdzie zapisać scenariusza.',
  brakPrzypadkuAkcja: 'Wybierz przypadek na liście powyżej',
  brakScenariuszy:
    'Ten przypadek nie ma jeszcze scenariuszy — dodaj pierwszy, żeby policzyć zwarcie w wybranym punkcie.',
  ladowanie: 'Wczytywanie scenariuszy…',

  dodaj: 'Dodaj scenariusz',
  anuluj: 'Anuluj',
  zapisz: 'Zapisz scenariusz',
  uruchom: 'Uruchom',
  usun: 'Usuń',
  usunPotwierdz: 'Potwierdź usunięcie',

  polaNazwa: 'Nazwa scenariusza',
  polaRodzaj: 'Rodzaj zwarcia',
  polaElement: 'Element (ref z modelu)',
  polaRodzajMiejsca: 'Rodzaj miejsca',
  polaPozycja: 'Pozycja na odcinku (0–1)',
  polaTryb: 'Tryb zwarcia',
  polaRezystancja: 'R zwarcia [Ω]',
  polaReaktancja: 'X zwarcia [Ω]',
  polaWspolczynnikC: 'Współczynnik napięciowy c',
  polaCzasCieplny: 'Czas cieplny [s]',
  polaWklady: 'Licz wkłady gałęziowe',

  kolNazwa: 'Scenariusz',
  kolRodzaj: 'Rodzaj',
  kolMiejsce: 'Miejsce zwarcia',
  kolAkcje: 'Akcje',

  uruchomiono: 'Uruchomiono obliczenie scenariusza',
  bladFormularza: 'Uzupełnij nazwę i element, w którym ma wystąpić zwarcie.',
} as const;
