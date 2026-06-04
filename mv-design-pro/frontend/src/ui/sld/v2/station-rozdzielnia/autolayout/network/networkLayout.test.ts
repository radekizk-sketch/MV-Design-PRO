/**
 * E3 NETWORK AUTO-LAYOUT — DoD: the whole 53-station network lays out deterministically, every
 * station is placed (NO-ORPHAN, independent of switch state), the radial tree is intact, and the
 * normally-open sectionalizer is kept as an open feeder (drawn, not a topology cut).
 */
import { describe, expect, it } from 'vitest';

import { SLD_NETWORK_53 } from './sldNetwork53';
import { DEFAULT_NETWORK_CONFIG, layoutNetwork } from './networkLayout';

describe('E3 network auto-layout — 53-station radial network', () => {
  it('places EVERY station (NO-ORPHAN) — 53 stations, none dropped', () => {
    const layout = layoutNetwork(SLD_NETWORK_53);
    expect(SLD_NETWORK_53.stations.length).toBe(53);
    expect(layout.stations.length).toBe(53);
    const placed = new Set(layout.stations.map((s) => s.id));
    for (const s of SLD_NETWORK_53.stations) expect(placed.has(s.id)).toBe(true);
  });

  it('is DETERMINISTIC — same model → bit-identical layout (hash + coordinates)', () => {
    const a = layoutNetwork(SLD_NETWORK_53);
    const b = layoutNetwork(SLD_NETWORK_53);
    expect(a.hash).toBe(b.hash);
    expect(JSON.stringify(a.stations)).toBe(JSON.stringify(b.stations));
    expect(JSON.stringify(a.feeders)).toBe(JSON.stringify(b.feeders));
  });

  it('every feeder connects a placed station to its placed parent (radial tree intact)', () => {
    const layout = layoutNetwork(SLD_NETWORK_53);
    const placed = new Set(layout.stations.map((s) => s.id));
    placed.add('GPZ');
    // one feeder per edge; both endpoints placed.
    expect(layout.feeders.length).toBe(SLD_NETWORK_53.edges.length);
    for (const f of layout.feeders) {
      expect(placed.has(f.from)).toBe(true);
      expect(placed.has(f.to)).toBe(true);
      expect(f.points.length).toBeGreaterThanOrEqual(2);
      // orthogonal: consecutive points share an axis.
      for (let i = 1; i < f.points.length; i++) {
        const [x0, y0] = f.points[i - 1];
        const [x1, y1] = f.points[i];
        expect(x0 === x1 || y0 === y1).toBe(true);
      }
    }
  });

  it('keeps the normally-open sectionalizer as an OPEN feeder (drawn, not a cut)', () => {
    const layout = layoutNetwork(SLD_NETWORK_53);
    const open = layout.feeders.filter((f) => f.open);
    expect(open.length).toBe(1); // exactly one NOP in this network
    // the NOP stub head is still placed (NO-ORPHAN).
    expect(layout.stations.some((s) => s.nopDownstream)).toBe(true);
  });

  it('voltage bands present (110 over 15) and GPZ sits above the trunk row', () => {
    const layout = layoutNetwork(SLD_NETWORK_53);
    const kvs = layout.bands.map((b) => b.kv);
    expect(kvs).toContain(110);
    expect(kvs).toContain(15);
    expect(layout.gpz.y).toBeLessThan(DEFAULT_NETWORK_CONFIG.trunkY); // GPZ above the magistrala
  });

  it('trunk stations share the magistrala row; laterals drop below it', () => {
    const layout = layoutNetwork(SLD_NETWORK_53);
    const trunk = layout.stations.filter((s) => s.kind === 'trunk');
    const lateral = layout.stations.filter((s) => s.kind === 'lateral');
    expect(trunk.length).toBe(12);
    expect(lateral.length).toBe(41);
    for (const t of trunk) expect(t.y).toBe(DEFAULT_NETWORK_CONFIG.trunkY);
    for (const l of lateral) expect(l.y).toBeGreaterThan(DEFAULT_NETWORK_CONFIG.trunkY);
  });
});
