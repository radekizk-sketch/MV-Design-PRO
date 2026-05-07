/**
 * Phase 0A — Hash Triad invariants.
 *
 * Acceptance Invariants 6-8: zmiana LOD/anonimizacji → tylko view_hash;
 * route bend → tylko layout_hash; append station → topology + layout.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ANONYMIZATION_TOGGLES,
  assertOnlyLayoutHashChanged,
  assertOnlyViewHashChanged,
  assertTopologyAndLayoutChanged,
  computeHashTriad,
  computeLayoutHash,
  computeTopologyHash,
  computeViewHash,
  type HashTriad,
  type LayoutSnapshot,
  type TopologySnapshot,
  type ViewSnapshot,
} from '../hashes';

const baseTopology: TopologySnapshot = {
  objects: [
    {
      ref: 'sub-1',
      kind: 'substation',
      catalogRef: 'cat-mv-lv-rmu-3-bay',
      ports: [{ id: 'port-input-1', kind: 'sn_input' }],
    },
    {
      ref: 'bay-1',
      kind: 'bay',
      catalogRef: 'cat-rmu-line-bay',
      switchingState: 'closed',
    },
  ],
  connections: [{ fromPortId: 'port-input-1', toPortId: 'port-output-2', kind: 'cable_sn' }],
};

const baseLayout: LayoutSnapshot = {
  objectPositions: [
    { ref: 'sub-1', x: 100, y: 200 },
    { ref: 'bay-1', x: 100, y: 240 },
  ],
  routes: [
    { id: 'r1', bendPoints: [{ x: 100, y: 220 }], locked: false },
  ],
  labelLocks: [{ ref: 'sub-1', locked: false }],
};

const baseView: ViewSnapshot = {
  lod: 1,
  viewportScale: 1.0,
  viewportTx: 0,
  viewportTy: 0,
  anonymizationOn: false,
  anonymizationToggles: DEFAULT_ANONYMIZATION_TOGGLES,
  visibleLayers: ['equipment', 'topology'],
};

function triad(
  topology: TopologySnapshot = baseTopology,
  layout: LayoutSnapshot = baseLayout,
  view: ViewSnapshot = baseView,
): HashTriad {
  return computeHashTriad(topology, layout, view);
}

describe('Hash Triad — determinizm', () => {
  it('ten sam input daje ten sam hash', () => {
    const t1 = triad();
    const t2 = triad();
    expect(t1).toEqual(t2);
  });

  it('hashe mają prefiksy top_/lay_/vie_', () => {
    const t = triad();
    expect(t.topologyHash).toMatch(/^top_[0-9a-f]{8}$/);
    expect(t.layoutHash).toMatch(/^lay_[0-9a-f]{8}$/);
    expect(t.viewHash).toMatch(/^vie_[0-9a-f]{8}$/);
  });

  it('inny porządek wejściowy nie zmienia hasha (sortowanie kanoniczne)', () => {
    const reordered: TopologySnapshot = {
      objects: [
        baseTopology.objects[1],
        baseTopology.objects[0],
      ],
      connections: baseTopology.connections,
    };
    expect(computeTopologyHash(reordered)).toBe(computeTopologyHash(baseTopology));
  });
});

describe('Hash Triad — invariant: LOD switch zmienia tylko view_hash', () => {
  it('zmiana LOD → topology i layout niezmienione, view zmieniony', () => {
    const before = triad();
    const after = triad(baseTopology, baseLayout, { ...baseView, lod: 3 });
    expect(assertOnlyViewHashChanged(before, after)).toBeNull();
  });

  it('zmiana viewport scale → tylko view_hash', () => {
    const before = triad();
    const after = triad(baseTopology, baseLayout, { ...baseView, viewportScale: 0.5 });
    expect(assertOnlyViewHashChanged(before, after)).toBeNull();
  });

  it('toggle anonimizacji → tylko view_hash', () => {
    const before = triad();
    const after = triad(baseTopology, baseLayout, {
      ...baseView,
      anonymizationOn: true,
      anonymizationToggles: { ...DEFAULT_ANONYMIZATION_TOGGLES, hideNames: true },
    });
    expect(assertOnlyViewHashChanged(before, after)).toBeNull();
  });
});

describe('Hash Triad — invariant: manual bend zmienia tylko layout_hash', () => {
  it('dodanie bend → topology niezmieniony, layout zmieniony', () => {
    const before = triad();
    const after = triad(baseTopology, {
      ...baseLayout,
      routes: [{ id: 'r1', bendPoints: [{ x: 100, y: 215 }, { x: 130, y: 220 }], locked: false }],
    });
    expect(assertOnlyLayoutHashChanged(before, after)).toBeNull();
  });

  it('lock route → topology niezmieniony, layout zmieniony', () => {
    const before = triad();
    const after = triad(baseTopology, {
      ...baseLayout,
      routes: [{ id: 'r1', bendPoints: [{ x: 100, y: 220 }], locked: true }],
    });
    expect(assertOnlyLayoutHashChanged(before, after)).toBeNull();
  });
});

describe('Hash Triad — invariant: append station zmienia topology + layout', () => {
  it('append nowej stacji → topology i layout zmieniają się', () => {
    const before = triad();
    const newTopology: TopologySnapshot = {
      objects: [
        ...baseTopology.objects,
        { ref: 'sub-2', kind: 'substation', catalogRef: 'cat-rmu-2', ports: [] },
      ],
      connections: baseTopology.connections,
    };
    const newLayout: LayoutSnapshot = {
      ...baseLayout,
      objectPositions: [...baseLayout.objectPositions, { ref: 'sub-2', x: 300, y: 200 }],
    };
    const after = triad(newTopology, newLayout);
    expect(assertTopologyAndLayoutChanged(before, after)).toBeNull();
  });
});

describe('Hash Triad — coordinates quantization', () => {
  it('subpixelowy szum (≤0.005) nie zmienia layout_hash', () => {
    const h1 = computeLayoutHash(baseLayout);
    const h2 = computeLayoutHash({
      ...baseLayout,
      objectPositions: [
        { ref: 'sub-1', x: 100.001, y: 200.001 },
        { ref: 'bay-1', x: 100.001, y: 240.001 },
      ],
    });
    expect(h2).toBe(h1);
  });

  it('różnica ≥ 0.01px zmienia layout_hash', () => {
    const h1 = computeLayoutHash(baseLayout);
    const h2 = computeLayoutHash({
      ...baseLayout,
      objectPositions: [
        { ref: 'sub-1', x: 100.5, y: 200 },
        { ref: 'bay-1', x: 100, y: 240 },
      ],
    });
    expect(h2).not.toBe(h1);
  });
});

describe('Hash Triad — view hash dependency', () => {
  it('warstwy widoczności wchodzą do view_hash niezależnie od kolejności', () => {
    const v1 = computeViewHash({ ...baseView, visibleLayers: ['a', 'b', 'c'] });
    const v2 = computeViewHash({ ...baseView, visibleLayers: ['c', 'a', 'b'] });
    expect(v1).toBe(v2);
  });

  it('różne anonymization toggles dają różne view_hash', () => {
    const v1 = computeViewHash(baseView);
    const v2 = computeViewHash({
      ...baseView,
      anonymizationToggles: { ...DEFAULT_ANONYMIZATION_TOGGLES, hidePower: true },
    });
    expect(v1).not.toBe(v2);
  });
});
