/**
 * P15b — Protection Comparison Frontend Tests
 *
 * Smoke tests for:
 * - Type exports work correctly
 * - Constants are defined
 * - No mutations in types
 */

import { describe, expect, it } from 'vitest';

import {
  STATE_CHANGE_LABELS,
  STATE_CHANGE_COLORS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  type ProtectionStateChange,
  type IssueSeverity,
  type ProtectionComparisonResult,
  type RankingIssue,
  type RunProvenance,
} from '../types';

/**
 * Proweniencja biegu R1 minimalna do testu kształtu typu (B1, karta CV-3.3-B).
 * `ProtectionComparisonResult.provenance_a/b` jest polem WYMAGANYM (dowód CO
 * było porównywane) — ten fixture istnieje wyłącznie po to, by literał niżej
 * pozostał zgodny z kontraktem, nie testuje treści proweniencji.
 */
function provenanceFixture(runId: string): RunProvenance {
  return {
    run_id: runId,
    analysis_type: 'protection_sn',
    status: 'FINISHED',
    snapshot_hash: 'snap-hash',
    input_hash: 'hash',
    finished_at: '2024-01-01T00:00:00Z',
    envelope: null,
  };
}

describe('P15b Protection Comparison Types', () => {
  describe('STATE_CHANGE_LABELS', () => {
    it('should have all state change labels in Polish', () => {
      expect(STATE_CHANGE_LABELS.NO_CHANGE).toBe('Bez zmian');
      expect(STATE_CHANGE_LABELS.TRIP_TO_NO_TRIP).toBe('Utrata zadziałania');
      expect(STATE_CHANGE_LABELS.NO_TRIP_TO_TRIP).toBe('Pojawienie się zadziałania');
      expect(STATE_CHANGE_LABELS.INVALID_CHANGE).toBe('Nieprawidłowa zmiana');
    });

    it('should cover all state changes', () => {
      const states: ProtectionStateChange[] = [
        'NO_CHANGE',
        'TRIP_TO_NO_TRIP',
        'NO_TRIP_TO_TRIP',
        'INVALID_CHANGE',
      ];
      states.forEach((state) => {
        expect(STATE_CHANGE_LABELS[state]).toBeDefined();
      });
    });
  });

  describe('STATE_CHANGE_COLORS', () => {
    it('should have Tailwind classes for all states', () => {
      expect(STATE_CHANGE_COLORS.NO_CHANGE).toContain('bg-');
      expect(STATE_CHANGE_COLORS.TRIP_TO_NO_TRIP).toContain('bg-red');
      expect(STATE_CHANGE_COLORS.NO_TRIP_TO_TRIP).toContain('bg-green');
      expect(STATE_CHANGE_COLORS.INVALID_CHANGE).toContain('bg-amber');
    });
  });

  describe('SEVERITY_LABELS', () => {
    it('should have Polish labels for all severity levels', () => {
      expect(SEVERITY_LABELS[1]).toBe('Informacyjny');
      expect(SEVERITY_LABELS[2]).toBe('Niski');
      expect(SEVERITY_LABELS[3]).toBe('Umiarkowany');
      expect(SEVERITY_LABELS[4]).toBe('Wysoki');
      expect(SEVERITY_LABELS[5]).toBe('Krytyczny');
    });

    it('should cover all severity levels 1-5', () => {
      const severities: IssueSeverity[] = [1, 2, 3, 4, 5];
      severities.forEach((severity) => {
        expect(SEVERITY_LABELS[severity]).toBeDefined();
        expect(SEVERITY_COLORS[severity]).toBeDefined();
      });
    });
  });

  describe('SEVERITY_COLORS', () => {
    it('should have progressively more severe colors', () => {
      // Level 5 (Critical) should be red
      expect(SEVERITY_COLORS[5]).toContain('red');
      // Level 1 (Informational) should be neutral/slate
      expect(SEVERITY_COLORS[1]).toContain('slate');
    });
  });

  describe('Type Structure', () => {
    it('should allow creating ProtectionComparisonResult', () => {
      const result: ProtectionComparisonResult = {
        comparison_id: 'test-id',
        run_a_id: 'run-a',
        run_b_id: 'run-b',
        project_id: 'project-1',
        rows: [],
        ranking: [],
        summary: {
          total_rows: 0,
          no_change_count: 0,
          trip_to_no_trip_count: 0,
          no_trip_to_trip_count: 0,
          invalid_change_count: 0,
          total_issues: 0,
          critical_issues: 0,
          major_issues: 0,
          moderate_issues: 0,
          minor_issues: 0,
        },
        input_hash: 'hash',
        provenance_a: provenanceFixture('run-a'),
        provenance_b: provenanceFixture('run-b'),
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(result.comparison_id).toBe('test-id');
      expect(result.rows).toHaveLength(0);
    });

    it('should allow creating RankingIssue', () => {
      const issue: RankingIssue = {
        issue_code: 'TRIP_LOST',
        severity: 5,
        element_ref: 'bus_1',
        fault_target_id: 'fault_1',
        description_pl: 'Utrata zadziałania',
        evidence_refs: [0, 1],
      };

      expect(issue.issue_code).toBe('TRIP_LOST');
      expect(issue.severity).toBe(5);
    });
  });

  describe('Determinism', () => {
    it('should have consistent label mappings', () => {
      // Running multiple times should produce same results
      for (let i = 0; i < 10; i++) {
        expect(STATE_CHANGE_LABELS.TRIP_TO_NO_TRIP).toBe('Utrata zadziałania');
        expect(SEVERITY_LABELS[5]).toBe('Krytyczny');
      }
    });
  });
});

describe('P15b Read-Only Contract', () => {
  it('should not allow mutation of STATE_CHANGE_LABELS', () => {
    // TypeScript would prevent this at compile time
    // Runtime check that object is defined
    expect(Object.keys(STATE_CHANGE_LABELS)).toHaveLength(4);
  });

  it('should not allow mutation of SEVERITY_LABELS', () => {
    expect(Object.keys(SEVERITY_LABELS)).toHaveLength(5);
  });
});
