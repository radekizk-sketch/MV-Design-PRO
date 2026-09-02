/**
 * Analysis Eligibility Panel — PR-17
 *
 * Panel macierzy zdolności uruchomienia analiz.
 * Wyświetla status ELIGIBLE/INELIGIBLE dla każdego typu analizy
 * z listą wymagań konfiguracji, ostrzeżeń i działań projektowych.
 */

import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type {
  AnalysisEligibilityIssue,
  AnalysisEligibilityResult,
  EligibilityAnalysisType,
  EligibilityOverall,
  EligibilityStatus,
  FixAction,
} from '../types';
import {
  ELIGIBILITY_ANALYSIS_LABELS,
  ELIGIBILITY_STATUS_LABELS,
} from '../types';

const STATUS_BADGE: Record<EligibilityStatus, string> = {
  ELIGIBLE: 'bg-green-600 text-white',
  INELIGIBLE: 'bg-red-600 text-white',
};

const STATUS_BORDER: Record<EligibilityStatus, string> = {
  ELIGIBLE: 'border-green-300 bg-green-50',
  INELIGIBLE: 'border-red-300 bg-red-50',
};

const ISSUE_SEVERITY_COLORS: Record<string, string> = {
  BLOCKER: 'text-red-700 bg-red-50 border-red-300',
  WARNING: 'text-amber-700 bg-amber-50 border-amber-300',
  INFO: 'text-blue-700 bg-blue-50 border-blue-300',
};

const ISSUE_SEVERITY_LABELS: Record<string, string> = {
  BLOCKER: 'Wymaganie konfiguracji',
  WARNING: 'Ostrzeżenie',
  INFO: 'Informacja',
};

const ANALYSIS_TYPE_ORDER: EligibilityAnalysisType[] = [
  'SC_3F',
  'SC_2F',
  'SC_1F',
  'LOAD_FLOW',
  'FAULT_LOOP_NN',
  'SWZ_NN',
];

export function publicElementRefLabel(elementRef: string): string {
  const value = elementRef.trim().toLowerCase();
  if (!value) return 'Element układu';
  if (value.startsWith('gpz/') && value.includes('/source')) return 'Źródło GPZ';
  if (value.startsWith('gpz/') && value.includes('/bay/')) return 'Pole SN w GPZ';
  if (value.startsWith('gpz/')) return 'Układ GPZ';
  if (value.startsWith('stn/')) return 'Stacja SN/nN';
  if (value.startsWith('seg/') || value.startsWith('line_') || value.startsWith('branch_')) return 'Odcinek SN';
  if (value.startsWith('src') || value.includes('source')) return 'Źródło zasilania';
  if (value.includes('transformer') || value.includes('/tr')) return 'Transformator';
  if (value.includes('pv')) return 'Źródło PV';
  if (value.includes('bess')) return 'Magazyn energii';
  if (value.includes('fw') || value.includes('wind')) return 'Źródło wiatrowe';
  return 'Element układu';
}

interface EligibilityIssueItemProps {
  issue: AnalysisEligibilityIssue;
  onNavigate: (elementRef: string) => void;
  onFix: (fixAction: FixAction) => void;
}

