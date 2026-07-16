/*
 * Fixtures okna „Odpowiedź na polecenia OSD" (karta P40). Kształty 1:1 z
 * serializacją `application/analyses/odpowiedz_osd.py::build_osd_response_view`
 * oraz `ExecutionRun` (`ui/study-cases/types`). Deterministyczne, bez losowości.
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type { WidokOdpowiedziOsd } from '../../api';

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

/** Minimalny snapshot ze źródłami (tylko pola czytane przez `opcjeZrodel`). */
export function snapshotFixture(): EnergyNetworkModel {
  return {
    generators: [
      { ref_id: 'gen_sync', name: 'Generator synchroniczny', bus_ref: 'bus-a', p_mw: 2.0 },
      { ref_id: 'gen_pv', name: 'Falownik PV', bus_ref: 'bus-b', p_mw: 1.0 },
    ],
  } as unknown as EnergyNetworkModel;
}

/** Snapshot bez źródeł (do testu stanu „brak źródeł"). */
export function snapshotBezZrodelFixture(): EnergyNetworkModel {
  return { generators: [] } as unknown as EnergyNetworkModel;
}

/**
 * Widok odpowiedzi 1:1 z backendem: polecenie ograniczenia mocy czynnej do 50%
 * (P: 2,0 → 1,0 MW). Dwa węzły z napięciami przed/po, straty z deltą, ślad WHITE BOX
 * z dwoma biegami. Wartości zaokrąglone jak po stronie backendu.
 */
export function widokOsdFixture(): WidokOdpowiedziOsd {
  return {
    analysis: 'osd_response',
    context: {
      trace_id: 'run-osd-1',
      snapshot_id: 'snap-abc',
      case_name: 'case-1',
    },
    parameters: {
      source_ref: 'gen_sync',
      source_name: 'Generator synchroniczny',
      command: 'ograniczenie_p',
      overridden: { p_limit_pct: 50 },
    },
    input_hash: 'a1b2c3d4e5f6',
    source: {
      ref_id: 'gen_sync',
      name: 'Generator synchroniczny',
      bus_ref: 'bus-a',
      bus_name: 'Szyna A',
      p_setpoint_before_mw: 2.0,
      p_setpoint_after_mw: 1.0,
      q_setpoint_before_mvar: 0.5,
      q_setpoint_after_mvar: 0.5,
      bus_p_injected_before_mw: 2.0,
      bus_p_injected_after_mw: 1.0,
      bus_q_injected_before_mvar: 0.5,
      bus_q_injected_after_mvar: 0.5,
    },
    nodes: [
      {
        bus_ref: 'bus-a',
        bus_name: 'Szyna A',
        v_before_pu: 1.02,
        v_after_pu: 1.01,
        v_delta_pu: -0.01,
      },
      {
        bus_ref: 'bus-b',
        bus_name: 'Szyna B',
        v_before_pu: 0.99,
        v_after_pu: 0.985,
        v_delta_pu: -0.005,
      },
    ],
    losses: {
      p_before_mw: 0.12,
      p_after_mw: 0.09,
      p_delta_mw: -0.03,
      q_before_mvar: 0.4,
      q_after_mvar: 0.32,
      q_delta_mvar: -0.08,
    },
    whitebox: {
      overridden: {
        source_ref: 'gen_sync',
        p_before_mw: 2.0,
        p_after_mw: 1.0,
        q_before_mvar: 0.5,
        q_after_mvar: 0.5,
        command: { p_limit_pct: 50 },
      },
      baseline_run: {
        converged: true,
        iterations_count: 4,
        total_losses_p_mw: 0.12,
        min_voltage_pu: 0.99,
        max_voltage_pu: 1.02,
        slack_p_mw: 3.0,
        slack_q_mvar: 1.1,
      },
      commanded_run: {
        converged: true,
        iterations_count: 5,
        total_losses_p_mw: 0.09,
        min_voltage_pu: 0.985,
        max_voltage_pu: 1.01,
        slack_p_mw: 4.0,
        slack_q_mvar: 1.2,
      },
    },
  };
}

/** Wariant z brakującymi wartościami (null) — do testu formatera kreski i delty. */
export function widokOsdZBrakamiFixture(): WidokOdpowiedziOsd {
  const bazowy = widokOsdFixture();
  return {
    ...bazowy,
    source: {
      ...bazowy.source,
      p_setpoint_after_mw: null,
      q_setpoint_after_mvar: null,
    },
    losses: {
      ...bazowy.losses,
      p_delta_mw: null,
    },
    nodes: [
      {
        bus_ref: 'bus-a',
        bus_name: null,
        v_before_pu: null,
        v_after_pu: null,
        v_delta_pu: null,
      },
    ],
  };
}
