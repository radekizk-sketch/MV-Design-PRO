/**
 * StatusBarV12 — V12 dolny pasek statusu (28px)
 *
 * Zawiera: projekt, cel obliczeń, stan projektu,
 *          run_id, hash widoku, gotowość modelu, walidacja, sieć.
 */

import { clsx } from 'clsx';
import {
  useActiveCaseId,
  useActiveCaseName,
  useActiveMode,
  useActiveProjectId,
  useActiveRunId,
  useAppStateStore,
  useEnmHashChain,
  shortHash,
  type EnmHashChain,
} from '../app-state';
import { useStudyCasesStore } from '../study-cases/store';
import type { ResultStatus } from '../types';

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
  const runId = useActiveRunId();
  const activeWorkMode = useAppStateStore((s) => s.activeWorkMode);
  const variantName = useAppStateStore((s) => s.activeVariantName);
  const hashChain = useEnmHashChain();

  const appResultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const studyCaseResultStatus = useStudyCasesStore((s) => s.activeCase?.result_status ?? null);
  const resultStatus: ResultStatus = studyCaseResultStatus ?? appResultStatus;

  const runDisplay = runId
    ? runId.length > 8 ? runId.slice(0, 8) : runId
    : null;

  // Hash audytu — preferuj chain V12S-010 (semantic). Fallback do viewHash gdy
  // backend jeszcze nie populuje pól w storze.
  const hashChipPrimary = hashChain?.semantic ?? hashChain?.input ?? viewHash ?? null;
  const hashDisplay = hashChipPrimary
    ? hashChipPrimary.length > 10 ? hashChipPrimary.slice(0, 10) : hashChipPrimary
    : null;
  const hashTooltipTitle = buildHashTooltip(hashChain, viewHash);

  const modeLabel = activeMode === 'MODEL_EDIT' ? 'Edycja' : 'Odczyt';
  const areaLabel = 'Model';
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
      <div className="flex items-center gap-2 overflow-hidden" data-testid="active-case-bar">
        <span className="sr-only">
          Bieżący zestaw: {caseId ? caseName || '(bez nazwy)' : 'Nie wybrano'}.
          Obliczenia: {caseId ? caseName || '(bez nazwy)' : 'nie wybrano'}.
          Stan projektu: {variantName || (caseId ? caseName || '(bez nazwy)' : 'nie wybrano')}.
        </span>
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

        {/* Cel obliczeń */}
        <div className="flex items-center gap-1" data-testid="status-case">
          <span className="text-scada-muted">Obliczenia:</span>
          {caseId ? (
            <span className="font-medium text-scada-text">{caseName || 'Bez nazwy'}</span>
          ) : (
            <span className="italic text-scada-muted">nie wybrano</span>
          )}
        </div>

        <Separator />

        {/* Stan projektu */}
        <div className="flex items-center gap-1" data-testid="status-variant">
          <span className="text-scada-muted">Stan:</span>
          {variantName ? (
            <span className="font-medium text-scada-text">{variantName}</span>
          ) : (
            <span className="italic text-scada-muted">nie wybrano</span>
          )}
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

        {/* Hash audytu — V12S-010: jeden chip, tooltip rozwija 5 hashy */}
        {hashDisplay && (
          <>
            <div
              className="flex items-center gap-1 cursor-help"
              data-testid="status-hash"
              title={hashTooltipTitle}
              aria-label={hashTooltipTitle}
            >
              <span className="text-scada-muted">Hash audytu:</span>
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

/**
 * Złóż wieloliniowy tooltip dla chipu „Hash audytu".
 * Pokazuje 5 hashy V12S-010 (semantic / input / case / variant / switching).
 * Każdy hash skrócony do 8 znaków; '—' gdy backend nie dostarczył wartości.
 */
function buildHashTooltip(chain: EnmHashChain | null, fallbackViewHash?: string): string {
  if (!chain && !fallbackViewHash) {
    return 'Hash audytu w toku — backend nie dostarczył pól.';
  }
  const lines = [
    'Hash audytu (V12S-010, kliknij, aby skopiować pełny):',
    `  Semantyka:   ${shortHash(chain?.semantic)}    topologia + role + pasma + katalog`,
    `  Wejścia:     ${shortHash(chain?.input)}    R/X/B, ratingi, długości, sk3`,
    `  Obliczenia:  ${shortHash(chain?.case)}    parametry celu obliczeń`,
    `  Stan:        ${shortHash(chain?.variant)}    stan projektu`,
    `  Łączniki:    ${shortHash(chain?.switching)}    stany open/closed`,
  ];
  if (!chain && fallbackViewHash) {
    lines.push('', `  Hash widoku: ${shortHash(fallbackViewHash)} (legacy)`);
  }
  return lines.join('\n');
}
