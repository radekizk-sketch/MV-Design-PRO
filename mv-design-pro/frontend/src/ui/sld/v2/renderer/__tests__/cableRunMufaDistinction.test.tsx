/**
 * K30-107: CableRunRenderer — distinct mufa (hollow) vs galvanic (filled)
 * junction symbols per IEC 60617-4.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CableRunRenderer } from '../CableRunRenderer';

afterEach(() => cleanup());

const PATH = [
  { x: 0, y: 0 },
  { x: 300, y: 0 },
];

describe('CableRunRenderer — K30-107 mufa vs galvanic junction IEC 60617-4', () => {
  it('pass-through station (input + output) → junction marked as mufa', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-pt"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          stationPortGaps={[
            { stationId: 'st-mid', y: 0, inputX: 100, outputX: 200 },
          ]}
        />
      </svg>,
    );
    const junction = container.querySelector('[data-testid="sld-v2-run-run-pt-junction-st-mid"]');
    expect(junction).toBeTruthy();
    expect(junction?.getAttribute('data-junction-kind')).toBe('mufa');
  });

  it('terminal station (input only) → junction marked as galwaniczne', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-term"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          stationPortGaps={[
            { stationId: 'st-end', y: 0, inputX: 250, outputX: null },
          ]}
        />
      </svg>,
    );
    const junction = container.querySelector('[data-testid="sld-v2-run-run-term-junction-st-end"]');
    expect(junction).toBeTruthy();
    expect(junction?.getAttribute('data-junction-kind')).toBe('galwaniczne');
  });

  it('mufa hollow circle ma dark fill (#0A0E14) + grubszy stroke', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run-h"
          runKind="main_trunk"
          pathPoints={PATH}
          segmentKind="cable_sn"
          stationPortGaps={[
            { stationId: 'st-h', y: 0, inputX: 100, outputX: 200 },
          ]}
        />
      </svg>,
    );
    const junction = container.querySelector('[data-testid="sld-v2-run-run-h-junction-st-h"]');
    const circle = junction?.querySelector('circle');
    expect(circle?.getAttribute('fill')).toBe('#0A0E14');
    expect(parseFloat(circle?.getAttribute('stroke-width') ?? '0')).toBeGreaterThanOrEqual(1.4);
  });
});
