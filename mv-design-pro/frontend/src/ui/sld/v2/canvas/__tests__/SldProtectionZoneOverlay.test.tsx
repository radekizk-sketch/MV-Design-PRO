/**
 * K30-46: SldProtectionZoneOverlay — stref Z1/Z2/Z3 per IEC 60255-127.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import {
  SldProtectionZoneOverlay,
  type SldProtectionZoneProjection,
} from '../SldProtectionZoneOverlay';

const sampleProjection: SldProtectionZoneProjection = {
  zones: [
    {
      zoneId: 'gpz-q05-z1',
      protectionBayRef: 'GPZ-A/Q05',
      protectionBayLabel: 'Q05',
      zoneType: 'Z1',
      reachKm: 1.6,
      delayMs: 0,
      pathPoints: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
    },
    {
      zoneId: 'gpz-q05-z2',
      protectionBayRef: 'GPZ-A/Q05',
      zoneType: 'Z2',
      reachKm: 2.4,
      delayMs: 400,
      pathPoints: [{ x: 0, y: 100 }, { x: 240, y: 100 }],
    },
    {
      zoneId: 'gpz-q05-z3',
      protectionBayRef: 'GPZ-A/Q05',
      zoneType: 'Z3',
      reachKm: 5.0,
      delayMs: 1200,
      pathPoints: [{ x: 0, y: 100 }, { x: 500, y: 100 }],
    },
  ],
};

describe('SldProtectionZoneOverlay — K30-46 distance protection zones', () => {
  it('projection=null → null', () => {
    const { container } = render(<svg><SldProtectionZoneOverlay projection={null} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-protection-zones-overlay"]')).toBeFalsy();
  });

  it('visible=false → null', () => {
    const { container } = render(
      <svg><SldProtectionZoneOverlay projection={sampleProjection} visible={false} /></svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-protection-zones-overlay"]')).toBeFalsy();
  });

  it('renderuje wszystkie 3 zony Z1/Z2/Z3', () => {
    const { container } = render(<svg><SldProtectionZoneOverlay projection={sampleProjection} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-protection-zones-overlay"]')?.getAttribute('data-zone-count')).toBe('3');
    expect(container.querySelector('[data-testid="sld-v2-protection-zone-gpz-q05-z1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-protection-zone-gpz-q05-z2"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-protection-zone-gpz-q05-z3"]')).toBeTruthy();
  });

  it('Z1 → green stroke + no dasharray (instantaneous)', () => {
    const { container } = render(<svg><SldProtectionZoneOverlay projection={sampleProjection} /></svg>);
    const z1 = container.querySelector('[data-testid="sld-v2-protection-zone-gpz-q05-z1"] path');
    expect(z1?.getAttribute('stroke')).toBe('#13C45A');
    expect(z1?.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('Z2 → amber stroke + dashed "6 3"', () => {
    const { container } = render(<svg><SldProtectionZoneOverlay projection={sampleProjection} /></svg>);
    const z2 = container.querySelector('[data-testid="sld-v2-protection-zone-gpz-q05-z2"] path');
    expect(z2?.getAttribute('stroke')).toBe('#FFD166');
    expect(z2?.getAttribute('stroke-dasharray')).toBe('6 3');
  });

  it('Z3 → red stroke + dashed "3 3"', () => {
    const { container } = render(<svg><SldProtectionZoneOverlay projection={sampleProjection} /></svg>);
    const z3 = container.querySelector('[data-testid="sld-v2-protection-zone-gpz-q05-z3"] path');
    expect(z3?.getAttribute('stroke')).toBe('#FF6B6B');
    expect(z3?.getAttribute('stroke-dasharray')).toBe('3 3');
  });

  it('data attrs reach-km + delay-ms emitowane', () => {
    const { container } = render(<svg><SldProtectionZoneOverlay projection={sampleProjection} /></svg>);
    const z1 = container.querySelector('[data-testid="sld-v2-protection-zone-gpz-q05-z1"]');
    expect(z1?.getAttribute('data-zone-type')).toBe('Z1');
    expect(z1?.getAttribute('data-reach-km')).toBe('1.60');
    expect(z1?.getAttribute('data-delay-ms')).toBe('0');
    const z2 = container.querySelector('[data-testid="sld-v2-protection-zone-gpz-q05-z2"]');
    expect(z2?.getAttribute('data-delay-ms')).toBe('400');
  });

  it('zone label chip pokazuje "Z1 0s" / "Z2 0.4s" / "Z3 1.2s"', () => {
    const { getByText } = render(<svg><SldProtectionZoneOverlay projection={sampleProjection} /></svg>);
    expect(getByText('Z1 0s')).toBeInTheDocument();
    expect(getByText('Z2 0.4s')).toBeInTheDocument();
    expect(getByText('Z3 1.2s')).toBeInTheDocument();
  });

  it('puste zones[] → null (graceful)', () => {
    const { container } = render(<svg><SldProtectionZoneOverlay projection={{ zones: [] }} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-protection-zones-overlay"]')).toBeFalsy();
  });

  it('BACKUP zone → grey "B" label', () => {
    const proj: SldProtectionZoneProjection = {
      zones: [{
        zoneId: 'bk',
        protectionBayRef: 'X',
        zoneType: 'BACKUP',
        reachKm: 10,
        delayMs: 2000,
        pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      }],
    };
    const { container, getByText } = render(<svg><SldProtectionZoneOverlay projection={proj} /></svg>);
    const path = container.querySelector('[data-testid="sld-v2-protection-zone-bk"] path');
    expect(path?.getAttribute('stroke')).toBe('#7E8790');
    expect(getByText('B 2.0s')).toBeInTheDocument();
  });
});
