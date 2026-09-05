/*
 * Fixture'y o realnym kształcie store'ów read-only pulpitu (karta E2.1 §5).
 * Kształty zgodne z: `EnergyNetworkModel`/`ReadinessInfo` (`types/enm.ts`),
 * `StudyCaseListItem`/`StudyCase`/`ExecutionRun` (`ui/study-cases/types.ts`).
 */

import type { EnergyNetworkModel, ReadinessInfo } from '../../../../types/enm';
import type {
  ExecutionRun,
  StudyCase,
  StudyCaseConfig,
  StudyCaseListItem,
  StudyCaseResultStatus,
} from '../../../../ui/study-cases/types';

/** Tablica `n` atrap elementów (liczy się tylko długość — mapowanie czyta `.length`). */
function elementy(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({ ref_id: `el-${i}`, id: `el-${i}` }));
}

export function snapshotFixture(over: Partial<EnergyNetworkModel> = {}): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'Sieć SN Przykładowo',
      description: null,
      created_at: '2026-07-10T09:00:00Z',
      updated_at: '2026-07-15T14:00:00Z',
      revision: 7,
      hash_sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    buses: elementy(20),
    branches: elementy(18),
    transformers: elementy(15),
    sources: elementy(1),
    loads: elementy(40),
    generators: elementy(2),
    substations: elementy(14),
    bays: elementy(10),
    junctions: elementy(5),
    corridors: elementy(3),
    measurements: elementy(0),
    protection_assignments: elementy(0),
    ...over,
  } as unknown as EnergyNetworkModel;
}

export function readinessFixture(over: Partial<ReadinessInfo> = {}): ReadinessInfo {
  return {
    ready: true,
    blockers: [],
    warnings: [],
    ...over,
  };
}

export function readinessZBlokadami(): ReadinessInfo {
  return {
    ready: false,
    blockers: [
      { code: 'E010', message_pl: 'Brak katalogu transformatora', element_ref: 'TR-1', severity: 'BLOCKER' },
    ],
    warnings: [
      { code: 'W020', message_pl: 'Brak wartości uziemienia', element_ref: 'ST-4', severity: 'IMPORTANT' },
      { code: 'W021', message_pl: 'Typowe obciążenie — potwierdź', element_ref: 'ST-5', severity: 'IMPORTANT' },
    ],
  };
}

const configFixture: StudyCaseConfig = {
  c_factor_max: 1.1,
  c_factor_min: 0.95,
  base_mva: 100,
  max_iterations: 50,
  tolerance: 1e-6,
  include_motor_contribution: true,
  include_inverter_contribution: true,
  thermal_time_seconds: 1,
  operator_profile_id: 'enea',
  sc_input_mode: 'simplified',
  sc_simplified_sk_mva: null,
  sc_simplified_r_x_ratio: 0.1,
};

export function caseListItem(
  id: string,
  name: string,
  status: StudyCaseResultStatus,
  over: Partial<StudyCaseListItem> = {},
): StudyCaseListItem {
  return {
    id,
    name,
    description: `Konfiguracja ${name}`,
    result_status: status,
    results_valid: status === 'FRESH',
    result_status_reason: status === 'FRESH' ? 'model-niezmieniony' : 'brak-wyniku',
    result_status_reason_pl:
      status === 'FRESH'
        ? 'Model nie zmienił się od chwili obliczenia.'
        : 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.',
    rewizja_biegu: status === 'FRESH' ? 4 : null,
    rewizja_biezaca: 4,
    zmiany_od_biegu: [],
    is_active: false,
    updated_at: '2026-07-15T11:05:00Z',
    ...over,
  };
}

export function activeCaseFixture(
  status: StudyCaseResultStatus,
  over: Partial<StudyCase> = {},
): StudyCase {
  return {
    id: 'K2',
    project_id: 'P-1',
    name: 'Zwarcia maks. + PV 100%',
    description: 'Zwarcia wg IEC 60909, c_max',
    config: configFixture,
    result_status: status,
    results_valid: status === 'FRESH',
    result_status_reason: status === 'FRESH' ? 'model-niezmieniony' : 'brak-wyniku',
    result_status_reason_pl:
      status === 'FRESH'
        ? 'Model nie zmienił się od chwili obliczenia.'
        : 'Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat.',
    rewizja_biegu: status === 'FRESH' ? 4 : null,
    rewizja_biezaca: 4,
    zmiany_od_biegu: [],
    is_active: true,
    revision: 3,
    created_at: '2026-07-10T09:00:00Z',
    updated_at: '2026-07-15T14:32:00Z',
    ...over,
  };
}

export function runFixture(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: 'run-1',
    study_case_id: 'K2',
    analysis_type: 'SC_3F',
    solver_input_hash: 'hash-1',
    status: 'DONE',
    started_at: '2026-07-15T14:32:00Z',
    finished_at: '2026-07-15T14:33:00Z',
    error_message: null,
    ...over,
  };
}
