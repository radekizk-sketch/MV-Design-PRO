import { describe, it, expect } from 'vitest';
import { fitToContent, ZOOM_MAX, ZOOM_MIN } from '../types';
import type { AnySldSymbol } from '../../sld-editor/types';
import { CANONICAL_GEOMETRY } from '../sldCanonicalStyle';

describe('fitToContent', () => {
  it('computes deterministic viewport for known symbol set', () => {
    const symbols: AnySldSymbol[] = [
      {
        id: 'bus-1',
        elementId: 'bus-1',
        elementType: 'Bus',
        elementName: 'Bus 1',
        position: { x: 100, y: 100 },
        inService: true,
        width: 100,
        height: 20,
      },
      {
        id: 'load-1',
        elementId: 'load-1',
        elementType: 'Load',
        elementName: 'Load 1',
        position: { x: 300, y: 200 },
        inService: true,
        connectedToNodeId: 'bus-1',
      },
      {
        id: 'branch-1',
        elementId: 'branch-1',
        elementType: 'LineBranch',
        elementName: 'Line 1',
        position: { x: 450, y: 250 },
        inService: true,
        fromNodeId: 'bus-1',
        toNodeId: 'bus-2',
        points: [
          { x: 500, y: 50 },
          { x: 550, y: 450 },
        ],
      },
    ];

    const viewport = fitToContent(symbols, 1000, 600, CANONICAL_GEOMETRY.view.fitPaddingPx);

    expect(viewport.zoom).toBe(2.24);
    expect(viewport.offsetX).toBe(-94);
    expect(viewport.offsetY).toBe(-103);
  });

  it('returns finite zoom and offsets within bounds', () => {
    const symbols: AnySldSymbol[] = [
      {
        id: 'bus-1',
        elementId: 'bus-1',
        elementType: 'Bus',
        elementName: 'Bus 1',
        position: { x: 0, y: 0 },
        inService: true,
        width: 100,
        height: 20,
      },
    ];

    const viewport = fitToContent(symbols, 800, 600, CANONICAL_GEOMETRY.view.fitPaddingPx);

    expect(Number.isFinite(viewport.zoom)).toBe(true);
    expect(Number.isFinite(viewport.offsetX)).toBe(true);
    expect(Number.isFinite(viewport.offsetY)).toBe(true);
    expect(viewport.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(viewport.zoom).toBeLessThanOrEqual(ZOOM_MAX);
  });
});