const EligibilityIssueItem: React.FC<EligibilityIssueItemProps> = ({
  issue,
  onNavigate,
  onFix,
}) => {
  const handleNavigate = () => {
    if (issue.element_ref) {
      onNavigate(issue.element_ref);
    }
  };

  const handleFix = () => {
    if (issue.fix_action) {
      onFix(issue.fix_action);
    }
  };

  return (
    <div
      className={clsx(
        'mb-1 rounded-r border-l-4 p-2 text-sm',
        ISSUE_SEVERITY_COLORS[issue.severity],
      )}
      data-testid={`eligibility-issue-${issue.code}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-bold">
          {ISSUE_SEVERITY_LABELS[issue.severity] ?? issue.severity}
        </span>
      </div>
      <div className="text-sm">{issue.message_pl}</div>
      {issue.element_ref && (
        <div className="mt-1 text-xs text-gray-600">
          Zakres: <span className="font-semibold">{publicElementRefLabel(issue.element_ref)}</span>
        </div>
      )}
      <div className="mt-1 flex gap-2">
        {issue.element_ref && (
          <button
            onClick={handleNavigate}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-gray-50"
            data-testid={`eligibility-navigate-${issue.code}`}
          >
            Przejdź
          </button>
        )}
        {issue.fix_action && (
          <button
            onClick={handleFix}
            className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            data-testid={`eligibility-fix-${issue.code}`}
          >
            Skonfiguruj
          </button>
        )}
      </div>
    </div>
  );
};

interface AnalysisEntryProps {
  result: AnalysisEligibilityResult;
  onNavigate: (elementRef: string) => void;
  onFix: (fixAction: FixAction) => void;
}

const AnalysisEntry: React.FC<AnalysisEntryProps> = ({
  result,
  onNavigate,
  onFix,
}) => {
  const [expanded, setExpanded] = useState(false);

  const allIssues = useMemo(
    () => [...result.blockers, ...result.warnings, ...result.info],
    [result],
  );

  const blockerCount = result.blockers.length;
  const label = ELIGIBILITY_ANALYSIS_LABELS[result.analysis_type] ?? result.analysis_type;
  const statusLabel = ELIGIBILITY_STATUS_LABELS[result.status] ?? result.status;

  return (
    <div
      className={clsx('mb-3 rounded border', STATUS_BORDER[result.status])}
      data-testid={`eligibility-entry-${result.analysis_type}`}
    >
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              'rounded px-2 py-0.5 text-xs font-bold',
              STATUS_BADGE[result.status],
            )}
            data-testid={`eligibility-status-${result.analysis_type}`}
          >
            {statusLabel}
          </span>
          <span className="text-sm font-semibold text-gray-800">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {blockerCount > 0 && (
            <span className="text-xs font-medium text-red-600">
              {blockerCount} {blockerCount === 1 ? 'wymaganie' : 'wymagań'}
            </span>
          )}
          {allIssues.length > 0 && (
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium hover:bg-gray-50"
              data-testid={`eligibility-toggle-${result.analysis_type}`}
            >
              {expanded ? 'Zwiń' : 'Pokaż wymagania'}
            </button>
          )}
        </div>
      </div>

      {expanded && allIssues.length > 0 && (
        <div className="px-3 pb-3">
          {allIssues.map((issue) => (
            <EligibilityIssueItem
              key={`${issue.code}-${issue.element_ref ?? ''}`}
              issue={issue}
              onNavigate={onNavigate}
              onFix={onFix}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export interface AnalysisEligibilityPanelProps {
  matrix: AnalysisEligibilityResult[];
  overall: EligibilityOverall;
  onNavigate: (elementRef: string) => void;
  onFix: (fixAction: FixAction) => void;
}

export const AnalysisEligibilityPanel: React.FC<AnalysisEligibilityPanelProps> = ({
  matrix,
  overall,
  onNavigate,
  onFix,
}) => {
  const sortedMatrix = useMemo(() => {
    const orderMap = new Map(ANALYSIS_TYPE_ORDER.map((type, index) => [type, index]));
    return [...matrix].sort(
      (a, b) =>
        (orderMap.get(a.analysis_type) ?? 99) -
        (orderMap.get(b.analysis_type) ?? 99),
    );
  }, [matrix]);

  return (
    <div className="bg-white" data-testid="analysis-eligibility-panel">
      <div className="border-b border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800">Zdolność analiz</h3>
        <p className="mt-1 text-xs text-gray-500">
          Macierz dostępności typów analiz obliczeniowych
        </p>
      </div>

      <div
        className={clsx(
          'border-b px-4 py-2 text-xs',
          overall.eligible_all
            ? 'bg-green-50 text-green-700'
            : 'bg-amber-50 text-amber-700',
        )}
        data-testid="eligibility-summary"
      >
        {overall.eligible_all
          ? 'Wszystkie analizy dostępne'
          : overall.eligible_any
            ? `Część analiz wymaga konfiguracji (${overall.blockers_total} wymagań)`
            : `Analizy wymagają konfiguracji (${overall.blockers_total} wymagań)`}
      </div>

      <div className="p-4">
        {sortedMatrix.map((result) => (
          <AnalysisEntry
            key={result.analysis_type}
            result={result}
            onNavigate={onNavigate}
            onFix={onFix}
          />
        ))}
      </div>
    </div>
  );
};
