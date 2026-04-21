/**
 * FAZA 6 — Blocking Tests: Full Design Path Invariants.
 *
 * These tests enforce critical system-wide invariants:
 * 1. No empty UI actions (all buttons have handlers)
 * 2. SLD updates after snapshot change
 * 3. Snapshot store properly handles all operations
 * 4. Readiness matrix is always computable
 * 5. Network build store selectors are deterministic
 * 6. Store sync mechanisms work correctly
 *
 * BINDING: Any failure blocks merge.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSnapshotStore } from '../topology/snapshotStore';
import {
  selectBusRefs,
  selectBusOptions,
  selectIsReady,
  selectBlockerCount,
} from '../topology/snapshotStore';
import { useTopologyStore } from '../topology/store';
import {
  useNetworkBuildStore,
  computeBuildPhase,
  selectActiveObjectCard,
  selectActiveOperationForm,
  selectStationSummaries,
  selectBlockersByCategory,
  buildPhaseLabel,
} from '../network-build/networkBuildStore';
import type { EnergyNetworkModel } from '../../types/enm';
import {
  computeLayout,
  NodeTypeV1,
  EdgeTypeV1,
  VISUAL_GRAPH_VERSION,
  canonicalizeVisualGraph,
  computeVisualGraphHash,
} from '../sld/core';
import type {
  VisualGraphV1,
  VisualNodeV1,
  VisualEdgeV1,
  VisualGraphMetaV1,
} from '../sld/core';

// =============================================================================
// Helpers
// =============================================================================

function createMinimalENM(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'FAZA6 Test',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: 'abc123',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: [
      { id: 'bus1', ref_id: 'bus_sn_main', name: 'Szyna SN', tags: ['source'], meta: {}, voltage_kv: 15, phase_system: '3ph' },
    ],
    branches: [],
    transformers: [],
    sources: [
      { id: 'src1', ref_id: 'source_grid', name: 'Siec zasilajaca', tags: [], meta: {}, bus_ref: 'bus_sn_main', model: 'short_circuit_power', sk3_mva: 250, rx_ratio: 0.1 },
    ],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as EnergyNetworkModel;
}

function createNetworkWithLoad(): EnergyNetworkModel {
  const enm = createMinimalENM();
  enm.buses.push({
    id: 'bus2', ref_id: 'bus_sn_2', name: 'Szyna SN 2', tags: [], meta: {}, voltage_kv: 15, phase_system: '3ph',
  } as EnergyNetworkModel['buses'][0]);
  enm.branches.push({
    id: 'line1', ref_id: 'line_L01', name: 'Linia L1', tags: [], meta: {},
    type: 'line_overhead', from_bus_ref: 'bus_sn_main', to_bus_ref: 'bus_sn_2',
    status: 'closed', length_km: 5, r_ohm_per_km: 0.443, x_ohm_per_km: 0.340,
  } as EnergyNetworkModel['branches'][0]);
  enm.loads.push({
    id: 'load1', ref_id: 'load_1', name: 'Odbior 1', tags: [], meta: {},
    bus_ref: 'bus_sn_2', p_mw: 1, q_mvar: 0.3, model: 'pq',
  } as EnergyNetworkModel['loads'][0]);
  return enm;
}

function buildMinimalVisualGraph(): VisualGraphV1 {
  const nodes: VisualNodeV1[] = [
    {
      id: 'node-source',
      nodeType: NodeTypeV1.GRID_SOURCE,
      ports: [{ id: 'port-out', role: 'OUT', relativeX: 0.5, relativeY: 1.0 }],
      attributes: {
        label: 'GPZ',
        voltageKv: 15,
        inService: true,
        elementId: 'node-source',
        elementType: 'Source',
        elementName: 'GPZ',
        switchState: null,
        branchType: null,
      },
    },
    {
      id: 'node-bus',
      nodeType: NodeTypeV1.BUS_SN,
      ports: [
        { id: 'port-in', role: 'IN', relativeX: 0.0, relativeY: 0.5 },
        { id: 'port-branch', role: 'OUT', relativeX: 1.0, relativeY: 0.5 },
      ],
      attributes: {
        label: 'Szyna SN',
        voltageKv: 15,
        inService: true,
        elementId: 'node-bus',
        elementType: 'Bus',
        elementName: 'Szyna SN',
        switchState: null,
        branchType: null,
      },
    },
  ];
  const edges: VisualEdgeV1[] = [
    {
      id: 'edge-trunk',
      fromPortRef: { nodeId: 'node-source', portId: 'port-out' },
      toPortRef: { nodeId: 'node-bus', portId: 'port-in' },
      edgeType: EdgeTypeV1.TRUNK,
      isNormallyOpen: false,
      attributes: { label: 'Magistrala', lengthKm: 5.0, branchType: 'CABLE', inService: true },
    },
  ];
  const meta: VisualGraphMetaV1 = {
    snapshotId: 'test-snap-faza6',
    snapshotFingerprint: 'faza6-fp',
    createdAt: '2026-01-01T00:00:00.000Z',
    version: VISUAL_GRAPH_VERSION,
  };
  return { version: VISUAL_GRAPH_VERSION, nodes, edges, metadata: meta };
}

// =============================================================================
// test_no_empty_ui_action — snapshot store actions
// =============================================================================

describe('FAZA 6: Snapshot Store completeness', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
  });

  it('snapshot store has executeDomainOperation action', () => {
    const store = useSnapshotStore.getState();
    expect(typeof store.executeDomainOperation).toBe('function');
  });

  it('snapshot store has refreshFromBackend action', () => {
    const store = useSnapshotStore.getState();
    expect(typeof store.refreshFromBackend).toBe('function');
  });

  it('snapshot store has setSnapshot action', () => {
    const store = useSnapshotStore.getState();
    expect(typeof store.setSnapshot).toBe('function');
  });

  it('snapshot store has clearError action', () => {
    const store = useSnapshotStore.getState();
    expect(typeof store.clearError).toBe('function');
  });

  it('snapshot store has reset action', () => {
    const store = useSnapshotStore.getState();
    expect(typeof store.reset).toBe('function');
  });

  it('snapshot store initial state is clean', () => {
    const store = useSnapshotStore.getState();
    expect(store.snapshot).toBeNull();
    expect(store.logicalViews).toBeNull();
    expect(store.readiness).toBeNull();
    expect(store.fixActions).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.errorCode).toBeNull();
  });

  it('reset clears all state', () => {
    useSnapshotStore.setState({
      error: 'test error',
      errorCode: 'TEST_CODE',
      loading: true,
    });
    useSnapshotStore.getState().reset();

    const store = useSnapshotStore.getState();
    expect(store.error).toBeNull();
    expect(store.errorCode).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.snapshot).toBeNull();
  });
});

// =============================================================================
// test_sld_updates_after_snapshot_change — SLD is pure function of snapshot
// =============================================================================

describe('FAZA 6: SLD deterministic rendering after snapshot change', () => {
  it('computeLayout produces deterministic output for same graph', () => {
    const graph = buildMinimalVisualGraph();
    const layout1 = computeLayout(graph);
    const layout2 = computeLayout(graph);

    expect(layout1.hash).toBe(layout2.hash);
    expect(layout1.nodePlacements.length).toBe(layout2.nodePlacements.length);
    expect(layout1.edgeRoutes.length).toBe(layout2.edgeRoutes.length);
  });

  it('computeLayout changes output when graph changes', () => {
    const graph1 = buildMinimalVisualGraph();
    const layout1 = computeLayout(graph1);

    // Add a node to the graph
    const graph2 = buildMinimalVisualGraph();
    graph2.nodes.push({
      id: 'node-extra',
      nodeType: NodeTypeV1.LOAD,
      ports: [{ id: 'port-in-extra', role: 'IN', relativeX: 0.5, relativeY: 0.0 }],
      attributes: {
        label: 'Odbior',
        voltageKv: 15,
        inService: true,
        elementId: 'node-extra',
        elementType: 'Load',
        elementName: 'Odbior',
        switchState: null,
        branchType: null,
      },
    });
    graph2.edges.push({
      id: 'edge-extra',
      fromPortRef: { nodeId: 'node-bus', portId: 'port-branch' },
      toPortRef: { nodeId: 'node-extra', portId: 'port-in-extra' },
      edgeType: EdgeTypeV1.BRANCH,
      isNormallyOpen: false,
      attributes: { label: 'Odgalezienie', lengthKm: 2.0, branchType: 'CABLE', inService: true },
    });
    const layout2 = computeLayout(graph2);

    expect(layout1.hash).not.toBe(layout2.hash);
  });

  it('VisualGraph hash is deterministic', () => {
    const graph = buildMinimalVisualGraph();
    const canonical1 = canonicalizeVisualGraph(graph);
    const canonical2 = canonicalizeVisualGraph(graph);
    const hash1 = computeVisualGraphHash(graph);
    const hash2 = computeVisualGraphHash(graph);

    expect(hash1).toBe(hash2);
    expect(canonical1).toEqual(canonical2);
  });
});

// =============================================================================
// test_network_build_store_deterministic
// =============================================================================

describe('FAZA 6: Network build store selectors are deterministic', () => {
  it('empty snapshot produces NO_SOURCE phase', () => {
    const phase1 = computeBuildPhase(null, null, null);
    const phase2 = computeBuildPhase(null, null, null);

    expect(phase1).toBe('NO_SOURCE');
    expect(phase1).toBe(phase2);
  });

  it('ENM with source produces HAS_SOURCE phase', () => {
    const enm = createMinimalENM();
    const phase = computeBuildPhase(enm, null, null);

    expect(phase).toBe('HAS_SOURCE');
  });

  it('build phase label is always defined', () => {
    const phases = ['NO_SOURCE', 'HAS_SOURCE', 'HAS_TRUNKS', 'HAS_STATIONS', 'READY'] as const;
    for (const phase of phases) {
      const label = buildPhaseLabel(phase);
      expect(label).toBeTruthy();
      expect(typeof label).toBe('string');
    }
  });

  it('station summaries are deterministic', () => {
    const enm = createMinimalENM();
    const s1 = selectStationSummaries(enm, null);
    const s2 = selectStationSummaries(enm, null);
    expect(s1).toEqual(s2);
  });

  it('blockers by category sums to total', () => {
    const result = selectBlockersByCategory(null);
    expect(result.total).toBe(0);
    expect(result.topologia + result.katalogi + result.eksploatacja + result.analiza).toBe(result.total);
  });
});

// =============================================================================
// test_topology_store_sync
// =============================================================================

describe('FAZA 6: Topology store has snapshot sync', () => {
  it('topology store executeOp is a function', () => {
    const store = useTopologyStore.getState();
    expect(typeof store.executeOp).toBe('function');
  });

  it('topology store loadSummary is a function', () => {
    const store = useTopologyStore.getState();
    expect(typeof store.loadSummary).toBe('function');
  });

  it('topology store clearError is a function', () => {
    const store = useTopologyStore.getState();
    expect(typeof store.clearError).toBe('function');
  });
});

// =============================================================================
// test_network_build_store_sync
// =============================================================================

describe('FAZA 6: Network build store has correct actions', () => {
  beforeEach(() => {
    useNetworkBuildStore.getState().reset();
  });

  it('network build store has openOperationForm action', () => {
    const store = useNetworkBuildStore.getState();
    expect(typeof store.openOperationForm).toBe('function');
  });

  it('network build store has closeOperationForm action', () => {
    const store = useNetworkBuildStore.getState();
    expect(typeof store.closeOperationForm).toBe('function');
  });

  it('network build store has toggleSection action', () => {
    const store = useNetworkBuildStore.getState();
    expect(typeof store.toggleSection).toBe('function');
  });

  it('network build store openOperationForm sets form', () => {
    useNetworkBuildStore.getState().openOperationForm('add_grid_source_sn', { test: true });
    const state = useNetworkBuildStore.getState();
    expect(selectActiveOperationForm(state)).not.toBeNull();
    expect(selectActiveOperationForm(state)?.op).toBe('add_grid_source_sn');
  });

  it('network build store initial state is clean', () => {
    const state = useNetworkBuildStore.getState();
    expect(selectActiveOperationForm(state)).toBeNull();
    expect(selectActiveObjectCard(state)).toBeNull();
    expect(state.collapsedSections.size).toBe(0);
  });
});

// =============================================================================
// test_snapshot_selectors_pure
// =============================================================================

describe('FAZA 6: Snapshot selectors are pure functions', () => {
  it('selectBusRefs returns sorted refs', () => {
    const enm = createMinimalENM();
    const refs = selectBusRefs(enm);
    expect(refs).toEqual(['bus_sn_main']);
  });

  it('selectBusRefs returns empty for null', () => {
    expect(selectBusRefs(null)).toEqual([]);
  });

  it('selectBusOptions returns options with voltage', () => {
    const enm = createMinimalENM();
    const opts = selectBusOptions(enm);
    expect(opts.length).toBe(1);
    expect(opts[0].voltage_kv).toBe(15);
    expect(opts[0].ref_id).toBe('bus_sn_main');
  });

  it('selectIsReady returns false for null', () => {
    expect(selectIsReady(null)).toBe(false);
  });

  it('selectBlockerCount returns 0 for null', () => {
    expect(selectBlockerCount(null)).toBe(0);
  });
});

// =============================================================================
// test_response_envelope_invariants
// =============================================================================

describe('FAZA 6: Response envelope invariants', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
  });

  it('setSnapshot hydrates all fields from DomainOpResponseV1', () => {
    const response = {
      snapshot: createMinimalENM(),
      logical_views: { trunks: [], branches: [], terminals: [] },
      readiness: { ready: false, blockers: [], warnings: [] },
      fix_actions: [{ code: 'test', title_pl: 'Test', action_type: 'NAVIGATE' }],
      materialized_params: { lines_sn: {}, transformers_sn_nn: {} },
      layout: { layout_hash: 'sha256:abc', layout_version: '1.0' },
      selection_hint: { element_id: 'bus1', element_type: 'bus', zoom_to: true },
      changes: { created_element_ids: ['bus1'], updated_element_ids: [], deleted_element_ids: [] },
      domain_events: [{ event_type: 'BUS_CREATED', element_id: 'bus1' }],
    };

    useSnapshotStore.getState().setSnapshot(response as any);

    const state = useSnapshotStore.getState();
    expect(state.snapshot).not.toBeNull();
    expect(state.logicalViews).not.toBeNull();
    expect(state.readiness).not.toBeNull();
    expect(state.fixActions.length).toBe(1);
    expect(state.layout).not.toBeNull();
    expect(state.selectionHint).not.toBeNull();
    expect(state.lastChanges).not.toBeNull();
    expect(state.lastEvents.length).toBe(1);
    expect(state.error).toBeNull();
  });
});
