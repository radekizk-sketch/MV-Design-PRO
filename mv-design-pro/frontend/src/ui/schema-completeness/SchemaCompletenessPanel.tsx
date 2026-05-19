/**
 * SchemaCompletenessPanel — „Kontrola konfiguracji obliczeń"
 *
 * Panel wyświetlający braki danych wymaganych do obliczeń, pogrupowane
 * wg kategorii (Magistrala / Stacje / Transformatory / Układy PV/BESS/FW / Zabezpieczenia / Katalog).
 *
 * Każdy wpis ma:
 * - „Przejdź" — centrowanie + podświetlenie na SLD
 * - „Napraw" — otwarcie właściwego okna dialogowego
 *
 * Po naprawie wpis znika natychmiast po nowym Snapshot.
 *
 * INVARIANTS:
 * - 100% PL etykiety
 * - Deterministic ordering: severity DESC → category → element name ASC
 * - Fix actions map to ModalController.dispatch()
 * - No physics in this layer
 */

import React, { useMemo, useCallback } from 'react';
import type {
  ReadinessIssue,
  ReadinessSeverity,
  FixAction,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Issue category for grouping in the panel.
 */
export type IssueCategory =
  | 'MAGISTRALA'
  | 'STACJE'
  | 'TRANSFORMATORY'
  | 'ZRODLA'
  | 'ZABEZPIECZENIA'
  | 'KATALOG'
  | 'INNE';

/**
 * Polish category labels.
 */
const CATEGORY_LABELS: Record<IssueCategory, string> = {
  MAGISTRALA: 'Magistrala SN',
  STACJE: 'Stacje',
  TRANSFORMATORY: 'Transformatory',
  ZRODLA: 'Układy PV/BESS/FW',
  ZABEZPIECZENIA: 'Zabezpieczenia',
  KATALOG: 'Katalog',
  INNE: 'Inne',
};

/**
 * Category icons (CSS classes for Tailwind).
 */
const CATEGORY_COLORS: Record<IssueCategory, string> = {
  MAGISTRALA: 'text-blue-600',
  STACJE: 'text-amber-600',
  TRANSFORMATORY: 'text-purple-600',
  ZRODLA: 'text-green-600',
  ZABEZPIECZENIA: 'text-red-600',
  KATALOG: 'text-cyan-600',
  INNE: 'text-gray-600',
};

/**
 * Severity badge styling.
 */
const SEVERITY_STYLES: Record<ReadinessSeverity, { bg: string; text: string; label: string }> = {
  BLOCKER: { bg: 'bg-red-100', text: 'text-red-700', label: 'Blokujące' },
  IMPORTANT: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Ważne' },
  INFO: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Informacja' },
};

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

/**
 * Categorize an issue based on its code prefix.
 */
function categorizeIssue(issue: ReadinessIssue): IssueCategory {
  const code = issue.code.toLowerCase();
  if (code.includes('trunk') || code.includes('segment') || code.includes('line') || code.includes('cable') || code.includes('magistrala'))
    return 'MAGISTRALA';
  if (code.includes('station') || code.includes('stacja') || code.includes('bay'))
    return 'STACJE';
  if (code.includes('transformer') || code.includes('trafo'))
    return 'TRANSFORMATORY';
  if (code.includes('source') || code.includes('pv') || code.includes('bess') || code.includes('genset') || code.includes('ups') || code.includes('generator'))
    return 'ZRODLA';
  if (code.includes('protection') || code.includes('relay') || code.includes('ct') || code.includes('vt'))
    return 'ZABEZPIECZENIA';
  if (code.includes('catalog') || code.includes('type_ref') || code.includes('materialization'))
    return 'KATALOG';
  return 'INNE';
}

/**
 * Severity order for deterministic sorting.
 */
const SEVERITY_ORDER: Record<ReadinessSeverity, number> = {
  BLOCKER: 0,
  IMPORTANT: 1,
  INFO: 2,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaCompletenessPanelProps {
  /** Readiness issues from backend ENM. */
  issues: ReadinessIssue[];
  /** Whether the panel is visible. */
  visible: boolean;
  /** Callback: navigate to element on SLD (center + highlight). */
  onNavigateToElement: (elementRef: string) => void;
  /** Callback: trigger fix action (open appropriate modal). */
  onFixAction: (fixAction: FixAction, issue: ReadinessIssue) => void;
  /** Callback: close the panel. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SchemaCompletenessPanel: React.FC<SchemaCompletenessPanelProps> = ({
  issues,
  visible,
  onNavigateToElement,
  onFixAction,
  onClose,
}) => {
  /**
   * Group and sort issues by category, then by severity, then by element.
   */
  const groupedIssues = useMemo(() => {
    // Sort: severity DESC, then by code ASC for determinism
    const sorted = [...issues].sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.code.localeCompare(b.code);
    });

    // Group by category
    const groups = new Map<IssueCategory, ReadinessIssue[]>();
    for (const issue of sorted) {
      const cat = categorizeIssue(issue);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(issue);
    }

    return groups;
  }, [issues]);

  /**
   * Summary counts.
   */
  const summary = useMemo(() => {
    const blockers = issues.filter((i) => i.severity === 'BLOCKER').length;
    const important = issues.filter((i) => i.severity === 'IMPORTANT').length;
    const info = issues.filter((i) => i.severity === 'INFO').length;
    return { blockers, important, info, total: issues.length };
  }, [issues]);

  const handleNavigate = useCallback(
    (elementRef: string | null) => {
      if (elementRef) onNavigateToElement(elementRef);
    },
    [onNavigateToElement],
  );

  const handleFix = useCallback(
    (issue: ReadinessIssue) => {
      if (issue.fix_action) {
        onFixAction(issue.fix_action, issue);
      }
    },
    [onFixAction],
  );

  if (!visible) return null;

  return (
    <div
      data-testid="schema-completeness-panel"
      className="absolute top-0 right-0 z-30 w-96 h-full bg-white border-l border-gray-300 shadow-lg flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800 text-white flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Kontrola konfiguracji obliczeń</h3>
          <p className="text-xs text-slate-300 mt-0.5">
            {summary.total === 0
              ? 'Wszystkie dane kompletne'
              : `${summary.blockers} blokujących · ${summary.important} ważnych · ${summary.info} informacyjnych`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-300 hover:text-white text-lg leading-none ml-2"
          title="Zamknij panel"
        >
          &times;
        </button>
      </div>

      {/* Summary badges */}
      <div className="px-4 py-2 border-b border-gray-200 flex gap-2">
        {summary.blockers > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            {summary.blockers} blokujące
          </span>
        )}
        {summary.important > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            {summary.important} ważne
          </span>
        )}
        {summary.info > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            {summary.info} informacyjne
          </span>
        )}
        {summary.total === 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            Model kompletny
          </span>
        )}
      </div>

      {/* Issue list grouped by category */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(groupedIssues.entries()).map(([category, catIssues]) => (
          <div key={category} className="border-b border-gray-100">
            {/* Category header */}
            <div className="px-4 py-2 bg-gray-50 flex items-center gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wider ${CATEGORY_COLORS[category]}`}>
                {CATEGORY_LABELS[category]}
              </span>
              <span className="text-xs text-gray-400">({catIssues.length})</span>
            </div>

            {/* Issues in category */}
            {catIssues.map((issue, idx) => {
              const sev = SEVERITY_STYLES[issue.severity];
              return (
                <div
                  key={`${issue.code}-${idx}`}
                  data-testid={`completeness-issue-${issue.code}`}
                  className="px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    {/* Severity badge */}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${sev.bg} ${sev.text} shrink-0 mt-0.5`}>
                      {sev.label}
                    </span>
                    {/* Message */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{issue.message_pl}</p>
                      {issue.suggested_fix && (
                        <p className="text-xs text-gray-500 mt-0.5">{issue.suggested_fix}</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-2 ml-7">
                    {issue.element_ref && (
                      <button
                        type="button"
                        onClick={() => handleNavigate(issue.element_ref)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                        title="Przejdź do elementu na schemacie"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2z" />
                        </svg>
                        Przejdź
                      </button>
                    )}
                    {issue.fix_action && (
                      <button
                        type="button"
                        onClick={() => handleFix(issue)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded transition-colors"
                        title="Otwórz okno naprawy"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.59-5.59a2 2 0 112.83-2.83l5.59 5.59m0 0l5.59 5.59a2 2 0 11-2.83 2.83l-5.59-5.59z" />
                        </svg>
                        Napraw
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Empty state */}
        {issues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">Wszystkie dane kompletne</p>
            <p className="text-xs mt-1">Model jest gotowy do obliczeń</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchemaCompletenessPanel;
