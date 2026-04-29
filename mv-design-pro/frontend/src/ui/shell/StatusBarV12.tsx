/**
 * StatusBarV12 — V12 dolny pasek statusu (28px)
 *
 * Zawiera: projekt, aktywny przypadek, wariant, migawka,
 *          run_id, hash widoku, gotowość modelu, walidacja, sieć.
 */

import { clsx } from 'clsx';
import {
  useActiveCaseId,
  useActiveCaseName,
  useActiveMode,
  useActiveProjectId,
  useActiveRunId,
  useActiveSnapshotId,
  useAppStateStore,
} from '../app-state';
import { useStudyCasesStore } from '../study-cases/store';
import type { ResultStatus } from '../types';
import { getAreaDefinition } from '../navigation/areaRegistry';

function getResultDot(status: ResultStatus) {
  if (status === 'FRESH') return 'text-scada-energized';
  if (status === 'OUTDATED') return 'text-scada-grounded';
  return 'text-scada-muted';
}

function getResultLabel(status: ResultStatus) {
  if (status === 'FRESH') return 'Wyniki aktualne ◉';
  if (status === 'OUTDATED') return 'Wyniki nieaktualne ◯';
  return 'Brak wyników';
}

interface StatusBarV12Props {
  validationStatus?: 'valid' | 'warnings' | 'errors' | null;
  validationWarnings?: number;
  validationErrors?: number;
  networkStats?: { nodeCount?: number; branchCount?: number };
  viewHash?: string;
  className?: string;
}

