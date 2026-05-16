/**
 * K30-125..127: trzeci audyt fixes — label truncation, FUSE/SA cases,
 * cellular bus visual differentiation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BayColumnSn } from '../BayColumnSn';
import { MiniBlockRmuRenderer } from '../MiniBlockRmuRenderer';
import { FIELD_ROLE } from '../../domain/apparatusContracts';

afterEach(() => cleanup());

const wrap = (children: React.ReactNode) => <svg>{children}</svg>;

describe('K30-125 — Designation label truncation per LOD', () => {
  it('overview maxChars=6: "Q12-LONG" → "Q12-L…"', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q12-LONG"
          apparatusStack={['DS']}
          variant="overview"
          stationId="stn1"
        />,
      ),
    );
    const label = container.querySelector('[data-testid="sld-v2-bay-B01-designation"]');
    expect(label?.textContent).toBe('Q12-L…');
    expect(label?.getAttribute('data-designation-truncated')).toBe('true');
  });

  it('detail maxChars=12: short designation NOT truncated', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.LINE_IN}
          bayRef="B01"
          designation="Q1"
          apparatusStack={['DS']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    const label = container.querySelector('[data-testid="sld-v2-bay-B01-designation"]');
    expect(label?.textContent).toBe('Q1');
    expect(label?.getAttribute('data-designation-truncated')).toBe('false');
  });
});

describe('K30-126 — FUSE + SA cases w BayColumnSn switch', () => {
  it('FUSE w apparatusStack → renderowany ApparatusFuse', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.MEASUREMENT}
          bayRef="B01"
          designation="F1"
          apparatusStack={['DS', 'FUSE', 'VT']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-fuse"]')).toBeTruthy();
  });

  it('SA w apparatusStack → renderowany ApparatusSurgeArrester', () => {
    const { container } = render(
      wrap(
        <BayColumnSn
          x={0}
          busY={-10}
          bayRole={FIELD_ROLE.GPZ_LINE_BAY}
          bayRef="B01"
          designation="Q1"
          apparatusStack={['DS', 'CB', 'SA']}
          variant="detail"
          stationId="stn1"
        />,
      ),
    );
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-surge-arrester"]')).toBeTruthy();
  });
});

describe('K30-127 — Bus topology VISUAL differentiation', () => {
  const baseProps = {
    id: 'st-1',
    x: 0,
    y: 0,
    variant: 'compact' as const,
    name: 'Test',
    snBays: [
      { bayRef: 'b1', name: 'F1', kind: 'feeder' as const },
      { bayRef: 'b2', name: 'F2', kind: 'feeder' as const },
    ],
    hasTransformer: true,
    transformerRatedKva: 400,
    nnFeedersCount: 2,
    derBadges: [],
    missingData: false,
  };

  it('mv_lv_sectional → renderuje 2 linie szyny (cellular pattern)', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer {...baseProps} footprintType="mv_lv_sectional" />
      </svg>,
    );
    // Primary bus line existing + secondary dashed line dla cellular
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-bus-cellular-secondary-st-1"]')).toBeTruthy();
  });

  it('mv_lv_inline (single) → BRAK secondary line', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer {...baseProps} footprintType="mv_lv_inline" />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-bus-cellular-secondary-st-1"]')).toBeFalsy();
  });
});
