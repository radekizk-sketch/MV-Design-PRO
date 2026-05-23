/**
 * SC Comparison Store Tests -- PR-21
 *
 * Tests for comparison Zustand store.
 * Verifies deterministic sorting, state transitions, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useComparisonStore } from '../sldDeltaOverlay.store';
import type { SCComparison, ComparisonListResponse } from '../sldDeltaOverlay.types';

// Mock the API module
vi.mock('../sldDeltaOverlay.api', () => ({
  listComparisons: vi.fn(),
  createComparison: vi.fn(),
  getComparison: vi.fn(),
  fetchDeltaOverlay: vi.fn(),
}));

import * as api from '../sldDeltaOverlay.api';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const COMPARISON_A: SCComparison = {
  comparison_id: 'comp-aaa',
  study_case_id: 'case-001',
  analysis_type: 'SC_3F',
  base_scenario_id: 'scen-1',
  other_scenario_id: 'scen-2',
  created_at: '2025-01-15T10:00:00Z',
  input_hash: 'hash-aaa-111',
  deltas_global: {
    ikss_a: { base: 1000, other: 1050, abs: 50, rel: 0.05 },
    sk_mva: { base: 500, other: 500, abs: 0, rel: 0 },
  },
  deltas_by_source: [
    {
      element_ref: 'source_A',
      deltas: {
        i_contrib_a: { base: 600, other: 630, abs: 30, rel: 0.05 },
      },
    },
  ],
  deltas_by_branch: [],
};

const COMPARISON_B: SCComparison = {
  comparison_id: 'comp-bbb',
  study_case_id: 'case-001',
  analysis_type: 'SC_3F',
  base_scenario_id: 'scen-3',
  other_scenario_id: 'scen-4',
  created_at: '2025-01-15T12:00:00Z',
  input_hash: 'hash-bbb-222',
  deltas_global: {},
  deltas_by_source: [],
  deltas_by_branch: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComparisonStore', () => {
  beforeEach(() => {
    useComparisonStore.setState({
      studyCaseId: null,
      comparisons: [],
      selectedComparisonId: null,
      selectedComparison: null,
      isLoading: false,
      isCreating: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('starts with empty state', () => {
      const state = useComparisonStore.getState();
      expect(state.studyCaseId).toBeNull();
      expect(state.comparisons).toEqual([]);
      expect(state.selectedComparisonId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('loadComparisons', () => {
    it('loads and sorts comparisons by created_at descending', async () => {
      const response: ComparisonListResponse = {
        comparisons: [COMPARISON_A, COMPARISON_B],
        count: 2,
      };
      vi.mocked(api.listComparisons).mockResolvedValue(response);

      await useComparisonStore.getState().loadComparisons('case-001');

      const state = useComparisonStore.getState();
      expect(state.comparisons).toHaveLength(2);
      // B (12:00) before A (10:00)
      expect(state.comparisons[0].comparison_id).toBe('comp-bbb');
      expect(state.comparisons[1].comparison_id).toBe('comp-aaa');
      expect(state.isLoading).toBe(false);
    });

    it('deterministic sort: repeated loads produce same order', async () => {
      const response: ComparisonListResponse = {
        comparisons: [COMPARISON_B, COMPARISON_A],
        count: 2,
      };
      vi.mocked(api.listComparisons).mockResolvedValue(response);

      await useComparisonStore.getState().loadComparisons('case-001');
      const first = [...useComparisonStore.getState().comparisons];

      await useComparisonStore.getState().loadComparisons('case-001');
      const second = [...useComparisonStore.getState().comparisons];

      expect(first.map((c) => c.comparison_id)).toEqual(
        second.map((c) => c.comparison_id)
      );
    });

    it('handles load error', async () => {
      vi.mocked(api.listComparisons).mockRejectedValue(
        new Error('Blad polaczenia')
      );

      await useComparisonStore.getState().loadComparisons('case-001');

      const state = useComparisonStore.getState();
      expect(state.error).toBe('Blad polaczenia');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('selectComparison', () => {
    it('sets selectedComparisonId', async () => {
      vi.mocked(api.getComparison).mockResolvedValue(COMPARISON_A);

      useComparisonStore.getState().selectComparison('comp-aaa');

      expect(
        useComparisonStore.getState().selectedComparisonId
      ).toBe('comp-aaa');
    });

    it('clears selection when null', () => {
      useComparisonStore.setState({ selectedComparisonId: 'comp-aaa' });
      useComparisonStore.getState().selectComparison(null);

      expect(
        useComparisonStore.getState().selectedComparisonId
      ).toBeNull();
      expect(
        useComparisonStore.getState().selectedComparison
      ).toBeNull();
    });
  });

  describe('clearError', () => {
    it('clears the error state', () => {
      useComparisonStore.setState({ error: 'Jakis blad' });
      useComparisonStore.getState().clearError();
      expect(useComparisonStore.getState().error).toBeNull();
    });
  });
});
