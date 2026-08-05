import { useMemo } from 'react';
import { clsx } from 'clsx';

import { selectFieldStationCount, useNetworkBuildDerived } from './networkBuildStore';
import { useSnapshotStore } from '../topology/snapshotStore';
import { GOTOWOSC_STRINGS } from '../../ui2/spaces/gotowosc/strings';

export interface TopContextBarProps {
  className?: string;
  projectName?: string;
  caseName?: string;
  onOpenGlobalSearch?: () => void;
  onOpenCatalogBrowser?: () => void;
  onOpenMassReview?: () => void;
  onOpenProjectMetadata?: () => void;
  onOpenSnapshotHistory?: () => void;
}

const PHASE_STYLES: Record<string, { badge: string; dot: string }> = {
  NO_SOURCE: {
    badge: 'border-rose-500/35 bg-rose-500/12 text-rose-100',
    dot: 'bg-rose-400',
  },
  HAS_SOURCE: {
    badge: 'border-amber-500/35 bg-amber-500/12 text-amber-100',
    dot: 'bg-amber-400',
  },
  HAS_TRUNKS: {
    badge: 'border-yellow-500/35 bg-yellow-500/12 text-yellow-100',
    dot: 'bg-yellow-400',
  },
  HAS_STATIONS: {
    badge: 'border-sky-500/35 bg-sky-500/12 text-sky-100',
    dot: 'bg-sky-400',
  },
  READY: {
    badge: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-100',
    dot: 'bg-emerald-400',
  },
};

function QuickActionButton({
  label,
  title,
  onClick,
  shortcut,
  icon,
}: {
  label: string;
  title: string;
  onClick?: () => void;
  shortcut?: string;
  icon: JSX.Element;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="scada-action-btn min-w-[7.25rem] justify-start px-2.5 py-2"
    >
      <span className="text-scada-text">{icon}</span>
      <span className="truncate">{label}</span>
      {shortcut ? (
        <kbd className="ml-auto rounded border border-scada-border-strong bg-scada-bg px-1.5 py-0.5 text-[10px] font-mono text-scada-muted">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border border-scada-border bg-scada-bg px-2.5 py-1 text-[10px] font-medium text-scada-text">
      <span className="text-scada-muted">{label}</span>
      <span className="ml-1 font-semibold text-slate-100">{value}</span>
    </div>
  );
}

export function TopContextBar({
  className,
  projectName,
  caseName,
  onOpenGlobalSearch,
  onOpenCatalogBrowser,
  onOpenMassReview,
  onOpenProjectMetadata,
  onOpenSnapshotHistory,
}: TopContextBarProps) {
  // DŁUG V12K-318 poz. 4: `blockersByCategory.total === 0` przy gotowości
  // NIEUSTALONEJ znaczy „nie policzono", a nie „policzono i czysto" — pasek
  // wywieszał wtedy zieloną plakietkę. Sygnał rozróżniający z toru U5.
  const { buildPhase, buildPhaseLabel, blockersByCategory, isReady, readinessUstalona } =
    useNetworkBuildDerived();
  const snapshot = useSnapshotStore((state) => state.snapshot);

  const stats = useMemo(() => {
    if (!snapshot) return null;
    return {
      buses: snapshot.buses?.length ?? 0,
      branches: snapshot.branches?.length ?? 0,
      transformers: snapshot.transformers?.length ?? 0,
      generators: snapshot.generators?.length ?? 0,
      stations: selectFieldStationCount(snapshot),
    };
  }, [snapshot]);

  const phaseStyle = PHASE_STYLES[buildPhase] ?? {
    badge: 'border-scada-border-strong bg-scada-surface text-scada-text',
    dot: 'bg-scada-border-strong',
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-3 border-b border-chrome-800',
        'bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.18),transparent_32%),linear-gradient(180deg,#07131c_0%,#08141d_100%)]',
        'px-3 py-2 text-[11px] text-chrome-200 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]',
        className,
      )}
      data-testid="top-context-bar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 rounded-[16px] border border-scada-border bg-[rgba(9,22,33,0.82)] px-3 py-2 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]">
          <div className="scada-shell-eyebrow">Kontekst projektu</div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {projectName ? (
              <button
                type="button"
                onClick={onOpenProjectMetadata}
                className="truncate text-sm font-semibold text-slate-50 transition-colors hover:text-cyan-100"
                title="Edytuj metadane projektu"
              >
                {projectName}
              </button>
            ) : (
              <span className="text-sm font-semibold text-slate-50">Projekt bez nazwy</span>
            )}
            {caseName ? (
              <>
                <span className="text-scada-muted">/</span>
                <span className="truncate text-xs font-medium text-scada-text">{caseName}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={clsx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
              phaseStyle.badge,
            )}
          >
            <span className={clsx('h-2 w-2 rounded-full', phaseStyle.dot)} />
            <span>{buildPhaseLabel}</span>
          </div>

          {!readinessUstalona ? (
            <div
              className="rounded-full border border-slate-500/30 bg-slate-500/10 px-3 py-1 text-[10px] font-medium text-slate-200"
              data-testid="top-context-gotowosc-nieustalona"
            >
              {GOTOWOSC_STRINGS.nieustalonaTytul}
            </div>
          ) : blockersByCategory.total > 0 ? (
            <div className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[10px] font-medium text-rose-100">
              {blockersByCategory.total} zagadnień konfiguracji
              <span className="ml-2 text-rose-200/70">
                T:{blockersByCategory.topologia} K:{blockersByCategory.katalogi} E:{blockersByCategory.eksploatacja}
              </span>
            </div>
          ) : (
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-medium text-emerald-100">
              Układ bez zagadnień konfiguracji
            </div>
          )}

          {stats ? (
            <div className="hidden items-center gap-2 xl:flex">
              <StatPill label="szyny" value={stats.buses} />
              <StatPill label="odcinki SN" value={stats.branches} />
              <StatPill label="stacje" value={stats.stations} />
              <StatPill label="TR" value={stats.transformers} />
              {stats.generators > 0 ? <StatPill label="OZE" value={stats.generators} /> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <QuickActionButton
          label="Szukaj"
          title="Szukaj elementu (Ctrl+K)"
          onClick={onOpenGlobalSearch}
          shortcut="Ctrl+K"
          icon={
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }
        />
        <QuickActionButton
          label="Katalog"
          title="Przeglądarka katalogów"
          onClick={onOpenCatalogBrowser}
          icon={
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          }
        />
        <QuickActionButton
          label="Kontrola"
          title="Kontrola techniczna układu"
          onClick={onOpenMassReview}
          icon={
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5m8.625 0h7.5m-8.625 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
            </svg>
          }
        />
        <QuickActionButton
          label="Historia"
          title="Historia zmian"
          onClick={onOpenSnapshotHistory}
          icon={
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <div className={isReady ? 'scada-chip-ok' : 'scada-chip-warn'}>
          <span className={clsx('h-2 w-2 rounded-full', isReady ? 'bg-emerald-400' : 'bg-amber-400')} />
          <span>{isReady ? 'Układ do analizy' : 'Układ w konfiguracji'}</span>
        </div>
      </div>
    </div>
  );
}
