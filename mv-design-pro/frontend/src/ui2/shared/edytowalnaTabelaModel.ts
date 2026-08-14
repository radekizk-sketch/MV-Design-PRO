/*
 * Model danych EDYTOWALNEJ TABELI (karta P0.9, plan F §5) — JEDNA implementacja
 * w `ui2/shared` na przyszłe tabele edytowalne (nN STUDIO/ODCINKI jest pierwszym
 * konsumentem). Projekt generyczny bez opcji spekulacyjnych: trzy rodzaje
 * edytora (liczba/wybór/akcja — dokładnie te, których potrzebuje tabela
 * odcinków nN: długość liczbowa, ułożenie z listy, kabel przez picker
 * katalogu), sortowanie i wirtualizacja okienkowa (próg jak `TabelaWynikow`,
 * ten sam rząd wielkości danych).
 *
 * Różnica wobec `wyniki/wzorzec/TabelaWynikow` (read-only, dowód WHITE BOX):
 * ta tabela EDYTUJE model przez operacje domenowe — komórka edytowalna commituje
 * zmianę WOŁAJĄCEMU (`onEdytuj`), który wykonuje operację; komponent sam NIC
 * nie zapisuje i nie liczy fizyki.
 */

export interface OpcjaWyboruTabeli {
  readonly id: string;
  readonly etykieta: string;
}

export type EdytorKomorki =
  | { readonly rodzaj: 'liczba'; readonly min?: number; readonly krok?: number; readonly jednostka?: string }
  | { readonly rodzaj: 'wybor'; readonly opcje: readonly OpcjaWyboruTabeli[] }
  | { readonly rodzaj: 'akcja'; readonly etykietaAkcji: string };

/** Definicja kolumny — deklaratywna, jak `DefinicjaKolumny` wzorca wyników. */
export interface KolumnaEdytowalna<T> {
  readonly klucz: string;
  readonly etykieta: string;
  readonly jednostka?: string;
  readonly mono?: boolean;
  readonly wyrownanie?: 'lewo' | 'prawo';
  readonly sortowalna?: boolean;
  /** Wartość WYŚWIETLANA (sformatowana) — zawsze wymagana, nawet dla kolumn edytowalnych. */
  readonly odczyt: (wiersz: T) => string;
  /** Klucz sortowania liczbowego, gdy `odczyt` zwraca sformatowany napis. */
  readonly sortKey?: (wiersz: T) => number | string;
  /** Przekroczony próg → tag ostrzegawczy (próg wyznacza adapter wywołujący, nie tabela). */
  readonly ostrzezenie?: (wiersz: T) => boolean;
  /** Wartość SUROWA do pola edycji (liczba dla `liczba`, id opcji dla `wybor`). */
  readonly wartoscEdycji?: (wiersz: T) => string | number | null;
  /** Brak = kolumna tylko do odczytu. */
  readonly edytor?: EdytorKomorki;
}

export type StanZapisuKomorki = 'idle' | 'zapisywanie' | 'blad';

/** Klucz sortowania efektywny (sortKey gdy podany, inaczej odczyt sformatowany). */
export function kluczSortKolumny<T>(kolumna: KolumnaEdytowalna<T>, wiersz: T): number | string {
  return kolumna.sortKey ? kolumna.sortKey(wiersz) : kolumna.odczyt(wiersz);
}

export interface StanSortowaniaTabeli {
  readonly klucz: string;
  readonly kierunek: 'rosnaco' | 'malejaco';
}

/** Stabilne, deterministyczne sortowanie (bez mutacji wejścia) — wzorzec `TabelaWynikow.posortuj`. */
export function posortujWiersze<T>(
  kolumny: readonly KolumnaEdytowalna<T>[],
  wiersze: readonly T[],
  sort: StanSortowaniaTabeli | null,
): T[] {
  if (!sort) return [...wiersze];
  const kolumna = kolumny.find((k) => k.klucz === sort.klucz);
  if (!kolumna) return [...wiersze];
  const kierunek = sort.kierunek === 'rosnaco' ? 1 : -1;
  return wiersze
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const ka = kluczSortKolumny(kolumna, a.w);
      const kb = kluczSortKolumny(kolumna, b.w);
      const cmp =
        typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'pl');
      return cmp !== 0 ? cmp * kierunek : a.i - b.i;
    })
    .map((x) => x.w);
}

/** Próg aktywacji wirtualizacji okienkowej — spójny z `TabelaWynikow.PROG_WIRTUALIZACJI`. */
export const PROG_WIRTUALIZACJI_TABELI = 500;
export const WYSOKOSC_WIERSZA_TABELI_PX = 36;
export const ZAPAS_WIERSZY_TABELI = 20;
export const WYSOKOSC_WIDOKU_TABELI_PX = 480;

export interface OknoWirtualizacji {
  readonly pierwszy: number;
  readonly ostatni: number;
  readonly wysGora: number;
  readonly wysDol: number;
}

export function obliczOknoWirtualizacji(liczbaWierszy: number, scrollTop: number): OknoWirtualizacji {
  if (liczbaWierszy <= PROG_WIRTUALIZACJI_TABELI) {
    return { pierwszy: 0, ostatni: liczbaWierszy, wysGora: 0, wysDol: 0 };
  }
  const liczbaWidocznych = Math.ceil(WYSOKOSC_WIDOKU_TABELI_PX / WYSOKOSC_WIERSZA_TABELI_PX);
  const indexStart = Math.floor(scrollTop / WYSOKOSC_WIERSZA_TABELI_PX);
  const pierwszy = Math.max(0, indexStart - ZAPAS_WIERSZY_TABELI);
  const ostatni = Math.min(liczbaWierszy, indexStart + liczbaWidocznych + ZAPAS_WIERSZY_TABELI);
  return {
    pierwszy,
    ostatni,
    wysGora: pierwszy * WYSOKOSC_WIERSZA_TABELI_PX,
    wysDol: (liczbaWierszy - ostatni) * WYSOKOSC_WIERSZA_TABELI_PX,
  };
}
