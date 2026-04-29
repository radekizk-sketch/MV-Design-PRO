import { describe, expect, it } from 'vitest';

import { createEngineeringQuantity } from '../quantity';

describe('engineering quantity normalization precision', () => {
  it('normalizes units and stores explicit precision for hashable quantities', () => {
    const quantity = createEngineeringQuantity(1234.56789, 'm', { precision: 3, source: 'KATALOG' });

    expect(quantity.normalizedUnit).toBe('km');
    expect(quantity.normalizedValue).toBe(1.235);
    expect(quantity.normalizationPrecision).toBe(3);
    expect(quantity.source).toBe('KATALOG');
  });
});
