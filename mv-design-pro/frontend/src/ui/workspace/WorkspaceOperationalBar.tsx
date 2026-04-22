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
  PENDING: 'Obliczenia oczekują',
  RUNNING: 'Obliczenia w toku',
  DONE: 'Obliczenia zakończone',
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
  const toneClass =
    tone === 'ok'
      ? 'border-scada-neon-green/30 bg-scada-neon-green/10 text-scada-neon-green'
      : tone === 'warn'
        ? 'border-scada-neon-amber/30 bg-scada-neon-amber/10 text-scada-neon-amber'
        : tone === 'error'
          ? 'border-scada-neon-red/30 bg-scada-neon-red/10 text-scada-neon-red'
          : tone === 'accent'
            ? 'border-scada-neon-cyan/30 bg-scada-neon-cyan/10 text-scada-neon-cyan'
            : 'border-scada-border bg-scada-panel text-scada-dim';

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={clsx(
        'flex min-w-[132px] flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-scada-chrome',
        toneClass,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">{label}</span>
      <span className="text-xs font-medium">{value}</span>
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
      className="grid gap-2 border-t border-scada-border bg-scada-bg px-3 py-2 md:grid-cols-3 xl:grid-cols-9"
    >
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
        label="Stan obliczeń"
        value={activeRun ? RUN_STATUS_LABELS[activeRun.status] ?? activeRun.status : 'Brak aktywnych obliczeń'}
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
            titlePl: 'Rejestr założeń i jakości danych',
            sizeClass: 'B',
            openMode: 'replace_right_panel',
            supportsMiniSld: false,
            tabId: 'zalozenia',
            subjectKind: 'analysis_case',
            subjectRef: activeSnapshotId,
          })
        }
        testId="workspace-operational-snapshot"
      />
      <SegmentButton
        label="Zakres obliczeń"
        value={activeCaseName ?? 'Nie wybrano zakresu'}
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
      {activeSurface && (
        <div className="col-span-full px-1 pt-1 text-[11px] text-scada-muted" data-testid="workspace-operational-active-surface">
          Widok: {activeSurface.titlePl}
        </div>
      )}
      {networkStats && (
        <div className="col-span-full px-1 text-[11px] text-scada-muted">
          Model: węzły {networkStats.nodeCount ?? 0} · gałęzie {networkStats.branchCount ?? 0}
        </div>
      )}
    </div>
  );
}

export default WorkspaceOperationalBar;
