/*
 * Etykiety okna „Kontyngencje N-1" — wyłącznie polskie, bez kodenamów
 * projektowych i bez surowych kodów kontraktu na ekranie. Kody wewnętrzne
 * (`status`, `element_kind`, `check_type`) mapowane na język projektanta TUTAJ
 * (warstwa prezentacji). Nieznany kod pokazuje się SUROWO — uczciwość zamiast
 * zgadywania; zbiory kodów są ZAMKNIĘTE kontraktem backendu i przypięte testem
 * (`__tests__/strings.test.ts`), więc nowy kod bez etykiety zapala czerwień.
 */

export const KONTYNGENCJE_STRINGS = {
  tytul: 'Kontyngencje N-1',
  opisWstep:
    'Czy sieć zniesie wyłączenie dowolnego pojedynczego elementu — dla każdego '
    + 'wskazanego odcinka i transformatora liczony jest osobny rozpływ bez tego '
    + 'elementu, a skutki zestawione w ranking dotkliwości.',

  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy.',
  brakPrzebieguOpis:
    'Enumeracja N-1 wychodzi od stanu bazowego sieci, więc potrzebuje zakończonego '
    + 'rozpływu. Uruchom obliczenie rozpływu, aby wskazać zakres kontyngencji.',
  ladowanieZakresu: 'Wczytywanie zakresu kontyngencji…',
  bladZakresu: 'Nie udało się pobrać zakresu kontyngencji.',
  bladZakresuOpis: 'Spróbuj ponownie; jeśli błąd wraca, sprawdź dziennik backendu.',
  liczenie: 'Liczenie kontyngencji…',
  liczenieOpis:
    'Każda kontyngencja to osobny bieg rozpływu — okno czeka na komplet wyników.',
  bladMacierzy: 'Nie udało się policzyć macierzy kontyngencji.',
  bladMacierzyOpis: 'Spróbuj ponownie; jeśli błąd wraca, sprawdź dziennik backendu.',

  // Zakres biegu -----------------------------------------------------------
  zakresTytul: 'Zakres enumeracji',
  zakresOpis:
    'Każda kontyngencja to osobny bieg rozpływu, więc komplet dla dużej sieci trwa. '
    + 'Wybierz zakres sam — lista NIE jest skracana automatycznie, bo kontyngencja '
    + 'pominięta bez Twojej decyzji to naruszenie, o którym nikt się nie dowie.',
  trybPelny: 'Wszystkie elementy',
  trybPelnyOpis: 'Liczy komplet kwalifikowanych elementów modelu.',
  trybWybrane: 'Wybrane elementy',
  trybWybraneOpis: 'Liczy wyłącznie zaznaczone elementy — szybciej, ale węższy obraz.',
  kosztPelny: 'Do policzenia w biegu pełnym',
  kosztPelnyJedn: 'kontyngencji',
  kosztBiegow: 'w tym biegów rozpływu',
  kosztWykluczone: 'rozstrzygniętych bez biegu',
  kosztWybrane: 'Do policzenia z zaznaczenia',
  bezCzasuUwaga:
    'Czasu biegu okno nie podaje — kontrakt nie niesie pomiaru dla tego modelu, '
    + 'a przeliczanie pomiaru z innej sieci byłoby liczbą zmyśloną.',
  zaznaczWszystkie: 'Zaznacz wszystkie',
  odznaczWszystkie: 'Odznacz wszystkie',
  policz: 'Policz kontyngencje',
  policzOpis: 'Uruchamia enumerację N-1 dla wybranego zakresu na zakończonym przebiegu rozpływu.',
  policzPustyZakres: 'Zaznacz co najmniej jeden element, aby policzyć kontyngencje.',
  kolumnaWybor: 'Wybór',
  kolumnaElement: 'Element',
  kolumnaRodzaj: 'Rodzaj',
  wykluczonyZnacznik: 'wykluczony',

  // Przypadek bazowy -------------------------------------------------------
  bazowyTytul: 'Przypadek bazowy (N-0)',
  bazowyOpis:
    'Stan sieci BEZ wyłączeń, liczony tą samą ścieżką co kontyngencje. Naruszenia '
    + 'widoczne już tutaj nie są skutkiem żadnej kontyngencji — bez tego odniesienia '
    + 'ranking N-1 czytałoby się jak listę nowych problemów.',
  bazowyBezNaruszen: 'Stan bazowy bez naruszeń ocenianych kryteriów.',

  // Ranking ----------------------------------------------------------------
  rankingTytul: 'Ranking dotkliwości',
  rankingPusty: 'Żadna kontyngencja nie została rozstrzygnięta — patrz sekcja poniżej.',
  kolPozycja: 'Poz.',
  kolElement: 'Wyłączony element',
  kolRodzaj: 'Rodzaj',
  kolOdbiory: 'Odbiory bez zasilania',
  kolMocOdciazona: 'Moc odciążona',
  kolPrzeciazenia: 'Przeciążenia',
  kolNapiecia: 'Naruszenia napięcia',
  kolPominiete: 'Kryteria pominięte',
  kolIdentyfikator: 'Identyfikator elementu',
  jednMw: 'MW',

  // Szczegóły --------------------------------------------------------------
  szczegolyTytul: 'Skutki wyłączenia',
  szczegolyWskaz: 'Wybierz kontyngencję z rankingu, aby zobaczyć jej skutki.',
  sekcjaPrzeciazenia: 'Przeciążone elementy',
  sekcjaNapiecia: 'Szyny poza pasmem napięcia',
  sekcjaOdbiory: 'Odbiory bez zasilania',
  sekcjaSzyny: 'Szyny bez zasilania',
  sekcjaPominiete: 'Kryteria pominięte (brak danej)',
  sekcjaPominieteOpis:
    'Brak danej nie jest wynikiem: te kryteria nie zostały policzone i nie wchodzą '
    + 'do dotkliwości ani do „w normie".',
  sekcjaSlad: 'Ślad biegu',
  sladMechanizm: 'Wariant wejścia',
  sladMetoda: 'Metoda rozwiązania',
  sladIteracje: 'Iteracje',
  sladWyspa: 'Szyny zasilane',
  sladWezelBilansujacy: 'Węzeł bilansujący',
  brakPozycji: 'Brak pozycji w tej kategorii.',

  // Nierozstrzygnięte ------------------------------------------------------
  nierozstrzygnieteTytul: 'Nierozstrzygnięte',
  nierozstrzygnieteOpis:
    'Kontyngencje bez porównywalnych liczników — nie wchodzą do rankingu, bo nie ma '
    + 'czego w nim porównać. Powód podany wprost przy każdej pozycji.',

  // Kryteria ---------------------------------------------------------------
  kryteriaTytul: 'Kryteria oceny',
  kryteriaObciazenie: 'Obciążenie',
  kryteriaNapiecie: 'Napięcie',
  kryteriaZasilanie: 'Zasilanie',
  kryteriaRanking: 'Ranking',
  kryteriaPozaZakresem: 'Poza zakresem oceny',

  kreska: '—',
  jednProcent: '%',
} as const;

