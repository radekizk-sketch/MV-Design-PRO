/*
 * Fixture'y o realnym kształcie typów przebiegów (karta E7.2 §3 — fixture 1:1).
 * Kształt zgodny z `ExecutionRun` (`ui/study-cases/types.ts:234-243`).
 */

import type { ExecutionRun } from '../../../../../ui/study-cases/types';
import type { AnalysisRunContract } from '../../../../../ui/workspace/analysisRunContract';

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

/**
 * Fixture kontraktu analizy o realnym kształcie `AnalysisRunContract`
 * (`ui/workspace/analysisRunContract.ts`). Wartości założeń dobrane pod
 * deterministyczne etykiety `formatContractValue` (mapa `TECHNICAL_TOKEN_LABELS`).
 */
export function kontraktFixture(over: Partial<AnalysisRunContract> = {}): AnalysisRunContract {
  return {
    id: 'run-1',
    analysisType: 'load_flow',
    status: 'finished',
    resultStatus: 'valid',
    resultsValid: true,
    createdAt: '2026-07-15T14:32:00Z',
    finishedAt: '2026-07-15T14:32:45Z',
    inputHash: 'a1b2c3',
    proofPackRef: null,
    exportArtifact: null,
    exportPolicy: null,
    summaryJson: {},
    traceSummary: null,
    analysisCaseContext: {
      caseRef: 'case-1',
      caseKind: 'auto',
      snapshotRef: 'v12',
      variantRef: null,
      runRef: null,
      proofPackRef: null,
      qualityGate: 'passed',
      applicabilityScope: ['cała sieć'],
      completeness: 'complete',
      completenessLegacy: 'ok',
      missingPrerequisites: [],
      assumptions: {
        transformer_tap_assumptions_ref: 'tap_frozen',
        grounding_assumptions_ref: 'grounded',
        switching_state_ref: 'normal',
        temperature_assumptions_ref: 'temperature_short_circuit',
        load_assumptions_ref: 'nominal',
        source_assumptions_ref: 'sc_source_max',
        fault_scenario_ref: 'sc_3f',
      },
      lineage: { project_ref: 'projekt-1' },
      reproducibility: null,
    },
    ...over,
  };
}
