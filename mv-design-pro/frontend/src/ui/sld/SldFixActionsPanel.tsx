import { useCallback, useEffect, useMemo, useState } from 'react';

import { useReadinessLiveStore } from '../engineering-readiness/readinessLiveStore';
import type { ReadinessWorkspaceBlockState } from '../engineering-readiness/ReadinessLivePanel';
import { useSelectionStore } from '../selection/store';
import type { ReadinessSeverity } from '../types';

const SEVERITY_ORDER: Record<ReadinessSeverity, number> = {
  BLOCKER: 0,
  IMPORTANT: 1,
  INFO: 2,
};

const SEVERITY_LABELS_PL: Record<ReadinessSeverity, string> = {
  BLOCKER: 'Blokujące',
  IMPORTANT: 'Ważne',
  INFO: 'Informacje',
};

const SEVERITY_STYLES: Record<ReadinessSeverity, { badge: string; row: string; dot: string }> = {
  BLOCKER: {
    badge: 'bg-red-600 text-white',
    row: 'border-l-2 border-red-500 bg-red-50',
    dot: 'bg-red-500',
  },
  IMPORTANT: {
    badge: 'bg-amber-500 text-white',
    row: 'border-l-2 border-amber-400 bg-amber-50',
    dot: 'bg-amber-400',
  },
  INFO: {
    badge: 'bg-blue-500 text-white',
    row: 'border-l-2 border-blue-400 bg-blue-50',
    dot: 'bg-blue-400',
  },
};

export interface SldFixActionsPanelProps {
  caseId: string | null;
  onGoToElement?: (elementId: string) => void;
  defaultExpanded?: boolean;
  workspaceBlockState?: ReadinessWorkspaceBlockState | null;
}

export function SldFixActionsPanel({
  caseId,
  onGoToElement,
  defaultExpanded = true,
  workspaceBlockState = null,
}: SldFixActionsPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [expandedGroups, setExpandedGroups] = useState<Set<ReadinessSeverity>>(
    new Set(['BLOCKER', 'IMPORTANT']),
  );

  const issues = useReadinessLiveStore((state) => state.issues);
  const status = useReadinessLiveStore((state) => state.status);
  const loading = useReadinessLiveStore((state) => state.loading);
  const error = useReadinessLiveStore((state) => state.error);
  const refresh = useReadinessLiveStore((state) => state.refresh);
  const selectElement = useSelectionStore((state) => state.selectElement);

  useEffect(() => {
    if (caseId) {
      void refresh(caseId);
    }
  }, [caseId, refresh]);

  const groupedIssues = useMemo(() => {
    const sorted = [...issues].sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return a.message_pl.localeCompare(b.message_pl, 'pl');
    });

    const groups = new Map<ReadinessSeverity, typeof sorted>();
    for (const issue of sorted) {
      const existing = groups.get(issue.severity) ?? [];
      existing.push(issue);
      groups.set(issue.severity, existing);
    }
    return groups;
  }, [issues]);

  const handleGoToElement = useCallback(
    (elementId: string | null) => {
      if (!elementId) {
        return;
      }
      selectElement({ id: elementId, type: 'Bus', name: '' });
      onGoToElement?.(elementId);
    },
    [onGoToElement, selectElement],
  );

  const toggleGroup = useCallback((severity: ReadinessSeverity) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
  }, []);

  if (!caseId) {
    return null;
  }

  return (
    <div
      data-testid="sld-fix-actions-panel"
      className="pointer-events-auto overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      style={{ width: 320 }}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`flex w-full items-center justify-between px-3 py-2 text-xs font-semibold transition-colors ${
          workspaceBlockState
            ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            : issues.some((issue) => issue.severity === 'BLOCKER')
              ? 'bg-red-50 text-red-800 hover:bg-red-100'
              : issues.length > 0
                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'bg-green-50 text-green-800 hover:bg-green-100'
        }`}
        data-testid="sld-fix-panel-header"
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              workspaceBlockState
                ? 'bg-amber-500'
                : issues.some((issue) => issue.severity === 'BLOCKER')
                  ? 'bg-red-500'
                  : issues.length > 0
                    ? 'bg-amber-400'
                    : 'bg-green-500'
            }`}
          />
          <span>Gotowość modelu</span>
          {!workspaceBlockState && issues.length > 0 && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                issues.some((issue) => issue.severity === 'BLOCKER')
                  ? 'bg-red-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {issues.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="max-h-80 overflow-y-auto">
          {workspaceBlockState && (
            <div className="px-3 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Blokada warsztatowa
              </div>
              <div className="mt-2 text-sm font-semibold text-amber-950">
                {workspaceBlockState.title}
              </div>
              <div className="mt-1 text-xs text-amber-900">{workspaceBlockState.description}</div>
              <div className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900">
                Następny krok: {workspaceBlockState.nextStep}
              </div>
            </div>
          )}

          {!workspaceBlockState && loading && (
            <div className="px-3 py-4 text-center text-xs text-slate-500">Ładowanie...</div>
          )}

          {!workspaceBlockState && error && (
            <div className="bg-red-50 px-3 py-2 text-xs text-red-600">Błąd: {error}</div>
          )}

          {!workspaceBlockState && !loading && !error && issues.length === 0 && status === 'OK' && (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-center text-xs text-green-700">
              <span className="text-green-500">✓</span>
              Model gotowy do obliczeń
            </div>
          )}

          {!workspaceBlockState && !loading && !error && issues.length > 0 && (
            <div>
              {(['BLOCKER', 'IMPORTANT', 'INFO'] as ReadinessSeverity[]).map((severity) => {
                const group = groupedIssues.get(severity);
                if (!group || group.length === 0) {
                  return null;
                }

                const styles = SEVERITY_STYLES[severity];
                const isExpanded = expandedGroups.has(severity);

                return (
                  <div key={severity} data-testid={`sld-fix-group-${severity.toLowerCase()}`}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(severity)}
                      className="flex w-full items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                        <span>{SEVERITY_LABELS_PL[severity]}</span>
                        <span className={`rounded px-1 py-0.5 text-[10px] ${styles.badge}`}>
                          {group.length}
                        </span>
                      </div>
                      <span className="text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {isExpanded && (
                      <div>
                        {group.map((issue, index) => {
                          const targetRef = issue.element_ref ?? issue.element_refs[0] ?? null;
                          return (
                            <div
                              key={`${severity}-${index}`}
                              className={`px-3 py-2 text-xs ${styles.row}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="leading-tight text-slate-700">{issue.message_pl}</div>
                                  {issue.suggested_fix && (
                                    <div className="mt-1 text-[11px] italic text-slate-500">
                                      → {issue.suggested_fix}
                                    </div>
                                  )}
                                </div>
                                {targetRef && (
                                  <button
                                    type="button"
                                    onClick={() => handleGoToElement(targetRef)}
                                    className="flex-shrink-0 rounded border border-blue-200 px-2 py-1 text-[10px] font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800"
                                    title="Przejdź do elementu"
                                    data-testid={`sld-fix-goto-${issue.code}`}
                                  >
                                    Przejdź
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!workspaceBlockState && caseId && !loading && (
            <div className="border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => void refresh(caseId)}
                className="text-[11px] text-slate-400 transition-colors hover:text-slate-600"
                data-testid="sld-fix-panel-refresh"
              >
                ↻ Odśwież
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SldFixActionsPanel;
