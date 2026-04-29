import { describe, expect, it } from 'vitest';

import { resolveResultFreshnessState } from '../resultFreshness';
import type { ResultBinding } from '../types';
import { reportEligibility } from './contractTestFixtures';

const currentResult = {
  schemaVersion: 'v12-result-v8',
  projectRefId: 'project-1',
  resultId: 'result-1',
  resultHash: 'result-hash-1',
  elementRefId: 'bay-1',
  semanticHash: 'semantic-before',
  inputSnapshotRefId: 'input-1',
  inputHash: 'input-before',
  caseRefId: 'case-1',
  caseHash: 'case-hash-1',
  variantRefId: 'variant-1',
  variantHash: 'variant-hash-1',
  switchingSnapshotRefId: 'switching-1',
  switchingSnapshotHash: 'switching-hash-1',
  catalogSnapshotRef: 'catalog-1',
  usedCatalogMaterializationHash: 'used-catalog-1',
  analysisType: 'ZWARCIE_3F',
  resultKind: 'ZWARCIE',
  qualityState: 'PELNA',
  freshnessState: 'AKTUALNY',
  proofRefId: 'proof-1',
  reportEligibility,
} satisfies ResultBinding;

describe('semantic changes invalidate calculation results', () => {
  it('marks result with old semanticHash as NIEAKTUALNY_SEMANTYKA', () => {
    expect(resolveResultFreshnessState(currentResult, {
      semanticHash: 'semantic-after-field-function-or-connection-change',
      inputHash: 'input-before',
      caseHash: 'case-hash-1',
      variantHash: 'variant-hash-1',
      switchingSnapshotHash: 'switching-hash-1',
      catalogSnapshotRef: 'catalog-1',
      usedCatalogMaterializationHash: 'used-catalog-1',
    })).toBe('NIEAKTUALNY_SEMANTYKA');
  });

  it('marks result with old inputHash as NIEAKTUALNY_WEJSCIE_SOLVERA when semantics did not change', () => {
    expect(resolveResultFreshnessState(currentResult, {
      semanticHash: 'semantic-before',
      inputHash: 'input-after-solver-assumption-change',
      caseHash: 'case-hash-1',
      variantHash: 'variant-hash-1',
      switchingSnapshotHash: 'switching-hash-1',
      catalogSnapshotRef: 'catalog-1',
      usedCatalogMaterializationHash: 'used-catalog-1',
    })).toBe('NIEAKTUALNY_WEJSCIE_SOLVERA');
  });
});
