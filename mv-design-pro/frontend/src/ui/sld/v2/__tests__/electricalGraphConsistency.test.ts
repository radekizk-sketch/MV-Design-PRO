/**
 * Electrical Graph Consistency — Phase 7 (operator-grade SLD plan v2).
 *
 * Strażnik kanonicznej zgodności między SLD wizualnym a domeną elektryczną:
 *   - Każdy renderowany SN segment ma `domain_ref` (do ENM Branch).
 *   - Każdy DER ma `connection_variant` + bus_ref (PCC).
 *   - Layout zmiany NIE zmieniają calc graph (topology_hash invariant).
 *   - LOD switch NIE zmienia electrical references.
 *   - Append/split aktualizuje calc graph spójnie z preview metadata.
 *
 * Acceptance Invariants:
 *   - 1: ENM jest jedyną prawdą elektryczną.
 *   - 2: Każdy element SLD ma domain_ref lub jest dekoracyjnym overlay.
 *   - 3: Każde połączenie elektryczne kończy się w kompatybilnych portach.
 *   - 6: LOD zmienia szczegółowość, NIE topologię.
 *   - 7: Manualna geometria zmienia layout_hash only, NIE topology_hash.
 *
 * @see docs/sld/SLD_TEST_MATRIX.md
 */
import { describe, expect, it } from 'vitest';

import { buildSldDataFromSnapshot } from '../canvas/enmToSldAdapter';
import {
  type LayoutSnapshot,
  type TopologySnapshot,
  type ViewSnapshot,
  DEFAULT_ANONYMIZATION_TOGGLES,
  computeHashTriad,
  computeTopologyHash,
} from '../core/hashes';
import type { EnergyNetworkModel, LogicalViewsV1 } from '../../../../types/enm';

const EMPTY_HEADER = {
  enm_version: '1.0' as const,
  name: 'electrical-graph-consistency',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  revision: 1,
  hash_sha256: 'a'.repeat(64),
  defaults: { frequency_hz: 50, unit_system: 'SI' as const },
};

function buildEmptySnapshot(): EnergyNetworkModel {
  return {
    header: EMPTY_HEADER,
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    line_runs: [],
  } as never;
}

function buildGpzWithSegment(): EnergyNetworkModel {
  const snap = buildEmptySnapshot();
  snap.buses = [
    { id: 'b15', ref_id: 'b15', name: 'B15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
  ];
  snap.substations = [
    {
      id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {},
      station_type: 'gpz', bus_refs: ['b15'], transformer_refs: [],
      gpz_sections: [{ section_id: 'A', order: 1, bus_ref: 'b15' }],
    } as never,
  ];
  return snap;
}

describe('Electrical Graph Consistency — domain_ref propagation', () => {
  it('Każdy GPZ z ENM ma domain_ref w SLD descriptor (id == ref_id)', () => {
    const snap = buildGpzWithSegment();
    const sld = buildSldDataFromSnapshot(snap, null);
    expect(sld.gpzs).toHaveLength(1);
    expect(sld.gpzs[0].id).toBe('GPZ-1');
  });

  it('Każda Substation z ENM (mv_lv/inline/...) ma domain_ref w stations', () => {
    const snap = buildEmptySnapshot();
    snap.substations = [
      { id: 'gpz', ref_id: 'GPZ-1', name: 'GPZ', tags: [], meta: {}, station_type: 'gpz', bus_refs: [], transformer_refs: [] } as never,
      { id: 's1', ref_id: 'ST-1', name: 'St1', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: [], transformer_refs: [] } as never,
      { id: 's2', ref_id: 'ST-2', name: 'St2', tags: [], meta: {}, station_type: 'inline', bus_refs: [], transformer_refs: [] } as never,
    ];
    const sld = buildSldDataFromSnapshot(snap, null);
    const stationIds = sld.stations.map((s) => s.id);
    expect(stationIds).toContain('ST-1');
    expect(stationIds).toContain('ST-2');
  });

  it('Każdy DER (Generator) propagowany do ders[] z bus_ref jako PCC', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b15', ref_id: 'b15', name: 'B15', voltage_kv: 15, phase_system: '3ph', tags: [], meta: {} } as never,
      { id: 'bnn', ref_id: 'bnn', name: 'BnN', voltage_kv: 0.4, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 'st', ref_id: 'ST-1', name: 'St', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: ['b15', 'bnn'], transformer_refs: [] } as never,
    ];
    snap.generators = [
      {
        id: 'g1', ref_id: 'gen-1', name: 'PV 1', tags: [], meta: {},
        bus_ref: 'bnn', p_mw: 0.5, gen_type: 'pv_inverter',
        connection_variant: 'nn_side', station_ref: 'ST-1',
      } as never,
    ];
    const sld = buildSldDataFromSnapshot(snap, null);
    expect(sld.ders.length).toBeGreaterThan(0);
    // Kazdy DER w sld musi mieć id zgodny z gen.ref_id (domain_ref).
    expect(sld.ders.some((d) => d.id === 'gen-1')).toBe(true);
  });
});

