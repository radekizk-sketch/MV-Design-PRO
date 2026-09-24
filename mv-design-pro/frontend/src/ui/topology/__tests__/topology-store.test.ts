/**
 * Topology Store Tests — PR-9
 *
 * Unit tests for topology Zustand store.
 * Tests selectors, determinism, and state management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTopologyStore } from '../store';
import type { TopologyGraphSummary } from '../../../types/enm';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_SUMMARY: TopologyGraphSummary = {
  case_id: 'test-case-1',
  enm_revision: 1,
  bus_count: 4,
  branch_count: 3,
  transformer_count: 0,
  source_count: 1,
  load_count: 1,
  generator_count: 0,
  measurement_count: 0,
  protection_count: 0,
  adjacency: [
    { bus_ref: 'bus_1', neighbor_ref: 'bus_2', via_ref: 'line_1', via_type: 'line_overhead' },
    { bus_ref: 'bus_1', neighbor_ref: 'bus_3', via_ref: 'line_2', via_type: 'line_overhead' },
    { bus_ref: 'bus_2', neighbor_ref: 'bus_1', via_ref: 'line_1', via_type: 'line_overhead' },
    { bus_ref: 'bus_2', neighbor_ref: 'bus_4', via_ref: 'line_3', via_type: 'line_overhead' },
    { bus_ref: 'bus_3', neighbor_ref: 'bus_1', via_ref: 'line_2', via_type: 'line_overhead' },
    { bus_ref: 'bus_4', neighbor_ref: 'bus_2', via_ref: 'line_3', via_type: 'line_overhead' },
  ],
  spine: [
    { bus_ref: 'bus_1', depth: 0, is_source: true, children_refs: ['bus_2'] },
    { bus_ref: 'bus_2', depth: 1, is_source: false, children_refs: ['bus_4'] },
    { bus_ref: 'bus_4', depth: 2, is_source: false, children_refs: [] },
  ],
  lateral_roots: ['bus_3'],
  is_radial: true,
  has_cycles: false,
};

const MOCK_SUMMARY_2: TopologyGraphSummary = {
  case_id: 'test-case-2',
  enm_revision: 1,
  bus_count: 2,
  branch_count: 1,
  transformer_count: 0,
  source_count: 1,
  load_count: 0,
  generator_count: 0,
  measurement_count: 0,
  protection_count: 0,
  adjacency: [
    { bus_ref: 'bus_a', neighbor_ref: 'bus_b', via_ref: 'br_1', via_type: 'cable' },
    { bus_ref: 'bus_b', neighbor_ref: 'bus_a', via_ref: 'br_1', via_type: 'cable' },
  ],
  spine: [
    { bus_ref: 'bus_a', depth: 0, is_source: true, children_refs: ['bus_b'] },
    { bus_ref: 'bus_b', depth: 1, is_source: false, children_refs: [] },
  ],
  lateral_roots: [],
  is_radial: true,
  has_cycles: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopologyStore', () => {
  beforeEach(() => {
    // Reset store state
    useTopologyStore.setState({
      summary: null,
      loading: false,
      error: null,
      lastOpIssues: [],
    });
  });

  describe('initial state', () => {
    it('should have null summary', () => {
      expect(useTopologyStore.getState().summary).toBeNull();
    });

    it('should not be loading', () => {
      expect(useTopologyStore.getState().loading).toBe(false);
    });

    it('should have no error', () => {
      expect(useTopologyStore.getState().error).toBeNull();
    });

    it('should have empty lastOpIssues', () => {
      expect(useTopologyStore.getState().lastOpIssues).toEqual([]);
    });
  });

  describe('selectors', () => {
    it('selectSpineSorted should return spine sorted by depth', () => {
      useTopologyStore.setState({ summary: MOCK_SUMMARY });
      const spine = useTopologyStore.getState().summary?.spine ?? [];
      const sorted = [...spine].sort((a, b) => a.depth - b.depth);
      expect(sorted.map((s) => s.bus_ref)).toEqual(['bus_1', 'bus_2', 'bus_4']);
    });

    it('selectIsRadial should return true for radial network', () => {
      useTopologyStore.setState({ summary: MOCK_SUMMARY });
      expect(useTopologyStore.getState().summary?.is_radial).toBe(true);
    });

    it('selectAdjacencyFor should find correct neighbors', () => {
      useTopologyStore.setState({ summary: MOCK_SUMMARY });
      const adjEntries = MOCK_SUMMARY.adjacency.filter((a) => a.bus_ref === 'bus_2');
      expect(adjEntries.length).toBeGreaterThan(0);
      const neighborRefs = adjEntries.map((a) => a.neighbor_ref);
      expect(neighborRefs).toEqual(expect.arrayContaining(['bus_1', 'bus_4']));
      const viaRefs = adjEntries.map((a) => a.via_ref);
      expect(viaRefs).toEqual(expect.arrayContaining(['line_1', 'line_3']));
    });
  });

  describe('determinism', () => {
    it('identical summary should produce identical JSON serialization', () => {
      const json1 = JSON.stringify(MOCK_SUMMARY);
      const json2 = JSON.stringify(MOCK_SUMMARY);
      expect(json1).toBe(json2);
    });

    it('spine nodes should maintain insertion order by depth', () => {
      const depths = MOCK_SUMMARY.spine.map((s) => s.depth);
      expect(depths).toEqual([0, 1, 2]);
    });

    it('lateral_roots should be deterministically sortable', () => {
      const laterals = [...MOCK_SUMMARY.lateral_roots].sort();
      expect(laterals).toEqual(['bus_3']);
    });
  });

  describe('state management', () => {
    it('clearError should reset error to null', () => {
      useTopologyStore.setState({ error: 'Test error' });
      useTopologyStore.getState().clearError();
      expect(useTopologyStore.getState().error).toBeNull();
    });

    it('setting summary should update state', () => {
      useTopologyStore.setState({ summary: MOCK_SUMMARY });
      expect(useTopologyStore.getState().summary).toEqual(MOCK_SUMMARY);
    });

    it('replacing summary should fully overwrite previous', () => {
      useTopologyStore.setState({ summary: MOCK_SUMMARY });
      useTopologyStore.setState({ summary: MOCK_SUMMARY_2 });
      expect(useTopologyStore.getState().summary?.adjacency.length).toBe(2);
      expect(useTopologyStore.getState().summary?.spine.length).toBe(2);
    });
  });
});
