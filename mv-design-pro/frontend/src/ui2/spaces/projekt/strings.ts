/*
 * Teksty pulpitu projektu (przestrzeń „Projekt", okno W-101, karta E2.1) —
 * wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7). Dokładne stringi
 * pierwszoplanowe wg karty §4. Słownik V12K-026: „przypadek obliczeniowy"
 * dozwolony w ui2. Zero identyfikatorów kodowych na pierwszym planie.
 *
 * Centralizacja tekstu = jedno źródło etykiet (importowane wprost przez testy
 * jako oczekiwane wartości) oraz brak literałów w JSX (zgodność z guardem
 * terminologii UI, który skanuje tekst JSX).
 */

import type { StudyCaseResultStatus } from '../../../ui/study-cases/types';

export const PULPIT_STRINGS = {
  // Nagłówek przestrzeni
  tytul: 'Pulpit projektu',
  podtytul:
    'Jedno spojrzenie: stan modelu, przypadki obliczeniowe, ostatnie przebiegi i braki.',

  // Kafel „Model sieci"
  modelTytul: 'Model sieci',
  elementow: 'elementów',
  stacje: 'Stacje SN/nn',
  zrodla: 'Źródła',

  // Kafel „Gotowość do analiz"
  gotowoscTytul: 'Gotowość do analiz',
  gotowa: 'Gotowa',
  niegotowa: 'Niegotowa',
  blokady: 'Blokady',
  ostrzezenia: 'Ostrzeżenia',

  // Kafel „Ostatni przebieg"
  ostatniPrzebieg: 'Ostatni przebieg',
  zakres: 'Zakres',
  status: 'Status',
  brakPrzebiegow: 'Brak przebiegów',

  // Kafel „Spójność"
  spojnosc: 'Spójność',
  odcisk: 'Odcisk',
  wyniki: 'Wyniki',
  wynikiAktualne: 'aktualne',
  wynikiNieaktualne: 'nieaktualne',
  wynikiBrak: 'brak wyników',

  // Lista przypadków obliczeniowych
  przypadkiTytul: 'Przypadki obliczeniowe',
  kolPrzypadek: 'Przypadek',
  kolKonfiguracja: 'Konfiguracja',
  kolWyniki: 'Wyniki',
  kolOstatniPrzebieg: 'Ostatni przebieg',
  brakPrzypadkow: 'Brak przypadków obliczeniowych',
  aktywny: 'aktywny',

  // Stany przestrzeni
  brakProjektu: 'Nie otwarto projektu',
  brakProjektuOpis: 'Otwórz projekt, aby zobaczyć pulpit.',
  otworzProjekt: 'Otwórz projekt',
  ladowanie: 'Wczytywanie…',

  // Kafle „wkrótce" (brak źródła danych w store'ach — patrz TODO-KARTA)
  wkrotce: 'Wkrótce — wymaga danych z kolejnych faz programu',
  celTytul: 'Postęp wg celu',
  bilansTytul: 'Bilans przyłączeniowy',

  // Kafel „Warunki przyłączenia i bilans mocy" (E1 — B1/B2)
  przylaczenieTytul: 'Warunki przyłączenia',
  przylaczenieBrakZrodla: 'Brak źródła sieciowego w modelu',
  przylaczenieBrakZrodlaOpis: 'Dodaj punkt przyłączenia (GPZ / sieć zewnętrzna), aby ustalić warunki.',
  przylaczenieNapiecie: 'Napięcie przyłączenia',
  przylaczenieSk: 'Moc zwarciowa Sk″',
  przylaczenieIk: 'Prąd zwarciowy Ik″',
  przylaczenieWieleZrodel: (n: number) => `+${n - 1} kolejne źródło sieciowe`,
  przylaczenieGeneracja: 'Generacja zainstalowana',
  przylaczenieOdbiory: 'Obciążenie zainstalowane',
  przylaczenieNetto: 'Bilans netto (gen. − odb.)',
  jednMva: 'MVA',
  jednKa: 'kA',
  jednKv: 'kV',
  jednMw: 'MW',
} as const;

/** Liczba w formacie PL (przecinek dziesiętny) z zadaną liczbą miejsc; null → „—". */
export function fmtLiczbaPL(wartosc: number | null | undefined, miejsca: number): string {
  if (wartosc === null || wartosc === undefined || Number.isNaN(wartosc)) return '—';
  return wartosc.toFixed(miejsca).replace('.', ',');
}

/** Etykieta PL statusu wyników przypadku (tag). */
export const STATUS_WYNIKOW_LABEL: Record<StudyCaseResultStatus, string> = {
  NONE: 'brak',
  FRESH: 'aktualne',
  OUTDATED: 'nieaktualne',
};

/** „Model: rew. {n}" — rewizja bieżącego modelu sieci (karta §4). */
export function rewizjaModeluLabel(rewizja: number): string {
  return `Model: rew. ${rewizja}`;
}

/** Skrócony odcisk (pierwsze 10 znaków sumy kontrolnej) — pełny w atrybucie title. */
export function odciskKrotki(hash: string): string {
  return hash.slice(0, 10);
}

/**
 * Format czasu przebiegu z sygnatury ISO ze store'a (deterministyczny, bez
 * `Date`/strefy czasowej — karta §5: czas formatowany z danych store'a).
 * „2026-07-15T14:32:00Z" → „2026-07-15 14:32". Wejście spoza wzorca zwracane bez zmian.
 */
export function formatCzasPrzebiegu(iso: string | null): string {
  if (!iso) return '—';
  const dopasowanie = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return dopasowanie ? `${dopasowanie[1]} ${dopasowanie[2]}` : iso;
}
