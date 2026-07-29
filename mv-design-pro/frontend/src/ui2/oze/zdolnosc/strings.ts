/*
 * Teksty i deterministyczne formatery okna „Zdolność przyłączeniowa" (karta P2 /
 * strumień OZE). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7); zero
 * literałów UI w JSX. Formatery CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule) — przecinek dziesiętny wg konwencji PL. Identyfikatory
 * (bus_ref, input_hash) tylko w trybie eksperckim; etykieta węzła = nazwa.
 *
 * Słownik PL rodzajów kontroli NIE jest tu powielany — reużyty importem
 * `rodzajKontroliPL` z okna „Jakość wyników" (karta §4: import, nie duplikat).
 */

export const ZDOLNOSC_STRINGS = {
  // Nagłówek okna
  tytul: 'Zdolność przyłączeniowa',
  opisWstep:
    'Ile jeszcze mocy czynnej OZE zmieści wskazany węzeł: deterministyczny przegląd '
    + 'scenariuszy rozpływu na modelu wybranego przebiegu.',

  // Parametry biegu
  paramKrok: 'Krok mocy',
  paramKrokOpis: 'Przyrost mocy próbnej między scenariuszami.',
  paramMaxKrokow: 'Maksymalna liczba kroków',
  paramMaxKrokowOpis: 'Górny limit scenariuszy (zakres badanej mocy = krok × liczba kroków).',
  paramWezly: 'Węzły-kandydaci',
  paramWezlyDomyslne: 'Bez wyboru: węzły z istniejącymi źródłami (domyślni kandydaci backendu).',
  przyciskOblicz: 'Oblicz zdolność przyłączeniową',
  przyciskPrzelicz: 'Przelicz',

  // Stany uczciwe
  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy, aby wyznaczyć zdolność przyłączeniową węzłów.',
  brakWyniku: 'Wybierz parametry i uruchom obliczenie',
  brakWynikuOpis:
    'Wskaż węzły-kandydatów (lub pozostaw puste dla domyślnych) i uruchom jawny bieg analizy.',
  ladowanie: 'Wyznaczanie zdolności przyłączeniowej…',
  blad: 'Nie udało się wyznaczyć zdolności przyłączeniowej',
  bladOpis: 'Spróbuj ponownie lub sprawdź, czy przebieg rozpływu został poprawnie zakończony.',
  brakWezlow: 'Brak węzłów-kandydatów w wyniku.',

  // Tabela per węzeł
  kolWezel: 'Węzeł',
  kolGeneracjaIstniejaca: 'Istniejąca generacja',
  kolMocPrzylaczalna: 'Maks. moc przyłączalna',
  kolKryterium: 'Kryterium wiążące',
  kolElement: 'Element wiążący',
  kolWartosc: 'Wartość',
  kolProg: 'Próg',
  kolDzialania: 'Działania',
  kolIdentyfikatorWezla: 'Identyfikator węzła',

  // Kryteria wiążące (kind bez szczegółów)
  kryteriumBrak: 'Brak — nie osiągnięto granicy w zadanym zakresie',
  kryteriumNiezbieznosc: 'Niezbieżność rozpływu',
  kryteriumNapiecie: 'Napięcie',
  kryteriumObciazenie: 'Obciążenie',

  // Wykres
  wykresTytul: 'Maksymalna moc przyłączalna per węzeł',
  wykresOsY: 'Moc przyłączalna',

  // Ślad scenariuszy
  sladTytul: 'Ślad scenariuszy',
  sladPokaz: 'Pokaż ślad scenariuszy',
  sladUkryj: 'Ukryj ślad scenariuszy',
  sladMocDodana: 'Moc dodana',
  sladDopuszczalny: 'Dopuszczalny',
  sladNiedopuszczalny: 'Niedopuszczalny',
  sladNiezbiezny: 'Niezbieżny',

  // Tryb ekspercki
  ekspIdentyfikatorSkrot: 'Identyfikator wejścia (skrót)',
  ekspPrzebieg: 'Identyfikator przebiegu',

  // Jednostki i wartości puste
  jednMW: 'MW',
  kreska: '—',
} as const;

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Moc [MW] — 3 miejsca po przecinku. */
export function fmtMW(n: number): string {
  return fmtLiczba(n, 3);
}

/** Wartość obserwowana (jednostka dowolna z backendu) — 3 miejsca po przecinku. */
export function fmtWartosc(n: number): string {
  return fmtLiczba(n, 3);
}
