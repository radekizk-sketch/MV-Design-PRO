import { useDeferredValue, useMemo } from 'react';

import { useAppStateStore } from '../app-state';
import { useSelectionStore } from '../selection';
import { SldEditorPage } from '../sld';
import { useSnapshotStore } from '../topology/snapshotStore';

function SummaryChip({
  label,
  value,
  accent = 'slate',
}: {
  label: string;
  value: string | number;
  accent?: 'slate' | 'blue' | 'emerald' | 'amber';
}) {
  const accents = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  } as const;

  return (
    <div className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${accents[accent]}`}>
      <span className="mr-1 text-slate-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function NetworkEditorPage() {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const readiness = useSnapshotStore((state) => state.readiness);
  const activeCaseName = useAppStateStore((state) => state.activeCaseName);
  const resultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const activeRunId = useAppStateStore((state) => state.activeRunId);
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const deferredSelectedElement = useDeferredValue(selectedElement);

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    return {
      buses: snapshot.buses?.length ?? 0,
      branches: snapshot.branches?.length ?? 0,
      stations: snapshot.substations?.length ?? 0,
      transformers: snapshot.transformers?.length ?? 0,
      generators: snapshot.generators?.length ?? 0,
    };
  }, [snapshot]);

  const readinessAccent =
    readiness?.ready
      ? 'emerald'
      : (readiness?.blockers?.length ?? 0) > 0
      ? 'amber'
      : 'blue';

  const resultSummary = useMemo(() => {
    if (resultStatus === 'FRESH') {
      return {
        label: activeRunId ? `aktualne (${activeRunId.slice(0, 8)})` : 'aktualne',
        accent: 'emerald' as const,
      };
    }
    if (resultStatus === 'OUTDATED') {
      return {
        label: 'wymagaja odswiezenia',
        accent: 'amber' as const,
      };
    }
    return {
      label: 'brak wynikow',
      accent: 'slate' as const,
    };
  }, [activeRunId, resultStatus]);

  const operatorHint = useMemo(() => {
    const elementCount =
      (snapshot?.buses?.length ?? 0) +
      (snapshot?.branches?.length ?? 0) +
      (snapshot?.transformers?.length ?? 0);

    if (!snapshot || elementCount === 0) {
      return 'Zacznij od GPZ, kabla albo linii z katalogu po lewej stronie.';
    }
    if ((readiness?.blockers?.length ?? 0) > 0) {
      return 'Usun blokery gotowosci lub skorzystaj z dzialan naprawczych w panelach pomocniczych.';
    }
    if (resultStatus !== 'FRESH') {
      return 'Model jest gotowy. Uruchom analize z paska aktywnego przypadku.';
    }
    return 'Wyniki sa aktualne. Otworz Wyniki i analiza, aby sprawdzic nakladke SLD i porownania.';
  }, [readiness?.blockers?.length, resultStatus, snapshot]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50" data-testid="network-editor-page">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 px-4 py-3 text-slate-50">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100">
            Edytor sieci
          </div>
          <div className="text-sm font-semibold">Budowa katalog-first, jedna prawda systemowa, jedno pĹ‚Ăłtno SLD.</div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-300">
          <span>GPZ</span>
          <span>→</span>
          <span>Magistrala SN</span>
          <span>→</span>
          <span>Stacja / Trafo</span>
          <span>→</span>
          <span>Zabezpieczenia</span>
          <span>→</span>
          <span>Analiza</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          {activeCaseName && (
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-200">
              Przypadek: {activeCaseName}
            </div>
          )}
          <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-200">
            {operatorHint}
          </div>
          {deferredSelectedElement && (
            <div className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">
              Zaznaczono: {deferredSelectedElement.name ?? deferredSelectedElement.id}
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <SummaryChip
            label="Gotowosc"
            value={
              readiness?.ready
                ? 'gotowy'
                : `${readiness?.blockers?.length ?? 0} blokerow / ${readiness?.warnings?.length ?? 0} ostrzezen`
            }
            accent={readinessAccent}
          />
          <SummaryChip label="Wyniki" value={resultSummary.label} accent={resultSummary.accent} />
          {metrics && (
            <>
              <SummaryChip label="Szyny" value={metrics.buses} />
              <SummaryChip label="GaĹ‚Ä™zie" value={metrics.branches} />
              <SummaryChip label="Stacje" value={metrics.stations} />
              <SummaryChip label="Trafo" value={metrics.transformers} />
              <SummaryChip label="OZE/BESS" value={metrics.generators} />
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <SldEditorPage useDemo={false} />
      </div>
    </div>
  );
}

export default NetworkEditorPage;
