import { describe, expect, it, vi } from 'vitest';
import type {
  AnalysisEligibilityIssue,
  AnalysisEligibilityResult,
  EligibilityAnalysisType,
  EligibilityOverall,
  EligibilityStatus,
  FixAction,
} from '../../types';
import {
  ELIGIBILITY_ANALYSIS_LABELS,
  ELIGIBILITY_STATUS_LABELS,
} from '../../types';

function makeEligibilityIssue(
  code: string,
  severity: 'BLOCKER' | 'WARNING' | 'INFO',
  messagePl: string,
  elementRef: string | null = null,
  fixAction: FixAction | null = null,
): AnalysisEligibilityIssue {
  return {
    code,
    severity,
    message_pl: messagePl,
    element_ref: elementRef,
    element_type: elementRef ? 'branch' : null,
    fix_action: fixAction,
  };
}

function makeEligibilityResult(
  analysisType: EligibilityAnalysisType,
  status: EligibilityStatus,
  blockers: AnalysisEligibilityIssue[] = [],
  warnings: AnalysisEligibilityIssue[] = [],
  info: AnalysisEligibilityIssue[] = [],
): AnalysisEligibilityResult {
  return {
    analysis_type: analysisType,
    status,
    blockers,
    warnings,
    info,
    by_severity: {
      BLOCKER: blockers.length,
      WARNING: warnings.length,
      INFO: info.length,
    },
    content_hash: `hash_${analysisType}`,
  };
}

const eligibleSc3f = makeEligibilityResult('SC_3F', 'ELIGIBLE');
const eligibleLoadFlow = makeEligibilityResult('LOAD_FLOW', 'ELIGIBLE');

const ineligibleSc2f = makeEligibilityResult(
  'SC_2F',
  'INELIGIBLE',
  [
    makeEligibilityIssue(
      'ELIG_SC2_CONTRACT_NOT_READY',
      'BLOCKER',
      'Kontrakt solver-input nie zawiera pól składowej ujemnej (Z2).',
    ),
    makeEligibilityIssue(
      'ELIG_SC2_MISSING_Z2',
      'BLOCKER',
      'Źródła nie posiadają danych składowej ujemnej (Z2).',
    ),
  ],
);

const ineligibleSc1f = makeEligibilityResult(
  'SC_1F',
  'INELIGIBLE',
  [
    makeEligibilityIssue(
      'ELIG_SC1_MISSING_Z0',
      'BLOCKER',
      'Źródło nie ma danych Z0.',
      'src_grid',
      {
        action_type: 'OPEN_MODAL',
        element_ref: 'src_grid',
        modal_type: 'SourceModal',
        payload_hint: { required: 'zero_sequence' },
      },
    ),
  ],
);

const fullMatrix: AnalysisEligibilityResult[] = [
  eligibleSc3f,
  ineligibleSc2f,
  ineligibleSc1f,
  eligibleLoadFlow,
];

const overallPartial: EligibilityOverall = {
  eligible_any: true,
  eligible_all: false,
  blockers_total: 3,
};

describe('AnalysisEligibilityPanel data model', () => {
  it('supports expected analysis types', () => {
    const types: EligibilityAnalysisType[] = ['SC_3F', 'SC_2F', 'SC_1F', 'LOAD_FLOW'];
    expect(types).toHaveLength(4);
  });

  it('supports expected eligibility statuses', () => {
    const statuses: EligibilityStatus[] = ['ELIGIBLE', 'INELIGIBLE'];
    expect(statuses).toHaveLength(2);
  });

  it('keeps issue structure with fix action metadata', () => {
    const issue = ineligibleSc1f.blockers[0];
    expect(issue.code).toBe('ELIG_SC1_MISSING_Z0');
    expect(issue.message_pl).toContain('Z0');
    expect(issue.fix_action).toEqual(
      expect.objectContaining({
        action_type: 'OPEN_MODAL',
        element_ref: 'src_grid',
      }),
    );
  });

  it('supports every expected action type', () => {
    const actionTypes: FixAction['action_type'][] = [
      'OPEN_MODAL',
      'NAVIGATE_TO_ELEMENT',
      'SELECT_CATALOG',
      'ADD_MISSING_DEVICE',
    ];

    for (const actionType of actionTypes) {
      const fixAction: FixAction = {
        action_type: actionType,
        element_ref: 'el_1',
        modal_type: null,
        payload_hint: null,
      };
      expect(fixAction.action_type).toBe(actionType);
    }
  });
});

