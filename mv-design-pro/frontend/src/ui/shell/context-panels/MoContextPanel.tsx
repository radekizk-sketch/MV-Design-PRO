/**
 * MoContextPanel — Panel kontekstu obszaru MO (Model sieci).
 *
 * Wyświetla:
 *  - Pasek fazy budowy (BuildPhase z networkBuildStore)
 *  - ProcessPanel z krokami budowy (źródło → magistrale → stacje → obciążenia → READY)
 *  - Liczniki elementów (źródła, magistrale, stacje, transformatory, generatory)
 *
 * Catalog-first, no codenames, dark SCADA palette.
 */

import { clsx } from 'clsx';
import { ProcessPanel } from '../../network-build/ProcessPanel';
import { useNetworkBuildDerived } from '../../network-build/networkBuildStore';

interface CounterTileProps {
  label: string;
  value: number;
  testId: string;
}

function CounterTile({ label, value, testId }: CounterTileProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col rounded border border-scada-border bg-scada-surface px-2 py-1.5"
    >
      <span className="text-[9px] font-semibold uppercase tracking-widest text-scada-muted">
        {label}
      </span>
      <span className="font-mono text-base font-bold text-scada-text">{value}</span>
    </div>
  );
}

export function MoContextPanel() {
  const derived = useNetworkBuildDerived();
  const phaseLabel = derived.buildPhaseLabel ?? 'Faza budowy';
  const phaseTone = derived.isReady
    ? 'bg-scada-energized/15 text-scada-energized'
    : 'bg-scada-grounded/15 text-scada-grounded';

  return (
    <div
      data-testid="mo-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Model sieci — budowa
        </span>
        <div
          className={clsx(
            'mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-semibold',
            phaseTone,
          )}
          data-testid="mo-build-phase"
        >
          {phaseLabel}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 border-b border-scada-border bg-scada-bg px-3 py-2">
        <CounterTile label="Źródła" value={derived.sourceCount} testId="mo-counter-sources" />
        <CounterTile label="Magistrale" value={derived.trunkCount} testId="mo-counter-trunks" />
        <CounterTile label="Odgałęz." value={derived.branchCount} testId="mo-counter-branches" />
        <CounterTile label="Stacje" value={derived.stationCount} testId="mo-counter-stations" />
        <CounterTile label="Trafa" value={derived.transformerCount} testId="mo-counter-trafo" />
        <CounterTile label="OZE" value={derived.generatorCount} testId="mo-counter-generators" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ProcessPanel className="bg-scada-panel" />
      </div>
    </div>
  );
}
