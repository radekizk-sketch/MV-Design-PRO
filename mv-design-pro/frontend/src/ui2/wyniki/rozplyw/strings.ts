/*
 * Teksty i deterministyczne formatery okna „Rozpływ mocy — napięcia szyn"
 * (karta E8.1, pierwsza konkretyzacja wspólnego wzorca) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Zero literałów UI w JSX; identyfikatory
 * (numery szyn) renderowane jako wyrażenia `{...}` z danych. Formatery są CZYSTE
 * (wejście→wyjście), bez `Date.now`/losowości (Determinism Rule) — przecinek
 * dziesiętny zgodnie z konwencją PL.
 */

import type { KryteriaNapieciowe } from '../../../ui/power-flow-results/types';

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

  // Podzakładki okna rozpływu (karta E8.3, uzupełnienie W3-H)
  ariaPodzakladki: 'Podzakładki wyniku rozpływu',
  podzakladkaSzyny: 'Szyny',
  podzakladkaGalezie: 'Gałęzie',
  podzakladkaRegulacjaOze: 'Regulacja Q OZE',

  // Suma strat gałęzi (wiersz podsumowania pod tabelą, karta E8.3)
  sumaStrat: 'Suma strat gałęzi',

  // Założenia (parametry przebiegu)
  zalMocBazowa: 'Moc bazowa',
  zalTolerancja: 'Tolerancja zbieżności',
  zalSzynaBilansujaca: 'Szyna bilansująca',
  zalLiczbaIteracji: 'Liczba iteracji',
  zalZbieznosc: 'Zbieżność',
  zalPrzedzialNapiecia: 'Dopuszczalny przedział napięcia',
  // Karta W3-J: BEZ liczby wpisanej na sztywno — podstawa (z liczbą procentu)
  // pochodzi WPROST z odpowiedzi biegu (`kryteria.podstawa_ostrzezenie_pl`);
  // ten tekst pokazuje się WYŁĄCZNIE gdy kryteria są niedostępne w wyniku
  // (starszy zapisany bieg sprzed karty W3-J) — uczciwy stan, nie fabrykacja.
  zalPrzedzialNapieciaNiedostepne: 'Kryterium napięciowe niedostępne w tym wyniku.',
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

  // Podzakładka „Regulacja Q OZE" (karta W3-H, badanie śladu WHITE BOX —
  // wariant B, zero fabrykacji, mapa aneks J5 / domena 5 #1 / domena 3 #10).
  analizaRegulacjaOze: 'Rozpływ mocy — regulacja mocy biernej falowników',
  regulacjaOzeTytul:
    'Wykres „Q wstrzyknięte w biegu vs prawo Q(U)/cosφ(P)" niedostępny',
  regulacjaOzeOpis:
    'Wynik obliczenia rozpływu (metodą Newtona-Raphsona, Gaussa-Seidla albo rozprzężoną) ' +
    'nie zapisuje dla poszczególnych źródeł trybu regulacji (stały cosφ, cosφ(P), Q(U)), ' +
    'wstrzykniętej mocy biernej, napięcia w punkcie pracy ani informacji o osiągnięciu ' +
    'ograniczenia Q — dlatego wykresu punktu pracy na tle prawa regulacji nie da się ' +
    'narysować z tego przebiegu.',
  regulacjaOzeOpisUzupelnienie:
    'Krzywa prawa sterowania z nastaw źródła pozostaje dostępna w kreatorze źródła ' +
    'OZE jako podgląd parametrów (bez punktu pracy z przebiegu, bez fizyki sieci).',
  regulacjaOzeDecyzja:
    'Wykres będzie dostępny, gdy obliczenie rozpływu zacznie zapisywać te wielkości ' +
    'dla każdego źródła.',
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

/**
 * Czy napięcie [p.u.] jest poza kryterium ostrzeżenia — próg WYŁĄCZNIE
 * z odpowiedzi backendu (karta W3-J, `analysis.normative.kryteria_napiecia`),
 * zero progu wymyślonego w UI. Brak kryteriów w wyniku (starszy zapisany
 * bieg) = uczciwe "nie da się ocenić" (`false`), NIGDY domyślna liczba.
 */
export function napiecePozaZakresem(
  vPu: number,
  kryteria: KryteriaNapieciowe | undefined,
): boolean {
  if (!kryteria) return false;
  return vPu < kryteria.ostrzezenie_min_pu || vPu > kryteria.ostrzezenie_max_pu;
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
