/**
 * RouteEditor — Phase 2 (operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. createRoute: snap to grid, bez bendów, niezablokowany.
 *   2. addBend: insert + out-of-range + locked no-op.
 *   3. dragBend: update + out-of-range + locked no-op.
 *   4. removeBend: filter + out-of-range + locked no-op.
 *   5. clearBends: bendPoints=[] + locked no-op.
 *   6. lockRoute / unlockRoute: idempotency.
 *   7. routeToPath: start + bends + end, snap to grid.
 *   8. isRouteOrthogonal: walidacja per route.
 *   9. findNearestBend: tolerance + nearest.
 *  10. suggestBendInsertionIndex: optimal insertion.
 *  11. Immutability: każda mutacja zwraca nowy obiekt.
 *  12. Round-trips: addBend → dragBend → removeBend → clearBends.
 */
import { describe, expect, it } from 'vitest';

import {
  type RouteSegment,
  addBend,
  clearBends,
  createRoute,
  dragBend,
  findNearestBend,
  isRouteOrthogonal,
  lockRoute,
  manhattanDistance,
  removeBend,
  routeToPath,
  suggestBendInsertionIndex,
  unlockRoute,
} from '../RouteEditor';

const START = { x: 0, y: 0 };
const END = { x: 100, y: 0 };

function freshRoute(): RouteSegment {
  return createRoute('seg-1', START, END);
}

describe('createRoute — initial state', () => {
  it('Snap to grid + bez bendów + niezablokowany', () => {
    const route = createRoute('seg-x', { x: 23, y: 47 }, { x: 105, y: 89 });
    expect(route.endpoints.start.x % 20).toBe(0);
    expect(route.endpoints.end.x % 20).toBe(0);
    expect(route.bendPoints).toEqual([]);
    expect(route.locked).toBe(false);
  });
});

describe('addBend — insert at index', () => {
  it('Pierwszy bend wstawiany na index=0', () => {
    const r1 = freshRoute();
    const r2 = addBend(r1, 0, { x: 40, y: 20 });
    expect(r2.bendPoints).toHaveLength(1);
    expect(r2.bendPoints[0]).toEqual({ x: 40, y: 20 });
  });

  it('Drugi bend na końcu (index=1)', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 20 });
    r = addBend(r, 1, { x: 80, y: 20 });
    expect(r.bendPoints).toHaveLength(2);
    expect(r.bendPoints[0]).toEqual({ x: 20, y: 20 });
    expect(r.bendPoints[1]).toEqual({ x: 80, y: 20 });
  });

  it('Insert middle (idx=1 między 2 bendami)', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 25 });
    r = addBend(r, 1, { x: 80, y: 25 });
    r = addBend(r, 1, { x: 40, y: 20 }); // wstaw między
    expect(r.bendPoints.map((p) => p.x)).toEqual([20, 40, 80]);
  });

  it('Out-of-range index → no-op', () => {
    const r1 = freshRoute();
    const r2 = addBend(r1, -1, { x: 40, y: 20 });
    expect(r2).toBe(r1); // same reference (no-op)
    const r3 = addBend(r1, 5, { x: 40, y: 20 });
    expect(r3).toBe(r1);
  });

  it('Snap to grid przy dodawaniu', () => {
    const r1 = freshRoute();
    const r2 = addBend(r1, 0, { x: 23, y: 47 });
    expect(r2.bendPoints[0].x % 20).toBe(0);
    expect(r2.bendPoints[0].y % 20).toBe(0);
  });

  it('Locked route → addBend no-op', () => {
    let r = freshRoute();
    r = lockRoute(r);
    const r2 = addBend(r, 0, { x: 40, y: 20 });
    expect(r2).toBe(r);
  });
});

describe('dragBend — update existing bend', () => {
  it('Update istniejącego bendu', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    r = dragBend(r, 0, { x: 60, y: 40 });
    expect(r.bendPoints[0]).toEqual({ x: 60, y: 40 });
  });

  it('Out-of-range bendIdx → no-op', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    const r2 = dragBend(r, 5, { x: 80, y: 40 });
    expect(r2).toBe(r);
    const r3 = dragBend(r, -1, { x: 80, y: 40 });
    expect(r3).toBe(r);
  });

  it('Locked route → dragBend no-op', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    r = lockRoute(r);
    const r2 = dragBend(r, 0, { x: 60, y: 40 });
    expect(r2).toBe(r);
  });

  it('Snap to grid przy drag', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    r = dragBend(r, 0, { x: 33, y: 41 });
    expect(r.bendPoints[0].x % 20).toBe(0);
    expect(r.bendPoints[0].y % 20).toBe(0);
  });
});

describe('removeBend — filter', () => {
  it('Usuwa bend o danym indeksie', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 20 });
    r = addBend(r, 1, { x: 80, y: 20 });
    r = removeBend(r, 0);
    expect(r.bendPoints).toHaveLength(1);
    expect(r.bendPoints[0]).toEqual({ x: 80, y: 20 });
  });

  it('Out-of-range bendIdx → no-op', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    const r2 = removeBend(r, 5);
    expect(r2).toBe(r);
    const r3 = removeBend(r, -1);
    expect(r3).toBe(r);
  });

  it('Locked route → removeBend no-op', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    r = lockRoute(r);
    const r2 = removeBend(r, 0);
    expect(r2).toBe(r);
  });
});

describe('clearBends', () => {
  it('Usuwa wszystkie bendy', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 20 });
    r = addBend(r, 1, { x: 80, y: 20 });
    r = clearBends(r);
    expect(r.bendPoints).toEqual([]);
  });

  it('Locked route → clearBends no-op', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    r = lockRoute(r);
    const r2 = clearBends(r);
    expect(r2).toBe(r);
  });
});

