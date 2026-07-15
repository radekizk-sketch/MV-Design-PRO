/*
 * Teksty wyszukiwarki poleceń (okno W-105, karta E1.5 §4) — wyłącznie
 * polski język techniczny (MODEL_INTERAKCJI §2.7). Dokładne stringi wg karty.
 */

import type { GrupaWyszukiwania, TrybZaawansowania } from './searchModel';

export const SEARCH_STRINGS = {
  polePlaceholder: 'Szukaj poleceń, obiektów, okien…',
  grupaPrzestrzenie: 'Przestrzenie',
  grupaPolecenia: 'Polecenia',
  grupaObiekty: 'Obiekty',
  grupaPrzyklady: 'Gotowe przykłady',
  grupaPomoc: 'Pomoc',
  podpowiedzPusta: 'Zacznij pisać…',
  przelaczIOtworz: 'Przełącz i otwórz',
  anuluj: 'Anuluj',
} as const;

const ETYKIETY_GRUP: Record<GrupaWyszukiwania, string> = {
  przestrzenie: SEARCH_STRINGS.grupaPrzestrzenie,
  polecenia: SEARCH_STRINGS.grupaPolecenia,
  obiekty: SEARCH_STRINGS.grupaObiekty,
  przyklady: SEARCH_STRINGS.grupaPrzyklady,
  pomoc: SEARCH_STRINGS.grupaPomoc,
};

/** Nagłówek PL grupy wyników (karta §4). */
export function etykietaGrupy(grupa: GrupaWyszukiwania): string {
  return ETYKIETY_GRUP[grupa];
}

const ETYKIETY_TRYBOW: Record<TrybZaawansowania, string> = {
  basic: 'Podstawowy',
  extended: 'Rozszerzony',
  expert: 'Ekspercki',
};

/** Etykieta PL trybu zaawansowania (zamrożone wartości jak `ui2/shell/modeModel.ts`). */
export function etykietaTrybu(tryb: TrybZaawansowania): string {
  return ETYKIETY_TRYBOW[tryb];
}

/** „Brak wyników dla „{fraza}"" (karta §4). */
export function brakWynikowLabel(fraza: string): string {
  return `Brak wyników dla „${fraza}"`;
}

/** „Dostępne w trybie {tryb} — przełączyć?" (karta §4). */
export function potwierdzTrybLabel(tryb: TrybZaawansowania): string {
  return `Dostępne w trybie ${etykietaTrybu(tryb)} — przełączyć?`;
}