export function StatusBarV12({
  validationStatus,
  validationWarnings = 0,
  validationErrors = 0,
  networkStats,
  viewHash,
  className,
}: StatusBarV12Props) {
  const activeMode = useActiveMode();
  const projectId = useActiveProjectId();
  const projectName = useAppStateStore((s) => s.activeProjectName);
  const caseId = useActiveCaseId();
  const caseName = useActiveCaseName();
  const snapshotId = useActiveSnapshotId();
  const runId = useActiveRunId();
  const activeWorkMode = useAppStateStore((s) => s.activeWorkMode);
  const activeArea = useAppStateStore((s) => s.activeArea);
  const variantName = useAppStateStore((s) => s.activeVariantName);

  const appResultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const studyCaseResultStatus = useStudyCasesStore((s) => s.activeCase?.result_status ?? null);
  const resultStatus: ResultStatus = studyCaseResultStatus ?? appResultStatus;

  const snapshotDisplay = snapshotId
    ? snapshotId.length > 10 ? `${snapshotId.slice(0, 10)}…` : snapshotId
    : '—';

  const runDisplay = runId
    ? runId.length > 8 ? runId.slice(0, 8) : runId
    : null;

  const hashDisplay = viewHash
    ? viewHash.length > 10 ? viewHash.slice(0, 10) : viewHash
    : null;

  const modeLabel = activeMode === 'MODEL_EDIT' ? 'Edycja' : 'Odczyt';
  const areaLabel = getAreaDefinition(activeArea).labelShort;
  const workModeLabel = activeWorkMode === 'TE'
    ? 'Model'
    : activeWorkMode === 'TW'
      ? 'Wyniki'
      : activeWorkMode === 'TZ'
        ? 'Zabezpieczenia'
        : activeWorkMode === 'TP'
          ? 'Porównanie'
          : activeWorkMode === 'TA'
            ? 'Audyt'
            : 'Operator';

  return (
    <div
      data-testid="status-bar-v12"
      aria-label="Pasek statusu aplikacji"
      className={clsx(
        'flex h-7 shrink-0 items-center justify-between border-t border-scada-border',
        'bg-scada-surface px-3 text-[10px] text-scada-muted select-none',
        className,
      )}
    >
      {/* Lewa: kontekst projektu i tryb */}
      <div className="flex items-center gap-2 overflow-hidden">
        {/* Obszar + Tryb */}
        <span
          data-testid="status-area-mode"
          className="rounded bg-scada-active px-1.5 py-0.5 font-bold text-scada-sn"
        >
          {areaLabel} / {workModeLabel}
        </span>

        <Separator />

        {/* Projekt */}
        <div className="flex items-center gap-1" data-testid="status-project">
          <span className="text-scada-muted">Projekt:</span>
          {projectId ? (
            <span className="font-medium text-scada-text truncate max-w-[140px]">
              {projectName || projectId.slice(0, 8)}
            </span>
          ) : (
            <span className="text-scada-grounded">— nie otwarto —</span>
          )}
        </div>

        <Separator />

        {/* Przypadek */}
        <div className="flex items-center gap-1" data-testid="status-case">
          <span className="text-scada-muted">Przypadek:</span>
          {caseId ? (
            <span className="font-medium text-scada-text">{caseName || 'Bez nazwy'}</span>
          ) : (
            <span className="italic text-scada-muted">nie wybrano</span>
          )}
        </div>

        <Separator />

        {/* Wariant */}
        <div className="flex items-center gap-1" data-testid="status-variant">
          <span className="text-scada-muted">Wariant:</span>
          {variantName ? (
            <span className="font-medium text-scada-text">{variantName}</span>
          ) : (
            <span className="italic text-scada-muted">nie wybrano</span>
          )}
        </div>

        <Separator />

        {/* Migawka */}
        <div className="flex items-center gap-1" data-testid="status-snapshot">
          <span className="text-scada-muted">Migawka:</span>
          <span className="font-mono text-scada-text">{snapshotDisplay}</span>
        </div>

        {/* Tryb legacy */}
        <Separator />
        <span data-testid="status-mode" className="text-scada-muted">{modeLabel}</span>
      </div>

      {/* Prawa: wyniki, walidacja, sieć, run_id, hash */}
      <div className="flex items-center gap-2">
        {/* Status wyników */}
        {caseId && (
          <>
            <span
              data-testid="status-result"
              className={clsx('font-medium', getResultDot(resultStatus))}
            >
              {getResultLabel(resultStatus)}
            </span>
            <Separator />
          </>
        )}

        {/* Run ID */}
        {runDisplay && (
          <>
            <div className="flex items-center gap-1" data-testid="status-run-id">
              <span className="text-scada-muted">Uruchomienie:</span>
              <span className="font-mono text-[9px] text-scada-text">{runDisplay}</span>
            </div>
            <Separator />
          </>
        )}

        {/* Hash widoku */}
        {hashDisplay && (
          <>
            <div className="flex items-center gap-1" data-testid="status-hash">
              <span className="text-scada-muted">hash:</span>
              <span className="font-mono text-[9px] text-scada-muted">{hashDisplay}</span>
            </div>
            <Separator />
          </>
        )}

        {/* Walidacja */}
        {validationStatus && (
          <>
            {validationStatus === 'valid' && (
              <span data-testid="status-validation" className="text-scada-energized">
                ◉ Model prawidłowy
              </span>
            )}
            {validationStatus === 'warnings' && (
              <span data-testid="status-validation" className="text-scada-grounded">
                ▲ {validationWarnings} {validationWarnings === 1 ? 'ostrzeżenie' : 'ostrzeżenia'}
              </span>
            )}
            {validationStatus === 'errors' && (
              <span data-testid="status-validation" className="text-scada-alarm">
                ✕ {validationErrors} {validationErrors === 1 ? 'błąd' : 'błędów'}
              </span>
            )}
            <Separator />
          </>
        )}

        {/* Statystyki sieci */}
        {networkStats && (networkStats.nodeCount !== undefined || networkStats.branchCount !== undefined) && (
          <div className="flex items-center gap-2" data-testid="status-network">
            {networkStats.nodeCount !== undefined && (
              <span>Węzły: <span className="font-medium text-scada-text">{networkStats.nodeCount}</span></span>
            )}
            {networkStats.branchCount !== undefined && (
              <span>Gałęzie: <span className="font-medium text-scada-text">{networkStats.branchCount}</span></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Separator() {
  return <span className="text-scada-border" aria-hidden="true">|</span>;
}
