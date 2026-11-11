/*
 * Model danych wyszukiwarki poleceń (okno W-105, karta E1.5 §2). JEDEN
 * kształt pozycji dla wszystkich grup wyników (przestrzenie/polecenia/
 * obiekty/przykłady/pomoc) — SPEC_UKLAD_PANELI §2.2. `CommandPalette` jest
 * w pełni sterowany propsami i agnostyczny wobec źródła danych — budowa
 * indeksu jest zakresem `searchIndex.ts`.
 *
 * Karta K1 POWLOKA: pozycja nie ma już progu trybu zaawansowania — trzy tryby
 * ukrywały wyłącznie kontrolki i zostały zastąpione jednym przełącznikiem
 * „Szczegóły audytowe", który jest zwykłym poleceniem palety.
 */

/** Grupa wyniku wyszukiwania — stała kolejność nagłówków (karta §4). */
export type GrupaWyszukiwania =
  | 'przestrzenie'
  /** D4: okna E-XX — zdolność przeniesiona z drugiej, skasowanej palety. */
  | 'ekrany'
  | 'polecenia'
  | 'obiekty'
  | 'przyklady'
  | 'pomoc';

/** Kolejność grup w wynikach i nagłówkach (karta §4: Przestrzenie, Polecenia, Obiekty, Gotowe przykłady, Pomoc). */
export const KOLEJNOSC_GRUP: readonly GrupaWyszukiwania[] = [
  'przestrzenie',
  'ekrany',
  'polecenia',
  'obiekty',
  'przyklady',
  'pomoc',
];

/** Pozycja wyniku wyszukiwania (karta §2: id, etykietaPL, grupa, akcja). */
export interface PozycjaWyszukiwania {
  id: string;
  etykietaPL: string;
  grupa: GrupaWyszukiwania;
  /**
   * Dodatkowe słowa, po których pozycja ma być odnajdywana, choć nie widać ich
   * w etykiecie (D4, parytet ze skasowaną paletą `ui/network-build`: okno E-XX
   * było wyszukiwalne po kodzie ekranu i nazwie skróconej, nie tylko po pełnej).
   */
  slowaKluczowe?: string;
  /**
   * Rzeczywista akcja pozycji. Wołana przez warstwę integrującą (karta
   * zarządcy) — sam dialog `CommandPalette` NIE wywołuje `akcja` bezpośrednio,
   * wyłącznie zgłasza wybór przez `onWykonaj(pozycja)` (komponent w pełni
   * sterowany propsami, karta §2).
   */
  akcja: () => void;
}
