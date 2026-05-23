/**
 * SensitivityPanel — analiza wrażliwości napięcia i strat.
 *
 * Pokazuje czułość napięcia na zmianę P/Q oraz strat na zmianę topologii.
 * Wartości obliczone jako ∂V/∂P, ∂V/∂Q (macierz Jacobi z PF NR).
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useState } from 'react';

export interface SensitivityEntry {
  readonly elementRef: string;
  readonly elementName: string;
  readonly dV_dP: number; // V change per MW
  readonly dV_dQ: number; // V change per MVAr
  readonly dPloss_dP: number; // loss change per MW
}

type SensitivityKind = 'voltage_p' | 'voltage_q' | 'losses_p';

const KIND_LABELS: Record<SensitivityKind, { label: string; unit: string; description: string }> = {
  voltage_p: {
    label: 'Czułość napięcia na P (∂V/∂P)',
    description: 'O ile zmieni się napięcie szyny gdy zmieni się moc czynna o 1 MW. Wyrażone jako pu/MW.',
    unit: 'pu/MW',
  },
  voltage_q: {
    label: 'Czułość napięcia na Q (∂V/∂Q)',
    description: 'O ile zmieni się napięcie szyny gdy zmieni się moc bierna o 1 MVAr. Wyrażone jako pu/MVAr.',
    unit: 'pu/MVAr',
  },
  losses_p: {
    label: 'Czułość strat na P (∂Ploss/∂P)',
    description: 'O ile zmienią się straty całkowite sieci gdy zmieni się generacja DER o 1 MW.',
    unit: 'MW/MW',
  },
};

export interface SensitivityPanelProps {
  /** Lista wyników wrażliwości z backendu. Pusta = brak obliczeń. */
  readonly entries: readonly SensitivityEntry[];
  /** Status obliczeń. */
  readonly status: 'idle' | 'computing' | 'ready' | 'error';
  /** Komunikat błędu (jeśli status='error'). */
  readonly errorMessage?: string;
  /** Callback "Uruchom analizę". */
  readonly onCompute?: () => void;
  /** Callback "Pokaż element na SLD". */
  readonly onSelectElement?: (ref: string) => void;
}

export function SensitivityPanel({
  entries,
  status,
  errorMessage,
  onCompute,
  onSelectElement,
}: SensitivityPanelProps): JSX.Element {
  const [kind, setKind] = useState<SensitivityKind>('voltage_p');
  const [topN, setTopN] = useState<number>(10);

  const sortedEntries = useMemo(() => {
    const getValue = (e: SensitivityEntry): number => {
      switch (kind) {
        case 'voltage_p':
          return Math.abs(e.dV_dP);
        case 'voltage_q':
          return Math.abs(e.dV_dQ);
        case 'losses_p':
          return Math.abs(e.dPloss_dP);
      }
    };
    return [...entries].sort((a, b) => getValue(b) - getValue(a)).slice(0, topN);
  }, [entries, kind, topN]);

  const valueOf = (e: SensitivityEntry): number => {
    switch (kind) {
      case 'voltage_p':
        return e.dV_dP;
      case 'voltage_q':
        return e.dV_dQ;
      case 'losses_p':
        return e.dPloss_dP;
    }
  };

  return (
    <div
      className="flex h-full flex-col rounded border border-scada-border bg-scada-panel"
      data-testid="sensitivity-panel"
    >
      <header className="border-b border-scada-border px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">
          Analiza wrażliwości
        </div>
        <h3 className="text-sm font-semibold text-scada-text">
          {KIND_LABELS[kind].label}
        </h3>
        <p className="mt-0.5 text-[10px] text-scada-muted">{KIND_LABELS[kind].description}</p>
      </header>

      <div className="border-b border-scada-border px-3 py-2 flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SensitivityKind)}
          className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-[11px]"
          data-testid="sensitivity-kind"
        >
          {(Object.entries(KIND_LABELS) as [SensitivityKind, { label: string }][]).map(([k, info]) => (
            <option key={k} value={k}>
              {info.label}
            </option>
          ))}
        </select>
        <select
          value={topN}
          onChange={(e) => setTopN(Number(e.target.value))}
          className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-[11px]"
          data-testid="sensitivity-topn"
        >
          <option value={5}>Top 5</option>
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
          <option value={1000}>Wszystkie</option>
        </select>
        {onCompute && (
          <button
            type="button"
            onClick={onCompute}
            disabled={status === 'computing'}
            className="ml-auto rounded bg-blue-600 px-3 py-1 text-[11px] text-white hover:bg-blue-700 disabled:bg-gray-400"
            data-testid="sensitivity-compute"
          >
            {status === 'computing' ? 'Obliczanie...' : 'Uruchom analizę'}
          </button>
        )}
      </div>

      {status === 'idle' && entries.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-scada-muted" data-testid="sensitivity-empty">
          <div>
            Brak wyników analizy wrażliwości.
            <br />
            Kliknij "Uruchom analizę" aby obliczyć ∂V/∂P, ∂V/∂Q, ∂Ploss/∂P na bazie macierzy Jacobi.
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="p-4 text-sm text-red-300" data-testid="sensitivity-error">
          Błąd: {errorMessage ?? 'Nieznany'}
        </div>
      )}

      {status === 'ready' && sortedEntries.length > 0 && (
        <ul className="flex-1 overflow-y-auto divide-y divide-scada-border" data-testid="sensitivity-list">
          {sortedEntries.map((entry) => {
            const v = valueOf(entry);
            const isPositive = v >= 0;
            return (
              <li
                key={entry.elementRef}
                className="px-3 py-2 hover:bg-scada-hover-nav"
                data-testid={`sensitivity-entry-${entry.elementRef}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-scada-text truncate">
                      {entry.elementName}
                    </div>
                    {onSelectElement && (
                      <button
                        type="button"
                        onClick={() => onSelectElement(entry.elementRef)}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Pokaż na SLD
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`font-mono text-[11px] font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {v >= 0 ? '+' : ''}
                      {v.toExponential(3)}
                    </div>
                    <div className="text-[9px] text-scada-muted">{KIND_LABELS[kind].unit}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
