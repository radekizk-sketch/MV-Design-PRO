import { describe, expect, it } from 'vitest';

import type { TransformerElement } from '../types';
import { networkPosition, quantity, reportEligibility } from './contractTestFixtures';

describe('transformer element rated power and ratio', () => {
  it('keeps side voltages separate from technical voltageRatio label', () => {
    const transformer = {
      refId: 'tr-1',
      elementKind: 'TRANSFORMER',
      engineeringRole: 'MV_LV_TRANSFORMER',
      functionalRole: 'TRANSFORMS_MV_TO_LV',
      networkPosition,
      voltageDomain: 'SN',
      completeness: 'MODEL_TECHNICZNY_PELNY',
      reportEligibility,
      dataQualityState: 'PELNA',
      ports: [],
      terminals: [],
      transformerKind: 'SN_NN',
      highSide: {
        sideId: 'tr-1:high',
        ownerRefId: 'tr-1',
        labelPl: 'Strona SN',
        sideRole: 'STRONA_SN',
        voltageDomain: 'SN',
        nominalVoltageKv: 15,
        phaseSystem: 'ABC',
        portRefs: [],
        terminalRefs: [],
        earthingContextRefId: 'earthing-sn-1',
      },
      lowSide: {
        sideId: 'tr-1:low',
        ownerRefId: 'tr-1',
        labelPl: 'Strona nN',
        sideRole: 'STRONA_NN',
        voltageDomain: 'NN',
        nominalVoltageKv: 0.4,
        phaseSystem: 'ABCN',
        portRefs: [],
        terminalRefs: [],
        earthingContextRefId: null,
      },
      ratedPower: quantity,
      voltageRatio: '15/0.4 kV',
      vectorGroup: 'Dyn5',
      shortCircuitVoltagePercent: 6,
      zeroSequenceModelRefId: 'z0-tr-1',
    } satisfies TransformerElement;

    expect(transformer.highSide.nominalVoltageKv).toBe(15);
    expect(transformer.lowSide.nominalVoltageKv).toBe(0.4);
    expect(transformer.voltageRatio).toBe('15/0.4 kV');
  });
});
