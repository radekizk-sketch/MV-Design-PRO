/*
 * Teksty i deterministyczne formatery okna „Porównanie przebiegów" (karta E12.1,
 * W-609) — wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7). Zero
 * literałów UI w JSX; identyfikatory (id przebiegu, comparison_id, input_hash,
 * study_case_id) renderowane WYŁĄCZNIE w trybie eksperckim jako wyrażenia `{...}`
 * z danych (poza skanem tekstu JSX, guard ui_terminology). Formatery są CZYSTE
 * (wejście→wyjście), bez `Date.now`/losowości (Determinism Rule) — przecinek
 * dziesiętny zgodnie z konwencją PL, data cięta z ISO bez konwersji strefy.
 */

import type { IssueSeverity, PowerFlowIssueCode } from '../../../ui/power-flow-comparison/types';

export const POROWNANIE_STRINGS = {
  // Nagłówek analizy
  analiza: 'Porównanie przebiegów',
  podtytul: 'Porównanie A/B rozpływu mocy — różnice liczone przez backend (tylko do odczytu).',
  identyfikatorPorownania: 'Identyfikator porównania',

  // Wybór A/B
  wyborTytul: 'Wybór przebiegów do porównania',
  wyborA: 'Przebieg A (odniesienie)',
  wyborB: 'Przebieg B (porównywany)',
  wyborPusty: '— wybierz przebieg —',
  porownaj: 'Porównaj przebiegi',
  porownajWTrakcie: 'Porównywanie…',
  analizaRozplyw: 'Rozpływ mocy',

  // Stany listy przebiegów
  listaWTrakcie: 'Wczytywanie listy przebiegów…',
  brakPrzebiegow: 'Brak zakończonych przebiegów rozpływu do porównania',
  brakPrzebiegowOpis:
    'Aby porównać dwa warianty, uruchom co najmniej dwa przebiegi rozpływu mocy i poczekaj na ich zakończenie.',
  bladListy: 'Nie udało się wczytać listy przebiegów rozpływu',

  // Stany porównania
  bezWyniku: 'Wybierz przebieg A i przebieg B, a następnie uruchom porównanie',
  bezWynikuOpis: 'Porównanie wykonuje backend po jawnym kliknięciu „Porównaj przebiegi".',
  wTrakcie: 'Trwa porównywanie przebiegów…',
  bladPorownania: 'Nie udało się wykonać porównania',
  walidacjaBrakAB: 'Wskaż oba przebiegi (A oraz B), aby wykonać porównanie.',
  walidacjaTeSame: 'Przebieg A i przebieg B muszą być różne.',

  // Podsumowanie (część wyniku — jako ZAŁOŻENIA wzorca)
  podsumZbieznosc: 'Zbieżność (A / B)',
  podsumStraty: 'Straty czynne (A · B · Δ)',
  podsumMaksNapiecie: 'Maks. odchylenie napięcia',
  podsumMaksKat: 'Maks. odchylenie kąta',
  podsumProblemy: 'Problemy wg wagi (krytyczne · poważne · umiarkowane · drobne)',
  podsumProblemyRazem: 'Problemy łącznie',
  podsumLiczby: 'Liczba szyn · gałęzi',
  podsumTagOdchylenie: 'poza zakresem',

  // Zakładki
  zakladkaSzyny: 'Różnice szyn',
  zakladkaGalezie: 'Różnice gałęzi',
  zakladkaRanking: 'Ranking problemów',

  // Kolumny — szyny
  kolSzyna: 'Szyna',
  kolNapiecieA: 'Napięcie A',
  kolNapiecieB: 'Napięcie B',
  kolNapiecieD: 'Δ napięcia',
  kolKatA: 'Kąt A',
  kolKatB: 'Kąt B',
  kolKatD: 'Δ kąta',
  // Moc bierna wstrzykiwana w szynie (L-12) — payload backendu ma te pola.
  kolMocBiernaA: 'Moc bierna A',
  kolMocBiernaB: 'Moc bierna B',
  kolMocBiernaD: 'Δ mocy biernej',

  // Kolumny — gałęzie
  kolGalaz: 'Gałąź',
  kolStratyA: 'Straty czynne A',
  kolStratyB: 'Straty czynne B',
  kolStratyD: 'Δ strat czynnych',
  kolMocA: 'Moc czynna (początek) A',
  kolMocB: 'Moc czynna (początek) B',
  kolMocD: 'Δ mocy czynnej (początek)',
  kolMocBiernaGalazA: 'Moc bierna (początek) A',
  kolMocBiernaGalazB: 'Moc bierna (początek) B',
  kolMocBiernaGalazD: 'Δ mocy biernej (początek)',

  // Kolumny — ranking
  kolWaga: 'Waga',
  kolRodzaj: 'Rodzaj problemu',
  kolElement: 'Element',
  kolOpis: 'Opis',
  kolKodTechniczny: 'Kod techniczny',

  // Stany puste tabel
  brakSzyn: 'Brak różnic szyn w tym porównaniu.',
  brakGalezi: 'Brak różnic gałęzi w tym porównaniu.',
  brakRankingu: 'Porównanie nie wskazało problemów technicznych.',

  // Szczegół problemu
  szczegolTytul: 'Szczegół problemu',
  szczegolWybierz: 'Wybierz wiersz rankingu, aby zobaczyć opis problemu.',
  szczegolElement: 'Element',
  szczegolWaga: 'Waga',
  szczegolRodzaj: 'Rodzaj',

  // Jednostki
  jednPu: 'pu',
  jednStopnie: '°',
  jednMW: 'MW',
  jednMvar: 'Mvar',

  // Filtr „tylko różnice" (L-14) — czysta prezentacja na danych backendu
  filtrTylkoRoznice: 'Pokaż tylko różnice',
  filtrOpis: 'Ukrywa wiersze, w których wszystkie różnice A/B są zerowe.',
  filtrPusto: 'Wszystkie wiersze są identyczne w obu przebiegach — brak różnic do pokazania.',

  // Wartość pusta
  kreska: '—',
} as const;

