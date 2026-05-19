/**
 * WorkflowContextStrip - compact SCADA workflow ribbon from the accepted ui.png shell.
 *
 * Pokazuje:
 *  - Etap budowy sieci (buildPhase) jako kolorowy chip
 *  - Wynik kontroli technicznej jako chip alarmowy
 *  - Statystyki układu (szyny, odcinki SN, pola, stacje) jako mini-filary
 *  - Szybkie akcje (Szukaj Ctrl+K, Katalog, Historia) - tylko ikony z tooltip
 *
 * Cel: jeden gęsty pasek metryk i szybkich akcji bez osobnych kart.
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore } from '../app-state/store';
import { useNetworkBuildDerived } from '../network-build/networkBuildStore';
import { formatLengthKm } from '../shared/formatPolishValue';
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
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const { buildPhase, buildPhaseLabel, blockersByCategory, isReady } = useNetworkBuildDerived();
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const hasCaseInRoute = typeof window !== 'undefined' && /(?:^|[?#&])case=/.test(window.location.hash);

  const stats = useMemo(() => {
    const model = snapshot as Record<string, unknown> | null;
    const count = (key: string) => {
      const value = model?.[key];
      return Array.isArray(value) ? value.length : 0;
    };
    const branches = Array.isArray(model?.branches)
      ? model.branches as Array<Record<string, unknown>>
      : [];
    const substations = Array.isArray(model?.substations)
      ? model.substations as Array<Record<string, unknown>>
      : [];
    const mvLvStationCount = substations.filter((station) =>
      String(station.station_type ?? '').toLowerCase() !== 'gpz',
    ).length;
    let lengthBranchCount = 0;
    const lengthKm = branches.reduce((sum, branch) => {
      const raw = branch.length_km ?? branch.lengthKm ?? branch.length;
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        return sum;
      }
      lengthBranchCount += 1;
      return sum + value;
    }, 0);
    return {
      buses: count('buses'),
      branches: count('branches'),
      stations: mvLvStationCount,
      sources: count('sources'),
      transformers: count('transformers'),
      loads: count('loads'),
      bays: count('bays'),
      generators: count('generators'),
      lengthKm,
      lengthBranchCount,
    };
  }, [snapshot]);

  const hasModel = Boolean(snapshot);
  const hasTopologyElements = stats.sources + stats.buses + stats.branches + stats.bays + stats.stations + stats.transformers + stats.generators + stats.loads > 0;
  const hasElectricalRoot = stats.sources > 0 || stats.stations > 0;
  const structuralBlockers = hasModel && hasTopologyElements
    ? [
      stats.sources === 0 && stats.stations === 0,
      stats.buses === 0,
      hasElectricalRoot && stats.buses > 0 && stats.lengthBranchCount === 0,
      hasElectricalRoot && stats.buses > 0 && stats.transformers === 0,
    ].filter(Boolean).length
    : 0;
  const rawBlockerCounts = blockersByCategory ?? { topologia: 0, katalogi: 0, eksploatacja: 0, analiza: 0, total: 0 };
  const blockerCounts = hasTopologyElements
    ? {
      ...rawBlockerCounts,
      topologia: rawBlockerCounts.topologia + structuralBlockers,
      total: rawBlockerCounts.total + structuralBlockers,
    }
    : { topologia: 0, katalogi: 0, eksploatacja: 0, analiza: 0, total: 0 };
  const isModelReady = hasTopologyElements && isReady && structuralBlockers === 0;
  const needsSnRun = hasTopologyElements && hasElectricalRoot && stats.lengthBranchCount === 0;
  const needsFirstStation = hasTopologyElements && stats.lengthBranchCount > 0 && stats.stations === 0;
  const visualBuildPhase = isModelReady ? buildPhase : hasElectricalRoot ? 'HAS_SOURCE' : 'NO_SOURCE';
  const chipClass = hasModel
    ? PHASE_CHIP[visualBuildPhase] ?? 'border-scada-border bg-scada-bg text-scada-text'
    : 'border-scada-border bg-scada-bg text-scada-muted';
  const dotClass = hasModel ? PHASE_DOT[visualBuildPhase] ?? 'bg-scada-muted' : 'bg-scada-muted';
  const calculationControlLabel = hasModel
    ? !hasTopologyElements
      ? 'wybór GPZ'
      : needsSnRun
      ? 'wyprowadź ciąg SN'
      : needsFirstStation
      ? 'osadź stację'
      : isModelReady
      ? 'do uruchomienia'
      : 'konfiguracja układu'
    : '—';
  const calculationControlCaption = hasModel && (!hasTopologyElements || needsSnRun || needsFirstStation) ? 'Następny krok:' : 'Obliczenia:';
  const phaseTitle = hasModel
    ? !hasTopologyElements
      ? 'Pierwszy krok: wybierz wariant GPZ z katalogu i wyprowadź pola SN'
      : needsSnRun
      ? 'Następny krok: wyprowadź magistralę SN z pola GPZ'
      : needsFirstStation
      ? 'Następny krok: osadź stację SN/nN na odcinku'
      : isModelReady
      ? `Faza budowy sieci: ${buildPhaseLabel}`
      : 'Faza budowy sieci: skonfiguruj układ przed analizą'
    : 'Rozpocznij projekt';
  const phaseLabel = hasModel ? (!hasTopologyElements ? 'GPZ' : isModelReady ? 'ANALIZA' : 'BUDOWA') : 'START';
  const blockerLabel = hasModel ? (hasTopologyElements ? String(blockerCounts.total) : 'GPZ') : '—';
  const display = {
    blockers: hasTopologyElements ? blockerCounts.total : 0,
    buses: hasModel ? stats.buses : '—',
    segments: hasModel ? stats.branches : '—',
    bays: hasModel ? stats.bays || stats.branches : '—',
    stations: hasModel ? stats.stations : '—',
    lengthKm: hasModel
      ? stats.lengthBranchCount > 0
        ? formatLengthKm(stats.lengthKm, { decimals: 2 })
        : 'nie wyznaczono'
      : '—',
    transformers: hasModel ? stats.transformers : '—',
    loads: hasModel ? stats.loads : '—',
  };

  if (!hasModel) {
    const pendingKnownModel = Boolean(activeProjectId || activeCaseId || hasCaseInRoute);
    return (
      <div
        data-testid="workflow-context-strip"
        className="flex h-[48px] shrink-0 items-center border-b border-scada-border bg-[#0c1822] px-3"
      >
        {pendingKnownModel ? (
          <div
            data-testid="wcs-model-loading"
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-emerald-500/35 bg-emerald-500/10 font-mono text-[12px] font-bold text-emerald-200">
              SN
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-scada-text">
                Ładowanie układu sieci
              </div>
              <div className="truncate text-[10px] text-scada-muted">
                Pobieram GPZ, odcinki, stacje, układy PV/BESS/FW i wyniki dla aktywnego zakresu.
              </div>
            </div>
          </div>
        ) : (
          <div
            data-testid="wcs-empty-model-start"
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-cyan-500/45 bg-cyan-500/12 font-mono text-[12px] font-bold text-cyan-200">
              1
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-scada-text">
                Start projektu: zakres obliczeń i GPZ
              </div>
              <div className="truncate text-[10px] text-scada-muted">
                Kolejność pracy: zakres obliczeń, GPZ, magistrala SN, stacje, PV/FW/BESS, obliczenia i dowody.
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
        )}

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
            ? hasTopologyElements
              ? `Kontrola techniczna układu: topologia=${blockerCounts.topologia} katalogi=${blockerCounts.katalogi} eksploatacja=${blockerCounts.eksploatacja}`
              : 'Pierwszy układ sieci: wybór wariantu GPZ'
            : 'Rozpocznij projekt'}
        >
          <span className="text-[11px] text-scada-muted">{hasTopologyElements ? 'Kontrola:' : 'Układ:'}</span>
          <span className={clsx(
            'grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-bold',
            !hasModel
              ? 'bg-scada-bg text-scada-muted ring-1 ring-scada-border'
              : !hasTopologyElements
                ? 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/35'
                : display.blockers > 0
                  ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/45'
                  : 'bg-emerald-500/15 text-emerald-300',
          )}>
            {blockerLabel}
          </span>
        </div>

        <div className="flex h-8 items-center gap-2 border-r border-scada-border px-4" data-testid="wcs-model-readiness">
          <span className="text-[11px] text-scada-muted">{calculationControlCaption}</span>
          <span className={clsx('font-mono text-[11px] font-semibold', isModelReady ? 'text-emerald-300' : 'text-amber-300')}>
            {calculationControlLabel}
          </span>
        </div>

        <Metric label="Szyny" value={display.buses} />
        <Metric label="Odcinki SN" value={display.segments} />
        <Metric label="Pola SN" value={display.bays} />
        <Metric label="Stacje" value={display.stations} />
        <Metric label="Długość" value={display.lengthKm} />
        <Metric label="TR" value={display.transformers} />
        <Metric label="Odbiory nN" value={display.loads} />
      </div>

      <WorkflowActions
        onOpenGlobalSearch={onOpenGlobalSearch}
        onOpenCatalogBrowser={onOpenCatalogBrowser}
        onOpenMassReview={onOpenMassReview}
        onOpenProjectMetadata={onOpenProjectMetadata}
        onOpenSnapshotHistory={onOpenSnapshotHistory}
        blockerBadge={hasTopologyElements && display.blockers > 0 ? display.blockers : undefined}
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
      <WorkflowAction testId="wcs-mass-review" label="Kontrola" title="Kontrola techniczna układu" onClick={onOpenMassReview} icon={<IconReview />} badge={blockerBadge} />
      <WorkflowAction testId="wcs-project-metadata" label="Metadane" title="Metadane projektu" onClick={onOpenProjectMetadata} icon={<IconMetadata />} />
    <WorkflowAction testId="wcs-history" label="Historia" title="Historia wersji układu" onClick={onOpenSnapshotHistory} icon={<IconHistory />} />
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
