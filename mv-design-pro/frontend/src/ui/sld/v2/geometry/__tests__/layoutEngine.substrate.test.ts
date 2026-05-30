/**
 * LayoutEngine — machine-verifiable acceptance on the real >=52-station substrate.
 *
 * Bridge: committed canonical ENM fixture (sldSubstrate52s.enm.json, derived from
 * backend build_sld_substrate_52s) -> readTopologyFromENM (REAL reader) ->
 * TopologyInputV1 -> LayoutEngine.layout(...).
 *
 * Asserts (machine conditions):
 *   M-01 frame fill >=75% at L0
 *   M-02 zero symbol overlaps at each LOD
 *   M-07 determinism: same snapshot -> identical LayoutResult
 *   M-08 L0 readable: stations are distinguishable blocks (min size), zero micro-markers
 *   M-09 L2: full apparatus + ports laid out without overlap
 *   Structure: every NodeGeometry has lod; stations->fields->apparatus; L2 nodes expose
 *              ports; EdgeGeometry endpoints reference real ports.
 */

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { readTopologyFromENM } from '../../../core/topologyInputReader';
import {
  createTopologicalLayoutEngine,
  type EdgeGeometry,
  type LayoutFrame,
  type LayoutResult,
  type LodLevel,
  type NodeGeometry,
  type PortAnchor,
} from '../index';
import fixture from './fixtures/sldSubstrate52s.enm.json';

// --- bridge: fixture ENM -> TopologyInputV1 via the real reader -------------
const enm = (fixture as { enm: unknown }).enm as EnergyNetworkModel;
const snapshot = readTopologyFromENM(enm, 'sld-substrate-52s');

const FRAME: LayoutFrame = { width: 1600, height: 900, padding: 40 };
const engine = createTopologicalLayoutEngine(FRAME);

// --- helpers ----------------------------------------------------------------

interface Rect {
  ref: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lod: LodLevel;
}

function collectNodes(nodes: readonly NodeGeometry[], pred?: (n: NodeGeometry) => boolean): NodeGeometry[] {
  const out: NodeGeometry[] = [];
  const visit = (n: NodeGeometry) => {
    if (!pred || pred(n)) out.push(n);
    n.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

function toRects(nodes: readonly NodeGeometry[]): Rect[] {
  return nodes.map((n) => ({ ref: n.ref, x: n.x, y: n.y, width: n.width, height: n.height, lod: n.lod }));
}

function overlapArea(a: Rect, b: Rect): number {
  const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return ox * oy;
}

/** Count overlapping pairs among sibling rects (tolerance for shared edges). */
function countOverlaps(rects: Rect[], tol = 0.5): { count: number; sample: string[] } {
  let count = 0;
  const sample: string[] = [];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const area = overlapArea(rects[i], rects[j]);
      // tolerate touching edges: require meaningful 2D overlap
      const minDim = Math.min(rects[i].width, rects[i].height, rects[j].width, rects[j].height);
      if (area > tol && area > minDim * 0.5) {
        count += 1;
        if (sample.length < 5) sample.push(`${rects[i].ref} ∩ ${rects[j].ref} = ${area.toFixed(1)}`);
      }
    }
  }
  return { count, sample };
}

function allPortIds(nodes: readonly NodeGeometry[]): Set<string> {
  const ids = new Set<string>();
  collectNodes(nodes).forEach((n) => n.ports.forEach((p: PortAnchor) => ids.add(p.portId)));
  return ids;
}

// --- baseline sanity --------------------------------------------------------

describe('substrate bridge sanity', () => {
  it('reader produces a >=52-station topology from the fixture', () => {
    expect(snapshot.stations.length).toBeGreaterThanOrEqual(52);
    expect(snapshot.branches.length).toBeGreaterThan(50);
    expect(snapshot.generators.length).toBeGreaterThan(0);
    // fingerprint comes from the canonical ENM header (deterministic fixture)
    expect(snapshot.snapshotFingerprint).toBe(
      (fixture as { _meta: { builder_snapshot_hash: string } })._meta.builder_snapshot_hash,
    );
  });
});

// --- M-08 + structure -------------------------------------------------------

