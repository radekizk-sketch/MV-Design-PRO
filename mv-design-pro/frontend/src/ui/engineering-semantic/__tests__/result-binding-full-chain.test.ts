import { describe, expect, it } from 'vitest';

import type { ResultBinding } from '../types';
import { reportEligibility } from './contractTestFixtures';

describe('result binding full chain', () => {
  it('carries element, semantic, input, case, variant, switching, catalog and report links', () => {
    const result = {
      schemaVersion: 'v12-result-v8',
      projectRefId: 'project-1',
      resultId: 'result-1',
      resultHash: 'result-hash',
      elementRefId: 'bay-1',
      semanticHash: 'semantic-1',
      inputSnapshotRefId: 'input-1',
      inputHash: 'input-hash',
      caseRefId: 'case-1',
      caseHash: 'case-hash',
      variantRefId: 'variant-1',
      variantHash: 'variant-hash',
      switchingSnapshotRefId: 'switching-1',
      switchingSnapshotHash: 'switching-hash',
      catalogSnapshotRef: 'catalog-1',
      usedCatalogMaterializationHash: 'used-catalog-1',
      analysisType: 'ZWARCIE_3F',
      resultKind: 'ZWARCIE',
      qualityState: 'PELNA',
      freshnessState: 'AKTUALNY',
      proofRefId: 'proof-1',
      reportEligibility,
    } satisfies ResultBinding;

    expect(result.elementRefId).toBe('bay-1');
    expect(result.semanticHash).toBe('semantic-1');
    expect(result.inputSnapshotRefId).toBe('input-1');
    expect(result.proofRefId).toBe('proof-1');
  });
});
