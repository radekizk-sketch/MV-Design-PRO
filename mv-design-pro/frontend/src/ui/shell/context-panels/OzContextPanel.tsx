/**
 * OzContextPanel — Panel kontekstu obszaru OZ (Źródła OZE).
 *
 * Wyświetla:
 *  - Liczniki PV/BESS/FW
 *  - Listę źródeł OZE z networkBuildStore.selectOzeSourceSummaries
 *  - Filtr typu generatora (PV/BESS/FW/wszystkie)
 *
 * Catalog-first, no codenames, dark SCADA palette.
 */

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStateStore } from '../../app-state/store';
import { useNetworkBuildDerived } from '../../network-build/networkBuildStore';
import { formatGeneratorTypeShortLabelPl } from '../../shared/generatorTypeLabels';

type OzeFilter = 'all' | 'PV' | 'BESS' | 'WIND';
export type OzeTechnology = Exclude<OzeFilter, 'all'> | 'UNKNOWN';

const FILTER_DEFS: Array<{ id: OzeFilter; label: string; testId: string }> = [
  { id: 'all', label: 'Wszystkie', testId: 'oz-filter-all' },
  { id: 'PV', label: 'PV', testId: 'oz-filter-PV' },
  { id: 'BESS', label: 'BESS', testId: 'oz-filter-BESS' },
  { id: 'WIND', label: 'FW', testId: 'oz-filter-WIND' },
];

const GENERATOR_TYPE_TECHNOLOGY: Record<string, OzeTechnology> = {
  pv_inverter: 'PV',
  photovoltaic_inverter: 'PV',
  bess: 'BESS',
  battery_storage: 'BESS',
  wind_inverter: 'WIND',
  wind_turbine: 'WIND',
};

export function resolveOzeTechnology(genType: string): OzeTechnology {
  return GENERATOR_TYPE_TECHNOLOGY[genType.trim().toLowerCase()] ?? 'UNKNOWN';
}

function matchFilter(genType: string, filter: OzeFilter): boolean {
  if (filter === 'all') return true;
  return resolveOzeTechnology(genType) === filter;
}

export function OzContextPanel() {
  const { ozeSourceSummaries, generatorCount } = useNetworkBuildDerived();
  const [filter, setFilter] = useState<OzeFilter>('all');
  const setActiveArea = useAppStateStore((s) => s.setActiveArea);

  const filtered = useMemo(
    () => ozeSourceSummaries.filter((s) => matchFilter(s.genType, filter)),
    [ozeSourceSummaries, filter],
  );

  const hasAnyRatedPower = filtered.some((s) => typeof s.pMw === 'number' && Number.isFinite(s.pMw));
  const totalPower = hasAnyRatedPower
    ? filtered.reduce((acc, s) => acc + (Number.isFinite(s.pMw) ? s.pMw : 0), 0)
    : null;

  return (
    <div
      data-testid="oz-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Źródła i przyłączenia
        </span>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-scada-text">
          <span data-testid="oz-counter-total">
            <span className="text-scada-muted">Liczba: </span>
            <span className="font-mono font-bold">{generatorCount}</span>
          </span>
          <span data-testid="oz-counter-power">
            <span className="text-scada-muted">Σ P: </span>
            <span className="font-mono font-bold text-scada-energized">
              {totalPower === null ? 'brak danych' : `${totalPower.toFixed(2)} MW`}
            </span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 border-b border-scada-border bg-scada-bg">
        {FILTER_DEFS.map((f) => (
          <button
            key={f.id}
            type="button"
            data-testid={f.testId}
            onClick={() => setFilter(f.id)}
            className={clsx(
              'flex-1 border-r border-scada-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors last:border-r-0',
              filter === f.id
                ? 'bg-scada-active text-scada-sn'
                : 'text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto" data-testid="oz-source-list">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-[11px] text-scada-muted">
            <span>Brak źródeł przyłączonych w wybranej kategorii.</span>
            <span>Warunek przejścia: najpierw utwórz stację lub pole przyłączeniowe w modelu sieci.</span>
            <button
              type="button"
              data-testid="oz-empty-go-model"
              onClick={() => setActiveArea('MODEL_SIECI')}
              className="rounded border border-scada-sn px-2 py-1 text-[11px] font-semibold text-scada-sn hover:bg-scada-active"
            >
              Przejdź do modelu sieci
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-scada-border">
            {filtered.map((src) => (
              <li
                key={src.id}
                data-testid={`oz-source-${src.id}`}
                className="flex items-start gap-2 px-3 py-2 text-[11px] hover:bg-scada-hover-nav"
              >
                <span className="mt-0.5 inline-block h-2 w-2 rounded-full bg-scada-energized" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-scada-text">{src.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-scada-muted">
                    <span className="font-mono">
                      {formatGeneratorTypeShortLabelPl(src.genType)}
                    </span>
                    <span>•</span>
                    <span className="font-mono">
                      {Number.isFinite(src.pMw) ? `${src.pMw.toFixed(2)} MW` : 'brak danych'}
                    </span>
                    {src.hasTransformer && (
                      <>
                        <span>•</span>
                        <span className="text-scada-sn">+TR</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
