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
  uruchomWToku: 'Obliczanie…',
  usun: 'Usuń',
  usunPotwierdz: 'Potwierdź usunięcie',
  // Karta TB-WARTOSC-ROBOCZA: zmiana t_b istniejącego scenariusza (także z akcji „Zmień
  // wartość" ekranu wyników zwarć).
  zmianaTb: 'Zmień $t_b$',
  zmianaTbZapisz: 'Zapisz $t_b$',
  zmianaTbZapisano: 'Zapisano czas wyłączenia $t_b$ — uruchom scenariusz, aby przeliczyć',
  zmianaTbScenariuszaBrak:
    'Scenariusz, z którego powstał oglądany bieg, nie istnieje już w tym przypadku — podaj $t_b$ w nowym scenariuszu.',

  polaNazwa: 'Nazwa scenariusza',
  polaRodzaj: 'Rodzaj zwarcia',
  polaElement: 'Element (ref z modelu)',
  polaRodzajMiejsca: 'Rodzaj miejsca',
  polaPozycja: 'Pozycja na odcinku (0–1)',
  polaTryb: 'Tryb zwarcia',
  polaRezystancja: 'Rezystancja przejścia $R_f$ [Ω]',
  polaReaktancja: 'Reaktancja przejścia $X_f$ [Ω]',
  polaCzasCieplny: 'Czas trwania zwarcia $t_k$ [s]',
  polaCzasWylaczenia: 'Czas wyłączenia $t_b$ [s]',
  polaCzasWylaczeniaPodpowiedz:
    'Najkrótszy czas zadziałania zabezpieczenia + czas własny wyłącznika. Puste = $t_b$ w każdym punkcie zwarcia z pól przy jego szynie (nastawy + czas własny wyłącznika), a bez nich wartość robocza z oznaczeniem w wynikach.',
  kolCzasWylaczenia: 'Czas wyłączenia $t_b$',
  polaWklady: 'Licz wkłady gałęziowe',

  kolNazwa: 'Scenariusz',
  kolRodzaj: 'Rodzaj',
  kolMiejsce: 'Miejsce zwarcia',
  kolWspolczynnikC: 'Współczynnik c',
  kolAkcje: 'Akcje',

  uruchomiono: 'Obliczono scenariusz (wyniki w przestrzeni „Wyniki i dowody")',
  bladFormularza: 'Uzupełnij nazwę i element, w którym ma wystąpić zwarcie.',
} as const;
