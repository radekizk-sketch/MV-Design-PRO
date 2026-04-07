/**
 * Active Case Bar â€” Pasek aktywnego przypadku obliczeniowego
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md Â§ 1.3: Active case awareness bar
 * - powerfactory_ui_parity.md Â§ A.2: Status bar
 *
 * ALWAYS VISIBLE bar showing:
 * - Aktywny przypadek (nazwa i typ)
 * - Stan wynikĂłw (BRAK / AKTUALNE / NIEAKTUALNE)
 * - Przyciski akcji: ZmieĹ„, Konfiguruj, Oblicz, Wyniki
 *
 * POLISH UI (100% Polish labels).
 *
 * INVARIANTS:
 * - Brak aktywnego przypadku â†’ [Oblicz] DISABLED z komunikatem PL
 * - Kolory stanu wynikĂłw: BRAK=szary, AKTUALNE=zielony, NIEAKTUALNE=bursztynowy
 */

import { useCallback } from 'react';
import { clsx } from 'clsx';
import {
  useAppStateStore,
  useActiveCaseName,
  useCaseKindLabel,
  useResultStatusLabel,
  useHasActiveCase,
  useCanCalculate,
} from '../app-state';
import type { ResultStatus } from '../types';
import { UndoRedoButtons } from '../history/UndoRedoButtons';

// =============================================================================
// Status Styling â€” Industrial Grade
// =============================================================================

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

// =============================================================================
// Component Props
// =============================================================================

