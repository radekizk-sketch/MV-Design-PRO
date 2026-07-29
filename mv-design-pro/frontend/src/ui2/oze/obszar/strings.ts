/*
 * Teksty i deterministyczne formatery okna „Obszar bezpiecznej pracy P–Q" (karta
 * P30 / strumień OZE). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7);
 * zero literałów UI w JSX. Formatery CZYSTE (wejście→wyjście), bez `Date.now`/
 * losowości (Determinism Rule) — przecinek dziesiętny wg konwencji PL.
 * Identyfikatory (bus_ref, input_hash) tylko w trybie eksperckim; nazwa węzła na
 * pierwszym planie. Nazwy sufiksowane `Obszar`, bo barrel OZE robi `export *`
 * (kolizje nazw, TS2308).
 *
 * Słownik PL rodzajów kontroli NIE jest tu powielany — reużyty importem
 * `rodzajKontroliPL` z okna „Jakość wyników" (karta §2: import bezpośredni).
 */

export const OBSZAR_STRINGS = {
  // Nagłówek okna
  tytul: 'Obszar bezpiecznej pracy P–Q',
  opisWstep:
    'W jakim zakresie mocy czynnej i biernej może pracować źródło we wskazanym węźle '
    + 'bez naruszania kryteriów sieciowych: deterministyczna siatka scenariuszy rozpływu.',

  // Parametry biegu
  paramWezel: 'Węzeł',
  paramWezelOpis: 'Węzeł, dla którego wyznaczana jest zdolność pracy P–Q.',
  paramWezelWybierz: '— wybierz węzeł —',
  paramStepP: 'Krok mocy czynnej',
  paramStepPOpis: 'Przyrost mocy czynnej P między wierszami siatki.',
  paramStepQ: 'Krok mocy biernej',
  paramStepQOpis: 'Przyrost mocy biernej Q skanowanej od środka ($Q = 0$) na zewnątrz.',
  paramMaxP: 'Maksymalna liczba kroków P',
  paramMaxPOpis: 'Górny limit wierszy siatki (zakres P = krok × liczba kroków).',
  paramMaxQ: 'Maksymalna liczba kroków Q',
  paramMaxQOpis: 'Górny limit kroków Q na kierunek (zakres ±Q = krok × liczba kroków).',
  paramNakladka: 'Nakładka krzywej producenta',
  paramNakladkaOpis: 'Opcjonalnie: typ falownika z katalogu — jego krzywa zdolności P–Q.',
  paramNakladkaBrak: '— bez nakładki —',
  przyciskOblicz: 'Wyznacz obszar P–Q',
  przyciskPrzelicz: 'Przelicz',

  // Stany uczciwe
  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy, aby wyznaczyć obszar bezpiecznej pracy P–Q węzła.',
  brakWezla: 'Wskaż węzeł, następnie uruchom obliczenie',
  brakWezlaOpis: 'Jawny bieg wyznaczy dopuszczalne pasmo mocy biernej Q w funkcji mocy czynnej P.',
  ladowanie: 'Wyznaczanie obszaru bezpiecznej pracy P–Q…',
  blad: 'Nie udało się wyznaczyć obszaru bezpiecznej pracy P–Q',
  ladowanieKatalogu: 'Wczytywanie katalogu typów falowników…',
  bladKatalogu: 'Nie udało się wczytać katalogu typów falowników',
  brakWierzcholkow: 'Siatka nie zwróciła żadnego wierzchołka obszaru.',

  // Tabela wierzchołków
  kolMoc: 'Moc czynna P',
  kolQMin: 'Q dop. min',
  kolQMax: 'Q dop. max',
  kolGranicaDol: 'Granica dolna (Q min)',
  kolGranicaGor: 'Granica górna (Q max)',
  kolStatus: 'Status',
  tagPasmo: 'Pasmo pracy',
  tagBrakPasma: 'Brak pasma',

  // Kryteria wiążące (kind bez szczegółów)
  granicaBrak: 'Brak — nie osiągnięto granicy w zadanym zakresie',
  granicaNiezbieznosc: 'Niezbieżność rozpływu',
  granicaNapiecie: 'Napięcie',
  granicaObciazenie: 'Obciążenie',
  prog: 'próg',
  rozdzielaczGranicy: ' · ',
  rozdzielaczPasma: ' … ',

  // Wykres
  wykresTytul: 'Obszar bezpiecznej pracy P–Q — dopuszczalne pasmo Q(P)',
  wykresOsX: 'Moc czynna P',
  wykresOsY: 'Moc bierna Q',
  legendaQMax: 'Sieć: Q dop. max',
  legendaQMin: 'Sieć: Q dop. min',
  legendaProdMax: 'Producent: Q max',
  legendaProdMin: 'Producent: Q min',

  // Założenia (część wyniku)
  zalozeniaTytul: 'Założenia',
  zalWezel: 'Węzeł',
  zalGeneracja: 'Istniejąca generacja (P / Q)',
  zalStepP: 'Krok mocy czynnej',
  zalStepQ: 'Krok mocy biernej',
  zalMaxP: 'Maks. liczba kroków P',
  zalMaxQ: 'Maks. liczba kroków Q',
  zalBiegi: 'Liczba biegów rozpływu (wykonane / górny limit)',
  zalIdentyfikatorSkrot: 'Identyfikator wejścia (hash)',
  zalPrzebieg: 'Identyfikator przebiegu',

  // Ślad WHITE BOX (zredukowany)
  sladTytul: 'Ślad siatki scenariuszy (WHITE BOX)',
  sladPokaz: 'Pokaż ślad siatki',
  sladUkryj: 'Ukryj ślad siatki',
  sladSymbolSiatka: 'siatka',
  sladWzorSiatka:
    'total_runs = suma biegow po wierszach P; '
    + 'max_total_runs = (max_steps_p + 1) * (1 + 2 * max_steps_q)',
  sladWzorWiersz:
    'skan Q od 0 w obu kierunkach krokiem step_q do pierwszego scenariusza niedopuszczalnego',
  sladBiegi: 'biegi',
  sladPasmo: 'pasmo Q',
  sladBrakPasma: 'brak pasma pracy (Q = 0 niedopuszczalne)',

  // K5-B (H-3 pkt 3): akcja wyjściowa — zapis ograniczeń Q generatora
  // (`GenLimits.q_min/q_max`) operacją `update_element_parameters`.
  limityTytul: 'Zapisz ograniczenia Q modułu wytwórczego',
  limityOpis:
    'Wyznaczone pasmo Q trafia do ograniczeń generatora w modelu sieci '
    + '(GenLimits.q_min/q_max) — czytają je rozpływ mocy i oceny zgodności.',
  limityGenerator: 'Moduł wytwórczy w tym węźle',
  limityBrakGeneratorow:
    'W analizowanym węźle nie ma modułu wytwórczego — ograniczenia Q nie mają '
    + 'gdzie spłynąć. Przyłącz źródło w tym węźle i wróć do zapisu.',
  limityQMin: 'Q min',
  limityQMax: 'Q max',
  limityZapisz: 'Zapisz ograniczenia Q do modelu',
  limityBrakPrzypadku:
    'Brak aktywnego przypadku obliczeniowego — zapis do modelu niemożliwy.',
  limityBrakWartosci: 'Podaj obie wartości ograniczeń Q (min i max).',
  limityZapisano: 'Ograniczenia Q zapisane w modelu sieci',
  limityBladZapisu: 'Nie udało się zapisać ograniczeń Q w modelu sieci',

  // Jednostki i wartości puste
  jednMW: 'MW',
  jednMvar: 'Mvar',
  kreska: '—',
} as const;

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczbaObszar(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Moc czynna [MW] — 3 miejsca po przecinku. */
export function fmtMWObszar(n: number): string {
  return fmtLiczbaObszar(n, 3);
}

/** Moc bierna [Mvar] — 3 miejsca po przecinku. */
export function fmtMvarObszar(n: number): string {
  return fmtLiczbaObszar(n, 3);
}

/** Wartość obserwowana kryterium (jednostka dowolna z backendu) — 3 miejsca. */
export function fmtWartoscObszar(n: number): string {
  return fmtLiczbaObszar(n, 3);
}