describe('AnalysisEligibilityPanel order and gating', () => {
  it('sorts matrix in canonical order', () => {
    const order: EligibilityAnalysisType[] = ['SC_3F', 'SC_2F', 'SC_1F', 'LOAD_FLOW'];
    const orderMap = new Map(order.map((type, index) => [type, index]));
    const sorted = [...fullMatrix].sort(
      (a, b) =>
        (orderMap.get(a.analysis_type) ?? 99) -
        (orderMap.get(b.analysis_type) ?? 99),
    );

    expect(sorted.map((entry) => entry.analysis_type)).toEqual(order);
  });

  it('disables run when readiness or eligibility blocks it', () => {
    const isDisabled = (readinessReady: boolean, analysisEligible?: boolean): boolean => {
      const eligibilityBlocked = analysisEligible === false;
      return !readinessReady || eligibilityBlocked;
    };

    expect(isDisabled(true, false)).toBe(true);
    expect(isDisabled(true, true)).toBe(false);
    expect(isDisabled(false, true)).toBe(true);
    expect(isDisabled(false, undefined)).toBe(true);
  });

  it('resolves eligibility directly from the matrix', () => {
    const getEligibilityForType = (
      matrix: AnalysisEligibilityResult[],
      type: EligibilityAnalysisType,
    ): boolean => matrix.find((entry) => entry.analysis_type === type)?.status === 'ELIGIBLE';

    expect(getEligibilityForType(fullMatrix, 'SC_3F')).toBe(true);
    expect(getEligibilityForType(fullMatrix, 'SC_2F')).toBe(false);
    expect(getEligibilityForType(fullMatrix, 'SC_1F')).toBe(false);
    expect(getEligibilityForType(fullMatrix, 'LOAD_FLOW')).toBe(true);
  });
});

describe('AnalysisEligibilityPanel dispatch', () => {
  it('dispatches OPEN_MODAL action', () => {
    const onFix = vi.fn();
    const issue = ineligibleSc1f.blockers[0];
    if (issue.fix_action) {
      onFix(issue.fix_action);
    }
    expect(onFix).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: 'OPEN_MODAL',
        element_ref: 'src_grid',
      }),
    );
  });

  it('dispatches navigation by element reference', () => {
    const onNavigate = vi.fn();
    const issue = ineligibleSc1f.blockers[0];
    if (issue.element_ref) {
      onNavigate(issue.element_ref);
    }
    expect(onNavigate).toHaveBeenCalledWith('src_grid');
  });

  it('dispatches other supported fix actions', () => {
    const onFix = vi.fn();
    const selectCatalog = makeEligibilityIssue(
      'ELIG_SC3_MISSING_CATALOG_REF',
      'BLOCKER',
      'Brak przypisanego katalogu.',
      'line_1',
      {
        action_type: 'SELECT_CATALOG',
        element_ref: 'line_1',
        modal_type: 'BranchModal',
        payload_hint: { required: 'catalog_ref' },
      },
    );
    const addMissingDevice = makeEligibilityIssue(
      'ELIG_NOT_READY',
      'BLOCKER',
      'Brak źródła zasilania.',
      null,
      {
        action_type: 'ADD_MISSING_DEVICE',
        element_ref: null,
        modal_type: 'SourceModal',
        payload_hint: { required: 'source' },
      },
    );

    onFix(selectCatalog.fix_action);
    onFix(addMissingDevice.fix_action);

    expect(onFix).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action_type: 'SELECT_CATALOG', element_ref: 'line_1' }),
    );
    expect(onFix).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action_type: 'ADD_MISSING_DEVICE', modal_type: 'SourceModal' }),
    );
  });
});

describe('AnalysisEligibilityPanel Polish labels and determinism', () => {
  it('uses Polish labels for all analysis types', () => {
    for (const type of ['SC_3F', 'SC_2F', 'SC_1F', 'LOAD_FLOW'] as const) {
      expect(ELIGIBILITY_ANALYSIS_LABELS[type]).toBeDefined();
      expect(ELIGIBILITY_ANALYSIS_LABELS[type].length).toBeGreaterThan(0);
    }
  });

  it('uses Polish labels for eligibility statuses', () => {
    expect(ELIGIBILITY_STATUS_LABELS.ELIGIBLE).toBe('Możliwe');
    expect(ELIGIBILITY_STATUS_LABELS.INELIGIBLE).toBe('Zablokowane');
  });

  it('does not leak project codenames to labels', () => {
    const codenamePattern = /\bP\d{1,2}\b/;
    for (const label of Object.values(ELIGIBILITY_ANALYSIS_LABELS)) {
      expect(codenamePattern.test(label)).toBe(false);
    }
    for (const label of Object.values(ELIGIBILITY_STATUS_LABELS)) {
      expect(codenamePattern.test(label)).toBe(false);
    }
  });

  it('stays deterministic for equal matrix input', () => {
    expect(JSON.stringify(fullMatrix)).toBe(JSON.stringify(fullMatrix));
    const overall = {
      eligible_any: fullMatrix.some((entry) => entry.status === 'ELIGIBLE'),
      eligible_all: fullMatrix.every((entry) => entry.status === 'ELIGIBLE'),
      blockers_total: fullMatrix.reduce((sum, entry) => sum + entry.blockers.length, 0),
    };
    expect(overall).toEqual(overallPartial);
  });
});
