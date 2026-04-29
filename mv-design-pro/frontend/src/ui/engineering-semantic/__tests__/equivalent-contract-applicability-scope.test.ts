import { describe, expect, it } from 'vitest';

import type { EquivalentTechnicalContract } from '../types';
import { quantity, reportEligibility } from './contractTestFixtures';

describe('equivalent technical contract applicability scope', () => {
  it('requires solver coverage and explicit applicability scope', () => {
    const contract = {
      contractRefId: 'contract-1',
      elementRefId: 'cable-1',
      contractKind: 'DANE_PROJEKTANTA',
      solverFieldCoverage: [{
        analysisType: 'ZWARCIE_3F',
        requiredFields: ['r1', 'x1'],
        providedFields: ['r1', 'x1'],
        missingFields: [],
        coverageStatus: 'PELNE',
      }],
      providedValues: { r1: quantity, x1: quantity },
      applicabilityScope: {
        voltageDomain: 'SN',
        nominalVoltageKv: 15,
        validForAnalysisTypes: ['ZWARCIE_3F'],
        validForReportKinds: ['RAPORT_TECHNICZNY'],
      },
      author: 'Projektant',
      justificationPl: 'Dane projektanta dla etapu koncepcji.',
      qualityState: 'CZESCIOWA',
      reportEligibility,
      createdAt: '2026-04-28T00:00:00Z',
      expiresAt: null,
    } satisfies EquivalentTechnicalContract;

    expect(contract.applicabilityScope.validForAnalysisTypes).toContain('ZWARCIE_3F');
    expect(contract.solverFieldCoverage[0].coverageStatus).toBe('PELNE');
  });
});
