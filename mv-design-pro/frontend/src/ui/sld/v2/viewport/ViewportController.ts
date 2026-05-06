/**
 * SLD v2 ViewportController — pan/zoom kursor-anchored (PR-5).
 *
 * Zastępuje `frontend/src/ui/sld/SldCadEngineV12.ts` rasteryzację — nowy viewport
 * jest pure functional + state machine, łatwo testowalny.
 */

import { snapToGrid } from '../theme/tokens';

export interface ViewportTransform {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const IDENTITY_TRANSFORM: ViewportTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

export const MIN_SCALE = 0.05 as const;
export const MAX_SCALE = 8.0 as const;

/** Konwersja screen → world coordinates. */
export function screenToWorld(
  point: { readonly x: number; readonly y: number },
  transform: ViewportTransform,
): { x: number; y: number } {
  return {
    x: (point.x - transform.translateX) / transform.scale,
    y: (point.y - transform.translateY) / transform.scale,
  };
}

/** Konwersja world → screen coordinates. */
export function worldToScreen(
  point: { readonly x: number; readonly y: number },
  transform: ViewportTransform,
): { x: number; y: number } {
  return {
    x: point.x * transform.scale + transform.translateX,
    y: point.y * transform.scale + transform.translateY,
  };
}

/**
 * Zoom względem kursora.
 *
 * Inwariant: po zoom-ie punkt świata pod kursorem (cursor screen point) pozostaje
 * w tej samej pozycji ekranu. Zachowuje punkt techniczny pod kursorem.
 */
export function zoomToCursor(
  transform: ViewportTransform,
  cursorScreen: { readonly x: number; readonly y: number },
  zoomFactor: number,
): ViewportTransform {
  const newScale = clamp(transform.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
  if (newScale === transform.scale) return transform;

  // World point pod kursorem przed zoom-em
  const worldX = (cursorScreen.x - transform.translateX) / transform.scale;
  const worldY = (cursorScreen.y - transform.translateY) / transform.scale;

  // Nowa translacja zachowująca punkt świata pod kursorem
  const newTranslateX = cursorScreen.x - worldX * newScale;
  const newTranslateY = cursorScreen.y - worldY * newScale;

  return {
    scale: newScale,
    translateX: newTranslateX,
    translateY: newTranslateY,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Fit-to-view: dopasowuje viewport tak, żeby cały bounding box był widoczny.
 *
 * Jeżeli bbox jest pusty (width=height=0), zwraca IDENTITY.
 */
export function fitToView(
  bbox: BoundingBox,
  viewportSize: { readonly width: number; readonly height: number },
  paddingPx = 40,
): ViewportTransform {
  const bboxWidth = bbox.maxX - bbox.minX;
  const bboxHeight = bbox.maxY - bbox.minY;
  if (bboxWidth <= 0 || bboxHeight <= 0) {
    return IDENTITY_TRANSFORM;
  }

  const usableWidth = Math.max(viewportSize.width - 2 * paddingPx, 1);
  const usableHeight = Math.max(viewportSize.height - 2 * paddingPx, 1);

  const scaleX = usableWidth / bboxWidth;
  const scaleY = usableHeight / bboxHeight;
  const scale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, MAX_SCALE);

  // Centrowanie bbox
  const bboxCenterX = (bbox.minX + bbox.maxX) / 2;
  const bboxCenterY = (bbox.minY + bbox.maxY) / 2;
  const translateX = viewportSize.width / 2 - bboxCenterX * scale;
  const translateY = viewportSize.height / 2 - bboxCenterY * scale;

  return { scale, translateX, translateY };
}

/**
 * Centruje wybrany obiekt w viewport (zachowuje obecną skalę).
 */
export function centerOnPoint(
  worldPoint: { readonly x: number; readonly y: number },
  viewportSize: { readonly width: number; readonly height: number },
  scale: number,
): ViewportTransform {
  return {
    scale,
    translateX: viewportSize.width / 2 - worldPoint.x * scale,
    translateY: viewportSize.height / 2 - worldPoint.y * scale,
  };
}

/**
 * Pan: przesunięcie viewport o delta screen pixels.
 */
export function pan(
  transform: ViewportTransform,
  deltaScreen: { readonly x: number; readonly y: number },
): ViewportTransform {
  return {
    scale: transform.scale,
    translateX: transform.translateX + deltaScreen.x,
    translateY: transform.translateY + deltaScreen.y,
  };
}

/**
 * Bounding box dla zbioru world points (np. wszystkie sloty obiektów).
 */
export function computeBoundingBox(
  points: readonly { readonly x: number; readonly y: number }[],
): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Snap world point do siatki (używane przy snap drag).
 */
export function snapWorldPoint(
  point: { readonly x: number; readonly y: number },
): { x: number; y: number } {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
}
