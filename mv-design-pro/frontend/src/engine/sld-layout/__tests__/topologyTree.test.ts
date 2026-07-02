/**
 * topologyTree — unit tests on the tree extraction (root/trunk/laterals), on the real
 * >=52-station substrate (via the canonical reader bridge).
 */

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { BranchKind, readTopologyFromENM, type TopologyInputV1 } from '../../../ui/sld/core/topologyInputReader';
import { buildTopologyTree } from '../topologyTree';
import fixture from '../../../ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json';

const enm = (fixture as { enm: unknown }).enm as EnergyNetworkModel;
const snapshot = readTopologyFromENM(enm, 'substrate');

describe('buildTopologyTree on substrate', () => {
  const tree = buildTopologyTree(snapshot);

  it('roots at the GPZ (source-owning substation)', () => {
    expect(tree.rootRef).toBeTruthy();
    expect(tree.rootRef).toContain('/substation'); // GPZ ref pattern
    // GPZ owns the single source bus
    const src = snapshot.sources[0];
    expect(src).toBeDefined();
    // root rank is 0
    expect(tree.nodes.get(tree.rootRef!)?.rank).toBe(0);
  });

  it('reaches every real station (full connectivity)', () => {
    expect(tree.stationCount).toBe(snapshot.stations.length);
    expect(tree.stationCount).toBeGreaterThanOrEqual(52);
  });

  it('INVARIANT: no real station left in a separate unreachable component', () => {
    const placed = new Set(
      [...tree.nodes.values()].filter((n) => n.isStation).map((n) => n.ref),
    );
    const unreachable = snapshot.stations.map((s) => s.id).filter((id) => !placed.has(id));
    expect(unreachable, `unreachable real stations: ${JSON.stringify(unreachable)}`).toEqual([]);
  });

  it('conducts connectivity through a switch link (else a tapped station islands)', () => {
    // A station can hang off the spine behind a switch (e.g. a normally-open reserve tie) with
    // no other cable feed. The layout tree is a DRAWING skeleton, so it traverses in-service
    // switch links to place that station — the switch is still drawn open; energization is the
    // solver's job. Proof: take the switch links out of service and >=1 real station drops out.
    expect(
      snapshot.branches.some((b) => b.kind === BranchKind.BUS_LINK && b.inService),
      'substrate models an in-service switch link',
    ).toBe(true);
    const withoutSwitchLinks: TopologyInputV1 = {
      ...snapshot,
      branches: snapshot.branches.map((b) =>
        b.kind === BranchKind.BUS_LINK ? { ...b, inService: false } : b,
      ),
    };
    const reduced = buildTopologyTree(withoutSwitchLinks);
    expect(reduced.stationCount).toBeLessThan(tree.stationCount);
  });

  it('identifies a magistrala (trunk) as a path from the root', () => {
    expect(tree.trunkRefs.length).toBeGreaterThan(1);
    // trunk is a contiguous parent-chain from the root
    expect(tree.trunkRefs[0]).toBe(tree.rootRef);
    for (let i = 1; i < tree.trunkRefs.length; i += 1) {
      const node = tree.nodes.get(tree.trunkRefs[i]);
      expect(node?.onTrunk).toBe(true);
      // each trunk station's rank strictly increases along the spine
      expect(node?.rank).toBe(i);
    }
  });

  it('has lateral (off-trunk) stations branching from the trunk', () => {
    const laterals = [...tree.nodes.values()].filter((n) => n.isStation && !n.onTrunk);
    expect(laterals.length).toBeGreaterThan(0);
    // every lateral has a parent in the tree
    for (const l of laterals) {
      expect(l.parent).toBeTruthy();
    }
  });

  it('records a parent branch (cable/line) for non-root nodes where available', () => {
    // at least the trunk stations have a parent segment
    let withBranch = 0;
    for (const ref of tree.trunkRefs.slice(1)) {
      if (tree.parentBranch.has(ref)) withBranch += 1;
    }
    expect(withBranch).toBeGreaterThan(0);
  });

  it('is deterministic (same snapshot -> identical tree)', () => {
    const a = buildTopologyTree(snapshot);
    const b = buildTopologyTree(readTopologyFromENM(enm, 'substrate'));
    expect(a.rootRef).toBe(b.rootRef);
    expect(a.trunkRefs).toEqual(b.trunkRefs);
    expect(a.stationCount).toBe(b.stationCount);
    const serial = (t: typeof a) =>
      [...t.nodes.values()]
        .map((n) => `${n.ref}|${n.parent}|${n.rank}|${n.onTrunk}|${n.isStation}`)
        .sort()
        .join('\n');
    expect(serial(a)).toBe(serial(b));
  });
});
