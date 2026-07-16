/*
 * Teksty i deterministyczne formatery okna „Wyniki zwarciowe" (karta E8.2, druga
 * konkretyzacja wspólnego wzorca ekranu analizy) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Zero literałów UI w JSX; identyfikatory
 * (target_id/element_id) renderowane wyłącznie w trybie eksperckim jako wyrażenia
 * `{...}` z danych. Formatery są CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule) — przecinek dziesiętny zgodnie z konwencją PL.
 */

export const ZWARCIA_STRINGS = {
  // Nagłówek analizy
  analiza: 'Wyniki zwarciowe',

  // Stan pusty
  brakWyniku: 'Brak wyniku zwarciowego do wyświetlenia',
  brakWynikuOpis: 'Uruchom obliczenie zwarciowe (IEC 60909), aby zobaczyć wielkości w punktach zwarcia.',

  // Kolumny tabeli punktów zwarciowych
  kolPunkt: 'Punkt zwarcia',
  kolRodzaj: 'Rodzaj zwarcia',
  kolIkss: 'Prąd zwarciowy początkowy Ik"',
  kolIp: 'Prąd udarowy ip',
  kolIth: 'Prąd cieplny Ith',
  kolSk: 'Moc zwarciowa Sk"',
  kolUwagi: 'Uwagi',
  kolIdentyfikator: 'Identyfikator punktu',

  // Założenia (parametry przebiegu, W-602)
  zalMetoda: 'Metoda obliczeń',
  zalMetodaWartosc: 'IEC 60909',
  zalWspolczynnikC: 'Współczynnik napięciowy c',
  zalCzasCieplny: 'Czas cieplny',
  zalWartoscZKonfiguracji: 'Wartość pochodzi z konfiguracji przebiegu — niedostępna w kontrakcie wyników (read-only).',

  // Sekcja wkładów
  wkladyTytul: 'Wkłady do zwarcia',
  wkladyKolZrodlo: 'Źródło',
  wkladyKolPrad: 'Prąd wkładu',
  wkladyKolUdzial: 'Udział',
  wkladyKolIdentyfikator: 'Identyfikator źródła',
  wkladyNiedostepne: 'Dane wkładów niedostępne w tym przebiegu.',
  wkladyNiedostepneOpis:
    'Kontrakt wyników zwarciowych (read-only) nie niesie wkładów źródeł. Wkłady pojawią się po rozszerzeniu przebiegu o dane gałęziowe (patrz TODO-KARTA).',
  wkladyBrakPunktow: 'Brak punktów zwarcia do wyboru.',

  // Wykres
  wykresTytul: 'Prądy zwarciowe Ik" w punktach zwarcia',
  wykresOsY: 'Prąd zwarciowy początkowy Ik"',

  // Rodzaje zwarcia — nieznany token
  rodzajNieznany: 'zwarcie (nieokreślone)',

  // Jednostki
  jednKA: 'kA',
  jednMVA: 'MVA',
  jednProcent: '%',
  jednS: 's',

  // Wartość pusta
  kreska: '—',
} as const;

/**
 * Słownik polskich nazw rodzajów zwarcia. Klucze = wartości `fault_type`
 * (`short_circuit_type`) z kontraktu wyników: „3F", „2F", „2F+Z", „1F"
 * (execution_runs.py:149-155). Dodatkowo akceptowane warianty `SC_3F`/`sc_3f`
 * (fault_scenarios.py:84, analysisRunContract.ts:138-142). Normalizacja: wielkie
 * litery, usunięcie prefiksu `SC_`.
 */
const RODZAJ_ZWARCIA_PL: Record<string, string> = {
  '3F': 'zwarcie trójfazowe',
  '2F': 'zwarcie dwufazowe',
  '2F+Z': 'zwarcie dwufazowe z ziemią',
  '1F': 'zwarcie jednofazowe (doziemne)',
};

/** Mapuje `fault_type` na polską nazwę rodzaju zwarcia (read-only, bez fizyki). */
export function rodzajZwarciaPL(faultType: string | null): string {
  if (!faultType) return ZWARCIA_STRINGS.kreska;
  const znormalizowany = faultType.trim().toUpperCase().replace(/^SC_/, '');
  return RODZAJ_ZWARCIA_PL[znormalizowany] ?? ZWARCIA_STRINGS.rodzajNieznany;
}

/**
 * Słownik polskich etykiet flag wiersza zwarciowego (`ShortCircuitRow.flags`).
 * Spójny z kanoniczną pulą tokenów flag repozytorium
 * (`ui/results-inspector/types.ts:460-464`). Tokeny nierozpoznane pokazywane są
 * dosłownie (dane, nie literał UI). Docelowa pula flag zwarciowych = własność
 * backendu (patrz TODO-KARTA w `zwarciaModel.ts`).
 */
const FLAGI_ZWARCIA_PL: Record<string, string> = {
  SLACK: 'Węzeł bilansujący',
  SYNTHETIC: 'Węzeł syntetyczny',
  VOLTAGE_VIOLATION: 'Naruszenie napięcia',
  OVERLOADED: 'Przeciążenie',
};

/** Łączy flagi wiersza w polski tekst uwag (pusta lista → „—"). */
export function uwagiZwarciaPL(flagi: string[]): string {
  if (!flagi || flagi.length === 0) return ZWARCIA_STRINGS.kreska;
  return flagi.map((flaga) => FLAGI_ZWARCIA_PL[flaga] ?? flaga).join(', ');
}

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Prąd [kA] — 3 miejsca po przecinku. */
export function fmtKA(n: number): string {
  return fmtLiczba(n, 3);
}

/** Moc zwarciowa [MVA] — 1 miejsce po przecinku. */
export function fmtMVA(n: number): string {
  return fmtLiczba(n, 1);
}

/** Udział względny [%] — 1 miejsce po przecinku. */
export function fmtProcent(n: number): string {
  return fmtLiczba(n, 1);
}

/** Czas cieplny [s] — 2 miejsca po przecinku. */
export function fmtCzas(n: number): string {
  return fmtLiczba(n, 2);
}

/** Współczynnik napięciowy c — 2 miejsca po przecinku. */
export function fmtWspolczynnik(n: number): string {
  return fmtLiczba(n, 2);
}
