/*
 * Fixture 1:1 realnego kształtu wyniku porównania A/B rozpływu (karta E12.1 §3):
 * `PowerFlowComparisonResult` (`ui/power-flow-comparison/types.ts:174-186`) z
 * WSZYSTKIMI polami kontraktu — bus_diffs (`types.ts:79-93`), branch_diffs
 * (`types.ts:103-123`), ranking (`types.ts:133-139`), summary (`types.ts:149-165`).
 * Lista przebiegów: `PowerFlowRunItem` (`types.ts:227-238`).
 */

import type {
  PowerFlowBranchDiffRow,
  PowerFlowBusDiffRow,
  PowerFlowComparisonResult,
  PowerFlowComparisonSummary,
  PowerFlowRankingIssue,
  PowerFlowRunItem,
} from '../../../../ui/power-flow-comparison/types';

export function busDiffFixture(over: Partial<PowerFlowBusDiffRow> = {}): PowerFlowBusDiffRow {
  return {
    bus_id: 'SZYNA-GPZ',
    v_pu_a: 1.02,
    v_pu_b: 0.965,
    angle_deg_a: -2.5,
    angle_deg_b: -4.1,
    p_injected_mw_a: 10.0,
    p_injected_mw_b: 10.4,
    q_injected_mvar_a: 2.0,
    q_injected_mvar_b: 2.3,
    delta_v_pu: -0.055,
    delta_angle_deg: -1.6,
    delta_p_mw: 0.4,
    delta_q_mvar: 0.3,
    ...over,
  };
}

export function branchDiffFixture(
  over: Partial<PowerFlowBranchDiffRow> = {},
): PowerFlowBranchDiffRow {
  return {
    branch_id: 'LINIA-GPZ-ST1',
    p_from_mw_a: 8.2,
    p_from_mw_b: 8.9,
    q_from_mvar_a: 1.1,
    q_from_mvar_b: 1.3,
    p_to_mw_a: -8.0,
    p_to_mw_b: -8.6,
    q_to_mvar_a: -0.9,
    q_to_mvar_b: -1.0,
    losses_p_mw_a: 0.2,
    losses_p_mw_b: 0.3,
    losses_q_mvar_a: 0.2,
    losses_q_mvar_b: 0.3,
    delta_p_from_mw: 0.7,
    delta_q_from_mvar: 0.2,
    delta_p_to_mw: -0.6,
    delta_q_to_mvar: -0.1,
    delta_losses_p_mw: 0.1,
    delta_losses_q_mvar: 0.1,
    ...over,
  };
}

export function rankingFixture(): PowerFlowRankingIssue[] {
  return [
    {
      issue_code: 'VOLTAGE_DELTA_HIGH',
      severity: 5,
      element_ref: 'SZYNA-GPZ',
      description_pl: 'Napięcie na szynie GPZ spadło o ponad 5% względem wariantu A.',
      evidence_ref: 0,
    },
    {
      issue_code: 'LOSSES_INCREASED',
      severity: 3,
      element_ref: 'LINIA-GPZ-ST1',
      description_pl: 'Straty czynne na linii GPZ–ST1 wzrosły w wariancie B.',
      evidence_ref: 1,
    },
  ];
}

export function summaryFixture(
  over: Partial<PowerFlowComparisonSummary> = {},
): PowerFlowComparisonSummary {
  return {
    total_buses: 2,
    total_branches: 1,
    converged_a: true,
    converged_b: true,
    total_losses_p_mw_a: 0.2,
    total_losses_p_mw_b: 0.3,
    delta_total_losses_p_mw: 0.1,
    max_delta_v_pu: -0.055,
    max_delta_angle_deg: -1.6,
    total_issues: 2,
    critical_issues: 1,
    major_issues: 0,
    moderate_issues: 1,
    minor_issues: 0,
    ...over,
  };
}

export function comparisonFixture(
  over: Partial<PowerFlowComparisonResult> = {},
): PowerFlowComparisonResult {
  return {
    comparison_id: 'cmp-001',
    run_a_id: 'run-a',
    run_b_id: 'run-b',
    project_id: 'proj-1',
    bus_diffs: [
      busDiffFixture(),
      busDiffFixture({
        bus_id: 'SZYNA-ST1',
        v_pu_a: 1.0,
        v_pu_b: 0.998,
        angle_deg_a: -3.0,
        angle_deg_b: -3.2,
        delta_v_pu: -0.002,
        delta_angle_deg: -0.2,
      }),
    ],
    branch_diffs: [branchDiffFixture()],
    ranking: rankingFixture(),
    summary: summaryFixture(),
    input_hash: 'hash-abc',
    created_at: '2026-07-10T09:30:00Z',
    ...over,
  };
}

export function runFixture(over: Partial<PowerFlowRunItem> = {}): PowerFlowRunItem {
  return {
    id: 'run-a',
    project_id: 'proj-1',
    study_case_id: 'case-1',
    status: 'FINISHED',
    result_status: 'OK',
    created_at: '2026-07-10T08:15:00Z',
    finished_at: '2026-07-10T08:16:00Z',
    input_hash: 'hash-a',
    converged: true,
    iterations: 4,
    ...over,
  };
}

export function runsFixture(): PowerFlowRunItem[] {
  return [
    runFixture(),
    runFixture({
      id: 'run-b',
      created_at: '2026-07-10T09:20:00Z',
      finished_at: '2026-07-10T09:21:00Z',
      input_hash: 'hash-b',
      converged: false,
    }),
  ];
}
