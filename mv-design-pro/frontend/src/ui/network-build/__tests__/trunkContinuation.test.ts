import { describe, expect, it } from 'vitest';

import type { DomainOpResponseV1 } from '../../../types/enm';
import {
  buildNextContext,
  createdEndpointBusRef,
  createdSegmentRef,
  nextOperationForStep,
} from '../trunkContinuation';

function response(over: Partial<DomainOpResponseV1>): DomainOpResponseV1 {
  return {
    snapshot: null,
    logical_views: { terminals: [] },
    readiness: {},
    fix_actions: [],
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: {},
    layout: {},
    ...over,
  } as unknown as DomainOpResponseV1;
}

describe('trunkContinuation — nextOperationForStep', () => {
  it('mapuje krok na realną operację domenową', () => {
    expect(nextOperationForStep('station')).toBe('insert_station_on_segment_sn');
    expect(nextOperationForStep('zksn')).toBe('insert_zksn_on_segment_sn');
    expect(nextOperationForStep('branch_pole')).toBe('insert_branch_pole_on_segment_sn');
    expect(nextOperationForStep('continue')).toBe('continue_trunk_segment_sn');
  });
});

describe('trunkContinuation — createdSegmentRef', () => {
  it('preferuje selection_hint typu LineBranch', () => {
    const res = response({
      selection_hint: { element_id: 'seg-hint', element_type: 'LineBranch' } as never,
      snapshot: { branches: [{ id: 'seg-hint', ref_id: 'seg-hint' }] } as never,
    });
    expect(createdSegmentRef(res, null, 'bus-1')).toBe('seg-hint');
  });

  it('wskazuje odcinek z created_element_ids obecny w snapshotcie', () => {
    const res = response({
      changes: { created_element_ids: ['bus-end', 'seg-created'], updated_element_ids: [], deleted_element_ids: [] },
      snapshot: { branches: [{ id: 'seg-created', ref_id: 'seg-created', to_bus_ref: 'bus-end' }] } as never,
    });
    expect(createdSegmentRef(res, null, 'bus-1')).toBe('seg-created');
  });

  it('fallback: nowa gałąź połączona ze startem, gdy brak created_ids', () => {
    const res = response({
      snapshot: { branches: [{ id: 'seg-new', ref_id: 'seg-new', from_bus_ref: 'bus-1', to_bus_ref: 'bus-end' }] } as never,
    });
    const prev = { branches: [] } as never;
    expect(createdSegmentRef(res, prev, 'bus-1')).toBe('seg-new');
  });
});

describe('trunkContinuation — createdEndpointBusRef', () => {
  it('preferuje selection_hint typu bus', () => {
    const res = response({ selection_hint: { element_id: 'bus-end', element_type: 'bus' } as never });
    expect(createdEndpointBusRef(res, 'seg-1')).toBe('bus-end');
  });

  it('czyta to_bus_ref odcinka ze snapshotu', () => {
    const res = response({
      snapshot: { branches: [{ id: 'seg-1', ref_id: 'seg-1', to_bus_ref: 'bus-2' }] } as never,
    });
    expect(createdEndpointBusRef(res, 'seg-1')).toBe('bus-2');
  });
});

describe('trunkContinuation — buildNextContext', () => {
  it('buduje kontekst kontynuacji ciągu', () => {
    const ctx = buildNextContext({
      nextOperation: 'continue_trunk_segment_sn',
      nextSegmentRef: 'seg-1',
      nextEndpointBusRef: 'bus-end',
      nextTrunkId: 'trunk-1',
      nextPortId: 'trunk_end',
      terminalVoltageLabel: 'SN',
    });
    expect(ctx).toMatchObject({
      trunk_id: 'trunk-1',
      from_terminal_id: 'bus-end',
      terminal_port_id: 'trunk_end',
      element_type: 'LineBranch',
      default_termination: 'continue',
    });
  });

  it('buduje kontekst wstawienia elementu na końcu odcinka', () => {
    const ctx = buildNextContext({
      nextOperation: 'insert_station_on_segment_sn',
      nextSegmentRef: 'seg-1',
      nextEndpointBusRef: 'bus-end',
      nextTrunkId: 'trunk-1',
      nextPortId: 'trunk_end',
      terminalVoltageLabel: 'SN',
    });
    expect(ctx).toMatchObject({
      segment_id: 'seg-1',
      endpoint_bus_ref: 'bus-end',
      corridor_ref: 'trunk-1',
      placement_mode: 'ENDPOINT_APPEND',
      position_on_segment: 1,
    });
  });
});
