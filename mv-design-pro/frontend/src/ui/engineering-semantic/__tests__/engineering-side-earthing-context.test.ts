import { describe, expect, it } from 'vitest';

import type { EngineeringSide } from '../types';

describe('engineering side earthing context', () => {
  it('links multidomain sides to an earthing context when applicable', () => {
    const side = {
      sideId: 'tr-1:sn',
      ownerRefId: 'tr-1',
      labelPl: 'Strona SN',
      sideRole: 'STRONA_SN',
      voltageDomain: 'SN',
      nominalVoltageKv: 15,
      phaseSystem: 'ABC',
      portRefs: ['tr-1:sn-port'],
      terminalRefs: ['tr-1:sn-terminal'],
      earthingContextRefId: 'earthing-sn-1',
    } satisfies EngineeringSide;

    expect(side.earthingContextRefId).toBe('earthing-sn-1');
  });
});
