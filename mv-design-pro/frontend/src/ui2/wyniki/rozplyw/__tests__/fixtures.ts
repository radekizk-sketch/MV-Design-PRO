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
import type { WalidacjaItem, WalidacjaResponse } from '../../jakosc/api';

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

/**
 * Pozycja walidacji energetycznej (R3-A / K1-G2) — kształt 1:1 z kontraktem
 * `WalidacjaItem` (`ui2/wyniki/jakosc/api.ts:89-103`, źródłowo
 * `analysis/energy_validation/serializer.py`). Domyślnie: przeciążona gałąź
 * liniowa L-1 (WARNING) — spójna z `powerFlowResultFixture().branch_results`.
 */
export function walidacjaItemFixture(over: Partial<WalidacjaItem> = {}): WalidacjaItem {
  return {
    check_type: 'BRANCH_LOADING',
    target_id: 'L-1',
    target_name: 'Linia L-1',
    observed_value: 92.0,
    unit: '%',
    limit_warn: 80.0,
    limit_fail: 100.0,
    margin_pct: 8.0,
    status: 'WARNING',
    why_pl: 'Obciążenie gałęzi 92% — powyżej progu ostrzeżenia 80%.',
    // Ksztalt 1:1 z buildera (R3-D): { tekst, latex } — patrz `jakosc/__tests__/fixtures.ts`.
    white_box: [
      { tekst: 'Wzor: obciazenie = S / S_dop * 100%', latex: '\\text{obciazenie} = \\frac{S}{S_{dop}} \\cdot 100\\%' },
      {
        tekst: 'Wynik: obciazenie = 92.00 %',
        latex: '\\text{obciazenie} = \\frac{S}{S_{dop}} \\cdot 100\\% = 92.00\\%',
      },
      { tekst: 'Progi: ostrzezenie 80.0 %, przekroczenie 100.0 %', latex: null },
      { tekst: 'Werdykt: OSTRZEZENIE', latex: null },
    ],
    ...over,
  };
}

/**
 * Pełna odpowiedź `GET /api/quality/energy-validation` (R3-A) — kontrakt
 * `WalidacjaResponse`. Domyślne pozycje pokrywają obie gałęzie fixtury rozpływu:
 * L-1 przeciążona (WARNING 92%), L-2 zgodna (PASS 65%).
 */
export function walidacjaResponseFixture(
  items: WalidacjaItem[] = [
    walidacjaItemFixture(),
    walidacjaItemFixture({
      target_id: 'L-2',
      target_name: 'Linia L-2',
      observed_value: 65.0,
      margin_pct: 35.0,
      status: 'PASS',
      why_pl: 'Obciążenie gałęzi 65% — poniżej progu ostrzeżenia 80%.',
      white_box: [
        { tekst: 'Wzor: obciazenie = S / S_dop * 100%', latex: '\\text{obciazenie} = \\frac{S}{S_{dop}} \\cdot 100\\%' },
        {
          tekst: 'Wynik: obciazenie = 65.00 %',
          latex: '\\text{obciazenie} = \\frac{S}{S_{dop}} \\cdot 100\\% = 65.00\\%',
        },
        { tekst: 'Progi: ostrzezenie 80.0 %, przekroczenie 100.0 %', latex: null },
        { tekst: 'Werdykt: ZGODNE', latex: null },
      ],
    }),
  ],
): WalidacjaResponse {
  const pass = items.filter((i) => i.status === 'PASS').length;
  const warning = items.filter((i) => i.status === 'WARNING').length;
  const fail = items.filter((i) => i.status === 'FAIL').length;
  const notComputed = items.filter((i) => i.status === 'NOT_COMPUTED').length;
  return {
    context: {
      project_name: 'Sieć testowa',
      case_name: 'sc-1',
      case_id: 'case-1',
      run_timestamp: '2026-07-15T10:00:05+00:00',
      snapshot_hash: 'snap-pf-1',
      run_id: 'pf-run-1',
    },
    config: {
      loading_warn_pct: 80.0,
      loading_fail_pct: 100.0,
      voltage_warn_pct: 5.0,
      voltage_fail_pct: 10.0,
      loss_warn_pct: 5.0,
      loss_fail_pct: 10.0,
    },
    items,
    summary: {
      pass_count: pass,
      warning_count: warning,
      fail_count: fail,
      not_computed_count: notComputed,
      worst_item_target_id: items[0]?.target_id ?? null,
      worst_item_margin_pct: items[0]?.margin_pct ?? null,
    },
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