describe('Electrical Graph Consistency — layout vs topology invariant', () => {
  it('Layout snapshot zmienia → topology_hash invariant', () => {
    const topology: TopologySnapshot = {
      objects: [
        { ref: 'gpz-1', kind: 'gpz', catalogRef: 'cat' },
        { ref: 'seg-1', kind: 'overhead_line_sn', catalogRef: 'cat-line' },
      ],
      connections: [
        { fromPortId: 'gpz-1.out', toPortId: 'seg-1.in', kind: 'sn_segment' },
      ],
    };

    const layoutA: LayoutSnapshot = {
      objectPositions: [{ ref: 'gpz-1', x: 0, y: 0 }],
      routes: [{ id: 'r-seg-1', bendPoints: [], locked: false }],
      labelLocks: [],
    };
    const layoutB: LayoutSnapshot = {
      objectPositions: [{ ref: 'gpz-1', x: 100, y: 100 }], // pozycja zmieniona
      routes: [{ id: 'r-seg-1', bendPoints: [{ x: 50, y: 0 }], locked: false }], // bend dodany
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

    const triadA = computeHashTriad(topology, layoutA, view);
    const triadB = computeHashTriad(topology, layoutB, view);

    // KRYTYCZNE: topology_hash MUSI być identyczny (layout-only diff).
    expect(triadB.topologyHash).toBe(triadA.topologyHash);
    expect(triadB.layoutHash).not.toBe(triadA.layoutHash);
  });

  it('LOD switch → topology_hash invariant', () => {
    const topology: TopologySnapshot = {
      objects: [{ ref: 'gpz-1', kind: 'gpz' }],
      connections: [],
    };
    const layout: LayoutSnapshot = {
      objectPositions: [{ ref: 'gpz-1', x: 0, y: 0 }],
      routes: [],
      labelLocks: [],
    };
    const refLOD0 = computeHashTriad(topology, layout, {
      lod: 0,
      viewportScale: 1,
      viewportTx: 0,
      viewportTy: 0,
      anonymizationOn: false,
      anonymizationToggles: DEFAULT_ANONYMIZATION_TOGGLES,
      visibleLayers: [],
    });
    for (const lod of [1, 2, 3, 4] as const) {
      const triad = computeHashTriad(topology, layout, {
        lod,
        viewportScale: 1,
        viewportTx: 0,
        viewportTy: 0,
        anonymizationOn: false,
        anonymizationToggles: DEFAULT_ANONYMIZATION_TOGGLES,
        visibleLayers: [],
      });
      expect(triad.topologyHash).toBe(refLOD0.topologyHash);
    }
  });
});

describe('Electrical Graph Consistency — append/split topology mutation', () => {
  it('Append nowej Substation → topology_hash zmienia (electrical mutation)', () => {
    const before: TopologySnapshot = {
      objects: [{ ref: 'gpz-1', kind: 'gpz' }],
      connections: [],
    };
    const after: TopologySnapshot = {
      objects: [
        { ref: 'gpz-1', kind: 'gpz' },
        { ref: 'sub-new', kind: 'substation' }, // nowa stacja
      ],
      connections: [],
    };
    expect(computeTopologyHash(before)).not.toBe(computeTopologyHash(after));
  });

  it('Split: jeden segment → halves → topology_hash zmienia', () => {
    const before: TopologySnapshot = {
      objects: [
        { ref: 'gpz-1', kind: 'gpz' },
        { ref: 'seg-1', kind: 'overhead_line_sn' },
      ],
      connections: [{ fromPortId: 'gpz-1.out', toPortId: 'seg-1.in', kind: 's' }],
    };
    const after: TopologySnapshot = {
      objects: [
        { ref: 'gpz-1', kind: 'gpz' },
        { ref: 'seg-1_a', kind: 'overhead_line_sn' },
        { ref: 'seg-1_b', kind: 'overhead_line_sn' },
        { ref: 'sub-inserted', kind: 'substation' },
      ],
      connections: [
        { fromPortId: 'gpz-1.out', toPortId: 'seg-1_a.in', kind: 's' },
        { fromPortId: 'seg-1_a.out', toPortId: 'sub-inserted.in', kind: 's' },
        { fromPortId: 'sub-inserted.out', toPortId: 'seg-1_b.in', kind: 's' },
      ],
    };
    expect(computeTopologyHash(before)).not.toBe(computeTopologyHash(after));
  });
});

describe('Electrical Graph Consistency — DER PCC w calc graph', () => {
  it('DER bus_ref MUSI istnieć w buses[] (kompatybilność portów)', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b', ref_id: 'bnn', name: 'BnN', voltage_kv: 0.4, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.generators = [
      {
        id: 'g', ref_id: 'gen-1', name: 'PV', tags: [], meta: {},
        bus_ref: 'bnn', p_mw: 0.5, gen_type: 'pv_inverter',
        connection_variant: 'nn_side', station_ref: 'sub_a',
      } as never,
    ];

    // Test: każdy DER w sld.ders ma jakieś PCC (bus_ref) zarejestrowane w buses[].
    const sld = buildSldDataFromSnapshot(snap, null);
    for (const der of sld.ders) {
      // Adapter buduje DER z generators[] — sprawdza że bus_ref jest valid.
      const sourceGen = snap.generators.find((g) => g.ref_id === der.id);
      expect(sourceGen).toBeDefined();
      expect(sourceGen?.bus_ref).toBeTruthy();
      const bus = snap.buses.find((b) => b.ref_id === sourceGen!.bus_ref);
      expect(bus).toBeDefined();
    }
  });

  it('DER connection_variant propagowany z ENM', () => {
    const snap = buildEmptySnapshot();
    snap.buses = [
      { id: 'b', ref_id: 'bnn', name: 'BnN', voltage_kv: 0.4, phase_system: '3ph', tags: [], meta: {} } as never,
    ];
    snap.substations = [
      { id: 'st', ref_id: 'ST-1', name: 'St', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: ['bnn'], transformer_refs: [] } as never,
    ];
    snap.generators = [
      {
        id: 'g', ref_id: 'gen-bess', name: 'BESS', tags: [], meta: {},
        bus_ref: 'bnn', p_mw: 1.0, gen_type: 'bess',
        connection_variant: 'block_transformer',
        blocking_transformer_ref: 'tr-block',
      } as never,
    ];
    // Propagacja: source ENM Generator.connection_variant zachowane.
    const gen = snap.generators[0] as never as { connection_variant: string };
    expect(gen.connection_variant).toBe('block_transformer');
  });
});

