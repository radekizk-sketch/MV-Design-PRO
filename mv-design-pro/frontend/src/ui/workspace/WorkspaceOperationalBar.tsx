import { clsx } from 'clsx';

import { useActiveMode, useAppStateStore, useResultStatusLabel } from '../app-state';
import { useReadinessLiveStore } from '../engineering-readiness/readinessLiveStore';
import { useNetworkBuildDerived, useNetworkBuildStore } from '../network-build';
import { navigateToVariants } from '../navigation/routes';
import { useExecutionRunsStore } from '../study-cases/runStore';
import {
  ANALYSIS_ROUTE_DEFAULT_TAB,
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
} from './types';

interface WorkspaceOperationalBarProps {
  validationStatus?: 'valid' | 'warnings' | 'errors' | null;
  validationWarnings?: number;
  validationErrors?: number;
  networkStats?: {
    nodeCount?: number;
    branchCount?: number;
  };
}

const RUN_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Obliczenia oczekuja',
  RUNNING: 'Obliczenia trwaja',
  DONE: 'Obliczenia zakonczone',
  FAILED: 'Obliczenia nieudane',
};

function shortId(value: string | null): string {
  if (!value) return 'Brak';
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function SegmentButton({
  label,
  value,
  onClick,
  tone = 'default',
  testId,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  tone?: 'default' | 'ok' | 'warn' | 'error' | 'accent';
  testId?: string;
}) {
  const accentTone =
    tone === 'ok'
      ? {
          panel: 'border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/14',
          dot: 'bg-emerald-400',
          text: 'text-emerald-50',
        }
      : tone === 'warn'
        ? {
            panel: 'border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/14',
            dot: 'bg-amber-400',
            text: 'text-amber-50',
          }
        : tone === 'error'
          ? {
              panel: 'border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/14',
              dot: 'bg-rose-400',
              text: 'text-rose-50',
            }
          : tone === 'accent'
            ? {
                panel: 'border-sky-500/35 bg-sky-500/10 hover:bg-sky-500/14',
                dot: 'bg-sky-400',
                text: 'text-sky-50',
              }
            : {
                panel: 'border-[#243a4c] bg-[#0a1824] hover:bg-[#112433]',
                dot: 'bg-[#7ea7c4]',
                text: 'text-slate-100',
              };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={clsx(
        'flex min-h-[4.5rem] min-w-[132px] flex-col items-start justify-between rounded-[16px] border px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(148,163,184,0.05)] transition-colors',
        accentTone.panel,
      )}
    >
      <div className="flex items-center gap-2">
        <span className={clsx('h-2 w-2 rounded-full', accentTone.dot)} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6f8ca4]">{label}</span>
      </div>
      <span className={clsx('text-sm font-semibold leading-5', accentTone.text)}>{value}</span>
    </button>
  );
}

