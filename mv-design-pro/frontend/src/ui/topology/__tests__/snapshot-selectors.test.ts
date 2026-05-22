/**
 * Snapshot Store Selectors Tests
 *
 * Tests for the pure selector functions in snapshotStore.
 * These are stateless, deterministic functions that derive views from the ENM snapshot.
 * Validates:
 * - selectBusRefs: sorted bus reference extraction
 * - selectBusOptions: bus dropdown data
 * - selectTrunks / selectBranches / selectTerminals
 * - selectOpenTerminals: filtering by status
 * - selectIsReady / selectBlockerCount: readiness selectors
 * - Null/empty input handling
 */

import { describe, it, expect } from 'vitest';
import {
  selectBusRefs,
  selectBusOptions,
  selectTrunks,
  selectBranches,
  selectTerminals,
  selectOpenTerminals,
  selectIsReady,
  selectBlockerCount,
} from '../snapshotStore';
import type {
  EnergyNetworkModel,
  LogicalViewsV1,
  ReadinessInfo,
  TerminalRef,
} from '../../../types/enm';

// ---------------------------------------------------------------------------
// Helpers: minimal typed mocks
// ---------------------------------------------------------------------------

function makeMockENM(
  buses: Array<{
    ref_id: string;
    name: string;
    voltage_kv: number;
    tags?: string[];
    meta?: Record<string, unknown>;
  }>,
): EnergyNetworkModel {
  return { buses } as unknown as EnergyNetworkModel;
}

function makeMockLogicalViews(overrides?: Partial<LogicalViewsV1>): LogicalViewsV1 {
  return {
    trunks: [],
    branches: [],
    terminals: [],
    secondary_connectors: [],
    ...overrides,
  } as unknown as LogicalViewsV1;
}

function makeMockReadiness(overrides?: Partial<ReadinessInfo>): ReadinessInfo {
  return {
    ready: false,
    blockers: [],
    warnings: [],
    ...overrides,
  } as unknown as ReadinessInfo;
}

// ---------------------------------------------------------------------------
// selectBusRefs
// ---------------------------------------------------------------------------

describe('selectBusRefs', () => {
  it('should return empty array for null snapshot', () => {
    expect(selectBusRefs(null)).toEqual([]);
  });

  it('should return sorted bus refs', () => {
    const enm = makeMockENM([
      { ref_id: 'bus_c', name: 'C', voltage_kv: 20 },
      { ref_id: 'bus_a', name: 'A', voltage_kv: 20 },
      { ref_id: 'bus_b', name: 'B', voltage_kv: 20 },
    ]);
    expect(selectBusRefs(enm)).toEqual(['bus_a', 'bus_b', 'bus_c']);
  });

  it('should handle snapshot with no buses', () => {
    const enm = makeMockENM([]);
    expect(selectBusRefs(enm)).toEqual([]);
  });

  it('should produce deterministic output for same input', () => {
    const enm = makeMockENM([
      { ref_id: 'bus_x', name: 'X', voltage_kv: 110 },
      { ref_id: 'bus_a', name: 'A', voltage_kv: 20 },
    ]);
    const result1 = selectBusRefs(enm);
    const result2 = selectBusRefs(enm);
    expect(result1).toEqual(result2);
  });
});

// ---------------------------------------------------------------------------
// selectBusOptions
// ---------------------------------------------------------------------------

describe('selectBusOptions', () => {
  it('should return empty array for null snapshot', () => {
    expect(selectBusOptions(null)).toEqual([]);
  });

  it('should return bus options sorted by ref_id', () => {
    const enm = makeMockENM([
      { ref_id: 'bus_z', name: 'Szyna Z', voltage_kv: 20 },
      { ref_id: 'bus_a', name: 'Szyna A', voltage_kv: 110 },
    ]);
    const options = selectBusOptions(enm);
    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({ ref_id: 'bus_a', name: 'Szyna A', voltage_kv: 110 });
    expect(options[1]).toEqual({ ref_id: 'bus_z', name: 'Szyna Z', voltage_kv: 20 });
  });

  it('should include voltage_kv in each option', () => {
    const enm = makeMockENM([
      { ref_id: 'bus_1', name: 'GPZ', voltage_kv: 110 },
    ]);
    const options = selectBusOptions(enm);
    expect(options[0].voltage_kv).toBe(110);
  });

  it('shows topology helper buses as engineering terminals instead of raw downstream names', () => {
    const enm = makeMockENM([
      {
        ref_id: 'bus/abc123/downstream',
        name: 'Szyna wnstream',
        voltage_kv: 15,
        tags: ['helper_bus', 'topology_terminal'],
        meta: { visual_role: 'INLINE_TERMINAL' },
      },
    ]);

    expect(selectBusOptions(enm)[0]).toEqual({
      ref_id: 'bus/abc123/downstream',
      name: 'Zacisk końcowy odcinka SN',
      voltage_kv: 15,
    });
  });
});

