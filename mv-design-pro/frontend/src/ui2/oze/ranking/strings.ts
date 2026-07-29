/*
 * Teksty i deterministyczne formatery okna „Ranking punktów przyłączenia"
 * (strumień OZE). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7); zero
 * literałów UI w JSX. Formatery CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule) — przecinek dziesiętny wg konwencji PL. Identyfikatory
 * (bus_ref, przebieg) tylko w trybie eksperckim; etykieta węzła = nazwa.
 *
 * Słownik PL rodzajów kryterium NIE jest tu powielany — reużyty importem
 * `rodzajKryteriumPL` z okna „Zdolność przyłączeniowa" (nie duplikat).
 */

export const RANKING_STRINGS = {
  // Nagłówek okna
  tytul: 'Ranking punktów przyłączenia',
  opisWstep:
    'Jeden bieg zdolności przyłączeniowej dla wielu węzłów-kandydatów, uszeregowany '
    + 'malejąco po maksymalnej mocy przyłączalnej. Wartości pochodzą z backendu.',

  // Parametry biegu
  paramKrok: 'Krok mocy',
  paramKrokOpis: 'Przyrost mocy próbnej między scenariuszami.',
  paramMaxKrokow: 'Maksymalna liczba kroków',
  paramMaxKrokowOpis: 'Górny limit scenariuszy (zakres badanej mocy = krok × liczba kroków).',
  paramWezly: 'Węzły-kandydaci',
  paramWezlyDomyslne: 'Bez wyboru: węzły z istniejącymi źródłami (domyślni kandydaci backendu).',
  paramOperator: 'Operator sieci (klasy NC RfG)',
  paramOperatorOpis: 'Progi klas A/B/C/D odczytane z katalogu wybranego operatora.',
  przyciskOblicz: 'Zbuduj ranking przyłączeń',
  przyciskPrzelicz: 'Przelicz ranking',

  // Stany uczciwe
  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy, aby zbudować ranking punktów przyłączenia.',
  brakWyniku: 'Wybierz parametry i zbuduj ranking',
  brakWynikuOpis:
    'Wskaż węzły-kandydatów (lub pozostaw puste dla domyślnych) i uruchom jawny bieg analizy.',
  ladowanie: 'Budowanie rankingu punktów przyłączenia…',
  blad: 'Nie udało się zbudować rankingu punktów przyłączenia',
  bladOpis: 'Spróbuj ponownie lub sprawdź, czy przebieg rozpływu został poprawnie zakończony.',
  brakWezlow: 'Brak węzłów-kandydatów w wyniku.',

  // Nazwa analizy (nagłówek wzorca) + kolumny tabeli
  analizaPL: 'Ranking punktów przyłączenia',
  kolWezel: 'Węzeł',
  kolIdentyfikator: 'Identyfikator węzła',
  kolMoc: 'Maks. moc przyłączalna',
  kolKryterium: 'Kryterium wiążące',
  kolStraty: 'Przyrost strat przy mocy granicznej',
  kolNapiecia: 'Skrajne napięcia przy granicy',
  kolKlasa: 'Klasa NC RfG',

  // Założenia biegu (część wyniku)
  zalKrok: 'Krok mocy',
  zalMaxKrokow: 'Maksymalna liczba kroków',
  zalOperator: 'Operator sieci',
  zalLiczbaWezlow: 'Liczba węzłów w rankingu',
  zalKlasaUwaga: 'Klasa NC RfG: mapowanie słownikowe z progów katalogu operatora (nie ocena).',
  zalStratyUwaga:
    'Przyrost strat: różnica strat scenariusza granicznego i bazowego (arytmetyka prezentacji).',

  // Szczegół wybranego węzła
  szczegolTytul: 'Szczegół węzła',
  szczegolMoc: 'Maks. moc przyłączalna',
  szczegolKryterium: 'Kryterium wiążące',
  szczegolStraty: 'Przyrost strat przy mocy granicznej',
  szczegolNapiecia: 'Skrajne napięcia przy granicy (min / maks)',
  szczegolKlasa: 'Klasa modułu NC RfG',
  szczegolBrakWyboru: 'Wskaż wiersz w rankingu, aby zobaczyć ślad scenariuszy węzła.',

  // Ślad scenariuszy (reużycie etykiet statusu z okna „Zdolność przyłączeniowa")
  sladTytul: 'Ślad scenariuszy',
  sladMocKolumna: 'Moc dodana',

  // Tryb ekspercki
  ekspIdentyfikatorSkrot: 'Identyfikator wejścia (hash)',
  ekspPrzebieg: 'Identyfikator przebiegu',

  // Jednostki i wartości puste
  jednMW: 'MW',
  jednKW: 'kW',
  jednPU: 'p.u.',
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
export function fmtMocMW(n: number): string {
  return fmtLiczba(n, 3);
}

/** Przyrost strat [kW] — 3 miejsca po przecinku (zachowuje znak). */
export function fmtStratyKw(n: number): string {
  return fmtLiczba(n, 3);
}

/** Napięcie [p.u.] — 3 miejsca po przecinku. */
export function fmtNapiecie(n: number): string {
  return fmtLiczba(n, 3);
}

/** Para skrajnych napięć „min / maks" [p.u.] jako pojedynczy łańcuch prezentacji. */
export function fmtNapieciaPara(min: number, max: number): string {
  return `${fmtNapiecie(min)} / ${fmtNapiecie(max)}`;
}