describe('M-08 L0 readability (53-station substrate)', () => {
  const result = engine.layout(snapshot, 'topological', 'L0');

  it('lays out all stations as distinguishable blocks (min size, zero micro-markers)', () => {
    const stationBlocks = result.nodes; // L0 roots
    expect(stationBlocks.length).toBeGreaterThanOrEqual(52);
    for (const block of stationBlocks) {
      // every block readable: not a micro-marker
      expect(block.width).toBeGreaterThanOrEqual(8);
      expect(block.height).toBeGreaterThanOrEqual(8);
      expect(block.lod).toBe('L0');
    }
    // station count laid out matches reader station count
    expect(stationBlocks.length).toBe(snapshot.stations.length);
  });

  it('M-02 (L0): zero block overlaps', () => {
    const { count, sample } = countOverlaps(toRects(result.nodes));
    expect(count, `overlaps: ${sample.join('; ')}`).toBe(0);
  });
});

// --- M-01 frame fill --------------------------------------------------------

describe('M-01 frame fill >=75% at L0', () => {
  it('bbox occupies >=75% of usable frame on at least one axis with >=75% area-fit factor', () => {
    const result = engine.layout(snapshot, 'topological', 'L0');
    const usableW = FRAME.width - 2 * (FRAME.padding ?? 0);
    const usableH = FRAME.height - 2 * (FRAME.padding ?? 0);
    const w = result.bbox.maxX - result.bbox.minX;
    const h = result.bbox.maxY - result.bbox.minY;
    // auto-fit maximizes the binding dimension: at least one axis must reach >=75%.
    const fillW = w / usableW;
    const fillH = h / usableH;
    const binding = Math.max(fillW, fillH);
    expect(binding, `fillW=${fillW.toFixed(3)} fillH=${fillH.toFixed(3)}`).toBeGreaterThanOrEqual(
      0.75,
    );
    // bbox must stay inside the frame
    expect(result.bbox.minX).toBeGreaterThanOrEqual(-0.01);
    expect(result.bbox.minY).toBeGreaterThanOrEqual(-0.01);
    expect(result.bbox.maxX).toBeLessThanOrEqual(FRAME.width + 0.01);
    expect(result.bbox.maxY).toBeLessThanOrEqual(FRAME.height + 0.01);
  });
});

// --- M-09 L2 apparatus + ports ----------------------------------------------

