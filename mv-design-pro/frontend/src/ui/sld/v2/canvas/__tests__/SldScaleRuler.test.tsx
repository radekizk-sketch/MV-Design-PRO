/**
 * K30-43: SldScaleRuler — skala rysunku per PN-EN ISO 5455.
 *
 * Inwarianty:
 * 1. visible=false → null.
 * 2. Default 1 km z major ticks co 500 m → 3 major ticks (0, 500m, 1km).
 * 3. Minor ticks co 100 m.
 * 4. data-pixels-per-km + data-length-km na root group.
 * 5. Title "SKALA · PN-EN ISO 5455" widoczny.
 * 6. Etykiety: "0", "500 m", "1 km" zgodnie z konwencją.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { SldScaleRuler } from '../SldScaleRuler';

describe('SldScaleRuler — drawing scale per PN-EN ISO 5455', () => {
  it('visible=true (default) → root group renderowany', () => {
    const { container } = render(<svg><SldScaleRuler /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler"]')).toBeTruthy();
  });

  it('visible=false → null', () => {
    const { container } = render(<svg><SldScaleRuler visible={false} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler"]')).toBeFalsy();
  });

  it('domyślnie 1 km z 3 major ticks (0, 500m, 1km)', () => {
    const { container } = render(<svg><SldScaleRuler /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-0m"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-500m"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-1000m"]')).toBeTruthy();
  });

  it('major tick label format: 0 / "500 m" / "1 km"', () => {
    const { getByText } = render(<svg><SldScaleRuler /></svg>);
    expect(getByText('0')).toBeInTheDocument();
    expect(getByText('500 m')).toBeInTheDocument();
    expect(getByText('1 km')).toBeInTheDocument();
  });

  it('data-pixels-per-km + data-length-km na root group', () => {
    const { container } = render(<svg><SldScaleRuler pixelsPerKm={1000} lengthKm={2} /></svg>);
    const root = container.querySelector('[data-testid="sld-v2-scale-ruler"]');
    expect(root?.getAttribute('data-pixels-per-km')).toBe('1000');
    expect(root?.getAttribute('data-length-km')).toBe('2');
  });

  it('PN-EN ISO 5455 reference w tytule', () => {
    const { getByText } = render(<svg><SldScaleRuler /></svg>);
    expect(getByText(/SKALA · PN-EN ISO 5455/u)).toBeInTheDocument();
  });

  it('x/y prop steruje pozycją transform', () => {
    const { container } = render(<svg><SldScaleRuler x={50} y={400} /></svg>);
    const root = container.querySelector('[data-testid="sld-v2-scale-ruler"]');
    expect(root?.getAttribute('transform')).toBe('translate(50, 400)');
  });

  it('lengthKm=0.5 → ticks 0 + 500m (brak 1km)', () => {
    const { container } = render(<svg><SldScaleRuler lengthKm={0.5} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-0m"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-500m"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-1000m"]')).toBeFalsy();
  });

  it('lengthKm=0 lub pixelsPerKm=0 → null (graceful)', () => {
    const { container: c1 } = render(<svg><SldScaleRuler lengthKm={0} /></svg>);
    expect(c1.querySelector('[data-testid="sld-v2-scale-ruler"]')).toBeFalsy();
    const { container: c2 } = render(<svg><SldScaleRuler pixelsPerKm={0} /></svg>);
    expect(c2.querySelector('[data-testid="sld-v2-scale-ruler"]')).toBeFalsy();
  });

  it('custom majorTickKm=0.25 → 5 major ticks (0, 250m, 500m, 750m, 1km)', () => {
    const { container } = render(<svg><SldScaleRuler majorTickKm={0.25} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-0m"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-250m"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-500m"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-750m"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler-tick-1000m"]')).toBeTruthy();
  });
});
