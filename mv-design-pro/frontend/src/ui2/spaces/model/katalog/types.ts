/**
 * Typy lokalne przeglądarki katalogu (przestrzeń „Model sieci" → zakładka Katalog).
 *
 * Katalog jest NIEZMIENNY (kanon katalog-first, CLAUDE.md §10). Ten moduł
 * wyłącznie CZYTA katalog i snapshot — nie mutuje żadnego typu ani elementu.
 *
 * Kształty pozycji odwzorowują realne API `/api/catalog/*`
 * (backend: `backend/src/api/catalog.py`, typy: `ui/catalog/types.ts`).
 */

/**
 * Identyfikatory kategorii katalogu prezentowanych w przeglądarce.
 * Odwzorowują realne endpointy `/api/catalog/*` (patrz `katalogAdapter.ts`).
 */
export type KategoriaId =
  | 'LINIA'
  | 'KABEL'
  | 'TRANSFORMATOR'
  | 'APARAT'
  | 'FALOWNIK';

/**
 * Pojedyncza pozycja katalogu w postaci znormalizowanej dla widoku.
 * `id`, `name`, `manufacturer` to pola bazowe (`ui/catalog/types.ts` → CatalogType).
 * Pozostałe pola techniczne są odczytywane po kluczu API przez słownik definicji.
 */
export type KatalogPozycja = {
  id: string;
  name: string;
  manufacturer?: string | null;
} & Record<string, unknown>;

/**
 * Typ wartości parametru w karcie technicznej.
 * `liczba` → formatowanie mono z jednostką; `tekst` → wartość dosłowna (np. grupa połączeń).
 */
export type TypWartosci = 'liczba' | 'tekst';

/**
 * Definicja parametru katalogowego — symbol branżowy, etykieta PL, jednostka,
 * norma źródłowa. Klucz w słowniku = nazwa pola API (np. `uk_percent`).
 */
export interface DefinicjaParametru {
  /** Symbol branżowy, np. „uk", „Sn", „In" (nomenklatura dozwolona). */
  symbol: string;
  /** Etykieta PL parametru (bez snake_case). */
  etykieta: string;
  /** Jednostka SI/branżowa, np. „kV", „Ω/km", „%". Pusta dla wielkości bezwymiarowych/tekstowych. */
  jednostka: string;
  /** Typ wartości: liczba (formatowana) lub tekst (dosłownie). */
  typ: TypWartosci;
  /** Liczba miejsc dziesiętnych dla wartości liczbowych. */
  miejscaDziesietne?: number;
  /** Zwięzła definicja PL znaczenia parametru (bez zgadywania). */
  definicja: string;
  /** Norma źródłowa (np. „IEC 60909-0"). */
  norma: string;
}

/**
 * Element modelu (ze snapshotu) używający danego typu katalogowego.
 * Read-only projekcja snapshotu — pole wiążące to `catalog_ref`
 * (patrz `ui/catalog/catalogSnapshot.ts`).
 */
export interface ElementUzycia {
  /** Referencja elementu w modelu (do nawigacji). */
  ref: string;
  /** Etykieta PL elementu do wyświetlenia. */
  etykieta: string;
  /** Referencja katalogowa elementu (id pozycji katalogu) — klucz łączenia. */
  catalog_ref: string | null;
  /** Opcjonalny rodzaj elementu (np. „Linia", „Transformator") — do podtytułu. */
  rodzaj?: string | null;
}

/** Loader typów dla kategorii — wstrzykiwany do panelu (testy podają stub). */
export type LadowaczTypow = (kategoria: KategoriaId) => Promise<KatalogPozycja[]>;
