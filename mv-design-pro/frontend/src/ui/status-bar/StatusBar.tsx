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
  RESULT_VIEW: 'bg-sygnal-ok-tlo text-sygnal-ok-tusz',
};

const RESULT_DOT_STYLES: Record<ResultStatus, string> = {
  NONE: 'ind-dot-none',
  FRESH: 'ind-dot-ok',
  OUTDATED: 'ind-dot-warn',
};

const RESULT_TEXT_STYLES: Record<ResultStatus, string> = {
  NONE: 'text-scada-muted',
  FRESH: 'text-sygnal-ok-tusz',
  OUTDATED: 'text-sygnal-uwaga-tusz',
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
      return 'Wyniki nieuruchomione';
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
    ? 'bg-sygnal-uwaga-tlo border-sygnal-uwaga/50'
    : !caseId
      ? 'bg-scada-panel-raised border-scada-border-strong'
      : 'bg-scada-panel border-scada-border';

  return (
    <div
      data-testid="status-bar"
      className={clsx(
        'flex h-7 items-center justify-between border-t px-4 text-[11px] text-scada-text select-none',
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

        <span className="text-scada-border-strong">|</span>

        <div className="flex items-center gap-1.5" data-testid="status-bar-project">
          <span className="text-scada-muted">Projekt:</span>
          {projectId ? (
            <span className="font-medium text-scada-text">
              {projectName || projectId.substring(0, 8)}
            </span>
          ) : (
            <span className="font-medium text-sygnal-uwaga-tusz">Nie utworzono</span>
          )}
        </div>

        <span className="text-scada-border-strong">|</span>

        <div className="flex items-center gap-1.5" data-testid="status-bar-case">
          <span className="text-scada-muted">Wariant pracy:</span>
          {caseId ? (
            <>
              <span className="font-medium text-scada-text">{caseName || 'Bez nazwy'}</span>
              <span className={RESULT_DOT_STYLES[resultStatus]} title={resultStatusLabel} />
            </>
          ) : (
            <span className="italic text-scada-muted">Nie wybrano</span>
          )}
        </div>

        {activeMode === 'RESULT_VIEW' && analysisTypeLabel && (
          <>
            <span className="text-scada-border-strong">|</span>
            <div className="flex items-center gap-1.5" data-testid="status-bar-analysis">
              <span className="text-scada-muted">Analiza:</span>
              <span className="text-scada-text">{analysisTypeLabel}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {snapshotDisplay && (
          <div className="flex items-center gap-1.5" data-testid="status-bar-snapshot">
            <span className="text-scada-muted">Wersja modelu:</span>
            <span className="font-mono text-[10px] text-scada-muted">{snapshotDisplay}</span>
          </div>
        )}

        {validationStatus && (
          <>
            <span className="text-scada-border-strong">|</span>
            <div className="flex items-center gap-1.5" data-testid="status-bar-validation">
              {validationStatus === 'valid' && (
                <>
                  <span className="ind-dot-ok" />
                  <span className="text-sygnal-ok-tusz">Model prawidlowy</span>
                </>
              )}
              {validationStatus === 'warnings' && (
                <>
                  <span className="ind-dot-warn" />
                  <span className="text-sygnal-uwaga-tusz">
                    {validationWarnings} {validationWarnings === 1 ? 'ostrzezenie' : 'ostrzezenia'}
                  </span>
                </>
              )}
              {validationStatus === 'errors' && (
                <>
                  <span className="ind-dot-error" />
                  <span className="text-sygnal-blokada-tusz">
                    {validationErrors} {validationErrors === 1 ? 'blad' : 'bledow'}
                  </span>
                </>
              )}
            </div>
          </>
        )}

        {caseId && (
          <>
            <span className="text-scada-border-strong">|</span>
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
            <span className="text-scada-border-strong">|</span>
            <div className="flex items-center gap-3 text-scada-muted" data-testid="status-bar-network-stats">
              {networkStats.nodeCount !== undefined && (
                <span>Wezly: <span className="font-medium text-scada-text">{networkStats.nodeCount}</span></span>
              )}
              {networkStats.branchCount !== undefined && (
                <span>Galezie: <span className="font-medium text-scada-text">{networkStats.branchCount}</span></span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
