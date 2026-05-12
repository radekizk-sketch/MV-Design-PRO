import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import type { SupplyPathHighlight } from '../SupplyPathHighlighter';
import { SupplyPathLegend } from '../SupplyPathLegend';

const EMPTY_HIGHLIGHT: SupplyPathHighlight = {
  energizedBusRefs: [],
  energizedBranchRefs: [],
  energizedTransformerRefs: [],
  openPointBranchRefs: [],
  energizedSubstationRefs: [],
  energizedGeneratorRefs: [],
  sourceRefs: [],
};

describe('SupplyPathLegend', () => {
  it('brak źródła → komunikat o braku toru zasilania', () => {
    const { container } = render(<SupplyPathLegend highlight={EMPTY_HIGHLIGHT} />);
    expect(
      container.querySelector('[data-testid="supply-path-legend-no-source"]'),
    ).not.toBeNull();
  });

  it('z 1 źródłem + 3 szynami energized → liczniki widoczne', () => {
    const highlight: SupplyPathHighlight = {
      ...EMPTY_HIGHLIGHT,
      sourceRefs: ['src1'],
      energizedBusRefs: ['b1', 'b2', 'b3'],
      energizedBranchRefs: ['c1', 'c2'],
    };
    const { container } = render(
      <SupplyPathLegend highlight={highlight} totalBusCount={3} totalBranchCount={2} />,
    );
    const legend = container.querySelector('[data-testid="supply-path-legend"]');
    expect(legend).not.toBeNull();
    expect(legend?.getAttribute('data-source-count')).toBe('1');
    expect(legend?.getAttribute('data-energized-bus-count')).toBe('3');
    expect(legend?.getAttribute('data-energized-branch-count')).toBe('2');

    const buses = container.querySelector('[data-testid="supply-path-legend-energized-buses"]');
    expect(buses?.textContent).toContain('3 / 3');
    expect(buses?.textContent).toContain('100%');

    const branches = container.querySelector(
      '[data-testid="supply-path-legend-energized-branches"]',
    );
    expect(branches?.textContent).toContain('2 / 2');
    expect(branches?.textContent).toContain('100%');
  });

  it('NMO punkty otwarte → wyróżniona pozycja czerwona', () => {
    const highlight: SupplyPathHighlight = {
      ...EMPTY_HIGHLIGHT,
      sourceRefs: ['src1'],
      energizedBusRefs: ['b1'],
      openPointBranchRefs: ['nmo1', 'nmo2'],
    };
    const { container } = render(<SupplyPathLegend highlight={highlight} />);
    const openPoints = container.querySelector(
      '[data-testid="supply-path-legend-open-points"]',
    );
    expect(openPoints?.textContent).toContain('2');
    // Klasa text-red-700 obecna gdy openPointCount > 0.
    expect(openPoints?.className).toContain('text-red-700');
  });

  it('DER energized → pokazuje wiersz "DER pod napięciem"', () => {
    const highlight: SupplyPathHighlight = {
      ...EMPTY_HIGHLIGHT,
      sourceRefs: ['src1'],
      energizedBusRefs: ['b1'],
      energizedGeneratorRefs: ['pv1', 'bess1'],
    };
    const { container } = render(<SupplyPathLegend highlight={highlight} />);
    const ders = container.querySelector('[data-testid="supply-path-legend-energized-ders"]');
    expect(ders).not.toBeNull();
    expect(ders?.textContent).toContain('2');
  });

  it('brak DER energized → brak wiersza DER', () => {
    const highlight: SupplyPathHighlight = {
      ...EMPTY_HIGHLIGHT,
      sourceRefs: ['src1'],
      energizedBusRefs: ['b1'],
    };
    const { container } = render(<SupplyPathLegend highlight={highlight} />);
    expect(
      container.querySelector('[data-testid="supply-path-legend-energized-ders"]'),
    ).toBeNull();
  });

  it('pokazuje informację „bez fizyki — interpretacja topologii"', () => {
    const highlight: SupplyPathHighlight = {
      ...EMPTY_HIGHLIGHT,
      sourceRefs: ['src1'],
      energizedBusRefs: ['b1'],
    };
    const { container } = render(<SupplyPathLegend highlight={highlight} />);
    expect(container.textContent).toContain('Bez fizyki');
  });
});
