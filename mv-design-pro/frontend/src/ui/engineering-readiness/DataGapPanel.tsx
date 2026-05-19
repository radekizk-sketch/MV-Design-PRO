/**
 * Data Gap Panel -- Spec 9
 *
 * Enhanced configuration-control panel for calculation preparation.
 * Groups issues into 6 engineering categories per spec:
 *   Magistrala / Stacje / Transformatory / Zrodla / Zabezpieczenia / Katalog
 *
 * Each issue row provides:
 *   - Severity badge (DECYZJA = red, OSTRZEZENIE = amber)
 *   - Polish engineering message
 *   - "Przejdz" navigation button (centerOnElement + highlight)
 *   - Context-aware configuration button (e.g., "Wybierz wariant katalogowy")
 *
 * Issues disappear in real-time after fix (driven by Snapshot diff via store).
 *
 * INVARIANTS:
 * - Read-only -- no model mutations
 * - Deterministic sorting (severity DESC, group order ASC, code ASC)
 * - All labels 100% Polish
 * - No physics, no solver calls
 */

import React, { useMemo, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { useReadinessLiveStore } from './readinessLiveStore';
import type { ReadinessIssue, ReadinessSeverity } from '../types';

// =============================================================================
// Group definitions (6 categories per spec 9)
// =============================================================================

export type DataGapGroup =
  | 'MAGISTRALA'
  | 'STACJE'
  | 'TRANSFORMATORY'
  | 'ZRODLA'
  | 'ZABEZPIECZENIA'
  | 'KATALOG';

const GROUP_ORDER: DataGapGroup[] = [
  'MAGISTRALA',
  'STACJE',
  'TRANSFORMATORY',
  'ZRODLA',
  'ZABEZPIECZENIA',
  'KATALOG',
];

const GROUP_LABELS: Record<DataGapGroup, string> = {
  MAGISTRALA: 'Magistrala',
  STACJE: 'Stacje',
  TRANSFORMATORY: 'Transformatory',
  ZRODLA: 'Zrodla',
  ZABEZPIECZENIA: 'Zabezpieczenia',
  KATALOG: 'Katalog',
};

const GROUP_ICONS: Record<DataGapGroup, string> = {
  MAGISTRALA: '\u2501',
  STACJE: '\u25A3',
  TRANSFORMATORY: '\u0394',
  ZRODLA: '\u2B21',
  ZABEZPIECZENIA: '\u26A1',
  KATALOG: '\u2630',
};

const GROUP_COLORS: Record<DataGapGroup, string> = {
  MAGISTRALA: 'border-l-blue-500',
  STACJE: 'border-l-violet-500',
  TRANSFORMATORY: 'border-l-indigo-500',
  ZRODLA: 'border-l-green-500',
  ZABEZPIECZENIA: 'border-l-amber-500',
  KATALOG: 'border-l-gray-500',
};

const GROUP_BADGE_COLORS: Record<DataGapGroup, string> = {
  MAGISTRALA: 'bg-blue-100 text-blue-700',
  STACJE: 'bg-violet-100 text-violet-700',
  TRANSFORMATORY: 'bg-indigo-100 text-indigo-700',
  ZRODLA: 'bg-green-100 text-green-700',
  ZABEZPIECZENIA: 'bg-amber-100 text-amber-700',
  KATALOG: 'bg-gray-100 text-gray-700',
};

// =============================================================================
// Severity mappings (Polish labels per spec)
// =============================================================================

const SEVERITY_BADGE_LABEL: Record<ReadinessSeverity, string> = {
  BLOCKER: 'DECYZJA',
  IMPORTANT: 'OSTRZEZENIE',
  INFO: 'INFORMACJA',
};

const SEVERITY_BADGE_STYLE: Record<ReadinessSeverity, string> = {
  BLOCKER: 'bg-red-600 text-white',
  IMPORTANT: 'bg-amber-500 text-white',
  INFO: 'bg-blue-500 text-white',
};

const SEVERITY_DOT: Record<ReadinessSeverity, string> = {
  BLOCKER: 'bg-red-500',
  IMPORTANT: 'bg-amber-400',
  INFO: 'bg-blue-400',
};

// =============================================================================
// Classifier -- deterministic issue-to-group mapping (6 groups)
// =============================================================================

/**
 * Classifies a readiness issue into one of the 6 spec groups based on code prefix.
 * Deterministic: same code always maps to same group.
 */
export function classifyDataGapGroup(issue: ReadinessIssue): DataGapGroup {
  const code = issue.code.toUpperCase();

  // Catalog-related codes (checked first -- catalog codes can overlap)
  if (
    code.startsWith('CAT_') ||
    code.startsWith('CAT.') ||
    code.startsWith('BIND_') ||
    code.startsWith('BIND.') ||
    code.startsWith('TYPE_') ||
    code.startsWith('TYPE.') ||
    code.startsWith('CATALOG.')
  ) {
    return 'KATALOG';
  }

  // Protection-related codes
  if (
    code.startsWith('PROT_') ||
    code.startsWith('PROT.') ||
    code.startsWith('RELAY_') ||
    code.startsWith('RELAY.') ||
    code.startsWith('PROTECTION.') ||
    code.startsWith('CT.') ||
    code.startsWith('VT.') ||
    code.includes('SELECTIVITY') ||
    code.includes('COORDINATION')
  ) {
    return 'ZABEZPIECZENIA';
  }

  // Transformer-related codes
  if (
    code.startsWith('TR_') ||
    code.startsWith('TR.') ||
    code.startsWith('TRAFO_') ||
    code.startsWith('TRAFO.') ||
    code.startsWith('TRANSFORMER.')
  ) {
    return 'TRANSFORMATORY';
  }

  // Source-related codes
  if (
    code.startsWith('SRC_') ||
    code.startsWith('SRC.') ||
    code.startsWith('GEN_') ||
    code.startsWith('GEN.') ||
    code.startsWith('PV_') ||
    code.startsWith('PV.') ||
    code.startsWith('BESS_') ||
    code.startsWith('BESS.') ||
    code.startsWith('SOURCE.') ||
    code.startsWith('NN.SOURCE') ||
    code.startsWith('GENSET.') ||
    code.startsWith('UPS.') ||
    code.startsWith('INVERTER.')
  ) {
    return 'ZRODLA';
  }

  // Station-related codes
  if (
    code.startsWith('STATION_') ||
    code.startsWith('STATION.') ||
    code.startsWith('STN_') ||
    code.startsWith('STN.') ||
    code.startsWith('BAY.') ||
    code.startsWith('FEEDER.') ||
    code.startsWith('NN.')
  ) {
    return 'STACJE';
  }

  // Bus/trunk/branch codes -> Magistrala (also default)
  // Matches: BUS_, TRUNK_, BRANCH_, and anything else
  return 'MAGISTRALA';
}

// =============================================================================
// Quick fix label resolution
// =============================================================================

/**
 * Returns a context-aware Polish label for the quick fix button.
 * Deterministic: same code prefix always yields same label.
 */
export function resolveQuickFixLabel(issue: ReadinessIssue): string {
  const code = issue.code.toUpperCase();
  const group = classifyDataGapGroup(issue);

  // Catalog issues -> "Wybierz wariant katalogowy"
  if (group === 'KATALOG') {
    return 'Wybierz wariant katalogowy';
  }

  // Protection missing -> "Dodaj zabezpieczenie"
  if (group === 'ZABEZPIECZENIA') {
    if (
      code.includes('MISSING') ||
      code.includes('BRAK') ||
      code.includes('ADD')
    ) {
      return 'Dodaj zabezpieczenie';
    }
    return 'Konfiguruj zabezpieczenie';
  }

  // Transformer issues -> "Konfiguruj transformator"
  if (group === 'TRANSFORMATORY') {
    return 'Konfiguruj transformator';
  }

  // Source issues -> "Konfiguruj układ"
  if (group === 'ZRODLA') {
    if (code.includes('PARAM') || code.includes('DATA')) {
      return 'Skonfiguruj parametry';
    }
    return 'Konfiguruj układ';
  }

  // Missing parameter patterns (any group)
  if (
    code.includes('PARAM') ||
    code.includes('MISSING_DATA') ||
    code.includes('INCOMPLETE')
  ) {
    return 'Skonfiguruj parametry';
  }

  // Catalog binding refresh
  if (code.includes('REFRESH') || code.includes('STALE') || code.includes('BIND')) {
    return 'Odswiez parametry z katalogu';
  }

  // Generic fallback
  return 'Skonfiguruj';
}

// =============================================================================
// Grouped Issues Type
// =============================================================================

interface GroupedIssues {
  group: DataGapGroup;
  issues: ReadinessIssue[];
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  totalCount: number;
}

// =============================================================================
// Props
// =============================================================================

export interface DataGapPanelProps {
  workspaceBlockState?: unknown;
  /** Navigate to element on SLD (centerOnElement + highlight) */
  onNavigateToElement?: (elementId: string) => void;
  /** Execute quick fix action for element */
  onQuickFix?: (issue: ReadinessIssue) => void;
  /** Compact mode (less padding, smaller text) */
  compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const DataGapPanel: React.FC<DataGapPanelProps> = ({
  onNavigateToElement,
  onQuickFix,
  compact = false,
}) => {
  const issues = useReadinessLiveStore((s) => s.issues);
  const status = useReadinessLiveStore((s) => s.status);
  const loading = useReadinessLiveStore((s) => s.loading);

  const [collapsedGroups, setCollapsedGroups] = useState<DataGapGroup[]>([]);

  // ---------------------------------------------------------------------------
  // Group and sort issues deterministically
  // ---------------------------------------------------------------------------

  const grouped = useMemo((): GroupedIssues[] => {
    const groupMap = new Map<DataGapGroup, ReadinessIssue[]>();

    // Initialize all groups in deterministic order
    for (const g of GROUP_ORDER) {
      groupMap.set(g, []);
    }

    // Classify each issue into its group
    for (const issue of issues) {
      const group = classifyDataGapGroup(issue);
      groupMap.get(group)!.push(issue);
    }

    // Sort within groups: severity DESC (BLOCKER first), then code ASC
    const severityOrder: Record<ReadinessSeverity, number> = {
      BLOCKER: 0,
      IMPORTANT: 1,
      INFO: 2,
    };

    const result: GroupedIssues[] = [];
    for (const group of GROUP_ORDER) {
      const groupIssues = groupMap.get(group)!;
      groupIssues.sort((a, b) => {
        const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return a.code.localeCompare(b.code);
      });

      // Only include groups with issues (empty sections hidden per spec)
      if (groupIssues.length > 0) {
        result.push({
          group,
          issues: groupIssues,
          blockerCount: groupIssues.filter((i) => i.severity === 'BLOCKER').length,
          warningCount: groupIssues.filter((i) => i.severity === 'IMPORTANT').length,
          infoCount: groupIssues.filter((i) => i.severity === 'INFO').length,
          totalCount: groupIssues.length,
        });
      }
    }

    return result;
  }, [issues]);

  const totalBlockers = useMemo(
    () => issues.filter((i) => i.severity === 'BLOCKER').length,
    [issues],
  );

  const totalWarnings = useMemo(
    () => issues.filter((i) => i.severity === 'IMPORTANT').length,
    [issues],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleToggleGroup = useCallback((group: DataGapGroup) => {
    setCollapsedGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group],
    );
  }, []);

  const handleNavigate = useCallback(
    (issue: ReadinessIssue) => {
      const ref = issue.element_ref ?? issue.element_refs[0];
      if (ref && onNavigateToElement) {
        onNavigateToElement(ref);
      }
    },
    [onNavigateToElement],
  );

  const handleQuickFix = useCallback(
    (issue: ReadinessIssue) => {
      if (!onQuickFix) return;
      onQuickFix(issue);
    },
    [onQuickFix],
  );

  // ---------------------------------------------------------------------------
  // Empty state: green calculation-ready banner
  // ---------------------------------------------------------------------------

  if (!loading && issues.length === 0) {
    return (
      <div
        className={clsx(
          'pointer-events-auto flex w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm',
          compact ? 'max-h-80' : 'h-full',
        )}
        data-testid="data-gap-panel"
      >
        {/* Panel title */}
        <div
          className={clsx(
            'border-b border-gray-200 bg-gray-50',
            compact ? 'px-3 py-1.5' : 'px-4 py-3',
          )}
        >
          <h2
            className={clsx(
              'font-semibold text-gray-800',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            Kontrola konfiguracji obliczeń
          </h2>
        </div>

        {/* Green banner */}
        <div
          className="flex flex-col items-center justify-center p-6 text-center"
          data-testid="data-gap-panel-ready"
        >
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <span className="text-green-600 text-xl">{'\u2713'}</span>
          </div>
          <span className="text-sm text-green-700 font-semibold">
            Układ przygotowany do obliczeń
          </span>
          <span className="text-xs text-gray-500 mt-1">
            Topologia i dane katalogowe pozwalają uruchomić obliczenia.
          </span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main panel with grouped issues
  // ---------------------------------------------------------------------------

  return (
    <div
      className={clsx(
        'pointer-events-auto flex w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm',
        compact ? 'max-h-80' : 'h-full',
      )}
      data-testid="data-gap-panel"
    >
      {/* Panel header */}
      <div
        className={clsx(
          'border-b border-gray-200 bg-gray-50 flex items-center justify-between',
          compact ? 'px-3 py-1.5' : 'px-4 py-3',
        )}
      >
        <div className="flex items-center gap-2">
          <h2
            className={clsx(
              'font-semibold text-gray-800',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            Kontrola konfiguracji obliczeń
          </h2>
          {loading && (
            <span className="text-xs text-gray-400 animate-pulse">
              Aktualizacja...
            </span>
          )}
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-1.5">
          {totalBlockers > 0 && (
            <span
              className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded"
              title="Decyzje projektowe"
            >
              {totalBlockers}
            </span>
          )}
          {totalWarnings > 0 && (
            <span
              className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-white rounded"
              title="Ostrzezenia"
            >
              {totalWarnings}
            </span>
          )}
          <span
            className={clsx(
              'px-2 py-0.5 text-xs font-medium rounded',
              status === 'OK' && 'bg-green-100 text-green-700',
              status === 'WARN' && 'bg-amber-100 text-amber-700',
              status === 'FAIL' && 'bg-red-100 text-red-700',
            )}
          >
            {issues.length}
          </span>
        </div>
      </div>

      {/* Grouped issues list */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map((g) => {
          const isCollapsed = collapsedGroups.includes(g.group);
          return (
            <div
              key={g.group}
              className="border-b border-gray-100"
              data-testid={`data-gap-group-${g.group}`}
            >
              {/* Group header with count badge */}
              <button
                onClick={() => handleToggleGroup(g.group)}
                className={clsx(
                  'w-full flex items-center justify-between text-left',
                  'bg-gray-50 hover:bg-gray-100 transition-colors',
                  'border-l-4',
                  GROUP_COLORS[g.group],
                  compact ? 'px-3 py-1.5' : 'px-3 py-2',
                )}
                data-testid={`data-gap-group-header-${g.group}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">{GROUP_ICONS[g.group]}</span>
                  <span
                    className={clsx(
                      'font-semibold text-gray-700',
                      compact ? 'text-xs' : 'text-xs',
                    )}
                  >
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
                  <span
                    className={clsx(
                      'ml-1 text-xs font-medium rounded-full px-1.5',
                      GROUP_BADGE_COLORS[g.group],
                    )}
                  >
                    {g.totalCount}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">
                    {isCollapsed ? '\u25B8' : '\u25BE'}
                  </span>
                </div>
              </button>

              {/* Group items */}
              {!isCollapsed && (
                <div className={compact ? 'py-0.5' : 'py-1'}>
                  {g.issues.map((issue) => {
                    const elementRef =
                      issue.element_ref ?? issue.element_refs[0] ?? null;
                    const fixLabel = resolveQuickFixLabel(issue);

                    return (
                      <div
                        key={`${issue.code}-${elementRef ?? 'no-ref'}`}
                        className={clsx(
                          'flex items-start gap-2 hover:bg-gray-50 transition-colors',
                          compact ? 'px-3 py-1' : 'px-3 py-1.5',
                        )}
                        data-testid={`data-gap-issue-${issue.code}`}
                      >
                        {/* Severity badge */}
                        {compact ? (
                          <span
                            className={clsx(
                              'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                              SEVERITY_DOT[issue.severity],
                            )}
                            title={SEVERITY_BADGE_LABEL[issue.severity]}
                          />
                        ) : (
                          <span
                            className={clsx(
                              'px-1.5 py-0.5 text-xs font-bold rounded flex-shrink-0 mt-0.5',
                              SEVERITY_BADGE_STYLE[issue.severity],
                            )}
                          >
                            {issue.severity === 'BLOCKER'
                              ? 'DECYZJA'
                              : issue.severity === 'IMPORTANT'
                                ? 'OSTRZ.'
                                : 'INFO'}
                          </span>
                        )}

                        {/* Content: message + element ref */}
                        <div className="flex-1 min-w-0">
                          <div
                            className={clsx(
                              'text-gray-800 leading-tight',
                              compact ? 'text-xs' : 'text-xs',
                            )}
                          >
                            {issue.message_pl}
                          </div>
                          {elementRef && (
                            <div className="text-xs text-gray-400 font-mono truncate mt-0.5">
                              {elementRef}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-1 flex-shrink-0">
                          {/* "Przejdz" navigation button */}
                          {elementRef && onNavigateToElement && (
                            <button
                              onClick={() => handleNavigate(issue)}
                              className={clsx(
                                'text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors whitespace-nowrap',
                                compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5',
                              )}
                              title="Przejdz do elementu na schemacie"
                              data-testid={`data-gap-navigate-${issue.code}`}
                            >
                              Przejdz
                            </button>
                          )}

                          {/* Quick fix action button */}
                          {elementRef && onQuickFix && (
                            <button
                              onClick={() => handleQuickFix(issue)}
                              className={clsx(
                                'text-xs font-medium rounded border transition-colors whitespace-nowrap',
                                'border-green-300 text-green-700 bg-green-50 hover:bg-green-100',
                                compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5',
                              )}
                              title={fixLabel}
                              data-testid={`data-gap-fix-${issue.code}`}
                            >
                              {fixLabel}
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

export default DataGapPanel;