/**
 * Polskie nazwy wag problemów (`IssueSeverity` 1–5, `types.ts:47`). Słownictwo
 * zgodne z kubełkami podsumowania backendu (critical/major/moderate/minor):
 * 5 → krytyczny, 4 → poważny, 3 → umiarkowany, 2–1 → drobny (kubełek „minor").
 */
export const WAGA_PL: Record<IssueSeverity, string> = {
  5: 'Krytyczny',
  4: 'Poważny',
  3: 'Umiarkowany',
  2: 'Drobny',
  1: 'Drobny',
};

/** Próg wagi, od którego różnica jest tagowana jako „poza zakresem" (poważny+). */
export const WAGA_PROG_TAG: IssueSeverity = 4;

/**
 * Polskie nazwy rodzajów problemu (`PowerFlowIssueCode`, `types.ts:23-29`).
 * Zastępuje techniczny token (UPPER_SNAKE) w pierwszym planie; surowy kod
 * pokazywany wyłącznie w trybie eksperckim (kolumna „Kod techniczny").
 */
export const KOD_PROBLEMU_PL: Record<PowerFlowIssueCode, string> = {
  NON_CONVERGENCE_CHANGE: 'Zmiana zbieżności',
  VOLTAGE_DELTA_HIGH: 'Duża zmiana napięcia',
  ANGLE_SHIFT_HIGH: 'Duże przesunięcie kąta',
  LOSSES_INCREASED: 'Wzrost strat',
  LOSSES_DECREASED: 'Spadek strat',
  SLACK_POWER_CHANGED: 'Zmiana mocy węzła bilansującego',
};

/** Rodzaj problemu po polsku (nierozpoznany token → dosłownie, jako dana). */
export function rodzajProblemuPL(kod: PowerFlowIssueCode | string): string {
  return KOD_PROBLEMU_PL[kod as PowerFlowIssueCode] ?? String(kod);
}

/** Waga problemu po polsku (spoza zakresu 1–5 → „—", bez zgadywania). */
export function wagaPL(waga: number): string {
  return WAGA_PL[waga as IssueSeverity] ?? POROWNANIE_STRINGS.kreska;
}

/** Zbieżność po polsku (dana logiczna z podsumowania). */
export function zbieznoscPL(zbiezny: boolean): string {
  return zbiezny ? 'Zbieżny' : 'Niezbieżny';
}

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Format wartości ze znakiem (delta): dodatnie z „+", zero bez znaku. */
export function fmtDelta(n: number, miejsca: number): string {
  const podstawa = fmtLiczba(n, miejsca);
  return n > 0 ? `+${podstawa}` : podstawa;
}

