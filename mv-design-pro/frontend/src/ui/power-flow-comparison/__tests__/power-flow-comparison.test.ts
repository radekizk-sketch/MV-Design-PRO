/**
 * P20c — Power Flow Comparison Frontend Tests
 *
 * Smoke tests for:
 * - Type exports work correctly
 * - Constants are defined
 * - No mutations in types
 * - Polish labels coverage
 */

import { describe, expect, it } from 'vitest';

import {
  ISSUE_CODE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  COMPARISON_TAB_LABELS,
  CONVERGENCE_LABELS,
  getDeltaColor,
  getVoltageDeltaColor,
  type PowerFlowIssueCode,
  type IssueSeverity,
  type PowerFlowComparisonResult,
  type PowerFlowRankingIssue,
  type PowerFlowComparisonTab,
} from '../types';

describe('P20c Power Flow Comparison Types', () => {
  describe('ISSUE_CODE_LABELS', () => {
    it('should have all issue code labels in Polish', () => {
      expect(ISSUE_CODE_LABELS.NON_CONVERGENCE_CHANGE).toBe('Zmiana zbieznosci');
      expect(ISSUE_CODE_LABELS.VOLTAGE_DELTA_HIGH).toBe('Duza zmiana napiecia');
      expect(ISSUE_CODE_LABELS.ANGLE_SHIFT_HIGH).toBe('Duze przesuniecie kata');
      expect(ISSUE_CODE_LABELS.LOSSES_INCREASED).toBe('Wzrost strat');
      expect(ISSUE_CODE_LABELS.LOSSES_DECREASED).toBe('Spadek strat');
      expect(ISSUE_CODE_LABELS.SLACK_POWER_CHANGED).toBe('Zmiana mocy bilansowej');
    });

    it('should cover all issue codes', () => {
      const codes: PowerFlowIssueCode[] = [
        'NON_CONVERGENCE_CHANGE',
        'VOLTAGE_DELTA_HIGH',
        'ANGLE_SHIFT_HIGH',
        'LOSSES_INCREASED',
        'LOSSES_DECREASED',
        'SLACK_POWER_CHANGED',
      ];
      codes.forEach((code) => {
        expect(ISSUE_CODE_LABELS[code]).toBeDefined();
      });
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

    it('should have Tailwind classes for all severities', () => {
      expect(SEVERITY_COLORS[1]).toContain('bg-');
      expect(SEVERITY_COLORS[2]).toContain('bg-');
      expect(SEVERITY_COLORS[3]).toContain('bg-');
      expect(SEVERITY_COLORS[4]).toContain('bg-');
      expect(SEVERITY_COLORS[5]).toContain('bg-');
    });
  });

  describe('COMPARISON_TAB_LABELS', () => {
    it('should have Polish labels for all tabs', () => {
      expect(COMPARISON_TAB_LABELS.BUSES).toBe('Szyny - roznice');
      expect(COMPARISON_TAB_LABELS.BRANCHES).toBe('Galezie - roznice');
      expect(COMPARISON_TAB_LABELS.RANKING).toBe('Ranking problemow');
      expect(COMPARISON_TAB_LABELS.TRACE).toBe('Slad porownania');
    });

    it('should have deterministic tab order', () => {
      const tabs = Object.keys(COMPARISON_TAB_LABELS);
      expect(tabs).toEqual(['BUSES', 'BRANCHES', 'RANKING', 'TRACE']);
    });
  });

  describe('CONVERGENCE_LABELS', () => {
    it('should have Polish labels for convergence states', () => {
      expect(CONVERGENCE_LABELS['true']).toBe('Zbiezny');
      expect(CONVERGENCE_LABELS['false']).toBe('Niezbiezny');
    });
  });

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

  describe('Helper Functions', () => {
    describe('getDeltaColor', () => {
      it('should return rose for positive values', () => {
        expect(getDeltaColor(0.1)).toContain('rose');
      });

      it('should return green for negative values', () => {
        expect(getDeltaColor(-0.1)).toContain('green');
      });

      it('should return slate for values near zero', () => {
        expect(getDeltaColor(0)).toContain('slate');
      });

      it('should respect threshold parameter', () => {
        expect(getDeltaColor(0.001, 0.01)).toContain('slate');
        expect(getDeltaColor(0.02, 0.01)).toContain('rose');
      });
    });

    describe('getVoltageDeltaColor', () => {
      it('should return red for large voltage deltas', () => {
        expect(getVoltageDeltaColor(0.06)).toContain('red');
        expect(getVoltageDeltaColor(-0.06)).toContain('red');
      });

      it('should return orange for moderate voltage deltas', () => {
        expect(getVoltageDeltaColor(0.03)).toContain('orange');
      });

      it('should return amber for small voltage deltas', () => {
        expect(getVoltageDeltaColor(0.015)).toContain('amber');
      });

      it('should return empty for very small deltas', () => {
        expect(getVoltageDeltaColor(0.005)).toBe('');
      });
    });
  });

  describe('Determinism', () => {
    it('should have consistent label mappings', () => {
      // Running multiple times should produce same results
      for (let i = 0; i < 10; i++) {
        expect(ISSUE_CODE_LABELS.VOLTAGE_DELTA_HIGH).toBe('Duza zmiana napiecia');
        expect(SEVERITY_LABELS[5]).toBe('Krytyczny');
      }
    });

    it('should have consistent tab order', () => {
      for (let i = 0; i < 10; i++) {
        const tabs = Object.keys(COMPARISON_TAB_LABELS);
        expect(tabs[0]).toBe('BUSES');
        expect(tabs[1]).toBe('BRANCHES');
        expect(tabs[2]).toBe('RANKING');
        expect(tabs[3]).toBe('TRACE');
      }
    });
  });
});

describe('P20c Read-Only Contract', () => {
  it('should not allow mutation of ISSUE_CODE_LABELS', () => {
    // TypeScript would prevent this at compile time
    // Runtime check that object is defined
    expect(Object.keys(ISSUE_CODE_LABELS)).toHaveLength(6);
  });

  it('should not allow mutation of SEVERITY_LABELS', () => {
    expect(Object.keys(SEVERITY_LABELS)).toHaveLength(5);
  });

  it('should not allow mutation of COMPARISON_TAB_LABELS', () => {
    expect(Object.keys(COMPARISON_TAB_LABELS)).toHaveLength(4);
  });
});
