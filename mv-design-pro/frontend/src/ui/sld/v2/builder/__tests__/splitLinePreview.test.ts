/**
 * splitLinePreview tests — P0.9 split-preview foundation pure functions.
 */

import { describe, expect, it } from 'vitest';

import {
  buildSplitPreview,
  distanceBetween,
  formatSplitPreviewLabel,
  lerpPoint,
  projectOntoSegment,
  type LineSegment,
} from '../splitLinePreview';

const HORIZONTAL_LINE: LineSegment = {
  startId: 'bus_GPZ',
  endId: 'bus_station_2',
  start: { x: 0, y: 100 },
  end: { x: 1000, y: 100 },
};

describe('projectOntoSegment', () => {
  it('cursor at midpoint → t=0.5', () => {
    const t = projectOntoSegment({ x: 500, y: 100 }, { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(t).toBe(0.5);
  });

  it('cursor at start → t=0', () => {
    const t = projectOntoSegment({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(t).toBe(0);
  });

  it('cursor at end → t=1', () => {
    const t = projectOntoSegment({ x: 1000, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(t).toBe(1);
  });

  it('cursor beyond end → clamped to 1', () => {
    const t = projectOntoSegment({ x: 2000, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(t).toBe(1);
  });

  it('cursor before start → clamped to 0', () => {
    const t = projectOntoSegment({ x: -500, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(t).toBe(0);
  });

  it('zero-length segment → t=0 (degenerate)', () => {
    const t = projectOntoSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(t).toBe(0);
  });

  it('perpendicular cursor projects onto closest point on segment', () => {
    // Diagonal segment from (0,0) to (10,10)
    // Cursor at (10, 0) projects to t=0.5 → (5, 5)
    const t = projectOntoSegment(
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    );
    expect(t).toBe(0.5);
  });
});

describe('lerpPoint', () => {
  it('t=0 → start point', () => {
    expect(lerpPoint({ x: 0, y: 0 }, { x: 100, y: 200 }, 0)).toEqual({ x: 0, y: 0 });
  });

  it('t=1 → end point', () => {
    expect(lerpPoint({ x: 0, y: 0 }, { x: 100, y: 200 }, 1)).toEqual({ x: 100, y: 200 });
  });

  it('t=0.5 → midpoint', () => {
    expect(lerpPoint({ x: 0, y: 0 }, { x: 100, y: 200 }, 0.5)).toEqual({ x: 50, y: 100 });
  });

  it('linear interpolation deterministic', () => {
    const p1 = lerpPoint({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.3);
    const p2 = lerpPoint({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.3);
    expect(p1).toEqual(p2);
  });
});

describe('distanceBetween', () => {
  it('zero distance for same point', () => {
    expect(distanceBetween({ x: 50, y: 50 }, { x: 50, y: 50 })).toBe(0);
  });

  it('horizontal distance', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(5);
  });

  it('3-4-5 triangle', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('buildSplitPreview', () => {
  it('cursor at midpoint → 50/50 split', () => {
    const preview = buildSplitPreview({ x: 500, y: 100 }, HORIZONTAL_LINE);
    expect(preview).not.toBeNull();
    expect(preview!.splitT).toBe(0.5);
    expect(preview!.splitPoint).toEqual({ x: 500, y: 100 });
    expect(preview!.lengthRatio1).toBe(0.5);
    expect(preview!.lengthRatio2).toBe(0.5);
  });

  it('cursor at 35% → asymmetric split', () => {
    const preview = buildSplitPreview({ x: 350, y: 100 }, HORIZONTAL_LINE);
    expect(preview).not.toBeNull();
    expect(preview!.splitT).toBeCloseTo(0.35, 5);
    expect(preview!.lengthRatio1).toBeCloseTo(0.35, 5);
    expect(preview!.lengthRatio2).toBeCloseTo(0.65, 5);
  });

  it('returns null when cursor too close to start endpoint', () => {
    const preview = buildSplitPreview({ x: 20, y: 100 }, HORIZONTAL_LINE);
    // 20/1000 = 0.02 < default minRatio 0.05
    expect(preview).toBeNull();
  });

  it('returns null when cursor too close to end endpoint', () => {
    const preview = buildSplitPreview({ x: 980, y: 100 }, HORIZONTAL_LINE);
    // 980/1000 = 0.98 > 1 - 0.05 = 0.95
    expect(preview).toBeNull();
  });

  it('respects custom minEndpointDistanceRatio', () => {
    const preview = buildSplitPreview(
      { x: 20, y: 100 },
      HORIZONTAL_LINE,
      { minEndpointDistanceRatio: 0.01 }, // allow split at 1%+
    );
    // 0.02 > 0.01, so preview returns
    expect(preview).not.toBeNull();
    expect(preview!.splitT).toBe(0.02);
  });

  it('throws for invalid minEndpointDistanceRatio (negative)', () => {
    expect(() =>
      buildSplitPreview({ x: 500, y: 100 }, HORIZONTAL_LINE, {
        minEndpointDistanceRatio: -0.1,
      }),
    ).toThrow(/Niepoprawne/);
  });

  it('throws for invalid minEndpointDistanceRatio (>= 0.5)', () => {
    expect(() =>
      buildSplitPreview({ x: 500, y: 100 }, HORIZONTAL_LINE, {
        minEndpointDistanceRatio: 0.5,
      }),
    ).toThrow(/Niepoprawne/);
  });

  it('throws for NaN minEndpointDistanceRatio', () => {
    expect(() =>
      buildSplitPreview({ x: 500, y: 100 }, HORIZONTAL_LINE, {
        minEndpointDistanceRatio: NaN,
      }),
    ).toThrow(/Niepoprawne/);
  });

  it('preview IDs follow convention', () => {
    const preview = buildSplitPreview({ x: 500, y: 100 }, HORIZONTAL_LINE);
    expect(preview).not.toBeNull();
    expect(preview!.segment1.startId).toBe('bus_GPZ');
    expect(preview!.segment1.endId).toBe('bus_GPZ__station_preview');
    expect(preview!.segment2.startId).toBe('bus_GPZ__station_preview');
    expect(preview!.segment2.endId).toBe('bus_station_2');
  });

  it('segments connect at splitPoint', () => {
    const preview = buildSplitPreview({ x: 350, y: 100 }, HORIZONTAL_LINE);
    expect(preview).not.toBeNull();
    expect(preview!.segment1.end).toEqual(preview!.splitPoint);
    expect(preview!.segment2.start).toEqual(preview!.splitPoint);
  });

  it('determinizm — same cursor + line → identical preview', () => {
    const p1 = buildSplitPreview({ x: 350, y: 100 }, HORIZONTAL_LINE);
    const p2 = buildSplitPreview({ x: 350, y: 100 }, HORIZONTAL_LINE);
    expect(p1).toEqual(p2);
  });

  it('diagonal line: preview point on line', () => {
    const diagonal: LineSegment = {
      startId: 'a',
      endId: 'b',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
    };
    const preview = buildSplitPreview({ x: 50, y: 50 }, diagonal);
    expect(preview).not.toBeNull();
    expect(preview!.splitT).toBe(0.5);
    expect(preview!.splitPoint).toEqual({ x: 50, y: 50 });
  });

  it('lengthRatio1 + lengthRatio2 = 1 (always)', () => {
    for (const cursorX of [100, 250, 500, 750, 900]) {
      const preview = buildSplitPreview({ x: cursorX, y: 100 }, HORIZONTAL_LINE);
      if (preview !== null) {
        expect(preview.lengthRatio1 + preview.lengthRatio2).toBeCloseTo(1.0, 9);
      }
    }
  });
});

describe('formatSplitPreviewLabel', () => {
  it('formats with percentage only when no length provided', () => {
    const preview = buildSplitPreview({ x: 350, y: 100 }, HORIZONTAL_LINE)!;
    const label = formatSplitPreviewLabel(preview);
    expect(label).toBe('Podział linii: 35% / 65%');
  });

  it('formats with meters when length provided', () => {
    const preview = buildSplitPreview({ x: 350, y: 100 }, HORIZONTAL_LINE)!;
    const label = formatSplitPreviewLabel(preview, 714);
    // 35% of 714 = 250, 65% of 714 = 464
    expect(label).toBe('Podział linii: 35% / 65% (250 m / 464 m)');
  });

  it('handles 50/50 split', () => {
    const preview = buildSplitPreview({ x: 500, y: 100 }, HORIZONTAL_LINE)!;
    const label = formatSplitPreviewLabel(preview, 1000);
    expect(label).toBe('Podział linii: 50% / 50% (500 m / 500 m)');
  });

  it('handles NaN length (omits meters)', () => {
    const preview = buildSplitPreview({ x: 500, y: 100 }, HORIZONTAL_LINE)!;
    const label = formatSplitPreviewLabel(preview, NaN);
    expect(label).toBe('Podział linii: 50% / 50%');
  });
});
