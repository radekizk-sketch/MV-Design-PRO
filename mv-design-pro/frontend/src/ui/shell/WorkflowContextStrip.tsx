/**
 * WorkflowContextStrip — compact SCADA workflow ribbon from the accepted ui.png shell.
 *
 * Pokazuje:
 *  - Fazę budowy sieci (buildPhase) jako kolorowy chip
 *  - Liczbę blokad (blockersByCategory.total) jako chip alarmowy
 *  - Statystyki sieci (szyny, gałęzie, stacje) jako mini-filary
 *  - Szybkie akcje (Szukaj Ctrl+K, Katalog, Historia) — tylko ikony z tooltip
 *
 * Cel: jeden gęsty pasek metryk i szybkich akcji bez osobnych kart.
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore } from '../app-state/store';
import { useNetworkBuildDerived } from '../network-build/networkBuildStore';
import { useSnapshotStore } from '../topology/snapshotStore';

const PHASE_CHIP: Record<string, string> = {
  NO_SOURCE:   'border-rose-500/40 bg-rose-500/12 text-rose-100',
  HAS_SOURCE:  'border-amber-500/40 bg-amber-500/12 text-amber-100',
  HAS_TRUNKS:  'border-yellow-500/40 bg-yellow-500/12 text-yellow-100',
  HAS_STATIONS:'border-sky-500/40 bg-sky-500/12 text-sky-100',
  READY:       'border-emerald-500/40 bg-emerald-500/12 text-emerald-100',
};

const PHASE_DOT: Record<string, string> = {
  NO_SOURCE:   'bg-rose-400',
  HAS_SOURCE:  'bg-amber-400',
  HAS_TRUNKS:  'bg-yellow-400',
  HAS_STATIONS:'bg-sky-400',
  READY:       'bg-emerald-400',
};

function IconSearch() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconCatalog() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l2 2 4-5.5M7.5 4.75h9A1.75 1.75 0 0118.25 6.5v11A1.75 1.75 0 0116.5 19.25h-9A1.75 1.75 0 015.75 17.5v-11A1.75 1.75 0 017.5 4.75z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.75 7.75h6.5" />
    </svg>
  );
}

function IconMetadata() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25h.01M11 11h1.25v5.25M5.75 4.75h12.5v14.5H5.75z" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export interface WorkflowContextStripProps {
  onOpenGlobalSearch?: () => void;
  onOpenCatalogBrowser?: () => void;
  onOpenMassReview?: () => void;
  onOpenProjectMetadata?: () => void;
  onOpenSnapshotHistory?: () => void;
}

export function WorkflowContextStrip({
  onOpenGlobalSearch,
  onOpenCatalogBrowser,
  onOpenMassReview,
  onOpenProjectMetadata,
  onOpenSnapshotHistory,
}: WorkflowContextStripProps) {
  const setActiveArea = useAppStateStore((state) => state.setActiveArea);
  const { buildPhase, buildPhaseLabel, blockersByCategory, isReady } = useNetworkBuildDerived();
  const snapshot = useSnapshotStore((state) => state.snapshot);

  const stats = useMemo(() => {
    const model = snapshot as Record<string, unknown> | null;
    const count = (key: string) => {
      const value = model?.[key];
      return Array.isArray(value) ? value.length : 0;
    };
    const branches = Array.isArray(model?.branches)
      ? model.branches as Array<Record<string, unknown>>
      : [];
    const lengthKm = branches.reduce((sum, branch) => {
      const raw = branch.length_km ?? branch.lengthKm ?? branch.length;
      const value = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    return {
      buses: count('buses'),
      branches: count('branches'),
      stations: count('substations'),
      transformers: count('transformers'),
      loads: count('loads'),
      bays: count('bays'),
      generators: count('generators'),
      lengthKm,
    };
  }, [snapshot]);

  const hasModel = Boolean(snapshot);
  const blockerCounts = blockersByCategory ?? { topologia: 0, katalogi: 0, eksploatacja: 0, analiza: 0, total: 0 };
  const chipClass = hasModel
    ? PHASE_CHIP[buildPhase] ?? 'border-scada-border bg-scada-bg text-scada-text'
    : 'border-scada-border bg-scada-bg text-scada-muted';
  const dotClass = hasModel ? PHASE_DOT[buildPhase] ?? 'bg-scada-muted' : 'bg-scada-muted';
  const readinessPercent = !hasModel
    ? 0
    : isReady
      ? 100
      : Math.max(0, Math.min(99, 100 - blockerCounts.total * 12));
  const readinessLabel = hasModel ? `${readinessPercent}%` : '—';
  const phaseTitle = hasModel ? `Faza budowy modelu: ${buildPhaseLabel}` : 'Brak aktywnego modelu';
  const phaseLabel = hasModel ? (isReady ? 'GOTOWE' : 'BUDOWA') : 'BRAK MODELU';
  const blockerLabel = hasModel ? String(blockerCounts.total) : '—';
  const elementCount = stats.buses
    + stats.branches
    + stats.stations
    + stats.transformers
    + stats.loads
    + stats.generators;
  const display = {
    blockers: blockerCounts.total,
    elementCount: hasModel ? elementCount : '—',
    bays: hasModel ? stats.bays || stats.branches : '—',
    stations: hasModel ? stats.stations : '—',
    lengthKm: hasModel ? `${stats.lengthKm.toFixed(2)} km` : '—',
    transformers: hasModel ? stats.transformers : '—',
    loads: hasModel ? stats.loads : '—',
  };

  if (!hasModel) {
    return (
      <div
        data-testid="workflow-context-strip"
        className="flex h-[48px] shrink-0 items-center border-b border-scada-border bg-[#0c1822] px-3"
      >
        <div
          data-testid="wcs-empty-model-start"
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-cyan-500/45 bg-cyan-500/12 font-mono text-[12px] font-bold text-cyan-200">
            1
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-scada-text">
              Start projektu: przypadek obliczeniowy i GPZ
            </div>
            <div className="truncate text-[10px] text-scada-muted">
              Kolejność pracy: przypadek, GPZ, magistrala SN, stacje, PV/FW/BESS, obliczenia i dowód.
            </div>
          </div>
          <button
            type="button"
            data-testid="wcs-start-model"
            onClick={() => setActiveArea('MODEL_SIECI')}
            className="ml-2 h-8 shrink-0 rounded-sm border border-cyan-500/60 bg-cyan-500/15 px-3 text-[11px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25"
          >
            Przejdź do budowy GPZ
          </button>
        </div>

        <WorkflowActions
          onOpenGlobalSearch={onOpenGlobalSearch}
          onOpenCatalogBrowser={onOpenCatalogBrowser}
          onOpenMassReview={onOpenMassReview}
          onOpenProjectMetadata={onOpenProjectMetadata}
          onOpenSnapshotHistory={onOpenSnapshotHistory}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="workflow-context-strip"
      className="flex h-[48px] shrink-0 items-center border-b border-scada-border bg-[#0c1822] px-3"
    >
      <div className="flex min-w-0 flex-1 items-center">
        <div
          className="flex h-8 items-center gap-2 border-r border-scada-border pr-4"
          data-testid="workflow-build-phase"
          title={phaseTitle}
        >
          <span className="text-[11px] text-scada-muted">Faza projektu:</span>
          <span className={clsx('rounded-sm border px-2 py-1 text-[10px] font-bold uppercase', chipClass)}>
            <span className={clsx('mr-1.5 inline-block h-1.5 w-1.5 rounded-full', dotClass)} />
            {phaseLabel}
          </span>
        </div>

        <div
          className="flex h-8 items-center gap-2 border-r border-scada-border px-4"
          data-testid={display.blockers > 0 ? 'workflow-blockers' : 'workflow-no-blockers'}
          title={hasModel
            ? `Blokady: T=${blockerCounts.topologia} K=${blockerCounts.katalogi} E=${blockerCounts.eksploatacja}`
            : 'Brak aktywnego modelu'}
        >
          <span className="text-[11px] text-scada-muted">Blokery:</span>
          <span className={clsx(
            'grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-bold',
            !hasModel
              ? 'bg-scada-bg text-scada-muted ring-1 ring-scada-border'
              : display.blockers > 0
              ? 'bg-rose-600 text-white'
              : 'bg-emerald-500/15 text-emerald-300',
          )}>
            {blockerLabel}
          </span>
        </div>

        <div className="flex h-8 items-center gap-2 border-r border-scada-border px-4" data-testid="wcs-model-readiness">
          <span className="text-[11px] text-scada-muted">Gotowość:</span>
          <span className="font-mono text-[11px] font-semibold text-scada-text">{readinessLabel}</span>
          <span className="h-1.5 w-9 overflow-hidden rounded-full bg-scada-bg">
            <span
              className={clsx('block h-full', isReady ? 'bg-emerald-400' : 'bg-amber-400')}
              style={{ width: `${readinessPercent}%` }}
            />
          </span>
        </div>

        <Metric label="Elementy" value={display.elementCount} />
        <Metric label="Pola SN" value={display.bays} />
        <Metric label="Stacje SN/nN" value={display.stations} />
        <Metric label="Długość SN" value={display.lengthKm} />
        <Metric label="Transformatory" value={display.transformers} />
        <Metric label="Odbiory nN" value={display.loads} />
      </div>

      <WorkflowActions
        onOpenGlobalSearch={onOpenGlobalSearch}
        onOpenCatalogBrowser={onOpenCatalogBrowser}
        onOpenMassReview={onOpenMassReview}
        onOpenProjectMetadata={onOpenProjectMetadata}
        onOpenSnapshotHistory={onOpenSnapshotHistory}
        blockerBadge={display.blockers > 0 ? display.blockers : undefined}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex h-8 items-center gap-1.5 border-r border-scada-border px-3">
      <span className="whitespace-nowrap text-[11px] text-scada-muted">{label}:</span>
      <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-scada-text">{value}</span>
    </div>
  );
}

function WorkflowActions({
  onOpenGlobalSearch,
  onOpenCatalogBrowser,
  onOpenMassReview,
  onOpenProjectMetadata,
  onOpenSnapshotHistory,
  blockerBadge,
}: WorkflowContextStripProps & { blockerBadge?: number }) {
  return (
    <div className="flex h-full shrink-0 items-center gap-7 border-l border-scada-border pl-5 pr-1">
      <WorkflowAction testId="wcs-search" label="Szukaj" title="Szukaj elementu (Ctrl+K)" onClick={onOpenGlobalSearch} icon={<IconSearch />} />
      <WorkflowAction testId="wcs-catalog" label="Katalog" title="Katalog techniczny" onClick={onOpenCatalogBrowser} icon={<IconCatalog />} />
      <WorkflowAction testId="wcs-mass-review" label="Przeglądy" title="Przeglądy masowe" onClick={onOpenMassReview} icon={<IconReview />} badge={blockerBadge} />
      <WorkflowAction testId="wcs-project-metadata" label="Metadane" title="Metadane projektu" onClick={onOpenProjectMetadata} icon={<IconMetadata />} />
      <WorkflowAction testId="wcs-history" label="Historia" title="Historia migawek" onClick={onOpenSnapshotHistory} icon={<IconHistory />} />
    </div>
  );
}

function WorkflowAction({
  testId,
  label,
  title,
  icon,
  onClick,
  badge,
}: {
  testId: string;
  label: string;
  title: string;
  icon: JSX.Element;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="relative flex h-10 min-w-10 flex-col items-center justify-center gap-0.5 text-scada-muted transition-colors hover:text-scada-text"
      data-testid={testId}
    >
      <span className="text-scada-muted">{icon}</span>
      <span className="text-[10px] leading-none">{label}</span>
      {badge !== undefined && (
        <span className="absolute -right-1 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-[#111827]">
          {badge}
        </span>
      )}
    </button>
  );
}
