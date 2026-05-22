/**
 * CAD Routing Contract — ortogonalne trasowanie z snap do portów + siatki.
 *
 * Wymaganie #4 z /goal: Mechanizmy CAD zapewniają:
 *   - ortogonalne trasowanie (kierunki horiz/vert tylko)
 *   - siatkę (grid snap, domyślnie 8px lub 10px)
 *   - punkt przyciągania do portów symboli IEC
 *   - prowadnice (guide lines)
 *   - manualne punkty załamania (waypoints)
 *   - możliwość blokowania/odblokowania trasy (locked routes)
 *   - klarowne warstwy (tor mocy / wyniki / błędy)
 *
 * Ten moduł dostarcza pure functions używane przez routing engine SLD
 * oraz CadOverlay. Integruje się z istniejącym L-shape routing w
 * `geometry/routing.ts` jako rozszerzenie ortogonalne.
 */

/** Punkt 2D w przestrzeni canvas. */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** Kierunek port'a (gdzie ‘wchodzi’/‘wychodzi’ przewód). */
export type PortDirection = 'north' | 'south' | 'east' | 'west';

/** Port symbolu z lokalnymi współrzędnymi + kierunkiem. */
export interface SymbolPort {
  readonly id: string;
  readonly local: Point2D;
  readonly direction: PortDirection;
}

/** Symbol z pozycją absolutną + listą portów. */
export interface PositionedSymbol {
  readonly id: string;
  readonly position: Point2D;
  readonly ports: readonly SymbolPort[];
}

/** Warstwa rendering — wpływa na z-order i kolor. */
export type CadLayer =
  | 'power_flow'      // Tor mocy — najwyższa warstwa, czytelny kolor
  | 'cables'          // Kable / linie domeny
  | 'results'         // Wyniki obliczeń (overlay)
  | 'errors'          // Błędy / blokady
  | 'measurements'    // Punkty pomiarowe
  | 'protection'      // Strefy zabezpieczeń
  | 'guides';         // Prowadnice CAD

/** Kanoniczne kolory per warstwa (theme-driven). */
export const CAD_LAYER_COLOR: Readonly<Record<CadLayer, string>> = {
  power_flow:   '#00d4ff',  // cyan — tor mocy
  cables:       '#fbbf24',  // amber — kable SN
  results:      '#a78bfa',  // fioletowy — wyniki
  errors:       '#ef4444',  // red — błędy / blokady
  measurements: '#22c55e',  // zielony — pomiary
  protection:   '#ec4899',  // pink — strefy zabezpieczeń
  guides:       '#4a6a8a',  // gray — prowadnice
};

/** Z-order per warstwa (niższy = pod spodem). */
export const CAD_LAYER_Z_ORDER: Readonly<Record<CadLayer, number>> = {
  guides:       0,
  cables:       10,
  measurements: 20,
  protection:   30,
  results:      40,
  power_flow:   50,
  errors:       100, // zawsze najwyżej
};

/** Stała siatki — pixel snap. */
export const CAD_GRID_BASE_PX = 8;

/**
 * Snap pojedynczego punktu do siatki.
 *   snap(7) → 8 (grid=8)
 *   snap(17) → 16
 *   snap(20) → 24
 */
export function snapToGrid(value: number, gridPx: number = CAD_GRID_BASE_PX): number {
  if (gridPx <= 0) return value;
  return Math.round(value / gridPx) * gridPx;
}

/** Snap punktu 2D do siatki. */
export function snapPointToGrid(point: Point2D, gridPx: number = CAD_GRID_BASE_PX): Point2D {
  return {
    x: snapToGrid(point.x, gridPx),
    y: snapToGrid(point.y, gridPx),
  };
}

/**
 * Oblicza absolutną pozycję portu (symbol position + port local).
 */
export function getAbsolutePortPosition(
  symbol: PositionedSymbol,
  portId: string,
): Point2D | null {
  const port = symbol.ports.find((p) => p.id === portId);
  if (!port) return null;
  return {
    x: symbol.position.x + port.local.x,
    y: symbol.position.y + port.local.y,
  };
}

/**
 * Snap-distance threshold dla portów (px).
 * Operator widzi "magnetyczny" snap gdy kursor w tej odległości.
 */
export const PORT_SNAP_THRESHOLD_PX = 12;

/**
 * Znajduje najbliższy port do danego punktu (cursor position).
 * Zwraca null jeśli żaden port nie jest w threshold.
 */
