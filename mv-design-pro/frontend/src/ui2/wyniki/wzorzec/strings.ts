/*
 * Teksty WSPÓLNEGO WZORCA EKRANU ANALIZY (karta E8.1) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Centralny słownik: brak literałów UI w JSX
 * (zgodność z `ui_terminology_guard.py`). Identyfikatory techniczne (runId) NIE są
 * tekstem pierwszoplanowym — pojawiają się wyłącznie w trybie eksperckim, jako
 * wyrażenie `{...}` (poza skanem tekstu JSX).
 */

import type { KierunekSortowania } from './wzorzecModel';

export const WZORZEC_STRINGS = {
  // Nagłówek
  identyfikatorPrzebiegu: 'Identyfikator przebiegu',
  eksport: 'Eksportuj wynik',

  // Sekcja ZAŁOŻENIA
  zalozeniaTytul: 'Założenia',
  zalozeniaOpis: 'Założenia są częścią wyniku — dane wejściowe i parametry tego przebiegu.',
  zwin: 'Zwiń',
  rozwin: 'Rozwiń',
  brakZalozen: 'Brak zadeklarowanych założeń dla tego wyniku.',

  // Tabela
  brakWynikow: 'Brak wyników do wyświetlenia.',
  tagOstrzezenie: 'Poza zakresem',
  pokazDowod: 'Pokaż dowód (podwójne kliknięcie)',
  sortujKolumne: 'Sortuj wg kolumny',
  kolumnaDecyzja: 'Decyzja',
  poprawWModelu: 'Popraw w modelu',
  poprawWModeluOpis: 'Zaznacz element na schemacie i przejdź do modelu, aby dostosować dobór',

  // Wykres
  wykresTytul: 'Wykres',

  // Ślad obliczeń na żądanie (zasada KaTeX, 2026-07-22)
  sladTytul: 'Ślad obliczeń (WHITE BOX)',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',

  // Dostępny opis kierunku sortowania (aria)
  opisSortowania: (etykieta: string, kierunek: KierunekSortowania): string =>
    `Sortowanie wg „${etykieta}": ${kierunek === 'rosnaco' ? 'rosnąco' : 'malejąco'}.`,
} as const;
