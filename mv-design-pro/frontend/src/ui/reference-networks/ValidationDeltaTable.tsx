/**
 * Validation delta table — per-element PASS/FAIL z kolorowaniem.
 */

import { clsx } from 'clsx';

import type { ElementComparison } from './types';

interface ValidationDeltaTableProps {
  title: string;
  comparisons: ElementComparison[];
}

export function ValidationDeltaTable({
  title,
  comparisons,
}: ValidationDeltaTableProps): JSX.Element {
  if (comparisons.length === 0) {
    return (
      <div className="rounded border border-chrome-700 bg-chrome-900 p-3 text-xs text-chrome-500">
        {title} — brak elementów do porównania.
      </div>
    );
  }

  return (
    <div className="rounded border border-chrome-700 bg-chrome-900" data-testid={`delta-table-${title}`}>
      <div className="border-b border-chrome-700 px-3 py-2">
        <h4 className="text-sm font-semibold text-chrome-200">{title}</h4>
        <p className="text-[10px] text-chrome-500">
          {comparisons.filter((c) => c.status === 'PASS').length} PASS /{' '}
          {comparisons.filter((c) => c.status === 'FAIL').length} FAIL
        </p>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-chrome-800">
            <tr className="text-left">
              <th className="px-2 py-1 text-chrome-400">Element</th>
              <th className="px-2 py-1 text-chrome-400">Wielkość</th>
              <th className="px-2 py-1 text-right text-chrome-400">Otrzymano</th>
              <th className="px-2 py-1 text-right text-chrome-400">Oczekiwano</th>
              <th className="px-2 py-1 text-right text-chrome-400">Δ rel.</th>
              <th className="px-2 py-1 text-chrome-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c, idx) => (
              <tr
                key={`${c.element_id}-${c.quantity}-${idx}`}
                data-testid={`delta-row-${c.element_id}-${c.quantity}`}
                className={clsx(
                  'border-t border-chrome-800',
                  c.status === 'PASS'
                    ? 'bg-green-500/5'
                    : 'bg-red-500/10',
                )}
              >
                <td className="px-2 py-1 font-mono text-chrome-200">{c.element_id}</td>
                <td className="px-2 py-1 text-chrome-300">{c.quantity}</td>
                <td className="px-2 py-1 text-right font-mono text-chrome-100">
                  {c.actual.toFixed(4)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-chrome-100">
                  {c.expected.toFixed(4)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-chrome-300">
                  {(c.rel_diff * 100).toFixed(3)}%
                </td>
                <td className="px-2 py-1">
                  <span
                    className={clsx(
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                      c.status === 'PASS'
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-red-500/20 text-red-300',
                    )}
                  >
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
