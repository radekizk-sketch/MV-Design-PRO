import { describe, expect, it } from 'vitest';

import { transformerElement } from './fixtures';

describe('TransformerElement rated power and ratio', () => {
  it('separates side voltages from the technical voltage ratio label', () => {
    const transformer = transformerElement();
    expect(transformer.highSide.nominalVoltageKv).toBe(15);
    expect(transformer.lowSide.nominalVoltageKv).toBe(0.4);
    expect(transformer.ratedPower?.normalizedUnit).toBe('kW');
    expect(transformer.voltageRatio).toBe('15/0.4 kV');
  });
});
