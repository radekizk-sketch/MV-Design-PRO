/**
 * SupplyPathLegend — operatorska legenda toru zasilania.
 *
 * Pokazuje stan topologii zasilania (zielony tor / czerwone otwarcia / szare
 * odłączone elementy) z licznikiem energized vs total. Komponent
 * prezentacyjny dla goal §8 „Tor mocy widoczny".
 *
 * Reguła architektoniczna: **bez fizyki**. Stan energized pochodzi z
 * `SupplyPathHighlighter` (BFS topologiczny). Wartości P/Q (prądy/napięcia/
 * spadki) są w warstwie wyników, NIE tutaj.
 */

import { clsx } from 'clsx';

import type { SupplyPathHighlight } from './SupplyPathHighlighter';

export interface SupplyPathLegendProps {
  readonly highlight: SupplyPathHighlight;
  /** Całkowita liczba szyn w ENM — do procentowego pokrycia. */
  readonly totalBusCount?: number;
  /** Całkowita liczba gałęzi (kabli/linii/łączników) — do procentowego pokrycia. */
  readonly totalBranchCount?: number;
  readonly className?: string;
}

export function SupplyPathLegend({
  highlight,
  totalBusCount,
  totalBranchCount,
  className,
}: SupplyPathLegendProps): JSX.Element {
  const energizedBusCount = highlight.energizedBusRefs.length;
  const energizedBranchCount = highlight.energizedBranchRefs.length;
  const openPointCount = highlight.openPointBranchRefs.length;
  const sourceCount = highlight.sourceRefs.length;
  const hasSource = sourceCount > 0;

  if (!hasSource) {
    return (
      <div
        className={clsx(
          'rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900',
          className,
        )}
        data-testid="supply-path-legend-no-source"
      >
        Brak źródła zasilania w modelu — tor mocy nie może być wyznaczony.
      </div>
    );
  }

  const busCoveragePct =
    totalBusCount !== undefined && totalBusCount > 0
      ? Math.round((energizedBusCount / totalBusCount) * 100)
      : null;
  const branchCoveragePct =
    totalBranchCount !== undefined && totalBranchCount > 0
      ? Math.round((energizedBranchCount / totalBranchCount) * 100)
      : null;

  return (
    <div
      className={clsx(
        'flex flex-col gap-1 rounded border border-scada-border bg-scada-surface p-2 text-[11px]',
        className,
      )}
      data-testid="supply-path-legend"
      data-source-count={String(sourceCount)}
      data-energized-bus-count={String(energizedBusCount)}
      data-energized-branch-count={String(energizedBranchCount)}
      data-open-point-count={String(openPointCount)}
    >
      <div className="flex items-center gap-2 font-semibold text-scada-text">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        <span>Tor mocy (topologia)</span>
        <span className="ml-auto text-[10px] text-gray-500">
          Źródeł: <span className="font-mono">{sourceCount}</span>
        </span>
      </div>

      <ul className="flex flex-col gap-0.5">
        <li
          className="flex items-center justify-between gap-2"
          data-testid="supply-path-legend-energized-buses"
        >
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Szyny pod napięciem
          </span>
          <span className="font-mono text-gray-700">
            {energizedBusCount}
            {totalBusCount !== undefined ? ` / ${totalBusCount}` : ''}
            {busCoveragePct !== null ? ` (${busCoveragePct}%)` : ''}
          </span>
        </li>

        <li
          className="flex items-center justify-between gap-2"
          data-testid="supply-path-legend-energized-branches"
        >
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Gałęzie czynne
          </span>
          <span className="font-mono text-gray-700">
            {energizedBranchCount}
            {totalBranchCount !== undefined ? ` / ${totalBranchCount}` : ''}
            {branchCoveragePct !== null ? ` (${branchCoveragePct}%)` : ''}
          </span>
        </li>

        <li
          className={clsx(
            'flex items-center justify-between gap-2',
            openPointCount > 0 ? 'text-red-700' : 'text-gray-500',
          )}
          data-testid="supply-path-legend-open-points"
        >
          <span className="flex items-center gap-1">
            <span
              className={clsx(
                'inline-block h-1.5 w-1.5 rounded-full',
                openPointCount > 0 ? 'bg-red-500' : 'bg-gray-400',
              )}
            />
            Punkty otwarte (NMO / open)
          </span>
          <span className="font-mono">{openPointCount}</span>
        </li>

        {highlight.energizedGeneratorRefs.length > 0 && (
          <li
            className="flex items-center justify-between gap-2 text-amber-700"
            data-testid="supply-path-legend-energized-ders"
          >
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              DER pod napięciem
            </span>
            <span className="font-mono">{highlight.energizedGeneratorRefs.length}</span>
          </li>
        )}
      </ul>

      <span className="text-[10px] text-gray-500">
        Bez fizyki — interpretacja topologii operatorskiej (BFS przez zamknięte łączniki i
        transformatory).
      </span>
    </div>
  );
}
