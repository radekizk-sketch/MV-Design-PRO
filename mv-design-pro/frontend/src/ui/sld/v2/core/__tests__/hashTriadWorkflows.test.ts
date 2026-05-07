/**
 * Hash Triad — testy integracji z workflow Phase 0B + 0C.
 *
 * Sprawdzają że hash triad invariants są zachowane przez:
 *   - append_station_on_endpoint workflow (topology + layout zmieniają, view nie)
 *   - conscious_split workflow (topology + layout zmieniają, view nie)
 *   - Anonymization toggle (view zmienia, topology + layout nie)
 *   - LOD switch (view zmienia, topology + layout nie)
 *   - Manual bend route (layout zmienia, topology + view nie)
 *
 * Te testy WIĄŻĄ FSM workflow z hash triad — gwarancja, że frontend
 * snapshotów które idą do backend dispatcher mają deterministyczne
 * triady hashy.
 */
import { describe, expect, it } from 'vitest';

import {
  type LayoutSnapshot,
  type TopologySnapshot,
  type ViewSnapshot,
  DEFAULT_ANONYMIZATION_TOGGLES,
  assertOnlyLayoutHashChanged,
  assertOnlyViewHashChanged,
  assertTopologyAndLayoutChanged,
  computeHashTriad,
} from '../hashes';

const baseTopology: TopologySnapshot = {
  objects: [
    {
      ref: 'gpz-1',
      kind: 'gpz',
      catalogRef: 'src-gpz-15kv-250mva-rx010',
      ports: [{ id: 'gpz-1.out', kind: 'sn_output' }],
    },
    {
      ref: 'seg-1',
      kind: 'overhead_line_sn',
      catalogRef: 'line-base-al-st-70',
    },
  ],
  connections: [
    { fromPortId: 'gpz-1.out', toPortId: 'seg-1.in', kind: 'sn_segment', catalogRef: 'line-base-al-st-70' },
  ],
};

const baseLayout: LayoutSnapshot = {
  routes: [
    {
      id: 'r-seg-1',
      bendPoints: [],
      locked: false,
    },
  ],
  objectPositions: [
    { ref: 'gpz-1', x: 0, y: 0 },
  ],
  labelLocks: [],
};

const baseView: ViewSnapshot = {
  lod: 2,
  viewportScale: 1.0,
  viewportTx: 0,
  viewportTy: 0,
  anonymizationOn: false,
  anonymizationToggles: DEFAULT_ANONYMIZATION_TOGGLES,
  visibleLayers: ['equipment', 'labels'],
};

describe('Hash Triad — append_station_on_endpoint workflow', () => {
  it('Append: nowa Substation + Bay(IN) + Bus nN + TR → topology + layout zmieniają, view NIE', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);

    // Symulacja po append: nowa stacja + 4 nowe obiekty (sub, bay_in, bus_nn, tr)
    const afterTopology: TopologySnapshot = {
      objects: [
        ...baseTopology.objects,
        { ref: 'sub/abc/substation', kind: 'substation', catalogRef: null },
        { ref: 'bay/abc/in', kind: 'bay', catalogRef: null },
        { ref: 'bus/abc/nn', kind: 'bus', catalogRef: null },
        { ref: 'tr/abc/transformer', kind: 'transformer', catalogRef: 'tr-sn-nn-15-04-630kva-dyn11' },
      ],
      connections: [
        ...baseTopology.connections,
        { fromPortId: 'tr/abc/transformer.lv', toPortId: 'bus/abc/nn.in', kind: 'transformer_lv', catalogRef: null },
      ],
    };
    const afterLayout: LayoutSnapshot = {
      routes: baseLayout.routes,
      objectPositions: [
        ...baseLayout.objectPositions,
        { ref: 'sub/abc/substation', x: 200, y: 0 },
      ],
      labelLocks: [],
    };
    const after = computeHashTriad(afterTopology, afterLayout, baseView);

    expect(assertTopologyAndLayoutChanged(before, after)).toBeNull();
    expect(after.viewHash).toBe(before.viewHash); // view nie zmieniony
  });

  it('Append + zmiana LOD jednocześnie → wszystkie 3 hashe zmieniają', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);
    const afterTopology: TopologySnapshot = {
      ...baseTopology,
      objects: [
        ...baseTopology.objects,
        { ref: 'sub/new/substation', kind: 'substation' },
      ],
    };
    const afterLayout: LayoutSnapshot = {
      ...baseLayout,
      objectPositions: [
        ...baseLayout.objectPositions,
        { ref: 'sub/new/substation', x: 300, y: 0 },
      ],
    };
    const afterView: ViewSnapshot = { ...baseView, lod: 3 };
    const after = computeHashTriad(afterTopology, afterLayout, afterView);

    expect(after.topologyHash).not.toBe(before.topologyHash);
    expect(after.layoutHash).not.toBe(before.layoutHash);
    expect(after.viewHash).not.toBe(before.viewHash);
  });
});

