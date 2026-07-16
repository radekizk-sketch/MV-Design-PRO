/*
 * Fixture'y o realnym kształcie typów przebiegów (karta E7.2 §3 — fixture 1:1).
 * Kształt zgodny z `ExecutionRun` (`ui/study-cases/types.ts:234-243`).
 */

import type { ExecutionRun } from '../../../../../ui/study-cases/types';

export function runFixture(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: 'run-1',
    study_case_id: 'K1',
    analysis_type: 'SC_3F',
    solver_input_hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdefabcdef',
    status: 'DONE',
    started_at: '2026-07-15T14:32:00Z',
    finished_at: '2026-07-15T14:32:45Z',
    error_message: null,
    ...over,
  };
}
