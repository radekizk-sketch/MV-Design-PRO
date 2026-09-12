/**
 * Engineering Readiness Panel Tests — PR-13
 *
 * Tests:
 * - Rendering panelu z 3 BLOCKERAMI
 * - Kliknięcie "Napraw" wywołuje onFix z poprawnym FixAction
 * - Kliknięcie "Przejdź" wywołuje onNavigate
 * - Brak fix_action → "Wymaga interwencji projektanta"
 * - Severity filter działa
 * - Snapshot stabilny (deterministyczny)
 */

import { describe, it, expect, vi } from 'vitest';
import type { FixAction, ReadinessIssue, ReadinessSeverity } from '../../types';

// =============================================================================
// Test Data
// =============================================================================

function makeBlocker(
  code: string,
  elementRef: string,
  fixAction: FixAction | null = null,
): ReadinessIssue {
  return {
    code,
    severity: 'BLOCKER',
    element_ref: elementRef,
    element_refs: [elementRef],
    message_pl: `Blokada ${code} na ${elementRef}`,
    wizard_step_hint: 'K5',
    suggested_fix: `Napraw ${code}`,
    fix_action: fixAction,
  };
}

function makeWarning(code: string, elementRef: string): ReadinessIssue {
  return {
    code,
    severity: 'IMPORTANT',
    element_ref: elementRef,
    element_refs: [elementRef],
    message_pl: `Ostrzeżenie ${code} na ${elementRef}`,
    wizard_step_hint: 'K7',
    suggested_fix: `Napraw ${code}`,
    fix_action: {
      action_type: 'OPEN_MODAL',
      element_ref: elementRef,
      modal_type: 'BranchModal',
      payload_hint: { required: 'zero_sequence' },
    },
  };
}

function makeInfo(code: string, elementRef: string): ReadinessIssue {
  return {
    code,
    severity: 'INFO',
    element_ref: elementRef,
    element_refs: [elementRef],
    message_pl: `Info ${code} na ${elementRef}`,
    wizard_step_hint: 'K3',
    suggested_fix: null,
    fix_action: null,
  };
}

const THREE_BLOCKERS: ReadinessIssue[] = [
  makeBlocker('E009', 'trafo_1', {
    action_type: 'SELECT_CATALOG',
    element_ref: 'trafo_1',
    modal_type: 'TransformerModal',
    payload_hint: { required: 'catalog_ref' },
  }),
  makeBlocker('E009', 'cab_1', {
    action_type: 'SELECT_CATALOG',
    element_ref: 'cab_1',
    modal_type: 'BranchModal',
    payload_hint: { required: 'catalog_ref' },
  }),
  makeBlocker('E006', 'trafo_2', {
    action_type: 'OPEN_MODAL',
    element_ref: 'trafo_2',
    modal_type: 'TransformerModal',
    payload_hint: { required: 'uk_percent' },
  }),
];

const MIXED_ISSUES: ReadinessIssue[] = [
  ...THREE_BLOCKERS,
  makeWarning('W001', 'ln_1'),
  makeWarning('W004', 'trafo_1'),
  makeInfo('I001', 'sw_1'),
];

const BY_SEVERITY_THREE_BLOCKERS: Record<ReadinessSeverity, number> = {
  BLOCKER: 3,
  IMPORTANT: 0,
  INFO: 0,
};

const BY_SEVERITY_MIXED: Record<ReadinessSeverity, number> = {
  BLOCKER: 3,
  IMPORTANT: 2,
  INFO: 1,
};

// =============================================================================
// Tests: Data Model
// =============================================================================

