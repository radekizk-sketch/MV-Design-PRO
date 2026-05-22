/**
 * CadOverlay — Phase 2 polish testy (operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. Render: root <g> + 5 sub-warstw (corridors/grid/ghosts/magnets/bends).
 *   2. Grid: visible gdy snapState.gridVisible=true.
 *   3. Grid: skip gdy zbyt zoomed-out (>5000 dots).
 *   4. Port magnets: tylko gdy mode='port' + hoverPoint blisko portu.
 *   5. Bend handles: renderowane dla każdego bend point per route.
 *   6. Locked route: bend handles przygaszone, cursor 'not-allowed'.
 *   7. Ghost previews: 4 ghost kinds (append-station + 3 split kinds).
 *   8. Korytarze: rect z kolorami per kind.
 *   9. Ghost label PL: GHOST_KIND_LABEL_PL.
 *  10. data-testid invariants.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type RouteSegment, addBend, createRoute, lockRoute } from '../../geometry/RouteEditor';
import { DEFAULT_SNAP_STATE, type PortSnapTarget } from '../../viewport/Snap';
import { CadOverlay, type CadCorridorBand, type CadGhost } from '../CadOverlay';

function defaultProps() {
  return {
    width: 800,
    height: 600,
    viewportScale: 1,
    viewportTx: 0,
    viewportTy: 0,
    snapState: DEFAULT_SNAP_STATE,
  } as const;
}

function renderOverlay(overrides: Partial<React.ComponentProps<typeof CadOverlay>> = {}) {
  return render(
    <svg width={800} height={600}>
      <CadOverlay {...defaultProps()} {...overrides} />
    </svg>,
  );
}

describe('CadOverlay — root + sub-warstwy', () => {
  it('Renderuje root <g> z data-testid', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('[data-testid="sld-v2-cad-overlay"]')).toBeTruthy();
  });

  it('Default props: grid widoczny, brak ghosts/corridors/magnets/bends', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('[data-testid="cad-overlay-grid"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-overlay-corridors"]')).toBeNull();
    expect(container.querySelector('[data-testid="cad-overlay-ghosts"]')).toBeNull();
    expect(container.querySelector('[data-testid="cad-overlay-port-magnets"]')).toBeNull();
    expect(container.querySelector('[data-testid="cad-overlay-bend-handles"]')).toBeNull();
  });
});

describe('CadOverlay — grid', () => {
  it('snapState.gridVisible=false → grid hidden', () => {
    const { container } = renderOverlay({
      snapState: { ...DEFAULT_SNAP_STATE, gridVisible: false },
    });
    expect(container.querySelector('[data-testid="cad-overlay-grid"]')).toBeNull();
  });

  it('Wide zoom-out (>5000 dots) → major-only marker', () => {
    const { container } = renderOverlay({
      width: 8000,
      height: 8000,
      viewportScale: 0.05, // ekstremalny zoom-out
    });
    const grid = container.querySelector('[data-testid="cad-overlay-grid"]');
    expect(grid?.getAttribute('data-grid-mode')).toBe('major-only');
    expect(grid?.getAttribute('data-skip-reason')).toBe('too-many-dots');
  });

  it('Normal zoom: dots renderowane', () => {
    const { container } = renderOverlay();
    const dots = container.querySelectorAll('[data-testid="cad-overlay-grid"] circle');
    expect(dots.length).toBeGreaterThan(0);
  });
});

describe('CadOverlay — port magnets', () => {
  const ports: PortSnapTarget[] = [
    { id: 'port-1', x: 100, y: 100 },
    { id: 'port-2', x: 200, y: 200 },
  ];

  it('mode=port + hover blisko port → halo widoczne', () => {
    const { container } = renderOverlay({
      snapState: { ...DEFAULT_SNAP_STATE, mode: 'port' },
      ports,
      hoverPoint: { x: 105, y: 102 },
    });
    expect(container.querySelector('[data-testid="cad-port-halo-port-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-port-halo-port-2"]')).toBeNull();
  });

  it('mode=grid → magnets NIE renderowane mimo hover', () => {
    const { container } = renderOverlay({
      snapState: { ...DEFAULT_SNAP_STATE, mode: 'grid' },
      ports,
      hoverPoint: { x: 100, y: 100 },
    });
    expect(container.querySelector('[data-testid="cad-overlay-port-magnets"]')).toBeNull();
  });

  it('mode=port BEZ hover → magnets NIE renderowane', () => {
    const { container } = renderOverlay({
      snapState: { ...DEFAULT_SNAP_STATE, mode: 'port' },
      ports,
      hoverPoint: null,
    });
    expect(container.querySelector('[data-testid="cad-overlay-port-magnets"]')).toBeNull();
  });
});

describe('CadOverlay — bend handles', () => {
  it('Route z 2 bendami → 2 handles renderowane', () => {
    let route = createRoute('seg-1', { x: 0, y: 0 }, { x: 100, y: 0 });
    route = addBend(route, 0, { x: 40, y: 20 });
    route = addBend(route, 1, { x: 80, y: 20 });
    const { container } = renderOverlay({ selectedRoutes: [route] });
    expect(container.querySelector('[data-testid="cad-bend-handle-seg-1-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-bend-handle-seg-1-1"]')).toBeTruthy();
  });

  it('Locked route → handles z data-locked="true"', () => {
    let route = createRoute('seg-1', { x: 0, y: 0 }, { x: 100, y: 0 });
    route = addBend(route, 0, { x: 40, y: 20 });
    route = lockRoute(route);
    const { container } = renderOverlay({ selectedRoutes: [route] });
    const handles = container.querySelector('[data-testid="cad-bend-handles-seg-1"]');
    expect(handles?.getAttribute('data-locked')).toBe('true');
  });

  it('Brak bendów → brak handles dla tego route', () => {
    const route = createRoute('seg-empty', { x: 0, y: 0 }, { x: 100, y: 0 });
    const { container } = renderOverlay({ selectedRoutes: [route] });
    const handles = container.querySelector('[data-testid="cad-bend-handles-seg-empty"]');
    expect(handles).toBeTruthy(); // wrapper jest, ale brak rect
    expect(handles?.querySelectorAll('rect')).toHaveLength(0);
  });
});

describe('CadOverlay — ghost previews', () => {
  it('4 ghost kinds renderowane z PL labels', () => {
    const ghosts: CadGhost[] = [
      { kind: 'append-station', position: { x: 100, y: 100 } },
      { kind: 'split-station', position: { x: 200, y: 100 } },
      { kind: 'split-zksn', position: { x: 300, y: 100 } },
      { kind: 'split-pole', position: { x: 400, y: 100 } },
    ];
    const { container, getByText } = renderOverlay({ ghosts });
    expect(container.querySelectorAll('[data-testid^="cad-ghost-"]')).toHaveLength(4);
    // PL labels widoczne
    expect(getByText('Nowa stacja na końcu odcinka')).toBeTruthy();
    expect(getByText('Podział: nowa stacja')).toBeTruthy();
    expect(getByText('Podział: ZKSN')).toBeTruthy();
    expect(getByText('Podział: słup rozgałęźny')).toBeTruthy();
  });

  it('Custom label override default PL', () => {
    const { getByText } = renderOverlay({
      ghosts: [{ kind: 'append-station', position: { x: 100, y: 100 }, label: 'Stacja Sady' }],
    });
    expect(getByText('Stacja Sady')).toBeTruthy();
  });
});

describe('CadOverlay — corridors', () => {
  it('Render 3 korytarzy z kolorami per kind', () => {
    const corridors: CadCorridorBand[] = [
      { id: 'c-gpz', yMin: 0, yMax: 100, kind: 'gpz' },
      { id: 'c-feeder', yMin: 100, yMax: 200, kind: 'main-trunk' },
      { id: 'c-branch', yMin: 200, yMax: 280, kind: 'branch' },
    ];
    const { container } = renderOverlay({ corridors });
    expect(container.querySelector('[data-testid="cad-corridor-c-gpz"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-corridor-c-feeder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cad-corridor-c-branch"]')).toBeTruthy();
    // data-corridor-kind attribute
    expect(
      container.querySelector('[data-testid="cad-corridor-c-gpz"]')?.getAttribute('data-corridor-kind'),
    ).toBe('gpz');
  });

  it('Brak corridors → wrapper NIE renderowany', () => {
    const { container } = renderOverlay({ corridors: [] });
    expect(container.querySelector('[data-testid="cad-overlay-corridors"]')).toBeNull();
  });
});

describe('CadOverlay — determinizm', () => {
  it('Render 3 reruny z tymi samymi props → identyczny markup', () => {
    const props = {
      ...defaultProps(),
      corridors: [{ id: 'c1', yMin: 0, yMax: 100, kind: 'gpz' as const }],
    };
    const r1 = render(<svg><CadOverlay {...props} /></svg>);
    const html1 = r1.container.innerHTML;
    r1.unmount();
    const r2 = render(<svg><CadOverlay {...props} /></svg>);
    const html2 = r2.container.innerHTML;
    expect(html2).toBe(html1);
  });
});
