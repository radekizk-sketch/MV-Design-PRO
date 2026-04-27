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
import { useNetworkBuildDerived } from '../../network-build/networkBuildStore';
import { formatGeneratorTypeShortLabelPl } from '../../shared/generatorTypeLabels';

type OzeFilter = 'all' | 'PV' | 'BESS' | 'WIND';

const FILTER_DEFS: Array<{ id: OzeFilter; label: string; testId: string }> = [
  { id: 'all', label: 'Wszystkie', testId: 'oz-filter-all' },
  { id: 'PV', label: 'PV', testId: 'oz-filter-PV' },
  { id: 'BESS', label: 'BESS', testId: 'oz-filter-BESS' },
  { id: 'WIND', label: 'FW', testId: 'oz-filter-WIND' },
];

function matchFilter(genType: string, filter: OzeFilter): boolean {
  if (filter === 'all') return true;
  const normalized = genType.toUpperCase();
  if (filter === 'PV') return normalized.includes('PV') || normalized.includes('PHOTO');
  if (filter === 'BESS') return normalized.includes('BESS') || normalized.includes('BATT');
  if (filter === 'WIND') return normalized.includes('WIND') || normalized.includes('WTG') || normalized.includes('FW');
  return false;
}

export function OzContextPanel() {
  const { ozeSourceSummaries, generatorCount } = useNetworkBuildDerived();
  const [filter, setFilter] = useState<OzeFilter>('all');

  const filtered = useMemo(
    () => ozeSourceSummaries.filter((s) => matchFilter(s.genType, filter)),
    [ozeSourceSummaries, filter],
  );

  const totalPower = filtered.reduce((acc, s) => acc + (s.pMw ?? 0), 0);

  return (
    <div
      data-testid="oz-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Źródła OZE
        </span>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-scada-text">
          <span data-testid="oz-counter-total">
            <span className="text-scada-muted">Liczba: </span>
            <span className="font-mono font-bold">{generatorCount}</span>
          </span>
          <span data-testid="oz-counter-power">
            <span className="text-scada-muted">Σ P: </span>
            <span className="font-mono font-bold text-scada-energized">
              {totalPower.toFixed(2)} MW
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
          <div className="flex h-full items-center justify-center p-4 text-center text-[11px] text-scada-muted">
            Brak źródeł OZE w wybranej kategorii.
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
                    <span className="font-mono">{src.pMw.toFixed(2)} MW</span>
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
