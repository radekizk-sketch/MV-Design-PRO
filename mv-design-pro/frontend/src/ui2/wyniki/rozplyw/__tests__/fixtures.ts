/*
 * Fixture 1:1 realnego kształtu wyniku rozpływu (karta E8.1 §3 kryterium 3):
 * `PowerFlowResultV1` z `ui/power-flow-results/types.ts:108-118` — WSZYSTKIE pola
 * kontraktu obecne (result_version, converged, iterations_count, tolerance_used,
 * base_mva, slack_bus_id, bus_results, branch_results, summary). Wiersz szyny =
 * `PowerFlowBusResult` (`types.ts:60-67`), gałęzi = `PowerFlowBranchResult`
 * (`types.ts:75-83`), podsumowanie = `PowerFlowSummary` (`types.ts:92-99`).
 */

import type {
  PowerFlowBranchResult,
  PowerFlowBusResult,
  PowerFlowResultV1,
  PowerFlowRunHeader,
} from '../../../../ui/power-flow-results/types';

export function busResultFixture(over: Partial<PowerFlowBusResult> = {}): PowerFlowBusResult {
  return {
    bus_id: 'SZ-GPZ',
    v_pu: 1.0,
    angle_deg: 0.0,
    p_injected_mw: 12.345,
    q_injected_mvar: 3.21,
    ...over,
  };
}

export function branchResultFixture(
  over: Partial<PowerFlowBranchResult> = {},
): PowerFlowBranchResult {
  return {
    branch_id: 'L-1',
    p_from_mw: 10.5,
    q_from_mvar: 2.4,
    p_to_mw: -10.4,
    q_to_mvar: -2.3,
    losses_p_mw: 0.1,
    losses_q_mvar: 0.1,
    ...over,
  };
}

export function powerFlowResultFixture(
  over: Partial<PowerFlowResultV1> = {},
): PowerFlowResultV1 {
  return {
    result_version: '1.0',
    converged: true,
    iterations_count: 4,
    tolerance_used: 1e-6,
    base_mva: 100.0,
    slack_bus_id: 'SZ-GPZ',
    bus_results: [
      busResultFixture(),
      busResultFixture({
        bus_id: 'SZ-ST1',
        v_pu: 0.982,
        angle_deg: -1.24,
        p_injected_mw: -4.5,
        q_injected_mvar: -1.1,
      }),
      busResultFixture({
        bus_id: 'SZ-ST2',
        v_pu: 0.941,
        angle_deg: -2.87,
        p_injected_mw: -6.0,
        q_injected_mvar: -1.9,
      }),
    ],
    branch_results: [
      branchResultFixture(),
      branchResultFixture({
        branch_id: 'L-2',
        p_from_mw: 4.5,
        q_from_mvar: 1.1,
        p_to_mw: -4.42,
        q_to_mvar: -1.06,
        losses_p_mw: 0.08,
        losses_q_mvar: 0.04,
      }),
    ],
    summary: {
      total_losses_p_mw: 0.18,
      total_losses_q_mvar: 0.14,
      min_v_pu: 0.941,
      max_v_pu: 1.0,
      slack_p_mw: 10.5,
      slack_q_mvar: 2.4,
    },
    ...over,
  };
}

/** Nagłówek przebiegu — kontrakt `PowerFlowRunHeader` (`types.ts:27-43`). */
export function runHeaderFixture(over: Partial<PowerFlowRunHeader> = {}): PowerFlowRunHeader {
  return {
    id: 'pf-run-1',
    project_id: 'proj-1',
    study_case_id: 'sc-1',
    status: 'DONE',
    result_status: 'FRESH',
    created_at: '2026-07-15T10:00:00Z',
    finished_at: '2026-07-15T10:00:05Z',
    input_hash: 'abc123',
    converged: true,
    iterations: 4,
    ...over,
  };
}
