/*
 * Teksty wyszukiwarki poleceń (okno W-105, karta E1.5 §4) — wyłącznie
 * polski język techniczny (MODEL_INTERAKCJI §2.7). Dokładne stringi wg karty.
 */

import type { GrupaWyszukiwania } from './searchModel';

export const SEARCH_STRINGS = {
  polePlaceholder: 'Szukaj poleceń, obiektów, okien…',
  grupaPrzestrzenie: 'Przestrzenie',
  grupaEkrany: 'Ekrany',
  grupaPolecenia: 'Polecenia',
  grupaObiekty: 'Obiekty',
  grupaPrzyklady: 'Gotowe przykłady',
  grupaPomoc: 'Pomoc',
  podpowiedzPusta: 'Zacznij pisać…',
} as const;

const ETYKIETY_GRUP: Record<GrupaWyszukiwania, string> = {
  przestrzenie: SEARCH_STRINGS.grupaPrzestrzenie,
  ekrany: SEARCH_STRINGS.grupaEkrany,
  polecenia: SEARCH_STRINGS.grupaPolecenia,
  obiekty: SEARCH_STRINGS.grupaObiekty,
  przyklady: SEARCH_STRINGS.grupaPrzyklady,
  pomoc: SEARCH_STRINGS.grupaPomoc,
};

/** Nagłówek PL grupy wyników (karta §4). */
export function etykietaGrupy(grupa: GrupaWyszukiwania): string {
  return ETYKIETY_GRUP[grupa];
}

/** „Brak wyników dla „{fraza}"" (karta §4). */
export function brakWynikowLabel(fraza: string): string {
  return `Brak wyników dla „${fraza}"`;
}
