/**
 * StatusBarV12 — V12 dolny pasek statusu (28px)
 *
 * Zawiera: projekt, aktywny zakres obliczeń, wariant, wersję modelu,
 *          identyfikator ostatniego obliczenia, walidacja, sieć.
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
  useEnmHashChain,
  type EnmHashChain,
} from '../app-state';
import { useStudyCasesStore } from '../study-cases/store';
import type { ResultStatus } from '../types';
import { getAreaDefinition } from '../navigation/areaRegistry';
import { calculationScopeDisplayName, stripTechnicalSuffix } from './publicNames';

function getResultDot(status: ResultStatus) {
  if (status === 'FRESH') return 'text-scada-energized';
  if (status === 'OUTDATED') return 'text-scada-grounded';
  return 'text-scada-muted';
}

function getResultLabel(status: ResultStatus) {
  if (status === 'FRESH') return 'Wyniki aktualne ◉';
  if (status === 'OUTDATED') return 'Wyniki nieaktualne ◯';
  return 'Wyniki do obliczenia';
}

function looksLikeTechnicalId(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(trimmed)
    || /^E2E[_-]/i.test(trimmed)
    || (/^[A-Z0-9_:-]{16,}$/.test(trimmed) && /[_:-]/.test(trimmed))
    || /^[a-z]+[:/_-][a-z0-9/_-]{8,}$/i.test(trimmed)
    || /^[0-9a-f]{16,}$/i.test(trimmed);
}

function projectDisplayName(name: string | null | undefined, id: string | null | undefined): string {
  if (name && !looksLikeTechnicalId(name)) return stripTechnicalSuffix(name);
  if (id) return 'Projekt bez nazwy';
  return '— nie otwarto —';
}

function modelVersionDisplay(snapshotId: string | null): string {
  return snapshotId ? 'aktualna' : '—';
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
  const hashChain = useEnmHashChain();

  const appResultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const studyCaseResultStatus = useStudyCasesStore((s) => s.activeCase?.result_status ?? null);
  const resultStatus: ResultStatus = studyCaseResultStatus ?? appResultStatus;

  const snapshotDisplay = modelVersionDisplay(snapshotId);

  const runDisplay = runId ? 'wykonane' : null;
  const caseDisplayName = calculationScopeDisplayName(caseName, caseId);
  const variantDisplayName = variantName ? stripTechnicalSuffix(variantName) : null;
  const hasExplicitEmptyNetworkStats = Boolean(
    networkStats
      && (networkStats.nodeCount ?? 0) === 0
      && (networkStats.branchCount ?? 0) === 0,
  );

  // Odcisk audytu jest dostępny dla raportu, ale główny pasek nie pokazuje
  // surowych hashy ani identyfikatorów technicznych.
  const hashChipPrimary = hashChain?.semantic ?? hashChain?.input ?? viewHash ?? null;
  const hasAuditFingerprint = Boolean(hashChipPrimary);
  const hashTooltipTitle = buildHashTooltip(hashChain, viewHash);

  const modeLabel = activeMode === 'MODEL_EDIT' ? 'Edycja' : 'Odczyt';
  const areaLabel = getAreaDefinition(activeArea).labelShort;
  const workModeLabel = activeWorkMode === 'TE'
    ? 'Układ'
    : activeWorkMode === 'TW'
      ? 'Wyniki'
      : activeWorkMode === 'TZ'
        ? 'Zabezpieczenia'
        : activeWorkMode === 'TP'
          ? 'Porównanie'
          : activeWorkMode === 'TA'
            ? 'Audyt'
          : 'Operator';
  const showAuditHash = activeWorkMode === 'TA';

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
          Bieżący zestaw: {caseId ? caseDisplayName : 'Nie wybrano'}.
          Zakres obliczeń: {caseId ? caseDisplayName : 'nie wybrano'}.
          Wariant: {variantDisplayName || (caseId ? caseDisplayName : 'nie wybrano')}.
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
              {projectDisplayName(projectName, projectId)}
            </span>
          ) : (
            <span className="text-scada-grounded">— nie otwarto —</span>
          )}
        </div>

        <Separator />

        {/* Zakres obliczeń */}
        <div className="flex items-center gap-1" data-testid="status-case">
          <span className="text-scada-muted">Zakres obliczeń:</span>
          {caseId ? (
            <span className="font-medium text-scada-text">{caseDisplayName}</span>
          ) : (
            <span className="italic text-scada-muted">nie wybrano</span>
          )}
        </div>

        <Separator />

        {/* Wariant */}
        <div className="flex items-center gap-1" data-testid="status-variant">
          <span className="text-scada-muted">Wariant:</span>
          {variantDisplayName ? (
            <span className="font-medium text-scada-text">{variantDisplayName}</span>
          ) : (
            <span className="italic text-scada-muted">nie wybrano</span>
          )}
        </div>

        <Separator />

        {/* Wersja układu */}
        <div className="flex items-center gap-1" data-testid="status-snapshot">
          <span className="text-scada-muted">Wersja układu:</span>
          <span className="font-mono text-scada-text">{snapshotDisplay}</span>
        </div>

        {/* Tryb pracy */}
        <Separator />
        <span data-testid="status-mode" className="text-scada-muted">{modeLabel}</span>
      </div>

      {/* Prawa: wyniki, walidacja, sieć, obliczenia, audyt */}
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

        {/* Ostatnie obliczenie */}
        {runDisplay && (
          <>
            <div className="flex items-center gap-1" data-testid="status-run-id">
              <span className="text-scada-muted">Ostatnie obliczenie:</span>
              <span className="font-mono text-[9px] text-scada-text">{runDisplay}</span>
            </div>
            <Separator />
          </>
        )}

        {/* Audyt — bez pokazywania surowych hashy w głównym UI */}
        {showAuditHash && hasAuditFingerprint && (
          <>
            <div
              className="flex items-center gap-1 cursor-help"
              data-testid="status-hash"
              title={hashTooltipTitle}
              aria-label={hashTooltipTitle}
            >
              <span className="text-scada-muted">Audyt:</span>
              <span className="font-medium text-scada-text">dostępny</span>
            </div>
            <Separator />
          </>
        )}

        {/* Walidacja */}
        {validationStatus && hasExplicitEmptyNetworkStats && (
          <>
            <span data-testid="status-validation" className="text-cyan-200">
              Układ: wybór GPZ
            </span>
            <Separator />
          </>
        )}

        {validationStatus && !hasExplicitEmptyNetworkStats && (
          <>
            {validationStatus === 'valid' && (
              <span data-testid="status-validation" className="text-scada-energized">
                ◉ Układ sprawdzony
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

        {/* Statystyki układu widoczne językiem projektanta. */}
        {networkStats && (networkStats.nodeCount !== undefined || networkStats.branchCount !== undefined) && (
          <div className="flex items-center gap-2" data-testid="status-network">
            {networkStats.nodeCount !== undefined && (
              <span>Szyny: <span className="font-medium text-scada-text">{networkStats.nodeCount}</span></span>
            )}
            {networkStats.branchCount !== undefined && (
              <span>Tory i TR: <span className="font-medium text-scada-text">{networkStats.branchCount}</span></span>
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
 * Złóż tooltip dla chipu audytu bez ujawniania surowych hashy w głównym UI.
 */
function buildHashTooltip(chain: EnmHashChain | null, fallbackViewHash?: string): string {
  if (!chain && !fallbackViewHash) {
    return 'Odcisk audytu zostanie zapisany po synchronizacji wyników.';
  }
  return 'Odcisk audytu jest dostępny w artefaktach technicznych i eksporcie audytowym.';
}
