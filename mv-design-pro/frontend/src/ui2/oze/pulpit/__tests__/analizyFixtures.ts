/*
 * Fixtures 1:1 z serializerami backendu (karta P47a):
 *   - `analysis/grid_strength/serializer.py::view_to_dict`  → WidokSilySieci (JSON z backendu),
 *   - `analysis/reactive_adequacy/serializer.py::view_to_dict` → WidokAdekwatnosciQ,
 *   - `ConverterType.to_dict` (podzbiór)                    → RekordKonwertera,
 *   - `ExecutionRun` (`ui/study-cases/types`)              → przebiegi.
 * Wartości ASCII werdyktów Q zgodne z `reactive_adequacy/models.py`.
 */

import type {
  RekordKonwertera,
  WidokAdekwatnosciQ,
  WidokSilySieci,
} from '../../api';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import WIDOK_SILY_SIECI from './widokSilySieci.json';

/** Widok siły sieci złożony BACKENDEM (`backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py::
 *  _sila_sieci`, ten sam builder co końcówka) — rekordy werdyktu bez ręcznej atrapy. */
export function silaSieciFixture(): WidokSilySieci {
  return structuredClone(WIDOK_SILY_SIECI) as unknown as WidokSilySieci;
}

export function adekwatnoscQFixture(): WidokAdekwatnosciQ {
  return {
    analysis_id: 'ra-def456',
    context: {
      project_name: 'Projekt A',
      case_name: 'Scenariusz 1',
      run_timestamp: '2026-07-16T10:05:00Z',
      case_id: 'case-1',
      snapshot_hash: 'snap-1',
      run_id: 'run-pf-2',
    },
    saturation_tol_mvar: 0.001,
    default_u_min_pu: 0.95,
    default_u_max_pu: 1.05,
    verdict: 'wystarczająca rezerwa Q',
    is_adequate: true,
    why_pl: 'Rezerwa mocy biernej wystarczająca do podtrzymania napięcia.',
    sources: [
      {
        ref: 'src-1',
        bus_ref: 'bus-pcc-1',
        q_actual_mvar: 1.2,
        q_min_mvar: -3.6,
        q_max_mvar: 3.6,
        headroom_up_mvar: 2.4,
        headroom_down_mvar: 4.8,
        is_saturated: false,
        at_limit_pl: null,
        why_pl: 'Źródło pracuje w zakresie regulacji.',
        missing_data: [],
        white_box: [
          {
            symbol: 'H_up',
            formula_latex: 'H_up = Q_max - Q',
            substitution_pl: 'H_up = 3,6 - 1,2',
            result_pl: 'H_up = 2,4',
            unit_check_pl: 'Mvar - Mvar = Mvar',
          },
        ],
      },
      {
        ref: 'src-2',
        bus_ref: 'bus-pcc-2',
        q_actual_mvar: 3.6,
        q_min_mvar: -3.6,
        q_max_mvar: 3.6,
        headroom_up_mvar: 0.0,
        headroom_down_mvar: 7.2,
        is_saturated: true,
        at_limit_pl: 'Q_max',
        why_pl: 'Źródło nasycone przy granicy Q_max.',
        missing_data: [],
        white_box: [],
      },
    ],
    voltage_violations: [
      {
        bus_ref: 'bus-pcc-2',
        v_pu: 1.07,
        u_min_pu: 0.95,
        u_max_pu: 1.05,
        deviation_pu: 0.02,
        kind_pl: 'przekroczenie U_max',
        why_pl: '|V| = 1,07 p.u. > 1,05 p.u.',
        white_box: [],
      },
    ],
    balance: {
      q_generated_mvar: 4.8,
      q_absorbed_by_sources_mvar: 0.0,
      q_load_mvar: 2.0,
      net_source_q_mvar: 4.8,
      white_box: [],
    },
    summary: {
      total_sources: 2,
      saturated_source_count: 1,
      not_computed_source_count: 0,
      voltage_violation_count: 1,
      network_headroom_up_mvar: 2.4,
      network_headroom_down_mvar: 4.8,
      saturated_source_refs: ['src-2'],
      violated_bus_refs: ['bus-pcc-2'],
    },
    provenance: {
      worst_quality: 'DATASHEET',
      worst_quality_label_pl: 'z karty katalogowej',
      is_estimated: false,
      tag_pl: 'werdykt na danych z karty',
    },
    missing_data: [],
  };
}

export function konwerteryBessFixture(): RekordKonwertera[] {
  return [
    {
      id: 'conv-bess-nn-1mw-0p4kv',
      name: 'PCS BESS 1 MW / 0,4 kV nN',
      kind: 'BESS',
      un_kv: 0.4,
      sn_mva: 1.1,
      pmax_mw: 1.0,
      qmin_mvar: -0.36,
      qmax_mvar: 0.36,
      cosphi_min: 0.9,
      cosphi_max: 1.0,
      e_kwh: 2000,
      control_mode: 'Q_U_DROOP',
    },
    {
      id: 'conv-bess-nn-2mw-0p4kv',
      name: 'PCS BESS 2 MW / 0,4 kV nN',
      kind: 'BESS',
      un_kv: 0.4,
      sn_mva: 2.2,
      pmax_mw: 2.0,
      qmin_mvar: -0.72,
      qmax_mvar: 0.72,
      cosphi_min: 0.9,
      cosphi_max: 1.0,
      e_kwh: 4000,
      control_mode: 'Q_U_DROOP',
    },
  ];
}

export function przebiegFixture(over: Partial<ExecutionRun> & { id: string }): ExecutionRun {
  return {
    id: over.id,
    study_case_id: over.study_case_id ?? 'sc-1',
    analysis_type: over.analysis_type ?? 'SC_3F',
    solver_input_hash: over.solver_input_hash ?? 'hash-1',
    status: over.status ?? 'DONE',
    started_at: over.started_at ?? null,
    finished_at: over.finished_at ?? null,
    error_message: over.error_message ?? null,
  };
}
