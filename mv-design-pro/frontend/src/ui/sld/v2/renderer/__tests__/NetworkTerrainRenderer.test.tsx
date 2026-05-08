/**
 * NetworkTerrainRenderer (R17) tests — pełna sieć terenowa SN.
 *
 * Pokrycie:
 *   - Renderowanie segmentów kabli SN przez porty IN/OUT
 *   - Renderowanie mini-RMU stacji w sieci
 *   - Overlays (voltage / flow / losses)
 *   - Interakcja (click/dblclick/contextmenu)
 *   - Tooltips (SVG <title>)
 *   - Determinizm (memo)
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, cleanup } from '@testing-library/react';

import {
  NetworkTerrainRenderer,
  type NetworkSegment,
  type NetworkStation,
  type NetworkTerrainRendererProps,
} from '../NetworkTerrainRenderer';

function station(overrides: Partial<NetworkStation> = {}): NetworkStation {
  return {
    stationRef: 'sta-1',
    name: 'STAROŁĘCKA 42',
    x: 600,
    y: 360,
    footprintType: 'mv_lv_terminal',
    snBays: [
      { bayRef: 'b-in', fieldRole: 'LINE_IN', designation: '1', hasMissingRequiredDevice: false },
      { bayRef: 'b-tr', fieldRole: 'TRANSFORMER', designation: 'TR', hasMissingRequiredDevice: false },
      { bayRef: 'b-out', fieldRole: 'LINE_OUT', designation: '3', hasMissingRequiredDevice: false },
    ],
    hasTransformer: true,
    transformerRatedKva: 630,
    nnFeedersCount: 4,
    derBadges: [],
    missingData: false,
    ...overrides,
  };
}

function segment(overrides: Partial<NetworkSegment> = {}): NetworkSegment {
  return {
    segmentId: 'seg-1',
    runKind: 'main_trunk',
    segmentKind: 'cable_sn',
    source: { elementRef: 'gpz', bayRef: null, portKind: 'sn_output', x: 1200, y: 200 },
    target: { elementRef: 'sta-1', bayRef: 'b-in', portKind: 'sn_input', x: 600, y: 332 },
    pathPoints: [{ x: 1200, y: 200 }, { x: 900, y: 200 }, { x: 900, y: 332 }, { x: 600, y: 332 }],
    energization: 'energized',
    flowDirection: 'forward',
    cableNumber: 'MST1795',
    lengthM: 350,
    catalogRef: 'cable:XRUHKXS:240',
    measurements: null,
    ...overrides,
  };
}

function baseProps(overrides: Partial<NetworkTerrainRendererProps> = {}): NetworkTerrainRendererProps {
  return {
    gpzAnchor: { x: 1200, y: 200 },
    segments: [segment()],
    stations: [station()],
    overlayMode: 'none',
    ...overrides,
  };
}

describe('NetworkTerrainRenderer R17 — struktura', () => {
  it('Renderuje główne data-testid', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    expect(container.querySelector('[data-testid="sld-v2-network-terrain"]')).toBeTruthy();
    cleanup();
  });

  it('Renderuje GPZ anchor marker', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    expect(container.querySelector('[data-testid="network-terrain-gpz-anchor"]')).toBeTruthy();
    cleanup();
  });

  it('Renderuje N segmentów per props.segments', () => {
    const segs = [
      segment({ segmentId: 's1' }),
      segment({ segmentId: 's2' }),
      segment({ segmentId: 's3' }),
    ];
    const { container } = render(<NetworkTerrainRenderer {...baseProps({ segments: segs })} />);
    expect(container.querySelectorAll('[data-testid^="network-segment-"]').length).toBeGreaterThanOrEqual(3);
    cleanup();
  });

  it('Renderuje N stacji per props.stations', () => {
    const stas = [
      station({ stationRef: 's1', x: 400 }),
      station({ stationRef: 's2', x: 600 }),
      station({ stationRef: 's3', x: 800 }),
    ];
    const { container } = render(<NetworkTerrainRenderer {...baseProps({ stations: stas })} />);
    expect(container.querySelectorAll('[data-testid^="network-station-"]').length).toBe(3);
    cleanup();
  });

  it('Segment ma path z punktami orthogonal', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    const path = container.querySelector('[data-testid="network-segment-seg-1-path"]');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('d')).toContain('M 1200 200');
    cleanup();
  });

  it('Segment ma label kabla (numer dyspozytorski)', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    const label = container.querySelector('[data-testid="network-segment-seg-1-label"]');
    expect(label?.textContent).toBe('MST1795');
    cleanup();
  });
});

describe('NetworkTerrainRenderer R17 — porty IN/OUT (Inv portKind)', () => {
  it('Source port jest sn_output (z GPZ lub stacji prev)', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    /* data-source-port-kind nie wyciągamy bezpośrednio, ale tooltipText zawiera info */
    const seg = container.querySelector('[data-testid="network-segment-seg-1"]');
    const title = seg?.querySelector('title');
    expect(title?.textContent).toContain('port wyjścia SN');
    cleanup();
  });

  it('Target port jest sn_input (do stacji next)', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    const seg = container.querySelector('[data-testid="network-segment-seg-1"]');
    const title = seg?.querySelector('title');
    expect(title?.textContent).toContain('port wejścia SN');
    cleanup();
  });

  it('Path zaczyna się z source (x,y) i kończy w target (x,y)', () => {
    const segs = [segment({
      source: { elementRef: 'gpz', bayRef: null, portKind: 'sn_output', x: 100, y: 200 },
      target: { elementRef: 'sta-x', bayRef: 'b1', portKind: 'sn_input', x: 800, y: 600 },
      pathPoints: [{ x: 100, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 600 }, { x: 800, y: 600 }],
    })];
    const { container } = render(<NetworkTerrainRenderer {...baseProps({ segments: segs })} />);
    const path = container.querySelector('[data-testid="network-segment-seg-1-path"]');
    const d = path?.getAttribute('d');
    expect(d).toMatch(/^M 100 200/);
    expect(d).toMatch(/L 800 600$/);
    cleanup();
  });
});

