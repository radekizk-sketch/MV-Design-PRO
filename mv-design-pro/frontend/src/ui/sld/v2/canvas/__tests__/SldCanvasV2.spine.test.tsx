/**
 * SldCanvasV2 spine overlay integration test.
 *
 * Sprawdza że gdy spineModel jest podany, SldCanvasV2 renderuje
 * dodatkową warstwę sld-spine-layer z SpineRenderer.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SldCanvasV2 } from '../SldCanvasV2';
import type { SpineModel } from '../../builder/SpinePolicy';

function emptyCanvasProps() {
  return {
    width: 800,
    height: 600,
    gpzs: [],
    sections: [],
    cableRuns: [],
    stations: [],
    ders: [],
  };
}

function makeSpineModel(): SpineModel {
  return {
    corridors: [
      {
        spineId: 'RUN-1',
        label: 'Ciąg SN-1',
        axisY: 300,
        xStart: 100,
        xEnd: 500,
        nodes: [
          { ref: 'GPZ-1', kind: 'gpz', x: 100, label: 'GPZ-1' },
          { ref: 'ST-A', kind: 'station', x: 300, label: 'ST-A' },
        ],
        branches: [],
      },
    ],
    totalNodes: 2,
  };
}

describe('SldCanvasV2 spine overlay', () => {
  it('Bez spineModel: brak warstwy sld-spine-layer', () => {
    const { container } = render(<SldCanvasV2 {...emptyCanvasProps()} />);
    expect(container.querySelector('[data-testid="sld-spine-layer"]')).toBeNull();
  });

  it('Z spineModel: rendered sld-spine-layer + SpineRenderer', () => {
    const { container } = render(
      <SldCanvasV2 {...emptyCanvasProps()} spineModel={makeSpineModel()} />,
    );
    expect(container.querySelector('[data-testid="sld-spine-layer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="spine-renderer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="spine-axis-RUN-1"]')).toBeTruthy();
  });

  it('Z spineModel + layer equipment=false: warstwa ukryta', () => {
    const { container } = render(
      <SldCanvasV2
        {...emptyCanvasProps()}
        spineModel={makeSpineModel()}
        layerVisibility={{ equipment: false }}
      />,
    );
    expect(container.querySelector('[data-testid="sld-spine-layer"]')).toBeNull();
  });

  it('Z spineModel pustym: layer obecna ale bez corridor', () => {
    const empty: SpineModel = { corridors: [], totalNodes: 0 };
    const { container } = render(<SldCanvasV2 {...emptyCanvasProps()} spineModel={empty} />);
    expect(container.querySelector('[data-testid="sld-spine-layer"]')).toBeTruthy();
    expect(container.querySelector('[data-spine-id]')).toBeNull();
  });
});
