/*
 * Fixtures testowe okna „Estymacja stanu (WLS)" — kształty 1:1 z kontraktem
 * backendu (`application/analyses/state_estimation/service.py`). Wartości
 * deterministyczne; służą do ćwiczenia REALNEJ ścieżki UI (wejście pomiarów →
 * estymacja → prezentacja), API mockowane na granicy fetch.
 */

import type { MetaTypuPomiaru, WidokEstymacji, WymaganiaEstymacji } from '../api';

export const TYPY_POMIAROW: MetaTypuPomiaru[] = [
  { code: 'V_MAGNITUDE', label_pl: 'Moduł napięcia węzła |V| [pu]', requires_bus_j: false },
  { code: 'P_INJECTION', label_pl: 'Iniekcja mocy czynnej w węźle P [pu]', requires_bus_j: false },
  { code: 'Q_INJECTION', label_pl: 'Iniekcja mocy biernej w węźle Q [pu]', requires_bus_j: false },
  { code: 'P_FLOW', label_pl: 'Przepływ mocy czynnej w gałęzi P_ij [pu]', requires_bus_j: true },
  { code: 'Q_FLOW', label_pl: 'Przepływ mocy biernej w gałęzi Q_ij [pu]', requires_bus_j: true },
];

export function wymaganiaFixture(): WymaganiaEstymacji {
  return {
    analysis_id: 'run-lf-1',
    context: {
      project_name: 'Projekt testowy',
      case_name: null,
      case_id: 'case-1',
      run_timestamp: '2026-07-16T08:00:00Z',
      snapshot_hash: 'snap-abc',
      run_id: 'run-lf-1',
    },
    base_mva: 100.0,
    slack_bus_ref: 'BUS-1',
    slack_index: 0,
    n_buses: 3,
    n_states: 5,
    min_measurements: 5,
    buses: [
      { bus_ref: 'BUS-1', index: 0, name: 'Szyna GPZ', voltage_kv: 110.0, is_slack: true },
      { bus_ref: 'BUS-2', index: 1, name: 'Szyna SN', voltage_kv: 15.0, is_slack: false },
      { bus_ref: 'BUS-3', index: 2, name: null, voltage_kv: 15.0, is_slack: false },
    ],
    measurement_types: TYPY_POMIAROW,
    note_pl:
      'Pomiary muszą być w jednostkach względnych (pu) na tej samej bazie mocy '
      + '(base_mva) co macierz Y-bus.',
  };
}

export function widokEstymacjiFixture(): WidokEstymacji {
  return {
    analysis_id: 'run-lf-1',
    context: wymaganiaFixture().context,
    status: 'OK',
    status_pl: 'zbieżny',
    missing_data: [{ code: 'wezly_bez_pomiaru', bus_refs: ['BUS-3'] }],
    solver_version: 'state_estimation_wls@1.0.0',
    validation_status: 'SYNTETYCZNY (walidacja płaskim stanem, nie SCADA/PMU)',
    estimate_id: 'estymata-hash-abc',
    base_mva: 100.0,
    slack_bus_ref: 'BUS-1',
    slack_index: 0,
    converged: true,
    iterations: 3,
    n_states: 5,
    m_measurements: 6,
    degrees_of_freedom: 1,
    objective_j: 27.5,
    note: null,
    buses: [
      {
        bus_ref: 'BUS-1',
        index: 0,
        name: 'Szyna GPZ',
        voltage_kv: 110.0,
        is_slack: true,
        v_magnitude_pu: 1.0,
        v_angle_rad: 0.0,
        v_angle_deg: 0.0,
      },
      {
        bus_ref: 'BUS-2',
        index: 1,
        name: 'Szyna SN',
        voltage_kv: 15.0,
        is_slack: false,
        v_magnitude_pu: 0.9912,
        v_angle_rad: -0.0262,
        v_angle_deg: -1.5,
      },
      {
        bus_ref: 'BUS-3',
        index: 2,
        name: null,
        voltage_kv: 15.0,
        is_slack: false,
        v_magnitude_pu: 1.0103,
        v_angle_rad: 0.014,
        v_angle_deg: 0.8,
      },
    ],
    measurements: [
      {
        meas_type: 'V_MAGNITUDE',
        bus_ref: 'BUS-1',
        bus_j_ref: null,
        value: 1.05,
        sigma: 0.004,
        label: null,
        index: 0,
        normalized_residual: 5.2,
        residual: 0.048,
        suspect: true,
      },
      {
        meas_type: 'P_INJECTION',
        bus_ref: 'BUS-2',
        bus_j_ref: null,
        value: -0.35,
        sigma: 0.008,
        label: null,
        index: 1,
        normalized_residual: 0.4,
        residual: 0.002,
        suspect: false,
      },
    ],
    bad_data: {
      chi_square_value: 27.5,
      chi_square_threshold: 6.635,
      degrees_of_freedom: 1,
      alpha: 0.01,
      chi_square_flag: true,
      largest_normalized_residual: 5.2,
      lnr_measurement_index: 0,
      lnr_threshold: 3.0,
      lnr_flag: true,
      normalized_residuals: [5.2, 0.4],
      lnr_measurement: {
        index: 0,
        meas_type: 'V_MAGNITUDE',
        bus_ref: 'BUS-1',
        bus_j_ref: null,
        label: null,
      },
    },
    white_box: [
      {
        iteration: 0,
        objective_j: 40.1,
        max_abs_residual: 0.052,
        step_norm: 0.03,
        h_jacobian: [[1, 0]],
        gain_matrix_g: [[2, 0]],
        residual_r: [0.05, 0.001],
        delta_x: [0.01, 0.0],
        state_x: [1.0, 0.0],
      },
      {
        iteration: 1,
        objective_j: 27.5,
        max_abs_residual: 0.048,
        step_norm: 0.0001,
        h_jacobian: [[1, 0]],
        gain_matrix_g: [[2, 0]],
        residual_r: [0.048, 0.002],
        delta_x: [0.0, 0.0],
        state_x: [1.0, 0.0],
      },
    ],
  };
}