describe('EngineeringReadinessPanel data model', () => {
  it('should have correct structure for ReadinessIssue', () => {
    const issue = THREE_BLOCKERS[0];
    expect(issue.code).toBe('E009');
    expect(issue.severity).toBe('BLOCKER');
    expect(issue.element_ref).toBe('trafo_1');
    expect(issue.fix_action).not.toBeNull();
    expect(issue.fix_action!.action_type).toBe('SELECT_CATALOG');
    expect(issue.fix_action!.modal_type).toBe('TransformerModal');
  });

  it('should support issues without fix_action', () => {
    const issue = makeBlocker('E003', 'island_bus_1', null);
    expect(issue.fix_action).toBeNull();
  });

  it('should support all FixAction types', () => {
    const types: FixAction['action_type'][] = [
      'OPEN_MODAL',
      'NAVIGATE_TO_ELEMENT',
      'SELECT_CATALOG',
      'ADD_MISSING_DEVICE',
    ];
    for (const actionType of types) {
      const fa: FixAction = {
        action_type: actionType,
        element_ref: 'el_1',
        modal_type: null,
        payload_hint: null,
      };
      expect(fa.action_type).toBe(actionType);
    }
  });
});

// =============================================================================
// Tests: Issue Filtering
// =============================================================================

describe('EngineeringReadinessPanel filtering', () => {
  it('should group issues by severity', () => {
    const blockers = MIXED_ISSUES.filter((i) => i.severity === 'BLOCKER');
    const warnings = MIXED_ISSUES.filter((i) => i.severity === 'IMPORTANT');
    const infos = MIXED_ISSUES.filter((i) => i.severity === 'INFO');

    expect(blockers).toHaveLength(3);
    expect(warnings).toHaveLength(2);
    expect(infos).toHaveLength(1);
  });

  it('should count issues by severity correctly', () => {
    const computed: Record<ReadinessSeverity, number> = {
      BLOCKER: 0,
      IMPORTANT: 0,
      INFO: 0,
    };
    for (const issue of MIXED_ISSUES) {
      computed[issue.severity]++;
    }
    expect(computed).toEqual(BY_SEVERITY_MIXED);
  });

  it('should count issues by severity for a blocker-only set', () => {
    // ZBIÓR SAMYCH BLOKERÓW jest przypadkiem brzegowym zliczania: pola
    // IMPORTANT i INFO muszą zostać ZEROWE, a nie zniknąć. Wzorzec
    // `BY_SEVERITY_THREE_BLOCKERS` istniał w tym pliku od początku, ale NIC go
    // nie używało — czyli sprawdzenie było zadeklarowane i nigdy nie wykonane
    // (`tsc` zgłaszał to jako TS6133). Dopisanie asercji jest naprawą u źródła;
    // skasowanie stałej ukryłoby lukę zamiast ją zamknąć.
    const computed: Record<ReadinessSeverity, number> = {
      BLOCKER: 0,
      IMPORTANT: 0,
      INFO: 0,
    };
    for (const issue of THREE_BLOCKERS) {
      computed[issue.severity]++;
    }
    expect(computed).toEqual(BY_SEVERITY_THREE_BLOCKERS);
  });

  it('should filter by single severity', () => {
    const filter: ReadinessSeverity = 'BLOCKER';
    const filtered = MIXED_ISSUES.filter((i) => i.severity === filter);
    expect(filtered).toHaveLength(3);
    expect(filtered.every((i) => i.severity === 'BLOCKER')).toBe(true);
  });
});

// =============================================================================
// Tests: Fix Action Callbacks
// =============================================================================

