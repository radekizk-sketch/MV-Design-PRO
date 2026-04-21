/**
 * Engineering Readiness Panel — PR-13
 *
 * Inżynierski panel gotowości modelu (CANONICAL-grade UX).
 * Prezentuje BLOCKER/IMPORTANT/INFO z walidacji + readiness.
 * Każdy wpis: kod, opis, element, [Przejdź] [Napraw]
 *
 * INVARIANTS:
 * - No auto-mutations
 * - No physics
 * - No solver calls
 * - 100% Polish labels
 * - Deterministic rendering
 */

import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { FixAction, ReadinessIssue, ReadinessSeverity } from '../types';
import type { ReadinessWorkspaceBlockState } from './ReadinessLivePanel';

// =============================================================================
// Constants (Polish labels)
// =============================================================================

const SEVERITY_LABELS: Record<ReadinessSeverity, string> = {
  BLOCKER: 'Blokada',
  IMPORTANT: 'Ostrzeżenie',
  INFO: 'Informacja',
};

const SEVERITY_COLORS: Record<ReadinessSeverity, string> = {
  BLOCKER: 'text-red-700 bg-red-50 border-red-300',
  IMPORTANT: 'text-amber-700 bg-amber-50 border-amber-300',
  INFO: 'text-blue-700 bg-blue-50 border-blue-300',
};

const SEVERITY_BADGE: Record<ReadinessSeverity, string> = {
  BLOCKER: 'bg-red-600 text-white',
  IMPORTANT: 'bg-amber-500 text-white',
  INFO: 'bg-blue-500 text-white',
};

const STATUS_LABELS: Record<string, string> = {
  OK: 'Gotowy',
  WARN: 'Ostrzeżenia',
  FAIL: 'Blokady',
};

const STATUS_COLORS: Record<string, string> = {
  OK: 'text-green-700 bg-green-50 border-green-300',
  WARN: 'text-amber-700 bg-amber-50 border-amber-300',
  FAIL: 'text-red-700 bg-red-50 border-red-300',
};

// =============================================================================
// Issue Item Component
// =============================================================================

interface IssueItemProps {
  issue: ReadinessIssue;
  onNavigate: (elementRef: string) => void;
  onFix: (fixAction: FixAction) => void;
}