interface ActiveCaseBarProps {
  onChangeCaseClick?: () => void;
  onConfigureClick?: () => void;
  onCalculateClick?: () => void;
  onResultsClick?: () => void;
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function ActiveCaseBar({
  onChangeCaseClick,
  onConfigureClick,
  onCalculateClick,
  onResultsClick,
  className,
}: ActiveCaseBarProps) {
  const caseName = useActiveCaseName();
  const caseKindLabel = useCaseKindLabel();
  const resultStatusLabel = useResultStatusLabel();
  const hasActiveCase = useHasActiveCase();
  const { allowed: canCalculate, reason: calculateBlockedReason } = useCanCalculate();

  const resultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const toggleCaseManager = useAppStateStore((state) => state.toggleCaseManager);

  const handleChangeCaseClick = useCallback(() => {
    if (onChangeCaseClick) {
      onChangeCaseClick();
    } else {
      toggleCaseManager(true);
    }
  }, [onChangeCaseClick, toggleCaseManager]);

  const handleConfigureClick = useCallback(() => {
    if (onConfigureClick) {
      onConfigureClick();
    }
  }, [onConfigureClick]);

  const handleCalculateClick = useCallback(() => {
    if (onCalculateClick && canCalculate) {
      onCalculateClick();
    }
  }, [onCalculateClick, canCalculate]);

  const handleResultsClick = useCallback(() => {
    if (onResultsClick) {
      onResultsClick();
    }
  }, [onResultsClick]);

  const statusStyle = RESULT_STATUS_STYLES[resultStatus];

  return (
    <div
      data-testid="active-case-bar"
      className={clsx(
        'flex items-center justify-between px-4 h-10',
        'bg-white border-b border-chrome-200 shadow-toolbar',
        'select-none',
        className
      )}
    >
      {/* Lewa strona: Informacje o przypadku */}
      <div className="flex items-center gap-3">
        {/* Ikona + etykieta */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ind-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-xs font-medium text-chrome-500">
            Aktywny przypadek:
          </span>
          {hasActiveCase ? (
            <span className="text-sm font-semibold text-ind-900">
              {caseName || '(bez nazwy)'}
            </span>
          ) : (
            <span className="text-sm italic text-chrome-300">
              Nie wybrano
            </span>
          )}
        </div>

        {/* Typ przypadku */}
        {hasActiveCase && caseKindLabel && (
          <>
            <div className="ind-divider-v" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-chrome-400 uppercase tracking-wider">Typ:</span>
              <span className="text-xs font-medium text-chrome-600">
                {caseKindLabel}
              </span>
            </div>
          </>
        )}

        {/* Stan wynikĂłw */}
        {hasActiveCase && (
          <>
            <div className="ind-divider-v" />
            <div
              data-testid="result-status"
              className={clsx(
                'flex items-center gap-1.5 px-2 py-0.5 rounded-ind text-xs font-medium',
                statusStyle.badge
              )}
              title={resultStatusLabel}
            >
              <span className={statusStyle.dot} />
              <span>{resultStatusLabel}</span>
            </div>
          </>
        )}


        {/* Aktywny run */}
        {hasActiveCase && activeRunId && (
          <>
            <div className="ind-divider-v" />
            <div
              data-testid="active-run-id"
              className="px-2 py-0.5 rounded-ind text-[11px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200"
              title="Aktywny przebieg obliczeniowy"
            >
              Run: {activeRunId}
            </div>
          </>
        )}
      </div>

      {/* Prawa strona: Przyciski akcji */}
      <div className="flex items-center gap-1.5">
        {/* ZmieĹ„ przypadek */}
        <button
          data-testid="btn-change-case"
          onClick={handleChangeCaseClick}
          className="ind-btn text-chrome-600 bg-chrome-50 hover:bg-chrome-100 border border-chrome-200"
        >
          ZmieĹ„ przypadek
        </button>

        {/* Konfiguruj */}
        <button
          data-testid="btn-configure"
          onClick={handleConfigureClick}
          disabled={!hasActiveCase}
          className={clsx(
            'ind-btn border',
            hasActiveCase
              ? 'text-chrome-600 bg-chrome-50 hover:bg-chrome-100 border-chrome-200'
              : 'text-chrome-300 bg-chrome-50 border-chrome-100 cursor-not-allowed'
          )}
          title={
            !hasActiveCase
              ? 'Wybierz przypadek, aby skonfigurowaÄ‡'
              : 'Konfiguruj parametry przypadku'
          }
        >
          Konfiguruj
        </button>

        <div className="ind-divider-v" />

        {/* Oblicz â€” gĹ‚Ăłwna akcja */}
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

        {/* Wyniki */}
        <button
          data-testid="btn-results"
          onClick={handleResultsClick}
          disabled={!hasActiveCase || resultStatus === 'NONE'}
          className={clsx(
            'ind-btn border',
            hasActiveCase && resultStatus !== 'NONE'
              ? 'text-ind-700 bg-ind-50 hover:bg-ind-100 border-ind-200'
              : 'text-chrome-300 bg-chrome-50 border-chrome-100 cursor-not-allowed'
          )}
          title={
            !hasActiveCase
              ? 'Wybierz przypadek, aby zobaczyÄ‡ wyniki'
              : resultStatus === 'NONE'
                ? 'Brak wynikĂłw â€” uruchom obliczenia'
                : 'Otworz kanoniczna przestrzen wynikow i analizy'
          }
        >
          Wyniki i analiza
        </button>

        {/* Separator + Cofnij/PonĂłw */}
        <div className="ind-divider-v" />
        <UndoRedoButtons />

        {/* WskaĹşnik trybu */}
        <div className="ind-divider-v" />
        <ModeIndicator mode={activeMode} />
      </div>
    </div>
  );
}

// =============================================================================
// Mode Indicator Sub-component
// =============================================================================

interface ModeIndicatorProps {
  mode: 'MODEL_EDIT' | 'CASE_CONFIG' | 'RESULT_VIEW';
}

function ModeIndicator({ mode }: ModeIndicatorProps) {
  const config = {
    MODEL_EDIT: {
      label: 'Edycja modelu',
      className: 'text-ind-700 bg-ind-50 border-ind-200',
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      ),
    },
    CASE_CONFIG: {
      label: 'Konfiguracja',
      className: 'text-purple-700 bg-purple-50 border-purple-200',
      icon: (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    RESULT_VIEW: {
      label: 'Wyniki',
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
        'flex items-center gap-1.5 px-2 py-1 rounded-ind border text-[11px] font-semibold tracking-wide',
        className
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

export default ActiveCaseBar;
