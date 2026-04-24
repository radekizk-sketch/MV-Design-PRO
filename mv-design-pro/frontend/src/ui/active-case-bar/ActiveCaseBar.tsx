import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import {
  useAppStateStore,
  useActiveCaseName,
  useActiveMode,
  useCaseKindLabel,
  useResultStatusLabel,
  useHasActiveCase,
  useCanCalculate,
} from '../app-state';
import type { ResultStatus } from '../types';
import type { RuntimeOperatingMode } from '../operatingMode';
import { UndoRedoButtons } from '../history/UndoRedoButtons';
import { useExecutionRunsStore } from '../study-cases/runStore';
import { useResultsInspectorStore } from '../results-inspector/store';
import { navigateToCaseConfig, navigateToVariants } from '../navigation/routes';

const RESULT_STATUS_STYLES: Record<ResultStatus, { badge: string; dot: string }> = {
  NONE: {
    badge: 'bg-chrome-100 text-chrome-500',
    dot: 'ind-dot-none',
  },
  FRESH: {
    badge: 'bg-status-ok-light text-emerald-800',
    dot: 'ind-dot-ok',
  },
  OUTDATED: {
    badge: 'bg-status-warn-light text-amber-800',
    dot: 'ind-dot-warn',
  },
};

interface ActiveCaseBarProps {
  onChangeCaseClick?: () => void;
  onConfigureClick?: () => void;
  onCalculateClick?: () => void;
  onResultsClick?: () => void;
  className?: string;
}

