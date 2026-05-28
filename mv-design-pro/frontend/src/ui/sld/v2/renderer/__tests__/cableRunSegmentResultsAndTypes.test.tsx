import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { CableRunRenderer } from '../CableRunRenderer';

afterEach(() => cleanup());

describe('CableRunRenderer — wyniki i typy odcinkow na SLD', () => {
  it('pokazuje typ medium dla kazdego segmentu przy LOD 2+', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-types"
          runKind="main_trunk"
          pathPoints={[{ x: 0, y: 0 }, { x: 300, y: 0 }]}
          segmentKind="cable_sn"
          segmentPaths={[
            {
              segmentRef: 'seg/a',
              pathPoints: [{ x: 0, y: 0 }, { x: 140, y: 0 }],
              variant: { insulation: 'XLPE', conductor: 'Al' },
            },
            {
              segmentRef: 'seg/b',
              pathPoints: [{ x: 140, y: 0 }, { x: 300, y: 0 }],
              variant: { insulation: 'EPR', conductor: 'Cu' },
            },
          ]}
          lod={3}
        />
      </svg>,
    );

    expect(container.querySelector('[data-testid="sld-v2-run-run-types-segment-type-seg/a"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-run-run-types-segment-type-seg/b"]')).toBeTruthy();
    expect(container.innerHTML).toContain('Kabel SN');
    expect(container.innerHTML).toContain('XLPE Al');
    expect(container.innerHTML).toContain('EPR Cu');
  });

  it('pokazuje wynik na koncu kazdego segmentu bez wyznaczania fizyki w rendererze', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-results"
          runKind="main_trunk"
          pathPoints={[{ x: 0, y: 0 }, { x: 260, y: 0 }]}
          segmentKind="overhead_line_sn"
          segmentPaths={[
            { segmentRef: 'line/a', pathPoints: [{ x: 0, y: 0 }, { x: 120, y: 0 }] },
            { segmentRef: 'line/b', pathPoints: [{ x: 120, y: 0 }, { x: 260, y: 0 }] },
          ]}
          segmentEndpointResults={[
            { segmentRef: 'line/a', x: 120, y: 0, text: 'I 120 A', severity: 'INFO' },
            { segmentRef: 'line/b', x: 260, y: 0, text: 'brak wyniku', severity: null },
          ]}
          lod={3}
        />
      </svg>,
    );

    expect(container.querySelector('[data-testid="sld-v2-run-run-results-segment-end-result-line/a"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-run-run-results-segment-end-result-line/b"]')).toBeTruthy();
    expect(container.innerHTML).toContain('Linia nap. SN');
    expect(container.innerHTML).toContain('I 120 A');
    expect(container.innerHTML).toContain('brak wyniku');
  });

  it('pokazuje typ i wynik aktywnego odcinka takze przy LOD 0/1', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-lod"
          runKind="main_trunk"
          pathPoints={[{ x: 0, y: 0 }, { x: 160, y: 0 }]}
          segmentKind="cable_sn"
          segmentPaths={[{ segmentRef: 'seg/a', pathPoints: [{ x: 0, y: 0 }, { x: 160, y: 0 }] }]}
          segmentEndpointResults={[{ segmentRef: 'seg/a', x: 160, y: 0, text: 'I 50 A' }]}
          lod={1}
        />
      </svg>,
    );

    expect(container.querySelector('[data-testid="sld-v2-run-run-lod-segment-type-seg/a"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-run-run-lod-segment-end-result-seg/a"]')).toBeTruthy();
  });
});
