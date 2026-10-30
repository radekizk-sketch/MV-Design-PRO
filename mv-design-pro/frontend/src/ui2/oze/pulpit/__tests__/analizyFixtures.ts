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
import WIDOK_ADEKWATNOSCI_Q from './widokAdekwatnosciQ.json';
import WIDOK_SILY_SIECI from './widokSilySieci.json';

/** Widok siły sieci złożony BACKENDEM (`backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py::
 *  _sila_sieci`, ten sam builder co końcówka) — rekordy werdyktu bez ręcznej atrapy. */
export function silaSieciFixture(): WidokSilySieci {
  return structuredClone(WIDOK_SILY_SIECI) as unknown as WidokSilySieci;
}

/**
 * Widok adekwatności Q z buildera backendu (`generuj_fixtury_ocen_fe.py`, `_adekwatnosc_q`):
 * źródło w zakresie, źródło nasycone przy Q_max, węzeł powyżej pasma — rekord W naruszony.
 */
export function adekwatnoscQFixture(): WidokAdekwatnosciQ {
  return structuredClone(WIDOK_ADEKWATNOSCI_Q) as unknown as WidokAdekwatnosciQ;
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
