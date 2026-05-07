/**
 * Phase 0A — MiniBlockRmuRenderer: stacja jako mini-RMU komponowany z bays[].
 *
 * Reguła Acceptance Invariant nr 11: stacja w widoku oddalonym = mini-RMU
 * wynikający z faktycznych pól, NIE pojedynczy prostokąt.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { MiniBlockRmuRenderer, miniBlockViewBox } from '../MiniBlockRmuRenderer';
import {
  ALL_STATION_FOOTPRINT_TYPES,
  MINI_BLOCK_FOOTPRINT,
  deriveFootprintType,
  footprintAssumesDer,
  type StationFootprintType,
} from '../MiniBlockFootprints';
import { FIELD_ROLE } from '../../domain/apparatusContracts';

const baseBays = [
  { bayRef: 'b1', fieldRole: FIELD_ROLE.RMU_LINE, designation: 'L1', hasMissingRequiredDevice: false },
  { bayRef: 'b2', fieldRole: FIELD_ROLE.RMU_LINE, designation: 'L2', hasMissingRequiredDevice: false },
  { bayRef: 'b3', fieldRole: FIELD_ROLE.RMU_TRANSFORMER, designation: 'TR', hasMissingRequiredDevice: false },
];

function r(
  variant: 'compact' | 'detail' = 'compact',
  overrides: Partial<Parameters<typeof MiniBlockRmuRenderer>[0]> = {},
) {
  return render(
    <svg>
      <MiniBlockRmuRenderer
        id="st-1"
        x={0}
        y={0}
        variant={variant}
        footprintType="mv_lv_inline"
        name="Stacja Test"
        snBays={baseBays}
        hasTransformer
        transformerRatedKva={400}
        nnFeedersCount={4}
        derBadges={[]}
        missingData={false}
        {...overrides}
      />
    </svg>,
  );
}

describe('MiniBlockRmuRenderer — element kinds', () => {
  it('compact → element kind mini_block_compact', () => {
    const { container } = r('compact');
    expect(container.querySelector('[data-element-kind="mini_block_compact"]')).not.toBeNull();
  });

  it('detail → element kind mini_block_detail', () => {
    const { container } = r('detail');
    expect(container.querySelector('[data-element-kind="mini_block_detail"]')).not.toBeNull();
  });
});

describe('MiniBlockRmuRenderer — kompozycja z bays', () => {
  it('renderuje tyle bay markerów ile jest w bays[]', () => {
    const { container } = r('compact');
    const markers = container.querySelectorAll('[data-testid^="sld-v2-mini-rmu-bay-marker-"]');
    expect(markers.length).toBe(baseBays.length);
  });

  it('data-bay-count odzwierciedla liczbę bays', () => {
    const { container } = r('compact', { snBays: [baseBays[0]] });
    expect(
      container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]')?.getAttribute('data-bay-count'),
    ).toBe('1');
  });

  it('pusta tablica bays → blocker badge "Brak pól SN"', () => {
    const { container } = r('compact', { snBays: [] });
    const blocker = container.querySelector('[data-testid="sld-v2-mini-rmu-blocker-st-1"]');
    expect(blocker).not.toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('Brak pól SN');
  });
});

describe('MiniBlockRmuRenderer — viewBox invariant', () => {
  it('compact ma stały rozmiar 100×56', () => {
    const vb = miniBlockViewBox('compact');
    expect(vb).toEqual({ width: 100, height: 56 });
  });

  it('detail ma stały rozmiar 160×100', () => {
    const vb = miniBlockViewBox('detail');
    expect(vb).toEqual({ width: 160, height: 100 });
  });
});

describe('MiniBlockRmuRenderer — DER badges', () => {
  it('PV badge widoczny gdy w listach DER', () => {
    const { container } = r('detail', {
      derBadges: [{ kind: 'PV', count: 1 }],
    });
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-der-badge-PV"]')).not.toBeNull();
  });

  it('BESS i FW badges renderowane razem', () => {
    const { container } = r('detail', {
      derBadges: [
        { kind: 'PV', count: 2 },
        { kind: 'BESS', count: 1 },
        { kind: 'FW', count: 1 },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-der-badge-PV"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-der-badge-BESS"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-der-badge-FW"]')).not.toBeNull();
  });
});

describe('MiniBlockRmuRenderer — missing data', () => {
  it('missingData=true pokazuje circle marker', () => {
    const { container } = r('compact', { missingData: true });
    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]');
    expect(root!.querySelector('circle[fill="#FFC857"]')).not.toBeNull();
  });
});

describe('MiniBlockRmuRenderer — onClick + onDoubleClick', () => {
  it('kliknięcie woła onClick(id)', () => {
    let clicked: string | null = null;
    const { container } = r('compact', {
      onClick: (id) => {
        clicked = id;
      },
    });
    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]') as SVGGElement;
    root?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe('st-1');
  });
});

describe('MiniBlockFootprints — kanon', () => {
  it('7 typów footprintów (bez GPZ)', () => {
    expect(ALL_STATION_FOOTPRINT_TYPES.length).toBe(7);
    expect(ALL_STATION_FOOTPRINT_TYPES).not.toContain('gpz');
  });

  it('każdy typ ma polską etykietę i krótki kod', () => {
    for (const type of ALL_STATION_FOOTPRINT_TYPES) {
      const fp = MINI_BLOCK_FOOTPRINT[type as StationFootprintType];
      expect(fp.labelPl).toBeTruthy();
      expect(fp.shortCodePl).toBeTruthy();
    }
  });

  it('switching_station nie ma transformatora ani sekcji nN', () => {
    const fp = MINI_BLOCK_FOOTPRINT.switching_station;
    expect(fp.hasTransformer).toBe(false);
    expect(fp.hasLvSection).toBe(false);
  });

  it('mv_lv_terminal ma transformator i sekcję nN', () => {
    const fp = MINI_BLOCK_FOOTPRINT.mv_lv_terminal;
    expect(fp.hasTransformer).toBe(true);
    expect(fp.hasLvSection).toBe(true);
  });

  it('der_station footprintAssumesDer zwraca true', () => {
    expect(footprintAssumesDer('der_station')).toBe(true);
    expect(footprintAssumesDer('mv_lv_inline')).toBe(false);
  });
});

describe('MiniBlockFootprints — deriveFootprintType', () => {
  it('GPZ rzuca wyjątek (osobny renderer)', () => {
    expect(() => deriveFootprintType('gpz', [], false)).toThrow(/GPZ/);
  });

  it('switching → switching_station', () => {
    expect(deriveFootprintType('switching', [], false)).toBe('switching_station');
  });

  it('customer → mv_lv_customer', () => {
    expect(deriveFootprintType('customer', [], false)).toBe('mv_lv_customer');
  });

  it('sectional → mv_lv_sectional', () => {
    expect(deriveFootprintType('sectional', [], false)).toBe('mv_lv_sectional');
  });

  it('hasDer=true → der_station (priorytetowo)', () => {
    expect(deriveFootprintType('inline', [], true)).toBe('der_station');
  });

  it('inline → mv_lv_inline', () => {
    expect(deriveFootprintType('inline', [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE], false)).toBe('mv_lv_inline');
  });

  it('branch → mv_lv_branch', () => {
    expect(
      deriveFootprintType('branch', [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE], false),
    ).toBe('mv_lv_branch');
  });

  it('terminal → mv_lv_terminal', () => {
    expect(deriveFootprintType('terminal', [FIELD_ROLE.RMU_LINE], false)).toBe('mv_lv_terminal');
  });
});
