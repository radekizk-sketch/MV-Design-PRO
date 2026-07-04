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
  initialCameraForNetwork,
  pan,
  safeRect,
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

  it('z safe insets centruje w środku SAFE rect (nie całego elementu)', () => {
    const insets = { top: 100, right: 0, bottom: 0, left: 0 };
    const t = centerOnPoint({ x: 500, y: 300 }, { width: 800, height: 600 }, 1, insets);
    const centerScreen = worldToScreen({ x: 500, y: 300 }, t);
    // safe rect = y∈[100,600], środek pionowy = 100 + 500/2 = 350.
    expect(centerScreen.x).toBeCloseTo(400, 5);
    expect(centerScreen.y).toBeCloseTo(350, 5);
  });
});

describe('Viewport — safeRect', () => {
  it('odejmuje insety od elementu', () => {
    const rect = safeRect({ width: 800, height: 600 }, { top: 50, right: 20, bottom: 40, left: 10 });
    expect(rect).toEqual({ x: 10, y: 50, width: 770, height: 510 });
  });

  it('nigdy nie zwija się poniżej 1px', () => {
    const rect = safeRect({ width: 100, height: 100 }, { top: 80, right: 80, bottom: 80, left: 80 });
    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
  });

  it('brak insetów → pełny element', () => {
    expect(safeRect({ width: 800, height: 600 })).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

describe('Viewport — fitToView safe rect (E16)', () => {
  it('centruje bbox w safe rect: górny inset przesuwa treść w dół', () => {
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const viewport = { width: 800, height: 600 };
    const insets = { top: 200, right: 0, bottom: 0, left: 0 };
    const t = fitToView(bbox, viewport, 0, insets);
    const bboxCenterScreen = worldToScreen({ x: 50, y: 50 }, t);
    // środek safe rect w pionie = 200 + (600-200)/2 = 400.
    expect(bboxCenterScreen.x).toBeCloseTo(400, 1);
    expect(bboxCenterScreen.y).toBeCloseTo(400, 1);
  });

  it('brak insetów → identyczny wynik jak przed E16 (regresja)', () => {
    const bbox = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
    const viewport = { width: 800, height: 600 };
    expect(fitToView(bbox, viewport, 0)).toEqual(fitToView(bbox, viewport, 0, { top: 0, right: 0, bottom: 0, left: 0 }));
  });
});

describe('Viewport — initialCameraForNetwork (E15 mobile camera)', () => {
  // Szeroko-niski świat (magistrala „grzebień w dół"): typowa geometria sieci.
  const wideShortBbox = { minX: 0, minY: 0, maxX: 3000, maxY: 600 };
  const source = { x: 150, y: 300 }; // GPZ na lewym końcu magistrali.

  it('landscape/desktop → tryb fit (cała sieć zmieszczona)', () => {
    const cam = initialCameraForNetwork({
      bbox: wideShortBbox,
      viewportSize: { width: 1280, height: 720 },
      focusPoint: source,
      readableMinScale: 0.5,
    });
    expect(cam.mode).toBe('fit');
  });

  it('portrait mobile 430×932: NIE mikroskopijny pasek — focus na źródle w skali czytelnej', () => {
    const cam = initialCameraForNetwork({
      bbox: wideShortBbox,
      viewportSize: { width: 430, height: 932 },
      focusPoint: source,
      readableMinScale: 0.5,
    });
    // Fit dałby ~0.13 (letterbox). Kamera musi być czytelna, nie mikroskopijna.
    expect(cam.mode).toBe('focus');
    expect(cam.transform.scale).toBeGreaterThanOrEqual(0.5);
    // Źródło (GPZ) jest widoczne — wyśrodkowane w kadrze, nie schowane za krawędzią.
    const sourceScreen = worldToScreen(source, cam.transform);
    expect(sourceScreen.x).toBeGreaterThanOrEqual(0);
    expect(sourceScreen.x).toBeLessThanOrEqual(430);
    expect(sourceScreen.y).toBeGreaterThanOrEqual(0);
    expect(sourceScreen.y).toBeLessThanOrEqual(932);
  });

  it('portrait mobile 390×844: focus czytelny (drugi rozmiar telefonu)', () => {
    const cam = initialCameraForNetwork({
      bbox: wideShortBbox,
      viewportSize: { width: 390, height: 844 },
      focusPoint: source,
      readableMinScale: 0.5,
    });
    expect(cam.mode).toBe('focus');
    expect(cam.transform.scale).toBeGreaterThanOrEqual(0.5);
  });

  it('GEOMETRIA ŚWIATA NIETKNIĘTA: portrait vs landscape czytają ten sam bbox', () => {
    // Kamera to wyłącznie skala + translacja — funkcja nie mutuje bboxa.
    const before = { ...wideShortBbox };
    initialCameraForNetwork({
      bbox: wideShortBbox, viewportSize: { width: 430, height: 932 }, focusPoint: source, readableMinScale: 0.5,
    });
    initialCameraForNetwork({
      bbox: wideShortBbox, viewportSize: { width: 1280, height: 720 }, focusPoint: source, readableMinScale: 0.5,
    });
    expect(wideShortBbox).toEqual(before);
  });

  it('portrait ale fit już czytelny (mały GPZ) → tryb fit, bez wymuszania focus', () => {
    const smallBbox = { minX: 0, minY: 0, maxX: 400, maxY: 500 };
    const cam = initialCameraForNetwork({
      bbox: smallBbox,
      viewportSize: { width: 430, height: 932 },
      focusPoint: source,
      readableMinScale: 0.5,
    });
    expect(cam.mode).toBe('fit');
  });

  it('brak focusPoint (brak GPZ) → tryb fit nawet na portrait (degradacja bezpieczna)', () => {
    const cam = initialCameraForNetwork({
      bbox: wideShortBbox,
      viewportSize: { width: 430, height: 932 },
      focusPoint: null,
      readableMinScale: 0.5,
    });
    expect(cam.mode).toBe('fit');
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