// ---------------------------------------------------------------------------
// selectTrunks / selectBranches
// ---------------------------------------------------------------------------

describe('selectTrunks', () => {
  it('should return empty array for null logical views', () => {
    expect(selectTrunks(null)).toEqual([]);
  });

  it('should return trunks from logical views', () => {
    const views = makeMockLogicalViews({
      trunks: [{ id: 'trunk-1' }, { id: 'trunk-2' }] as unknown[],
    } as Partial<LogicalViewsV1>);
    expect(selectTrunks(views)).toHaveLength(2);
  });
});

describe('selectBranches', () => {
  it('should return empty array for null logical views', () => {
    expect(selectBranches(null)).toEqual([]);
  });

  it('should return branches from logical views', () => {
    const views = makeMockLogicalViews({
      branches: [{ id: 'br-1' }] as unknown[],
    } as Partial<LogicalViewsV1>);
    expect(selectBranches(views)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// selectTerminals / selectOpenTerminals
// ---------------------------------------------------------------------------

describe('selectTerminals', () => {
  it('should return empty array for null logical views', () => {
    expect(selectTerminals(null)).toEqual([]);
  });

  it('should return all terminals from logical views', () => {
    const terminals: TerminalRef[] = [
      { element_id: 'el-1', port_id: 'p-1', trunk_id: null, branch_id: null, status: 'OTWARTY' },
      { element_id: 'el-2', port_id: 'p-2', trunk_id: 'trunk-1', branch_id: 'br-1', status: 'ZAJETY' },
    ];
    const views = makeMockLogicalViews({ terminals } as Partial<LogicalViewsV1>);
    expect(selectTerminals(views)).toHaveLength(2);
  });
});

describe('selectOpenTerminals', () => {
  it('should return empty array for null logical views', () => {
    expect(selectOpenTerminals(null)).toEqual([]);
  });

  it('should filter only terminals with OTWARTY status', () => {
    const terminals: TerminalRef[] = [
      { element_id: 'el-1', port_id: 'p-1', trunk_id: null, branch_id: null, status: 'OTWARTY' },
      { element_id: 'el-2', port_id: 'p-2', trunk_id: 'trunk-1', branch_id: 'br-1', status: 'ZAJETY' },
      { element_id: 'el-3', port_id: 'p-3', trunk_id: null, branch_id: null, status: 'OTWARTY' },
    ];
    const views = makeMockLogicalViews({ terminals } as Partial<LogicalViewsV1>);

    const open = selectOpenTerminals(views);
    expect(open).toHaveLength(2);
    expect(open.every(t => t.status === 'OTWARTY')).toBe(true);
  });

  it('should return empty array when no terminals are open', () => {
    const terminals: TerminalRef[] = [
      { element_id: 'el-1', port_id: 'p-1', trunk_id: 'trunk-1', branch_id: 'br-1', status: 'ZAJETY' },
    ];
    const views = makeMockLogicalViews({ terminals } as Partial<LogicalViewsV1>);
    expect(selectOpenTerminals(views)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// selectIsReady / selectBlockerCount
// ---------------------------------------------------------------------------

describe('selectIsReady', () => {
  it('should return false for null readiness', () => {
    expect(selectIsReady(null)).toBe(false);
  });

  it('should return true when readiness.ready is true', () => {
    const readiness = makeMockReadiness({ ready: true });
    expect(selectIsReady(readiness)).toBe(true);
  });

  it('should return false when readiness.ready is false', () => {
    const readiness = makeMockReadiness({ ready: false });
    expect(selectIsReady(readiness)).toBe(false);
  });
});

describe('selectBlockerCount', () => {
  it('should return 0 for null readiness', () => {
    expect(selectBlockerCount(null)).toBe(0);
  });

  it('should count blockers', () => {
    const readiness = makeMockReadiness({
      blockers: [
        { code: 'E001', message_pl: 'Blocker 1' },
        { code: 'E002', message_pl: 'Blocker 2' },
        { code: 'E003', message_pl: 'Blocker 3' },
      ] as unknown[],
    } as Partial<ReadinessInfo>);
    expect(selectBlockerCount(readiness)).toBe(3);
  });

  it('should return 0 when no blockers', () => {
    const readiness = makeMockReadiness({ blockers: [] });
    expect(selectBlockerCount(readiness)).toBe(0);
  });
});
