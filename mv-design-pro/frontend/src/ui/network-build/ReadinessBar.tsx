/**
 * ReadinessBar — Dolny pasek gotowości do analizy.
 *
 * Persistent bar widoczny w MODEL_EDIT pokazujący stan gotowości sieci
 * z szybkim dostępem do napraw i nawigacją do problematycznych elementów.
 *
 * INTEGRACJA:
 * - readiness.blockers + readiness.warnings z snapshotStore
 * - fixActions z snapshotStore → nawigacja do elementu / otwieranie modali
 * - selectionStore → podświetlanie elementu na SLD
 * - networkBuildStore.openOperationForm → otwieranie formularzy naprawczych
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { useNetworkBuildDerived, useNetworkBuildStore } from './networkBuildStore';
import { useAppStateStore, useCanCalculate } from '../app-state';
import { useSelectionStore } from '../selection';
import { useSnapshotStore } from '../topology/snapshotStore';
import { resolveSelectedElementFromSnapshot } from '../selection/resolveElementSelection';
import { executeFixAction } from './fixActionExecution';
import type { FixAction } from '../../types/enm';

// =============================================================================
// Category filter
// =============================================================================

type FilterCategory = 'all' | 'topologia' | 'katalogi' | 'eksploatacja' | 'analiza';

const CATEGORY_LABELS: Record<FilterCategory, string> = {
  all: 'Wszystkie',
  topologia: 'Topologia',
  katalogi: 'Katalogi',
  eksploatacja: 'Eksploatacja',
  analiza: 'Analiza',
};

function categorizeBlocker(code: string): FilterCategory {
  const lc = code.toLowerCase();
  if (
    lc.includes('topology') || lc.includes('island') || lc.includes('disconnected') ||
    lc.includes('voltage_mismatch') || lc.includes('grounding') || lc.includes('isolated')
  ) {
    return 'topologia';
  }
  if (
    lc.includes('catalog') || lc.includes('missing_type') || lc.includes('no_catalog') ||
    lc.includes('impedance') || lc.includes('zero_seq') || lc.includes('missing_rating')
  ) {
    return 'katalogi';
  }
  if (
    lc.includes('switch_state') || lc.includes('nop') || lc.includes('normal_state') ||
    lc.includes('coupler') || lc.includes('tap_position') || lc.includes('operating')
  ) {
    return 'eksploatacja';
  }
  return 'analiza';
}

export interface ReadinessBarProps {
  className?: string;
  onRunAnalysis?: () => void;
  onOpenResults?: () => void;
  onOpenIssuePanel?: () => void;
}

export function ReadinessBar({
  className,
  onRunAnalysis,
  onOpenResults,
  onOpenIssuePanel,
}: ReadinessBarProps) {
  const { readiness, blockersByCategory, isReady, fixActions } = useNetworkBuildDerived();
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const { allowed: canRunAnalysis, reason: calculateBlockedReason } = useCanCalculate();
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [expanded, setExpanded] = useState(false);

  const blockers = readiness?.blockers ?? [];
  const warnings = readiness?.warnings ?? [];

  const filteredBlockers = activeFilter === 'all'
    ? blockers
    : blockers.filter((b) => categorizeBlocker(b.code) === activeFilter);

  const handleNavigateToElement = useCallback(
    (elementRef: string) => {
      if (elementRef) {
        selectElement(resolveSelectedElementFromSnapshot(snapshot, elementRef));
        window.dispatchEvent(new CustomEvent('sld:center-on-element', { detail: { elementId: elementRef } }));
      }
    },
    [selectElement, snapshot],
  );

  const handleFixAction = useCallback(
    (action: FixAction) => {
      executeFixAction({
        action,
        navigateToElement: handleNavigateToElement,
        openOperationForm,
      });
    },
    [handleNavigateToElement, openOperationForm],
  );

  if (!readiness) return null;

  // Compact mode when ready
  if (isReady) {
    return (
      <div
        className={clsx(
          'flex items-center gap-3 px-4 py-1.5 bg-green-50 border-t border-green-200',
          className,
        )}
        data-testid="readiness-bar"
        data-ready="true"
      >
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
        <span className="text-[11px] font-semibold text-green-700">
          Gotowy do analizy
        </span>
        <span className="text-[10px] text-gray-500">
          {warnings.length > 0 ? `${warnings.length} ostrzeżeń` : 'Brak zastrzeżeń'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {warnings.length > 0 && onOpenIssuePanel && (
            <button
              type="button"
              onClick={onOpenIssuePanel}
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
            >
              Problemy
            </button>
          )}
          {resultStatus !== 'NONE' && onOpenResults && (
            <button
              type="button"
              onClick={onOpenResults}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
            >
              Wyniki i analiza
            </button>
          )}
          {onRunAnalysis && (
            <button
              type="button"
              onClick={onRunAnalysis}
              disabled={!canRunAnalysis}
              title={calculateBlockedReason ?? 'Uruchom obliczenia dla aktywnego przypadku'}
              className={clsx(
                'rounded-full px-2.5 py-1 text-[10px] font-medium',
                canRunAnalysis
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'cursor-not-allowed bg-slate-200 text-slate-400',
              )}
            >
              Uruchom analize
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx('border-t border-gray-200 bg-white', className)}
      data-testid="readiness-bar"
      data-ready="false"
    >
      {/* Top row: summary + category filters */}
      <div className="flex items-center gap-3 px-4 py-1.5">
        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600"
          aria-label={expanded ? 'Zwiń pasek gotowości' : 'Rozwiń pasek gotowości'}
        >
          <svg
            className={clsx('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {/* Counters */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {blockersByCategory.total > 0 && (
            <span className="text-[11px] font-semibold text-red-600">
              {blockersByCategory.total} blokad
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-[11px] font-semibold text-amber-600">
              {warnings.length} ostrzeżeń
            </span>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-gray-200" />

        {/* Category chips */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {(Object.keys(CATEGORY_LABELS) as FilterCategory[]).map((cat) => {
            const count = cat === 'all'
              ? blockersByCategory.total
              : blockersByCategory[cat as keyof typeof blockersByCategory] as number;
            if (cat !== 'all' && count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveFilter(cat)}
                className={clsx(
                  'px-2 py-0.5 text-[10px] rounded-full transition-colors whitespace-nowrap',
                  activeFilter === cat
                    ? 'bg-blue-100 text-blue-800 font-medium'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                {CATEGORY_LABELS[cat]}
                {count > 0 && ` (${count})`}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {(blockersByCategory.total > 0 || warnings.length > 0) && onOpenIssuePanel && (
            <button
              type="button"
              onClick={onOpenIssuePanel}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
            >
              Otworz problemy
            </button>
          )}
          {resultStatus !== 'NONE' && onOpenResults && (
            <button
              type="button"
              onClick={onOpenResults}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
            >
              Wyniki
            </button>
          )}
        </div>
      </div>

      {/* Blocker list (compact: top 3, expanded: all + fix actions) */}
      {filteredBlockers.length > 0 && (
        <div className="px-4 pb-1.5 space-y-0.5">
          {filteredBlockers.slice(0, expanded ? undefined : 3).map((b, i) => {
            const matchingFix = fixActions.find(
              (f) => f.element_ref === b.element_ref && f.code === b.code,
            );
            return (
              <div
                key={`${b.code}-${i}`}
                className="flex items-center gap-2 group"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                <span
                  className="text-[10px] text-red-700 truncate max-w-[220px] cursor-pointer hover:underline"
                  title={b.message_pl}
                  onClick={() => b.element_ref && handleNavigateToElement(b.element_ref)}
                >
                  {b.message_pl}
                </span>
                {b.element_ref && (
                  <button
                    type="button"
                    onClick={() => handleNavigateToElement(b.element_ref!)}
                    className="text-[9px] text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Pokaż na SLD"
                  >
                    ⊕
                  </button>
                )}
                {matchingFix && (
                  <button
                    type="button"
                    onClick={() => handleFixAction(matchingFix)}
                    className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={matchingFix.message_pl}
                  >
                    Napraw
                  </button>
                )}
              </div>
            );
          })}
          {!expanded && filteredBlockers.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[10px] text-gray-400 hover:text-gray-600"
            >
              +{filteredBlockers.length - 3} więcej
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ReadinessBar;
