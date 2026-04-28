import { describe, expect, it } from 'vitest';

import { quantity } from './fixtures';

describe('EngineeringQuantity normalization precision', () => {
  it('normalizes units and records precision used by deterministic hashes', () => {
    const length = quantity(1500, 'm', 4);
    expect(length).toMatchObject({
      normalizedValue: 1.5,
      normalizedUnit: 'km',
      normalizationPrecision: 4,
    });
  });
});
