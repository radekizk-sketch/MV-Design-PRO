import { describe, expect, it } from 'vitest';

import { inputSnapshot } from './fixtures';

describe('CalculationInputSnapshot solver settings hash', () => {
  it('includes solverSettingsHash and assumptionsHash in inputHash', () => {
    const base = inputSnapshot();
    expect(inputSnapshot({ solverSettingsHash: 'solver-settings-2' }).inputHash).not.toBe(base.inputHash);
    expect(inputSnapshot({ assumptionsHash: 'assumptions-2' }).inputHash).not.toBe(base.inputHash);
  });
});