describe('NetworkTerrainRenderer R17 — overlay modes', () => {
  it('overlayMode=flow + flowDirection=forward → renderuje arrow', () => {
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ overlayMode: 'flow' })} />,
    );
    const arrow = container.querySelector('[data-testid="network-segment-flow-arrow"]');
    expect(arrow).toBeTruthy();
    cleanup();
  });

  it('overlayMode=none → brak arrow', () => {
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ overlayMode: 'none' })} />,
    );
    expect(container.querySelector('[data-testid="network-segment-flow-arrow"]')).toBeNull();
    cleanup();
  });

  it('overlayMode=flow + measurements.pMw → label P MW', () => {
    const segs = [segment({
      measurements: { pMw: 5.5, qMvar: 1.2, iA: 80, lossPercent: 1.5 },
    })];
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ segments: segs, overlayMode: 'flow' })} />,
    );
    const label = container.querySelector('[data-testid="network-segment-measurement-label"]');
    expect(label?.textContent).toContain('5.50 MW');
    cleanup();
  });

  it('overlayMode=losses + lossPercent → label %', () => {
    const segs = [segment({
      measurements: { lossPercent: 3.5 },
    })];
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ segments: segs, overlayMode: 'losses' })} />,
    );
    const label = container.querySelector('[data-testid="network-segment-measurement-label"]');
    expect(label?.textContent).toContain('3.50%');
    cleanup();
  });

  it('overlayMode=voltage + voltageActualKv → label kV per stacja', () => {
    const stas = [station({ voltageActualKv: 14.85, voltageDropPercent: 1.0 })];
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ stations: stas, overlayMode: 'voltage' })} />,
    );
    const label = container.querySelector('[data-testid="network-station-sta-1-voltage"]');
    expect(label?.textContent).toContain('14.85 kV');
    cleanup();
  });
});

