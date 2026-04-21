import { describe, expect, it } from 'vitest';

import {
  preserveViewportCenterOnResize,
  zoomViewportAroundPoint,
  zoomViewportByStep,
} from '../interactionMath';
import type { ViewportState } from '../types';

describe('interactionMath', () => {
  const viewport: ViewportState = {
    offsetX: 10,
    offsetY: 20,
    zoom: 1,
  };

  it('utrzymuje wskazany punkt canvasa pod kursorem podczas zoomowania', () => {
    const anchor = { x: 210, y: 170 };
    const next = zoomViewportAroundPoint(viewport, 1.5, anchor);

    const worldXBefore = (anchor.x - viewport.offsetX) / viewport.zoom;
    const worldYBefore = (anchor.y - viewport.offsetY) / viewport.zoom;
    const worldXAfter = (anchor.x - next.offsetX) / next.zoom;
    const worldYAfter = (anchor.y - next.offsetY) / next.zoom;

    expect(worldXAfter).toBeCloseTo(worldXBefore, 6);
    expect(worldYAfter).toBeCloseTo(worldYBefore, 6);
  });

  it('nie wykracza poza zoom max/min przy zmianie krokowej', () => {
    const maxed = zoomViewportByStep(
      {
        offsetX: 0,
        offsetY: 0,
        zoom: 2.95,
      },
      0.2,
      { x: 100, y: 100 },
    );

    const mined = zoomViewportByStep(
      {
        offsetX: 0,
        offsetY: 0,
        zoom: 0.3,
      },
      -0.2,
      { x: 100, y: 100 },
    );

    expect(maxed.zoom).toBe(3);
    expect(mined.zoom).toBe(0.25);
  });

  it('utrzymuje ten sam srodek swiata przy zmianie rozmiaru canvasa', () => {
    const resized = preserveViewportCenterOnResize(
      {
        offsetX: -120,
        offsetY: -80,
        zoom: 1.5,
      },
      { width: 1000, height: 600 },
      { width: 1400, height: 900 },
    );

    const beforeWorldCenter = {
      x: (1000 / 2 - (-120)) / 1.5,
      y: (600 / 2 - (-80)) / 1.5,
    };
    const afterWorldCenter = {
      x: (1400 / 2 - resized.offsetX) / resized.zoom,
      y: (900 / 2 - resized.offsetY) / resized.zoom,
    };

    expect(afterWorldCenter.x).toBeCloseTo(beforeWorldCenter.x, 6);
    expect(afterWorldCenter.y).toBeCloseTo(beforeWorldCenter.y, 6);
  });
});
