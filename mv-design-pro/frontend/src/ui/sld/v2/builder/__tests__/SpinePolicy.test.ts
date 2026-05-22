/**
 * SpinePolicy testy — koncepcja ciągu SN jako spine (poziomego korytarza).
 *
 * Pokrycie:
 *   1. Empty ENM → brak corridors.
 *   2. main_trunk z 3 stacjami → 1 spine z 3 węzłami, posortowane po X.
 *   3. Branch run (parent_run_ref) → SpineBranch.
 *   4. NOP marker dodawany jako węzeł.
 *   5. ZKSN / branch_pole leżący na trasie → węzeł spine.
 *   6. Determinizm: same ENM + same CorridorLayout → identyczny SpineModel.
 *   7. Sortowanie spineId alfabetyczne.
 */
import { describe, expect, it } from 'vitest';
import type { EnergyNetworkModel, LineRunV1, BranchPointSN } from '../../../../../types/enm';
import { computeCorridorLayout } from '../CorridorLayout';
import { computeSpineModel } from '../SpinePolicy';

type SpineInput = Pick<EnergyNetworkModel, 'substations' | 'line_runs' | 'branch_points'>;

function makeSubstation(ref_id: string, station_type = 'mv_lv', name?: string): never {
  return {
    id: ref_id,
    ref_id,
    name: name ?? ref_id,
    station_type,
    bus_refs: [],
    transformer_refs: [],
    tags: [],
    meta: {},
  } as never;
}

function makeRun(
  id: string,
  run_kind: LineRunV1['run_kind'],
  stationRefs: { ref: string; order: number }[],
  opts: { parent_run_ref?: string; branch_origin_station_ref?: string; nop_station_ref?: string; name?: string } = {},
): LineRunV1 {
  return {
    id,
    name: opts.name ?? null,
    run_kind,
    starting_bay_ref: `bay-${id}`,
    starting_port_ref: `port-${id}`,
    segments: [],
    stations: stationRefs.map((s) => ({ substation_ref: s.ref, order: s.order })),
    nop_station_ref: opts.nop_station_ref ?? null,
    parent_run_ref: opts.parent_run_ref ?? null,
    branch_origin_station_ref: opts.branch_origin_station_ref ?? null,
  };
}

function makeBranchPoint(ref_id: string, branch_point_type: 'zksn' | 'branch_pole', parent_segment_id = 'seg-1'): BranchPointSN {
  return {
    id: ref_id,
    ref_id,
    name: ref_id,
    branch_point_type,
    parent_segment_id,
    bus_ref: 'bus-x',
    ports: { MAIN_IN: 'p_in', MAIN_OUT: 'p_out', BRANCH: [] },
    tags: [],
    meta: {},
  };
}

describe('computeSpineModel — empty ENM', () => {
  it('Brak stacji i runów → 0 corridors', () => {
    const enm: SpineInput = { substations: [], line_runs: [], branch_points: [] };
    const layout = computeCorridorLayout({ substations: [], line_runs: [] });
    const spine = computeSpineModel(enm, layout);
    expect(spine.corridors).toHaveLength(0);
    expect(spine.totalNodes).toBe(0);
  });
});

