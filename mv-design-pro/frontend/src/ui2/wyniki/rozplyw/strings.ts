/*
 * Teksty i deterministyczne formatery okna „Rozpływ mocy — napięcia szyn"
 * (karta E8.1, pierwsza konkretyzacja wspólnego wzorca) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Zero literałów UI w JSX; identyfikatory
 * (numery szyn) renderowane jako wyrażenia `{...}` z danych. Formatery są CZYSTE
 * (wejście→wyjście), bez `Date.now`/losowości (Determinism Rule) — przecinek
 * dziesiętny zgodnie z konwencją PL.
 */

/**
 * Normatywny przedział napięcia SN ±5% Un (0,95–1,05 p.u.) — EN 50160 / IRiESD.
 * To NIE jest heurystyka solvera: stała NORMATYWNA, jawnie ujawniana w sekcji
 * ZAŁOŻENIA (WHITE BOX, W-602) i użyta wyłącznie do prezentacyjnego oznaczenia
 * wartości poza zakresem (tag), bez korekty wyniku fizycznego.
 */
export const NAPIECIE_MIN_PU = 0.95;
export const NAPIECIE_MAX_PU = 1.05;

export const ROZPLYW_STRINGS = {
  // Nagłówek analizy
  analiza: 'Rozpływ mocy — napięcia szyn',
  analizaGalezie: 'Rozpływ mocy — przepływy w gałęziach',

  // Stan pusty
  brakWyniku: 'Brak wyniku rozpływu do wyświetlenia',
  brakWynikuOpis: 'Uruchom obliczenie rozpływu mocy, aby zobaczyć napięcia szyn.',

  // Kolumny tabeli szyn
  kolSzyna: 'Szyna',
  kolNapiecie: 'Napięcie',
  kolKat: 'Kąt',
  kolMocCzynna: 'Moc czynna',
  kolMocBierna: 'Moc bierna',

  // Kolumny tabeli gałęzi (karta E8.3)
  kolGalaz: 'Gałąź',
  kolPPoczatek: 'P początek',
  kolQPoczatek: 'Q początek',
  kolPKoniec: 'P koniec',
  kolQKoniec: 'Q koniec',
  kolStratyP: 'Straty P',
  kolStratyQ: 'Straty Q',
  // Kolumna werdyktu obciążalności (karta R3-A / K1-G2) — wartość i werdykt
  // WYŁĄCZNIE z backendowej walidacji energetycznej (BRANCH/TRANSFORMER_LOADING).
  kolObciazenie: 'Obciążenie',

  // Podzakładki okna rozpływu (karta E8.3)
  ariaPodzakladki: 'Podzakładki wyniku rozpływu',
  podzakladkaSzyny: 'Szyny',
  podzakladkaGalezie: 'Gałęzie',

  // Suma strat gałęzi (wiersz podsumowania pod tabelą, karta E8.3)
  sumaStrat: 'Suma strat gałęzi',

  // Założenia (parametry przebiegu)
  zalMocBazowa: 'Moc bazowa',
  zalTolerancja: 'Tolerancja zbieżności',
  zalSzynaBilansujaca: 'Szyna bilansująca',
  zalLiczbaIteracji: 'Liczba iteracji',
  zalZbieznosc: 'Zbieżność',
  zalPrzedzialNapiecia: 'Dopuszczalny przedział napięcia',
  zalPrzedzialNapieciaUwaga: 'Norma napięciowa ±5% Un (EN 50160) — służy oznaczeniu wartości poza zakresem.',
  zbieznoscTak: 'Tak',
  zbieznoscNie: 'Nie',

  // Wykres
  wykresTytul: 'Profil napięć szyn',
  wykresOsX: 'Szyna',
  wykresOsY: 'Napięcie',

  // Jednostki
  jednPU: 'p.u.',
  jednStopnie: '°',
  jednMW: 'MW',
  jednMvar: 'Mvar',
  jednMVA: 'MVA',
  jednKW: 'kW',
  jednKvar: 'kvar',
  jednProcent: '%',

  // Uczciwy brak danych (R3-A): brak pozycji walidacji dla gałęzi lub brak
  // odpowiedzi walidacji → komórka bez wartości i bez werdyktu.
  kreska: '—',
} as const;

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Napięcie w p.u. — 4 miejsca po przecinku. */
export function fmtPU(n: number): string {
  return fmtLiczba(n, 4);
}

/** Kąt fazowy w stopniach — 2 miejsca. */
export function fmtKat(n: number): string {
  return fmtLiczba(n, 2);
}

/** Moc (MW/Mvar) — 3 miejsca. */
export function fmtMoc(n: number): string {
  return fmtLiczba(n, 3);
}

/** Moc bazowa (MVA) — 1 miejsce. */
export function fmtBaza(n: number): string {
  return fmtLiczba(n, 1);
}

/** Tolerancja zbieżności — notacja wykładnicza, przecinek dziesiętny. */
export function fmtTolerancja(n: number): string {
  return n.toExponential().replace('.', ',');
}

/** Czy napięcie [p.u.] jest poza normatywnym przedziałem ±5% Un. */
export function napiecePozaZakresem(vPu: number): boolean {
  return vPu < NAPIECIE_MIN_PU || vPu > NAPIECIE_MAX_PU;
}

/**
 * Straty czynne gałęzi: MW → kW (skalowanie ×1000, 2 miejsca po przecinku).
 * To WYŁĄCZNIE zmiana jednostki prezentacji tabeli gałęzi (karta E8.3) —
 * wartość fizyczna strat pochodzi niezmieniona z wyniku solvera
 * (`PowerFlowBranchResult.losses_p_mw`), tu tylko przeliczona na jednostkę
 * czytelniejszą dla strat pojedynczej gałęzi (kW zamiast ułamków MW).
 */
export function fmtStrataKw(mw: number): string {
  return fmtLiczba(mw * 1000, 2);
}

/** Straty bierne gałęzi: Mvar → kvar (skalowanie ×1000) — jak wyżej. */
export function fmtStrataKvar(mvar: number): string {
  return fmtLiczba(mvar * 1000, 2);
}

/**
 * Obciążenie gałęzi/transformatora [%] — 1 miejsce po przecinku, spójnie
 * z prezentacją procentów okna „Jakość wyników" (`jakosc/strings.ts:fmtProcent`).
 * Wartość pochodzi WPROST z `observed_value` pozycji walidacji energetycznej
 * (backend) — formater wyłącznie prezentuje, zero fizyki (karta R3-A).
 */
export function fmtObciazenie(pct: number): string {
  return fmtLiczba(pct, 1);
}
