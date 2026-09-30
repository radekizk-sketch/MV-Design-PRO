/*
 * Fixtures okna „Ranking punktów przyłączenia". Kształty 1:1 z serializacją
 * `application/analyses/hosting_capacity.py::build_hosting_capacity_view` (z polami
 * D3a: `total_losses_p_mw`/`min_voltage_pu`/`max_voltage_pu` per scenariusz oraz
 * `losses_baseline_p_mw`/`losses_at_limit_p_mw` per węzeł). Deterministyczne, bez losowości.
 * Typ modułu NC RfG NIE pochodzi z fixtury — ekran pyta `/api/ncrfg-tests/modul` (atrapa
 * `ncrfg/__tests__/atrapaKlasyfikacji.ts`: progi z katalogu policzonego backendem).
 *
 * Węzły: B (1,5 MW), A (0,5 MW, ograniczony napięciem), C (0 MW — brak dopuszczalnego
 * scenariusza: przyrost strat, napięcia i typ modułu „—", bez zapytania o klasyfikację).
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type { WidokZdolnosci } from '../../api';

/** Przebieg wykonania (domyślnie zakończony rozpływ mocy). */
export function przebiegFixture(over: Partial<ExecutionRun> & { id: string }): ExecutionRun {
  return {
    id: over.id,
    study_case_id: over.study_case_id ?? 'sc-1',
    analysis_type: over.analysis_type ?? 'LOAD_FLOW',
    solver_input_hash: over.solver_input_hash ?? 'hash-1',
    status: over.status ?? 'DONE',
    started_at: over.started_at ?? null,
    finished_at: over.finished_at ?? null,
    error_message: over.error_message ?? null,
  };
}

/** Minimalny snapshot ze szynami (tylko pola czytane przez `selectBusOptions`). */
export function snapshotFixture(): EnergyNetworkModel {
  return {
    buses: [
      { ref_id: 'bus-a', name: 'Szyna A', voltage_kv: 15 },
      { ref_id: 'bus-b', name: 'Szyna B', voltage_kv: 15 },
      { ref_id: 'bus-c', name: 'Szyna C', voltage_kv: 15 },
    ],
  } as unknown as EnergyNetworkModel;
}

/** Widok zdolności przyłączeniowej 1:1 z backendem (pola D3a wypełnione). */
export function widokRankinguFixture(): WidokZdolnosci {
  return {
    analysis: 'hosting_capacity',
    context: { run_id: 'run-lf-1', snapshot_hash: 'snap-abc', case_id: 'case-1' },
    parameters: { step_mw: 0.5, max_steps: 40, candidate_bus_refs: ['bus-a', 'bus-b', 'bus-c'] },
    input_hash: 'a1b2c3d4e5f6',
    nodes: [
      // Węzeł A — ograniczony napięciem; klasa A (0,5 MW = 500 kW).
      {
        bus_ref: 'bus-a',
        bus_name: 'Szyna A',
        existing_generation_mw: 2.0,
        max_hosting_capacity_mw: 0.5,
        binding_criterion: {
          kind: 'voltage',
          check_type: 'VOLTAGE_DEVIATION',
          element_id: 'bus-a',
          element_name: 'Szyna A',
          observed_value: 1.12,
          unit: 'pu',
          limit_fail: 1.1,
        },
        losses_baseline_p_mw: 0.1,
        losses_at_limit_p_mw: 0.12,
        scenarios: [
          {
            added_power_mw: 0.0,
            converged: true,
            acceptable: true,
            binding: { kind: 'none' },
            total_losses_p_mw: 0.1,
            min_voltage_pu: 0.99,
            max_voltage_pu: 1.02,
          },
          {
            added_power_mw: 0.5,
            converged: true,
            acceptable: true,
            binding: { kind: 'none' },
            total_losses_p_mw: 0.12,
            min_voltage_pu: 0.98,
            max_voltage_pu: 1.04,
          },
          {
            added_power_mw: 1.0,
            converged: true,
            acceptable: false,
            binding: {
              kind: 'voltage',
              check_type: 'VOLTAGE_DEVIATION',
              element_id: 'bus-a',
              element_name: 'Szyna A',
              observed_value: 1.12,
              unit: 'pu',
              limit_fail: 1.1,
            },
            total_losses_p_mw: 0.15,
            min_voltage_pu: 0.97,
            max_voltage_pu: 1.12,
          },
        ],
      },
      // Węzeł B — brak osiągnięcia granicy w zakresie; klasa B (1,5 MW = 1500 kW).
      {
        bus_ref: 'bus-b',
        bus_name: 'Szyna B',
        existing_generation_mw: 0.0,
        max_hosting_capacity_mw: 1.5,
        binding_criterion: { kind: 'none' },
        losses_baseline_p_mw: 0.05,
        losses_at_limit_p_mw: 0.2,
        scenarios: [
          {
            added_power_mw: 0.0,
            converged: true,
            acceptable: true,
            binding: { kind: 'none' },
            total_losses_p_mw: 0.05,
            min_voltage_pu: 0.99,
            max_voltage_pu: 1.01,
          },
          {
            added_power_mw: 1.5,
            converged: true,
            acceptable: true,
            binding: { kind: 'none' },
            total_losses_p_mw: 0.2,
            min_voltage_pu: 0.96,
            max_voltage_pu: 1.03,
          },
        ],
      },
      // Węzeł C — scenariusz 0 MW już niedopuszczalny: brak granicy (pola „—").
      {
        bus_ref: 'bus-c',
        bus_name: 'Szyna C',
        existing_generation_mw: 5.0,
        max_hosting_capacity_mw: 0.0,
        binding_criterion: {
          kind: 'voltage',
          check_type: 'VOLTAGE_DEVIATION',
          element_id: 'bus-c',
          element_name: 'Szyna C',
          observed_value: 1.15,
          unit: 'pu',
          limit_fail: 1.1,
        },
        losses_baseline_p_mw: 0.3,
        losses_at_limit_p_mw: null,
        scenarios: [
          {
            added_power_mw: 0.0,
            converged: true,
            acceptable: false,
            binding: {
              kind: 'voltage',
              check_type: 'VOLTAGE_DEVIATION',
              element_id: 'bus-c',
              element_name: 'Szyna C',
              observed_value: 1.15,
              unit: 'pu',
              limit_fail: 1.1,
            },
            total_losses_p_mw: 0.3,
            min_voltage_pu: 1.15,
            max_voltage_pu: 1.16,
          },
        ],
      },
    ],
  };
}