describe('Hash Triad — conscious_split workflow', () => {
  it('Split: jeden segment → dwa halves + nowa stacja → topology + layout zmieniają', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);

    // Po split: seg-1 znika, pojawiają się seg-1_a, seg-1_b + nowa stacja
    const afterTopology: TopologySnapshot = {
      objects: [
        baseTopology.objects[0], // gpz-1 zostaje
        { ref: 'seg-1_a', kind: 'overhead_line_sn', catalogRef: 'line-base-al-st-70' },
        { ref: 'seg-1_b', kind: 'overhead_line_sn', catalogRef: 'line-base-al-st-70' },
        { ref: 'sub/inserted/substation', kind: 'substation' },
      ],
      connections: [
        { fromPortId: 'gpz-1.out', toPortId: 'seg-1_a.in', kind: 'sn_segment', catalogRef: 'line-base-al-st-70' },
        { fromPortId: 'seg-1_a.out', toPortId: 'sub/inserted/substation.in', kind: 'sn_segment', catalogRef: null },
        { fromPortId: 'sub/inserted/substation.out', toPortId: 'seg-1_b.in', kind: 'sn_segment', catalogRef: null },
      ],
    };
    const afterLayout: LayoutSnapshot = {
      routes: [
        { id: 'r-seg-1_a', bendPoints: [], locked: false },
        { id: 'r-seg-1_b', bendPoints: [], locked: false },
      ],
      objectPositions: [
        ...baseLayout.objectPositions,
        { ref: 'sub/inserted/substation', x: 50, y: 0 },
      ],
      labelLocks: [],
    };
    const after = computeHashTriad(afterTopology, afterLayout, baseView);

    expect(assertTopologyAndLayoutChanged(before, after)).toBeNull();
    expect(after.viewHash).toBe(before.viewHash);
  });
});

describe('Hash Triad — anonymization workflow', () => {
  it('Toggle anonimizacji on → tylko view_hash', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);
    const after = computeHashTriad(baseTopology, baseLayout, {
      ...baseView,
      anonymizationOn: true,
    });
    expect(assertOnlyViewHashChanged(before, after)).toBeNull();
  });

  it('Toggle 6 sub-toggles po kolei → tylko view_hash zmienia', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);
    const subToggles: (keyof typeof DEFAULT_ANONYMIZATION_TOGGLES)[] = [
      'hideNames', 'hideAddresses', 'hideCadastral', 'hidePower', 'hideResults', 'preserveTypes',
    ];
    for (const toggle of subToggles) {
      const after = computeHashTriad(baseTopology, baseLayout, {
        ...baseView,
        anonymizationOn: true,
        anonymizationToggles: {
          ...DEFAULT_ANONYMIZATION_TOGGLES,
          [toggle]: !DEFAULT_ANONYMIZATION_TOGGLES[toggle],
        },
      });
      expect(assertOnlyViewHashChanged(before, after)).toBeNull();
    }
  });
});

