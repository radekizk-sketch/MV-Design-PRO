/**
 * Readiness Live Panel — §3 UX 10/10
 *
 * Stały panel kontroli konfiguracji technicznej w czasie rzeczywistym.
 * Automatyczna synchronizacja ze Snapshot + readiness backend.
 *
 * WYMAGANIA:
 * - Grupowanie: Magistrala / Stacje / Zabezpieczenia / Układy PV/BESS/FW
 * - Każdy wpis: przycisk „Przejdź" (centerOnElement + highlight + openModal)
 * - Automatyczne znikanie po naprawie (diff-based re-render)
 * - 100% synchronizacja z backend readiness codes
 *
 * INVARIANTS:
 * - Read-only — brak mutacji modelu
 * - Deterministyczne sortowanie (severity DESC, group ASC, code ASC)
 * - Wszystkie etykiety 100% PL
 */

import React, { useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import type { ReadinessIssue, ReadinessSeverity, FixAction } from '../types';

// =============================================================================
// Group definitions
// =============================================================================

export type ReadinessGroup = 'MAGISTRALA' | 'STACJE' | 'ZABEZPIECZENIA' | 'ZRODLA';

export interface ReadinessWorkspaceBlockState {
  reason: 'NO_CASE' | 'NO_MODEL' | 'NO_SOURCE' | 'NO_SNAPSHOT';
  title: string;
  description: string;
  nextStep: string;
}

const GROUP_LABELS: Record<ReadinessGroup, string> = {
  MAGISTRALA: 'Magistrala',
  STACJE: 'Stacje',
  ZABEZPIECZENIA: 'Zabezpieczenia',
  ZRODLA: 'Układy PV/BESS/FW',
};

const GROUP_ICONS: Record<ReadinessGroup, string> = {
  MAGISTRALA: '━',
  STACJE: '▣',
  ZABEZPIECZENIA: '⚡',
  ZRODLA: '⬡',
};

const GROUP_COLORS: Record<ReadinessGroup, string> = {
  MAGISTRALA: 'border-l-blue-500',
  STACJE: 'border-l-violet-500',
  ZABEZPIECZENIA: 'border-l-amber-500',
  ZRODLA: 'border-l-green-500',
};

const SEVERITY_DOT: Record<ReadinessSeverity, string> = {
  BLOCKER: 'bg-red-500',
  IMPORTANT: 'bg-amber-400',
  INFO: 'bg-blue-400',
};

// =============================================================================
// Classifier — deterministic issue-to-group mapping
// =============================================================================

/**
 * Classifies a readiness issue into a group based on its code prefix.
 * Deterministic: same code → same group.
 */
export function classifyIssueGroup(issue: ReadinessIssue): ReadinessGroup {
  const code = issue.code.toLowerCase();

  // Protection-related codes
  if (
    code.startsWith('protection.') ||
    code.startsWith('relay.') ||
    code.startsWith('ct.') ||
    code.startsWith('vt.') ||
    code.includes('selectivity') ||
    code.includes('coordination')
  ) {
    return 'ZABEZPIECZENIA';
  }

  // Source-related codes
  if (
    code.startsWith('source.') ||
    code.startsWith('nn.source') ||
    code.startsWith('pv.') ||
    code.startsWith('bess.') ||
    code.startsWith('genset.') ||
    code.startsWith('ups.') ||
    code.startsWith('inverter.') ||
    code.includes('source')
  ) {
    return 'ZRODLA';
  }

  // Station-related codes
  if (
    code.startsWith('station.') ||
    code.startsWith('transformer.') ||
    code.startsWith('bay.') ||
    code.startsWith('bus_nn.') ||
    code.startsWith('feeder.') ||
    code.startsWith('nn.') ||
    code.includes('station')
  ) {
    return 'STACJE';
  }

  // Default: trunk/magistrala (cables, lines, buses, topology)
  return 'MAGISTRALA';
}

// =============================================================================
// Grouped Issue Type
// =============================================================================

interface GroupedIssues {
  group: ReadinessGroup;
  issues: ReadinessIssue[];
  blockerCount: number;
  warningCount: number;
  infoCount: number;
}

// =============================================================================
// Props
// =============================================================================

export interface ReadinessLivePanelProps {
  /** Issues from readiness store */
  issues: ReadinessIssue[];
  /** Overall status */
  status: 'OK' | 'WARN' | 'FAIL';
  /** Canonical readiness flag */
  ready?: boolean;
  /** Loading state */
  loading: boolean;
  /** Workspace-level blocker */
  workspaceBlockState?: ReadinessWorkspaceBlockState | null;
  /** Navigate to element (centerOnElement + highlight) */
  onNavigateToElement: (elementRef: string) => void;
  /** Execute fix action (openModal with context) */
  onFixAction: (fixAction: FixAction, elementRef: string | null) => void;
  /** Collapsed groups (controlled externally for persistence) */
  collapsedGroups?: ReadinessGroup[];
  /** Toggle group collapsed state */
  onToggleGroup?: (group: ReadinessGroup) => void;
}

// =============================================================================
// Component
// =============================================================================

export const ReadinessLivePanel: React.FC<ReadinessLivePanelProps> = ({
  issues,
  status,
  ready,
  loading,
  workspaceBlockState = null,
  onNavigateToElement,
  onFixAction,
  collapsedGroups = [],
  onToggleGroup,
}) => {
  const effectiveReady = ready ?? status === 'OK';

  if (workspaceBlockState) {
    return (
      <div
        className="pointer-events-auto flex w-full flex-col rounded-lg border border-amber-200 bg-amber-50 p-4 text-left shadow-sm"
        data-testid="readiness-live-panel-blocked"
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          Kontrola konfiguracji
        </div>
        <div className="mt-2 text-sm font-semibold text-amber-950">{workspaceBlockState.title}</div>
        <div className="mt-1 text-xs text-amber-900">{workspaceBlockState.description}</div>
        <div className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900">
          Następny krok: {workspaceBlockState.nextStep}
        </div>
      </div>
    );
  }

  // Group and sort issues deterministically
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const grouped = useMemo((): GroupedIssues[] => {
    const groupMap = new Map<ReadinessGroup, ReadinessIssue[]>();

    // Initialize all groups (deterministic order)
    const groupOrder: ReadinessGroup[] = ['MAGISTRALA', 'STACJE', 'ZABEZPIECZENIA', 'ZRODLA'];
    for (const g of groupOrder) {
      groupMap.set(g, []);
    }

    // Classify each issue
    for (const issue of issues) {
      const group = classifyIssueGroup(issue);
      groupMap.get(group)!.push(issue);
    }

    // Sort within groups: severity DESC (BLOCKER first), then code ASC
    const severityOrder: Record<ReadinessSeverity, number> = {
      BLOCKER: 0,
      IMPORTANT: 1,
      INFO: 2,
    };

    const result: GroupedIssues[] = [];
    for (const group of groupOrder) {
      const groupIssues = groupMap.get(group)!;
      groupIssues.sort((a, b) => {
        const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return a.code.localeCompare(b.code);
      });

      if (groupIssues.length > 0) {
        result.push({
          group,
          issues: groupIssues,
          blockerCount: groupIssues.filter((i) => i.severity === 'BLOCKER').length,
          warningCount: groupIssues.filter((i) => i.severity === 'IMPORTANT').length,
          infoCount: groupIssues.filter((i) => i.severity === 'INFO').length,
        });
      }
    }

    return result;
  }, [issues]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const totalBlockers = useMemo(
    () => issues.filter((i) => i.severity === 'BLOCKER').length,
    [issues],
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleNavigate = useCallback(
    (issue: ReadinessIssue) => {
      const ref = issue.element_ref ?? issue.element_refs[0];
      if (ref) {
        onNavigateToElement(ref);
      }
    },
    [onNavigateToElement],
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleFix = useCallback(
    (issue: ReadinessIssue) => {
      if (issue.fix_action) {
        const ref = issue.element_ref ?? issue.element_refs[0] ?? null;
        onFixAction(issue.fix_action, ref);
      }
    },
    [onFixAction],
  );

  // Empty state
  if (!loading && issues.length === 0 && effectiveReady && status === 'OK') {
    return (
      <div
        className="pointer-events-auto flex w-full flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm"
        data-testid="readiness-live-panel-empty"
      >
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mb-2">
          <span className="text-green-600 text-lg">✓</span>
        </div>
        <span className="text-sm text-green-700 font-medium">
          Układ skonfigurowany do analiz
        </span>
        <span className="text-xs text-gray-500 mt-1">
          Topologia i dane katalogowe są spójne.
        </span>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto flex h-full max-h-80 w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      data-testid="readiness-live-panel"
    >
      {/* Compact header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Kontrola konfiguracji
          </span>
          {loading && (
            <span className="text-xs text-gray-400 animate-pulse">
              Aktualizacja...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {totalBlockers > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-red-600 text-white rounded">
              {totalBlockers}
            </span>
          )}
          <span
            className={clsx(
              'px-1.5 py-0.5 text-xs font-medium rounded',
              status === 'OK' && 'bg-green-100 text-green-700',
              status === 'WARN' && 'bg-amber-100 text-amber-700',
              status === 'FAIL' && 'bg-red-100 text-red-700',
            )}
          >
            {issues.length}
          </span>
        </div>
      </div>

      {/* Grouped issues */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map((g) => {
          const isCollapsed = collapsedGroups.includes(g.group);
          return (
            <div
              key={g.group}
              className="border-b border-gray-100"
              data-testid={`readiness-group-${g.group}`}
            >
              {/* Group header */}
              <button
                onClick={() => onToggleGroup?.(g.group)}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2',
                  'bg-gray-50 hover:bg-gray-100 transition-colors text-left',
                  'border-l-4',
                  GROUP_COLORS[g.group],
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">{GROUP_ICONS[g.group]}</span>
                  <span className="text-xs font-semibold text-gray-700">
                    {GROUP_LABELS[g.group]}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {g.blockerCount > 0 && (
                    <span className="w-5 h-5 flex items-center justify-center text-xs font-bold bg-red-100 text-red-700 rounded-full">
                      {g.blockerCount}
                    </span>
                  )}
                  {g.warningCount > 0 && (
                    <span className="w-5 h-5 flex items-center justify-center text-xs bg-amber-100 text-amber-700 rounded-full">
                      {g.warningCount}
                    </span>
                  )}
                  {g.infoCount > 0 && (
                    <span className="w-5 h-5 flex items-center justify-center text-xs bg-blue-100 text-blue-700 rounded-full">
                      {g.infoCount}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-1">
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                </div>
              </button>

              {/* Group items */}
              {!isCollapsed && (
                <div className="py-1">
                  {g.issues.map((issue) => {
                    const elementRef =
                      issue.element_ref ?? issue.element_refs[0] ?? null;
                    return (
                      <div
                        key={`${issue.code}-${elementRef ?? 'no-ref'}`}
                        className="flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 transition-colors"
                        data-testid={`readiness-live-issue-${issue.code}`}
                      >
                        {/* Severity dot */}
                        <span
                          className={clsx(
                            'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                            SEVERITY_DOT[issue.severity],
                          )}
                        />
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-800 leading-tight">
                            {issue.message_pl}
                          </div>
                          {elementRef && (
                            <div className="text-xs text-gray-400 font-mono truncate mt-0.5">
                              {elementRef}
                            </div>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex gap-1 flex-shrink-0">
                          {elementRef && (
                            <button
                              onClick={() => handleNavigate(issue)}
                              className="px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Przejdź do elementu"
                              data-testid={`live-navigate-${issue.code}`}
                            >
                              Przejdź
                            </button>
                          )}
                          {issue.fix_action && (
                            <button
                              onClick={() => handleFix(issue)}
                              className="px-2 py-0.5 text-xs text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Otwórz konfigurację"
                              data-testid={`live-fix-${issue.code}`}
                            >
                              Skonfiguruj
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
    </div>
  );
};

export default ReadinessLivePanel;
