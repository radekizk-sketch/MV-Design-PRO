/**
 * topologyTree — unit tests on the tree extraction (root/trunk/laterals), on the real
 * >=52-station substrate (via the canonical reader bridge).
 */

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import {
  BranchKind,
  readTopologyFromENM,
  StationKind,
  type TopologyInputV1,
} from '../../../ui/sld/core/topologyInputReader';
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
    // ZMIANA KANONU (SUB-52s, 2026-09-04): this used to read the shared substrate, whose NOP
    // switch used to be the SOLE path to one station — a topologically stranded fragment,
    // which is a defect (ENMValidator E003), not a fixture feature (see
    // sld_substrate_52s.py step 5d — that lateral is now ring-tied to an adjacent feeder, so
    // no substrate station depends on a switch as its ONLY path any more). INTENCJA
    // PRESERVED: verify buildTopologyTree still traverses an in-service BUS_LINK branch to
    // place a station tapped behind ONLY a switch (else a tapped station islands) — exercised
    // here on a small, dedicated 3-station fixture built for exactly that purpose, decoupled
    // from the substrate's own topology contract.
    const minimal: TopologyInputV1 = {
      snapshotId: 'test-switch-tap',
      snapshotFingerprint: 'test-switch-tap',
      connectionNodes: [
        { id: 'bus-gpz', name: 'GPZ', voltageKv: 15, stationId: 'stn-gpz', busIndex: 0, inService: true },
        { id: 'bus-a', name: 'A', voltageKv: 15, stationId: 'stn-a', busIndex: 0, inService: true },
        { id: 'bus-b', name: 'B', voltageKv: 15, stationId: 'stn-b', busIndex: 0, inService: true },
      ],
      branches: [
        {
          id: 'br-gpz-a', name: 'GPZ-A', fromNodeId: 'bus-gpz', toNodeId: 'bus-a',
          kind: BranchKind.CABLE, isNormallyOpen: false, inService: true,
          catalogRef: null, lengthKm: 0.2, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null,
        },
        {
          id: 'sw-a-b', name: 'Lacznik A-B', fromNodeId: 'bus-a', toNodeId: 'bus-b',
          kind: BranchKind.BUS_LINK, isNormallyOpen: false, inService: true,
          catalogRef: null, lengthKm: null, ratedPowerMva: null, voltageHvKv: null, voltageLvKv: null,
        },
      ],
      devices: [],
      stations: [
        { id: 'stn-gpz', name: 'GPZ', stationType: StationKind.MAIN_SUBSTATION, voltageKv: 15, busIds: ['bus-gpz'], branchIds: [], switchIds: [], transformerIds: [] },
        { id: 'stn-a', name: 'A', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus-a'], branchIds: [], switchIds: [], transformerIds: [] },
        { id: 'stn-b', name: 'B (tapped only via switch)', stationType: StationKind.DISTRIBUTION, voltageKv: 15, busIds: ['bus-b'], branchIds: [], switchIds: [], transformerIds: [] },
      ],
      generators: [],
      sources: [{ id: 'src-gpz', name: 'Zrodlo', nodeId: 'bus-gpz', inService: true }],
      loads: [],
      protectionBindings: [],
      fixActions: [],
    };
    const minimalTree = buildTopologyTree(minimal);
    expect(minimalTree.stationCount, 'fixture: switch places the tapped station').toBe(3);

    const withoutSwitchLinks: TopologyInputV1 = {
      ...minimal,
      branches: minimal.branches.map((b) =>
        b.kind === BranchKind.BUS_LINK ? { ...b, inService: false } : b,
      ),
    };
    const reduced = buildTopologyTree(withoutSwitchLinks);
    expect(reduced.stationCount).toBeLessThan(minimalTree.stationCount);
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