describe('lockRoute / unlockRoute — idempotency', () => {
  it('lockRoute na niezablokowanej → locked=true', () => {
    const r1 = freshRoute();
    const r2 = lockRoute(r1);
    expect(r2.locked).toBe(true);
  });

  it('lockRoute na zablokowanej → no-op (same reference)', () => {
    let r = freshRoute();
    r = lockRoute(r);
    const r2 = lockRoute(r);
    expect(r2).toBe(r);
  });

  it('unlockRoute na zablokowanej → locked=false', () => {
    let r = freshRoute();
    r = lockRoute(r);
    r = unlockRoute(r);
    expect(r.locked).toBe(false);
  });

  it('unlockRoute na niezablokowanej → no-op', () => {
    const r1 = freshRoute();
    const r2 = unlockRoute(r1);
    expect(r2).toBe(r1);
  });
});

describe('routeToPath', () => {
  it('Bez bendów: [start, end]', () => {
    const r = freshRoute();
    expect(routeToPath(r)).toEqual([START, END]);
  });

  it('Z 2 bendami: [start, bend0, bend1, end]', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 20 });
    r = addBend(r, 1, { x: 80, y: 20 });
    const path = routeToPath(r);
    expect(path).toHaveLength(4);
    expect(path[1]).toEqual({ x: 20, y: 20 });
    expect(path[2]).toEqual({ x: 80, y: 20 });
  });
});

describe('isRouteOrthogonal — walidacja ortogonalności', () => {
  it('Prosty path bez bendów → ortogonalny gdy start.y === end.y', () => {
    const r = createRoute('s', { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(isRouteOrthogonal(r)).toBe(true);
  });

  it('Diagonalny path BEZ bendów → NIEortogonalny', () => {
    const r = createRoute('s', { x: 0, y: 0 }, { x: 100, y: 50 });
    expect(isRouteOrthogonal(r)).toBe(false);
  });

  it('Z bendami pośrednimi które tworzą L-shape → ortogonalny', () => {
    let r = createRoute('s', { x: 0, y: 0 }, { x: 100, y: 50 });
    r = addBend(r, 0, { x: 0, y: 50 }); // pionowo
    expect(isRouteOrthogonal(r)).toBe(true); // [0,0] → [0,50] (pion) → [100,50] (poziom)
  });
});

describe('findNearestBend / manhattanDistance', () => {
  it('manhattanDistance: |dx| + |dy|', () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });

  it('findNearestBend: zwraca indeks najbliższego bendu w tolerance', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 20 });
    r = addBend(r, 1, { x: 80, y: 20 });
    expect(findNearestBend(r, { x: 23, y: 22 }, 10)).toBe(0);
    expect(findNearestBend(r, { x: 78, y: 22 }, 10)).toBe(1);
  });

  it('findNearestBend: -1 gdy żaden nie jest w tolerance', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 20 });
    expect(findNearestBend(r, { x: 100, y: 100 }, 10)).toBe(-1);
  });
});

describe('suggestBendInsertionIndex', () => {
  it('Bez bendów: zwraca 0 (insert na początku) gdy point bliski segmentu start-end', () => {
    const r = freshRoute();
    const idx = suggestBendInsertionIndex(r, { x: 50, y: 0 });
    expect(idx).toBe(0);
  });

  it('Path z 1 bendem: point bliski drugiego segmentu → idx=1', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 20 });
    // Point bliski segmentu [bend0(30,25) → end(100,0)] → idx=1
    const idx = suggestBendInsertionIndex(r, { x: 80, y: 20 });
    expect(idx).toBeGreaterThanOrEqual(1);
  });
});

describe('Immutability', () => {
  it('addBend zwraca NOWY obiekt', () => {
    const r1 = freshRoute();
    const r2 = addBend(r1, 0, { x: 40, y: 20 });
    expect(r2).not.toBe(r1);
    expect(r1.bendPoints).toEqual([]); // r1 niezmieniony
  });

  it('dragBend zwraca NOWY obiekt', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    const r2 = dragBend(r, 0, { x: 60, y: 40 });
    expect(r2).not.toBe(r);
    expect(r.bendPoints[0]).toEqual({ x: 40, y: 20 });
  });

  it('lockRoute zwraca NOWY obiekt (gdy zmienia stan)', () => {
    const r1 = freshRoute();
    const r2 = lockRoute(r1);
    expect(r2).not.toBe(r1);
    expect(r1.locked).toBe(false);
  });
});

describe('Round-trip workflow', () => {
  it('addBend → dragBend → removeBend → clearBends', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 20, y: 20 });
    r = addBend(r, 1, { x: 80, y: 20 });
    r = dragBend(r, 0, { x: 25, y: 30 });
    // 25/30 snap to grid 20px → (20, 40)
    expect(r.bendPoints[0]).toEqual({ x: 20, y: 40 });
    r = removeBend(r, 1);
    expect(r.bendPoints).toHaveLength(1);
    r = clearBends(r);
    expect(r.bendPoints).toEqual([]);
    expect(r.locked).toBe(false); // nadal niezablokowany
  });

  it('lock + edit attempts (no-op) + unlock + edit', () => {
    let r = freshRoute();
    r = addBend(r, 0, { x: 40, y: 20 });
    r = lockRoute(r);
    // Edit attempts są no-op
    r = addBend(r, 1, { x: 80, y: 40 });
    expect(r.bendPoints).toHaveLength(1);
    r = dragBend(r, 0, { x: 60, y: 40 });
    expect(r.bendPoints[0]).toEqual({ x: 40, y: 20 });
    // Unlock + edit działa
    r = unlockRoute(r);
    r = dragBend(r, 0, { x: 60, y: 40 });
    expect(r.bendPoints[0]).toEqual({ x: 60, y: 40 });
  });
});
