/**
 * RouteEditor — Phase 2 (operator-grade SLD plan v2).
 *
 * Czyste funkcje (deterministyczne) dla manualnej edycji tras kabli/linii:
 *   - addBend(route, atIndex, point) — wstaw nowy bend point
 *   - dragBend(route, bendIdx, newPoint) — zmień pozycję bend point
 *   - removeBend(route, bendIdx) — usuń bend point
 *   - lockRoute(route) / unlockRoute(route) — zablokuj/odblokuj manualną geometrię
 *
 * Inwarianty:
 *   - Każda mutacja zwraca NOWY obiekt RouteSegment (immutability).
 *   - Bend points są zapisywane w `bendPoints[]` (sortowane po indeksie wstawienia).
 *   - `locked=true` chroni przed automatycznym recompute layout — operator
 *     może zablokować wybraną trasę po manualnym ułożeniu.
 *   - Hash triad: edycja bendów zmienia LAYOUT_HASH, NIE topology_hash.
 *
 * Acceptance Invariants 7 + 8:
 *   - Manualna geometria trasy zmienia layout_hash only, NIE topology_hash.
 *
 * @see SLD_CAD_INTERACTION_SPEC.md
 */

import { snapToGrid } from '../theme/tokens';
import type { Point } from './routing';

/**
 * Pełen `RouteSegment` z bend points + lock flag.
 *
 * `id` — stabilny identyfikator (zwykle segment_ref z ENM albo connection_id).
 * `bendPoints` — manualne kotwy ortogonalne (snap to grid).
 * `locked` — gdy true, layout engine NIE recompute'uje trasy.
 * `endpoints` — start/end points (z portów stacji/pól, NIE manualne).
 */
export interface RouteSegment {
  readonly id: string;
  readonly endpoints: { readonly start: Point; readonly end: Point };
  readonly bendPoints: readonly Point[];
  readonly locked: boolean;
}

/**
 * Tworzy świeży RouteSegment z startu/endu, bez bendów, niezablokowany.
 */
export function createRoute(id: string, start: Point, end: Point): RouteSegment {
  return {
    id,
    endpoints: { start: snapPoint(start), end: snapPoint(end) },
    bendPoints: [],
    locked: false,
  };
}

function snapPoint(p: Point): Point {
  return { x: snapToGrid(p.x), y: snapToGrid(p.y) };
}

/**
 * Wstawia nowy bend point na pozycji `atIndex` w bendPoints[].
 * Indeks 0 = przed pierwszym istniejącym bendem (po starcie).
 * Indeks bendPoints.length = po ostatnim bendzie (przed końcem).
 *
 * Out-of-range index → no-op (zwraca route niezmienione — FSM strict).
 * Locked route → no-op (operator musi explicit unlock).
 */
export function addBend(route: RouteSegment, atIndex: number, point: Point): RouteSegment {
  if (route.locked) return route;
  if (atIndex < 0 || atIndex > route.bendPoints.length) return route;
  const newBends = [...route.bendPoints];
  newBends.splice(atIndex, 0, snapPoint(point));
  return { ...route, bendPoints: newBends };
}

/**
 * Zmienia pozycję istniejącego bend point.
 * Out-of-range bendIdx → no-op.
 * Locked route → no-op.
 */
export function dragBend(route: RouteSegment, bendIdx: number, newPoint: Point): RouteSegment {
  if (route.locked) return route;
  if (bendIdx < 0 || bendIdx >= route.bendPoints.length) return route;
  const newBends = [...route.bendPoints];
  newBends[bendIdx] = snapPoint(newPoint);
  return { ...route, bendPoints: newBends };
}

/**
 * Usuwa bend point o indeksie `bendIdx`.
 * Out-of-range bendIdx → no-op.
 * Locked route → no-op.
 */
export function removeBend(route: RouteSegment, bendIdx: number): RouteSegment {
  if (route.locked) return route;
  if (bendIdx < 0 || bendIdx >= route.bendPoints.length) return route;
  const newBends = route.bendPoints.filter((_, i) => i !== bendIdx);
  return { ...route, bendPoints: newBends };
}

/**
 * Czyści wszystkie bend points (np. "reset to auto" w UI).
 * Locked route → no-op.
 */
export function clearBends(route: RouteSegment): RouteSegment {
  if (route.locked) return route;
  return { ...route, bendPoints: [] };
}

/**
 * Blokuje/odblokuje manualną geometrię trasy.
 * Idempotent — lockRoute(locked) → ten sam route.
 */
export function lockRoute(route: RouteSegment): RouteSegment {
  if (route.locked) return route;
  return { ...route, locked: true };
}

export function unlockRoute(route: RouteSegment): RouteSegment {
  if (!route.locked) return route;
  return { ...route, locked: false };
}

/**
 * Konwertuje RouteSegment do listy punktów (path) — start + bends + end.
 * Wszystkie punkty na grid.
 */
export function routeToPath(route: RouteSegment): readonly Point[] {
  return [route.endpoints.start, ...route.bendPoints, route.endpoints.end];
}

/**
 * Sprawdza czy ścieżka po dodaniu bend points jest ortogonalna.
 * Każda para sąsiednich punktów MUSI mieć ten sam X lub ten sam Y.
 * Używane przez RouteEditor do walidacji manualnych edycji.
 */
export function isRouteOrthogonal(route: RouteSegment): boolean {
  const path = routeToPath(route);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

/**
 * Zwraca minimalną odległość między dwoma punktami (Manhattan distance).
 * Używane do detekcji bendów które są zbyt blisko siebie (UI guard).
 */
export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * UI helper: sprawdza czy `point` jest "blisko" jakiegokolwiek bend point
 * (w promieniu `tolerance`). Używane do hover/click detection w CadOverlay.
 * Zwraca indeks bendu lub -1 gdy żaden nie jest blisko.
 */
export function findNearestBend(
  route: RouteSegment,
  point: Point,
  tolerance: number,
): number {
  let nearestIdx = -1;
  let nearestDist = Infinity;
  for (let i = 0; i < route.bendPoints.length; i++) {
    const d = manhattanDistance(route.bendPoints[i], point);
    if (d < tolerance && d < nearestDist) {
      nearestIdx = i;
      nearestDist = d;
    }
  }
  return nearestIdx;
}

/**
 * UI helper: znajduje optymalny indeks dla nowego bend point — taki,
 * który zachowa orthogonality. Zwraca indeks (do `addBend(route, idx, point)`)
 * lub -1 gdy nie ma sensownego miejsca.
 *
 * Heurystyka: znajduje segment (między dwoma punktami w path) który zawiera
 * `point` (lub jest najbliżej), zwraca indeks bend insertion w bendPoints[].
 */
export function suggestBendInsertionIndex(
  route: RouteSegment,
  point: Point,
): number {
  const path = routeToPath(route);
  if (path.length < 2) return -1;

  let bestSegmentIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    // Distance to segment from point (Manhattan-friendly approximation).
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const clampedX = Math.max(minX, Math.min(maxX, point.x));
    const clampedY = Math.max(minY, Math.min(maxY, point.y));
    const d = manhattanDistance(point, { x: clampedX, y: clampedY });
    if (d < bestDist) {
      bestDist = d;
      bestSegmentIdx = i;
    }
  }
  // bestSegmentIdx 0 = pierwszy segment (start → bend[0] lub start → end).
  // Insertion index w bendPoints[] = bestSegmentIdx (umieszczamy nowy bend
  // PRZED tym bendem który jest po segmencie).
  return bestSegmentIdx;
}
