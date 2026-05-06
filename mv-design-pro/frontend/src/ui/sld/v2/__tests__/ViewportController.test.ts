/**
 * PR-5 — Testy ViewportController.
 *
 * Inwarianty (BINDING):
 * 1. Zoom kursor-anchored: punkt świata pod kursorem zostaje w tej samej pozycji ekranu.
 * 2. Pan: tylko translacja, scale niezmienione.
 * 3. fitToView: cały bounding box widoczny + centrowany.
 * 4. Otwarcie panelu / zmiana overlay-a NIE zmienia world coordinates (testowane przez
 *    izolację screenToWorld / worldToScreen).
 */

import { describe, expect, it } from 'vitest';

import {
  IDENTITY_TRANSFORM,
  MAX_SCALE,
  MIN_SCALE,
  centerOnPoint,
  computeBoundingBox,
  fitToView,
  pan,
  screenToWorld,
  snapWorldPoint,
  worldToScreen,
  zoomToCursor,
} from '../viewport/ViewportController';

describe('Viewport — IDENTITY transform', () => {
  it('IDENTITY zachowuje punkty 1:1', () => {
    const point = { x: 100, y: 200 };
    expect(screenToWorld(point, IDENTITY_TRANSFORM)).toEqual(point);
    expect(worldToScreen(point, IDENTITY_TRANSFORM)).toEqual(point);
  });
});

describe('Viewport — zoomToCursor (kursor-anchored)', () => {
  it('zoom in 2× zachowuje punkt świata pod kursorem', () => {
    const t = IDENTITY_TRANSFORM;
    const cursor = { x: 500, y: 300 };
    const worldBefore = screenToWorld(cursor, t);
    const t2 = zoomToCursor(t, cursor, 2);
    const worldAfterScreen = worldToScreen(worldBefore, t2);
    expect(worldAfterScreen.x).toBeCloseTo(cursor.x, 5);
    expect(worldAfterScreen.y).toBeCloseTo(cursor.y, 5);
  });

  it('zoom out 0.5× zachowuje punkt świata pod kursorem', () => {
    const t = { scale: 1, translateX: 100, translateY: 200 };
    const cursor = { x: 800, y: 600 };
    const worldBefore = screenToWorld(cursor, t);
    const t2 = zoomToCursor(t, cursor, 0.5);
    const worldAfterScreen = worldToScreen(worldBefore, t2);
    expect(worldAfterScreen.x).toBeCloseTo(cursor.x, 5);
    expect(worldAfterScreen.y).toBeCloseTo(cursor.y, 5);
  });

  it('zoom respektuje MIN_SCALE / MAX_SCALE', () => {
    const tHigh = { scale: MAX_SCALE - 0.1, translateX: 0, translateY: 0 };
    const t2 = zoomToCursor(tHigh, { x: 0, y: 0 }, 100);
    expect(t2.scale).toBeLessThanOrEqual(MAX_SCALE);

    const tLow = { scale: MIN_SCALE + 0.001, translateX: 0, translateY: 0 };
    const t3 = zoomToCursor(tLow, { x: 0, y: 0 }, 0.001);
    expect(t3.scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });
});

describe('Viewport — pan', () => {
  it('pan nie zmienia scale', () => {
    const t = { scale: 1.5, translateX: 100, translateY: 200 };
    const t2 = pan(t, { x: 50, y: 30 });
    expect(t2.scale).toBe(t.scale);
    expect(t2.translateX).toBe(150);
    expect(t2.translateY).toBe(230);
  });
});

describe('Viewport — fitToView', () => {
  it('puste bbox → IDENTITY', () => {
    const bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const t = fitToView(bbox, { width: 800, height: 600 });
    expect(t).toEqual(IDENTITY_TRANSFORM);
  });

  it('bbox 1000x600 w viewport 800x600: skaluje', () => {
    const bbox = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
    const t = fitToView(bbox, { width: 800, height: 600 }, 0);
    // Bbox nie mieści się w viewport → scale ≈ 0.8 (limit szerokości)
    expect(t.scale).toBeLessThanOrEqual(1);
    expect(t.scale).toBeGreaterThan(0.5);
  });

  it('bbox jest wycentrowany w viewport', () => {
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const viewport = { width: 800, height: 600 };
    const t = fitToView(bbox, viewport, 0);
    const bboxCenterScreen = worldToScreen({ x: 50, y: 50 }, t);
    expect(bboxCenterScreen.x).toBeCloseTo(viewport.width / 2, 1);
    expect(bboxCenterScreen.y).toBeCloseTo(viewport.height / 2, 1);
  });
});

describe('Viewport — centerOnPoint', () => {
  it('centruje obiekt w środku viewport', () => {
    const t = centerOnPoint({ x: 500, y: 300 }, { width: 800, height: 600 }, 1.5);
    const centerScreen = worldToScreen({ x: 500, y: 300 }, t);
    expect(centerScreen.x).toBeCloseTo(400, 5);
    expect(centerScreen.y).toBeCloseTo(300, 5);
  });
});

describe('Viewport — computeBoundingBox', () => {
  it('zwraca poprawne bbox dla zbioru punktów', () => {
    const pts = [
      { x: 10, y: 20 },
      { x: 100, y: 50 },
      { x: 5, y: 200 },
    ];
    const bbox = computeBoundingBox(pts);
    expect(bbox).toEqual({ minX: 5, minY: 20, maxX: 100, maxY: 200 });
  });

  it('puste pts → bbox 0,0,0,0', () => {
    expect(computeBoundingBox([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});

describe('Viewport — snapWorldPoint', () => {
  it('snap do siatki 20px', () => {
    expect(snapWorldPoint({ x: 13, y: 17 })).toEqual({ x: 20, y: 20 });
    expect(snapWorldPoint({ x: 50, y: 50 })).toEqual({ x: 60, y: 60 });
    expect(snapWorldPoint({ x: 40, y: 40 })).toEqual({ x: 40, y: 40 });
  });
});
