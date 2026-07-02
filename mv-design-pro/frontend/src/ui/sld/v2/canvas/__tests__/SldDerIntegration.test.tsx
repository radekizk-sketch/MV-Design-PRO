/**
 * Testy integracji SLD ↔ DER (Faza G):
 *  - Dwuklik DER (PV/BESS/FW) na SLD otwiera E-21/E-22/E-23.
 *  - Right-click stacji "add-source" otwiera E-13 z notify.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { SldCanvasV2 } from '../SldCanvasV2';
import type { StationOnRunRendererProps } from '../../renderer/StationOnRunRenderer';

/** Stacja przeglądowa (L0) z opcjonalnymi badge'ami OZE. */
function overviewStation(
  id: string,
  derBadges: StationOnRunRendererProps['derBadges'],
): StationOnRunRendererProps {
  return {
    id,
    x: 200,
    y: 300,
    name: `Stacja ${id}`,
    topologicalType: 'przelotowa',
    stationCode: id.toUpperCase(),
    snBays: [
      { bayRef: `${id}/we`, fieldRole: 'LINE_IN', designation: 'WE', hasMissingRequiredDevice: false },
      { bayRef: `${id}/tr`, fieldRole: 'TRANSFORMER', designation: 'TR', hasMissingRequiredDevice: false },
    ],
    hasTransformer: true,
    transformerRatedKva: 630,
    nnFeedersCount: 1,
    derBadges,
  };
}

const OVERVIEW_BASE = {
  width: 1200,
  height: 800,
  gpzs: [],
  sections: [],
  cableRuns: [],
  ders: [],
  lodOverride: 0 as const,
} as const;

describe('SLD ↔ DER integracja (Faza G)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('SldCanvasV2 wywołuje onDoubleClickDer z poprawnym id', () => {
    const onDoubleClickDer = vi.fn();
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[
          {
            id: 'der_pv_test',
            x: 100,
            y: 100,
            kind: 'PV',
            name: 'PV-Test',
            nominalPowerKw: 2500,
          },
        ]}
        lodOverride={4}
        onDoubleClickDer={onDoubleClickDer}
      />,
    );

    const derEl = container.querySelector('[data-element-kind="der_pv"]');
    expect(derEl).toBeTruthy();
    fireEvent.doubleClick(derEl!);
    expect(onDoubleClickDer).toHaveBeenCalledWith('der_pv_test');
  });

  it('SldCanvasV2 obsługuje DER kindy PV/BESS/FW poprzez onContextMenu', () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[
          { id: 'pv1', x: 100, y: 100, kind: 'PV', name: 'PV', nominalPowerKw: null },
          { id: 'bess1', x: 200, y: 100, kind: 'BESS', name: 'BESS', nominalPowerKw: null },
          { id: 'fw1', x: 300, y: 100, kind: 'FW', name: 'FW', nominalPowerKw: null },
        ]}
        lodOverride={4}
        onContextMenu={onContextMenu}
      />,
    );

    const ders = container.querySelectorAll('[data-testid^="sld-v2-der-hit-"]');
    expect(ders.length).toBe(3);

    fireEvent.contextMenu(ders[0]);
    fireEvent.contextMenu(ders[1]);
    fireEvent.contextMenu(ders[2]);
    expect(onContextMenu).toHaveBeenCalledTimes(3);
    // Sprawdzamy, że request.kind to der_pv/der_bess/der_fw
    const kinds = onContextMenu.mock.calls.map((c) => c[0].kind);
    expect(kinds).toContain('der_pv');
    expect(kinds).toContain('der_bess');
    expect(kinds).toContain('der_fw');
  });
});

describe('SLD ↔ DER: anotacja generacji na przeglądzie (L0)', () => {
  it('stacja z badge OZE renderuje anotację generacji z realnym rodzajem + mocą', () => {
    const { container } = render(
      <SldCanvasV2
        {...OVERVIEW_BASE}
        stations={[
          overviewStation('s01', [
            { kind: 'PV', count: 1, connectionSide: 'nn', hasBlockTransformer: false, totalPMw: 0.5 },
          ]),
        ]}
      />,
    );
    const ann = container.querySelector('[data-testid="sld-v2-station-generation-s01"]');
    expect(ann).toBeTruthy();
    // Dane = realny rodzaj OZE + moc (bez fabrykowanej nazwy "ELEKTROWNIA…").
    expect(ann!.getAttribute('data-generation-label')).toBe('PV 0,5 MW');
  });

  it('FW 2 MW → "FW 2 MW"; brak badge → brak anotacji', () => {
    const { container } = render(
      <SldCanvasV2
        {...OVERVIEW_BASE}
        stations={[
          overviewStation('s05', [
            { kind: 'FW', count: 1, connectionSide: 'nn', hasBlockTransformer: false, totalPMw: 2 },
          ]),
          overviewStation('s06', []),
        ]}
      />,
    );
    expect(
      container.querySelector('[data-testid="sld-v2-station-generation-s05"]')!.getAttribute('data-generation-label'),
    ).toBe('FW 2 MW');
    // Stacja bez generacji nie dostaje anotacji (no placeholder).
    expect(container.querySelector('[data-testid="sld-v2-station-generation-s06"]')).toBeNull();
  });

  it('wiele rodzajów na stacji → łączna moc pod etykietą "OZE"', () => {
    const { container } = render(
      <SldCanvasV2
        {...OVERVIEW_BASE}
        stations={[
          overviewStation('s17', [
            { kind: 'PV', count: 1, connectionSide: 'nn', hasBlockTransformer: false, totalPMw: 0.5 },
            { kind: 'BESS', count: 1, connectionSide: 'nn', hasBlockTransformer: false, totalPMw: 0.5 },
          ]),
        ]}
      />,
    );
    expect(
      container.querySelector('[data-testid="sld-v2-station-generation-s17"]')!.getAttribute('data-generation-label'),
    ).toBe('OZE 1 MW');
  });

  it('badge bez realnej mocy (totalPMw null) → brak anotacji (brak danych ≠ atrapa)', () => {
    const { container } = render(
      <SldCanvasV2
        {...OVERVIEW_BASE}
        stations={[
          overviewStation('s09', [
            { kind: 'PV', count: 1, connectionSide: 'nn', hasBlockTransformer: false, totalPMw: null },
          ]),
        ]}
      />,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-generation-s09"]')).toBeNull();
  });

  it('determinizm: identyczne badge → identyczna etykieta (czysta funkcja danych)', () => {
    const badges = [
      { kind: 'PV' as const, count: 2, connectionSide: 'nn' as const, hasBlockTransformer: false, totalPMw: 1.25 },
    ];
    const labels = Array.from({ length: 5 }, () => {
      const { container, unmount } = render(
        <SldCanvasV2 {...OVERVIEW_BASE} stations={[overviewStation('s20', badges)]} />,
      );
      const label = container
        .querySelector('[data-testid="sld-v2-station-generation-s20"]')!
        .getAttribute('data-generation-label');
      unmount();
      return label;
    });
    expect(new Set(labels).size).toBe(1);
    expect(labels[0]).toBe('PV 1,25 MW');
  });
});
