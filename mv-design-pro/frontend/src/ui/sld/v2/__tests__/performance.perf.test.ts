/**
 * Performance Tests — Phase 7 (operator-grade SLD plan v2).
 *
 * Pure function performance assertions — label declutter + hash triad. NIE
 * pomiar render commit (osobna warstwa, wymagała by faktycznego DOM).
 *
 * Performance Targets (Plan v2):
 *   - Label declutter: ≤ 100 ms dla network_80 (100 etykiet).
 *   - Hash triad compute: ≤ 50 ms (100 obiektów).
 *   - Topology hash: ≤ 200 ms (1000 obiektów).
 *
 * (Perf pomiarów martwego silnika layoutu builder/{Corridor,Hierarchical,
 * ComplexityScore} usunięto wraz z tym silnikiem — 2026-07 konsolidacja.)
 *
 * @see SLD_TEST_MATRIX.md
 */
import { describe, expect, it } from 'vitest';

import { type LabelInput, declutterLabels } from '../canvas/LabelDeclutter';
import {
  type LayoutSnapshot,
  type TopologySnapshot,
  type ViewSnapshot,
  DEFAULT_ANONYMIZATION_TOGGLES,
  computeHashTriad,
  computeTopologyHash,
} from '../core/hashes';

/** Helper: pomiar duration w ms. */
function measure<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

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