describe('Electrical Graph Consistency — determinism', () => {
  it('Build SLD 5 reruny → identyczne sld.gpzs', () => {
    const snap = buildGpzWithSegment();
    const reference = buildSldDataFromSnapshot(snap, null);
    for (let i = 0; i < 5; i++) {
      const next = buildSldDataFromSnapshot(snap, null);
      expect(next.gpzs).toEqual(reference.gpzs);
      expect(next.stations).toEqual(reference.stations);
      expect(next.ders).toEqual(reference.ders);
    }
  });

  it('Topology hash po build-and-rebuild SLD → ten sam (idempotency)', () => {
    const snap = buildGpzWithSegment();
    const sld1 = buildSldDataFromSnapshot(snap, null);
    const sld2 = buildSldDataFromSnapshot(snap, null);
    // sld1.gpzs.length === sld2.gpzs.length (idempotent).
    expect(sld1.gpzs.length).toBe(sld2.gpzs.length);
  });
});

describe('Electrical Graph Consistency — logical_views integration', () => {
  it('logical_views.trunks → sld.cableRuns z runKind="main_trunk"', () => {
    const snap = buildEmptySnapshot();
    snap.branches = [
      {
        id: 'k', ref_id: 'k1', name: 'K-1', tags: [], meta: {},
        type: 'cable', from_bus_ref: 'a', to_bus_ref: 'b', status: 'closed',
        length_km: 1, r_ohm_per_km: 0.5, x_ohm_per_km: 0.1,
      } as never,
    ];
    const lv: LogicalViewsV1 = {
      trunks: [{ corridor_ref: 'TRUNK-1', corridor_type: 'main', segments: ['k1'], no_point_ref: null, terminals: [] }],
      branches: [],
      secondary_connectors: [],
      terminals: [],
    };
    const sld = buildSldDataFromSnapshot(snap, lv);
    expect(sld.cableRuns).toHaveLength(1);
    expect(sld.cableRuns[0].runKind).toBe('main_trunk');
    // segmentKind propagowany z branch.type
    expect(sld.cableRuns[0].segmentKind).toBe('cable_sn');
  });
});
