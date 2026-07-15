/**
 * Selektor wejścia aplikacji (karta E1.7b) — KRÓTKOŻYCIOWY szew parytetowy.
 *
 * Domyślnie renderowana jest STARA powłoka (App). Nową powłokę (AppRoot, ui2)
 * włącza jawnie:
 *  - parametr adresu `?powloka=nowa` (w części search LUB w zapytaniu hash), albo
 *  - `localStorage['mvdp.powloka'] = 'nowa'`.
 * Parametr `?powloka=stara` wymusza starą powłokę niezależnie od localStorage.
 *
 * ZERO zmiany zachowania domyślnego w E1.7b. Szew znika w E1.7c
 * (przełączenie domyślne + kasacja starej ramy).
 */

export type WyborWejscia = 'stare' | 'nowe';

export const KLUCZ_POWLOKI = 'mvdp.powloka';
const PARAMETR = 'powloka';

function parametrPowloki(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const zSearch = new URLSearchParams(window.location.search).get(PARAMETR);
  if (zSearch) {
    return zSearch;
  }
  const hash = window.location.hash || '';
  const indeksZapytania = hash.indexOf('?');
  if (indeksZapytania < 0) {
    return null;
  }
  return new URLSearchParams(hash.slice(indeksZapytania + 1)).get(PARAMETR);
}

export function wybierzWejscie(): WyborWejscia {
  const parametr = parametrPowloki();
  if (parametr === 'nowa') {
    return 'nowe';
  }
  if (parametr === 'stara') {
    return 'stare';
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(KLUCZ_POWLOKI) === 'nowa') {
      return 'nowe';
    }
  } catch {
    // Brak dostępu do localStorage (np. tryb prywatny) — pozostaje wejście domyślne.
  }
  return 'stare';
}