export function findNearestPort(
  cursor: Point2D,
  symbols: readonly PositionedSymbol[],
  threshold: number = PORT_SNAP_THRESHOLD_PX,
): { readonly symbol: PositionedSymbol; readonly port: SymbolPort; readonly distance: number } | null {
  let best: { symbol: PositionedSymbol; port: SymbolPort; distance: number } | null = null;
  for (const symbol of symbols) {
    for (const port of symbol.ports) {
      const abs = {
        x: symbol.position.x + port.local.x,
        y: symbol.position.y + port.local.y,
      };
      const dx = abs.x - cursor.x;
      const dy = abs.y - cursor.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= threshold && (best === null || distance < best.distance)) {
        best = { symbol, port, distance };
      }
    }
  }
  return best;
}

/**
 * Buduje ortogonalną ścieżkę między dwoma punktami z waypoint'ami.
 *
 * Reguły:
 *   - Każdy segment jest poziomy LUB pionowy (nigdy diagonalny)
 *   - Pierwszy segment odchodzi w kierunku portu źródłowego (z direction)
 *   - Ostatni segment dochodzi do portu docelowego (z direction)
 *   - Waypoints (jeśli podane) wymuszają punkty załamania
 *   - Zwraca listę punktów (≥ 2)
 */
export interface OrthogonalRouteInput {
  readonly from: Point2D;
  readonly fromDirection: PortDirection;
  readonly to: Point2D;
  readonly toDirection: PortDirection;
  /** Opcjonalne ręczne waypoints. */
  readonly waypoints?: readonly Point2D[];
  /** Grid snap (default CAD_GRID_BASE_PX). */
  readonly gridPx?: number;
}

export function buildOrthogonalRoute(input: OrthogonalRouteInput): readonly Point2D[] {
  const grid = input.gridPx ?? CAD_GRID_BASE_PX;
  const fromS = snapPointToGrid(input.from, grid);
  const toS = snapPointToGrid(input.to, grid);

  // Jeśli waypoints podane — szanuj je, połącz ortogonalnie.
  if (input.waypoints && input.waypoints.length > 0) {
    const points: Point2D[] = [fromS];
    let last = fromS;
    for (const wp of input.waypoints) {
      const snapped = snapPointToGrid(wp, grid);
      // Dodaj L-shape między last a snapped.
      points.push({ x: snapped.x, y: last.y });
      points.push(snapped);
      last = snapped;
    }
    points.push({ x: toS.x, y: last.y });
    points.push(toS);
    return dedupConsecutive(points);
  }

  // Bez waypoints — auto L-shape lub Z-shape per directions.
  const points: Point2D[] = [fromS];
  // Reguła: jeśli source direction horizontal, idź najpierw poziomo
  const horizontalFirst = input.fromDirection === 'east' || input.fromDirection === 'west';
  if (horizontalFirst) {
    points.push({ x: toS.x, y: fromS.y });
  } else {
    points.push({ x: fromS.x, y: toS.y });
  }
  points.push(toS);
  return dedupConsecutive(points);
}

/** Usuwa kolejne identyczne punkty (clean-up route). */
function dedupConsecutive(points: readonly Point2D[]): readonly Point2D[] {
  const result: Point2D[] = [];
  for (const p of points) {
    const last = result[result.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) {
      result.push(p);
    }
  }
  return result;
}

/**
 * Waliduje czy ścieżka jest ortogonalna (każdy segment horiz lub vert).
 */
export function isOrthogonalRoute(points: readonly Point2D[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    // Segment musi być horiz (dy=0) lub vert (dx=0) — nigdy diagonalny.
    if (dx !== 0 && dy !== 0) return false;
  }
  return true;
}

/**
 * Długość ścieżki ortogonalnej (suma długości segmentów, Manhattan).
 */
export function manhattanLength(points: readonly Point2D[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}

/** Stan zablokowania trasy (locked = nie auto-routing). */
export interface RouteLockState {
  readonly routeId: string;
  readonly locked: boolean;
  readonly lockedBy?: string;
  readonly lockedAt?: string;
}

/**
 * Mapa lock states — używana w state managerze CAD.
 */
export class RouteLockRegistry {
  private locks = new Map<string, RouteLockState>();

  lock(routeId: string, lockedBy?: string): void {
    this.locks.set(routeId, {
      routeId,
      locked: true,
      lockedBy,
      lockedAt: new Date().toISOString(),
    });
  }

  unlock(routeId: string): void {
    this.locks.delete(routeId);
  }

  isLocked(routeId: string): boolean {
    return this.locks.get(routeId)?.locked === true;
  }

  getAllLocked(): readonly string[] {
    return Array.from(this.locks.keys());
  }
}
