/*
 * Teksty powierzchni „Diagnoza przebiegu" (przestrzeń „Obliczenia", D7).
 * Wyłącznie polski język inżynierski — bez anglicyzmów i bez kodów
 * produkcyjnych (te tłumaczy `kodyDiagnozy.ts`).
 *
 * Formatowanie liczb jest CZYSTE i deterministyczne: żadnych obliczeń, tylko
 * zapis wartości policzonych przez backend (zakaz fizyki w UI).
 */

export const DIAGNOZA_STRINGS = {
  tytul: 'Diagnoza przebiegu',
  podtytul:
    'Dlaczego obliczenie nie doszło do wyniku i co zostało sprawdzone przed jego uruchomieniem.',

  // Stany zerowe
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego',
  brakPrzypadkuOpis:
    'Wybierz przypadek obliczeniowy, aby zobaczyć kontrolę przed obliczeniem i diagnozę jego przebiegów.',
  brakPrzebiegu: 'Ten przypadek nie ma jeszcze żadnego obliczenia',
  brakPrzebieguOpis:
    'Diagnoza powstaje z artefaktów obliczenia. Uruchom obliczenie, aby zobaczyć jego przebieg zbieżności.',
  brakPrzebieguAkcja: 'Przejdź do uruchomienia',
  ladowanie: 'Wczytywanie diagnozy…',
  blad: 'Nie udało się wczytać diagnozy',
  bladPonow: 'Ponów próbę',

  // Sekcja: werdykt biegu
  sekcjaWerdykt: 'Ostatnie obliczenie',
  werdyktBezProblemow: 'Diagnoza nie wykryła problemów z przebiegiem tego obliczenia.',
  etykietaAnaliza: 'Rodzaj analizy',
  etykietaStatusBiegu: 'Stan obliczenia',
  etykietaIteracje: 'Wykonane iteracje',
  etykietaLimitIteracji: 'Dopuszczalna liczba iteracji',
  etykietaTolerancja: 'Zadana dokładność (niedopasowanie)',
  etykietaNiedopasowanie: 'Niedopasowanie w ostatniej iteracji',
  etykietaPrzyczyna: 'Przyczyna przerwania',
  etykietaSzynyBezWyniku: 'Szyny bez wyniku (poza wyspą zasilania)',
  etykietaBladWykonania: 'Komunikat błędu wykonania',

  // Sekcja: przebieg zbieżności
  sekcjaPrzebiegZbieznosci: 'Przebieg zbieżności',
  sekcjaPrzebiegZbieznosciOpis:
    'Niedopasowanie mocy w kolejnych iteracjach — malejące oznacza zbieganie, rosnące lub stojące oznacza rozbieganie.',
  kolIteracja: 'Iteracja',
  kolNiedopasowanie: 'Niedopasowanie [j.w.]',
  brakPrzebieguZbieznosci: 'Ta analiza nie jest rozwiązywana iteracyjnie — nie ma przebiegu zbieżności.',

  // Sekcja: kontrola przed obliczeniem
  sekcjaKontrola: 'Kontrola przed obliczeniem',
  sekcjaKontrolaOpis: 'Co zostało sprawdzone w modelu i które analizy są dostępne.',
  kolAnaliza: 'Analiza',
  kolDostepnosc: 'Dostępność',
  kolPowod: 'Co blokuje',
  kontrolaBezBlokad: 'Bez przeszkód',
  kontrolaWszystkoDostepne: 'Wszystkie analizy są dostępne — model nie ma braków blokujących.',

  // Sekcja: problemy modelu
  sekcjaProblemy: 'Braki modelu wykryte w diagnostyce',
  sekcjaProblemyOpis:
    'Te braki tłumaczą, dlaczego układ równań może być nierozwiązywalny albo wynik niepełny.',
  problemyBrak: 'Diagnostyka nie wykryła braków w modelu.',
  etykietaDotyczy: 'Dotyczy',
  etykietaWskazowki: 'Jak naprawić',

  brakWartosci: '—',
} as const;

/**
 * Zapis wartości niedopasowania / tolerancji w postaci wykładniczej.
 * To FORMATOWANIE, nie obliczenie: wartość pochodzi wprost z backendu, a
 * `toExponential` zmienia wyłącznie jej zapis tekstowy.
 */
export function formatWartoscJednostkowa(wartosc: number | null): string {
  if (wartosc === null || !Number.isFinite(wartosc)) return DIAGNOZA_STRINGS.brakWartosci;
  return wartosc.toExponential(3).replace('.', ',');
}

/** Zapis liczby całkowitej (iteracje) — brak wartości jako uczciwe „—". */
export function formatLiczbe(wartosc: number | null): string {
  if (wartosc === null || !Number.isFinite(wartosc)) return DIAGNOZA_STRINGS.brakWartosci;
  return String(wartosc);
}

/**
 * „Wykonane iteracje" w zestawieniu z limitem — „7 z 30".
 * Sklejanie tekstu, nie arytmetyka.
 */
export function formatIteracjeZLimitem(
  wykonane: number | null,
  limit: number | null,
): string {
  if (wykonane === null) return DIAGNOZA_STRINGS.brakWartosci;
  if (limit === null) return String(wykonane);
  return `${wykonane} z ${limit}`;
}
