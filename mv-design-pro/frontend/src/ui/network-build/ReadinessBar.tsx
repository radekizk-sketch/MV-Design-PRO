import { useCallback, useState } from 'react';
import { clsx } from 'clsx';

import type { FixAction } from '../../types/enm';
import { notify } from '../notifications/store';
import { useSelectionStore } from '../selection';
import { executeFixActionSurface } from '../shared/fixActionSurfaceExecutor';
import { sanitizePublicReadinessMessage } from '../shared/publicReadinessMessage';
import { resolveSelectedElementFromSnapshot } from '../shared/selectionResolution';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useNetworkBuildDerived, useNetworkBuildStore } from './networkBuildStore';

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
    lc.includes('topology')
    || lc.includes('island')
    || lc.includes('disconnected')
    || lc.includes('voltage_mismatch')
    || lc.includes('grounding')
    || lc.includes('isolated')
  ) {
    return 'topologia';
  }
  if (
    lc.includes('catalog')
    || lc.includes('missing_type')
    || lc.includes('no_catalog')
    || lc.includes('impedance')
    || lc.includes('zero_seq')
    || lc.includes('missing_rating')
  ) {
    return 'katalogi';
  }
  if (
    lc.includes('switch_state')
    || lc.includes('nop')
    || lc.includes('normal_state')
    || lc.includes('coupler')
    || lc.includes('tap_position')
    || lc.includes('operating')
  ) {
    return 'eksploatacja';
  }
  return 'analiza';
}

export interface ReadinessBarProps {
  className?: string;
}

export function ReadinessBar({ className }: ReadinessBarProps) {
  const { readiness, blockersByCategory, isReady, fixActions } = useNetworkBuildDerived();
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [expanded, setExpanded] = useState(false);

  const blockers = readiness?.blockers ?? [];
  const warnings = readiness?.warnings ?? [];
  const filteredBlockers =
    activeFilter === 'all'
      ? blockers
      : blockers.filter((blocker) => categorizeBlocker(blocker.code) === activeFilter);

  const handleNavigateToElement = useCallback(
    (elementRef: string) => {
      if (!elementRef) {
        return;
      }
      selectElement(resolveSelectedElementFromSnapshot(snapshot, elementRef, elementRef));
      centerSldOnElement(elementRef);
    },
    [centerSldOnElement, selectElement, snapshot],
  );

  const handleFixAction = useCallback(
    (action: FixAction) => {
      executeFixActionSurface(action, {
        snapshot,
        openOperationForm,
        selectElement,
        centerSldOnElement,
        notify,
      });
    },
    [centerSldOnElement, openOperationForm, selectElement, snapshot],
  );

  if (!readiness) {
    return null;
  }

  if (isReady) {
    return (
      <div
        className={clsx(
          'flex items-center gap-3 border-t border-green-200 bg-green-50 px-4 py-1.5',
          className,
        )}
        data-testid="readiness-bar"
        data-ready="true"
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
        <span className="text-[11px] font-semibold text-green-700">Układ dopuszczony do analizy</span>
        <span className="text-[10px] text-gray-500">
          {warnings.length > 0 ? `${warnings.length} uwag projektowych` : 'Bez uwag projektowych'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={clsx('border-t border-gray-200 bg-white', className)}
      data-testid="readiness-bar"
      data-ready="false"
    >
      <div className="flex items-center gap-3 px-4 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-gray-400 hover:text-gray-600"
          aria-label={expanded ? 'Zwiń kontrolę układu' : 'Rozwiń kontrolę układu'}
        >
          <svg
            className={clsx('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

        <div className="flex flex-shrink-0 items-center gap-3">
          {blockersByCategory.total > 0 && (
            <span className="text-[11px] font-semibold text-red-600">
              {blockersByCategory.total} pozycji kontroli
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-[11px] font-semibold text-amber-600">
              {warnings.length} uwag technicznych
            </span>
          )}
        </div>

        <div className="h-4 w-px bg-gray-200" />

        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {(Object.keys(CATEGORY_LABELS) as FilterCategory[]).map((category) => {
            const count =
              category === 'all'
                ? blockersByCategory.total
                : (blockersByCategory[category as keyof typeof blockersByCategory] as number);
            if (category !== 'all' && count === 0) {
              return null;
            }
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveFilter(category)}
                className={clsx(
                  'whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] transition-colors',
                  activeFilter === category
                    ? 'bg-blue-100 font-medium text-blue-800'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                {CATEGORY_LABELS[category]}
                {count > 0 && ` (${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {filteredBlockers.length > 0 && (
        <div className="space-y-0.5 px-4 pb-1.5">
          {filteredBlockers.slice(0, expanded ? undefined : 3).map((blocker, index) => {
            const matchingFix = fixActions.find(
              (fixAction) => fixAction.element_ref === blocker.element_ref && fixAction.code === blocker.code,
            );
            const publicMessage = sanitizePublicReadinessMessage(blocker.message_pl, snapshot);
            const publicFixMessage = matchingFix
              ? sanitizePublicReadinessMessage(matchingFix.message_pl, snapshot)
              : null;
            return (
              <div key={`${blocker.code}-${index}`} className="group flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />
                <span
                  className="max-w-[220px] cursor-pointer truncate text-[10px] text-red-700 hover:underline"
                  title={publicMessage}
                  onClick={() => blocker.element_ref && handleNavigateToElement(blocker.element_ref)}
                >
                  {publicMessage}
                </span>
                {blocker.element_ref && (
                  <button
                    type="button"
                    onClick={() => handleNavigateToElement(blocker.element_ref!)}
                    className="text-[9px] text-blue-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-blue-700"
                    title="Pokaż na SLD"
                  >
                    ⊕
                  </button>
                )}
                {matchingFix && (
                  <button
                    type="button"
                    onClick={() => handleFixAction(matchingFix)}
                    className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-100"
                    title={publicFixMessage ?? undefined}
                  >
                    Konfiguruj
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
