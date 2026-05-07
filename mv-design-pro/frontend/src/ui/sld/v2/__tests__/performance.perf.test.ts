/**
 * Performance Tests — Phase 7 (operator-grade SLD plan v2).
 *
 * Pure function performance assertions — pomiar layout computation,
 * complexity score, label declutter, hash triad. NIE pomiar render commit
 * (osobna warstwa, wymagała by faktycznego DOM).
 *
 * Performance Targets (Plan v2):
 *   - Layout computation (pure function): ≤ 200 ms dla network_80.
 *   - Label declutter: ≤ 100 ms dla network_80.
 *   - Anonymization toggle: ≤ 30 ms.
 *   - Complexity score: ≤ 50 ms.
 *   - Hash triad compute: ≤ 50 ms.
 *
 * Fixtures (synthetic, deterministic):
 *   - network_30: 30 stacji, 1 GPZ, 2 feedry.
 *   - network_50: 50 stacji, 1 GPZ, 4 feedry, 1 ring.
 *   - network_80: 80 stacji, 2 GPZ, 6 feedrów, 2 ringi.
 *
 * @see SLD_TEST_MATRIX.md
 */
import { describe, expect, it } from 'vitest';

import { computeCorridorLayout } from '../builder/CorridorLayout';
import { chooseLayoutStrategy, computeComplexityScore } from '../builder/LayoutComplexityScore';
import { type LabelInput, declutterLabels } from '../canvas/LabelDeclutter';
import {
  type LayoutSnapshot,
  type TopologySnapshot,
  type ViewSnapshot,
  DEFAULT_ANONYMIZATION_TOGGLES,
  computeHashTriad,
  computeTopologyHash,
} from '../core/hashes';
import type { EnergyNetworkModel } from '../../../../types/enm';

type EnmInput = Pick<EnergyNetworkModel, 'substations' | 'bays' | 'generators' | 'line_runs'>;

function makeNetwork(stationCount: number, ringCount: number, branchCount: number): EnmInput {
  const substations = [
    {
      ref_id: 'GPZ-1',
      name: 'GPZ Centralny',
      station_type: 'gpz',
      bus_refs: ['b15'],
      transformer_refs: [],
      tags: [],
      meta: {},
    },
    ...Array.from({ length: stationCount }, (_, i) => ({
      ref_id: `ST-${String(i + 1).padStart(3, '0')}`,
      name: `Stacja ${i + 1}`,
      station_type: 'mv_lv',
      bus_refs: [],
      transformer_refs: [],
      tags: [],
      meta: {},
    })),
  ];

  const lineRuns: unknown[] = [];
  // 1 main_trunk
  lineRuns.push({
    id: 'run-trunk',
    run_kind: 'main_trunk',
    starting_bay_ref: 'bay-trunk',
    starting_port_ref: 'port-trunk',
    segments: [],
    stations: Array.from({ length: Math.floor(stationCount / 2) }, (_, i) => ({
      substation_ref: `ST-${String(i + 1).padStart(3, '0')}`,
      order: i + 1,
    })),
  });
  // N branches
  for (let i = 0; i < branchCount; i++) {
    lineRuns.push({
      id: `run-branch-${i}`,
      run_kind: 'branch',
      starting_bay_ref: `bay-branch-${i}`,
      starting_port_ref: `port-branch-${i}`,
      segments: [],
      stations: [{
        substation_ref: `ST-${String(Math.floor(stationCount / 2) + i + 1).padStart(3, '0')}`,
        order: 1,
      }],
    });
  }
  // N rings
  for (let i = 0; i < ringCount; i++) {
    lineRuns.push({
      id: `run-ring-${i}`,
      run_kind: 'ring',
      nop_station_ref: `ST-${String(stationCount - i).padStart(3, '0')}`,
      starting_bay_ref: `bay-ring-${i}`,
      starting_port_ref: `port-ring-${i}`,
      segments: [],
      stations: [],
    });
  }

  return { substations: substations as never, bays: [], generators: [], line_runs: lineRuns as never };
}

const NETWORK_30 = makeNetwork(30, 0, 2);
const NETWORK_50 = makeNetwork(50, 1, 4);
const NETWORK_80 = makeNetwork(80, 2, 6);

/** Helper: pomiar duration w ms. */
function measure<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/* ---------------------------------------------------------------------------
   Layout computation performance
   --------------------------------------------------------------------------- */

describe('Performance — computeComplexityScore', () => {
  it('network_30: ≤ 50 ms', () => {
    const { durationMs } = measure(() => computeComplexityScore(NETWORK_30));
    expect(durationMs).toBeLessThan(50);
  });

  it('network_50: ≤ 50 ms', () => {
    const { durationMs } = measure(() => computeComplexityScore(NETWORK_50));
    expect(durationMs).toBeLessThan(50);
  });

  it('network_80: ≤ 50 ms', () => {
    const { durationMs } = measure(() => computeComplexityScore(NETWORK_80));
    expect(durationMs).toBeLessThan(50);
  });
});

