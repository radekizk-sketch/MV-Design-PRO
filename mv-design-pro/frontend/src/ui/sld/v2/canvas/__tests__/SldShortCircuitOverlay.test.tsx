/**
 * K30-48: SldShortCircuitOverlay — projekcja wyników zwarciowych IEC 60909.
 *
 * Inwarianty:
 * 1. projection=null → null (back-compat).
 * 2. visible=false → null.
 * 3. Bus result: chip z Ik" + severity color (zielona <5 kA, amber 5-15,
 *    orange 15-30, red >30).
 * 4. Fault location → X marker w czerwonej obwódce.
 * 5. Source contribution → dashed line + arrowhead + chip Ik contrib.
 * 6. Fault type badge — wszystkie 4 typy (3F/2F/1F/1F_GROUND).
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import {
  SldShortCircuitOverlay,
  type SldShortCircuitProjection,
} from '../SldShortCircuitOverlay';

const baseProjection: SldShortCircuitProjection = {
  faultType: '3F',
  busResults: [
    {
      busId: 'b1',
      x: 100,
      y: 200,
      label: 'S08 SN',
      ikkA: 8.5,
      ipkA: 21.4,
      ithkA: 8.7,
      isFaultLocation: true,
    },
  ],
};

describe('SldShortCircuitOverlay — SC results projection', () => {
  it('projection=null → null (back-compat)', () => {
    const { container } = render(<svg><SldShortCircuitOverlay projection={null} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-overlay"]')).toBeFalsy();
  });

  it('visible=false → null', () => {
    const { container } = render(<svg><SldShortCircuitOverlay projection={baseProjection} visible={false} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-overlay"]')).toBeFalsy();
  });

  it('renderuje fault type badge "3-fazowe" dla 3F', () => {
    const { container, getByText } = render(<svg><SldShortCircuitOverlay projection={baseProjection} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-overlay-fault-badge"]')).toBeTruthy();
    expect(getByText(/3-fazowe/u)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="sld-v2-sc-overlay"]')?.getAttribute('data-fault-type')).toBe('3F');
  });

  it('fault type 1F_GROUND → label "1-faz. doziemne"', () => {
    const proj: SldShortCircuitProjection = { ...baseProjection, faultType: '1F_GROUND' };
    const { getByText } = render(<svg><SldShortCircuitOverlay projection={proj} /></svg>);
    expect(getByText(/1-faz\. doziemne/u)).toBeInTheDocument();
  });

  it('bus result Ik=8.5 kA → severity "elevated" (amber #FFD166)', () => {
    const { container } = render(<svg><SldShortCircuitOverlay projection={baseProjection} /></svg>);
    const bus = container.querySelector('[data-testid="sld-v2-sc-bus-b1"]');
    expect(bus?.getAttribute('data-severity')).toBe('elevated');
    expect(bus?.getAttribute('data-ik-ka')).toBe('8.500');
  });

  it('bus result Ik=3 kA → severity "normal" (green)', () => {
    const proj: SldShortCircuitProjection = {
      ...baseProjection,
      busResults: [{ busId: 'b-lo', x: 0, y: 0, ikkA: 3 }],
    };
    const { container } = render(<svg><SldShortCircuitOverlay projection={proj} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-bus-b-lo"]')?.getAttribute('data-severity')).toBe('normal');
  });

  it('bus result Ik=40 kA → severity "extreme" (red)', () => {
    const proj: SldShortCircuitProjection = {
      ...baseProjection,
      busResults: [{ busId: 'b-hi', x: 0, y: 0, ikkA: 40 }],
    };
    const { container } = render(<svg><SldShortCircuitOverlay projection={proj} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-bus-b-hi"]')?.getAttribute('data-severity')).toBe('extreme');
  });

  it('isFaultLocation=true → X marker renderowany', () => {
    const { container } = render(<svg><SldShortCircuitOverlay projection={baseProjection} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-bus-b1-fault-marker"]')).toBeTruthy();
  });

  it('isFaultLocation=false/missing → brak X markera (tylko chip)', () => {
    const proj: SldShortCircuitProjection = {
      ...baseProjection,
      busResults: [{ busId: 'b-calc', x: 0, y: 0, ikkA: 5 }],
    };
    const { container } = render(<svg><SldShortCircuitOverlay projection={proj} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-bus-b-calc-fault-marker"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="sld-v2-sc-bus-b-calc"]')).toBeTruthy();
  });

  it('source contribution → dashed line + arrowhead + Ik chip', () => {
    const proj: SldShortCircuitProjection = {
      ...baseProjection,
      sourceContributions: [
        {
          sourceId: 'gpz-a',
          sourceLabel: 'GPZ-A',
          sourceX: 0,
          sourceY: 200,
          faultBusId: 'b1',
          ikContribKA: 6.2,
          sourceKind: 'GPZ',
        },
      ],
    };
    const { container, getByText } = render(<svg><SldShortCircuitOverlay projection={proj} /></svg>);
    const src = container.querySelector('[data-testid="sld-v2-sc-source-contrib-gpz-a-b1"]');
    expect(src).toBeTruthy();
    expect(src?.getAttribute('data-source-kind')).toBe('GPZ');
    expect(src?.getAttribute('data-ik-contrib-ka')).toBe('6.200');
    expect(getByText(/6\.20 kA/u)).toBeInTheDocument();
  });

  it('source kind GPZ→#E74C3C, PV→#FFD166', () => {
    const proj: SldShortCircuitProjection = {
      ...baseProjection,
      sourceContributions: [
        { sourceId: 'g1', sourceLabel: 'G', sourceX: 0, sourceY: 0, faultBusId: 'b1', ikContribKA: 5, sourceKind: 'GPZ' },
        { sourceId: 'pv1', sourceLabel: 'PV', sourceX: 50, sourceY: 50, faultBusId: 'b1', ikContribKA: 0.3, sourceKind: 'PV' },
      ],
    };
    const { container } = render(<svg><SldShortCircuitOverlay projection={proj} /></svg>);
    const g1 = container.querySelector('[data-testid="sld-v2-sc-source-contrib-g1-b1"] line');
    const pv1 = container.querySelector('[data-testid="sld-v2-sc-source-contrib-pv1-b1"] line');
    expect(g1?.getAttribute('stroke')).toBe('#E74C3C');
    expect(pv1?.getAttribute('stroke')).toBe('#FFD166');
  });

  it('source contribution z nieznanym faultBusId → contribution skipowany', () => {
    const proj: SldShortCircuitProjection = {
      ...baseProjection,
      sourceContributions: [
        { sourceId: 'g1', sourceLabel: 'G', sourceX: 0, sourceY: 0, faultBusId: 'unknown', ikContribKA: 5, sourceKind: 'GPZ' },
      ],
    };
    const { container } = render(<svg><SldShortCircuitOverlay projection={proj} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-source-contrib-g1-unknown"]')).toBeFalsy();
  });

  it('multi-bus + multi-source projekcja renderuje wszystkie', () => {
    const proj: SldShortCircuitProjection = {
      faultType: '2F',
      busResults: [
        { busId: 'b1', x: 0, y: 0, ikkA: 12, isFaultLocation: true },
        { busId: 'b2', x: 100, y: 100, ikkA: 6 },
        { busId: 'b3', x: 200, y: 200, ikkA: 2 },
      ],
      sourceContributions: [
        { sourceId: 'g1', sourceLabel: 'G1', sourceX: -100, sourceY: 0, faultBusId: 'b1', ikContribKA: 7, sourceKind: 'GPZ' },
        { sourceId: 'pv1', sourceLabel: 'PV', sourceX: 0, sourceY: -100, faultBusId: 'b1', ikContribKA: 0.5, sourceKind: 'PV' },
      ],
    };
    const { container } = render(<svg><SldShortCircuitOverlay projection={proj} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-sc-overlay"]')?.getAttribute('data-bus-count')).toBe('3');
    // 3 bus markers; also count direct id-only matches (exclude sub-elements with '-fault-marker' suffix)
    const allBusIds = Array.from(container.querySelectorAll('[data-testid^="sld-v2-sc-bus-"]'))
      .map((el) => el.getAttribute('data-testid'))
      .filter((tid): tid is string => tid !== null && !tid.endsWith('-fault-marker'));
    expect(allBusIds.length).toBe(3);
    expect(container.querySelectorAll('[data-testid^="sld-v2-sc-source-contrib-"]').length).toBe(2);
  });
});
