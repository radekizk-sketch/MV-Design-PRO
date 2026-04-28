import { describe, expect, it } from 'vitest';

import { withReportEligibilityHash } from '../projections';
import type { ReportEligibilityProjection } from '../types';
import { reportEligibility } from './fixtures';

describe('ReportEligibilityProjection coverage', () => {
  it('covers elements, results, proofs and whole report packages', () => {
    const projection: Omit<ReportEligibilityProjection, 'reportEligibilityHash'> = {
      schemaVersion: 'v12-report-eligibility-v1',
      projectRefId: 'project-1',
      semanticHash: 'sem-1',
      readinessHash: 'ready-1',
      reportRuleRegistryHash: 'report-rules-1',
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
    };

    expect(withReportEligibilityHash(projection).reportEligibilityHash).toMatch(/^report-/);
  });
});
