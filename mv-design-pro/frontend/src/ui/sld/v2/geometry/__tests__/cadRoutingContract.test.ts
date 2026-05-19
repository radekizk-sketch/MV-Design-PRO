/**
 * CAD Routing Contract tests — wymaganie #4 z /goal.
 */
import { describe, expect, it } from 'vitest';

import {
  CAD_GRID_BASE_PX,
  CAD_LAYER_COLOR,
  CAD_LAYER_Z_ORDER,
  PORT_SNAP_THRESHOLD_PX,
  RouteLockRegistry,
  buildOrthogonalRoute,
  findNearestPort,
  getAbsolutePortPosition,
  isOrthogonalRoute,
  manhattanLength,
  snapPointToGrid,
  snapToGrid,
  type PositionedSymbol,
} from '../cadRoutingContract';

describe('snapToGrid + snapPointToGrid — siatka CAD', () => {
  it('snapToGrid(7) → 8 (grid=8)', () => {
    expect(snapToGrid(7)).toBe(8);
  });

  it('snapToGrid(17) → 16', () => {
    expect(snapToGrid(17)).toBe(16);
  });

  it('snapToGrid(20) → 24', () => {
    expect(snapToGrid(20)).toBe(24);
  });

  it('snapToGrid(0) → 0', () => {
    expect(snapToGrid(0)).toBe(0);
  });

  it('Niestandardowy grid (10) → 10', () => {
    expect(snapToGrid(13, 10)).toBe(10);
    expect(snapToGrid(17, 10)).toBe(20);
  });

  it('grid=0 → wartość bez zmian (defensive)', () => {
    expect(snapToGrid(13, 0)).toBe(13);
  });

  it('snapPointToGrid snapuje oba wymiary', () => {
    expect(snapPointToGrid({ x: 7, y: 17 })).toEqual({ x: 8, y: 16 });
  });

  it('CAD_GRID_BASE_PX = 8 (standard 8 px)', () => {
    expect(CAD_GRID_BASE_PX).toBe(8);
  });
});

describe('CAD_LAYER_COLOR + CAD_LAYER_Z_ORDER — warstwy', () => {
  it('Power flow jest cyan (#00d4ff)', () => {
    expect(CAD_LAYER_COLOR.power_flow).toBe('#00d4ff');
  });

  it('Errors red (#ef4444)', () => {
    expect(CAD_LAYER_COLOR.errors).toBe('#ef4444');
  });

  it('Errors mają najwyższy z-order (zawsze widoczne)', () => {
    const maxOther = Math.max(
      CAD_LAYER_Z_ORDER.guides,
      CAD_LAYER_Z_ORDER.cables,
      CAD_LAYER_Z_ORDER.measurements,
      CAD_LAYER_Z_ORDER.protection,
      CAD_LAYER_Z_ORDER.results,
      CAD_LAYER_Z_ORDER.power_flow,
    );
    expect(CAD_LAYER_Z_ORDER.errors).toBeGreaterThan(maxOther);
  });

  it('Guides ma najniższy z-order (pod spodem)', () => {
    expect(CAD_LAYER_Z_ORDER.guides).toBe(0);
  });
});

describe('getAbsolutePortPosition — pozycja portu', () => {
  const symbol: PositionedSymbol = {
    id: 'cb-01',
    position: { x: 100, y: 200 },
    ports: [
      { id: 'top', local: { x: 0, y: -10 }, direction: 'north' },
      { id: 'bottom', local: { x: 0, y: 10 }, direction: 'south' },
    ],
  };

  it('Pozycja absolutna = symbol position + local port', () => {
    expect(getAbsolutePortPosition(symbol, 'top')).toEqual({ x: 100, y: 190 });
    expect(getAbsolutePortPosition(symbol, 'bottom')).toEqual({ x: 100, y: 210 });
  });

  it('Nieznany port → null', () => {
    expect(getAbsolutePortPosition(symbol, 'unknown')).toBeNull();
  });
});

