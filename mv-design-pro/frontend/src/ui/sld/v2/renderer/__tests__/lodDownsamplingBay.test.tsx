/**
 * K30-119: BayColumnSn LOD-aware apparatus downsampling.
 * ES (earthing switch) ZAWSZE visible — safety-critical per PN-EN 62271-102.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BayColumnSn } from '../BayColumnSn';

afterEach(() => cleanup());

describe('K30-119 — BayColumnSn LOD downsampling', () => {
  const baseProps = {
    x: 100,
    busY: 50,
    bayRole: 'RMU_LINE' as const,
    bayRef: 'bay-1',
    designation: 'Q1',
    stationId: 'st-1',
    hasMissing: false,
  };

  it('detail variant: pełen stack [SD, CT, ES, CABLE_HEAD]', () => {
    const { container } = render(
      <svg>
        <BayColumnSn
          {...baseProps}
          apparatusStack={['SD', 'CT', 'ES', 'CABLE_HEAD']}
          variant="detail"
        />
      </svg>,
    );
    // Detail powinno mieć wszystkie symbole (CT/ES rendered jako specjalne)
    const col = container.querySelector('[data-testid="sld-v2-bay-column-sn-bay-1"]');
    expect(col?.querySelector('[data-testid="sld-v2-gpz-bay-ct-primary"]')).toBeTruthy();
    expect(col?.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).toBeTruthy();
  });

  it('compact variant: 2 primary + ES (safety-critical zawsze visible)', () => {
    const { container } = render(
      <svg>
        <BayColumnSn
          {...baseProps}
          apparatusStack={['SD', 'CT', 'ES', 'CABLE_HEAD']}
          variant="compact"
        />
      </svg>,
    );
    const col = container.querySelector('[data-testid="sld-v2-bay-column-sn-bay-1"]');
    // ES MUST be present (safety-critical override)
    expect(col?.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).toBeTruthy();
    // CT included in first 2 → present
    expect(col?.querySelector('[data-testid="sld-v2-gpz-bay-ct-primary"]')).toBeTruthy();
  });

  it('overview variant: 1 primary + ES (safety override)', () => {
    const { container } = render(
      <svg>
        <BayColumnSn
          {...baseProps}
          apparatusStack={['SD', 'CT', 'ES', 'CABLE_HEAD']}
          variant="overview"
        />
      </svg>,
    );
    const col = container.querySelector('[data-testid="sld-v2-bay-column-sn-bay-1"]');
    // ES MUST be present (safety-critical override)
    expect(col?.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).toBeTruthy();
  });

  it('overview bez ES w stack → 1 primary only', () => {
    const { container } = render(
      <svg>
        <BayColumnSn
          {...baseProps}
          apparatusStack={['SD', 'CT', 'CABLE_HEAD']}
          variant="overview"
        />
      </svg>,
    );
    const col = container.querySelector('[data-testid="sld-v2-bay-column-sn-bay-1"]');
    // Brak ES w stack → brak ES rendered
    expect(col?.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).toBeFalsy();
  });
});
