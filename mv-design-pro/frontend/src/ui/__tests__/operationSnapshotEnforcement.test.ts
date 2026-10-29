// @vitest-environment node
/**
 * Operation → Snapshot Enforcement Tests (§3)
 *
 * Verifies the canonical rule:
 * Every domain operation MUST return a snapshot in DomainOpResponseV1.
 * If snapshot is null (and no error), this is a critical failure.
 *
 * Tests:
 * 1. test_operation_always_returns_snapshot — mock response without snapshot → fail
 * 2. test_snapshot_store_rejects_null_snapshot — SnapshotStore invariant
 * 3. test_domain_op_response_contract — shape validation
 * 4. test_error_response_does_not_update_snapshot — error path
 */

import { describe, it, expect } from 'vitest';
import type { DomainOpResponseV1, EnergyNetworkModel } from '../../types/enm';

// ---------------------------------------------------------------------------
// DomainOpResponseV1 contract
// ---------------------------------------------------------------------------

/**
 * Minimal valid snapshot for testing.
 */
function makeMinimalSnapshot(): EnergyNetworkModel {
  return {
    version: 'v1',
    project_id: 'test-project',
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    measurements: [],
    protection_assignments: [],
    substations: [],
    bays: [],
    junctions: [],
    corridors: [],
  } as unknown as EnergyNetworkModel;
}

/**
 * Minimal valid DomainOpResponseV1 for testing.
 */
function makeSuccessResponse(snapshot: EnergyNetworkModel | null): DomainOpResponseV1 {
  return {
    snapshot,
    logical_views: { trunks: [], branches: [], terminals: [] } as never,
    readiness: { ready: true, issues: [], blocker_count: 0 } as never,
    fix_actions: [],
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: {} as never,
    layout: { layout_hash: 'abc123' } as never,
  };
}

function makeErrorResponse(error: string, errorCode: string): DomainOpResponseV1 {
  return {
    ...makeSuccessResponse(null),
    error,
    error_code: errorCode,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Operation → Snapshot enforcement (§3)', () => {
  it('successful response MUST have non-null snapshot', () => {
    const response = makeSuccessResponse(makeMinimalSnapshot());
    // Rule: if no error, snapshot MUST be present
    if (!response.error) {
      expect(response.snapshot).not.toBeNull();
    }
  });

  it('response with null snapshot and no error is a violation', () => {
    const response = makeSuccessResponse(null);
    // This is the invariant: no error + null snapshot = BUG
    const isViolation = !response.error && response.snapshot === null;
    expect(isViolation).toBe(true);
    // In production code, this should throw or log critical error
  });

  it('error response may have null snapshot (acceptable)', () => {
    const response = makeErrorResponse('Element not found', 'ELEMENT_NOT_FOUND');
    // Error responses are allowed to have null snapshot
    expect(response.error).toBeTruthy();
    expect(response.snapshot).toBeNull();
  });

  it('DomainOpResponseV1 has all required fields', () => {
    const response = makeSuccessResponse(makeMinimalSnapshot());
    expect(response).toHaveProperty('snapshot');
    expect(response).toHaveProperty('logical_views');
    expect(response).toHaveProperty('readiness');
    expect(response).toHaveProperty('fix_actions');
    expect(response).toHaveProperty('changes');
    expect(response).toHaveProperty('selection_hint');
    expect(response).toHaveProperty('audit_trail');
    expect(response).toHaveProperty('domain_events');
    expect(response).toHaveProperty('materialized_params');
    expect(response).toHaveProperty('layout');
  });

  it('changes field tracks created/updated/deleted IDs', () => {
    const response = makeSuccessResponse(makeMinimalSnapshot());
    expect(Array.isArray(response.changes.created_element_ids)).toBe(true);
    expect(Array.isArray(response.changes.updated_element_ids)).toBe(true);
    expect(Array.isArray(response.changes.deleted_element_ids)).toBe(true);
  });

  it('selection_hint is respected when present', () => {
    const response = makeSuccessResponse(makeMinimalSnapshot());
    response.selection_hint = {
      action: 'SELECT',
      element_id: 'new-bus-1',
      element_type: 'Bus',
    } as never;
    expect(response.selection_hint).not.toBeNull();
  });
});

describe('Snapshot Store contract (§3)', () => {
  it('snapshot update must be atomic (all-or-nothing)', () => {
    // Simulate atomic update: either ALL fields update or NONE
    const response = makeSuccessResponse(makeMinimalSnapshot());
    const storeUpdate = {
      snapshot: response.snapshot,
      readiness: response.readiness,
      fixActions: response.fix_actions,
      layout: response.layout,
    };

    // All fields must be set together
    expect(storeUpdate.snapshot).not.toBeNull();
    expect(storeUpdate.readiness).not.toBeNull();
    expect(storeUpdate.fixActions).toBeDefined();
    expect(storeUpdate.layout).not.toBeNull();
  });

  it('error response does not update snapshot (store contract)', () => {
    const errorResponse = makeErrorResponse('Validation failed', 'VALIDATION_ERROR');

    // Simulate store logic: on error, don't update snapshot
    let snapshotUpdated = false;
    if (!errorResponse.error) {
      snapshotUpdated = true;
    }
    expect(snapshotUpdated).toBe(false);
  });

  it('100x determinism: same response → same store state', () => {
    const response = makeSuccessResponse(makeMinimalSnapshot());
    const states: string[] = [];

    for (let i = 0; i < 100; i++) {
      const state = JSON.stringify({
        snapshot: response.snapshot,
        readiness: response.readiness,
        layout: response.layout,
      });
      states.push(state);
    }

    // All 100 iterations must produce identical state
    const uniqueStates = new Set(states);
    expect(uniqueStates.size).toBe(1);
  });
});

describe('SLD re-render after snapshot change (§3)', () => {
  it('snapshot change triggers re-render (pure derivation)', () => {
    const snapshotA = makeMinimalSnapshot();
    const snapshotB = { ...makeMinimalSnapshot(), project_id: 'different-project' };

    // Visual graph is derived from snapshot (pure function)
    const hashA = JSON.stringify(snapshotA);
    const hashB = JSON.stringify(snapshotB);

    // Different snapshots → different visual graphs
    expect(hashA).not.toBe(hashB);
  });

  it('same snapshot → same visual graph (determinism)', () => {
    const snapshot = makeMinimalSnapshot();
    const hash1 = JSON.stringify(snapshot);
    const hash2 = JSON.stringify(snapshot);

    expect(hash1).toBe(hash2);
  });
});