/** Napięcie [pu] — 4 miejsca po przecinku. */
export function fmtNapiecie(n: number): string {
  return fmtLiczba(n, 4);
}

/** Delta napięcia [pu] — 4 miejsca po przecinku, ze znakiem. */
export function fmtDeltaNapiecie(n: number): string {
  return fmtDelta(n, 4);
}

/** Kąt [°] — 2 miejsca po przecinku. */
export function fmtKat(n: number): string {
  return fmtLiczba(n, 2);
}

/** Delta kąta [°] — 2 miejsca po przecinku, ze znakiem. */
export function fmtDeltaKat(n: number): string {
  return fmtDelta(n, 2);
}

/** Moc/straty czynne [MW] — 3 miejsca po przecinku. */
export function fmtMoc(n: number): string {
  return fmtLiczba(n, 3);
}

/** Delta mocy/strat [MW] — 3 miejsca po przecinku, ze znakiem. */
export function fmtDeltaMoc(n: number): string {
  return fmtDelta(n, 3);
}

/** Moc bierna [Mvar] — 3 miejsca po przecinku (ta sama rozdzielczość co moc czynna). */
export function fmtMocBierna(n: number): string {
  return fmtLiczba(n, 3);
}

/** Delta mocy biernej [Mvar] — 3 miejsca po przecinku, ze znakiem. */
export function fmtDeltaMocBierna(n: number): string {
  return fmtDelta(n, 3);
}

/**
 * Data z ISO cięta deterministycznie (bez konwersji strefy czasowej): „YYYY-MM-DD
 * HH:MM". Wartość pusta/nierozpoznana → „—". Nie używamy `toLocaleString`, aby
 * wynik był identyczny niezależnie od strefy maszyny (Determinism Rule).
 */
export function fmtData(iso: string | null | undefined): string {
  if (!iso || iso.length < 16) return POROWNANIE_STRINGS.kreska;
  return iso.slice(0, 16).replace('T', ' ');
}

// ===========================================================================
// TRYB ZWARCIOWY (karta E12.2) — teksty i formatery
// ===========================================================================

