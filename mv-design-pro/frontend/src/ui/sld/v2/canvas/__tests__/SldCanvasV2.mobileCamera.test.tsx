/**
 * SLD RECOVERY Step 7 (E15/E16) — mobile camera integration proof.
 *
 * Governs acceptance §25 (mobile default not a microscopic strip) and §32
 * (mobile tests pass). Renders the REAL SldCanvasV2 at portrait phone sizes with
 * a wide-short network (magistrala „grzebień w dół") and asserts the initial
 * camera is readable — centered on the source at a legible scale — instead of
 * letterboxing the whole wide world into a thin band. Desktop still fits.
 *
 * WORLD GEOMETRY IS NOT ASSERTED HERE — this is a CAMERA test. Geometry
 * invariance is proven in ViewportController.test.ts (bbox untouched) and the
 * recovery oracles.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SldCanvasV2 } from '../SldCanvasV2';
import type { GpzRendererProps } from '../../renderer/GpzRenderer';
import type { StationOnRunRendererProps } from '../../renderer/StationOnRunRenderer';

// Wide-short network: GPZ (source) on the left, stations marching right along the
// trunk — width ≫ height, the exact shape that letterboxes on a portrait phone.
const GPZ: GpzRendererProps[] = [
  { id: 'gpz/main', x: 150, y: 300, name: 'GPZ' } as unknown as GpzRendererProps,
];

const STATIONS: StationOnRunRendererProps[] = Array.from({ length: 12 }, (_, i) => ({
  id: `stn/${i}/station`,
  x: 400 + i * 240,
  y: 300,
  name: `Stacja ${i + 1}`,
  topologicalType: i === 11 ? 'końcowa' : 'przelotowa',
}));

function renderCanvas(width: number, height: number) {
  return render(
    <SldCanvasV2
      width={width}
      height={height}
      gpzs={GPZ}
      sections={[]}
      cableRuns={[]}
      stations={STATIONS}
      ders={[]}
    />,
  );
}

function getScale(container: HTMLElement): number {
  const svg = container.querySelector('[data-testid="sld-canvas-v2"]');
  return Number(svg?.getAttribute('data-scale') ?? '0');
}

function getTransform(container: HTMLElement): { scale: number; tx: number; ty: number } {
  const svg = container.querySelector('[data-testid="sld-canvas-v2"]');
  return {
    scale: Number(svg?.getAttribute('data-scale') ?? '0'),
    tx: Number(svg?.getAttribute('data-translate-x') ?? '0'),
    ty: Number(svg?.getAttribute('data-translate-y') ?? '0'),
  };
}

describe('SldCanvasV2 — mobile camera (Step 7 / E15)', () => {
  afterEach(() => cleanup());

  it('portrait 430×932: default view is NOT a microscopic strip (scale ≥ readable floor)', () => {
    const { container } = renderCanvas(430, 932);
    // Letterbox fit of this world into 430px width would be ~0.11. The mobile
    // camera must keep the source legible, not shrink the whole network.
    expect(getScale(container)).toBeGreaterThanOrEqual(0.5);
  });

  it('portrait 390×844: default view stays readable on the smaller phone too', () => {
    const { container } = renderCanvas(390, 844);
    expect(getScale(container)).toBeGreaterThanOrEqual(0.5);
  });

  it('portrait mobile keeps the source (GPZ) inside the viewport, not off-screen', () => {
    const { container } = renderCanvas(430, 932);
    const { scale, tx, ty } = getTransform(container);
    // computeSourceFocusPoint for a plain GPZ = {150, 300}; on screen it must land
    // within the visible frame (the trunk then extends right, reachable by pan).
    const sourceScreenX = 150 * scale + tx;
    const sourceScreenY = 300 * scale + ty;
    expect(sourceScreenX).toBeGreaterThanOrEqual(0);
    expect(sourceScreenX).toBeLessThanOrEqual(430);
    expect(sourceScreenY).toBeGreaterThanOrEqual(0);
    expect(sourceScreenY).toBeLessThanOrEqual(932);
  });

  it('landscape desktop 1280×720: fits the whole wide network (scale below mobile floor)', () => {
    const { container } = renderCanvas(1280, 720);
    // Desktop is landscape → fit mode → whole network visible at a smaller scale.
    const scale = getScale(container);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(0.5);
  });

  it('world geometry is viewport-independent: station x positions do not change with size', () => {
    // The stations are laid out in world coordinates by the caller; the canvas
    // only changes the camera. Re-rendering at a different size must not move the
    // world nodes — assert the rendered station <g> world transforms are identical.
    const mobile = renderCanvas(430, 932);
    const mobileStation = mobile.container
      .querySelector('[data-testid="sld-v2-station-stn/5/station"]')
      ?.getAttribute('transform');
    cleanup();
    const desktop = renderCanvas(1280, 720);
    const desktopStation = desktop.container
      .querySelector('[data-testid="sld-v2-station-stn/5/station"]')
      ?.getAttribute('transform');
    // Station #5 world position = translate(1600, 300) regardless of viewport.
    expect(mobileStation).toBe('translate(1600, 300)');
    expect(mobileStation).toBe(desktopStation);
  });
});
