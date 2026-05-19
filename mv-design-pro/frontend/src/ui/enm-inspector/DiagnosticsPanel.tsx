/**
 * DiagnosticsPanel — Panel diagnostyki ENM (v4.2).
 *
 * Lista problemów E-Dxx z filtrami severity.
 * CANONICAL: Polski komunikaty i etykiety.
 */

import { useMemo } from 'react';
import { useEnmInspectorStore } from './store';
import type {
  DiagnosticIssue,
  DiagnosticReport,
  DiagnosticStatus,
} from './types';
import {
  SEVERITY_LABELS_PL,
  SEVERITY_COLORS,
  SEVERITY_BG_COLORS,
  STATUS_LABELS_PL,
} from './types';

interface DiagnosticsPanelProps {
  report: DiagnosticReport | null;
  loading?: boolean;
  onIssueClick?: (issue: DiagnosticIssue) => void;
}

export function DiagnosticsPanel({
  report,
  loading = false,
  onIssueClick,
}: DiagnosticsPanelProps) {
  const { severityFilter, setSeverityFilter } = useEnmInspectorStore();

  const filteredIssues = useMemo(() => {
    if (!report) return [];
    if (!severityFilter) return report.issues;
    return report.issues.filter((i) => i.severity === severityFilter);
  }, [report, severityFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-slate-400">
        Ładowanie diagnostyki...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-slate-400">
        Brak danych diagnostycznych
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="diagnostics-panel">
      {/* Status header */}
      <StatusHeader status={report.status} report={report} />

      {/* Severity filters */}
      <div className="flex gap-1 px-3 py-2 border-b border-slate-100">
        <FilterButton
          label="Wszystkie"
          count={report.issues.length}
          active={severityFilter === null}
          onClick={() => setSeverityFilter(null)}
        />
        <FilterButton
          label="Blokady"
          count={report.blocker_count}
          active={severityFilter === 'BLOCKER'}
          onClick={() => setSeverityFilter('BLOCKER')}
          colorClass="text-rose-600"
        />
        <FilterButton
          label="Ostrzeżenia"
          count={report.warning_count}
          active={severityFilter === 'WARN'}
          onClick={() => setSeverityFilter('WARN')}
          colorClass="text-amber-600"
        />
        <FilterButton
          label="Informacje"
          count={report.info_count}
          active={severityFilter === 'INFO'}
          onClick={() => setSeverityFilter('INFO')}
          colorClass="text-blue-600"
        />
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto">
        {filteredIssues.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-400 text-center">
            {severityFilter
              ? `Filtr nie wskazuje pozycji typu "${SEVERITY_LABELS_PL[severityFilter]}"`
              : 'Kontrola diagnostyczna nie wskazuje pozycji technicznych'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredIssues.map((issue, idx) => (
              <IssueRow
                key={`${issue.code}-${idx}`}
                issue={issue}
                onClick={() => onIssueClick?.(issue)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusHeader({
  status,
  report,
}: {
  status: DiagnosticStatus;
  report: DiagnosticReport;
}) {
  const statusColor =
    status === 'FAIL'
      ? 'bg-rose-50 border-rose-200 text-rose-700'
      : status === 'WARN'
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-green-50 border-green-200 text-green-700';

  return (
    <div
      className={`px-3 py-2 border-b ${statusColor}`}
      data-testid="diagnostics-status"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          {STATUS_LABELS_PL[status]}
        </span>
        <div className="flex gap-2 text-xs">
          {report.blocker_count > 0 && (
            <span className="text-rose-600">
              {report.blocker_count} blokad
            </span>
          )}
          {report.warning_count > 0 && (
            <span className="text-amber-600">
              {report.warning_count} ostrzeżeń
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
  colorClass,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  colorClass?: string;
}) {
  return (
    <button
      className={`px-2 py-0.5 text-xs rounded border ${
        active
          ? 'bg-blue-100 border-blue-300 text-blue-800'
          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
      }`}
      onClick={onClick}
    >
      <span className={colorClass}>{label}</span>
      <span className="ml-1 text-slate-400">({count})</span>
    </button>
  );
}

function IssueRow({
  issue,
  onClick,
}: {
  issue: DiagnosticIssue;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer border-l-2 ${
        issue.severity === 'BLOCKER'
          ? 'border-l-rose-500'
          : issue.severity === 'WARN'
            ? 'border-l-amber-400'
            : 'border-l-blue-400'
      }`}
      onClick={onClick}
      data-testid={`diagnostic-issue-${issue.code}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-mono font-semibold ${SEVERITY_COLORS[issue.severity]}`}
        >
          {issue.code}
        </span>
        <span
          className={`text-xs px-1 rounded ${SEVERITY_BG_COLORS[issue.severity]}`}
        >
          {SEVERITY_LABELS_PL[issue.severity]}
        </span>
      </div>
      <p className="text-xs text-slate-700 mt-1">{issue.message_pl}</p>
      {issue.hints.length > 0 && (
        <div className="mt-1">
          {issue.hints.map((hint, idx) => (
            <p key={idx} className="text-xs text-slate-400 italic">
              {hint}
            </p>
          ))}
        </div>
      )}
      {issue.affected_refs.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {issue.affected_refs.slice(0, 5).map((ref) => (
            <span
              key={ref}
              className="text-xs font-mono px-1 bg-slate-100 text-slate-500 rounded"
            >
              {ref.slice(0, 8)}...
            </span>
          ))}
          {issue.affected_refs.length > 5 && (
            <span className="text-xs text-slate-400">
              +{issue.affected_refs.length - 5}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
