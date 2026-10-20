/**
 * Odbiór CAD: polecenie „Szczegóły CAD” jest prawdziwym przybliżeniem
 * produkcyjnej kanwy, a nie nową projekcją elektryczną.
 * Testy obejmują dawny problem: widok 53 stacji ma scale około 0,1–0,2,
 * pełny L2 nie jest wtedy użyteczny do czytania symboli ani etykiet.
 */
import { describe, expect, it } from 'vitest';
import { cameraReducer, type CameraState } from '../camera';
import { screenToWorld } from '../../../v2/viewport/ViewportController';

const bbox = { minX: 0, minY: 0, maxX: 12000, maxY: 8500 };
const viewportSize = { width: 1600, height: 900 };
function fullView(): CameraState {
  return {
    transform: { scale: 0.12, translateX: 0, translateY: 0 },
    lod: 0,
    viewportSize,
    lodBboxes: { 0: bbox, 1: bbox, 2: bbox },
  };
}

describe('CAD — przybliżanie rzeczywistego fragmentu na L2', () => {
  it('skokowo zwiększa skalę względem przeglądu całej sieci i pokazuje L2', () => {
    const initial = fullView();
    const station = { minX: 2400, minY: 1800, maxX: 2800, maxY: 2200 };
    const focused = cameraReducer(initial, { type: 'cadFocus', bbox: station, viewportSize });
    expect(focused.lod).toBe(2);
    expect(focused.transform.scale).toBeGreaterThan(initial.transform.scale * 8);
    expect(focused.transform.scale).toBeLessThanOrEqual(2.4);
    const c = screenToWorld({ x: 800, y: 450 }, focused.transform);
    expect(c.x).toBeCloseTo(2600, 6);
    expect(c.y).toBeCloseTo(2000, 6);
    expect(initial.transform.scale).toBe(0.12);
    expect(initial.lod).toBe(0);
  });

  it('gdy stacja jest rozległa: nie ucina jej na siłę dla uzyskania dużej czcionki', () => {
    const initial = fullView();
    const focus = { minX: 400, minY: 200, maxX: 4400, maxY: 2900 };
    const focused = cameraReducer(initial, { type: 'cadFocus', bbox: focus, viewportSize });
    expect(focused.transform.scale).toBeGreaterThan(0);
    expect(focused.transform.scale).toBeLessThan(0.5);
    const projectedWidth = (focus.maxX - focus.minX) * focused.transform.scale;
    const projectedHeight = (focus.maxY - focus.minY) * focused.transform.scale;
    expect(projectedWidth).toBeLessThan(viewportSize.width);
    expect(projectedHeight).toBeLessThan(viewportSize.height);
  });

  it('bbox nierozwiązywalny nie zmienia kamery ani LOD', () => {
    const initial = fullView();
    expect(cameraReducer(initial, {
      type: 'cadFocus',
      bbox: { minX: 12, minY: 12, maxX: 12, maxY: 25 },
      viewportSize,
    })).toBe(initial);
  });
});
