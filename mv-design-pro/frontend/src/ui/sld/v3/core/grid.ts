/**
 * SLD V3 — siatka i geometria bazowa (SLD_CAD_SPEC_V3 §2, P1/P4/P7).
 *
 * Wszystkie originy symboli, porty i wierzchołki tras leżą NA siatce GRID.
 * Czysta arytmetyka — zero DOM, zero losowości (determinizm P7).
 */

export const GRID = 8;

/** Przyciągnięcie wartości świata do siatki (najbliższy węzeł). */
export function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export function isOnGrid(value: number): boolean {
  return value % GRID === 0;
}

export interface V3Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function rectsOverlap(a: V3Rect, b: V3Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Kierunek wyprowadzenia portu (dokąd „patrzy" przewód wychodzący). */
export type PortDir = 'N' | 'S' | 'E' | 'W';

export interface SymbolPort {
  readonly name: string;
  /** Pozycja portu WZGLĘDEM originu symbolu (lewy-górny róg bboxa). */
  readonly x: number;
  readonly y: number;
  readonly dir: PortDir;
}
