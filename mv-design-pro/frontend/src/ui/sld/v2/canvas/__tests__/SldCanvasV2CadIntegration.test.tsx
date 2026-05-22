/**
 * SldCanvasV2 + CadOverlay integration tests (Phase 2 polish — operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. Default SldCanvasV2 → CadOverlay NIE renderowany.
 *   2. cadOverlay props → CadOverlay renderowany w world transform group.
 *   3. snapState propagated do CadOverlay.
 *   4. ghosts/corridors/selectedRoutes propagated.
 *   5. ports + hoverPoint → magnets visible.
 *   6. CadOverlay pod content (z-order: render order matters).
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SldCanvasV2 } from '../SldCanvasV2';
import type { CadGhost } from '../CadOverlay';
import { DEFAULT_SNAP_STATE, type PortSnapTarget } from '../../viewport/Snap';
import { addBend, createRoute } from '../../geometry/RouteEditor';

function defaultProps() {
  return {
    width: 800,
    height: 600,
    gpzs: [],
    sections: [],
    cableRuns: [],
    stations: [],
    ders: [],
  } as const;
}

describe('SldCanvasV2 — default (bez cadOverlay props)', () => {
  it('CadOverlay NIE renderowany', () => {
    const { container } = render(<SldCanvasV2 {...defaultProps()} />);
    expect(container.querySelector('[data-testid="sld-v2-cad-overlay"]')).toBeNull();
  });
});

describe('SldCanvasV2 — z cadOverlay props', () => {
  it('cadOverlay={} → overlay renderowany z default snap state', () => {
    const { container } = render(
      <SldCanvasV2 {...defaultProps()} cadOverlay={{}} />,
    );
    expect(container.querySelector('[data-testid="sld-v2-cad-overlay"]')).toBeTruthy();
    // Default snap state → grid visible
    expect(container.querySelector('[data-testid="cad-overlay-grid"]')).toBeTruthy();
  });

  it('snapState.gridVisible=false → grid hidden', () => {
    const { container } = render(
      <SldCanvasV2
        {...defaultProps()}
        cadOverlay={{
          snapState: { ...DEFAULT_SNAP_STATE, gridVisible: false },
        }}
      />,
    );
    expect(container.querySelector('[data-testid="cad-overlay-grid"]')).toBeNull();
  });

  it('ghosts propagated → ghost markers w overlay', () => {
    const ghosts: CadGhost[] = [
      { kind: 'append-station', position: { x: 100, y: 100 } },
      { kind: 'split-station', position: { x: 200, y: 200 } },
    ];
    const { container } = render(
      <SldCanvasV2 {...defaultProps()} cadOverlay={{ ghosts }} />,
    );
    expect(container.querySelector('[data-testid="cad-ghost-append-station"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-ghost-split-station"]')).toBeTruthy();
  });

  it('corridors propagated → korytarze w overlay', () => {
    const corridors = [
      { id: 'c-gpz', yMin: 0, yMax: 100, kind: 'gpz' as const },
      { id: 'c-feeder', yMin: 100, yMax: 240, kind: 'main-trunk' as const },
    ];
    const { container } = render(
      <SldCanvasV2 {...defaultProps()} cadOverlay={{ corridors }} />,
    );
    expect(container.querySelector('[data-testid="cad-corridor-c-gpz"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-corridor-c-feeder"]')).toBeTruthy();
  });

  it('ports + hoverPoint + mode=port → magnet halo', () => {
    const ports: PortSnapTarget[] = [{ id: 'port-1', x: 100, y: 100 }];
    const { container } = render(
      <SldCanvasV2
        {...defaultProps()}
        cadOverlay={{
          snapState: { ...DEFAULT_SNAP_STATE, mode: 'port' },
          ports,
          hoverPoint: { x: 105, y: 102 },
        }}
      />,
    );
    expect(container.querySelector('[data-testid="cad-port-halo-port-1"]')).toBeTruthy();
  });

  it('selectedRoutes z bendami → bend handles renderowane', () => {
    let route = createRoute('r-1', { x: 0, y: 0 }, { x: 100, y: 0 });
    route = addBend(route, 0, { x: 40, y: 20 });
    const { container } = render(
      <SldCanvasV2
        {...defaultProps()}
        cadOverlay={{ selectedRoutes: [route] }}
      />,
    );
    expect(container.querySelector('[data-testid="cad-bend-handle-r-1-0"]')).toBeTruthy();
  });
});

describe('SldCanvasV2 — z-order (overlay pod content)', () => {
  it('CadOverlay renderowany przed connections + obiektami', () => {
    const { container } = render(
      <SldCanvasV2
        {...defaultProps()}
        cadOverlay={{ corridors: [{ id: 'c1', yMin: 0, yMax: 100, kind: 'gpz' }] }}
      />,
    );
    const svg = container.querySelector('svg')!;
    const overlay = svg.querySelector('[data-testid="sld-v2-cad-overlay"]')!;
    // CadOverlay jest dzieckiem world transform group
    expect(overlay.parentElement?.tagName.toLowerCase()).toBe('g');
  });
});

describe('SldCanvasV2 + CadOverlay — pełen workflow integration', () => {
  it('Dystych workflow: ghost append + bend handles + grid jednocześnie', () => {
    let route = createRoute('seg-1', { x: 0, y: 0 }, { x: 200, y: 0 });
    route = addBend(route, 0, { x: 100, y: 40 });
    const { container } = render(
      <SldCanvasV2
        {...defaultProps()}
        cadOverlay={{
          snapState: DEFAULT_SNAP_STATE,
          ghosts: [{ kind: 'append-station', position: { x: 200, y: 0 } }],
          selectedRoutes: [route],
          corridors: [{ id: 'c-feeder', yMin: 0, yMax: 100, kind: 'main-trunk' }],
        }}
      />,
    );
    // Wszystkie 4 sub-warstwy obecne
    expect(container.querySelector('[data-testid="cad-overlay-grid"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-ghost-append-station"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-bend-handle-seg-1-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-corridor-c-feeder"]')).toBeTruthy();
  });
});
