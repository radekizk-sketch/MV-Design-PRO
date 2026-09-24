/*
 * Teksty i deterministyczne formatery okna „Stabilność SSCI" (ekran wyników
 * ui2/wyniki/ssci). Wyłącznie polski język techniczny; zero literałów UI w JSX;
 * identyfikatory (run id, analysis_id, ślad WHITE BOX) renderowane WYŁĄCZNIE w
 * trybie eksperckim. Formatery są CZYSTE (wejście→wyjście), bez `Date.now`/
 * losowości (Determinism Rule) — przecinek dziesiętny wg konwencji PL.
 */

/** Poziom istotności statusu (dobór koloru chipu/tagu — wyłącznie prezentacja). */
export type IstotnoscStanu = 'ok' | 'warn' | 'err' | 'neutral';

export const SSCI_STRINGS = {
  // Nagłówek
  tytul: 'Stabilność SSCI',
  opisWstep:
    'Stabilność podsynchronicznej interakcji regulacyjnej (SSCI) wg kryterium '
    + 'impedancyjnego Nyquista (Sun 2011 / Wen 2016). Impedancja sieci Z_grid(f) jest dziś '
    + 'liczona bez przekładni transformatora, dlatego ocena nie jest wykonywana — ekran '
    + 'pokazuje powód, wskaźnik strefy ujemnej rezystancji przekształtnika i metryki '
    + 'kryterium jako materiał audytowy.',
  runId: 'Identyfikator przebiegu',

  // Stan bez aktywnego przypadku
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego',
  brakPrzypadkuOpis:
    'Aktywuj przypadek obliczeniowy z committed modelem sieci (ENM). Analiza SSCI '
    + 'powstaje z tablic impedancji przekształtnika i sieci dla tego modelu.',

  // Akcja uruchomienia
  uruchom: 'Uruchom analizę stabilności SSCI',
  uruchomPonownie: 'Uruchom ponownie',
  uruchomOpis:
    'Analiza powstaje z committed ENM aktywnego przypadku: pola karty falownika '
    + '(pasma regulatora prądu, PLL, filtr) tworzą Z_conv, a moc zwarciowa węzła — Z_grid.',

  // Stany biegu
  ladowanie: 'Trwa analiza stabilności SSCI…',
  blad: 'Nie udało się wykonać analizy stabilności SSCI',

  // Identyfikacja przekształtnika i węzła
  chipPrzekształtnik: 'Przekształtnik',
  chipWezel: 'Węzeł',

  // Metryki kryterium impedancyjnego (sekcja audytowa)
  metrykiTytul: 'Metryki kryterium impedancyjnego',
  metrMaxGain: 'Maks. wzmocnienie pętli max|L|',
  metrMaxGainOpis: '|L|=1 ⟺ przecięcie modułów |Z_grid|=|Z_conv| (granica stabilności bezwarunkowej).',
  metrMargines: 'Najgorszy margines różnicy faz Δφ',
  metrMarginesOpis: 'Δφ = 180° − |∠L| w paśmie przecięcia; Δφ → 0 oznacza okrążenie punktu −1.',
  metrCzestWinna: 'Częstotliwość winna',
  metrCzestWinnaOpis: 'Częstotliwość najgorszego marginesu w paśmie |L| ≥ 1.',
  metrOdlegloscMinusJeden: 'Odległość od punktu −1',
  metrOdlegloscOpis: 'Najmniejsza odległość przebiegu L(jω) od punktu −1 (kryterium Nyquista).',
  metrOkrazenia: 'Okrążenia punktu −1',
  metrRezystancjaUjemna: 'Strefa ujemnej rezystancji przekształtnika Re(Z_conv) < 0',
  metrRezystancjaOpis:
    'Wskaźnik zależy wyłącznie od modelu przekształtnika (pasma regulatora prądu i PLL) '
    + '— informacja o mechanizmie umożliwiającym SSCI, nie ocena interakcji z siecią.',
  metrRezystancjaObecna: 'obecna',
  metrRezystancjaBrak: 'brak',
  metrPrzyF: 'przy f',
  metrReMin: 'Re_min',

  // Panel proweniencji
  provTytul: 'Proweniencja danych przekształtnika',
  provJakosc: 'Najgorsza jakość pól karty',
  provSzacowana: 'wartości szacowane',
  provPotwierdzona: 'wartości potwierdzone',
  provPolaZrodlowe: 'Pola źródłowe',

  // Braki danych (uczciwość)
  brakiTytul: 'Brak tablic impedancji',
  brakiOpis:
    'Bez przekształtnika/DER lub przy niekompletnych polach karty falownika kryterium '
    + 'impedancyjne nie ma tablic Z_grid/Z_conv/L — solver niczego nie zmyśla.',
  brakiPola: 'Brakujące pola',

  // Ślad WHITE BOX (tryb ekspercki)
  sladTytul: 'Ślad obliczeń SSCI (pełna jawność)',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',
  sladKolSymbol: 'Wielkość',
  sladKolPodstawienie: 'Podstawienie',
  sladKolWynik: 'Wynik',
  sladKolJednostka: 'Kontrola jednostek',
  ekspAnalizaId: 'Identyfikator analizy',
  ekspProgGain: 'Granica przecięcia modułów |L|',

  // Jednostki i wartości puste
  jednStopnie: '°',
  jednHz: 'Hz',
  jednOhm: 'Ω',
  kreska: '—',
} as const;

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Wzmocnienie / margines — 3 miejsca po przecinku. */
export function fmtGain(n: number): string {
  return fmtLiczba(n, 3);
}

/** Margines różnicy faz [°] — 2 miejsca po przecinku. */
export function fmtStopnie(n: number): string {
  return fmtLiczba(n, 2);
}

/** Częstotliwość [Hz] — 2 miejsca po przecinku. */
export function fmtHz(n: number): string {
  return fmtLiczba(n, 2);
}

/** Rezystancja [Ω] — 4 miejsca po przecinku (wartości rzędu mΩ w strefie ujemnej). */
export function fmtOhm(n: number): string {
  return fmtLiczba(n, 4);
}
