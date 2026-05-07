/**
 * Snap — Phase 2 (operator-grade SLD plan v2).
 *
 * Pure functions dla snap-to-grid + snap-to-port. Operator może wybrać
 * tryb snap przez `setSnapMode('grid' | 'port' | 'off')`. Pure — bez
 * React deps.
 *
 * Acceptance Invariants 7 + 17:
 *   - Manual geometry zmienia layout_hash only (brak topology mutacji).
 *   - Deterministic placement (brak RNG, snap → grid base).
 *
 * @see SLD_CAD_INTERACTION_SPEC.md
 */

import { snapToGrid as themeSnapToGrid } from '../theme/tokens';

/** SnapMode — operator-controlled. */
export type SnapMode = 'grid' | 'port' | 'off';

export interface SnapPoint {
  readonly x: number;
  readonly y: number;
}

export interface PortSnapTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind?: string;
}

/**
 * Snap-to-grid: world coordinate → najbliższy grid point.
 * Używa GRID_BASE_PX z theme/tokens.
 */
export function snapPointToGrid(point: SnapPoint): SnapPoint {
  return {
    x: themeSnapToGrid(point.x),
    y: themeSnapToGrid(point.y),
  };
}

/**
 * Snap-to-port: znajduje najbliższy port w `tolerance` Manhattan distance.
 * Zwraca port lub null gdy żaden nie jest blisko.
 *
 * Tolerance jest podane w world coordinates (NIE pixels — operator-grade,
 * niezależnie od scale).
 *
 * Determinizm: gdy ≥2 portów w tolerance, wybiera ten z najmniejszym
 * Manhattan distance. Tie-breaker: id.localeCompare (alfabetycznie).
 */
export function snapToPort(
  point: SnapPoint,
  ports: readonly PortSnapTarget[],
  tolerance: number,
): PortSnapTarget | null {
  let nearest: PortSnapTarget | null = null;
  let nearestDist = Infinity;
  for (const port of ports) {
    const dist = Math.abs(port.x - point.x) + Math.abs(port.y - point.y);
    if (dist > tolerance) continue;
    if (dist < nearestDist) {
      nearest = port;
      nearestDist = dist;
    } else if (dist === nearestDist && nearest) {
      // Tie-breaker: alfabetyczny id ASC.
      if (port.id.localeCompare(nearest.id) < 0) {
        nearest = port;
      }
    }
  }
  return nearest;
}

/**
 * Apply snap mode: zwraca point po zastosowaniu snap mode.
 *
 * - 'off': zwraca point bez zmian.
 * - 'grid': snap do grid.
 * - 'port': próbuje snap to port; jeśli żaden w tolerance, snap to grid (fallback).
 */
export function applySnapMode(
  point: SnapPoint,
  mode: SnapMode,
  options: {
    readonly ports?: readonly PortSnapTarget[];
    readonly portTolerance?: number;
  } = {},
): { snapped: SnapPoint; portTarget: PortSnapTarget | null } {
  if (mode === 'off') {
    return { snapped: point, portTarget: null };
  }
  if (mode === 'port' && options.ports && options.portTolerance !== undefined) {
    const portTarget = snapToPort(point, options.ports, options.portTolerance);
    if (portTarget) {
      return { snapped: { x: portTarget.x, y: portTarget.y }, portTarget };
    }
    // Fallback do grid gdy żaden port nie w tolerance
    return { snapped: snapPointToGrid(point), portTarget: null };
  }
  // 'grid' lub 'port' bez portów
  return { snapped: snapPointToGrid(point), portTarget: null };
}

/**
 * Snap state — operator UI controller.
 * Trzymane w workspace state, propagowane do CadOverlay.
 */
export interface SnapState {
  readonly mode: SnapMode;
  readonly gridVisible: boolean;
  readonly portTolerance: number; // domyślnie 12 (px world)
}

export const DEFAULT_SNAP_STATE: SnapState = {
  mode: 'grid',
  gridVisible: true,
  portTolerance: 12,
};

/** State setters — pure, immutable. */
export function setSnapMode(state: SnapState, mode: SnapMode): SnapState {
  if (state.mode === mode) return state;
  return { ...state, mode };
}

export function setGridVisible(state: SnapState, visible: boolean): SnapState {
  if (state.gridVisible === visible) return state;
  return { ...state, gridVisible: visible };
}

export function setPortTolerance(state: SnapState, tolerance: number): SnapState {
  if (state.portTolerance === tolerance) return state;
  return { ...state, portTolerance: Math.max(0, tolerance) };
}
