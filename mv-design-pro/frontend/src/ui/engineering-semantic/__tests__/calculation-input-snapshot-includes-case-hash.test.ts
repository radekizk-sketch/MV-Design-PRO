import { describe, expect, it } from 'vitest';

import { inputSnapshot } from './fixtures';

describe('CalculationInputSnapshot case hash', () => {
  it('includes caseHash in solver input identity', () => {
    const base = inputSnapshot();
    expect(base.caseHash).toBe('case-hash-1');
    expect(inputSnapshot({ caseHash: 'case-hash-2' }).inputHash).not.toBe(base.inputHash);
  });
});
