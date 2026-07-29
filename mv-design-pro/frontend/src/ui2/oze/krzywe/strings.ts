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
  typBezKrzywej: 'Wybrany typ nie ma krzywej producenta',
  typBezKrzywejOpis:
    'Weryfikacja pokrycia P–Q wymaga krzywej zdolności producenta. Wskaż typ '
    + 'z krzywą (na liście oznaczone bez adnotacji „brak krzywej producenta").',
  brakWyniku: 'Wybierz typ i operatora, następnie uruchom sprawdzenie',
  brakWynikuOpis: 'Jawny bieg pobierze pokrycie krzywej P–Q wymaganiem operatora.',
  ladowanie: 'Sprawdzanie pokrycia krzywej P–Q…',
  blad: 'Nie udało się sprawdzić pokrycia P–Q',

  // Werdykt
  werdyktPokryte: 'Krzywa producenta pokrywa wymaganie operatora',
  werdyktNiepokryte: 'Krzywa producenta NIE pokrywa wymagania operatora',

  // Założenia (część wyniku)
  zalozeniaTyp: 'Typ falownika',
  zalozeniaOperator: 'Operator OSD',
  zalozeniaPn: 'Moc odniesienia Pn',
  zalozeniaSn: 'Moc pozorna Sn',
  zalozeniaUdzialQ: 'Wymagany udział Q (± Pn)',
  zalozeniaWymaganie: 'Wymagane pasmo Q',
  zalozeniaLiczbaPunktow: 'Liczba punktów krzywej',

  // Tabela punktów
  kolMoc: 'Moc czynna',
  kolPasmoProducenta: 'Pasmo producenta',
  kolWymaganie: 'Wymaganie operatora',
  kolMargines: 'Margines',
  kolStatus: 'Status',
  statusPokryty: 'Pokryty',
  statusNiepokryty: 'Niepokryty',

  // Wykres
  wykresTytul: 'Krzywa zdolności P–Q — pasmo producenta i wymaganie operatora',
  wykresOsX: 'Moc czynna P',
  wykresOsY: 'Moc bierna Q',
  legendaQMax: 'Producent Q max (indukcyjna)',
  legendaQMin: 'Producent Q min (pojemnościowa)',
  legendaWymMax: 'Wymaganie Q max',
  legendaWymMin: 'Wymaganie Q min',

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
  wiazaniaBezZmiany: '— bez zmiany —',
  wiazaniaZapisz: 'Zapisz krzywe w wiązaniach modułu',
  wiazaniaZadnaZmiana: 'Wybierz przynajmniej jedną krzywą do zapisania.',
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
