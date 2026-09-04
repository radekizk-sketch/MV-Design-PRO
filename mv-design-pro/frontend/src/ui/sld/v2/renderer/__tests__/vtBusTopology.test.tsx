/**
 * K30-117: VT phase flexibility (1 vs 3 phase) per IEC 60617 S00310.
 * K30-118: bus topology marker (single vs cellular) per PN-EN 62271-202.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ApparatusVtThreePhase } from '../GpzApparatusSymbols';
import { MiniBlockRmuRenderer } from '../MiniBlockRmuRenderer';

afterEach(() => cleanup());

describe('K30-117 — ApparatusVtThreePhase phase flexibility', () => {
  it('default phaseCount=3 → 3 okręgi w trójkącie + L1/L2/L3 labels', () => {
    const { container, getByText } = render(
      <svg>
        <ApparatusVtThreePhase cx={50} cy={50} />
      </svg>,
    );
    const vt = container.querySelector('[data-testid="sld-v2-gpz-bay-vt-three-phase"]');
    expect(vt?.getAttribute('data-phase-count')).toBe('3');
    expect(vt?.querySelectorAll('circle').length).toBe(3);
    expect(getByText('L1')).toBeInTheDocument();
    expect(getByText('L2')).toBeInTheDocument();
    expect(getByText('L3')).toBeInTheDocument();
  });

  it('phaseCount=1 → 1 okrąg + L1 label + earthing triangle', () => {
    const { container, getByText, queryByText } = render(
      <svg>
        <ApparatusVtThreePhase cx={50} cy={50} phaseCount={1} />
      </svg>,
    );
    const vt = container.querySelector('[data-testid="sld-v2-gpz-bay-vt-single-phase"]');
    expect(vt?.getAttribute('data-phase-count')).toBe('1');
    expect(vt?.querySelectorAll('circle').length).toBe(1);
    expect(getByText('L1')).toBeInTheDocument();
    expect(queryByText('L2')).not.toBeInTheDocument();
    expect(queryByText('L3')).not.toBeInTheDocument();
    // Earthing triangle (3 horizontal lines decreasing width)
    const lines = vt?.querySelectorAll('line');
    expect(lines?.length).toBeGreaterThanOrEqual(4); // connector + 3 ground bars
  });

  it('phaseCount=3 backward compat — testid 3-phase nie 1-phase', () => {
    const { container } = render(<svg><ApparatusVtThreePhase cx={50} cy={50} phaseCount={3} /></svg>);
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-vt-three-phase"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-vt-single-phase"]')).toBeFalsy();
  });
});

describe('K30-118 — MiniBlockRmuRenderer bus topology marker', () => {
  const baseProps = {
    id: 'st-1',
    x: 0,
    y: 0,
    variant: 'compact' as const,
    name: 'Test',
    snBays: [
      { bayRef: 'bay-1', fieldRole: 'RMU_LINE' as const, designation: 'F1', hasMissingRequiredDevice: false },
      { bayRef: 'bay-2', fieldRole: 'RMU_LINE' as const, designation: 'F2', hasMissingRequiredDevice: false },
    ],
    hasTransformer: true,
    transformerRatedKva: 400,
    nnFeedersCount: 2,
    derBadges: [],
    missingData: false,
  };

  it('footprint mv_lv_sectional → data-busbar-topology="cellular"', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer {...baseProps} footprintType="mv_lv_sectional" />
      </svg>,
    );
    const busLine = container.querySelector('[data-parity-key="station.mini.bus.sn"]');
    expect(busLine?.getAttribute('data-busbar-topology')).toBe('cellular');
  });

  it('footprint mv_lv_inline → data-busbar-topology="single"', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer {...baseProps} footprintType="mv_lv_inline" />
      </svg>,
    );
    const busLine = container.querySelector('[data-parity-key="station.mini.bus.sn"]');
    expect(busLine?.getAttribute('data-busbar-topology')).toBe('single');
  });

  it('footprint terminal → data-busbar-topology="single"', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer {...baseProps} footprintType="mv_lv_terminal" />
      </svg>,
    );
    const busLine = container.querySelector('[data-parity-key="station.mini.bus.sn"]');
    expect(busLine?.getAttribute('data-busbar-topology')).toBe('single');
  });
});