export const ZWARCIA_POROWNANIE_STRINGS = {
  // Przełącznik trybu porównania
  trybLegenda: 'Tryb porównania',
  trybRozplyw: 'Rozpływ mocy',
  trybZwarcia: 'Zwarcia',

  // Nagłówek analizy (tryb zwarciowy)
  podtytul:
    'Porównanie A/B wyników zwarciowych — wielkości Ik", ip, Ith, Sk (oraz pełny bilans IEC 60909 w trybie eksperckim) pochodzą z backendu (tylko do odczytu).',

  // Wybór A/B
  wyborTytul: 'Wybór przebiegów zwarciowych do porównania',
  wyborA: 'Przebieg A (odniesienie)',
  wyborB: 'Przebieg B (porównywany)',
  wyborPusty: '— wybierz przebieg —',
  porownaj: 'Porównaj przebiegi',
  porownajWTrakcie: 'Porównywanie…',
  analizaZwarcie: 'Zwarcie',

  // Stany listy przebiegów (zwarciowych)
  brakPrzebiegow: 'Brak zakończonych przebiegów zwarciowych do porównania',
  brakPrzebiegowOpis:
    'Aby porównać dwa warianty, uruchom co najmniej dwa przebiegi zwarciowe (IEC 60909) i poczekaj na ich zakończenie.',

  // Stany porównania
  wTrakcie: 'Trwa porównywanie przebiegów zwarciowych…',
  bladPorownania: 'Nie udało się wykonać porównania zwarciowego',
  walidacjaBrakAB: 'Wskaż oba przebiegi (A oraz B), aby wykonać porównanie.',
  walidacjaTeSame: 'Przebieg A i przebieg B muszą być różne.',

  // Kolumny tabeli punktów (A · B · Δ dla każdej wielkości)
  kolPunkt: 'Punkt zwarcia',
  kolIkssA: 'Ik" A',
  kolIkssB: 'Ik" B',
  kolIkssD: 'Δ Ik"',
  kolIpA: 'ip A',
  kolIpB: 'ip B',
  kolIpD: 'Δ ip',
  kolIthA: 'Ith A',
  kolIthB: 'Ith B',
  kolIthD: 'Δ Ith',
  kolSkA: 'Sk A',
  kolSkB: 'Sk B',
  kolSkD: 'Δ Sk',

  // Kolumny pełnego bilansu IEC 60909 (karta S-C — tryb ekspercki, addytywnie)
  kolRkA: 'Rk A',
  kolRkB: 'Rk B',
  kolRkD: 'Δ Rk',
  kolXkA: 'Xk A',
  kolXkB: 'Xk B',
  kolXkD: 'Δ Xk',
  kolZkA: '|Zk| A',
  kolZkB: '|Zk| B',
  kolZkD: 'Δ |Zk|',
  kolXrA: 'X/R A',
  kolXrB: 'X/R B',
  kolXrD: 'Δ X/R',
  kolI2tA: 'I²t A',
  kolI2tB: 'I²t B',
  kolI2tD: 'Δ I²t',

  // Stan pusty tabeli
  brakPunktow: 'Brak punktów zwarcia w wybranych przebiegach.',

  // Oznaczenie punktu bez odpowiednika w drugim przebiegu (uczciwie)
  tylkoA: ' (tylko A)',
  tylkoB: ' (tylko B)',

  // Jednostki
  jednKA: 'kA',
  jednMVA: 'MVA',
  jednOhm: 'Ω',
  jednKA2s: 'kA²·s',

  // Filtr „tylko różnice" (L-14) — czysta prezentacja na danych backendu
  filtrTylkoRoznice: 'Pokaż tylko różnice',
  filtrOpis: 'Ukrywa wiersze, w których wszystkie różnice A/B są zerowe.',
  filtrPusto: 'Wszystkie wiersze są identyczne w obu przebiegach — brak różnic do pokazania.',

  // Wartość pusta
  kreska: '—',
} as const;

/** Prąd [kA] — 3 miejsca po przecinku (spójnie z oknem „Wyniki zwarciowe"). */
export function fmtKA(n: number): string {
  return fmtLiczba(n, 3);
}

/** Delta prądu [kA] — 3 miejsca po przecinku, ze znakiem. */
export function fmtDeltaKA(n: number): string {
  return fmtDelta(n, 3);
}

/** Moc zwarciowa [MVA] — 1 miejsce po przecinku. */
export function fmtMVA(n: number): string {
  return fmtLiczba(n, 1);
}

/** Delta mocy zwarciowej [MVA] — 1 miejsce po przecinku, ze znakiem. */
export function fmtDeltaMVA(n: number): string {
  return fmtDelta(n, 1);
}

/** Impedancja [Ω] — 4 miejsca (spójnie z oknem „Wyniki zwarciowe"). */
export function fmtOhm(n: number): string {
  return fmtLiczba(n, 4);
}

/** Delta impedancji [Ω] — 4 miejsca, ze znakiem. */
export function fmtDeltaOhm(n: number): string {
  return fmtDelta(n, 4);
}

/** Stosunek X/R — 3 miejsca (spójnie z oknem „Wyniki zwarciowe"). */
export function fmtXR(n: number): string {
  return fmtLiczba(n, 3);
}

/** Delta stosunku X/R — 3 miejsca, ze znakiem. */
export function fmtDeltaXR(n: number): string {
  return fmtDelta(n, 3);
}

/** Energia cieplna I²t [kA²·s] — 3 miejsca. */
export function fmtKA2s(n: number): string {
  return fmtLiczba(n, 3);
}

/** Delta energii cieplnej I²t [kA²·s] — 3 miejsca, ze znakiem. */
export function fmtDeltaKA2s(n: number): string {
  return fmtDelta(n, 3);
}

/**
 * Względna zmiana [%] w nawiasie, ze znakiem — dopisek do delty bezwzględnej.
 * `null` (brak odniesienia, A = 0) → pusty łańcuch (bez zgadywania procentu).
 */
export function fmtDeltaProcent(pct: number | null): string {
  if (pct === null) return '';
  return ` (${fmtDelta(pct, 1)}%)`;
}
