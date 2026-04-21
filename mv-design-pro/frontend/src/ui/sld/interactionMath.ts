import type { ViewportState } from './types';
import { ZOOM_MAX, ZOOM_MIN } from './types';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

export function zoomViewportAroundPoint(
  viewport: ViewportState,
  nextZoom: number,
  anchor: CanvasPoint,
): ViewportState {
  const clampedZoom = clampZoom(nextZoom);
  if (clampedZoom === viewport.zoom) {
    return viewport;
  }

  const worldX = (anchor.x - viewport.offsetX) / viewport.zoom;
  const worldY = (anchor.y - viewport.offsetY) / viewport.zoom;

  return {
    ...viewport,
    zoom: clampedZoom,
    offsetX: anchor.x - worldX * clampedZoom,
    offsetY: anchor.y - worldY * clampedZoom,
  };
}

export function zoomViewportByStep(
  viewport: ViewportState,
  delta: number,
  anchor: CanvasPoint,
): ViewportState {
  return zoomViewportAroundPoint(viewport, viewport.zoom + delta, anchor);
}

export function preserveViewportCenterOnResize(
  viewport: ViewportState,
  previousSize: CanvasSize,
  nextSize: CanvasSize,
): ViewportState {
  if (
    previousSize.width <= 0
    || previousSize.height <= 0
    || nextSize.width <= 0
    || nextSize.height <= 0
  ) {
    return viewport;
  }

  const worldCenterX = (previousSize.width / 2 - viewport.offsetX) / viewport.zoom;
  const worldCenterY = (previousSize.height / 2 - viewport.offsetY) / viewport.zoom;

  return {
    ...viewport,
    offsetX: nextSize.width / 2 - worldCenterX * viewport.zoom,
    offsetY: nextSize.height / 2 - worldCenterY * viewport.zoom,
  };
}