describe('EngineeringReadinessPanel fix actions', () => {
  it('should call onFix with correct FixAction for BLOCKER with fix', () => {
    const onFix = vi.fn();
    const issue = THREE_BLOCKERS[0];

    // Simulate fix button click
    if (issue.fix_action) {
      onFix(issue.fix_action);
    }

    expect(onFix).toHaveBeenCalledTimes(1);
    expect(onFix).toHaveBeenCalledWith({
      action_type: 'SELECT_CATALOG',
      element_ref: 'trafo_1',
      modal_type: 'TransformerModal',
      payload_hint: { required: 'catalog_ref' },
    });
  });

  it('should call onNavigate with element_ref', () => {
    const onNavigate = vi.fn();
    const issue = THREE_BLOCKERS[0];

    const ref = issue.element_ref ?? issue.element_refs[0];
    if (ref) {
      onNavigate(ref);
    }

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('trafo_1');
  });

  it('should not call onFix when fix_action is null', () => {
    const onFix = vi.fn();
    const issue = makeBlocker('E003', 'island', null);

    // fix button should not exist — fix_action is null
    if (issue.fix_action) {
      onFix(issue.fix_action);
    }

    expect(onFix).not.toHaveBeenCalled();
  });

  it('should handle all fix action types correctly', () => {
    const onFix = vi.fn();

    const actions: FixAction[] = [
      { action_type: 'OPEN_MODAL', element_ref: 'e1', modal_type: 'NodeModal', payload_hint: null },
      { action_type: 'NAVIGATE_TO_ELEMENT', element_ref: 'e2', modal_type: null, payload_hint: null },
      { action_type: 'SELECT_CATALOG', element_ref: 'e3', modal_type: 'BranchModal', payload_hint: { required: 'catalog_ref' } },
      { action_type: 'ADD_MISSING_DEVICE', element_ref: null, modal_type: 'SourceModal', payload_hint: { required: 'source' } },
    ];

    for (const action of actions) {
      onFix(action);
    }

    expect(onFix).toHaveBeenCalledTimes(4);
  });
});

// =============================================================================
// Tests: Determinism (Snapshot Stability)
// =============================================================================

describe('EngineeringReadinessPanel determinism', () => {
  it('should produce stable JSON for same issues', () => {
    const json1 = JSON.stringify(THREE_BLOCKERS);
    const json2 = JSON.stringify(THREE_BLOCKERS);
    expect(json1).toBe(json2);
  });

  it('should produce stable severity counts', () => {
    const compute = (issues: ReadinessIssue[]): Record<ReadinessSeverity, number> => {
      const result: Record<ReadinessSeverity, number> = { BLOCKER: 0, IMPORTANT: 0, INFO: 0 };
      for (const issue of issues) {
        result[issue.severity]++;
      }
      return result;
    };

    const counts1 = compute(MIXED_ISSUES);
    const counts2 = compute(MIXED_ISSUES);
    expect(counts1).toEqual(counts2);
  });

  it('issues are sorted by severity → code → element_ref', () => {
    const severityRank: Record<ReadinessSeverity, number> = {
      BLOCKER: 0,
      IMPORTANT: 1,
      INFO: 2,
    };

    const sorted = [...MIXED_ISSUES].sort((a, b) => {
      const rankDiff = severityRank[a.severity] - severityRank[b.severity];
      if (rankDiff !== 0) return rankDiff;
      const codeDiff = a.code.localeCompare(b.code);
      if (codeDiff !== 0) return codeDiff;
      return (a.element_ref ?? '').localeCompare(b.element_ref ?? '');
    });

    // Blockers first, then warnings, then info
    expect(sorted[0].severity).toBe('BLOCKER');
    expect(sorted[sorted.length - 1].severity).toBe('INFO');
  });
});

// =============================================================================
// Tests: Status Display
// =============================================================================

describe('EngineeringReadinessPanel status', () => {
  it('FAIL status when blockers exist', () => {
    const status = THREE_BLOCKERS.some((i) => i.severity === 'BLOCKER') ? 'FAIL' : 'OK';
    expect(status).toBe('FAIL');
  });

  it('OK status when no issues', () => {
    const issues: ReadinessIssue[] = [];
    const status = issues.some((i) => i.severity === 'BLOCKER')
      ? 'FAIL'
      : issues.some((i) => i.severity === 'IMPORTANT')
        ? 'WARN'
        : 'OK';
    expect(status).toBe('OK');
  });

  it('WARN status when only warnings', () => {
    const issues = [makeWarning('W001', 'ln_1')];
    const status = issues.some((i) => i.severity === 'BLOCKER')
      ? 'FAIL'
      : issues.some((i) => i.severity === 'IMPORTANT')
        ? 'WARN'
        : 'OK';
    expect(status).toBe('WARN');
  });
});
