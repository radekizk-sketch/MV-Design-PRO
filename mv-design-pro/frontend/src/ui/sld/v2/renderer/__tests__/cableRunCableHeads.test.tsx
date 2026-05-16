/**
 * K30-106: CableRunRenderer — cable head termination (głowica kablowa)
 * triangle ▲ na endpointach per IEC 60617-4.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CableRunRenderer } from '../CableRunRenderer';

afterEach(() => cleanup());

const PATH = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
];

describe('CableRunRenderer — K30-106 cable head termination IEC 60617-4', () => {
  it('cable_sn + LOD≥2 → renderuje 2 triangles (start + end)', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-cs"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          lod={3}
        />
      </svg>,
    );
    const heads = container.querySelector('[data-testid="sld-v2-run-run-cs-cable-heads"]');
    expect(heads).toBeTruthy();
    expect(heads?.querySelectorAll('polygon').length).toBe(2);
  });

  it('overhead_line_sn → BRAK cable heads (głowica tylko dla kabli)', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-oh"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="overhead_line_sn"
          lod={3}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-run-run-oh-cable-heads"]')).toBeFalsy();
  });

  it('LOD<2 → BRAK cable heads (declutter at zoom-out)', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-lod"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          lod={1}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-run-run-lod-cable-heads"]')).toBeFalsy();
  });

  it('missingEndpointPort=true → BRAK cable heads (incomplete connection)', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-mp"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          lod={3}
          missingEndpointPort
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-run-run-mp-cable-heads"]')).toBeFalsy();
  });
});