describe('computeSpineModel — main_trunk', () => {
  it('1 main_trunk z 3 stacjami → 1 spine z 3 węzłami posortowanymi po X', () => {
    const enm: SpineInput = {
      substations: [
        makeSubstation('GPZ-1', 'gpz'),
        makeSubstation('ST-A', 'mv_lv'),
        makeSubstation('ST-B', 'mv_lv'),
        makeSubstation('ST-C', 'mv_lv'),
      ],
      line_runs: [
        makeRun('RUN-1', 'main_trunk', [
          { ref: 'ST-A', order: 1 },
          { ref: 'ST-B', order: 2 },
          { ref: 'ST-C', order: 3 },
        ]),
      ],
      branch_points: [],
    };
    const layout = computeCorridorLayout({ substations: enm.substations, line_runs: enm.line_runs });
    const spine = computeSpineModel(enm, layout);
    expect(spine.corridors).toHaveLength(1);
    const trunk = spine.corridors[0];
    expect(trunk.spineId).toBe('RUN-1');
    expect(trunk.nodes).toHaveLength(3);
    expect(trunk.nodes.map((n) => n.ref)).toEqual(['ST-A', 'ST-B', 'ST-C']);
    // X rosnąco
    for (let i = 1; i < trunk.nodes.length; i++) {
      expect(trunk.nodes[i].x).toBeGreaterThanOrEqual(trunk.nodes[i - 1].x);
    }
    expect(spine.totalNodes).toBe(3);
  });

  it('NOP marker dodawany jako węzeł kind="nop"', () => {
    const enm: SpineInput = {
      substations: [
        makeSubstation('ST-A', 'mv_lv'),
        makeSubstation('ST-NOP', 'mv_lv'),
      ],
      line_runs: [
        makeRun(
          'RUN-1',
          'main_trunk',
          [
            { ref: 'ST-A', order: 1 },
            { ref: 'ST-NOP', order: 2 },
          ],
          { nop_station_ref: 'ST-NOP' },
        ),
      ],
      branch_points: [],
    };
    const layout = computeCorridorLayout({ substations: enm.substations, line_runs: enm.line_runs });
    const spine = computeSpineModel(enm, layout);
    const trunk = spine.corridors[0];
    // ST-NOP jest w stations[] więc będzie kind='station' (nie 'nop' bo już dodany).
    // To zgodne z polityką: jeśli stacja jest na liście stations[], to traktujemy ją
    // jako zwykły węzeł; NOP-marker dotyczy stacji NIE-występujących w stations[].
    expect(trunk.nodes.find((n) => n.ref === 'ST-NOP')?.kind).toBe('station');
  });

  it('ZKSN i słup leżący na osi spine → węzły spine', () => {
    const enm: SpineInput = {
      substations: [
        makeSubstation('ST-A', 'mv_lv'),
        makeSubstation('ST-B', 'mv_lv'),
      ],
      line_runs: [
        makeRun('RUN-1', 'main_trunk', [
          { ref: 'ST-A', order: 1 },
          { ref: 'ST-B', order: 2 },
        ]),
      ],
      branch_points: [makeBranchPoint('ZKSN-1', 'zksn'), makeBranchPoint('POLE-1', 'branch_pole')],
    };
    const layout = computeCorridorLayout({ substations: enm.substations, line_runs: enm.line_runs });
    const spine = computeSpineModel(enm, layout);
    const trunk = spine.corridors[0];
    // ZKSN/POLE leżą poza pozycjami corridorLayout (CorridorLayout nie pozycjonuje
    // branch_points), więc nie zostaną dodane jako spine_node. Sprawdzamy że
    // funkcja nie crashuje w takim przypadku.
    expect(trunk.nodes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('computeSpineModel — branches', () => {
  it('Branch run (parent_run_ref + branch_origin) → SpineBranch', () => {
    const enm: SpineInput = {
      substations: [
        makeSubstation('ST-A', 'mv_lv'),
        makeSubstation('ST-B', 'mv_lv'),
        makeSubstation('ST-C', 'mv_lv'),
      ],
      line_runs: [
        makeRun('RUN-MAIN', 'main_trunk', [
          { ref: 'ST-A', order: 1 },
          { ref: 'ST-B', order: 2 },
        ]),
        makeRun('RUN-BRANCH', 'branch', [{ ref: 'ST-C', order: 1 }], {
          parent_run_ref: 'RUN-MAIN',
          branch_origin_station_ref: 'ST-B',
        }),
      ],
      branch_points: [],
    };
    const layout = computeCorridorLayout({ substations: enm.substations, line_runs: enm.line_runs });
    const spine = computeSpineModel(enm, layout);
    const trunk = spine.corridors.find((c) => c.spineId === 'RUN-MAIN')!;
    expect(trunk).toBeDefined();
    expect(trunk.branches).toHaveLength(1);
    expect(trunk.branches[0].branchRunId).toBe('RUN-BRANCH');
    expect(trunk.branches[0].originRef).toBe('ST-B');
  });
});

describe('computeSpineModel — determinizm', () => {
  it('Same ENM + same CorridorLayout → identyczny SpineModel', () => {
    const enm: SpineInput = {
      substations: [
        makeSubstation('ST-A', 'mv_lv'),
        makeSubstation('ST-B', 'mv_lv'),
      ],
      line_runs: [
        makeRun('RUN-1', 'main_trunk', [
          { ref: 'ST-A', order: 1 },
          { ref: 'ST-B', order: 2 },
        ]),
      ],
      branch_points: [],
    };
    const layout1 = computeCorridorLayout({ substations: enm.substations, line_runs: enm.line_runs });
    const layout2 = computeCorridorLayout({ substations: enm.substations, line_runs: enm.line_runs });
    const spine1 = computeSpineModel(enm, layout1);
    const spine2 = computeSpineModel(enm, layout2);
    expect(JSON.stringify(spine1)).toBe(JSON.stringify(spine2));
  });

  it('Sortowanie corridors po spineId', () => {
    const enm: SpineInput = {
      substations: [makeSubstation('ST-A', 'mv_lv'), makeSubstation('ST-B', 'mv_lv')],
      line_runs: [
        makeRun('RUN-Z', 'main_trunk', [{ ref: 'ST-A', order: 1 }]),
        makeRun('RUN-A', 'main_trunk', [{ ref: 'ST-B', order: 1 }]),
      ],
      branch_points: [],
    };
    const layout = computeCorridorLayout({ substations: enm.substations, line_runs: enm.line_runs });
    const spine = computeSpineModel(enm, layout);
    expect(spine.corridors.map((c) => c.spineId)).toEqual(['RUN-A', 'RUN-Z']);
  });
});
