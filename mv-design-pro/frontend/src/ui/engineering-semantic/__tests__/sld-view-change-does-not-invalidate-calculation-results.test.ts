import { describe, expect, it } from 'vitest';

import { resolveResultFreshnessState } from '../resultFreshness';
import { buildSldBaseProjectionViewModel } from '../sldProjectionAdapter';
import type { ResultBinding } from '../types';
import { reportEligibility, semanticModel } from './contractTestFixtures';

const result = {
  schemaVersion: 'v12-result-v8',
  projectRefId: 'project-1',
  resultId: 'result-1',
  resultHash: 'result-hash-1',
  elementRefId: 'bus-1',
  semanticHash: 'semantic-1',
  inputSnapshotRefId: 'input-1',
  inputHash: 'input-hash-1',
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

describe('SLD view changes and calculation freshness boundary', () => {
  it('changes viewHash without changing semanticHash, inputHash or result freshness', () => {
    const firstView = buildSldBaseProjectionViewModel(
      semanticModel,
      [{
        id: 'sym-bus-1',
        elementId: 'bus-1',
        elementType: 'Bus',
        elementName: 'SZ-1',
        x: 0,
        y: 0,
      }],
      [{
        id: 'conn-1',
        fromSymbolId: 'sym-bus-1',
        toSymbolId: 'sym-bus-1',
        connectionType: 'line',
        path: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      }],
    );
    const changedLayoutView = buildSldBaseProjectionViewModel(
      semanticModel,
      [{
        id: 'sym-bus-1',
        elementId: 'bus-1',
        elementType: 'Bus',
        elementName: 'SZ-1 zmieniona etykieta widoku',
        x: 120,
        y: 60,
      }],
      [{
        id: 'conn-1',
        fromSymbolId: 'sym-bus-1',
        toSymbolId: 'sym-bus-1',
        connectionType: 'line',
        path: [{ x: 120, y: 60 }, { x: 220, y: 60 }],
      }],
    );

    expect(firstView?.semanticHash).toBe('semantic-1');
    expect(changedLayoutView?.semanticHash).toBe('semantic-1');
    expect(changedLayoutView?.viewHash).not.toBe(firstView?.viewHash);
    expect(result.inputHash).toBe('input-hash-1');
    expect(resolveResultFreshnessState(result, {
      semanticHash: 'semantic-1',
      inputHash: 'input-hash-1',
      caseHash: 'case-hash-1',
      variantHash: 'variant-hash-1',
      switchingSnapshotHash: 'switching-hash-1',
      catalogSnapshotRef: 'catalog-1',
      usedCatalogMaterializationHash: 'used-catalog-1',
    })).toBe('AKTUALNY');
  });
});
