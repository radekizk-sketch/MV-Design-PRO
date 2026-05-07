/**
 * LayoutStrategyDispatch — Phase 6 polish testy (operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. dispatchLayout: 4 strategie wybierane wg score.
 *   2. forceStrategy override.
 *   3. corridor strategy → corridor + cadCorridorBands populated.
 *   4. simple_radial/hierarchical → corridor=null.
 *   5. corridor_with_locked → respectsManualLocks=true.
 *   6. Determinizm: same ENM → same dispatch result (5 reruny).
 *   7. dispatchLayoutMatches helper.
 *   8. Polish explanation.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { dispatchLayout, dispatchLayoutMatches } from '../LayoutStrategyDispatch';

type EnmInput = Pick<EnergyNetworkModel, 'substations' | 'bays' | 'generators' | 'line_runs'>;

function emptyEnm(): EnmInput {
  return { substations: [], bays: [], generators: [], line_runs: [] } as EnmInput;
}

function smallNetwork(): EnmInput {
  return {
    substations: [
      { ref_id: 'gpz', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      { ref_id: 'st1', name: 'St1', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      { ref_id: 'st2', name: 'St2', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
    ],
    bays: [],
    generators: [],
    line_runs: [
      {
        id: 'r',
        run_kind: 'main_trunk',
        starting_bay_ref: 'bay-x',
        starting_port_ref: 'port-x',
        segments: [],
        stations: [{ substation_ref: 'st1', order: 1 }, { substation_ref: 'st2', order: 2 }],
      } as never,
    ],
  } as EnmInput;
}

function largeNetwork(): EnmInput {
  return {
    substations: [
      { ref_id: 'gpz', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      ...Array.from({ length: 25 }, (_, i) => ({
        ref_id: `st${i}`, name: `St${i}`, station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {},
      })) as never,
    ],
    bays: [],
    generators: [],
    line_runs: Array.from({ length: 7 }, (_, i) => ({
      id: `run-${i}`,
      run_kind: i === 0 ? 'main_trunk' : 'branch',
      starting_bay_ref: `bay-${i}`,
      starting_port_ref: `port-${i}`,
      segments: [],
      stations: [],
    })) as never,
  } as EnmInput;
}

describe('dispatchLayout — strategy wybór wg score', () => {
  it('Empty ENM → simple_radial', () => {
    const result = dispatchLayout(emptyEnm());
    expect(result.strategy).toBe('simple_radial');
    expect(result.corridor).toBeNull();
    expect(result.cadCorridorBands).toHaveLength(0);
    expect(result.respectsManualLocks).toBe(false);
  });

  it('Small network (4 stacje, brak branch) → simple_radial', () => {
    const result = dispatchLayout(smallNetwork());
    expect(result.strategy).toBe('simple_radial');
  });

  it('Large network (25+ stacji, 6 branch) → corridor', () => {
    const result = dispatchLayout(largeNetwork());
    expect(result.strategy).toBe('corridor');
    expect(result.corridor).not.toBeNull();
    expect(result.cadCorridorBands.length).toBeGreaterThan(0);
  });

  it('Manual locks > 0.3 → corridor_with_locked', () => {
    const result = dispatchLayout(smallNetwork(), {
      manualLockedCount: 5,
      totalRouteCount: 10,
    });
    expect(result.strategy).toBe('corridor_with_locked');
    expect(result.respectsManualLocks).toBe(true);
    expect(result.corridor).not.toBeNull();
  });
});

describe('dispatchLayout — forceStrategy override', () => {
  it('forceStrategy="corridor" mimo small network', () => {
    const result = dispatchLayout(smallNetwork(), { forceStrategy: 'corridor' });
    expect(result.strategy).toBe('corridor');
    expect(result.corridor).not.toBeNull();
  });

  it('forceStrategy="hierarchical" mimo large network', () => {
    const result = dispatchLayout(largeNetwork(), { forceStrategy: 'hierarchical' });
    expect(result.strategy).toBe('hierarchical');
    expect(result.corridor).toBeNull();
  });
});

describe('dispatchLayout — Polish explanation', () => {
  it('simple_radial → "prosty radialny layout"', () => {
    const result = dispatchLayout(smallNetwork());
    expect(result.explanation).toMatch(/prosty radialny/);
  });

  it('corridor → "Corridor strategy"', () => {
    const result = dispatchLayout(largeNetwork());
    expect(result.explanation).toMatch(/Corridor strategy/);
  });

  it('corridor_with_locked → "Manual locks"', () => {
    const result = dispatchLayout(smallNetwork(), {
      manualLockedCount: 5,
      totalRouteCount: 10,
    });
    expect(result.explanation).toMatch(/Manual locks/);
  });
});

describe('dispatchLayout — Determinizm', () => {
  it('Same ENM + same options → same dispatch (5 reruny)', () => {
    const enm = largeNetwork();
    const reference = dispatchLayout(enm);
    for (let i = 0; i < 5; i++) {
      const next = dispatchLayout(enm);
      expect(dispatchLayoutMatches(reference, next)).toBe(true);
    }
  });

  it('Two different ENMs → different dispatch', () => {
    const a = dispatchLayout(smallNetwork());
    const b = dispatchLayout(largeNetwork());
    expect(dispatchLayoutMatches(a, b)).toBe(false);
  });
});

describe('dispatchLayoutMatches — helper', () => {
  it('Identical results → true', () => {
    const enm = largeNetwork();
    expect(dispatchLayoutMatches(dispatchLayout(enm), dispatchLayout(enm))).toBe(true);
  });

  it('Different strategies → false', () => {
    const a = dispatchLayout(smallNetwork());
    const b = dispatchLayout(smallNetwork(), { forceStrategy: 'corridor' });
    expect(dispatchLayoutMatches(a, b)).toBe(false);
  });
});

describe('dispatchLayout — corridor result content', () => {
  it('corridor strategy → cadCorridorBands valid (kind, yMin/yMax)', () => {
    const result = dispatchLayout(largeNetwork());
    if (result.strategy === 'corridor') {
      expect(result.cadCorridorBands.length).toBeGreaterThan(0);
      for (const band of result.cadCorridorBands) {
        expect(band.id).toBeTruthy();
        expect(band.yMax).toBeGreaterThan(band.yMin);
        expect(['gpz', 'feeder', 'branch', 'ring-return', 'label-zone']).toContain(band.kind);
      }
    }
  });
});
