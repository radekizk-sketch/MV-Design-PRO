/*
 * Fixtures 1:1 z realnymi kształtami odpowiedzi końcówek jakości (karta E8.4).
 * Wiarygodność: `ShortCircuitSanityVerdict.to_dict` + identyfikacja węzła
 * (`analysis/sanity_bounds/short_circuit_bounds.py`, `application/analyses/
 * sanity_bounds.py`). Walidacja: `serializer.view_to_dict`
 * (`analysis/energy_validation/serializer.py`, `models.py`).
 */

import type {
  ExecutionRun,
} from '../../../../ui/study-cases/types';
import type { WalidacjaResponse, WiarygodnoscResponse } from '../api';

export const WIARYGODNOSC_FIXTURE: WiarygodnoscResponse = {
  analysis_id: '11111111-1111-1111-1111-111111111111',
  context: {
    project_name: 'Sieć testowa',
    case_name: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:00:00+00:00',
    snapshot_id: 'snap-abc',
    trace_id: '11111111-1111-1111-1111-111111111111',
  },
  items: [
    {
      target_id: 'bus-A',
      element_id: 'bus-A',
      target_name: 'Szyna A',
      voltage_kv: 15.0,
      ikss_ka: 12.5,
      voltage_band: 'SN',
      lower_ka: 0.1,
      upper_ka: 50.0,
      in_range: true,
      status: 'zweryfikowany',
      why_pl: "Ik'' = 12.5 kA mieści się w zakresie [0.1; 50.0] kA dla SN (15.0 kV).",
      blocks_osd_package: false,
    },
    {
      target_id: 'bus-B',
      element_id: 'bus-B',
      target_name: 'Szyna B',
      voltage_kv: 15.0,
      ikss_ka: 116.0,
      voltage_band: 'SN',
      lower_ka: 0.1,
      upper_ka: 50.0,
      in_range: false,
      status: 'poza zakresem wiarygodności',
      why_pl:
        "Ik'' = 116.0 kA przekracza górną granicę wiarygodności 50.0 kA dla SN (15.0 kV) — wartość fizycznie wątpliwa. Zablokowane przed wejściem do pakietu OSD.",
      blocks_osd_package: true,
    },
    {
      target_id: 'bus-C',
      element_id: null,
      target_name: 'Szyna C',
      voltage_kv: null,
      ikss_ka: null,
      voltage_band: null,
      lower_ka: null,
      upper_ka: null,
      in_range: false,
      status: 'dane niekompletne',
      why_pl: "Brak poprawnego napięcia lub Ik'' do oceny wiarygodności.",
      blocks_osd_package: false,
    },
  ],
  summary: {
    credible_count: 1,
    out_of_range_count: 1,
    incomplete_count: 1,
    blocks_osd_package_count: 1,
  },
};

export const WALIDACJA_FIXTURE: WalidacjaResponse = {
  context: {
    project_name: 'Sieć testowa',
    case_name: '22222222-2222-2222-2222-222222222222',
    run_timestamp: '2026-07-16T10:05:00+00:00',
    snapshot_id: 'snap-def',
    trace_id: '33333333-3333-3333-3333-333333333333',
  },
  config: {
    loading_warn_pct: 80.0,
    loading_fail_pct: 100.0,
    voltage_warn_pct: 5.0,
    voltage_fail_pct: 10.0,
    loss_warn_pct: 5.0,
    loss_fail_pct: 10.0,
  },
  items: [
    {
      check_type: 'BRANCH_LOADING',
      target_id: 'line-1',
      target_name: 'Linia 1',
      observed_value: 65.0,
      unit: '%',
      limit_warn: 80.0,
      limit_fail: 100.0,
      margin_pct: 35.0,
      status: 'PASS',
      why_pl: 'Obciążenie gałęzi 65% — poniżej progu ostrzeżenia 80%.',
    },
    {
      check_type: 'TRANSFORMER_LOADING',
      target_id: 'tr-1',
      target_name: 'Transformator 1',
      observed_value: 92.0,
      unit: '%',
      limit_warn: 80.0,
      limit_fail: 100.0,
      margin_pct: 8.0,
      status: 'WARNING',
      why_pl: 'Obciążenie transformatora 92% — powyżej progu ostrzeżenia 80%.',
    },
    {
      check_type: 'VOLTAGE_DEVIATION',
      target_id: 'bus-B',
      target_name: 'Szyna B',
      observed_value: 12.0,
      unit: '%',
      limit_warn: 5.0,
      limit_fail: 10.0,
      margin_pct: -2.0,
      status: 'FAIL',
      why_pl: 'Odchylenie napięcia 12% — powyżej progu przekroczenia 10%.',
    },
    {
      check_type: 'LOSS_BUDGET',
      target_id: 'siec',
      target_name: 'Sieć',
      observed_value: 3.2,
      unit: '%',
      limit_warn: 5.0,
      limit_fail: 10.0,
      margin_pct: 36.0,
      status: 'PASS',
      why_pl: 'Budżet strat 3.2% — poniżej progu ostrzeżenia 5%.',
    },
    {
      check_type: 'REACTIVE_BALANCE',
      target_id: 'slack',
      target_name: 'Węzeł bilansujący',
      observed_value: null,
      unit: 'cos(phi)',
      limit_warn: null,
      limit_fail: null,
      margin_pct: null,
      status: 'NOT_COMPUTED',
      why_pl: 'Bilans mocy biernej nie został policzony — brak danych wejściowych.',
    },
  ],
  summary: {
    pass_count: 2,
    warning_count: 1,
    fail_count: 1,
    not_computed_count: 1,
    worst_item_target_id: 'bus-B',
    worst_item_margin_pct: -2.0,
  },
};

/** Buduje przebieg wykonawczy (rejestr) o zadanym rodzaju/statusie. */
export function przebiegTestowy(
  id: string,
  analysisType: ExecutionRun['analysis_type'],
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'hash',
    status,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}
