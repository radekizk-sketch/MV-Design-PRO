/**
 * Zwijanie jednakowych braków — JEDNA reguła dla kart i inspektorów, które stawiają serię
 * wierszy „etykieta: brak” (standard warsztatu KD6, kontrakt prezentacji §10 pkt 1, 4, 6).
 *
 * Karta pola wyświetlała jedenaście wierszy „brak telemetrii” jeden pod drugim i kilkanaście
 * wierszy „nie podano” — ściana tego samego słowa, w której ginie informacja. Reguła:
 *  - wiersze sekcji, których wartość jest TYM SAMYM brakiem (np. „brak telemetrii”), gdy jest
 *    ich co najmniej `PROG_ZWIJANIA`, tworzą jedną grupę: jeden wiersz z liczbą pozycji i listą
 *    nazw (rozwinięcie na żądanie, gdy nazw jest więcej niż `PROG_LISTY_W_WIERSZU`);
 *  - pojedynczy brak zostaje zwykłym wierszem (zwinięcie jednego wiersza nic nie oszczędza);
 *  - wiersze z wartością i wiersze wyłączone przez wołającego (np. edytowalne) nie są zwijane
 *    i zachowują kolejność;
 *  - sekcja, której WSZYSTKIE wiersze tworzą jedną grupę, jest „pusta”: wołający pokazuje ją
 *    jedną linią (tytuł sekcji + brak + liczba).
 * Zero domysłu: reguła nie rozstrzyga, co jest brakiem — dostaje to od wołającego (`brakWiersza`).
 */

/** Najmniejsza liczba jednakowych braków zwijana do jednego wiersza. */
export const PROG_ZWIJANIA = 2;

/** Do tylu nazw lista braków stoi w samym wierszu; więcej — rozwinięcie na żądanie. */
export const PROG_LISTY_W_WIERSZU = 3;

export interface GrupaBrakow<T> {
  /** Tekst braku wspólny dla grupy, np. „brak telemetrii”. */
  readonly brak: string;
  readonly pozycje: readonly T[];
}

export type ElementPodzialu<T> =
  | { readonly rodzaj: 'wiersz'; readonly pozycja: T }
  | { readonly rodzaj: 'grupa'; readonly grupa: GrupaBrakow<T> };

export interface PodzialBrakow<T> {
  /** Elementy w kolejności pierwszego wystąpienia (grupa stoi w miejscu swojego 1. wiersza). */
  readonly elementy: readonly ElementPodzialu<T>[];
  /** Cała sekcja to jedna grupa jednakowego braku. */
  readonly pusta: GrupaBrakow<T> | null;
}

/**
 * Dzieli wiersze na zwykłe i grupy jednakowych braków.
 * @param brakWiersza tekst braku wiersza albo `null`, gdy wiersz niesie wartość lub nie może być
 *   zwinięty (ten sam predykat decyduje o wejściu do grupy i o wyjściu z niej — jedno źródło).
 */
export function podzielNaBraki<T>(
  pozycje: readonly T[],
  brakWiersza: (pozycja: T) => string | null,
): PodzialBrakow<T> {
  const grupy = new Map<string, T[]>();
  for (const p of pozycje) {
    const brak = brakWiersza(p);
    if (brak === null) continue;
    const lista = grupy.get(brak);
    if (lista) lista.push(p);
    else grupy.set(brak, [p]);
  }
  const zwijane = new Set([...grupy].filter(([, lista]) => lista.length >= PROG_ZWIJANIA).map(([b]) => b));
  const elementy: ElementPodzialu<T>[] = [];
  const postawione = new Set<string>();
  for (const p of pozycje) {
    const brak = brakWiersza(p);
    if (brak === null || !zwijane.has(brak)) {
      elementy.push({ rodzaj: 'wiersz', pozycja: p });
      continue;
    }
    if (postawione.has(brak)) continue;
    postawione.add(brak);
    elementy.push({ rodzaj: 'grupa', grupa: { brak, pozycje: grupy.get(brak) ?? [] } });
  }
  const jedyny = elementy.length === 1 ? elementy[0] : null;
  return { elementy, pusta: jedyny && jedyny.rodzaj === 'grupa' ? jedyny.grupa : null };
}

/** Polska odmiana liczebnika: 1 sygnał, 2–4 sygnały, 5+ sygnałów (12–14 — forma mnoga). */
export function odmianaLiczby(liczba: number, formy: readonly [string, string, string]): string {
  const [jeden, kilka, wiele] = formy;
  if (liczba === 1) return jeden;
  const d = liczba % 10;
  const s = liczba % 100;
  return d >= 2 && d <= 4 && (s < 12 || s > 14) ? kilka : wiele;
}

export const FORMY_POZYCJI: readonly [string, string, string] = ['pozycja', 'pozycje', 'pozycji'];
export const FORMY_SYGNALU: readonly [string, string, string] = ['sygnał', 'sygnały', 'sygnałów'];

/** „brak telemetrii (11 sygnałów)” — opis grupy w jednym wierszu. */
export function opisGrupy(grupa: GrupaBrakow<unknown>, formy: readonly [string, string, string] = FORMY_POZYCJI): string {
  const n = grupa.pozycje.length;
  return `${grupa.brak} (${n} ${odmianaLiczby(n, formy)})`;
}