describe('Hash Triad — LOD switch workflow', () => {
  it('LOD 0 → 1 → 2 → 3 → 4: każda zmiana → tylko view_hash', () => {
    let prev = computeHashTriad(baseTopology, baseLayout, { ...baseView, lod: 0 });
    for (const lod of [1, 2, 3, 4]) {
      const next = computeHashTriad(baseTopology, baseLayout, { ...baseView, lod });
      expect(assertOnlyViewHashChanged(prev, next)).toBeNull();
      prev = next;
    }
  });

  it('Bouncing LOD 0↔1 ×5 → topology + layout invariant; view oscyluje', () => {
    const lod0 = computeHashTriad(baseTopology, baseLayout, { ...baseView, lod: 0 });
    const lod1 = computeHashTriad(baseTopology, baseLayout, { ...baseView, lod: 1 });
    expect(lod0.topologyHash).toBe(lod1.topologyHash);
    expect(lod0.layoutHash).toBe(lod1.layoutHash);
    expect(lod0.viewHash).not.toBe(lod1.viewHash);

    // Idempotentne — drugi switch z lod0 daje ten sam hash
    const lod0Again = computeHashTriad(baseTopology, baseLayout, { ...baseView, lod: 0 });
    expect(lod0Again).toEqual(lod0);
  });
});

describe('Hash Triad — manual route bend workflow', () => {
  it('Add bend → tylko layout_hash zmienia', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);
    const afterLayout: LayoutSnapshot = {
      ...baseLayout,
      routes: [
        { ...baseLayout.routes[0], bendPoints: [{ x: 50, y: 25 }] },
      ],
    };
    const after = computeHashTriad(baseTopology, afterLayout, baseView);
    expect(assertOnlyLayoutHashChanged(before, after)).toBeNull();
  });

  it('Lock route → tylko layout_hash zmienia', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);
    const afterLayout: LayoutSnapshot = {
      ...baseLayout,
      routes: [{ ...baseLayout.routes[0], locked: true }],
    };
    const after = computeHashTriad(baseTopology, afterLayout, baseView);
    expect(assertOnlyLayoutHashChanged(before, after)).toBeNull();
  });

  it('Multiple bends w sekwencji → każdy etap zmienia tylko layout', () => {
    let prevLayout = baseLayout;
    let prev = computeHashTriad(baseTopology, prevLayout, baseView);
    const bendSequence = [
      { x: 30, y: 10 },
      { x: 50, y: 25 },
      { x: 70, y: 10 },
    ];
    for (const bend of bendSequence) {
      const nextLayout: LayoutSnapshot = {
        ...prevLayout,
        routes: [
          {
            ...prevLayout.routes[0],
            bendPoints: [...prevLayout.routes[0].bendPoints, bend],
          },
        ],
      };
      const next = computeHashTriad(baseTopology, nextLayout, baseView);
      expect(assertOnlyLayoutHashChanged(prev, next)).toBeNull();
      prevLayout = nextLayout;
      prev = next;
    }
  });
});

describe('Hash Triad — composability invariants', () => {
  it('Append + LOD switch + anonymization równocześnie → wszystkie 3 hashe zmieniają', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);
    const afterTopology: TopologySnapshot = {
      ...baseTopology,
      objects: [...baseTopology.objects, { ref: 'sub/new', kind: 'substation' }],
    };
    const afterLayout: LayoutSnapshot = {
      ...baseLayout,
      objectPositions: [...baseLayout.objectPositions, { ref: 'sub/new', x: 200, y: 0 }],
    };
    const afterView: ViewSnapshot = {
      ...baseView,
      lod: 4,
      anonymizationOn: true,
    };
    const after = computeHashTriad(afterTopology, afterLayout, afterView);
    expect(after.topologyHash).not.toBe(before.topologyHash);
    expect(after.layoutHash).not.toBe(before.layoutHash);
    expect(after.viewHash).not.toBe(before.viewHash);
  });

  it('Wielokrotne computeHashTriad z tymi samymi inputami → ten sam triad', () => {
    const t1 = computeHashTriad(baseTopology, baseLayout, baseView);
    for (let i = 0; i < 10; i++) {
      const t2 = computeHashTriad(baseTopology, baseLayout, baseView);
      expect(t2).toEqual(t1);
    }
  });
});
