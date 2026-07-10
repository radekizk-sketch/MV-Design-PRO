/**
 * SLD V3 F6b — testy `canvas/camera.ts` (logika WŁASNA: histereza LOD
 * 3-poziomowa, pinch geometry, viewBox pochodny). Matematyka pan/zoom/fit
 * reużyta z v2 (`ViewportController.ts`) ma już pokrycie testowe w
 * `v2/__tests__/ViewportController.test.ts` — nie duplikujemy tu.
 */
import { describe, expect, it } from 'vitest';

import {
  boundingBoxOfRect,
  cameraReducer,
  cameraViewBox,
  computeInitialCameraState,
  DEFAULT_LOD_THRESHOLDS,
  lodFromScale,
  lodFromScaleWithHysteresis,
  pointerDistance,
  pointerMidpoint,
  type CameraState,
} from '../camera';

describe('lodFromScale (bez histerezy — klasyfikacja czysta)', () => {
  it('poniżej l0Max: LOD 0', () => {
    expect(lodFromScale(0.1)).toBe(0);
    expect(lodFromScale(DEFAULT_LOD_THRESHOLDS.l0Max - 0.001)).toBe(0);
  });
  it('między l0Max i l1Max: LOD 1', () => {
    expect(lodFromScale(DEFAULT_LOD_THRESHOLDS.l0Max)).toBe(1);
    expect(lodFromScale(DEFAULT_LOD_THRESHOLDS.l1Max - 0.001)).toBe(1);
  });
  it('od l1Max: LOD 2', () => {
    expect(lodFromScale(DEFAULT_LOD_THRESHOLDS.l1Max)).toBe(2);
    expect(lodFromScale(10)).toBe(2);
  });
});

describe('lodFromScaleWithHysteresis (spec §7 — nie migocze na granicy)', () => {
  it('scale drgający WOKÓŁ progu l0Max nie zmienia LOD (histereza)', () => {
    const { l0Max } = DEFAULT_LOD_THRESHOLDS;
    // Startujemy na LOD 0; scale tuż PONAD progiem (ale poniżej progu*(1+margin))
    // NIE wystarcza do przejścia — inaczej niż klasyfikacja bez histerezy.
    const justAbove = l0Max * 1.02;
    expect(lodFromScale(justAbove)).toBe(1); // klasyfikacja czysta BY zmieniła
    expect(lodFromScaleWithHysteresis(justAbove, 0)).toBe(0); // histereza: NIE
  });

  it('scale wystarczająco ponad próg (>= próg*(1+margin)) PRZEŁĄCZA LOD', () => {
    const { l0Max } = DEFAULT_LOD_THRESHOLDS;
    const wellAbove = l0Max * 1.2;
    expect(lodFromScaleWithHysteresis(wellAbove, 0)).toBe(1);
  });

  it('symetrycznie w dół: scale tuż PONIŻEJ progu nie wraca do niższego LOD', () => {
    const { l0Max } = DEFAULT_LOD_THRESHOLDS;
    const justBelow = l0Max * 0.98;
    expect(lodFromScaleWithHysteresis(justBelow, 1)).toBe(1);
    const wellBelow = l0Max * 0.8;
    expect(lodFromScaleWithHysteresis(wellBelow, 1)).toBe(0);
  });

  it('duży skok scale przechodzi przez POŚREDNI poziom (0→2 w jednym wywołaniu)', () => {
    const scale = DEFAULT_LOD_THRESHOLDS.l1Max * 2;
    expect(lodFromScaleWithHysteresis(scale, 0)).toBe(2);
  });

  it('brak zmiany LOD gdy scale pozostaje w tym samym przedziale', () => {
    expect(lodFromScaleWithHysteresis(0.6, 1)).toBe(1);
  });
});

describe('boundingBoxOfRect', () => {
  it('konwersja x/y/width/height → minX/minY/maxX/maxY', () => {
    expect(boundingBoxOfRect({ x: 10, y: 20, width: 100, height: 50 })).toEqual({
      minX: 10,
      minY: 20,
      maxX: 110,
      maxY: 70,
    });
  });
});

describe('cameraReducer (czysty — bez DOM)', () => {
  const initial: CameraState = { transform: { scale: 1, translateX: 0, translateY: 0 }, lod: 1 };

  it('pan przesuwa translateX/Y, NIE zmienia scale/lod', () => {
    const next = cameraReducer(initial, { type: 'pan', delta: { x: 10, y: -5 } });
    expect(next.transform.translateX).toBe(10);
    expect(next.transform.translateY).toBe(-5);
    expect(next.transform.scale).toBe(1);
    expect(next.lod).toBe(1);
  });

  it('zoom (factor > 1) powiększa scale i może podnieść LOD (z histerezą)', () => {
    const next = cameraReducer(initial, { type: 'zoom', cursor: { x: 0, y: 0 }, factor: 2 });
    expect(next.transform.scale).toBeGreaterThan(1);
  });
});

describe('computeInitialCameraState', () => {
  it('dopasowuje bbox do viewportu i klasyfikuje LOD startowy bez histerezy', () => {
    const bbox = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
    const state = computeInitialCameraState(bbox, { width: 800, height: 600 });
    expect(state.transform.scale).toBeGreaterThan(0);
    expect(state.lod).toBe(lodFromScale(state.transform.scale));
  });
});

describe('pointerDistance/pointerMidpoint (geometria pinch)', () => {
  it('dystans i środek dwóch punktów', () => {
    const points: readonly [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 6, y: 8 },
    ];
    expect(pointerDistance(points)).toBe(10);
    expect(pointerMidpoint(points)).toEqual({ x: 3, y: 4 });
  });
});

describe('cameraViewBox', () => {
  it('viewBox identyczny dla identycznego transformu (determinizm)', () => {
    const transform = { scale: 2, translateX: 10, translateY: 20 };
    const a = cameraViewBox(transform, { width: 800, height: 600 });
    const b = cameraViewBox(transform, { width: 800, height: 600 });
    expect(a).toBe(b);
  });

  it('viewBox przy scale=1, translate=0 pokrywa dokładnie viewport', () => {
    const transform = { scale: 1, translateX: 0, translateY: 0 };
    expect(cameraViewBox(transform, { width: 800, height: 600 })).toBe('0 0 800 600');
  });
});
