/*
 * Teksty WSPÓLNEGO WZORCA EKRANU ANALIZY (karta E8.1) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Centralny słownik: brak literałów UI w JSX
 * (zgodność z `ui_terminology_guard.py`). Identyfikatory techniczne (runId) NIE są
 * tekstem pierwszoplanowym — pojawiają się wyłącznie w trybie eksperckim, jako
 * wyrażenie `{...}` (poza skanem tekstu JSX).
 */

import { ANALYSIS_TYPE_LABELS, type ExecutionRun } from '../../../ui/study-cases/types';
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
  // F-K4: wynik BEZ kryterium naruszenia — wskazanie elementu, nie sugestia naprawy.
  pokazNaSchemacie: 'Pokaż na schemacie',
  pokazNaSchemacieOpis: 'Zaznacz element na schemacie i przejdź do przestrzeni Schemat, aby go obejrzeć w modelu',

  // Wykres
  wykresTytul: 'Wykres',

  // Ślad obliczeń na żądanie (zasada KaTeX, 2026-07-22)
  sladTytul: 'Ślad obliczeń (pełna jawność)',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',

  // Checklista walidacji w śladzie sekcyjnym (ZWARCIA-PRO F3) — opisy statusów (aria)
  walidacjaSpelnione: 'spełnione',
  walidacjaNiespelnione: 'niespełnione',
  walidacjaInformacja: 'informacja',

  // Dostępny opis kierunku sortowania (aria)
  opisSortowania: (etykieta: string, kierunek: KierunekSortowania): string =>
    `Sortowanie wg „${etykieta}": ${kierunek === 'rosnaco' ? 'rosnąco' : 'malejąco'}.`,

  // Informacje audytowe (karta V12.7 §0.3) — metadane produkcyjne poza pierwszym planem
  informacjeAudytoweTytul: 'Informacje audytowe',
  // Zapis techniczny (karta #145) — surowy ślad rdzenia zamrożonego, podpisany jawnie.
  zapisTechnicznyTytul: (podpis: string) => `Zapis techniczny — ${podpis}`,
  zapisTechnicznyOpis:
    'Zapis w postaci, w jakiej wytwarza go silnik obliczeń (klucze danych i kody). Służy '
    + 'do audytu obliczeń; ocenę i jej uzasadnienie po polsku podaje karta oceny powyżej.',
  // Słowniki wartości wyliczeniowych (karta #145) — wartość spoza słownika nigdy surowo.
  wartoscSpozaSlownika: 'wartość spoza słownika aplikacji',
} as const;

/**
 * Znacznik czasu ISO dla projektanta: „2026-07-15T14:32:00Z" → „2026-07-15 14:32".
 * Deterministyczny (bez `Date`/strefy — ta sama konwencja co czas przebiegu w
 * przestrzeniach Projekt i Obliczenia): ekran wyników nie pokazuje surowego zapisu
 * maszynowego z literą „T", sekundami i strefą. Wejście spoza wzorca ISO wraca bez
 * zmian (bez zgadywania), `null`/pusty → „—".
 */
export function formatZnacznikaCzasu(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dopasowanie = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return dopasowanie ? `${dopasowanie[1]} ${dopasowanie[2]}` : iso;
}

/**
 * Etykieta przebiegu w liście wyboru ekranu wyników (karta #145): rodzaj obliczenia po
 * polsku i czas zakończenia — identyfikator przebiegu jest wyłącznie wartością opcji,
 * nigdy jej tekstem (projektant rozpoznaje bieg po rodzaju i czasie, nie po UUID).
 */
export function etykietaPrzebieguWyniku(
  run: Pick<ExecutionRun, 'analysis_type' | 'finished_at' | 'started_at'>,
): string {
  const czas = run.finished_at ?? run.started_at;
  const rodzaj = ANALYSIS_TYPE_LABELS[run.analysis_type];
  return czas ? `${rodzaj} · ${formatZnacznikaCzasu(czas)}` : rodzaj;
}