const IssueItem: React.FC<IssueItemProps> = ({ issue, onNavigate, onFix }) => {
  const handleNavigate = () => {
    const ref = issue.element_ref ?? issue.element_refs[0];
    if (ref) {
      onNavigate(ref);
    }
  };

  const handleFix = () => {
    if (issue.fix_action) {
      onFix(issue.fix_action);
    }
  };

  const elementRef = issue.element_ref ?? issue.element_refs[0] ?? null;

  return (
    <div
      className={clsx(
        'p-3 border-l-4 mb-2 rounded-r transition-colors',
        SEVERITY_COLORS[issue.severity],
      )}
      data-testid={`readiness-issue-${issue.code}`}
    >
      {/* Header: severity badge + code */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'px-2 py-0.5 text-xs font-bold rounded',
              SEVERITY_BADGE[issue.severity],
            )}
          >
            {SEVERITY_LABELS[issue.severity]}
          </span>
          <span className="text-xs font-mono font-semibold text-gray-600">
            {issue.code}
          </span>
        </div>
      </div>

      {/* Message */}
      <div className="text-sm font-medium mb-1">{issue.message_pl}</div>

      {/* Element reference */}
      {elementRef && (
        <div className="text-xs text-gray-600 mb-2">
          Element: <span className="font-mono font-semibold">{elementRef}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-2">
        {elementRef && (
          <button
            onClick={handleNavigate}
            className="px-3 py-1 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
            data-testid={`navigate-${issue.code}`}
          >
            Przejdź
          </button>
        )}
        {issue.fix_action ? (
          <button
            onClick={handleFix}
            className="px-3 py-1 text-xs font-medium rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            data-testid={`fix-${issue.code}`}
          >
            Napraw
          </button>
        ) : (
          elementRef && (
            <span className="px-3 py-1 text-xs text-gray-400 italic">
              Wymaga interwencji projektanta
            </span>
          )
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Main Panel Component
// =============================================================================

export interface EngineeringReadinessPanelProps {
  issues: ReadinessIssue[];
  status: 'OK' | 'WARN' | 'FAIL';
  ready: boolean;
  bySeverity: Record<ReadinessSeverity, number>;
  onNavigate: (elementRef: string) => void;
  onFix: (fixAction: FixAction) => void;
  /** PR-17: Optional eligibility section rendered below readiness issues. */
  eligibilitySection?: React.ReactNode;
  workspaceBlockState?: ReadinessWorkspaceBlockState | null;
}

export const EngineeringReadinessPanel: React.FC<EngineeringReadinessPanelProps> = ({
  issues,
  status,
  ready,
  bySeverity,
  onNavigate,
  onFix,
  eligibilitySection,
  workspaceBlockState = null,
}) => {
  const [severityFilter, setSeverityFilter] = useState<ReadinessSeverity | null>(null);

  const blockers = useMemo(
    () => issues.filter((i) => i.severity === 'BLOCKER'),
    [issues],
  );
  const warnings = useMemo(
    () => issues.filter((i) => i.severity === 'IMPORTANT'),
    [issues],
  );
  const infos = useMemo(
    () => issues.filter((i) => i.severity === 'INFO'),
    [issues],
  );

  const filteredIssues = useMemo(() => {
    if (!severityFilter) return issues;
    return issues.filter((i) => i.severity === severityFilter);
  }, [issues, severityFilter]);

  const toggleFilter = (severity: ReadinessSeverity) => {
    setSeverityFilter((prev) => (prev === severity ? null : severity));
  };

  if (workspaceBlockState) {
    return (
      <div
        className="h-full flex flex-col bg-white"
        data-testid="engineering-readiness-panel"
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Gotowość inżynieryjna
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Walidacja modelu sieci i gotowość do obliczeń
          </p>
        </div>

        <div className="p-4">
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 p-4"
            data-testid="engineering-readiness-blocked"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Blokada warsztatowa
            </div>
            <div className="mt-2 text-sm font-semibold text-amber-950">
              {workspaceBlockState.title}
            </div>
            <div className="mt-1 text-sm text-amber-900">
              {workspaceBlockState.description}
            </div>
            <div className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900">
              Następny krok: {workspaceBlockState.nextStep}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white" data-testid="engineering-readiness-panel">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">
          Gotowość inżynieryjna
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Walidacja modelu sieci i gotowość do obliczeń
        </p>
      </div>

      {/* Status banner */}
      <div
        className={clsx('px-4 py-3 border-b', STATUS_COLORS[status])}
        data-testid="readiness-status"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              Status: {STATUS_LABELS[status] ?? status}
            </span>
          </div>
          <span className="text-xs">
            {ready ? 'Model gotowy do obliczeń' : 'Model wymaga uzupełnienia'}
          </span>
        </div>
      </div>

      {/* Severity filter pills */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex gap-2">
          {(['BLOCKER', 'IMPORTANT', 'INFO'] as ReadinessSeverity[]).map((severity) => {
            const count = bySeverity[severity] ?? 0;
            const active = severityFilter === null || severityFilter === severity;
            return (
              <button
                key={severity}
                onClick={() => toggleFilter(severity)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium rounded border transition-colors',
                  active
                    ? SEVERITY_COLORS[severity]
                    : 'text-gray-400 bg-gray-50 border-gray-200',
                )}
                data-testid={`filter-${severity}`}
              >
                {SEVERITY_LABELS[severity]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* PR-17: Analysis Eligibility section */}
      {eligibilitySection && (
        <div className="border-b border-gray-200" data-testid="eligibility-section">
          {eligibilitySection}
        </div>
      )}

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredIssues.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            {issues.length === 0
              ? 'Brak problemów \u2014 model gotowy do obliczeń.'
              : 'Brak problemów spełniających filtr.'}
          </div>
        ) : (
          <>
            {/* BLOCKERS section */}
            {(severityFilter === null || severityFilter === 'BLOCKER') &&
              blockers.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">
                    Blokady ({blockers.length})
                  </h3>
                  {blockers.map((issue) => (
                    <IssueItem
                      key={`${issue.code}-${issue.element_ref ?? issue.element_refs.join(',')}`}
                      issue={issue}
                      onNavigate={onNavigate}
                      onFix={onFix}
                    />
                  ))}
                </div>
              )}

            {/* WARNINGS section */}
            {(severityFilter === null || severityFilter === 'IMPORTANT') &&
              warnings.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
                    Ostrzeżenia ({warnings.length})
                  </h3>
                  {warnings.map((issue) => (
                    <IssueItem
                      key={`${issue.code}-${issue.element_ref ?? issue.element_refs.join(',')}`}
                      issue={issue}
                      onNavigate={onNavigate}
                      onFix={onFix}
                    />
                  ))}
                </div>
              )}

            {/* INFO section */}
            {(severityFilter === null || severityFilter === 'INFO') &&
              infos.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">
                    Informacje ({infos.length})
                  </h3>
                  {infos.map((issue) => (
                    <IssueItem
                      key={`${issue.code}-${issue.element_ref ?? issue.element_refs.join(',')}`}
                      issue={issue}
                      onNavigate={onNavigate}
                      onFix={onFix}
                    />
                  ))}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
};