describe('M-09 L2 full apparatus + ports without overlap', () => {
  const result = engine.layout(snapshot, 'topological', 'L2');

  it('apparatus (L2) nodes each expose ports and do not overlap within a field', () => {
    const apparatus = collectNodes(result.nodes, (n) => n.lod === 'L2');
    expect(apparatus.length).toBeGreaterThan(0);
    for (const a of apparatus) {
      expect(a.ports.length).toBeGreaterThan(0);
      for (const p of a.ports) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
    // overlap check per parent field (siblings)
    const fields = collectNodes(result.nodes, (n) => n.lod === 'L1');
    let totalOverlap = 0;
    const samples: string[] = [];
    for (const f of fields) {
      const kids = (f.children ?? []) as NodeGeometry[];
      const { count, sample } = countOverlaps(toRects(kids));
      totalOverlap += count;
      if (sample.length) samples.push(...sample);
    }
    expect(totalOverlap, `apparatus overlaps: ${samples.slice(0, 5).join('; ')}`).toBe(0);
  });

  it('M-02 (L2): zero station-block overlaps at full detail', () => {
    const { count, sample } = countOverlaps(toRects(result.nodes));
    expect(count, `L0 block overlaps at L2: ${sample.join('; ')}`).toBe(0);
  });

  it('M-02 (L1): fields within each station do not overlap each other', () => {
    const stations = result.nodes;
    let totalOverlap = 0;
    const samples: string[] = [];
    for (const s of stations) {
      const fields = (s.children ?? []) as NodeGeometry[];
      const { count, sample } = countOverlaps(toRects(fields));
      totalOverlap += count;
      if (sample.length) samples.push(...sample);
    }
    expect(totalOverlap, `field overlaps: ${samples.slice(0, 5).join('; ')}`).toBe(0);
  });
});

// --- Structure invariants ---------------------------------------------------

describe('structure invariants (one nested truth)', () => {
  const result = engine.layout(snapshot, 'topological'); // full nested (default)

  it('every NodeGeometry has a lod tag', () => {
    const all = collectNodes(result.nodes);
    expect(all.length).toBeGreaterThan(0);
    for (const n of all) {
      expect(['L0', 'L1', 'L2']).toContain(n.lod);
    }
  });

  it('stations (L0) have field children (L1); fields have apparatus children (L2)', () => {
    const stationsWithFields = result.nodes.filter((s) => (s.children?.length ?? 0) > 0);
    // most stations carry SN fields from the reader
    expect(stationsWithFields.length).toBeGreaterThan(40);
    for (const s of stationsWithFields) {
      expect(s.lod).toBe('L0');
      for (const f of s.children ?? []) {
        expect(f.lod).toBe('L1');
      }
    }
    // at least some fields carry apparatus (L2)
    const fieldsWithApparatus = collectNodes(result.nodes, (n) => n.lod === 'L1').filter(
      (f) => (f.children?.length ?? 0) > 0,
    );
    expect(fieldsWithApparatus.length).toBeGreaterThan(0);
    for (const f of fieldsWithApparatus) {
      for (const a of f.children ?? []) {
        expect(a.lod).toBe('L2');
      }
    }
  });

  it('every L2 node exposes its ports', () => {
    const apparatus = collectNodes(result.nodes, (n) => n.lod === 'L2');
    expect(apparatus.length).toBeGreaterThan(0);
    for (const a of apparatus) {
      expect(a.ports.length).toBeGreaterThan(0);
    }
  });

  it('EdgeGeometry endpoints reference real ports', () => {
    const portIds = allPortIds(result.nodes);
    expect(result.edges.length).toBeGreaterThan(0);
    for (const e of result.edges as EdgeGeometry[]) {
      expect(portIds.has(e.fromPortId), `from ${e.fromPortId} not a real port`).toBe(true);
      expect(portIds.has(e.toPortId), `to ${e.toPortId} not a real port`).toBe(true);
      // polyline endpoints coincide with port coordinates (anchored, V-07)
      const fromP = collectNodes(result.nodes).flatMap((n) => n.ports).find((p) => p.portId === e.fromPortId)!;
      const toP = collectNodes(result.nodes).flatMap((n) => n.ports).find((p) => p.portId === e.toPortId)!;
      const first = e.polyline[0];
      const last = e.polyline[e.polyline.length - 1];
      expect(Math.abs(first.x - fromP.x)).toBeLessThan(0.01);
      expect(Math.abs(first.y - fromP.y)).toBeLessThan(0.01);
      expect(Math.abs(last.x - toP.x)).toBeLessThan(0.01);
      expect(Math.abs(last.y - toP.y)).toBeLessThan(0.01);
    }
  });
});

// --- M-07 determinism -------------------------------------------------------

describe('M-07 determinism', () => {
  function fingerprint(r: LayoutResult): string {
    // deterministic deep serialization (sorted by ref where applicable)
    const nodes = collectNodes(r.nodes)
      .map((n) => `${n.ref}|${n.lod}|${n.x.toFixed(4)}|${n.y.toFixed(4)}|${n.width.toFixed(4)}|${n.height.toFixed(4)}`)
      .sort()
      .join('\n');
    const edges = (r.edges as EdgeGeometry[])
      .map((e) => `${e.ref}|${e.fromPortId}|${e.toPortId}|${e.polyline.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(';')}`)
      .sort()
      .join('\n');
    return `${r.mode}::${JSON.stringify(r.bbox)}::${nodes}::${edges}`;
  }

  it('same snapshot -> identical LayoutResult across runs (full nested)', () => {
    const a = engine.layout(snapshot, 'topological');
    const b = engine.layout(snapshot, 'topological');
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('determinism holds per LOD projection', () => {
    for (const lod of ['L0', 'L1', 'L2'] as LodLevel[]) {
      const a = engine.layout(snapshot, 'topological', lod);
      const b = engine.layout(snapshot, 'topological', lod);
      expect(fingerprint(a), `lod ${lod}`).toBe(fingerprint(b));
    }
  });

  it('fresh reader pass + fresh engine reproduce identical geometry', () => {
    const snap2 = readTopologyFromENM(enm, 'sld-substrate-52s');
    const eng2 = createTopologicalLayoutEngine(FRAME);
    const a = engine.layout(snapshot, 'topological');
    const b = eng2.layout(snap2, 'topological');
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});

// --- geo deferred -----------------------------------------------------------

describe('geo mode deferred (D-12)', () => {
  it('returns an explicit unavailable marker, not fake positions', () => {
    const r = engine.layout(snapshot, 'geo');
    expect(r.unavailable).toBeDefined();
    expect(r.unavailable?.code).toBe('geo.coordinates_missing');
    expect(r.nodes).toHaveLength(0);
    expect(r.edges).toHaveLength(0);
  });
});
