/**
 * routing.ts tests — ortogonalne L-shape routing (PR-5).
 *
 * INVARIANT (BINDING):
 * 1. Ortogonalność — brak diagonalnych segmentów.
 * 2. Snap to grid — wszystkie współrzędne są wielokrotnością GRID_BASE_PX.
 * 3. Determinizm — same input → identical path.
 */

import { describe, expect, it } from 'vitest';

import { GRID_BASE_PX } from '../../theme/tokens';
import {
  isOnGrid,
  isOrthogonal,
  routeBayDownTrack,
  routeBranchSegment,
  routeOrthogonalL,
  routeRunSegment,
  routeStraight,
  type Path,
} from '../routing';

describe('routeOrthogonalL', () => {
  it('produces 4-point L-shape path (from → corner1 → corner2 → to)', () => {
    const path = routeOrthogonalL({ x: 0, y: 0 }, { x: 100, y: 200 }, 100);
    expect(path.points).toHaveLength(4);
  });

  it('first point matches from (snapped)', () => {
    const path = routeOrthogonalL({ x: 0, y: 0 }, { x: 100, y: 200 }, 100);
    expect(path.points[0]).toEqual({ x: 0, y: 0 });
  });

  it('last point matches to (snapped)', () => {
    const path = routeOrthogonalL({ x: 0, y: 0 }, { x: 100, y: 200 }, 100);
    expect(path.points[3]).toEqual({ x: 100, y: 200 });
  });

  it('corners visit channelY between from and to', () => {
    const path = routeOrthogonalL({ x: 0, y: 0 }, { x: 100, y: 200 }, 100);
    expect(path.points[1]).toEqual({ x: 0, y: 100 });
    expect(path.points[2]).toEqual({ x: 100, y: 100 });
  });

  it('result is orthogonal (no diagonal segments)', () => {
    const path = routeOrthogonalL({ x: 0, y: 0 }, { x: 100, y: 200 }, 100);
    expect(isOrthogonal(path)).toBe(true);
  });

  it('all coordinates on grid', () => {
    const path = routeOrthogonalL(
      { x: GRID_BASE_PX * 3, y: GRID_BASE_PX * 5 },
      { x: GRID_BASE_PX * 10, y: GRID_BASE_PX * 12 },
      GRID_BASE_PX * 8,
    );
    expect(isOnGrid(path)).toBe(true);
  });

  it('deterministic: same inputs → identical path', () => {
    const p1 = routeOrthogonalL({ x: 30, y: 50 }, { x: 90, y: 110 }, 80);
    const p2 = routeOrthogonalL({ x: 30, y: 50 }, { x: 90, y: 110 }, 80);
    expect(p1).toEqual(p2);
  });
});

describe('routeStraight', () => {
  it('produces 2-point path', () => {
    const path = routeStraight({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(path.points).toHaveLength(2);
  });

  it('horizontal segment preserves Y (on-grid)', () => {
    // 60 is multiple of GRID_BASE_PX=20 (no snap shift)
    const path = routeStraight({ x: 0, y: 60 }, { x: 200, y: 60 });
    expect(path.points[0]).toEqual({ x: 0, y: 60 });
    expect(path.points[1]).toEqual({ x: 200, y: 60 });
    expect(isOrthogonal(path)).toBe(true);
  });

  it('vertical segment preserves X', () => {
    const path = routeStraight({ x: 100, y: 0 }, { x: 100, y: 300 });
    expect(isOrthogonal(path)).toBe(true);
  });

  it('snaps endpoints to grid', () => {
    const path = routeStraight({ x: 100, y: 50 }, { x: 200, y: 50 });
    expect(isOnGrid(path)).toBe(true);
  });
});

describe('routeBayDownTrack', () => {
  it('produces vertical path from bayHead down', () => {
    const path = routeBayDownTrack({ x: 100, y: 50 }, 250);
    expect(path.points).toHaveLength(2);
    expect(path.points[0].x).toBe(100);
    expect(path.points[1].x).toBe(100);
    expect(path.points[1].y).toBeGreaterThan(path.points[0].y);
    expect(isOrthogonal(path)).toBe(true);
  });
});

describe('routeRunSegment', () => {
  it('produces L-shape via channelY', () => {
    const path = routeRunSegment(
      { x: 100, y: 50 },
      { x: 300, y: 200 },
      150,
    );
    expect(path.points).toHaveLength(4);
    expect(isOrthogonal(path)).toBe(true);
  });

  it('routes through specified channelY (on-grid)', () => {
    const path = routeRunSegment(
      { x: 100, y: 60 },
      { x: 300, y: 200 },
      160,
    );
    // Middle two points sit on channelY (160 = multiple of GRID_BASE_PX=20)
    expect(path.points[1].y).toBe(160);
    expect(path.points[2].y).toBe(160);
  });
});

describe('routeBranchSegment', () => {
  it('produces L-shape via branchChannelY (on-grid)', () => {
    const path = routeBranchSegment(
      { x: 200, y: 100 },
      { x: 400, y: 300 },
      260, // multiple of GRID_BASE_PX=20
    );
    expect(path.points).toHaveLength(4);
    expect(isOrthogonal(path)).toBe(true);
    expect(path.points[1].y).toBe(260);
    expect(path.points[2].y).toBe(260);
  });
});

describe('isOrthogonal', () => {
  it('returns true for empty path', () => {
    expect(isOrthogonal({ points: [] })).toBe(true);
  });

  it('returns true for single point', () => {
    expect(isOrthogonal({ points: [{ x: 0, y: 0 }] })).toBe(true);
  });

  it('detects diagonal segment', () => {
    const diag: Path = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    expect(isOrthogonal(diag)).toBe(false);
  });

  it('accepts vertical segment', () => {
    expect(
      isOrthogonal({
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 200 },
        ],
      }),
    ).toBe(true);
  });

  it('accepts horizontal segment', () => {
    expect(
      isOrthogonal({
        points: [
          { x: 0, y: 50 },
          { x: 200, y: 50 },
        ],
      }),
    ).toBe(true);
  });

  it('accepts multi-segment L path', () => {
    expect(
      isOrthogonal({
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 50 },
        ],
      }),
    ).toBe(true);
  });
});

describe('isOnGrid', () => {
  it('returns true for snapped path', () => {
    const path = routeOrthogonalL({ x: 0, y: 0 }, { x: 100, y: 200 }, 100);
    expect(isOnGrid(path)).toBe(true);
  });

  it('returns false for off-grid path', () => {
    const offGrid: Path = {
      points: [
        { x: 0, y: 0 },
        { x: 1.5, y: 3.7 },
      ],
    };
    expect(isOnGrid(offGrid)).toBe(false);
  });
});
