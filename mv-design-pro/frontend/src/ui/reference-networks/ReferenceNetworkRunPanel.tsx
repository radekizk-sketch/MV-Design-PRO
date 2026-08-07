/**
 * ReferenceNetworkRunPanel — bieg solvera na sieci referencyjnej i wynik
 * per węzeł (karta ROUTERY-4A, zdolność S6 macierzy pokrycia).
 *
 * Domyka łańcuch rozpływu niesymetrycznego: dla sieci `is_unbalanced`
 * (IEEE 13/34-bus) backend (`solve_reference_network`) dobiera solver BFS
 * per faza — dotąd klient `runReferenceNetwork` nie miał ŻADNEGO konsumenta,
 * więc jedyna droga do tego solvera była martwa. Panel pokazuje napięcia
 * węzłów [p.u.], kąt fazy odniesienia, zbieżność i liczbę iteracji — wartości
 * WYŁĄCZNIE z backendu (zero fizyki w UI).
 */

import { useMemo, useState } from 'react';

import { useReferenceNetworkDetail, useRunReferenceNetwork } from './api';
import type { RunBusResult, RunResult } from './types';

/** Etykiety rodzajów solverów (kody backendu → język projektanta). */
const SOLVER_LABELS_PL: Record<string, string> = {
  power_flow_newton: 'Rozpływ mocy (Newton-Raphson)',
  power_flow_unbalanced_bfs: 'Rozpływ niesymetryczny (BFS, per faza)',
  short_circuit_iec60909: 'Zwarcia (IEC 60909)',
  dynamic_stability: 'Stabilność dynamiczna',
};

function etykietaSolvera(solverKind: string): string {
  return SOLVER_LABELS_PL[solverKind] ?? solverKind;
}

interface ReferenceNetworkRunPanelProps {
  networkId: string;
}

export function ReferenceNetworkRunPanel({
  networkId,
}: ReferenceNetworkRunPanelProps): JSX.Element {
  const detail = useReferenceNetworkDetail(networkId);
  const run = useRunReferenceNetwork();
  const [wynik, setWynik] = useState<{ solverKind: string; result: RunResult } | null>(null);

  const solverKind = detail.data?.supported_solvers[0] ?? 'power_flow_newton';

  const uruchom = async () => {
    setWynik(null);
    try {
      const odpowiedz = await run.mutateAsync({ id: networkId, solverKind });
      if (odpowiedz.success) {
        setWynik({
          solverKind: odpowiedz.solver_kind,
          result: odpowiedz.result as RunResult,
        });
      }
    } catch {
      // Błąd widoczny przez run.error poniżej.
    }
  };

  const wiersze = useMemo(() => {
    if (!wynik) return [] as Array<{ id: string; bus: RunBusResult }>;
    return Object.entries(wynik.result.buses ?? {})
      .map(([id, bus]) => ({ id, bus }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [wynik]);

  const bladBiegu =
    run.error?.message
    ?? (run.data && !run.data.success ? run.data.error ?? 'Bieg solvera nie powiódł się.' : null);

  return (
    <div
      className="rounded border border-chrome-700 bg-chrome-900 p-3"
      data-testid="reference-network-run-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-chrome-200">Bieg solvera (bez porównania)</h3>
          <p className="mt-1 text-xs text-chrome-400">
            Solver: <span className="font-mono">{etykietaSolvera(solverKind)}</span>
            {detail.data?.is_unbalanced && (
              <span
                className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300"
                data-testid="run-panel-unbalanced-badge"
              >
                sieć niesymetryczna
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="run-solver-button"
          onClick={uruchom}
          disabled={run.isPending || !detail.data}
          className="rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          title="Uruchom solver na sieci referencyjnej i pokaż napięcia węzłów"
        >
          {run.isPending ? 'Obliczanie…' : 'Uruchom rozpływ'}
        </button>
      </div>

      {bladBiegu && (
        <div
          className="mt-3 rounded border border-red-500 bg-red-500/10 p-3 text-xs text-red-200"
          data-testid="run-panel-error"
        >
          Błąd biegu solvera: {bladBiegu}
        </div>
      )}

      {wynik && (
        <div className="mt-3" data-testid="run-panel-result">
          <div className="mb-2 flex gap-4 text-xs">
            <span>
              <span className="text-chrome-500">Zbieżność: </span>
              <span
                className={wynik.result.converged ? 'text-emerald-300' : 'text-red-300'}
                data-testid="run-panel-converged"
              >
                {wynik.result.converged ? 'osiągnięta' : 'brak zbieżności'}
              </span>
            </span>
            {typeof wynik.result.iterations === 'number' && (
              <span>
                <span className="text-chrome-500">Liczba iteracji: </span>
                <span className="font-mono text-chrome-200">{wynik.result.iterations}</span>
              </span>
            )}
          </div>
          {wiersze.length === 0 ? (
            <p className="text-xs text-chrome-400" data-testid="run-panel-empty">
              Solver nie zwrócił napięć węzłów.
            </p>
          ) : (
            <table className="w-full text-xs" data-testid="run-panel-bus-table">
              <thead>
                <tr className="border-b border-chrome-700 text-left text-chrome-500">
                  <th className="py-1 pr-2">Węzeł</th>
                  <th className="py-1 pr-2 text-right">Napięcie [p.u.]</th>
                  <th className="py-1 text-right">Kąt fazy odniesienia [°]</th>
                </tr>
              </thead>
              <tbody>
                {wiersze.map(({ id, bus }) => (
                  <tr
                    key={id}
                    className="border-b border-chrome-800"
                    data-testid={`run-panel-bus-${id}`}
                  >
                    <td className="py-1 pr-2 font-mono text-chrome-200">{id}</td>
                    <td className="py-1 pr-2 text-right font-mono text-chrome-200">
                      {bus.v_pu.toFixed(4)}
                    </td>
                    <td className="py-1 text-right font-mono text-chrome-200">
                      {bus.angle_deg.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
