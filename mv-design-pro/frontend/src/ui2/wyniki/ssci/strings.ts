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
    'Werdykt stabilności podsynchronicznej interakcji regulacyjnej (SSCI) wg '
    + 'kryterium impedancyjnego Nyquista (Sun 2011 / Wen 2016). Solver liczy tablice '
    + 'Z_grid(f)/Z_conv(f) i wzmocnienie pętli mniejszej L(f); ekran tylko prezentuje '
    + 'gotowy werdykt, metryki i wywód — zero fizyki w UI.',
  runId: 'Identyfikator przebiegu',

  // Stan bez aktywnego przypadku
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego',
  brakPrzypadkuOpis:
    'Aktywuj przypadek obliczeniowy z committed modelem sieci (ENM). Werdykt SSCI '
    + 'powstaje z tablic impedancji przekształtnika i sieci dla tego modelu.',

  // Akcja uruchomienia
  uruchom: 'Uruchom analizę stabilności SSCI',
  uruchomPonownie: 'Uruchom ponownie',
  uruchomOpis:
    'Analiza powstaje z committed ENM aktywnego przypadku: pola karty falownika '
    + '(pasma regulatora prądu, PLL, filtr) tworzą Z_conv, a moc zwarciowa węzła — Z_grid.',

  // Stany biegu
  ladowanie: 'Trwa wyznaczanie werdyktu stabilności SSCI…',
  blad: 'Nie udało się wyznaczyć werdyktu stabilności SSCI',

  // Werdykt (chip główny)
  werdyktTytul: 'Werdykt',
  werdyktStabilny: 'stabilny',
  werdyktRyzyko: 'ryzyko SSCI',
  werdyktNiestabilny: 'niestabilny',
  werdyktBrakDanych: 'brak danych',
  chipPrzekształtnik: 'Przekształtnik',
  chipWezel: 'Węzeł',

  // Metryki kryterium impedancyjnego
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
  metrRezystancjaUjemna: 'Rezystancja ujemna Re(Z_conv) < 0',
  metrRezystancjaObecna: 'obecna',
  metrRezystancjaBrak: 'brak',
  metrPrzyF: 'przy f',

  // Panel proweniencji
  provTytul: 'Proweniencja werdyktu',
  provJakosc: 'Najgorsza jakość pól karty',
  provSzacowana: 'wartości szacowane',
  provPotwierdzona: 'wartości potwierdzone',
  provPolaZrodlowe: 'Pola źródłowe',

  // Braki danych (uczciwość)
  brakiTytul: 'Brak danych do werdyktu',
  brakiOpis:
    'Bez przekształtnika/DER lub przy niekompletnych polach karty falownika kryterium '
    + 'impedancyjne nie ma tablic Z_grid/Z_conv/L — solver NIE zmyśla werdyktu. Uzupełnij '
    + 'przekształtnik w modelu (karta falownika), aby uzyskać werdykt SSCI.',
  brakiPola: 'Brakujące pola',

  // Uzasadnienie
  dlaczegoTytul: 'Uzasadnienie',

  // Ślad WHITE BOX (tryb ekspercki)
  sladTytul: 'Ślad obliczeń SSCI (pełna jawność)',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',
  sladKolSymbol: 'Wielkość',
  sladKolPodstawienie: 'Podstawienie',
  sladKolWynik: 'Wynik',
  sladKolJednostka: 'Kontrola jednostek',
  ekspAnalizaId: 'Identyfikator analizy',
  ekspProgGain: 'Próg przecięcia modułów |L|',
  ekspProgRyzyko: 'Próg marginesu (ryzyko) [°]',
  ekspProgNiestabilny: 'Próg marginesu (niestabilność) [°]',

  // Jednostki i wartości puste
  jednStopnie: '°',
  jednHz: 'Hz',
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
