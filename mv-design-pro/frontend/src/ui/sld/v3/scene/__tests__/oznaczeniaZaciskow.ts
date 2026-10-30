/**
 * WYROCZNIA POŁOŻENIA OZNACZEŃ ZACISKÓW PRZEKŁADNIKA (P1/P2) — wspólna dla testu sceny
 * (`zaciskiPrzekladnikaGpz.test.ts`) i testu kanwy (`canvas/__tests__/zaciskiPrzekladnikaNaKanwie.test.tsx`).
 *
 * Wymaganie (oględziny zrzutów Z.10 i Z.11.1 przez sesję główną, 2026-10-30): „P1 przy górnym
 * zacisku T1 (od szyny), P2 przy dolnym, oba po stronie przeciwnej do podpisu aparatu, bez
 * kolizji z podpisami aparatów i symbolami". Wyrocznia nie zna reguły kompozycji — dostaje
 * prostokąt oznaczenia, kafel przekładnika, wysokość zacisku i oczekiwaną stronę, a mierzy:
 *  · stronę — prostokąt w całości po prawej (lewej) krawędzi kafla;
 *  · odległość od KOTWICY ZACISKU — punktu, w którym linia zacisku (wysokość portu) przecina
 *    krawędź kafla po stronie oznaczenia: oznaczenie nie może wejść na kafel (bryła kolizji
 *    symbolu), więc najbliżej zacisku leży właśnie przy tej krawędzi. Stała
 *    `ODLEGLOSC_OD_ZACISKU_MAX` = 1/8 oczka: linia zacisku przechodzi przez wiersz oznaczenia
 *    albo jest jego krawędzią (dawny zaczep — wiersz całkiem nad zaciskiem górnym, po stronie
 *    podpisów — daje 48 j.św. od kotwicy po stronie przeciwnej);
 *  · zero przecięć z przeszkodami (bryły symboli, przewody z grubością sondy, inne etykiety).
 */
import { GRID, type V3Rect } from '../../core/grid';

export type StronaOznaczenia = 'right' | 'left';

/** Największa odległość prostokąta oznaczenia od kotwicy zacisku [j.św.]. */
export const ODLEGLOSC_OD_ZACISKU_MAX = GRID / 8;

const EPS = 1e-6;

export interface ZaciskDoOceny {
  /** Wysokość zacisku (port N albo S symbolu przekładnika) w świecie. */
  readonly y: number;
  /** Kafel symbolu przekładnika (bryła kolizji sceny). */
  readonly kafel: V3Rect;
  /** Strona, po której oznaczenie ma stać. */
  readonly strona: StronaOznaczenia;
}

export interface PrzeszkodaDoOceny {
  readonly opis: string;
  readonly rect: V3Rect;
}

/** Kotwica zacisku: linia zacisku na krawędzi kafla po stronie oznaczenia. */
export function kotwicaZacisku(z: ZaciskDoOceny): { readonly x: number; readonly y: number } {
  return { x: z.strona === 'right' ? z.kafel.x + z.kafel.width : z.kafel.x, y: z.y };
}

/** Odległość euklidesowa punktu od prostokąta (0, gdy punkt leży w prostokącie lub na krawędzi). */
export function odlegloscPunktuOdProstokata(r: V3Rect, p: { readonly x: number; readonly y: number }): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

const zachodzi = (a: V3Rect, b: V3Rect): boolean =>
  a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS && a.y < b.y + b.height - EPS && b.y < a.y + a.height - EPS;

/** Naruszenia wymagania dla jednego oznaczenia (pusta lista = oznaczenie przy zacisku). */
export function naruszeniaOznaczeniaZacisku(
  tekst: string,
  rect: V3Rect,
  zacisk: ZaciskDoOceny,
  przeszkody: readonly PrzeszkodaDoOceny[],
): string[] {
  const bledy: string[] = [];
  const k = kotwicaZacisku(zacisk);
  const poStronie = zacisk.strona === 'right' ? rect.x >= k.x - EPS : rect.x + rect.width <= k.x + EPS;
  if (!poStronie) bledy.push(`${tekst}: nie w całości po stronie ${zacisk.strona} kafla (${JSON.stringify(rect)}, krawędź ${k.x})`);
  const d = odlegloscPunktuOdProstokata(rect, k);
  if (d > ODLEGLOSC_OD_ZACISKU_MAX + EPS) {
    bledy.push(`${tekst}: ${d.toFixed(2)} j.św. od kotwicy zacisku (${k.x}, ${k.y}) > ${ODLEGLOSC_OD_ZACISKU_MAX}`);
  }
  for (const p of przeszkody) if (zachodzi(rect, p.rect)) bledy.push(`${tekst}: przecina ${p.opis} ${JSON.stringify(p.rect)}`);
  return bledy;
}
