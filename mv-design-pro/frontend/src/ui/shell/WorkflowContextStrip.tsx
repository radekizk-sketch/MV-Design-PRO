/**
 * WorkflowContextStrip — kompaktowy pasek metryk modelu (36px).
 *
 * Pokazuje:
 *  - Fazę budowy sieci (buildPhase) jako kolorowy chip
 *  - Liczbę blokad (blockersByCategory.total) jako chip alarmowy
 *  - Gotowość modelu do obliczeń (%)
 *  - Statystyki sieci (elementy, pola, stacje, długość, transformatory, odbiory)
 *
 * Akcje (Szukaj, Katalog, Metadane, Historia) dostępne przez:
 *  - Ctrl+K → Szukaj elementu ENM
 *  - Ctrl+Shift+P → Paleta komend (wszystkie ekrany + akcje)
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore } from '../app-state/store';
import { useNetworkBuildDerived } from '../network-build/networkBuildStore';
import { useSnapshotStore } from '../topology/snapshotStore';

const PHASE_CHIP: Readonly<Record<string, string>> = {
  NO_SOURCE:   'border-rose-500/40 bg-rose-500/12 text-rose-100',
  HAS_SOURCE:  'border-amber-500/40 bg-amber-500/12 text-amber-100',
  HAS_TRUNKS:  'border-yellow-500/40 bg-yellow-500/12 text-yellow-100',
  HAS_STATIONS:'border-sky-500/40 bg-sky-500/12 text-sky-100',
  READY:       'border-emerald-500/40 bg-emerald-500/12 text-emerald-100',
};

const PHASE_DOT: Readonly<Record<string, string>> = {
  NO_SOURCE:   'bg-rose-400',
  HAS_SOURCE:  'bg-amber-400',
  HAS_TRUNKS:  'bg-yellow-400',
  HAS_STATIONS:'bg-sky-400',
  READY:       'bg-emerald-400',
};

export function WorkflowContextStrip() {
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
        className="flex h-[36px] shrink-0 items-center border-b border-scada-border bg-[#0c1822] px-3"
      >
        <div
          data-testid="wcs-empty-model-start"
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-cyan-500/45 bg-cyan-500/12 font-mono text-[11px] font-bold text-cyan-200">
            1
          </span>
          <span className="truncate text-[11px] font-semibold text-scada-text">
            Start projektu: zakres obliczeń i GPZ
          </span>
          <button
            type="button"
            data-testid="wcs-start-model"
            onClick={() => setActiveArea('MODEL_SIECI')}
            className="ml-2 h-6 shrink-0 rounded-sm border border-cyan-500/60 bg-cyan-500/15 px-2.5 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25"
          >
            Przejdź do budowy GPZ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="workflow-context-strip"
      className="flex h-[36px] shrink-0 items-center border-b border-scada-border bg-[#0c1822] px-3"
    >
      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        <div
          className="flex h-7 items-center gap-2 border-r border-scada-border pr-3"
          data-testid="workflow-build-phase"
          title={phaseTitle}
        >
          <span className="text-[10px] text-scada-muted">Faza:</span>
          <span className={clsx('rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase', chipClass)}>
            <span className={clsx('mr-1.5 inline-block h-1.5 w-1.5 rounded-full', dotClass)} />
            {phaseLabel}
          </span>
        </div>

        <div
          className="flex h-7 items-center gap-1.5 border-r border-scada-border px-3"
          data-testid={display.blockers > 0 ? 'workflow-blockers' : 'workflow-no-blockers'}
          title={`Blokady: T=${blockerCounts.topologia} K=${blockerCounts.katalogi} E=${blockerCounts.eksploatacja}`}
        >
          <span className="text-[10px] text-scada-muted">Blokery:</span>
          <span className={clsx(
            'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold',
            display.blockers > 0
              ? 'bg-rose-600 text-white'
              : 'bg-emerald-500/15 text-emerald-300',
          )}>
            {blockerLabel}
          </span>
        </div>

        <div className="flex h-7 items-center gap-1.5 border-r border-scada-border px-3" data-testid="wcs-model-readiness">
          <span className="text-[10px] text-scada-muted">Gotowość:</span>
          <span className="font-mono text-[10px] font-semibold text-scada-text">{readinessLabel}</span>
          <span className="h-1.5 w-8 overflow-hidden rounded-full bg-scada-bg">
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
        <Metric label="Trafo" value={display.transformers} />
        <Metric label="Odbiory" value={display.loads} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex h-7 items-center gap-1.5 border-r border-scada-border px-3">
      <span className="whitespace-nowrap text-[10px] text-scada-muted">{label}:</span>
      <span className="whitespace-nowrap font-mono text-[10px] font-semibold text-scada-text">{value}</span>
    </div>
  );
}
