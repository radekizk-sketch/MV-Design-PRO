/*
 * JEDYNY moduł tłumaczący kody produkcyjne diagnostyki na zdania inżynierskie
 * (karta DIAGNOZA-PRZEBIEGU §0.2: „mapowanie kodów reguł na zdania inżynierskie
 * w JEDNYM module, nie rozproszone stringi").
 *
 * DLACZEGO W OGÓLE TŁUMACZYMY. Backend zwraca gotowe zdania po polsku
 * (`message_pl`, `hints`) i te renderujemy wprost — nie ma powodu ich
 * duplikować. Ale trzy rodziny wartości docierają do ekranu jako SUROWE kody
 * produkcyjne i bez tego modułu wyciekłyby projektantowi na ekran:
 *
 *  1. `blocking_codes` w tabeli kontroli przed obliczeniem — lista w rodzaju
 *     `["E-D01", "E-D05"]`. Zwróćmy uwagę, że backendowe `reason_pl` te kody
 *     WKLEJA do zdania („Zwarcie trójfazowe zablokowane: E-D01, E-D05",
 *     `backend/src/diagnostics/engine.py::_matrix_entry`), więc tamtego pola
 *     NIE renderujemy — zdanie składamy tutaj z przetłumaczonych kodów.
 *  2. `code` diagnozy przebiegu (`PRZ-*`) — kontrakt
 *     `GET /api/execution/runs/{run_id}/diagnostics`.
 *  3. `cause_if_failed` — przyczyna przerwania iteracji zapisana przez solver
 *     rozpływu (`max_iter`, `singular_jacobian`, `singular_matrix`,
 *     `numerical_issue`). To jest odpowiedź na pytanie „co osobliwe".
 *
 * KOMPLETNOŚĆ JEST PILNOWANA DWUSTRONNIE, nie deklarowana. Test
 * `backend/tests/api/test_kody_diagnozy_maja_zdania.py` czyta TEN plik i
 * porównuje jego klucze ze zbiorem kodów faktycznie emitowanych przez
 * `backend/src/diagnostics/rules.py`, przez `KODY_DIAGNOZY_PRZEBIEGU`
 * (`application/analyses/diagnoza_przebiegu.py`) oraz przez solwery rozpływu.
 * Dopisanie reguły w backendzie bez zdania tutaj — albo zdania bez reguły —
 * czerwieni test. Bez tego pinu obietnica „każdy kod ma zdanie" byłaby
 * deklaracją bez pokrycia (reguła KLASA, NIE INSTANCJA, pkt 4).
 *
 * JĘZYK. Zdania są w trybie orzekającym, mówią CO JEST i CO Z TEGO WYNIKA dla
 * obliczenia — nie powtarzają kodu i nie używają anglicyzmów. Wskazówki
 * naprawcze zostawiamy backendowi (`hints`), żeby nie było dwóch źródeł porad.
 */

/** Zdanie inżynierskie dla kodu reguły diagnostycznej modelu (E-D / W-D / I-D). */
export const ZDANIA_REGUL: Readonly<Record<string, string>> = {
  'E-D01': 'Sieć nie ma źródła zasilania — bez szyny bilansującej lub źródła falownikowego nie ma od czego liczyć rozpływu ani zwarcia.',
  'E-D02': 'Gałąź łączy szyny o różnych napięciach znamionowych bez transformatora — model napięciowo niespójny.',
  'E-D03': 'Sieć rozpada się na odrębne wyspy — część układu nie ma połączenia ze źródłem.',
  'E-D04': 'Transformator ma niekompletne strony (brak szyny albo napięcia po stronie górnej lub dolnej).',
  'E-D05': 'Gałąź ma zerową impedancję — macierz admitancyjna staje się osobliwa i solver nie ma czego odwrócić.',
  'E-D06': 'Brak danych składowej zerowej w torze — zwarcie jednofazowe jest niedostępne (pozostałe analizy bez zmian).',
  'E-D07': 'Otwarte łączniki odcinają część układu — sieć w tym stanie łączeniowym jest niespójna.',
  // Luka na E-D08 jest celowa — pod tym kodem żyła zaślepka, która nigdy nie
  // mogła się odezwać. Warunek (sprzeczna częstotliwość szyny) wdrożono w
  // walidatorze ENM jako W009, czyli tam, gdzie ta dana w ogóle istnieje.
  'W-D01': 'Część gałęzi nie ma danych składowej zerowej — analizy niesymetryczne będą ograniczone.',
  'W-D02': 'Parametry elementu wykraczają poza typowe zakresy sieci SN — warto sprawdzić dane wejściowe.',
  'W-D03': 'Układ ma wiele źródeł zasilania — sprawdź koordynację zabezpieczeń i punkt bilansujący.',
  'I-D01': 'Model jest kompletny — wszystkie analizy są dostępne.',
  'I-D02': 'Rozpoznano rodzaj topologii układu (radialna albo oczkowa) wraz z liczbą szyn i połączeń.',
};

