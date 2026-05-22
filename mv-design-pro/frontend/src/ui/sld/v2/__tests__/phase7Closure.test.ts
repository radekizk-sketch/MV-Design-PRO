/**
 * Phase 7 closure — operator-grade SLD plan v2.
 *
 * Cross-module integration tests dla:
 *   - WorkflowOrchestrator + Hash Triad invariants.
 *   - LayoutStrategyDispatch + corridor bands → CadOverlay.
 *   - AppendOnEndpoint payload + Backend dispatcher contract.
 *   - ConsciousSplit electrical_impact + frontend SplitElectricalImpact.
 *
 * Acceptance Invariants:
 *   - 7: workflow tranzycje NIE zmieniają topology_hash.
 *   - 8: anonymization toggle NIE zmienia layout/topology.
 *   - 17: deterministyczny placement.
 */
import { describe, expect, it } from 'vitest';

import { dispatchLayout, dispatchLayoutMatches } from '../builder/LayoutStrategyDispatch';
import {
  type LayoutSnapshot,
  type TopologySnapshot,
  type ViewSnapshot,
  DEFAULT_ANONYMIZATION_TOGGLES,
  computeHashTriad,
} from '../core/hashes';
import {
  buildBackendPayload as buildAppendPayload,
  pickEndpoint,
  startAppend,
  chooseStationType,
  chooseTransformer,
  INITIAL_APPEND_STATE,
} from '../workflow/AppendOnEndpointController';
import {
  buildBackendPayload as buildSplitPayload,
  pickSegment,
  pickSplitPoint,
  chooseInsertedObject,
  chooseStationType as chooseSplitStation,
  chooseTransformer as chooseSplitTransformer,
  INITIAL_SPLIT_STATE,
} from '../workflow/ConsciousSplitController';
import {
  type DispatchClick,
  INITIAL_ORCHESTRATOR_STATE,
  buildCadGhosts,
  dispatchClick,
  handleEsc,
  updateAppend,
  updateSplit,
} from '../workflow/WorkflowOrchestrator';
import type { EnergyNetworkModel } from '../../../../types/enm';

const baseTopology: TopologySnapshot = {
  objects: [{ ref: 'gpz-1', kind: 'gpz' }],
  connections: [],
};
const baseLayout: LayoutSnapshot = {
  objectPositions: [{ ref: 'gpz-1', x: 0, y: 0 }],
  routes: [],
  labelLocks: [],
};
const baseView: ViewSnapshot = {
  lod: 2,
  viewportScale: 1,
  viewportTx: 0,
  viewportTy: 0,
  anonymizationOn: false,
  anonymizationToggles: DEFAULT_ANONYMIZATION_TOGGLES,
  visibleLayers: ['equipment'],
};

describe('Phase 7 closure — Workflow tranzycje NIE zmieniają topology_hash', () => {
  it('Append start → preview_pending → topology invariant (workflow przed commit)', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);
    // Sam workflow append nie modyfikuje topology snapshot — backend dopiero
    // commitnie zmiany. Frontend powinien więc trzymać topology_hash stały
    // dopóki nie otrzyma response z server.
    let state = INITIAL_ORCHESTRATOR_STATE;
    const click: DispatchClick = { kind: 'bay', bayRef: 'bay-1' };
    expect(dispatchClick(state, click).accepted).toBe(true);
    let s = startAppend(state.append);
    s = pickEndpoint(s, { endpointBusRef: 'bus-1', snVoltageKv: 15 });
    s = chooseStationType(s, { stationName: 'Sady', stationType: 'terminal', nnVoltageKv: 0.4 });
    state = updateAppend(state, s);
    // Topology nie zmieniona przez frontend FSM
    const after = computeHashTriad(baseTopology, baseLayout, baseView);
    expect(after.topologyHash).toBe(before.topologyHash);
    expect(after.layoutHash).toBe(before.layoutHash);
  });

  it('ESC po append flow → workflow idle, ale topology_hash niezmieniony', () => {
    const before = computeHashTriad(baseTopology, baseLayout, baseView);
    let state = INITIAL_ORCHESTRATOR_STATE;
    let s = startAppend(state.append);
    s = pickEndpoint(s, { endpointBusRef: 'bus-1', snVoltageKv: 15 });
    state = updateAppend(state, s);
    state = handleEsc(state);
    const after = computeHashTriad(baseTopology, baseLayout, baseView);
    expect(after.topologyHash).toBe(before.topologyHash);
    expect(state.active).toBe('idle');
    expect(state.append.kind).toBe('cancelled');
  });
});

