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
    badge: 'bg-scada-panel text-scada-muted border border-scada-border',
    dot: 'ind-dot-none',
  },
  FRESH: {
    badge: 'bg-scada-neon-green/10 text-scada-neon-green border border-scada-neon-green/30',
    dot: 'ind-dot-ok',
  },
  OUTDATED: {
    badge: 'bg-scada-neon-amber/10 text-scada-neon-amber border border-scada-neon-amber/30',
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
        'bg-scada-chrome border-b border-scada-border',
        'select-none',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-scada-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          <span className="text-xs font-medium text-scada-dim">Zakres obliczeń:</span>
          {hasActiveCase ? (
            <span className="text-sm font-semibold text-scada-text">{caseName || '(bez nazwy)'}</span>
          ) : (
            <span className="text-sm italic text-scada-muted">Nie wybrano</span>
          )}
        </div>

        {hasActiveCase && caseKindLabel ? (
          <>
            <div className="ind-divider-v" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-scada-dim uppercase tracking-wider">Rodzaj:</span>
              <span className="text-xs font-medium text-scada-text">{caseKindLabel}</span>
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
              className="px-2 py-0.5 rounded-ind border border-scada-border bg-scada-panel text-[11px] font-mono text-scada-accent"
              title="Identyfikator ostatnich obliczeń"
            >
              Wyniki: {visibleRunId}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          data-testid="btn-change-case"
          onClick={handleChangeCaseClick}
          className="ind-btn border border-scada-border bg-scada-panel text-scada-dim hover:bg-scada-chrome hover:text-scada-text"
        >
          Zmień zakres
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
                ? 'border-scada-border bg-scada-panel text-scada-dim hover:bg-scada-chrome hover:text-scada-text'
                : 'cursor-not-allowed border-scada-border bg-scada-panel text-scada-muted',
            )}
            title={
              !hasActiveCase
                ? 'Wybierz zakres obliczeń, aby otworzyć akcje dodatkowe'
                : 'Akcje dodatkowe'
            }
          >
            Menu
          </button>

          {secondaryMenuOpen && hasActiveCase ? (
            <div
              data-testid="secondary-actions-menu"
              className="absolute right-0 top-full z-20 mt-2 min-w-[11rem] rounded-ind border border-scada-border bg-scada-panel p-1 shadow-lg shadow-black/40"
            >
              <button
                type="button"
                data-testid="btn-configure"
                onClick={handleConfigureClick}
                className="flex w-full items-center rounded-ind px-3 py-2 text-left text-sm text-scada-dim hover:bg-scada-chrome hover:text-scada-text"
              >
                Warunki obliczeń
              </button>
              <button
                type="button"
                data-testid="btn-results"
                onClick={handleResultsClick}
                disabled={resultStatus === 'NONE'}
                className={clsx(
                  'flex w-full items-center rounded-ind px-3 py-2 text-left text-sm',
                  resultStatus === 'NONE'
                    ? 'cursor-not-allowed text-scada-muted'
                    : 'text-scada-dim hover:bg-scada-chrome hover:text-scada-text',
                )}
                title={
                  resultStatus === 'NONE'
                    ? 'Brak wyników — uruchom obliczenia'
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
      label: 'Edycja modelu',
      className: 'text-scada-neon-green border-scada-neon-green/30 bg-scada-neon-green/10',
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      ),
    },
    RESULT_VIEW: {
      label: 'Wyniki obliczeń',
      className: 'text-scada-neon-cyan border-scada-neon-cyan/30 bg-scada-neon-cyan/10',
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

