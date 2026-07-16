/*
 * Fixtures okna „Obszar bezpiecznej pracy P–Q" (karta P30). Kształty 1:1 z
 * serializacją `application/analyses/pq_area.py::build_pq_area_view`, katalogiem
 * konwerterów (`ConverterType.to_dict`) oraz `ExecutionRun`
 * (`ui/study-cases/types`). Deterministyczne, bez losowości.
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type { RekordKonwertera, WidokObszaruPQ } from '../../api';

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

/** Katalog konwerterów: jeden typ z krzywą producenta, jeden bez krzywej. */
export function rekordyKonwerterowFixture(): RekordKonwertera[] {
  return [
    {
      id: 'conv-pv-card-sungrow-sg3150u-mv',
      name: 'Karta falownika central PV Sungrow SG3150U-MV 3.15 MW / 0.69 kV',
      kind: 'PV',
      un_kv: 0.69,
      sn_mva: 3.15,
      pmax_mw: 3.15,
      qmin_mvar: -1.89,
      qmax_mvar: 1.89,
      cosphi_min: 0.8,
      cosphi_max: 1.0,
      e_kwh: null,
      control_mode: 'Q_OF_U',
      pq_curve: [
        [0.0, -1.89, 1.89],
        [0.5, -1.89, 1.89],
        [1.0, -1.5, 1.5],
      ],
    },
    {
      id: 'conv-pv-generic-1mw',
      name: 'Falownik PV generyczny 1 MW / 0.4 kV',
      kind: 'PV',
      un_kv: 0.4,
      sn_mva: 1.0,
      pmax_mw: 1.0,
      qmin_mvar: -0.4,
      qmax_mvar: 0.4,
      cosphi_min: 0.9,
      cosphi_max: 1.0,
      e_kwh: null,
      control_mode: null,
      // brak pola pq_curve ⇒ „brak krzywej producenta"
    },
  ];
}

/**
 * Widok obszaru 1:1 z backendem: dwa wierzchołki dopuszczalne (pasmo pracy Q) plus
 * wierzchołek zamykający wymiar P (feasible=false — Q = 0 niedopuszczalne przez
 * odchylenie napięcia). Kryteria krańcowe: dół = napięcie, góra = obciążenie linii.
 */
export function widokObszaruFixture(): WidokObszaruPQ {
  return {
    analysis: 'pq_area',
    context: {
      trace_id: 'run-lf-1',
      snapshot_id: 'snap-abc',
      case_name: 'case-1',
    },
    parameters: {
      bus_ref: 'bus-a',
      step_p_mw: 0.5,
      step_q_mvar: 0.25,
      max_steps_p: 20,
      max_steps_q: 16,
      max_total_runs: 693,
    },
    input_hash: 'a1b2c3d4e5f6',
    bus_ref: 'bus-a',
    bus_name: 'Szyna A',
    existing_generation: { p_mw: 1.0, q_mvar: 0.0 },
    total_runs: 15,
    vertices: [
      {
        p_mw: 0.0,
        feasible: true,
        q_min_dop_mvar: -1.0,
        q_max_dop_mvar: 1.0,
        binding_low: {
          kind: 'voltage',
          check_type: 'VOLTAGE_DEVIATION',
          element_id: 'bus-a',
          element_name: 'Szyna A',
          observed_value: 0.92,
          unit: 'pu',
          limit_fail: 0.9,
        },
        binding_high: {
          kind: 'loading',
          check_type: 'BRANCH_LOADING',
          element_id: 'ln-1',
          element_name: 'Linia 1',
          observed_value: 105.0,
          unit: '%',
          limit_fail: 100.0,
        },
        binding_center: { kind: 'none' },
        runs: 7,
      },
      {
        p_mw: 0.5,
        feasible: true,
        q_min_dop_mvar: -0.75,
        q_max_dop_mvar: 0.75,
        binding_low: {
          kind: 'voltage',
          check_type: 'VOLTAGE_DEVIATION',
          element_id: 'bus-a',
          element_name: 'Szyna A',
          observed_value: 0.92,
          unit: 'pu',
          limit_fail: 0.9,
        },
        binding_high: {
          kind: 'loading',
          check_type: 'BRANCH_LOADING',
          element_id: 'ln-1',
          element_name: 'Linia 1',
          observed_value: 104.0,
          unit: '%',
          limit_fail: 100.0,
        },
        binding_center: { kind: 'none' },
        runs: 7,
      },
      {
        p_mw: 1.0,
        feasible: false,
        q_min_dop_mvar: null,
        q_max_dop_mvar: null,
        binding_low: { kind: 'none' },
        binding_high: { kind: 'none' },
        binding_center: {
          kind: 'voltage',
          check_type: 'VOLTAGE_DEVIATION',
          element_id: 'bus-a',
          element_name: 'Szyna A',
          observed_value: 1.12,
          unit: 'pu',
          limit_fail: 1.1,
        },
        runs: 1,
      },
    ],
  };
}

/** Wariant z pasmem zerowym (feasible=true, q_min = q_max = 0) — do testu tagu „brak pasma". */
export function widokObszaruZerowePasmoFixture(): WidokObszaruPQ {
  const bazowy = widokObszaruFixture();
  return {
    ...bazowy,
    vertices: [
      {
        p_mw: 0.0,
        feasible: true,
        q_min_dop_mvar: 0.0,
        q_max_dop_mvar: 0.0,
        binding_low: {
          kind: 'loading',
          check_type: 'BRANCH_LOADING',
          element_id: 'ln-1',
          element_name: 'Linia 1',
          observed_value: 101.0,
          unit: '%',
          limit_fail: 100.0,
        },
        binding_high: {
          kind: 'loading',
          check_type: 'BRANCH_LOADING',
          element_id: 'ln-1',
          element_name: 'Linia 1',
          observed_value: 101.0,
          unit: '%',
          limit_fail: 100.0,
        },
        binding_center: { kind: 'none' },
        runs: 3,
      },
    ],
  };
}