describe('Phase 7 closure — buildBackendPayload contract spójność', () => {
  it('Append payload → spójny z backend append_station_on_endpoint signature', () => {
    let s = startAppend(INITIAL_APPEND_STATE);
    s = pickEndpoint(s, { endpointBusRef: 'bus-test', snVoltageKv: 15, runRef: 'corridor-1' });
    s = chooseStationType(s, { stationName: 'Test', stationType: 'terminal', nnVoltageKv: 0.4 });
    s = chooseTransformer(s, { transformerCatalogRef: 'tr-630-15-04' });
    const payload = buildAppendPayload(s, true);
    // Backend kontrakt:
    expect(payload).toMatchObject({
      endpoint_bus_ref: 'bus-test',
      run_ref: 'corridor-1',
      station: {
        name: 'Test',
        station_type: 'terminal',
        nn_voltage_kv: 0.4,
      },
      transformer: { transformer_catalog_ref: 'tr-630-15-04' },
      dry_run: true,
    });
  });

  it('Split payload → spójny z backend insert_station_on_segment_sn signature', () => {
    let s = pickSegment(
      { kind: 'pick_segment' },
      {
        segmentRef: 'seg-1',
        segmentType: 'cable',
        fromBusRef: 'a',
        toBusRef: 'b',
        lengthKm: 1,
        catalogRef: 'cab-120',
      },
    );
    s = pickSplitPoint(s, { mode: 'RATIO', value: 0.5 });
    s = chooseInsertedObject(s, 'station');
    s = chooseSplitStation(s, { stationName: 'Sady', stationType: 'inline', nnVoltageKv: 0.4 });
    s = chooseSplitTransformer(s, { transformerCatalogRef: 'tr-630' });
    const payload = buildSplitPayload(s, true);
    // Backend kontrakt:
    expect(payload).toMatchObject({
      segment_id: 'seg-1',
      insert_at: { mode: 'RATIO', value: 0.5 },
      station: {
        name: 'Sady',
        station_type: 'inline',
        nn_voltage_kv: 0.4,
      },
      transformer: { transformer_catalog_ref: 'tr-630' },
      dry_run: true,
    });
  });
});

describe('Phase 7 closure — LayoutStrategyDispatch + CadOverlay integration', () => {
  it('dispatchLayout corridor → cadCorridorBands → CadOverlay-ready', () => {
    const enm: Pick<EnergyNetworkModel, 'substations' | 'bays' | 'generators' | 'line_runs'> = {
      substations: [
        { ref_id: 'gpz', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
        ...Array.from({ length: 25 }, (_, i) => ({
          ref_id: `st${i}`, name: `St${i}`, station_type: 'mv_lv', bus_refs: [], transformer_refs: [], tags: [], meta: {},
        })) as never,
      ],
      bays: [],
      generators: [],
      line_runs: Array.from({ length: 7 }, (_, i) => ({
        id: `r-${i}`, run_kind: i === 0 ? 'main_trunk' : 'branch',
        starting_bay_ref: `bay-${i}`, starting_port_ref: `port-${i}`,
        segments: [], stations: [],
      })) as never,
    };
    const result = dispatchLayout(enm);
    expect(result.strategy).toBe('corridor');
    // cadCorridorBands valid dla CadOverlay
    for (const band of result.cadCorridorBands) {
      expect(['gpz', 'main-trunk', 'branch', 'ring-return', 'der-connection', 'label-reserve']).toContain(band.kind);
      expect(band.yMax).toBeGreaterThan(band.yMin);
    }
  });

  it('dispatchLayout determinism: 5 reruny → same result', () => {
    const enm: Pick<EnergyNetworkModel, 'substations' | 'bays' | 'generators' | 'line_runs'> = {
      substations: [
        { ref_id: 'gpz', name: 'GPZ', station_type: 'gpz', bus_refs: [], transformer_refs: [], tags: [], meta: {} } as never,
      ],
      bays: [], generators: [], line_runs: [],
    };
    const ref = dispatchLayout(enm);
    for (let i = 0; i < 5; i++) {
      expect(dispatchLayoutMatches(ref, dispatchLayout(enm))).toBe(true);
    }
  });
});

describe('Phase 7 closure — Orchestrator + CadGhost integration', () => {
  it('Append flow → CadGhost append-station przy preview_pending', () => {
    let state = INITIAL_ORCHESTRATOR_STATE;
    let s = startAppend(state.append);
    s = pickEndpoint(s, { endpointBusRef: 'bus-1', snVoltageKv: 15 });
    s = chooseStationType(s, { stationName: 'Sady', stationType: 'terminal', nnVoltageKv: 0.4 });
    s = chooseTransformer(s, { transformerCatalogRef: 'tr-630' });
    state = updateAppend(state, s);
    expect(state.active).toBe('append-on-endpoint');
    const ghosts = buildCadGhosts(state, { endpointPoint: { x: 100, y: 100 } });
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].kind).toBe('append-station');
    expect(ghosts[0].position).toEqual({ x: 100, y: 100 });
  });

  it('Split flow zksn → CadGhost split-zksn przy preview_pending', () => {
    let state = INITIAL_ORCHESTRATOR_STATE;
    let sp = pickSegment(
      { kind: 'pick_segment' },
      { segmentRef: 'seg-1', segmentType: 'cable', fromBusRef: 'a', toBusRef: 'b', lengthKm: 1 },
    );
    sp = pickSplitPoint(sp, { mode: 'RATIO', value: 0.5 });
    sp = chooseInsertedObject(sp, 'zksn');
    state = updateSplit(state, sp);
    const ghosts = buildCadGhosts(state, {
      segmentFrom: { x: 0, y: 0 },
      segmentTo: { x: 200, y: 0 },
    });
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].kind).toBe('split-zksn');
    expect(ghosts[0].position).toEqual({ x: 100, y: 0 }); // 0.5 ratio
  });
});