/** Etykiety statusu kontyngencji — zbiór ZAMKNIĘTY kontraktem backendu. */
export const STATUSY_PL: Readonly<Record<string, string>> = {
  zbiegl: 'Policzona',
  niezbiegl: 'Bieg niezbieżny',
  wykluczony: 'Wykluczona',
};

/** Etykiety rodzaju elementu — zbiór ZAMKNIĘTY kwalifikacją backendu. */
export const RODZAJE_PL: Readonly<Record<string, string>> = {
  line_overhead: 'Linia napowietrzna',
  cable: 'Kabel',
  transformer: 'Transformator',
};

/** Etykiety ocenianych kryteriów — zbiór ZAMKNIĘTY listą `ocenione_kategorie`. */
export const KRYTERIA_PL: Readonly<Record<string, string>> = {
  BRANCH_LOADING: 'Obciążenie gałęzi',
  TRANSFORMER_LOADING: 'Obciążenie transformatora',
  VOLTAGE_DEVIATION: 'Odchylenie napięcia',
};

/** Etykieta kodu; nieznany kod SUROWO (nie zgadujemy, czego nie znamy). */
function etykieta(mapa: Readonly<Record<string, string>>, kod: string): string {
  return mapa[kod] ?? kod;
}

export function etykietaStatusu(kod: string): string {
  return etykieta(STATUSY_PL, kod);
}

export function etykietaRodzaju(kod: string): string {
  return etykieta(RODZAJE_PL, kod);
}

export function etykietaKryterium(kod: string): string {
  return etykieta(KRYTERIA_PL, kod);
}

/** Nazwa elementu dla czytelnika; bez nazwy — identyfikator (zero zmyślania). */
export function nazwaElementu(nazwa: string | null, ref: string): string {
  return nazwa ?? ref;
}

/**
 * Formatowanie liczbowe: separator dziesiętny PL, stała liczba miejsc.
 * `null` → „—" (brak liczby to brak liczby, nie zero).
 */
export function fmtLiczba(wartosc: number | null, miejsca = 2): string {
  if (wartosc === null || Number.isNaN(wartosc)) return KONTYNGENCJE_STRINGS.kreska;
  return wartosc.toFixed(miejsca).replace('.', ',');
}

/** Licznik kategorii: `null` = NIE policzono (a nie zero). */
export function fmtLicznik(wartosc: number | null): string {
  return wartosc === null ? KONTYNGENCJE_STRINGS.kreska : String(wartosc);
}
