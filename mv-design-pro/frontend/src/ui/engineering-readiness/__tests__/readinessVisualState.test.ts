import { describe, expect, it } from 'vitest';

import { resolveReadinessVisualState } from '../readinessVisualState';
import type { ReadinessIssue } from '../../types';
import type { ReadinessWorkspaceBlockState } from '../ReadinessLivePanel';

function makeIssue(severity: 'BLOCKER' | 'IMPORTANT' | 'INFO' = 'BLOCKER'): ReadinessIssue {
  return {
    code: `issue.${severity.toLowerCase()}`,
    severity,
    element_ref: null,
    element_refs: [],
    message_pl: 'Komunikat testowy',
    wizard_step_hint: 'K1',
    suggested_fix: null,
    fix_action: null,
  };
}

const workspaceBlockState: ReadinessWorkspaceBlockState = {
  reason: 'NO_SOURCE',
  title: 'Brak źródła zasilania',
  description: 'Model nie ma jeszcze GPZ.',
  nextStep: 'Dodaj GPZ.',
};

describe('resolveReadinessVisualState', () => {
  it('returns error before any other visual state', () => {
    expect(
      resolveReadinessVisualState({
        issues: [],
        status: 'FAIL',
        ready: false,
        loading: false,
        error: 'Błąd odczytu',
      }),
    ).toBe('error');
  });

  it('returns loading when readiness is still loading and no issues are present', () => {
    expect(
      resolveReadinessVisualState({
        issues: [],
        status: 'WARN',
        ready: false,
        loading: true,
      }),
    ).toBe('loading');
  });

  it('returns blocked for a structurally blocked workspace', () => {
    expect(
      resolveReadinessVisualState({
        issues: [],
        status: 'FAIL',
        ready: false,
        loading: false,
        workspaceBlockState,
      }),
    ).toBe('blocked');
  });

  it('keeps workspace blocked even when stale readiness says ready', () => {
    expect(
      resolveReadinessVisualState({
        issues: [],
        status: 'OK',
        ready: true,
        loading: false,
        workspaceBlockState,
      }),
    ).toBe('blocked');
  });

  it('keeps workspace blocked even when issue rows are still present', () => {
    expect(
      resolveReadinessVisualState({
        issues: [makeIssue('BLOCKER')],
        status: 'FAIL',
        ready: false,
        loading: false,
        workspaceBlockState,
      }),
    ).toBe('blocked');
  });

  it('returns ready only when backend confirmed readiness and no issues remain', () => {
    expect(
      resolveReadinessVisualState({
        issues: [],
        status: 'OK',
        ready: true,
        loading: false,
      }),
    ).toBe('ready');
  });

  it('returns pending when there are no issues but readiness is not confirmed yet', () => {
    expect(
      resolveReadinessVisualState({
        issues: [],
        status: 'WARN',
        ready: false,
        loading: false,
      }),
    ).toBe('pending');
  });

  it('returns issues when warnings remain even if backend readiness is true', () => {
    expect(
      resolveReadinessVisualState({
        issues: [makeIssue('IMPORTANT')],
        status: 'OK',
        ready: true,
        loading: false,
      }),
    ).toBe('issues');
  });
});