export function ActiveCaseBar({
  onChangeCaseClick,
  onConfigureClick,
  onCalculateClick,
  onResultsClick,
  className,
}: ActiveCaseBarProps) {
  const [secondaryMenuOpen, setSecondaryMenuOpen] = useState(false);

  const caseName = useActiveCaseName();
  const caseKindLabel = useCaseKindLabel();
  const resultStatusLabel = useResultStatusLabel();
  const hasActiveCase = useHasActiveCase();
  const { allowed: canCalculate, reason: calculateBlockedReason } = useCanCalculate();

  const resultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const activeMode = useActiveMode();
  const appRunId = useAppStateStore((state) => state.activeRunId);
  const executionRunId = useExecutionRunsStore((state) => state.activeRunId);
  const selectedResultsRunId = useResultsInspectorStore((state) => state.selectedRunId);

  const visibleRunId = useMemo(
    () => appRunId ?? selectedResultsRunId ?? executionRunId,
    [appRunId, executionRunId, selectedResultsRunId],
  );

  const handleChangeCaseClick = useCallback(() => {
    if (onChangeCaseClick) {
      onChangeCaseClick();
      return;
    }
    navigateToVariants();
  }, [onChangeCaseClick]);

  const handleConfigureClick = useCallback(() => {
    if (onConfigureClick) {
      onConfigureClick();
    } else {
      navigateToCaseConfig();
    }
    setSecondaryMenuOpen(false);
  }, [onConfigureClick]);

  const handleCalculateClick = useCallback(() => {
    if (onCalculateClick && canCalculate) {
      onCalculateClick();
    }
  }, [canCalculate, onCalculateClick]);

  const handleResultsClick = useCallback(() => {
    onResultsClick?.();
    setSecondaryMenuOpen(false);
  }, [onResultsClick]);

  const handleSecondaryActionsToggle = useCallback(() => {
    setSecondaryMenuOpen((current) => !current);
  }, []);

  const statusStyle = RESULT_STATUS_STYLES[resultStatus];

  return (
    <div
      data-testid="active-case-bar"
      className={clsx(
        'flex items-center justify-between px-4 h-10',
        'bg-white border-b border-chrome-200 shadow-toolbar',
        'select-none',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ind-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-xs font-medium text-chrome-500">Aktywny wariant pracy:</span>
          {hasActiveCase ? (
            <span className="text-sm font-semibold text-ind-900">{caseName || '(bez nazwy)'}</span>
          ) : (
            <span className="text-sm italic text-chrome-300">Nie wybrano</span>
          )}
        </div>

        {hasActiveCase && caseKindLabel ? (
          <>
            <div className="ind-divider-v" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-chrome-400 uppercase tracking-wider">Typ:</span>
              <span className="text-xs font-medium text-chrome-600">{caseKindLabel}</span>
            </div>
          </>
        ) : null}

        {hasActiveCase ? (
          <>
            <div className="ind-divider-v" />
            <div
              data-testid="result-status"
              className={clsx(
                'flex items-center gap-1.5 px-2 py-0.5 rounded-ind text-xs font-medium',
                statusStyle.badge,
              )}
              title={resultStatusLabel}
            >
              <span className={statusStyle.dot} />
              <span>{resultStatusLabel}</span>
            </div>
          </>
        ) : null}

        {hasActiveCase && visibleRunId ? (
          <>
            <div className="ind-divider-v" />
            <div
              data-testid="active-run-id"
              className="px-2 py-0.5 rounded-ind border border-indigo-200 bg-indigo-50 text-[11px] font-mono text-indigo-700"
              title="Aktywny identyfikator obliczeń"
            >
              Obliczenia: {visibleRunId}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          data-testid="btn-change-case"
          onClick={handleChangeCaseClick}
          className="ind-btn border border-chrome-200 bg-chrome-50 text-chrome-600 hover:bg-chrome-100"
        >
          Zmień wariant
        </button>

        <button
          data-testid="btn-calculate"
          onClick={handleCalculateClick}
          disabled={!canCalculate}
          className="ind-btn-calculate"
          title={calculateBlockedReason || 'Uruchom obliczenia'}
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
          Oblicz
        </button>

        <div className="ind-divider-v" />
        <UndoRedoButtons />

        <div className="ind-divider-v" />
        <div className="relative">
          <button
            type="button"
            data-testid="btn-secondary-actions"
            onClick={handleSecondaryActionsToggle}
            disabled={!hasActiveCase}
            className={clsx(
              'ind-btn border',
              hasActiveCase
                ? 'border-chrome-200 bg-chrome-50 text-chrome-600 hover:bg-chrome-100'
                : 'cursor-not-allowed border-chrome-100 bg-chrome-50 text-chrome-300',
            )}
            title={
              !hasActiveCase
                ? 'Wybierz wariant pracy, aby otworzyć akcje dodatkowe'
                : 'Akcje dodatkowe'
            }
          >
            Menu
          </button>

          {secondaryMenuOpen && hasActiveCase ? (
            <div
              data-testid="secondary-actions-menu"
              className="absolute right-0 top-full z-20 mt-2 min-w-[11rem] rounded-ind border border-chrome-200 bg-white p-1 shadow-lg"
            >
              <button
                type="button"
                data-testid="btn-configure"
                onClick={handleConfigureClick}
                className="flex w-full items-center rounded-ind px-3 py-2 text-left text-sm text-chrome-700 hover:bg-chrome-50"
              >
                Kontekst wariantu
              </button>
              <button
                type="button"
                data-testid="btn-results"
                onClick={handleResultsClick}
                disabled={resultStatus === 'NONE'}
                className={clsx(
                  'flex w-full items-center rounded-ind px-3 py-2 text-left text-sm',
                  resultStatus === 'NONE'
                    ? 'cursor-not-allowed text-chrome-300'
                    : 'text-chrome-700 hover:bg-chrome-50',
                )}
                title={
                  resultStatus === 'NONE'
                    ? 'Brak wynikow - uruchom obliczenia'
                    : 'Przegladaj wyniki'
                }
              >
                Podgląd wyników
              </button>
            </div>
          ) : null}
        </div>

        <div className="ind-divider-v" />
        <ModeIndicator mode={activeMode} />
      </div>
    </div>
  );
}

interface ModeIndicatorProps {
  mode: RuntimeOperatingMode;
}

function ModeIndicator({ mode }: ModeIndicatorProps) {
  const config = {
    MODEL_EDIT: {
      label: 'Model sieci',
      className: 'text-ind-700 bg-ind-50 border-ind-200',
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      ),
    },
    RESULT_VIEW: {
      label: 'Analiza i wyniki',
      className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
  };

  const { label, className, icon } = config[mode];

  return (
    <div
      data-testid="mode-indicator"
      data-mode={mode}
      className={clsx(
        'flex items-center gap-1.5 rounded-ind border px-2 py-1 text-[11px] font-semibold tracking-wide',
        className,
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

export default ActiveCaseBar;

