/**
 * WorkflowOrchestrator — Phase 3 polish testy (operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. Initial state = idle, append=idle, split=idle.
 *   2. dispatchClick: bay → append, segment → split, background → reject.
 *   3. dispatchClick mutex: drugi click w aktywnym workflow → reject.
 *   4. handleEsc: aktywny workflow → cancelled + idle.
 *   5. handleEsc gdy idle → no-op.
 *   6. activateWorkflow: idle → workflow, mutex w innym workflow → no-op.
 *   7. updateAppend: terminal states (committed/cancelled/error/idle) → auto-idle.
 *   8. updateSplit: analogicznie.
 *   9. buildCadGhosts: append → ghost append-station, split → ghost split-*.
 *  10. isPreviewActive: tylko gdy preview_ready w aktywnym workflow.
 */
import { describe, expect, it } from 'vitest';

import {
  type AppendState,
  pickEndpoint,
  startAppend,
  chooseStationType,
  chooseTransformer,
  previewReady as appendPreviewReady,
} from '../AppendOnEndpointController';
import {
  type SplitState,
  pickSegment,
  pickSplitPoint,
  chooseInsertedObject,
  startSplit,
} from '../ConsciousSplitController';
import {
  INITIAL_ORCHESTRATOR_STATE,
  activateWorkflow,
  buildCadGhosts,
  dispatchClick,
  handleEsc,
  isPreviewActive,
  updateAppend,
  updateSplit,
} from '../WorkflowOrchestrator';

describe('WorkflowOrchestrator — initial state', () => {
  it('Initial: active=idle, append=idle, split=idle', () => {
    expect(INITIAL_ORCHESTRATOR_STATE.active).toBe('idle');
    expect(INITIAL_ORCHESTRATOR_STATE.append.kind).toBe('idle');
    expect(INITIAL_ORCHESTRATOR_STATE.split.kind).toBe('idle');
  });
});

describe('WorkflowOrchestrator — dispatchClick (Decision Tree)', () => {
  it('Click na bay (idle) → append-on-endpoint', () => {
    const result = dispatchClick(INITIAL_ORCHESTRATOR_STATE, { kind: 'bay', bayRef: 'bay-1' });
    expect(result.accepted).toBe(true);
    expect(result.activated).toBe('append-on-endpoint');
  });

  it('Click na segment (idle) → conscious-split', () => {
    const result = dispatchClick(INITIAL_ORCHESTRATOR_STATE, { kind: 'segment', segmentRef: 'seg-1' });
    expect(result.accepted).toBe(true);
    expect(result.activated).toBe('conscious-split');
  });

  it('Click na background → rejected', () => {
    const result = dispatchClick(INITIAL_ORCHESTRATOR_STATE, { kind: 'background' });
    expect(result.accepted).toBe(false);
  });

  it('Mutex: drugi click w aktywnym workflow → rejected', () => {
    const state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    const result = dispatchClick(state, { kind: 'segment', segmentRef: 'seg-1' });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toMatch(/anuluj go/);
  });
});

describe('WorkflowOrchestrator — handleEsc', () => {
  it('idle + ESC → no-op', () => {
    const result = handleEsc(INITIAL_ORCHESTRATOR_STATE);
    expect(result).toBe(INITIAL_ORCHESTRATOR_STATE);
  });

  it('append aktywny + ESC → cancelled + idle', () => {
    const s: AppendState = startAppend(INITIAL_ORCHESTRATOR_STATE.append);
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    state = updateAppend(state, s);
    const after = handleEsc(state);
    expect(after.active).toBe('idle');
    expect(after.append.kind).toBe('cancelled');
  });

  it('split aktywny + ESC → cancelled + idle', () => {
    const s: SplitState = startSplit(INITIAL_ORCHESTRATOR_STATE.split);
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'conscious-split');
    state = updateSplit(state, s);
    const after = handleEsc(state);
    expect(after.active).toBe('idle');
    expect(after.split.kind).toBe('cancelled');
  });
});

describe('WorkflowOrchestrator — activateWorkflow', () => {
  it('idle → append-on-endpoint', () => {
    const next = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    expect(next.active).toBe('append-on-endpoint');
  });

  it('Mutex: append → split (different) → no-op', () => {
    const a = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    const b = activateWorkflow(a, 'conscious-split');
    expect(b.active).toBe('append-on-endpoint'); // mutex zachowany
  });

  it('Same workflow re-activate → idempotent', () => {
    const a = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    const b = activateWorkflow(a, 'append-on-endpoint');
    expect(b.active).toBe('append-on-endpoint');
  });
});

describe('WorkflowOrchestrator — updateAppend auto-deactivate', () => {
  it('updateAppend → committed → state.active=idle', () => {
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    state = updateAppend(state, { kind: 'committed', stationName: 'X', stationRef: 'sub/x' });
    expect(state.active).toBe('idle');
  });

  it('updateAppend → cancelled → idle', () => {
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    state = updateAppend(state, { kind: 'cancelled' });
    expect(state.active).toBe('idle');
  });

  it('updateAppend → error → idle', () => {
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    state = updateAppend(state, { kind: 'error', errorCode: 'E', messagePl: 'X' });
    expect(state.active).toBe('idle');
  });

  it('updateAppend → in-flight (preview_pending) → active utrzymany', () => {
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    state = updateAppend(state, {
      kind: 'preview_pending',
      endpoint: { endpointBusRef: 'bus-1', snVoltageKv: 15 },
      station: { stationName: 'X', stationType: 'terminal', nnVoltageKv: 0.4 },
      transformer: null,
    });
    expect(state.active).toBe('append-on-endpoint');
  });
});

