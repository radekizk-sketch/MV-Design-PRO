/**
 * K30-105: CableRunRenderer — power flow direction arrows (▷) per IEC 60617.
 *
 * Operator OSD musi widzieć kierunek przepływu mocy w pętli kabel SN.
 * Strzałki na midpoincie segmentów przy energized=true; LOD 0/1 nadal pokazuje kierunek topologii.
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

describe('CableRunRenderer — K30-105 direction arrows IEC 60617', () => {
  it('energized=true + lod≥2 → renderuje direction arrows', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-dir"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          energized
          lod={3}
        />
      </svg>,
    );
    const arrows = container.querySelector('[data-testid="sld-v2-run-run-dir-direction-arrows"]');
    expect(arrows).toBeTruthy();
    // 2 segments z 3 points (each ≥20 px length)
    expect(arrows?.querySelectorAll('polygon').length).toBe(2);
  });

  it('energized=false → BRAK direction arrows', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-de"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          lod={3}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-run-run-de-direction-arrows"]')).toBeFalsy();
  });

  it('lod<2 pokazuje direction arrows jako warstwę kierunku topologii', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-lod"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          energized
          lod={1}
        />
      </svg>,
    );
    const arrows = container.querySelector('[data-testid="sld-v2-run-run-lod-direction-arrows"]');
    expect(arrows).toBeTruthy();
    expect(arrows?.querySelectorAll('polygon').length).toBe(2);
  });

  it('missingEndpointPort=true → BRAK direction arrows (incomplete connection)', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-mp"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          energized
          lod={3}
          missingEndpointPort
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-run-run-mp-direction-arrows"]')).toBeFalsy();
  });

  it('krótkie segmenty <20 px są pomijane (anti-clutter)', () => {
    const SHORT_PATH = [
      { x: 0, y: 0 },
      { x: 10, y: 0 }, // short
      { x: 100, y: 0 }, // ok
    ];
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-short"
          runKind="main_trunk"
          pathPoints={SHORT_PATH}
          segmentKind="cable_sn"
          energized
          lod={3}
        />
      </svg>,
    );
    const arrows = container.querySelector('[data-testid="sld-v2-run-run-short-direction-arrows"]');
    expect(arrows).toBeTruthy();
    expect(arrows?.querySelectorAll('polygon').length).toBe(1); // tylko długi segment
  });
});
