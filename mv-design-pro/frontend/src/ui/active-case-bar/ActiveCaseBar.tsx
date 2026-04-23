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
import { navigateToConditions, navigateToVariants } from '../navigation/routes';

const RESULT_STATUS_STYLES: Record<ResultStatus, { badge: string; dot: string }> = {
  NONE: {
    badge: 'border border-[#294153] bg-[#0d1c29] text-[#dde8f2]',
    dot: 'ind-dot-none',
  },
  FRESH: {
    badge: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    dot: 'ind-dot-ok',
  },
  OUTDATED: {
    badge: 'border border-amber-500/40 bg-amber-500/10 text-amber-200',
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
      navigateToConditions();
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
        'flex min-h-[3.2rem] items-center justify-between gap-3 px-4 py-2',
        'border-b border-chrome-800',
        'bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.16),transparent_28%),linear-gradient(180deg,#08141d_0%,#07111a_100%)]',
        'shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]',
        'select-none',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-[16rem] items-center gap-3 rounded-[18px] border border-[#1d3446] bg-[rgba(9,22,33,0.82)] px-3 py-2 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]">
          <svg className="h-4 w-4 shrink-0 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <div className="min-w-0">
            <div className="scada-shell-eyebrow">Zakres obliczen</div>
            {hasActiveCase ? (
              <div className="truncate text-sm font-semibold text-slate-50">{caseName || '(bez nazwy)'}</div>
            ) : (
              <div className="text-sm italic text-[#8199ac]">Nie wybrano</div>
            )}
          </div>
        </div>

        {hasActiveCase && caseKindLabel ? (
          <div className="rounded-[16px] border border-[#1d3446] bg-[rgba(9,22,33,0.82)] px-3 py-2 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]">
            <div className="scada-shell-eyebrow">Tryb pracy</div>
            <div className="text-xs font-semibold text-slate-100">{caseKindLabel}</div>
          </div>
        ) : null}

        {hasActiveCase ? (
          <div
            data-testid="result-status"
            className={clsx(
              'rounded-[16px] border px-3 py-2 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]',
              statusStyle.badge,
            )}
            title={resultStatusLabel}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">Stan wynikow</div>
            <div className="mt-1 flex items-center gap-2 text-xs font-semibold">
              <span className={statusStyle.dot} />
              <span>{resultStatusLabel}</span>
            </div>
          </div>
        ) : null}

        {hasActiveCase && visibleRunId ? (
          <div
            data-testid="active-run-id"
            className="rounded-[16px] border border-sky-500/35 bg-sky-500/12 px-3 py-2 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
            title="Identyfikator aktywnych wynikow obliczen"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">Aktywny przebieg</div>
            <div className="mt-1 text-[11px] font-mono font-semibold text-sky-100">{visibleRunId}</div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          data-testid="btn-change-case"
          onClick={handleChangeCaseClick}
          className="scada-action-btn"
        >
          Zmien zakres
        </button>

        <button
          data-testid="btn-calculate"
          onClick={handleCalculateClick}
          disabled={!canCalculate}
          className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-emerald-500/35 bg-emerald-500/14 px-3 py-2 text-xs font-semibold text-emerald-50 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-[#3a4d5d] disabled:bg-[#233241] disabled:text-[#7c91a3]"
          title={calculateBlockedReason || 'Uruchom obliczenia'}
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
          Oblicz
        </button>

        <div className="flex items-center gap-1 rounded-[14px] border border-[#1d3446] bg-[rgba(9,22,33,0.82)] px-1.5 py-1 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]">
          <UndoRedoButtons />
        </div>

        <div className="relative">
          <button
            type="button"
            data-testid="btn-secondary-actions"
            onClick={handleSecondaryActionsToggle}
            disabled={!hasActiveCase}
            className={clsx(
              'inline-flex items-center justify-center gap-1.5 rounded-[12px] border px-3 py-2 text-xs font-medium transition-colors',
              hasActiveCase
                ? 'border-[#274154] bg-[#0a1824] text-[#d7e5ef] hover:bg-[#112433] hover:text-white'
                : 'cursor-not-allowed border-[#223544] bg-[#0b151f] text-[#637a8e]',
            )}
            title={
              !hasActiveCase
                ? 'Wybierz zakres obliczen, aby otworzyc akcje dodatkowe'
                : 'Akcje dodatkowe'
            }
          >
            Menu
          </button>

          {secondaryMenuOpen && hasActiveCase ? (
            <div
              data-testid="secondary-actions-menu"
              className="absolute right-0 top-full z-20 mt-2 min-w-[12rem] rounded-[16px] border border-[#21394c] bg-[#07131c] p-1.5 shadow-[0_18px_36px_rgba(2,8,23,0.45)]"
            >
              <button
                type="button"
                data-testid="btn-configure"
                onClick={handleConfigureClick}
                className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-[#112433]"
              >
                Warunki obliczen
              </button>
              <button
                type="button"
                data-testid="btn-results"
                onClick={handleResultsClick}
                disabled={resultStatus === 'NONE'}
                className={clsx(
                  'flex w-full items-center rounded-[10px] px-3 py-2 text-left text-sm',
                  resultStatus === 'NONE'
                    ? 'cursor-not-allowed text-[#637a8e]'
                    : 'text-slate-100 transition-colors hover:bg-[#112433]',
                )}
                title={
                  resultStatus === 'NONE'
                    ? 'Brak wynikow - wykonaj obliczenia'
                    : 'Przegladaj wyniki'
                }
              >
                Podglad wynikow
              </button>
            </div>
          ) : null}
        </div>

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
      className: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      ),
    },
    RESULT_VIEW: {
      label: 'Analiza i wyniki',
      className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
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

