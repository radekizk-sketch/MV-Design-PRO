/**
 * Issue Panel Component — P30d
 *
 * Centralized validation/interpretation browser.
 * Aggregates MODEL + POWER_FLOW + PROTECTION findings.
 *
 * Features:
 * - Filter by source (MODEL/POWER_FLOW/PROTECTION)
 * - Filter by severity (INFO/WARN/HIGH)
 * - Click issue → navigate to object (Tree + SLD highlight)
 * - Badge with issue count
 * - READ-ONLY (no solver, no new rules)
 * - 100% Polish
 */

import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import type { Issue, IssueFilter, IssueSeverity, IssueSource } from '../types';

// =============================================================================
// Severity/Source Labels & Colors (Polish)
// =============================================================================

const SEVERITY_LABELS: Record<IssueSeverity, string> = {
  HIGH: 'Wysoka',
  WARN: 'Ostrzeżenie',
  INFO: 'Info',
};

const SEVERITY_COLORS: Record<IssueSeverity, string> = {
  HIGH: 'text-red-600 bg-red-50 border-red-200',
  WARN: 'text-amber-600 bg-amber-50 border-amber-200',
  INFO: 'text-blue-600 bg-blue-50 border-blue-200',
};

const SOURCE_LABELS: Record<IssueSource, string> = {
  MODEL: 'Model',
  POWER_FLOW: 'Rozpływ mocy',
  PROTECTION: 'Zabezpieczenia',
};

// =============================================================================
// Issue List Item Component
// =============================================================================

interface IssueItemProps {
  issue: Issue;
  onClick: (issue: Issue) => void;
}

const IssueItem: React.FC<IssueItemProps> = ({ issue, onClick }) => {
  const handleClick = () => onClick(issue);

  return (
    <div
      className={clsx(
        'p-3 border-l-4 mb-2 cursor-pointer hover:bg-gray-50 transition-colors',
        SEVERITY_COLORS[issue.severity]
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase">
            {SEVERITY_LABELS[issue.severity]}
          </span>
          <span className="text-xs text-gray-500">
            {SOURCE_LABELS[issue.source]}
          </span>
        </div>
      </div>

      <div className="font-medium text-sm mb-1">
        {issue.title_pl}
      </div>

      <div className="text-xs text-gray-600">
        {issue.description_pl}
      </div>

      {issue.object_ref && (
        <div className="text-xs text-gray-500 mt-1">
          {issue.object_ref.type}: {issue.object_ref.name || issue.object_ref.id}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Filter Controls
// =============================================================================

interface FilterControlsProps {
  filter: IssueFilter;
  onFilterChange: (filter: IssueFilter) => void;
  totalCount: number;
  bySeverity: Record<IssueSeverity, number>;
  bySource: Record<IssueSource, number>;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  filter,
  onFilterChange,
  totalCount,
  bySeverity,
  bySource,
}) => {
  const toggleSeverity = (severity: IssueSeverity) => {
    const newSeverities = filter.severities.includes(severity)
      ? filter.severities.filter((s) => s !== severity)
      : [...filter.severities, severity];
    onFilterChange({ ...filter, severities: newSeverities });
  };

  const toggleSource = (source: IssueSource) => {
    const newSources = filter.sources.includes(source)
      ? filter.sources.filter((s) => s !== source)
      : [...filter.sources, source];
    onFilterChange({ ...filter, sources: newSources });
  };

  return (
    <div className="mb-4 space-y-3">
      {/* Total count */}
      <div className="text-sm font-semibold text-gray-700">
        Problemy: {totalCount}
      </div>

      {/* Severity filter */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">Priorytet:</div>
        <div className="flex gap-2">
          {(['HIGH', 'WARN', 'INFO'] as IssueSeverity[]).map((severity) => {
            const active = filter.severities.length === 0 || filter.severities.includes(severity);
            return (
              <button
                key={severity}
                onClick={() => toggleSeverity(severity)}
                className={clsx(
                  'px-2 py-1 text-xs rounded border',
                  active
                    ? SEVERITY_COLORS[severity]
                    : 'text-gray-400 bg-gray-50 border-gray-200'
                )}
              >
                {SEVERITY_LABELS[severity]} ({bySeverity[severity] || 0})
              </button>
            );
          })}
        </div>
      </div>

      {/* Source filter */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">Źródło:</div>
        <div className="flex gap-2">
          {(['MODEL', 'POWER_FLOW', 'PROTECTION'] as IssueSource[]).map((source) => {
            const active = filter.sources.length === 0 || filter.sources.includes(source);
            return (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                className={clsx(
                  'px-2 py-1 text-xs rounded border',
                  active
                    ? 'text-blue-600 bg-blue-50 border-blue-200'
                    : 'text-gray-400 bg-gray-50 border-gray-200'
                )}
              >
                {SOURCE_LABELS[source]} ({bySource[source] || 0})
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Main Issue Panel Component
// =============================================================================

export interface IssuePanelProps {
  issues: Issue[];
  bySeverity: Record<IssueSeverity, number>;
  bySource: Record<IssueSource, number>;
  onIssueClick: (issue: Issue) => void;
}

export const IssuePanel: React.FC<IssuePanelProps> = ({
  issues,
  bySeverity,
  bySource,
  onIssueClick,
}) => {
  const [filter, setFilter] = useState<IssueFilter>({
    sources: [],
    severities: [],
    selectedOnly: false,
  });

  // Apply filters
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // Filter by severity (empty = all)
      if (filter.severities.length > 0 && !filter.severities.includes(issue.severity)) {
        return false;
      }

      // Filter by source (empty = all)
      if (filter.sources.length > 0 && !filter.sources.includes(issue.source)) {
        return false;
      }

      return true;
    });
  }, [issues, filter]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Panel Problemów</h2>
        <p className="text-xs text-gray-500 mt-1">
          Walidacje modelu i interpretacje wyników
        </p>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200">
        <FilterControls
          filter={filter}
          onFilterChange={setFilter}
          totalCount={issues.length}
          bySeverity={bySeverity}
          bySource={bySource}
        />
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredIssues.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            {issues.length === 0
              ? 'Kontrola nie wskazuje zagadnień technicznych.'
              : 'Filtr nie wskazuje zagadnień technicznych.'}
          </div>
        ) : (
          <div>
            {filteredIssues.map((issue) => (
              <IssueItem key={issue.issue_id} issue={issue} onClick={onIssueClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
