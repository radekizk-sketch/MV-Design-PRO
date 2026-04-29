import { describe, expect, it } from 'vitest';

import { normalizeForDeterministicHash, stableHash } from '../semanticHashPolicy';

describe('projection hashes ignore audit timestamps', () => {
  it('keeps deterministic hashes stable when only generatedAt changes', () => {
    const first = stableHash(normalizeForDeterministicHash({
      semanticHash: 'semantic-1',
      generatedAt: '2026-04-28T00:00:00Z',
      createdAt: '2026-04-28T00:00:00Z',
      author: 'Projektant A',
      elements: ['bay-1'],
    }));
    const second = stableHash(normalizeForDeterministicHash({
      semanticHash: 'semantic-1',
      generatedAt: '2026-04-28T12:00:00Z',
      createdAt: '2026-04-28T12:00:00Z',
      author: 'Projektant B',
      elements: ['bay-1'],
    }));

    expect(second).toBe(first);
  });
});