export function WorkspaceOperationalBar({
  validationStatus,
  validationWarnings = 0,
  validationErrors = 0,
  networkStats,
}: WorkspaceOperationalBarProps) {
  const activeMode = useActiveMode();
  const resultStatusLabel = useResultStatusLabel();
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const activeCaseResultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const { blockersByCategory, isReady } = useNetworkBuildDerived();
  const readinessStatus = useReadinessLiveStore((state) => state.status);
  const bySeverity = useReadinessLiveStore((state) => state.bySeverity);
  const runs = useExecutionRunsStore((state) => state.runs);

  const activeRun = runs.find((run) => run.id === activeRunId) ?? null;
  const blockersCount = blockersByCategory.total;
  const errorCount = bySeverity.BLOCKER + validationErrors;
  const reportReady = Boolean(activeRunId) && isReady;
  const protectionReady = blockersByCategory.eksploatacja === 0 && blockersByCategory.analiza === 0;
  const resultTone =
    activeCaseResultStatus === 'FRESH' ? 'ok' : activeCaseResultStatus === 'OUTDATED' ? 'warn' : 'default';

  return (
    <div
      data-testid="workspace-operational-bar"
      className="border-t border-[#183041] bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.15),transparent_26%),linear-gradient(180deg,#06111a_0%,#07131c_100%)] px-3 py-3"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="scada-shell-eyebrow">Puls operacyjny</div>
          <div className="mt-1 text-sm font-semibold text-slate-50">
            Gotowosc modelu, wyniki i raport w jednym pasku sterowania
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="scada-chip-neutral">
            <span className="text-[#7ea7c4]">Zakres</span>
            <span>{activeCaseName ?? 'Brak aktywnego zakresu'}</span>
          </div>
          {activeSurface ? (
            <div className="scada-chip-accent" data-testid="workspace-operational-active-surface">
              <span className="text-cyan-100/70">Widok:</span>
              <span>{activeSurface.titlePl}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-9">
        <SegmentButton
          label="Gotowosc obliczeniowa"
          value={isReady ? 'Gotowy do analizy' : `${blockersCount} blokad aktywnych`}
          tone={isReady ? 'ok' : blockersCount > 0 ? 'error' : 'warn'}
          onClick={() =>
            openRouteSurface('E-04', {
              titlePl: 'Gotowosc modelu i lista brakow',
              sizeClass: 'B',
              openMode: 'replace_right_panel',
              supportsMiniSld: false,
              tabId: 'braki',
              subjectKind: 'analysis_case',
              subjectRef: activeSnapshotId,
            })
          }
          testId="workspace-operational-computation"
        />
        <SegmentButton
          label="Gotowosc zabezpieczeniowa"
          value={protectionReady ? 'Brak blokad ochrony' : 'Wymaga uzupelnienia danych'}
          tone={protectionReady ? 'ok' : 'warn'}
          onClick={() =>
            openRouteSurface('E-30', {
              titlePl: 'Zgodnosc NC RfG / IRiESD',
              sizeClass: 'C',
              supportsMiniSld: true,
              tabId: 'protection-readiness',
              subjectKind: 'analysis_run',
              subjectRef: activeRunId,
            })
          }
          testId="workspace-operational-protection"
        />
        <SegmentButton
          label="Gotowosc raportowa"
          value={reportReady ? 'Raport moze byc generowany' : 'Brak pelnego kontekstu raportu'}
          tone={reportReady ? 'ok' : 'warn'}
          onClick={() =>
            openRouteSurface(REPORT_SURFACE_SCREEN_CODE, {
              titlePl: 'Generator raportu',
              subjectKind: 'report',
              subjectRef: activeRunId,
            })
          }
          testId="workspace-operational-report"
        />
        <SegmentButton
          label="Stan wynikow"
          value={resultStatusLabel}
          tone={resultTone}
          onClick={() =>
            openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
              tabId: ANALYSIS_ROUTE_DEFAULT_TAB,
              titlePl: 'Poziom analityczny',
              subjectKind: 'analysis_run',
              subjectRef: activeRunId,
            })
          }
          testId="workspace-operational-results"
        />
        <SegmentButton
          label="Stan obliczen"
          value={activeRun ? RUN_STATUS_LABELS[activeRun.status] ?? activeRun.status : 'Brak aktywnych wynikow'}
          tone={activeRun?.status === 'DONE' ? 'ok' : activeRun?.status === 'FAILED' ? 'error' : 'accent'}
          onClick={() => navigateToVariants({ caseId: activeCaseId, snapshotId: activeSnapshotId })}
          testId="workspace-operational-run"
        />
        <SegmentButton
          label="Wersja modelu"
          value={shortId(activeSnapshotId)}
          tone={activeSnapshotId ? 'accent' : 'default'}
          onClick={() =>
            openRouteSurface('E-31', {
              titlePl: 'Rejestr zalozen i jakosci danych',
              sizeClass: 'B',
              openMode: 'replace_right_panel',
              supportsMiniSld: false,
              tabId: 'snapshot',
              subjectKind: 'analysis_case',
              subjectRef: activeSnapshotId,
            })
          }
          testId="workspace-operational-snapshot"
        />
        <SegmentButton
          label="Zakres obliczen"
          value={activeCaseName ?? 'Brak aktywnego zakresu'}
          tone={activeCaseName ? 'accent' : 'default'}
          onClick={() => navigateToVariants({ caseId: activeCaseId, snapshotId: activeSnapshotId })}
          testId="workspace-operational-variant"
        />
        <SegmentButton
          label="Liczba brakow"
          value={`${blockersCount} brakow modelu`}
          tone={blockersCount > 0 ? 'error' : 'ok'}
          onClick={() =>
            openRouteSurface('E-04', {
              titlePl: 'Gotowosc modelu i lista brakow',
              sizeClass: 'B',
              openMode: 'replace_right_panel',
              supportsMiniSld: false,
              tabId: 'naprawy',
              subjectKind: 'analysis_case',
              subjectRef: activeSnapshotId,
            })
          }
          testId="workspace-operational-blockers"
        />
        <SegmentButton
          label="Liczba bledow"
          value={
            errorCount > 0
              ? `${errorCount} bledow i blokad`
              : validationStatus === 'warnings'
                ? `${validationWarnings} ostrzezen`
                : readinessStatus === 'WARN'
                  ? 'Wynik czesciowy lub ostrzezenia'
                  : 'Brak krytycznych bledow'
          }
          tone={errorCount > 0 ? 'error' : validationStatus === 'warnings' || readinessStatus === 'WARN' ? 'warn' : 'ok'}
          onClick={() =>
            openRouteSurface('E-26', {
              titlePl: 'Braki modelu',
              sizeClass: 'B',
              openMode: 'replace_right_panel',
              supportsMiniSld: false,
              tabId: 'errors',
              subjectKind: 'analysis_case',
              subjectRef: activeSnapshotId,
            })
          }
          testId="workspace-operational-errors"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 px-1 text-[11px] text-[#8ea6ba]">
        {networkStats ? (
          <span>
            Statystyka modelu: wezly {networkStats.nodeCount ?? 0}, galezie {networkStats.branchCount ?? 0}.
          </span>
        ) : null}
        {activeMode !== 'RESULT_VIEW' ? (
          <span>
            Rama aplikacji pozostaje wspolna dla edycji, analityki i raportu. Przejscia otwieraja kolejne widoki bez opuszczania glownego okna roboczego.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default WorkspaceOperationalBar;
