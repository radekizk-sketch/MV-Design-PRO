/*
 * Dopasowanie i ranking wyników wyszukiwarki poleceń (okno W-105, karta
 * E1.5 §5.1): prefiks > podciąg > rozmyte (podciąg rozproszony w tej samej
 * kolejności znaków), zawsze deterministyczne — bez `Math.random`, bez
 * zależności od czasu. Remisy rangi rozstrzyga `etykietaPL.localeCompare('pl')`.
 *
 * Fraza i etykieta są normalizowane (małe litery + usunięcie znaków
 * diakrytycznych), więc dopasowanie działa niezależnie od polskich ogonków
 * po obu stronach (np. „zrodlo" dopasowuje „źródło" i odwrotnie).
 */

export type TypDopasowania = 'prefiks' | 'podciag' | 'rozmyte';

export interface WynikDopasowania {
  typ: TypDopasowania;
  /** Indeks pierwszego dopasowanego znaku w znormalizowanej etykiecie (mniejszy = lepszy). */
  pozycja: number;
}

const RANGA_TYPU: Record<TypDopasowania, number> = { prefiks: 0, podciag: 1, rozmyte: 2 };

/** Małe litery + usunięcie znaków diakrytycznych (dopasowanie bez i z polskimi ogonkami). */
export function znormalizuj(tekst: string): string {
  return tekst
    .toLocaleLowerCase('pl')
    .replace(/ł/g, 'l') // znak ł nie dekomponuje się przez NFD (nie jest znakiem bazowym + akcentem)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Dopasowuje `fraza` do `etykieta`; `null` gdy brak dopasowania lub pusta fraza. */
export function dopasuj(fraza: string, etykieta: string): WynikDopasowania | null {
  const f = znormalizuj(fraza.trim());
  if (f === '') return null;
  const e = znormalizuj(etykieta);

  if (e.startsWith(f)) return { typ: 'prefiks', pozycja: 0 };

  const indeksPodciagu = e.indexOf(f);
  if (indeksPodciagu >= 0) return { typ: 'podciag', pozycja: indeksPodciagu };

  let wskaznikFrazy = 0;
  let pierwszaPozycja = -1;
  for (let i = 0; i < e.length && wskaznikFrazy < f.length; i++) {
    if (e[i] === f[wskaznikFrazy]) {
      if (wskaznikFrazy === 0) pierwszaPozycja = i;
      wskaznikFrazy++;
    }
  }
  if (wskaznikFrazy === f.length) return { typ: 'rozmyte', pozycja: pierwszaPozycja };
  return null;
}

/** Porządek dwóch dopasowań: ranga typu → pozycja dopasowania → `etykietaPL.localeCompare('pl')`. */
export function porownajDopasowania(
  a: { wynik: WynikDopasowania; etykietaPL: string },
  b: { wynik: WynikDopasowania; etykietaPL: string },
): number {
  if (a.wynik.typ !== b.wynik.typ) return RANGA_TYPU[a.wynik.typ] - RANGA_TYPU[b.wynik.typ];
  if (a.wynik.pozycja !== b.wynik.pozycja) return a.wynik.pozycja - b.wynik.pozycja;
  return a.etykietaPL.localeCompare(b.etykietaPL, 'pl');
}

/**
 * Filtruje i sortuje elementy wg dopasowania do `fraza` (deterministycznie —
 * prefiks > podciąg > rozmyte, remisy po etykiecie PL). Pusta fraza zwraca
 * pustą listę (stan „pusta fraza" obsługuje wołający — karta §4).
 */
export function filtrujISortuj<T>(
  fraza: string,
  elementy: readonly T[],
  etykieta: (element: T) => string,
): T[] {
  const dopasowane: Array<{ element: T; wynik: WynikDopasowania; etykietaPL: string }> = [];
  for (const element of elementy) {
    const etykietaPL = etykieta(element);
    const wynik = dopasuj(fraza, etykietaPL);
    if (wynik) dopasowane.push({ element, wynik, etykietaPL });
  }
  dopasowane.sort(porownajDopasowania);
  return dopasowane.map((d) => d.element);
}
