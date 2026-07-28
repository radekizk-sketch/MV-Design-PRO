/*
 * Fixtures okna „Zdolność przyłączeniowa" (karta P2). Kształty 1:1 z serializacją
 * `application/analyses/hosting_capacity.py::build_hosting_capacity_view` oraz
 * `ExecutionRun` (`ui/study-cases/types`). Deterministyczne, bez losowości.
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
    ],
  } as unknown as EnergyNetworkModel;
}

/**
 * Widok zdolności przyłączeniowej 1:1 z backendem: węzeł A ograniczony napięciem,
 * węzeł B bez osiągnięcia granicy w zadanym zakresie (kryterium `none`).
 */
export function widokZdolnosciFixture(): WidokZdolnosci {
  return {
    analysis: 'hosting_capacity',
    context: {
      run_id: 'run-lf-1',
      snapshot_hash: 'snap-abc',
      case_name: null,
      case_id: 'case-1',
    },
    parameters: {
      step_mw: 0.5,
      max_steps: 40,
      candidate_bus_refs: ['bus-a', 'bus-b'],
    },
    input_hash: 'a1b2c3d4e5f6',
    nodes: [
      {
        bus_ref: 'bus-a',
        bus_name: 'Szyna A',
        existing_generation_mw: 2.0,
        max_hosting_capacity_mw: 1.5,
        binding_criterion: {
          kind: 'voltage',
          check_type: 'VOLTAGE_DEVIATION',
          element_id: 'bus-a',
          element_name: 'Szyna A',
          observed_value: 1.12,
          unit: 'pu',
          limit_fail: 1.1,
        },
        scenarios: [
          { added_power_mw: 0.0, converged: true, acceptable: true, binding: { kind: 'none' } },
          { added_power_mw: 0.5, converged: true, acceptable: true, binding: { kind: 'none' } },
          { added_power_mw: 1.0, converged: true, acceptable: true, binding: { kind: 'none' } },
          { added_power_mw: 1.5, converged: true, acceptable: true, binding: { kind: 'none' } },
          {
            added_power_mw: 2.0,
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
          },
        ],
      },
      {
        bus_ref: 'bus-b',
        bus_name: null,
        existing_generation_mw: 0.0,
        max_hosting_capacity_mw: 20.0,
        binding_criterion: { kind: 'none' },
        scenarios: [
          { added_power_mw: 0.0, converged: true, acceptable: true, binding: { kind: 'none' } },
          { added_power_mw: 0.5, converged: true, acceptable: true, binding: { kind: 'none' } },
        ],
      },
    ],
  };
}
