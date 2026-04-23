import { describe, expect, it } from 'vitest';

import {
  formatProofPackRef,
  getAnalysisCaseLabel,
  getCompletenessDisplayLabel,
  getCompletenessTone,
  getReproducibilitySummary,
  mergeAnalysisCaseContexts,
} from '../analysisCaseContextView';
import type { AnalysisCaseContext } from '../../shared/analysisCaseContext';

function buildContext(
  overrides: Partial<AnalysisCaseContext> = {},
): AnalysisCaseContext {
  return {
    case_ref: 'case-1',
    case_kind: 'analysis-case',
    rodzaj_przypadku: 'ROZPLYW_MAX_OBC',
    snapshot_ref: 'snapshot-1',
    run_ref: 'run-1',
    proof_pack_ref: 'proof-pack:run-1',
    quality_gate: 'G4',
    applicability_scope: ['results'],
    completeness: 'complete',
    missing_prerequisites: [],
    reproducibility: {
      results_contract_version: 'V12.5',
      solver_family: 'power_flow_newton',
    },
    ...overrides,
  };
}

describe('analysisCaseContextView', () => {
  it('merges top-level and nested analysis_case_context without losing reproducibility', () => {
    const merged = mergeAnalysisCaseContexts(
      buildContext({
        reproducibility: { results_contract_version: 'V12.5' },
      }),
      buildContext({
        snapshot_ref: 'snapshot-merged',
        reproducibility: { solver_family: 'short_circuit_iec60909' },
      }),
    );

    expect(merged?.snapshot_ref).toBe('snapshot-merged');
    expect(merged?.reproducibility?.results_contract_version).toBe('V12.5');
    expect(merged?.reproducibility?.solver_family).toBe('short_circuit_iec60909');
  });

  it('derives Polish completeness and reproducibility labels for status surfaces', () => {
    const context = buildContext({
      proof_pack_ref: 'proof-pack:1234567890123456789012345678901234567890',
    });

    expect(getAnalysisCaseLabel(context)).toBe('Rozpływ dla maksymalnego obciążenia');
    expect(getCompletenessDisplayLabel(context)).toBe('Kompletne');
    expect(getCompletenessTone(context.completeness)).toBe('success');
    expect(formatProofPackRef(context.proof_pack_ref)).toBe('proof-pack:1234567890123456789012...');
    expect(getReproducibilitySummary(context)).toEqual({
      label: 'Wersja kontraktu wyników',
      value: 'V12.5',
    });
  });
});
