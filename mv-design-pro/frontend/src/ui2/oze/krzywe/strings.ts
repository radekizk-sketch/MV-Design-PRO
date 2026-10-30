/*
 * Teksty i deterministyczne formatery okna „Krzywe zdolności P–Q" (karta P41 /
 * strumień OZE). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7); zero
 * literałów UI w JSX. Formatery CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule) — przecinek dziesiętny wg konwencji PL. Identyfikatory
 * (catalog_item_id, operator_id) tylko w trybie eksperckim; nazwy PL na pierwszym
 * planie. Nazwy sufiksowane `PQ`, bo barrel OZE robi `export *` (kolizje).
 */

export const KRZYWE_STRINGS = {
  // Nagłówek okna
  tytul: 'Krzywe zdolności P–Q',
  opisWstep:
    'Porównanie krzywej zdolności P–Q producenta z prostokątnym wymaganiem zakresu '
    + 'mocy biernej operatora OSD (NC RfG) — punkt po punkcie, z jawnym śladem obliczeń.',

  // Dobór typu i operatora
  wyborTyp: 'Typ falownika (katalog)',
  wyborTypPodpowiedz: 'Wybierz typ przekształtnika z krzywą zdolności producenta.',
  wyborOperator: 'Operator OSD (NC RfG)',
  wyborOperatorPodpowiedz: 'Wybierz operatora — źródło wymagania zakresu mocy biernej.',
  brakKrzywej: 'brak krzywej producenta',
  opcjaWybierz: '— wybierz —',
  przyciskOblicz: 'Sprawdź pokrycie P–Q',
  przyciskPrzelicz: 'Przelicz',

  // Stany uczciwe
  ladowanieKatalogu: 'Wczytywanie katalogu typów i operatorów…',
  bladKatalogu: 'Nie udało się wczytać katalogu typów lub operatorów',
  brakWyniku: 'Wybierz typ i operatora, następnie uruchom sprawdzenie',
  brakWynikuOpis: 'Jawny bieg pobierze pokrycie krzywej P–Q wymaganiem operatora.',
  ladowanie: 'Sprawdzanie pokrycia krzywej P–Q…',
  blad: 'Nie udało się sprawdzić pokrycia P–Q',

  // Założenia (część wyniku)
  zalozeniaTyp: 'Typ falownika',
  zalozeniaOperator: 'Operator OSD',
  zalozeniaPn: 'Moc odniesienia $P_{n}$',
  zalozeniaSn: 'Moc pozorna $S_{n}$',
  zalozeniaUdzialQ: 'Wymagany udział Q (± $P_{n}$)',
  zalozeniaWymaganie: 'Wymagane pasmo Q',
  zalozeniaLiczbaPunktow: 'Liczba punktów krzywej',

  // Tabela punktów
  kolMoc: 'Moc czynna',
  kolPasmoProducenta: 'Pasmo producenta',
  kolWymaganie: 'Wymaganie operatora',
  kolZapasDolny: 'Zapas dolny',
  kolZapasGorny: 'Zapas górny',
  kolMargines: 'Zapas punktu (mniejszy)',

  // Wykres
  wykresTytul: 'Krzywa zdolności P–Q — pasmo producenta i wymaganie operatora',
  wykresOsX: 'Moc czynna P',
  wykresOsY: 'Moc bierna Q',
  legendaQMax: 'Producent $Q_{\\max}$ (indukcyjna)',
  legendaQMin: 'Producent $Q_{\\min}$ (pojemnościowa)',
  legendaWymMax: 'Wymaganie $Q_{\\max}$',
  legendaWymMin: 'Wymaganie $Q_{\\min}$',

  // Ślad WHITE BOX
  sladTytul: 'Ślad weryfikacji (pełna jawność obliczeń)',
  sladPokaz: 'Pokaż ślad weryfikacji',
  sladUkryj: 'Ukryj ślad weryfikacji',
  sladSymbolWymaganie: 'wymaganie',
  sladSymbolPokrycie: 'pokrycie',

  // Tryb ekspercki
  ekspTypId: 'Identyfikator typu katalogowego',
  ekspOperatorId: 'Identyfikator operatora',

  // K5-B (H-3 pkt 2): akcja wyjściowa — przypisanie krzywych zgodności do
  // wiązań modułu DER (PATCH .../generators/{ref}/bindings).
  wiazaniaTytul: 'Przypisz krzywe zgodności do modułu wytwórczego',
  wiazaniaOpis:
    'Wybrane krzywe trafiają do wiązań modułu w modelu sieci (profile zgodności) — '
    + 'czytają je osie gotowości FRT/HVRT i macierz wymogów NC RfG.',
  wiazaniaModul: 'Moduł wytwórczy (DER)',
  wiazaniaModulPodpowiedz: 'Moduł z modelu sieci, do którego trafią wybrane krzywe.',
  wiazaniaBrakModulow:
    'Brak modułów wytwórczych w modelu — dodaj źródło OZE, aby przypisać krzywe.',
  wiazaniaKrzywaPf: 'Charakterystyka P(f)',
  wiazaniaKrzywaLvrt: 'Krzywa LVRT',
  wiazaniaKrzywaHvrt: 'Krzywa HVRT',
  // Karta FAB-J: backend niesie JEDNĄ krzywą ride-through na operatora NC RfG
  // (nie katalog wariantów) — LVRT/HVRT są tu read-only, wywiedzione z profilu
  // już przypisanego modułowi, nie niezależnym wyborem.
  wiazaniaBrakProfiluOperatora:
    'Moduł nie ma jeszcze przypisanego profilu operatora NC RfG — krzywa LVRT/HVRT nieznana.',
  wiazaniaKrzyweWczytywanie: 'Trwa odczyt katalogu profili operatorów NC RfG…',
  wiazaniaKrzyweBlad:
    'Odczyt katalogu profili operatorów nie powiódł się — krzywa LVRT/HVRT modułu nieznana ' +
    '(to nie jest brak profilu).',
  wiazaniaProfilSpozaKatalogu:
    'Profil operatora przypisany modułowi nie występuje w katalogu NC RfG — krzywa LVRT/HVRT ' +
    'nieznana; przypisz profil z katalogu w kreatorze modułu.',
  wiazaniaBladKatalogu: 'Nie udało się wczytać katalogu krzywych i profili operatorów',
  wiazaniaBezZmiany: '— bez zmiany —',
  wiazaniaZapisz: 'Zapisz krzywe w wiązaniach modułu',
  wiazaniaZadnaZmiana: 'Wybierz krzywą P(f) do zapisania.',
  wiazaniaBrakKontekstu:
    'Wybierz projekt i przypadek obliczeniowy, aby zapisać wiązania w modelu.',
  wiazaniaZapisano: 'Krzywe zapisane w wiązaniach modułu wytwórczego',
  wiazaniaBladZapisu: 'Nie udało się zapisać wiązań modułu w modelu sieci',

  // Jednostki i wartości puste
  jednMW: 'MW',
  jednMvar: 'Mvar',
  jednPct: '%',
  kreska: '—',
  rozdzielaczPasma: ' … ',
} as const;

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczbaPQ(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Moc czynna [MW] — 3 miejsca po przecinku. */
export function fmtMWPQ(n: number): string {
  return fmtLiczbaPQ(n, 3);
}

/** Moc bierna [Mvar] — 3 miejsca po przecinku. */
export function fmtMvarPQ(n: number): string {
  return fmtLiczbaPQ(n, 3);
}

/** Udział Q jako procent Pn (ułamek → %, np. 0,33 → „33,0"). */
export function fmtPctPQ(ulamek: number): string {
  return fmtLiczbaPQ(ulamek * 100, 1);
}
