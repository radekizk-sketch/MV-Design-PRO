/*
 * Fixture'y o realnym kształcie rejestru przebiegów (`ExecutionRun` —
 * `ui/study-cases/types.ts:234-243`), 1:1 z kontraktem backendu.
 */

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ExecutionRun } from '../../../../ui/study-cases/types';

export function przebiegFixture(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: 'run-lf-1',
    study_case_id: 'case-1',
    analysis_type: 'LOAD_FLOW',
    solver_input_hash: 'hash-abc',
    status: 'DONE',
    started_at: '2026-07-16T08:00:00Z',
    finished_at: '2026-07-16T08:00:05Z',
    error_message: null,
    ...over,
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