describe('NetworkTerrainRenderer R17 — interakcja', () => {
  it('Click na segment → onClickSegment(segId)', () => {
    const onClick = vi.fn();
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ onClickSegment: onClick })} />,
    );
    const seg = container.querySelector('[data-testid="network-segment-seg-1"]') as Element;
    fireEvent.click(seg);
    expect(onClick).toHaveBeenCalledWith('seg-1');
    cleanup();
  });

  it('Right-click na segment → onContextMenuSegment z (segId, evt)', () => {
    const onCtx = vi.fn();
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ onContextMenuSegment: onCtx })} />,
    );
    const seg = container.querySelector('[data-testid="network-segment-seg-1"]') as Element;
    fireEvent.contextMenu(seg);
    expect(onCtx).toHaveBeenCalledWith(
      'seg-1',
      expect.objectContaining({ clientX: expect.any(Number), clientY: expect.any(Number) }),
    );
    cleanup();
  });

  it('Hover na segment → onHoverSegment(segId, null on leave)', () => {
    const onHover = vi.fn();
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ onHoverSegment: onHover })} />,
    );
    const seg = container.querySelector('[data-testid="network-segment-seg-1"]') as Element;
    fireEvent.mouseEnter(seg);
    expect(onHover).toHaveBeenCalledWith('seg-1');
    fireEvent.mouseLeave(seg);
    expect(onHover).toHaveBeenCalledWith(null);
    cleanup();
  });

  it('Right-click na stacji → onContextMenuStation', () => {
    const onCtx = vi.fn();
    const { container } = render(
      <NetworkTerrainRenderer {...baseProps({ onContextMenuStation: onCtx })} />,
    );
    const sta = container.querySelector('[data-testid="network-station-sta-1"]') as Element;
    fireEvent.contextMenu(sta);
    expect(onCtx).toHaveBeenCalledWith(
      'sta-1',
      expect.objectContaining({ clientX: expect.any(Number), clientY: expect.any(Number) }),
    );
    cleanup();
  });
});

describe('NetworkTerrainRenderer R17 — tooltips (SVG <title>)', () => {
  it('Segment <title> zawiera kanon polski + numer + długość + stan', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    const title = container.querySelector('[data-testid="network-segment-seg-1"] title');
    expect(title?.textContent).toContain('ciąg główny');
    expect(title?.textContent).toContain('Numer: MST1795');
    expect(title?.textContent).toContain('Długość: 350 m');
    expect(title?.textContent).toContain('pod napięciem');
    cleanup();
  });

  it('Tooltip z measurements P/Q/I + straty', () => {
    const segs = [segment({
      measurements: { pMw: 5.5, qMvar: 1.2, iA: 80, lossPercent: 1.5 },
    })];
    const { container } = render(<NetworkTerrainRenderer {...baseProps({ segments: segs })} />);
    const title = container.querySelector('[data-testid="network-segment-seg-1"] title');
    expect(title?.textContent).toContain('P = 5.50 MW');
    expect(title?.textContent).toContain('Q = 1.20 MVAr');
    expect(title?.textContent).toContain('I = 80 A');
    expect(title?.textContent).toContain('Straty: 1.50%');
    cleanup();
  });

  it('Segment NOP (tie_open) ma odrębny tooltip', () => {
    const segs = [segment({ runKind: 'tie_open', energization: 'deenergized', flowDirection: 'none' })];
    const { container } = render(<NetworkTerrainRenderer {...baseProps({ segments: segs })} />);
    const title = container.querySelector('[data-testid="network-segment-seg-1"] title');
    expect(title?.textContent).toContain('normalnie otwarty (NOP)');
    expect(title?.textContent).toContain('bez napięcia');
    cleanup();
  });
});

describe('NetworkTerrainRenderer R17 — a11y', () => {
  it('Top-level <g> ma role="group" + aria-label po polsku', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    const root = container.querySelector('[data-testid="sld-v2-network-terrain"]');
    expect(root?.getAttribute('role')).toBe('group');
    expect(root?.getAttribute('aria-label')).toContain('Sieć terenowa SN');
    expect(root?.getAttribute('aria-label')).toContain('1 stacji');
    expect(root?.getAttribute('aria-label')).toContain('1 segmentów');
    cleanup();
  });
});

describe('NetworkTerrainRenderer R17 — determinizm + perf', () => {
  it('NetworkTerrainRenderer jest opakowany w memo', () => {
    const memoSymbol = Symbol.for('react.memo');
    expect((NetworkTerrainRenderer as unknown as { $$typeof: symbol }).$$typeof).toBe(memoSymbol);
  });

  it('BBox jest obliczany deterministycznie (w data atrybutach)', () => {
    const { container } = render(<NetworkTerrainRenderer {...baseProps()} />);
    const root = container.querySelector('[data-testid="sld-v2-network-terrain"]');
    expect(root?.getAttribute('data-bbox-x')).toBeTruthy();
    expect(root?.getAttribute('data-bbox-y')).toBeTruthy();
    expect(root?.getAttribute('data-bbox-w')).toBeTruthy();
    expect(root?.getAttribute('data-bbox-h')).toBeTruthy();
    cleanup();
  });
});
