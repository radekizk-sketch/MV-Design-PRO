import { clsx } from 'clsx';

import {
  useActiveAnalysisTypeLabel,
  useActiveCaseId,
  useActiveCaseName,
  useActiveMode,
  useActiveModeLabel,
  useActiveProjectId,
  useActiveSnapshotId,
  useAppStateStore,
} from '../app-state';
import { useStudyCasesStore } from '../study-cases/store';
import type { ResultStatus } from '../types';
import type { RuntimeOperatingMode } from '../operatingMode';

const MODE_STYLES: Record<RuntimeOperatingMode, string> = {
  MODEL_EDIT: 'bg-ind-600 text-white',
  RESULT_VIEW: 'bg-status-ok text-white',
};

const RESULT_DOT_STYLES: Record<ResultStatus, string> = {
  NONE: 'ind-dot-none',
  FRESH: 'ind-dot-ok',
  OUTDATED: 'ind-dot-warn',
};

const RESULT_TEXT_STYLES: Record<ResultStatus, string> = {
  NONE: 'text-chrome-400',
  FRESH: 'text-emerald-400',
  OUTDATED: 'text-amber-400',
};

interface StatusBarProps {
  validationStatus?: 'valid' | 'warnings' | 'errors' | null;
  validationWarnings?: number;
  validationErrors?: number;
  networkStats?: {
    nodeCount?: number;
    branchCount?: number;
  };
  className?: string;
}

function getResultStatusLabel(status: ResultStatus): string {
  switch (status) {
    case 'FRESH':
      return 'Wyniki aktualne';
    case 'OUTDATED':
      return 'Wyniki nieaktualne';
    case 'NONE':
    default:
      return 'Brak wynikow';
  }
}

export function StatusBar({
  validationStatus,
  validationWarnings = 0,
  validationErrors = 0,
  networkStats,
  className,
}: StatusBarProps) {
  const activeMode = useActiveMode();
  const modeLabel = useActiveModeLabel();
  const projectId = useActiveProjectId();
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const caseId = useActiveCaseId();
  const caseName = useActiveCaseName();
  const snapshotId = useActiveSnapshotId();
  const analysisTypeLabel = useActiveAnalysisTypeLabel();
  const appResultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const studyCaseResultStatus = useStudyCasesStore((state) => state.activeCase?.result_status ?? null);

  const resultStatus = studyCaseResultStatus ?? appResultStatus;
  const resultStatusLabel = getResultStatusLabel(resultStatus);

  const snapshotDisplay = snapshotId
    ? snapshotId.length > 8
      ? `${snapshotId.substring(0, 8)}...`
      : snapshotId
    : null;

  const bgStyle = !projectId
    ? 'bg-amber-900 border-amber-700'
    : !caseId
      ? 'bg-ind-900 border-ind-700'
      : 'bg-chrome-800 border-chrome-700';

  return (
    <div
      data-testid="status-bar"
      className={clsx(
        'flex h-7 items-center justify-between border-t px-4 text-[11px] text-white select-none',
        bgStyle,
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          data-testid="status-bar-mode"
          data-mode={activeMode}
          className={clsx(
            'flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            MODE_STYLES[activeMode],
          )}
        >
          <span>{modeLabel}</span>
        </div>

        <span className="text-chrome-600">|</span>

        <div className="flex items-center gap-1.5" data-testid="status-bar-project">
          <span className="text-chrome-400">Projekt:</span>
          {projectId ? (
            <span className="font-medium text-white">
              {projectName || projectId.substring(0, 8)}
            </span>
          ) : (
            <span className="font-medium text-amber-300">Nie utworzono</span>
          )}
        </div>

        <span className="text-chrome-600">|</span>

        <div className="flex items-center gap-1.5" data-testid="status-bar-case">
          <span className="text-chrome-400">Wariant pracy:</span>
          {caseId ? (
            <>
              <span className="font-medium text-white">{caseName || 'Bez nazwy'}</span>
              <span className={RESULT_DOT_STYLES[resultStatus]} title={resultStatusLabel} />
            </>
          ) : (
            <span className="italic text-chrome-500">Nie wybrano</span>
          )}
        </div>

        {activeMode === 'RESULT_VIEW' && analysisTypeLabel && (
          <>
            <span className="text-chrome-600">|</span>
            <div className="flex items-center gap-1.5" data-testid="status-bar-analysis">
              <span className="text-chrome-400">Analiza:</span>
              <span className="text-white">{analysisTypeLabel}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {snapshotDisplay && (
          <div className="flex items-center gap-1.5" data-testid="status-bar-snapshot">
            <span className="text-chrome-400">Stan modelu:</span>
            <span className="font-mono text-[10px] text-chrome-300">{snapshotDisplay}</span>
          </div>
        )}

        {validationStatus && (
          <>
            <span className="text-chrome-600">|</span>
            <div className="flex items-center gap-1.5" data-testid="status-bar-validation">
              {validationStatus === 'valid' && (
                <>
                  <span className="ind-dot-ok" />
                  <span className="text-emerald-400">Model prawidlowy</span>
                </>
              )}
              {validationStatus === 'warnings' && (
                <>
                  <span className="ind-dot-warn" />
                  <span className="text-amber-400">
                    {validationWarnings} {validationWarnings === 1 ? 'ostrzezenie' : 'ostrzezenia'}
                  </span>
                </>
              )}
              {validationStatus === 'errors' && (
                <>
                  <span className="ind-dot-error" />
                  <span className="text-red-400">
                    {validationErrors} {validationErrors === 1 ? 'blad' : 'bledow'}
                  </span>
                </>
              )}
            </div>
          </>
        )}

        {caseId && (
          <>
            <span className="text-chrome-600">|</span>
            <div
              className={clsx('flex items-center gap-1.5', RESULT_TEXT_STYLES[resultStatus])}
              data-testid="status-bar-result-status"
            >
              <span>{resultStatusLabel}</span>
            </div>
          </>
        )}

        {networkStats && (networkStats.nodeCount !== undefined || networkStats.branchCount !== undefined) && (
          <>
            <span className="text-chrome-600">|</span>
            <div className="flex items-center gap-3 text-chrome-300" data-testid="status-bar-network-stats">
              {networkStats.nodeCount !== undefined && (
                <span>Wezly: <span className="font-medium text-white">{networkStats.nodeCount}</span></span>
              )}
              {networkStats.branchCount !== undefined && (
                <span>Galezie: <span className="font-medium text-white">{networkStats.branchCount}</span></span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
