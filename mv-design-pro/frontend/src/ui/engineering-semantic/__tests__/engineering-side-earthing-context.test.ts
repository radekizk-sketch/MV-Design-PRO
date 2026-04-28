import { describe, expect, it } from 'vitest';

import { highSide, lowSide } from './fixtures';

describe('EngineeringSide earthing context', () => {
  it('keeps earthing context on each transformer side', () => {
    expect(highSide.earthingContextRefId).toBe('earth-sn-1');
    expect(lowSide.earthingContextRefId).toBe('earth-nn-1');
  });
});
