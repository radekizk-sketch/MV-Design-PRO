/**
 * LayoutComplexityScore — Phase 6 testy (operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. computeComplexityScore: 10 metryk poprawnie wyliczanych.
 *   2. chooseLayoutStrategy: 4 strategie wybierane wg progów.
 *   3. STRATEGY_THRESHOLDS constants exposed.
 *   4. explainStrategy: human-readable reason po Polsku.
 *   5. Determinizm: 5 reruny → ten sam score.
 *   6. Edge cases: empty ENM, brak line_runs, brak generators.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  STRATEGY_THRESHOLDS,
  chooseLayoutStrategy,
  computeComplexityScore,
  explainStrategy,
} from '../LayoutComplexityScore';

type EnmInput = Pick<EnergyNetworkModel, 'substations' | 'bays' | 'generators' | 'line_runs'>;

function emptyEnm(): EnmInput {
  return { substations: [], bays: [], generators: [], line_runs: [] } as EnmInput;
}

function fewStationsRadial(): EnmInput {
  return {
    substations: [
      { ref_id: 'gpz', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      { ref_id: 'st1', name: 'St1', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      { ref_id: 'st2', name: 'St2', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      { ref_id: 'st3', name: 'St3', station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
    ],
    bays: [],
    generators: [],
    line_runs: [
      { id: 'run-1', run_kind: 'main_trunk', starting_bay_ref: 'bay-1', starting_port_ref: 'port-1', segments: [], stations: [] } as never,
    ],
  } as EnmInput;
}

function manyStationsBranches(): EnmInput {
  const subs = Array.from({ length: 25 }, (_, i) => ({
    ref_id: `st${i}`,
    name: `Station ${i}`,
    station_type: 'mv_lv',
    bus_refs: [],
    transformer_refs: [],
    tags: [],
    meta: {},
  }));
  const lineRuns = Array.from({ length: 7 }, (_, i) => ({
    id: `run-${i}`,
    run_kind: i === 0 ? 'main_trunk' : 'branch',
    starting_bay_ref: `bay-${i}`,
    starting_port_ref: `port-${i}`,
    segments: [],
    stations: [],
  }));
  return { substations: subs as never, bays: [], generators: [], line_runs: lineRuns as never };
}

function networkWithRing(): EnmInput {
  return {
    substations: Array.from({ length: 8 }, (_, i) => ({
      ref_id: `st${i}`,
      name: `Station ${i}`,
      station_type: 'mv_lv',
      bus_refs: [],
      transformer_refs: [],
      tags: [],
      meta: {},
    })) as never,
    bays: [],
    generators: [],
    line_runs: [
      { id: 'ring-1', run_kind: 'ring', nop_station_ref: 'st4', starting_bay_ref: 'bay-x', starting_port_ref: 'port-x', segments: [], stations: [] } as never,
    ],
  } as EnmInput;
}

describe('computeComplexityScore — basic metrics', () => {
  it('Empty ENM → wszystkie metryki = 0', () => {
    const score = computeComplexityScore(emptyEnm());
    expect(score.stationCount).toBe(0);
    expect(score.feederCount).toBe(0);
    expect(score.branchCount).toBe(0);
    expect(score.ringCount).toBe(0);
    expect(score.nopCount).toBe(0);
    expect(score.derCount).toBe(0);
    expect(score.maxBranchDepth).toBe(0);
    expect(score.crossingPressure).toBe(0);
    expect(score.manualLockedRatio).toBe(0);
  });

  it('Few stations + 1 main_trunk → stationCount/feederCount poprawne', () => {
    const score = computeComplexityScore(fewStationsRadial());
    expect(score.stationCount).toBe(4);
    expect(score.feederCount).toBe(1);
    expect(score.branchCount).toBe(0);
    expect(score.ringCount).toBe(0);
  });

  it('25 stations + 6 branches → stationCount=25, branchCount=6', () => {
    const score = computeComplexityScore(manyStationsBranches());
    expect(score.stationCount).toBe(25);
    expect(score.branchCount).toBe(6);
    expect(score.feederCount).toBe(7); // main_trunk + 6 branches
  });

  it('Network z ringiem + NMO → ringCount/nopCount', () => {
    const score = computeComplexityScore(networkWithRing());
    expect(score.ringCount).toBe(1);
    expect(score.nopCount).toBe(1);
  });

  it('DER count: 4 typy generatorów liczone', () => {
    const enm: EnmInput = {
      substations: [],
      bays: [],
      generators: [
        { ref_id: 'g1', gen_type: 'pv_inverter' } as never,
        { ref_id: 'g2', gen_type: 'wind_inverter' } as never,
        { ref_id: 'g3', gen_type: 'bess' } as never,
        { ref_id: 'g4', gen_type: 'synchronous' } as never,
      ],
      line_runs: [],
    };
    const score = computeComplexityScore(enm);
    expect(score.derCount).toBe(4);
  });

  it('manualLockedRatio z options', () => {
    const score = computeComplexityScore(emptyEnm(), {
      manualLockedCount: 4,
      totalRouteCount: 10,
    });
    expect(score.manualLockedRatio).toBe(0.4);
  });

  it('manualLockedRatio = 0 gdy totalRouteCount = 0', () => {
    const score = computeComplexityScore(emptyEnm(), { manualLockedCount: 4 });
    expect(score.manualLockedRatio).toBe(0);
  });
});

describe('chooseLayoutStrategy', () => {
  it('manualLockedRatio > 0.3 → corridor_with_locked', () => {
    const score = computeComplexityScore(fewStationsRadial(), {
      manualLockedCount: 5,
      totalRouteCount: 10,
    });
    expect(chooseLayoutStrategy(score)).toBe('corridor_with_locked');
  });

  it('Few stations radial (≤5, brak branch/ring) → simple_radial', () => {
    const score = computeComplexityScore(fewStationsRadial());
    expect(chooseLayoutStrategy(score)).toBe('simple_radial');
  });

  it('25 stations + branches → corridor', () => {
    const score = computeComplexityScore(manyStationsBranches());
    expect(chooseLayoutStrategy(score)).toBe('corridor');
  });

  it('Ring → corridor', () => {
    const score = computeComplexityScore(networkWithRing());
    expect(chooseLayoutStrategy(score)).toBe('corridor');
  });

  it('Średnia sieć (10 stacji, 1 trunk, brak branches/ringów) → hierarchical', () => {
    const enm: EnmInput = {
      substations: Array.from({ length: 10 }, (_, i) => ({
        ref_id: `st${i}`,
        name: `S${i}`,
        station_type: 'mv_lv',
        bus_refs: [],
        transformer_refs: [],
        tags: [],
        meta: {},
      })) as never,
      bays: [],
      generators: [],
      line_runs: [
        { id: 'r', run_kind: 'main_trunk', starting_bay_ref: 'bay-x', starting_port_ref: 'port-x', segments: [], stations: [] } as never,
      ],
    };
    const score = computeComplexityScore(enm);
    expect(chooseLayoutStrategy(score)).toBe('hierarchical');
  });

  it('5 odgałęzień (próg) → corridor', () => {
    const enm: EnmInput = {
      substations: [
        { ref_id: 'gpz', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      ],
      bays: [],
      generators: [],
      line_runs: Array.from({ length: 5 }, (_, i) => ({
        id: `branch-${i}`,
        run_kind: 'branch' as const,
        starting_bay_ref: `bay-${i}`,
        starting_port_ref: `port-${i}`,
        segments: [],
        stations: [],
      })) as never,
    };
    const score = computeComplexityScore(enm);
    expect(chooseLayoutStrategy(score)).toBe('corridor');
  });
});

describe('STRATEGY_THRESHOLDS — exposed constants', () => {
  it('Default thresholds exposed', () => {
    expect(STRATEGY_THRESHOLDS.STATION_CORRIDOR_THRESHOLD).toBe(20);
    expect(STRATEGY_THRESHOLDS.BRANCH_CORRIDOR_THRESHOLD).toBe(5);
    expect(STRATEGY_THRESHOLDS.MANUAL_LOCKED_THRESHOLD).toBe(0.3);
    expect(STRATEGY_THRESHOLDS.SIMPLE_RADIAL_THRESHOLD).toBe(5);
  });
});

describe('explainStrategy — human-readable reasons po Polsku', () => {
  it('simple_radial → "prosty radialny layout"', () => {
    const score = computeComplexityScore(fewStationsRadial());
    const reason = explainStrategy(score, 'simple_radial');
    expect(reason).toMatch(/prosty radialny/);
  });

  it('corridor → wymienia powody (stacji/odgałęzień/ringów)', () => {
    const score = computeComplexityScore(manyStationsBranches());
    const reason = explainStrategy(score, 'corridor');
    expect(reason).toMatch(/Corridor strategy/);
  });

  it('corridor_with_locked → wspomina manual locks', () => {
    const score = computeComplexityScore(fewStationsRadial(), {
      manualLockedCount: 5,
      totalRouteCount: 10,
    });
    const reason = explainStrategy(score, 'corridor_with_locked');
    expect(reason).toMatch(/Manual locks/);
  });

  it('hierarchical → wspomina że poniżej corridor thresholds', () => {
    const enm: EnmInput = {
      substations: Array.from({ length: 10 }, (_, i) => ({
        ref_id: `st${i}`,
        name: `S${i}`,
        station_type: 'mv_lv',
        bus_refs: [],
        transformer_refs: [],
        tags: [],
        meta: {},
      })) as never,
      bays: [],
      generators: [],
      line_runs: [],
    };
    const score = computeComplexityScore(enm);
    const reason = explainStrategy(score, 'hierarchical');
    expect(reason).toMatch(/Hierarchical/);
  });
});

describe('Determinizm — 5 reruny → identical score', () => {
  it('manyStationsBranches: 5 reruny → identyczne score', () => {
    const enm = manyStationsBranches();
    const reference = computeComplexityScore(enm);
    for (let i = 0; i < 5; i++) {
      expect(computeComplexityScore(enm)).toEqual(reference);
    }
  });

  it('chooseLayoutStrategy → deterministic', () => {
    const score = computeComplexityScore(manyStationsBranches());
    const reference = chooseLayoutStrategy(score);
    for (let i = 0; i < 5; i++) {
      expect(chooseLayoutStrategy(score)).toBe(reference);
    }
  });
});
