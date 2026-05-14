/**
 * SldOverlayDemo tests — P0.7 + GAP-4 integration showcase.
 *
 * Verifies that the demo component correctly composes all 3 overlay primitives
 * (FaultContributionArrow, PowerFlowArrow, ProtectionZoneMarker) into a single
 * SVG. Addresses test architect audit GAP-4 — overlay primitives now have
 * a real consumer.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEMO_DATA,
  SldOverlayDemo,
  type SldOverlayDemoData,
} from '../SldOverlayDemo';

describe('SldOverlayDemo — composes 3 overlay primitives', () => {
  it('renders SVG canvas with default viewBox', () => {
    const { container } = render(<SldOverlayDemo data={DEFAULT_DEMO_DATA} />);
    const svg = container.querySelector('[data-testid="sld-overlay-demo"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders 2 FaultContributionArrow instances from DEFAULT_DEMO_DATA', () => {
    const { container } = render(<SldOverlayDemo data={DEFAULT_DEMO_DATA} />);
    expect(container.querySelector('[data-testid="sld-overlay-demo-fc-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-overlay-demo-fc-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-overlay-demo-fc-2"]')).toBeNull();
  });

  it('renders 1 PowerFlowArrow instance', () => {
    const { container } = render(<SldOverlayDemo data={DEFAULT_DEMO_DATA} />);
    expect(container.querySelector('[data-testid="sld-overlay-demo-pf-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-overlay-demo-pf-1"]')).toBeNull();
  });

  it('renders 1 ProtectionZoneMarker instance', () => {
    const { container } = render(<SldOverlayDemo data={DEFAULT_DEMO_DATA} />);
    expect(container.querySelector('[data-testid="sld-overlay-demo-pz-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-overlay-demo-pz-1"]')).toBeNull();
  });

  it('all primitives expose Polish aria-label', () => {
    const { container } = render(<SldOverlayDemo data={DEFAULT_DEMO_DATA} />);
    const svg = container.querySelector('[data-testid="sld-overlay-demo"]');
    expect(svg?.getAttribute('aria-label')).toContain('Demonstracja');
    expect(svg?.getAttribute('aria-label')).toContain('SC');
    expect(svg?.getAttribute('aria-label')).toContain('Protection');
  });

  it('respects custom width/height', () => {
    const { container } = render(
      <SldOverlayDemo data={DEFAULT_DEMO_DATA} width={1200} height={600} />,
    );
    const svg = container.querySelector('[data-testid="sld-overlay-demo"]');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 1200 600');
    expect(svg?.getAttribute('width')).toBe('1200');
    expect(svg?.getAttribute('height')).toBe('600');
  });

  it('handles empty dataset (zero primitives)', () => {
    const empty: SldOverlayDemoData = {
      faultContributions: [],
      powerFlows: [],
      protectionZones: [],
    };
    const { container } = render(<SldOverlayDemo data={empty} />);
    const svg = container.querySelector('[data-testid="sld-overlay-demo"]');
    expect(svg).not.toBeNull();
    // No root primitives rendered (no data-testid="sld-overlay-demo-{fc,pf,pz}-0")
    expect(container.querySelector('[data-testid="sld-overlay-demo-fc-0"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-overlay-demo-pf-0"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-overlay-demo-pz-0"]')).toBeNull();
  });

  it('handles many primitives (N=5 each)', () => {
    const big: SldOverlayDemoData = {
      faultContributions: Array.from({ length: 5 }, (_, i) => ({
        fromXy: [10, 10 + i * 20] as const,
        toXy: [200, 10 + i * 20] as const,
        magnitudeKa: 1 + i,
        sourceLabel: `S${i}`,
      })),
      powerFlows: Array.from({ length: 5 }, (_, i) => ({
        fromXy: [10, 200 + i * 20] as const,
        toXy: [200, 200 + i * 20] as const,
        activeMw: i,
        reactiveMvar: 0,
        loadingPct: 20 * i,
      })),
      protectionZones: Array.from({ length: 5 }, (_, i) => ({
        boxXywh: [300, 10 + i * 30, 100, 20] as const,
        relayLabel: `Q${i}`,
        t51Seconds: 0.1 + i * 0.1,
      })),
    };
    const { container } = render(<SldOverlayDemo data={big} />);
    // Count only ROOT group elements (data-testid="sld-overlay-demo-fc-N"),
    // not sub-primitives (data-testid="sld-overlay-demo-fc-N-line").
    // Use exact match via 5 specific testIds.
    for (let i = 0; i < 5; i++) {
      expect(container.querySelector(`[data-testid="sld-overlay-demo-fc-${i}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-testid="sld-overlay-demo-pf-${i}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-testid="sld-overlay-demo-pz-${i}"]`)).not.toBeNull();
    }
    // Sanity: no N=5 root testIds
    expect(container.querySelector('[data-testid="sld-overlay-demo-fc-5"]')).toBeNull();
  });

  it('determinizm — same data → identyczny DOM', () => {
    const { container: a } = render(<SldOverlayDemo data={DEFAULT_DEMO_DATA} />);
    const { container: b } = render(<SldOverlayDemo data={DEFAULT_DEMO_DATA} />);
    expect(a.innerHTML).toBe(b.innerHTML);
  });

  it('custom testId propagates to all sub-primitives', () => {
    const { container } = render(
      <SldOverlayDemo data={DEFAULT_DEMO_DATA} testId="custom-demo" />,
    );
    expect(container.querySelector('[data-testid="custom-demo"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-demo-fc-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-demo-pf-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-demo-pz-0"]')).not.toBeNull();
  });
});

describe('DEFAULT_DEMO_DATA — sane defaults', () => {
  it('exposes 2 fault contributions', () => {
    expect(DEFAULT_DEMO_DATA.faultContributions).toHaveLength(2);
  });

  it('exposes 1 power flow', () => {
    expect(DEFAULT_DEMO_DATA.powerFlows).toHaveLength(1);
  });

  it('exposes 1 protection zone', () => {
    expect(DEFAULT_DEMO_DATA.protectionZones).toHaveLength(1);
  });

  it('typical industrial values (GPZ contribution ~8.5 kA)', () => {
    const gpz = DEFAULT_DEMO_DATA.faultContributions.find((f) => f.sourceLabel === 'GPZ');
    expect(gpz).not.toBeUndefined();
    expect(gpz!.magnitudeKa).toBeGreaterThan(1);
    expect(gpz!.magnitudeKa).toBeLessThan(50);
  });
});
