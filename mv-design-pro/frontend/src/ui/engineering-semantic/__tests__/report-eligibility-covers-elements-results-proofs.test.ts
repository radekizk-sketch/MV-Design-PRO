import { describe, expect, it } from 'vitest';

import type { ReportEligibilityProjection } from '../types';
import { reportEligibility } from './contractTestFixtures';

describe('report eligibility projection', () => {
  it('covers elements, results, proofs and report packages', () => {
    const projection = {
      schemaVersion: 'v12-report-eligibility-v8',
      projectRefId: 'project-1',
      semanticHash: 'semantic-1',
      readinessHash: 'readiness-1',
      reportRuleRegistryHash: 'report-rules-1',
      reportEligibilityHash: 'report-eligibility-1',
      elementReportStatuses: { 'bay-1': reportEligibility },
      resultReportStatuses: { 'result-1': reportEligibility },
      proofReportStatuses: { 'proof-1': reportEligibility },
      reportPackageStatuses: {
        RAPORT_TECHNICZNY: 'RAPORTOWALNY',
        RAPORT_OSD: 'RAPORTOWALNY',
        RAPORT_AUDYTOWY: 'RAPORTOWALNY',
        RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
        RAPORT_ZABEZPIECZEN: 'NIE_DOTYCZY',
      },
    } satisfies ReportEligibilityProjection;

    expect(projection.resultReportStatuses['result-1'].RAPORT_TECHNICZNY).toBe('RAPORTOWALNY');
    expect(projection.proofReportStatuses['proof-1'].RAPORT_AUDYTOWY).toBe('RAPORTOWALNY');
  });
});
