/*
 * Fixtures trybu ZWARCIOWEGO porównania A/B (karta E12.2) — 1:1 z realnymi
 * kontraktami: `ExecutionRun` (`ui/study-cases/types.ts`) i `ShortCircuitRow`
 * (`ui/results-inspector/types.ts:157-167`). Bez fizyki, wartości ilustracyjne.
 */

import type { ExecutionRun, ExecutionAnalysisType, RunStatus } from '../../../../ui/study-cases/types';
import type { ShortCircuitResults, ShortCircuitRow } from '../../../../ui/results-inspector/types';
import type { PunktPorownaniaZwarciowego } from '../zwarciaPorownanieApi';

export function przebiegFixture(over: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    id: 'sc-run-a',
    study_case_id: 'case-1',
    analysis_type: 'SC_3F' as ExecutionAnalysisType,
    solver_input_hash: 'hash-a',
    status: 'DONE' as RunStatus,
    started_at: '2026-07-10T08:00:00Z',
    finished_at: '2026-07-10T08:15:00Z',
    error_message: null,
    ...over,
  };
}

export function wierszSc(over: Partial<ShortCircuitRow> = {}): ShortCircuitRow {
  return {
    target_id: 'BUS-GPZ',
    element_id: undefined,
    target_name: 'Szyna GPZ',
    ikss_ka: 10.0,
    ip_ka: 25.0,
    ith_ka: 10.5,
    sk_mva: 200.0,
    fault_type: '3F',
    flags: [],
    ...over,
  };
}

export function wynikScFixture(over: Partial<ShortCircuitResults> = {}): ShortCircuitResults {
  return {
    run_id: 'sc-run-a',
    rows: [wierszSc()],
    ...over,
  };
}

/**
 * Punkt porównania zwarciowego 1:1 z kontraktem końcówki
 * `POST /api/short-circuit-comparisons` (karta KD-3 poz. 11). Delty są POLAMI
 * ODPOWIEDZI, nie wyliczeniem — fixture może je ustawić NIEZALEŻNIE od wartości
 * A i B, dzięki czemu test wykrywa, gdyby prezentacja liczyła je sama.
 */
export function punktPorownania(
  over: Partial<PunktPorownaniaZwarciowego> = {},
): PunktPorownaniaZwarciowego {
  return {
    target_id: 'BUS-GPZ',
    target_name: 'Szyna GPZ',
    obecny_w: 'AB',
    ...over,
  };
}
