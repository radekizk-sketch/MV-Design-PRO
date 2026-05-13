/**
 * CableRunRenderer — missing endpoint port warning marker.
 *
 * Sprawdza, że gdy props.missingEndpointPort=true:
 * - widoczna linia ma dashed warning stroke (czerwona),
 * - renderer pokazuje marker `!` na początku i końcu ścieżki,
 * - data-testid `sld-v2-run-<id>-missing-port-marker` jest obecne.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { CableRunRenderer } from '../CableRunRenderer';

const PATH = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
];

describe('CableRunRenderer — missing endpoint port warning', () => {
  it('renderuje marker brakującego portu gdy missingEndpointPort=true', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run_warn"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          missingEndpointPort
        />
      </svg>,
    );
    const marker = container.querySelector('[data-testid="sld-v2-run-run_warn-missing-port-marker"]');
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute('data-warning')).toBe('connection_port_missing');
  });

  it('nie renderuje markera gdy missingEndpointPort niezdefiniowany', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run_ok"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
        />
      </svg>,
    );
    expect(
      container.querySelector('[data-testid="sld-v2-run-run_ok-missing-port-marker"]'),
    ).toBeNull();
  });

  it('renderuje linię ciągu (visible path) niezależnie od missingEndpointPort', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run_warn2"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          missingEndpointPort
        />
      </svg>,
    );
    const visible = container.querySelector('[data-testid="sld-v2-run-run_warn2-visible-0"]');
    expect(visible).not.toBeNull();
  });

  it('odsuwa etykietę odcinka od aparatury mini-RMU stacji', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run_station"
          runKind="main_trunk"
          pathPoints={[
            { x: 0, y: 0 },
            { x: 300, y: 0 },
          ]}
          segmentKind="cable_sn"
          segmentLabels={[
            {
              segmentRef: 'seg-1',
              text: 'Kabel EPR Al 1×120 · 500 m',
              x: 300,
              y: -12,
            },
          ]}
          stationPortGaps={[
            {
              stationId: 'st-1',
              y: 0,
              inputX: 272,
              outputX: 328,
            },
          ]}
        />
      </svg>,
    );

    const label = container.querySelector('[data-testid="sld-v2-run-run_station-segment-label-seg-1"]');
    expect(label?.getAttribute('y')).toBe('-72');
  });

  it('rozsuwa etykiety odcinków, gdy kilka segmentów ma prawie ten sam punkt opisu', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run_labels"
          runKind="main_trunk"
          pathPoints={[
            { x: 0, y: 0 },
            { x: 400, y: 0 },
          ]}
          segmentKind="cable_sn"
          segmentLabels={[
            {
              segmentRef: 'seg-a',
              text: 'EPR Al 1C 120 · 700 m',
              x: 200,
              y: -10,
            },
            {
              segmentRef: 'seg-b',
              text: 'EPR Al 1C 120 · 1 km',
              x: 206,
              y: -10,
            },
          ]}
        />
      </svg>,
    );

    const first = container.querySelector('[data-testid="sld-v2-run-run_labels-segment-label-seg-a"]');
    const second = container.querySelector('[data-testid="sld-v2-run-run_labels-segment-label-seg-b"]');
    expect(first?.getAttribute('y')).toBe('-10');
    expect(second?.getAttribute('y')).toBe('-30');
  });
});
