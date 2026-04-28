import { describe, expect, it } from 'vitest';

import { inputSnapshot, overlayProjection, semanticModel } from './fixtures';

describe('projection hashes ignore audit timestamps', () => {
  it('does not include generatedAt in semanticHash, inputHash or overlayHash', () => {
    expect(semanticModel({ generatedAt: '2026-04-28T10:00:00Z' }).semanticHash).toBe(
      semanticModel({ generatedAt: '2026-04-28T11:00:00Z' }).semanticHash,
    );
    expect(inputSnapshot({ generatedAt: '2026-04-28T10:00:00Z' }).inputHash).toBe(
      inputSnapshot({ generatedAt: '2026-04-28T11:00:00Z' }).inputHash,
    );
    expect(overlayProjection().overlayHash).toBe(overlayProjection().overlayHash);
  });
});
