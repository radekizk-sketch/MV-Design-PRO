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
  variant: 'overview' | 'compact' | 'detail' = 'compact',
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
  it('compact ma stały rozmiar czytelny dla mini-RMU', () => {
    const vb = miniBlockViewBox('compact');
    expect(vb).toEqual({ width: 190, height: 136 });
  });

  it('detail ma stały rozmiar czytelny dla rozdzielnicy stacji', () => {
    const vb = miniBlockViewBox('detail');
    expect(vb).toEqual({ width: 220, height: 164 });
  });
});

describe('MiniBlockRmuRenderer - kanon operatorski', () => {
  it('rysuje szynę SN i aparaty pól zamiast pojedynczego symbolu stacji', () => {
    const { container } = r('compact');
    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]');

    expect(root?.querySelector('[data-parity-key="station.mini.bus.sn"]')).not.toBeNull();
    expect(root?.querySelectorAll('[data-apparatus-kind="line-switch"]').length).toBe(2);
    expect(root?.querySelector('[data-parity-key="station.mini.transformer_field"]')).not.toBeNull();
  });

  it('umieszcza nazwę stacji pod szyną jak w ekranach operatorskich', () => {
    const { container } = r('compact');
    const bus = container.querySelector('[data-parity-key="station.mini.bus.sn"]');
    const name = container.querySelector('[data-parity-key="station.mini.name"]');

    expect(Number(name?.getAttribute('y'))).toBeGreaterThan(Number(bus?.getAttribute('y1')));
  });
});

describe('MiniBlockRmuRenderer - semantyczne roznice LOD', () => {
  it('overview rysuje widok systemowy bez sekcji nN i transformatora pelnego', () => {
    const { container } = r('overview');
    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]');

    expect(root?.getAttribute('data-lod-variant')).toBe('overview');
    expect(root?.getAttribute('data-element-kind')).toBe('mini_block_overview');
    expect(root?.querySelector('[data-parity-key="station.mini.bus.sn"]')).not.toBeNull();
    expect(root?.querySelector('[data-testid="sld-v2-mini-rmu-lv-row"]')).toBeNull();
    expect(root?.querySelector('[data-testid="sld-v2-mini-rmu-tr-triangle"]')).toBeNull();
    expect(root?.querySelector('[data-parity-key="station.mini.transformer.power"]')).toBeNull();
  });

  it('compact i detail maja inne poziomy informacji', () => {
    const compact = r('compact').container;
    const detail = r('detail').container;

    expect(compact.querySelector('[data-lod-variant="compact"]')).not.toBeNull();
    expect(detail.querySelector('[data-lod-variant="detail"]')).not.toBeNull();
    expect(compact.querySelector('[data-testid="sld-v2-mini-rmu-lv-row"]')).toBeNull();
    expect(detail.querySelector('[data-testid="sld-v2-mini-rmu-lv-row"]')).not.toBeNull();
    expect(compact.querySelector('[data-testid="sld-v2-mini-rmu-tr-triangle"]')).toBeNull();
    expect(detail.querySelector('[data-testid="sld-v2-mini-rmu-tr-triangle"]')).not.toBeNull();
  });
});

describe('MiniBlockRmuRenderer - kanon symboli aparatow', () => {
  it('rozlacznik jest rombem, a uziemnik jest galazka boczna', () => {
    const { container } = r('compact');
    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]');

    expect(root?.querySelectorAll('[data-parity-key="station.mini.line_switch"][data-symbol-canon="switch_disconnector_rotated_square"]').length).toBe(2);
    expect(root?.querySelectorAll('[data-symbol-canon="earthing_switch_lateral_branch"]').length).toBe(2);
    expect(root?.querySelector('[data-apparatus-kind="side-disconnector"]')).toBeNull();
  });
});

describe('MiniBlockRmuRenderer - PV po stronie nN', () => {
  it('pokazuje PCC, widoczne wyłączniki nN i falowniki PV', () => {
    const { container } = r('detail', {
      footprintType: 'der_station',
      derBadges: [{ kind: 'PV', count: 2 }],
    });
    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]');

    expect(root?.querySelector('[data-parity-key="station.pv.nn_connection"]')).not.toBeNull();
    expect(root?.querySelector('[data-element-kind="pcc"]')).not.toBeNull();
    expect(root?.querySelectorAll('[data-element-kind="lv_breaker"][data-symbol-canon="circuit_breaker_square"]').length).toBe(2);
    expect(root?.querySelectorAll('[data-element-kind="protection_relay"][data-protected-ref]').length).toBe(2);
    expect(root?.querySelectorAll('[data-element-kind="pv_inverter"]').length).toBe(2);
  });

  it('widok szczegółowy PV nie dubluje badge i używa małej etykiety stacji', () => {
    const { container } = r('detail', {
      footprintType: 'der_station',
      derBadges: [{ kind: 'PV', count: 2 }],
    });
    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]');
    const name = root?.querySelector('[data-parity-key="station.mini.name"]');

    expect(root?.querySelector('[data-testid="sld-v2-mini-rmu-der-badge-PV"]')).toBeNull();
    expect(Number(name?.getAttribute('font-size') ?? '0')).toBeLessThanOrEqual(9);
  });

  it('każdy symbol PV po nN ma własny klikany identyfikator', () => {
    let clicked: string | null = null;
    const { container } = r('detail', {
      footprintType: 'der_station',
      derBadges: [{ kind: 'PV', count: 2 }],
      onClick: (id) => {
        clicked = id;
      },
    });

    const breaker = container.querySelector('[data-testid="sld-v2-mini-rmu-pv-lv-breaker-1"]') as SVGGElement;
    breaker.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicked).toBe('st-1/pv/nn-breaker/Q1');

    const protection = container.querySelector('[data-testid="sld-v2-mini-rmu-pv-protection-1"]') as SVGGElement;
    protection.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicked).toBe('st-1/pv/protection/e2tango/Q1');
  });
});

describe('MiniBlockRmuRenderer - PV layout readability', () => {
  it('widok szczegolowy PV trzyma etykiete pod ukladem nN i rysuje cele rozdzielnicy', () => {
    const { container } = r('detail', {
      footprintType: 'der_station',
      derBadges: [{ kind: 'PV', count: 2 }],
    });
    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-1"]');
    const name = root?.querySelector('[data-parity-key="station.mini.name"]');

    expect(Number(name?.getAttribute('y') ?? '0')).toBeGreaterThan(80);
    expect(root?.querySelector('[data-parity-key="station.pv.nn_compartment"]')).not.toBeNull();
    expect(root?.querySelectorAll('[data-parity-key="station.pv.nn_feeder.cell"]').length).toBe(2);
    expect(root?.querySelectorAll('[data-parity-key="station.mini.bay.cell"]').length).toBeGreaterThanOrEqual(2);
  });
});

describe('MiniBlockRmuRenderer — DER badges', () => {
  it('PV badge widoczny w widoku kompaktowym', () => {
    const { container } = r('compact', {
      derBadges: [{ kind: 'PV', count: 1 }],
    });
    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-der-badge-PV"]')).not.toBeNull();
  });

  it('BESS i FW badges renderowane razem', () => {
    const { container } = r('compact', {
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
