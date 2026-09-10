/**
 * P20c — Power Flow Comparison Frontend Tests
 *
 * Smoke tests for:
 * - Type exports work correctly (contract shape compiles)
 *
 * Historia (karta CV-3.3-B2, D3): `ISSUE_CODE_LABELS`/`SEVERITY_LABELS`/
 * `SEVERITY_COLORS`/`PowerFlowComparisonTab`/`COMPARISON_TAB_LABELS`/
 * `CONVERGENCE_LABELS`/`getDeltaColor`/`getVoltageDeltaColor` skasowane z
 * `../types` jako martwe eksporty — jedyny konsument, `PowerFlowComparisonPage.tsx`,
 * jest skasowany (ekran ui2 ma własny, żywy mechanizm zakładek/zbieżności/tagów,
 * patrz `ui2/wyniki/porownanie`). Testy tych stałych/funkcji poszły z nimi —
 * test istniejący wyłącznie po to, by przetestować martwą stałą, jest sam
 * martwym testem.
 */

import { describe, expect, it } from 'vitest';

import type {
  PowerFlowComparisonResult,
  PowerFlowRankingIssue,
  RunProvenance,
} from '../types';

/**
 * Proweniencja biegu R1 minimalna do testu kształtu typu (B1, karta CV-3.3-B).
 * `PowerFlowComparisonResult.provenance_a/b` jest polem WYMAGANYM (dowód CO
 * było porównywane) — ten fixture istnieje wyłącznie po to, by literał niżej
 * pozostał zgodny z kontraktem, nie testuje treści proweniencji.
 */
function provenanceFixture(runId: string): RunProvenance {
  return {
    run_id: runId,
    analysis_type: 'PF',
    status: 'FINISHED',
    snapshot_hash: 'snap-hash',
    input_hash: 'hash',
    finished_at: '2024-01-01T00:00:00Z',
    envelope: null,
  };
}

describe('P20c Power Flow Comparison Types', () => {
  describe('Type Structure', () => {
    it('should allow creating PowerFlowComparisonResult', () => {
      const result: PowerFlowComparisonResult = {
        comparison_id: 'test-id',
        run_a_id: 'run-a',
        run_b_id: 'run-b',
        project_id: 'project-1',
        bus_diffs: [],
        branch_diffs: [],
        ranking: [],
        summary: {
          total_buses: 0,
          total_branches: 0,
          converged_a: true,
          converged_b: true,
          total_losses_p_mw_a: 0,
          total_losses_p_mw_b: 0,
          delta_total_losses_p_mw: 0,
          max_delta_v_pu: 0,
          max_delta_angle_deg: 0,
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
      expect(result.bus_diffs).toHaveLength(0);
    });

    it('should allow creating PowerFlowRankingIssue', () => {
      const issue: PowerFlowRankingIssue = {
        issue_code: 'VOLTAGE_DELTA_HIGH',
        severity: 4,
        element_ref: 'BUS_001',
        description_pl: 'Duza zmiana napiecia',
        evidence_ref: 0,
      };

      expect(issue.issue_code).toBe('VOLTAGE_DELTA_HIGH');
      expect(issue.severity).toBe(4);
    });
  });
});
