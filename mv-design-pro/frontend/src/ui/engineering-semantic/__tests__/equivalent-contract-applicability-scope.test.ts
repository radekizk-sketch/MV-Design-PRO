import { describe, expect, it } from 'vitest';

import type { EquivalentTechnicalContract } from '../types';
import { quantity, reportEligibility } from './fixtures';

describe('EquivalentTechnicalContract applicability scope', () => {
  it('requires analysis and report scope for non-catalog technical data', () => {
    const contract: EquivalentTechnicalContract = {
      contractRefId: 'contract-1',
      elementRefId: 'cable-1',
      contractKind: 'DANE_EKSPERCKIE',
      solverFieldCoverage: [{
        analysisType: 'ZWARCIE_3F',
        requiredFields: ['r1', 'x1'],
        providedFields: ['r1', 'x1'],
        missingFields: [],
        coverageStatus: 'PELNE',
      }],
      providedValues: { r1: quantity(0.12, 'Ohm/km') },
      applicabilityScope: {
        voltageDomain: 'SN',
        nominalVoltageKv: 15,
        validForAnalysisTypes: ['ZWARCIE_3F'],
        validForReportKinds: ['RAPORT_AUDYTOWY'],
      },
      author: 'projektant',
      justificationPl: 'Dane przyjete z obliczen projektowych.',
      qualityState: 'PELNA',
      reportEligibility,
      createdAt: '2026-04-28T10:00:00Z',
      expiresAt: null,
    };

    expect(contract.applicabilityScope.validForAnalysisTypes).toContain('ZWARCIE_3F');
    expect(contract.applicabilityScope.validForReportKinds).toContain('RAPORT_AUDYTOWY');
  });
});
