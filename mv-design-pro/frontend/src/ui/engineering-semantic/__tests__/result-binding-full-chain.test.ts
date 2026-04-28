import { describe, expect, it } from 'vitest';

import { resultBinding } from './fixtures';

describe('ResultBinding full chain', () => {
  it('keeps element, semantic model, solver input, proof and report eligibility together', () => {
    expect(resultBinding()).toMatchObject({
      elementRefId: 'bay-1',
      semanticHash: 'sem-1',
      inputSnapshotRefId: 'input-1',
      inputHash: 'input-hash-1',
      proofRefId: 'proof-1',
      reportEligibility: {
        RAPORT_TECHNICZNY: 'RAPORTOWALNY',
      },
    });
  });
});