/** Zdanie inżynierskie dla kodu diagnozy przebiegu (`PRZ-*`). */
export const ZDANIA_DIAGNOZY_PRZEBIEGU: Readonly<Record<string, string>> = {
  'PRZ-ZBIEZNY': 'Obliczenie zbiegło — solver osiągnął zadaną dokładność, wszystkie szyny mają wynik.',
  'PRZ-ZBIEZNY-NIEPELNY': 'Obliczenie zbiegło, ale część szyn leży poza wyspą zasilania i nie ma wyniku.',
  'PRZ-NIEZBIEZNY-LIMIT': 'Brak zbieżności — solver wyczerpał dopuszczalną liczbę iteracji, nie osiągając zadanej dokładności.',
  'PRZ-NIEZBIEZNY': 'Brak zbieżności — solver przerwał obliczenie przed osiągnięciem zadanej dokładności.',
  'PRZ-BLAD-WYKONANIA': 'Obliczenie przerwał błąd wykonania — solver nie doszedł do wyniku.',
  'PRZ-W-TOKU': 'Obliczenie jeszcze się nie zakończyło — diagnoza będzie dostępna po jego zakończeniu.',
  'PRZ-BEZ-ITERACJI': 'Ta analiza rozwiązywana jest wprost, bez iteracji — pojęcie zbieżności jej nie dotyczy.',
  'PRZ-BRAK-ARTEFAKTU': 'Obliczenie zakończyło się bez zapisanego wyniku — brak danych do postawienia diagnozy.',
};

/**
 * Zdanie inżynierskie dla przyczyny przerwania iteracji zapisanej przez solver
 * rozpływu. To jest odpowiedź na „co osobliwe" — dwie z czterech przyczyn
 * wprost nazywają osobliwość macierzy.
 */
export const ZDANIA_PRZYCZYN_PRZERWANIA: Readonly<Record<string, string>> = {
  max_iter: 'Wyczerpany limit iteracji — niedopasowanie mocy nie zeszło poniżej tolerancji w dopuszczalnej liczbie kroków.',
  singular_jacobian: 'Macierz Jacobiego jest osobliwa — układ równań nie ma jednoznacznego rozwiązania w tym punkcie pracy.',
  singular_matrix: 'Macierz układu jest osobliwa — najczęściej z powodu gałęzi o zerowej impedancji albo szyny bez połączenia ze źródłem.',
  numerical_issue: 'Solver napotkał wartość niedopuszczalną numerycznie — obliczenie zostało przerwane.',
};

/** Etykieta wagi problemu — słownik wspólny z przestrzenią „Gotowość". */
export const ETYKIETY_WAGI: Readonly<Record<string, string>> = {
  BLOCKER: 'BLOKADA',
  WARN: 'OSTRZEŻENIE',
  INFO: 'INFORMACJA',
};

/** Etykieta dostępności analizy w kontroli przed obliczeniem. */
export const ETYKIETY_DOSTEPNOSCI: Readonly<Record<string, string>> = {
  AVAILABLE: 'Dostępna',
  BLOCKED: 'Zablokowana',
};

/**
 * Zdanie dla kodu reguły. Kod NIEZNANY nie jest wypisywany na ekran w postaci
 * surowej (zakaz kodów produkcyjnych w UI) — zamiast tego uczciwie mówimy, że
 * opis nie jest znany. Test dwustronny pilnuje, żeby ta gałąź nie była w
 * praktyce osiągalna dla kodów emitowanych przez backend.
 */
export function zdanieReguly(kod: string): string {
  return ZDANIA_REGUL[kod] ?? 'Wykryto ograniczenie modelu bez opisu w słowniku aplikacji.';
}

/** Zdanie dla kodu diagnozy przebiegu (zasada jak wyżej). */
export function zdanieDiagnozy(kod: string): string {
  return (
    ZDANIA_DIAGNOZY_PRZEBIEGU[kod] ??
    'Stan obliczenia nie ma opisu w słowniku aplikacji.'
  );
}

/** Zdanie dla przyczyny przerwania iteracji; `null` gdy solver jej nie podał. */
export function zdaniePrzyczyny(przyczyna: string | null): string | null {
  if (!przyczyna) return null;
  return (
    ZDANIA_PRZYCZYN_PRZERWANIA[przyczyna] ??
    'Solver przerwał obliczenie z przyczyny bez opisu w słowniku aplikacji.'
  );
}

/** Etykieta wagi problemu; nieznana waga renderowana jako informacja. */
export function etykietaWagi(waga: string): string {
  return ETYKIETY_WAGI[waga] ?? ETYKIETY_WAGI.INFO;
}

/** Etykieta dostępności analizy; nieznana traktowana jak zablokowana. */
export function etykietaDostepnosci(status: string): string {
  return ETYKIETY_DOSTEPNOSCI[status] ?? ETYKIETY_DOSTEPNOSCI.BLOCKED;
}

/**
 * Zdania dla listy kodów blokujących analizę — zamiast backendowego
 * `reason_pl`, które wkleja surowe kody do treści. Kolejność zachowana,
 * duplikaty usunięte (ta sama reguła może blokować z dwóch powodów).
 */
export function zdaniaBlokad(kody: readonly string[]): string[] {
  const widziane = new Set<string>();
  const zdania: string[] = [];
  for (const kod of kody) {
    const zdanie = zdanieReguly(kod);
    if (widziane.has(zdanie)) continue;
    widziane.add(zdanie);
    zdania.push(zdanie);
  }
  return zdania;
}
