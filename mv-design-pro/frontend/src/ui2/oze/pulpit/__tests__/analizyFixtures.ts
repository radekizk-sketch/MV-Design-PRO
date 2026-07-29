/*
 * Fixtures 1:1 z serializerami backendu (karta P47a):
 *   - `analysis/grid_strength/serializer.py::view_to_dict`  → WidokSilySieci,
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

export function silaSieciFixture(): WidokSilySieci {
  return {
    analysis_id: 'gs-abc123',
    context: {
      project_name: 'Projekt A',
      case_name: 'Scenariusz 1',
      run_timestamp: '2026-07-16T10:00:00Z',
      snapshot_id: 'snap-1',
      trace_id: 'tr-1',
    },
    weak_threshold: 3.0,
    very_weak_threshold: 2.0,
    entries: [
      {
        bus_ref: 'bus-pcc-1',
        nominal_kv: 15.0,
        s_sc_mva: 120.0,
        s_installed_mva: 20.0,
        scr: 6.0,
        verdict: 'mocna',
        is_weak: false,
        why_pl: 'SCR = 6,0 ≥ 3,0 — sieć mocna w węźle.',
        missing_data: [],
        white_box: [
          {
            symbol: 'SCR',
            formula_latex: 'SCR = S_sc / S_n',
            substitution_pl: 'SCR = 120,0 / 20,0',
            result_pl: 'SCR = 6,0',
          },
        ],
        modules: [{ ref: 'src-1', name: 'Blok PV A', sn_mva: 20.0 }],
      },
      {
        bus_ref: 'bus-pcc-2',
        nominal_kv: 15.0,
        s_sc_mva: 40.0,
        s_installed_mva: 20.0,
        scr: 2.0,
        verdict: 'bardzo słaba',
        is_weak: true,
        why_pl: 'SCR = 2,0 < 2,0 — bardzo słaba sieć w węźle.',
        missing_data: [],
        white_box: [
          {
            symbol: 'SCR',
            formula_latex: 'SCR = S_sc / S_n',
            substitution_pl: 'SCR = 40,0 / 20,0',
            result_pl: 'SCR = 2,0',
          },
        ],
        modules: [{ ref: 'src-2', name: 'Magazyn energii 1', sn_mva: 20.0 }],
      },
      {
        bus_ref: 'bus-pcc-3',
        nominal_kv: null,
        s_sc_mva: null,
        s_installed_mva: 20.0,
        scr: null,
        verdict: 'brak danych',
        is_weak: false,
        why_pl: 'Brak mocy zwarciowej — SCR nieobliczony.',
        missing_data: ['s_sc_mva'],
        white_box: [],
        modules: [{ ref: 'src-3', name: null, sn_mva: 20.0 }],
      },
    ],
    summary: {
      total_buses: 3,
      weak_bus_count: 1,
      not_computed_count: 1,
      wscr: 4.5,
      wscr_verdict: 'mocna',
      wscr_why_pl: 'WSCR = 4,5 ≥ 3,0 — system mocny.',
      wscr_white_box: [
        {
          symbol: 'WSCR',
          formula_latex: 'WSCR = Σ(S_sc·S_n) / (ΣS_n)²',
          substitution_pl: 'WSCR = 4,5',
          result_pl: 'WSCR = 4,5',
        },
      ],
    },
  };
}

export function adekwatnoscQFixture(): WidokAdekwatnosciQ {
  return {
    analysis_id: 'ra-def456',
    context: {
      project_name: 'Projekt A',
      case_name: 'Scenariusz 1',
      run_timestamp: '2026-07-16T10:05:00Z',
      snapshot_id: 'snap-1',
      trace_id: 'tr-2',
    },
    saturation_tol_mvar: 0.001,
    default_u_min_pu: 0.95,
    default_u_max_pu: 1.05,
    verdict: 'wystarczajaca rezerwa Q',
    is_adequate: true,
    why_pl: 'Rezerwa mocy biernej wystarczajaca do podtrzymania napiecia.',
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
