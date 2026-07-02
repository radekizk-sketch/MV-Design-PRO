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

  it('odsuwa cable-type chip od aparatury pola stacji przy zoomie stacji (aparat > chip)', () => {
    // Pojedynczy poziomy odcinek y=0 od x=0 do x=600 → domyślny chip w środku
    // (x≈300). Stacja na torze ma port w x=300 (keep-clear ≈ x∈[184,416]).
    // Declutter musi przesunąć chip WZDŁUŻ kabla poza ten pas (lub go ukryć).
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-clear"
          runKind="main_trunk"
          pathPoints={[{ x: 0, y: 0 }, { x: 600, y: 0 }]}
          segmentKind="cable_sn"
          segmentPaths={[
            {
              segmentRef: 'seg/clear',
              pathPoints: [{ x: 0, y: 0 }, { x: 600, y: 0 }],
              variant: { insulation: 'XLPE', conductor: 'Al' },
            },
          ]}
          stationPortGaps={[{ stationId: 'stn/x', y: 0, inputX: 300, outputX: null }]}
          lod={3}
        />
      </svg>,
    );

    const chip = container.querySelector(
      '[data-testid="sld-v2-run-run-clear-segment-type-seg/clear"]',
    );
    expect(chip).toBeTruthy();
    // Chip nie może leżeć nad kolumną pola stacji (x∈[184,416] na y w pasie aparatury).
    const transform = chip?.getAttribute('transform') ?? '';
    const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
    expect(match).toBeTruthy();
    const cxChip = Number(match![1]);
    const cyChip = Number(match![2]);
    const inApparatusBandX = cxChip > 184 && cxChip < 416;
    const inApparatusBandY = cyChip > -22 && cyChip < 248;
    expect(inApparatusBandX && inApparatusBandY).toBe(false);
  });

  it('zachowuje cable-type chip gdy brak stacji na torze (back-compat)', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-nogap"
          runKind="main_trunk"
          pathPoints={[{ x: 0, y: 0 }, { x: 600, y: 0 }]}
          segmentKind="cable_sn"
          segmentPaths={[
            {
              segmentRef: 'seg/nogap',
              pathPoints: [{ x: 0, y: 0 }, { x: 600, y: 0 }],
              variant: { insulation: 'XLPE', conductor: 'Al' },
            },
          ]}
          lod={3}
        />
      </svg>,
    );
    // Bez keep-clear boxów chip pozostaje w pozycji bazowej (środek odcinka).
    const chip = container.querySelector(
      '[data-testid="sld-v2-run-run-nogap-segment-type-seg/nogap"]',
    );
    expect(chip).toBeTruthy();
    const transform = chip?.getAttribute('transform') ?? '';
    const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBe(300);
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