describe('Performance — computeCorridorLayout', () => {
  it('network_30: ≤ 100 ms', () => {
    const { durationMs } = measure(() => computeCorridorLayout(NETWORK_30));
    expect(durationMs).toBeLessThan(100);
  });

  it('network_50: ≤ 150 ms', () => {
    const { durationMs } = measure(() => computeCorridorLayout(NETWORK_50));
    expect(durationMs).toBeLessThan(150);
  });

  it('network_80: ≤ 200 ms (Plan v2 target)', () => {
    const { durationMs } = measure(() => computeCorridorLayout(NETWORK_80));
    expect(durationMs).toBeLessThan(200);
  });
});

describe('Performance — chooseLayoutStrategy', () => {
  it('network_80: complexity score + strategy choice ≤ 60 ms total', () => {
    const { durationMs } = measure(() => {
      const score = computeComplexityScore(NETWORK_80);
      return chooseLayoutStrategy(score);
    });
    expect(durationMs).toBeLessThan(60);
  });
});

/* ---------------------------------------------------------------------------
   Label declutter performance
   --------------------------------------------------------------------------- */

describe('Performance — declutterLabels', () => {
  it('100 etykiet: ≤ 100 ms (Plan v2 target dla network_80)', () => {
    const labels: LabelInput[] = Array.from({ length: 100 }, (_, i) => ({
      id: `label-${i}`,
      text: `Label ${i}`,
      priority: 500 as never,
      anchorPoint: { x: (i % 10) * 100, y: Math.floor(i / 10) * 50 },
      width: 50,
      height: 16,
    }));
    const { durationMs } = measure(() => declutterLabels(labels));
    expect(durationMs).toBeLessThan(100);
  });

  it('200 etykiet: ≤ 200 ms (worst-case)', () => {
    const labels: LabelInput[] = Array.from({ length: 200 }, (_, i) => ({
      id: `label-${i}`,
      text: `Label ${i}`,
      priority: 500 as never,
      anchorPoint: { x: (i % 20) * 80, y: Math.floor(i / 20) * 40 },
      width: 50,
      height: 16,
    }));
    const { durationMs } = measure(() => declutterLabels(labels));
    expect(durationMs).toBeLessThan(200);
  });
});

/* ---------------------------------------------------------------------------
   Hash triad performance
   --------------------------------------------------------------------------- */

describe('Performance — computeHashTriad', () => {
  function makeBigSnapshot(stationCount: number) {
    const topology: TopologySnapshot = {
      objects: Array.from({ length: stationCount }, (_, i) => ({
        ref: `obj-${i}`,
        kind: 'substation',
        catalogRef: 'cat',
      })),
      connections: Array.from({ length: stationCount - 1 }, (_, i) => ({
        fromPortId: `obj-${i}.out`,
        toPortId: `obj-${i + 1}.in`,
        kind: 'sn_segment',
      })),
    };
    const layout: LayoutSnapshot = {
      objectPositions: Array.from({ length: stationCount }, (_, i) => ({
        ref: `obj-${i}`,
        x: i * 100,
        y: 100,
      })),
      routes: [],
      labelLocks: [],
    };
    const view: ViewSnapshot = {
      lod: 2,
      viewportScale: 1,
      viewportTx: 0,
      viewportTy: 0,
      anonymizationOn: false,
      anonymizationToggles: DEFAULT_ANONYMIZATION_TOGGLES,
      visibleLayers: ['equipment'],
    };
    return { topology, layout, view };
  }

  it('100 obiektów: hash triad ≤ 50 ms', () => {
    const snap = makeBigSnapshot(100);
    const { durationMs } = measure(() =>
      computeHashTriad(snap.topology, snap.layout, snap.view),
    );
    expect(durationMs).toBeLessThan(50);
  });

  it('500 obiektów: hash triad ≤ 200 ms', () => {
    const snap = makeBigSnapshot(500);
    const { durationMs } = measure(() =>
      computeHashTriad(snap.topology, snap.layout, snap.view),
    );
    expect(durationMs).toBeLessThan(200);
  });

  it('Topology hash 1000 obiektów: ≤ 200 ms', () => {
    const snap = makeBigSnapshot(1000);
    const { durationMs } = measure(() => computeTopologyHash(snap.topology));
    expect(durationMs).toBeLessThan(200);
  });
});

/* ---------------------------------------------------------------------------
   Composability — multiple operacji w sekwencji
   --------------------------------------------------------------------------- */

describe('Performance — composability (full pipeline)', () => {
  it('network_80: full pipeline (score + strategy + layout) ≤ 250 ms', () => {
    const { durationMs } = measure(() => {
      const score = computeComplexityScore(NETWORK_80);
      const strategy = chooseLayoutStrategy(score);
      const layout = computeCorridorLayout(NETWORK_80);
      return { strategy, layout };
    });
    expect(durationMs).toBeLessThan(250);
  });
});