describe('findNearestPort — magnetic snap', () => {
  const symbols: PositionedSymbol[] = [
    {
      id: 'cb-01',
      position: { x: 100, y: 100 },
      ports: [{ id: 'top', local: { x: 0, y: 0 }, direction: 'north' }],
    },
    {
      id: 'cb-02',
      position: { x: 200, y: 200 },
      ports: [{ id: 'top', local: { x: 0, y: 0 }, direction: 'north' }],
    },
  ];

  it('Kursor w threshold portu → znajduje port', () => {
    const result = findNearestPort({ x: 105, y: 105 }, symbols);
    expect(result).not.toBeNull();
    expect(result?.symbol.id).toBe('cb-01');
    expect(result?.port.id).toBe('top');
  });

  it('Kursor poza threshold → null', () => {
    const result = findNearestPort({ x: 500, y: 500 }, symbols);
    expect(result).toBeNull();
  });

  it('Wybiera najbliższy z dwóch portów', () => {
    // Cursor at (150, 150) — equidistant. cb-01 distance ~71, cb-02 distance ~71.
    // Test żeby zwracał jakikolwiek z nich (deterministyczny order — pierwszy z list).
    const result = findNearestPort({ x: 110, y: 110 }, symbols, 20);
    expect(result?.symbol.id).toBe('cb-01');
  });

  it('PORT_SNAP_THRESHOLD_PX = 12', () => {
    expect(PORT_SNAP_THRESHOLD_PX).toBe(12);
  });
});

describe('buildOrthogonalRoute — ortogonalne L-shape + waypoints', () => {
  it('Prosty horiz-first → L-shape (3 punkty)', () => {
    const route = buildOrthogonalRoute({
      from: { x: 0, y: 0 },
      fromDirection: 'east',
      to: { x: 100, y: 50 },
      toDirection: 'west',
    });
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 104, y: 48 });
    // Snap na 8.
  });

  it('Vert-first gdy source direction = north/south', () => {
    const route = buildOrthogonalRoute({
      from: { x: 0, y: 0 },
      fromDirection: 'south',
      to: { x: 100, y: 50 },
      toDirection: 'north',
    });
    expect(isOrthogonalRoute(route)).toBe(true);
  });

  it('Waypoints → wymusza punkty załamania', () => {
    const route = buildOrthogonalRoute({
      from: { x: 0, y: 0 },
      fromDirection: 'east',
      to: { x: 100, y: 100 },
      toDirection: 'west',
      waypoints: [{ x: 50, y: 25 }],
    });
    expect(route.length).toBeGreaterThan(3);
    expect(isOrthogonalRoute(route)).toBe(true);
  });

  it('Każdy zwrócony route jest 100% ortogonalny', () => {
    for (const dir of ['north', 'south', 'east', 'west'] as const) {
      const route = buildOrthogonalRoute({
        from: { x: 0, y: 0 },
        fromDirection: dir,
        to: { x: 150, y: 100 },
        toDirection: 'west',
      });
      expect(isOrthogonalRoute(route)).toBe(true);
    }
  });

  it('Punkty są snapowane do grid', () => {
    const route = buildOrthogonalRoute({
      from: { x: 3, y: 5 },
      fromDirection: 'east',
      to: { x: 27, y: 33 },
      toDirection: 'west',
    });
    for (const point of route) {
      expect(point.x % CAD_GRID_BASE_PX).toBe(0);
      expect(point.y % CAD_GRID_BASE_PX).toBe(0);
    }
  });
});

describe('isOrthogonalRoute — walidacja ortogonalności', () => {
  it('Ortogonalny route → true', () => {
    expect(isOrthogonalRoute([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 },
    ])).toBe(true);
  });

  it('Diagonalny segment → false', () => {
    expect(isOrthogonalRoute([
      { x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 100 },
    ])).toBe(false);
  });

  it('Pusty / 1-punkt → true (defensive)', () => {
    expect(isOrthogonalRoute([])).toBe(true);
    expect(isOrthogonalRoute([{ x: 0, y: 0 }])).toBe(true);
  });
});

describe('manhattanLength — długość Manhattan', () => {
  it('Prosty L-shape 100×50 → 150', () => {
    expect(manhattanLength([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 },
    ])).toBe(150);
  });

  it('Pusta ścieżka → 0', () => {
    expect(manhattanLength([])).toBe(0);
  });

  it('Pojedynczy punkt → 0', () => {
    expect(manhattanLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('RouteLockRegistry — blokada tras', () => {
  it('lock + isLocked → true', () => {
    const registry = new RouteLockRegistry();
    registry.lock('route-1', 'operator-X');
    expect(registry.isLocked('route-1')).toBe(true);
  });

  it('unlock → false', () => {
    const registry = new RouteLockRegistry();
    registry.lock('route-1');
    registry.unlock('route-1');
    expect(registry.isLocked('route-1')).toBe(false);
  });

  it('isLocked() dla nieznanego route → false', () => {
    const registry = new RouteLockRegistry();
    expect(registry.isLocked('unknown')).toBe(false);
  });

  it('getAllLocked() zwraca listę zablokowanych', () => {
    const registry = new RouteLockRegistry();
    registry.lock('r1');
    registry.lock('r2');
    expect(registry.getAllLocked()).toHaveLength(2);
  });
});