describe('WorkflowOrchestrator — updateSplit auto-deactivate', () => {
  it('committed → idle', () => {
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'conscious-split');
    state = updateSplit(state, { kind: 'committed', insertedRef: 'sub/x', insertedKind: 'station' });
    expect(state.active).toBe('idle');
  });

  it('cancelled → idle', () => {
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'conscious-split');
    state = updateSplit(state, { kind: 'cancelled' });
    expect(state.active).toBe('idle');
  });

  it('in-flight (preview_pending) → active utrzymany', () => {
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'conscious-split');
    state = updateSplit(state, {
      kind: 'preview_pending',
      segment: { segmentRef: 'seg-1', segmentType: 'cable', fromBusRef: 'a', toBusRef: 'b', lengthKm: 1 },
      insertAt: { mode: 'RATIO', value: 0.5 },
      insertedKind: 'zksn',
    });
    expect(state.active).toBe('conscious-split');
  });
});

describe('WorkflowOrchestrator — buildCadGhosts', () => {
  it('idle → 0 ghosts', () => {
    expect(buildCadGhosts(INITIAL_ORCHESTRATOR_STATE)).toHaveLength(0);
  });

  it('append preview_ready → 1 ghost append-station z labelem', () => {
    let s: AppendState = startAppend(INITIAL_ORCHESTRATOR_STATE.append);
    s = pickEndpoint(s, { endpointBusRef: 'bus-1', snVoltageKv: 15 });
    s = chooseStationType(s, { stationName: 'Sady', stationType: 'terminal', nnVoltageKv: 0.4 });
    s = chooseTransformer(s, { transformerCatalogRef: 'tr-630' });
    s = appendPreviewReady(s, {
      appendedStationId: 'sub/abc',
      endpointBusRef: 'bus-1',
      createdRefs: ['sub/abc'],
      electricalImpact: { topologyChanged: true, affectedObjectRefs: [], endpointBusConsumed: true, newTerminalBusRef: null },
    });
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    state = updateAppend(state, s);
    const ghosts = buildCadGhosts(state, { endpointPoint: { x: 50, y: 100 } });
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].kind).toBe('append-station');
    expect(ghosts[0].position).toEqual({ x: 50, y: 100 });
    expect(ghosts[0].label).toMatch(/Sady/);
  });

  it('split preview_pending zksn → 1 ghost split-zksn', () => {
    let sp: SplitState = startSplit(INITIAL_ORCHESTRATOR_STATE.split);
    sp = pickSegment(sp, { segmentRef: 'seg-1', segmentType: 'cable', fromBusRef: 'a', toBusRef: 'b', lengthKm: 1 });
    sp = pickSplitPoint(sp, { mode: 'RATIO', value: 0.5 });
    sp = chooseInsertedObject(sp, 'zksn');
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'conscious-split');
    state = updateSplit(state, sp);
    const ghosts = buildCadGhosts(state, {
      segmentFrom: { x: 0, y: 0 },
      segmentTo: { x: 100, y: 0 },
    });
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].kind).toBe('split-zksn');
    expect(ghosts[0].position).toEqual({ x: 50, y: 0 });
  });

  it('split preview_pending pole → ghost split-pole', () => {
    let sp: SplitState = startSplit(INITIAL_ORCHESTRATOR_STATE.split);
    sp = pickSegment(sp, { segmentRef: 'seg-1', segmentType: 'cable', fromBusRef: 'a', toBusRef: 'b', lengthKm: 1 });
    sp = pickSplitPoint(sp, { mode: 'RATIO', value: 0.3 });
    sp = chooseInsertedObject(sp, 'pole');
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'conscious-split');
    state = updateSplit(state, sp);
    const ghosts = buildCadGhosts(state, {
      segmentFrom: { x: 0, y: 0 },
      segmentTo: { x: 100, y: 0 },
    });
    expect(ghosts[0].kind).toBe('split-pole');
  });
});

describe('WorkflowOrchestrator — isPreviewActive', () => {
  it('idle → false', () => {
    expect(isPreviewActive(INITIAL_ORCHESTRATOR_STATE)).toBe(false);
  });

  it('append preview_ready → true', () => {
    let s: AppendState = startAppend(INITIAL_ORCHESTRATOR_STATE.append);
    s = pickEndpoint(s, { endpointBusRef: 'bus-1', snVoltageKv: 15 });
    s = chooseStationType(s, { stationName: 'X', stationType: 'terminal', nnVoltageKv: 0.4 });
    s = chooseTransformer(s, { transformerCatalogRef: 'tr-630' });
    s = appendPreviewReady(s, {
      appendedStationId: 'x', endpointBusRef: 'bus-1', createdRefs: [],
      electricalImpact: { topologyChanged: true, affectedObjectRefs: [], endpointBusConsumed: true, newTerminalBusRef: null },
    });
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    state = updateAppend(state, s);
    expect(isPreviewActive(state)).toBe(true);
  });

  it('append preview_pending (przed previewReady) → false', () => {
    let s: AppendState = startAppend(INITIAL_ORCHESTRATOR_STATE.append);
    s = pickEndpoint(s, { endpointBusRef: 'bus-1', snVoltageKv: 15 });
    s = chooseStationType(s, { stationName: 'X', stationType: 'terminal', nnVoltageKv: 0.4 });
    s = chooseTransformer(s, { transformerCatalogRef: 'tr-630' });
    let state = activateWorkflow(INITIAL_ORCHESTRATOR_STATE, 'append-on-endpoint');
    state = updateAppend(state, s);
    expect(isPreviewActive(state)).toBe(false); // pending, nie ready
  });
});