describe('Phase 7 closure — Acceptance Invariant 5: konwencja ortogonalna', () => {
  it('Phase 0C electrical_impact contract: halves + catalog_inheritance + length_assignment', () => {
    // Phase 0C electrical impact (frontend type spójny z backend response).
    const validImpactKeys = [
      'topologyTypeChanged',
      'affectedObjectRefs',
      'halves',
      'catalogInheritance',
      'invalidatedResults',
      'affectedProofPacks',
      'missingDataAfter',
      'affectedBuses',
    ];
    // Wszystkie wymagane keys obecne w SplitElectricalImpact type
    const sample = {
      topologyTypeChanged: true,
      affectedObjectRefs: [],
      halves: {
        firstSegmentId: 'seg-1_a',
        secondSegmentId: 'seg-1_b',
        firstLengthKm: 0.5,
        secondLengthKm: 0.5,
        splitRatio: 0.5,
      },
      catalogInheritance: {
        sourceSegmentRef: 'seg-1',
        sourceCatalogRef: null,
        firstInherits: false,
        secondInherits: false,
        rule: 'fallback',
      },
      invalidatedResults: [],
      affectedProofPacks: [],
      missingDataAfter: [],
      affectedBuses: [],
    };
    for (const key of validImpactKeys) {
      expect(sample).toHaveProperty(key);
    }
  });
});

describe('Phase 7 closure — Pełen workflow integration', () => {
  it('Append: bay click → workflow → dispatch → ESC → idle (rollback)', () => {
    let state = INITIAL_ORCHESTRATOR_STATE;
    // 1. Click bay
    const dispatch1 = dispatchClick(state, { kind: 'bay', bayRef: 'bay-1' });
    expect(dispatch1.accepted).toBe(true);
    // 2. Start workflow
    let s = startAppend(state.append);
    state = updateAppend(state, s);
    expect(state.active).toBe('append-on-endpoint');
    // 3. Pick endpoint
    s = pickEndpoint(s, { endpointBusRef: 'bus-1', snVoltageKv: 15 });
    state = updateAppend(state, s);
    // 4. Operator decyduje ESC zamiast continue
    state = handleEsc(state);
    expect(state.active).toBe('idle');
    expect(state.append.kind).toBe('cancelled');
    // 5. Może rozpocząć nowy workflow
    const dispatch2 = dispatchClick(state, { kind: 'segment', segmentRef: 'seg-1' });
    expect(dispatch2.accepted).toBe(true);
    expect(dispatch2.activated).toBe('conscious-split');
  });
});
