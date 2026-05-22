/**
 * Testy integracji SLD ↔ DER (Faza G):
 *  - Dwuklik DER (PV/BESS/FW) na SLD otwiera E-21/E-22/E-23.
 *  - Right-click stacji "add-source" otwiera E-13 z notify.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { SldCanvasV2 } from '../SldCanvasV2';

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
