/**
 * ReferenceNetworkRunner - przycisk "Uruchom walidację" z LoadingOverlay.
 */

import { useReferenceNetworkDetail, useValidateReferenceNetwork } from './api';
import { LoadingOverlay } from '../shared/LoadingOverlay';
import type { ValidationReport } from './types';

interface ReferenceNetworkRunnerProps {
  networkId: string;
  onValidationComplete: (report: ValidationReport) => void;
}

export function ReferenceNetworkRunner({
  networkId,
  onValidationComplete,
}: ReferenceNetworkRunnerProps): JSX.Element {
  const detail = useReferenceNetworkDetail(networkId);
  const validation = useValidateReferenceNetwork();

  const handleRunValidation = async () => {
    try {
      const response = await validation.mutateAsync(networkId);
      onValidationComplete(response.report);
    } catch (err) {
      // Error is exposed via validation.error
    }
  };

  return (
    <div className="space-y-3" data-testid="reference-network-runner">
      {detail.data && (
        <div className="rounded border border-chrome-700 bg-chrome-900 p-3">
          <h3 className="text-sm font-semibold text-chrome-200">{detail.data.name_pl}</h3>
          <p className="mt-1 text-xs text-chrome-400">{detail.data.description_pl}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-chrome-500">Liczba węzłów: </span>
              <span className="font-mono text-chrome-200">{detail.data.bus_count}</span>
            </div>
            <div>
              <span className="text-chrome-500">Liczba gałęzi: </span>
              <span className="font-mono text-chrome-200">{detail.data.branch_count}</span>
            </div>
            <div>
              <span className="text-chrome-500">Expected PF: </span>
              <span className="font-mono text-chrome-200">{detail.data.expected_pf_count}</span>
            </div>
            <div>
              <span className="text-chrome-500">Expected SC: </span>
              <span className="font-mono text-chrome-200">{detail.data.expected_sc_count}</span>
            </div>
          </div>
          <p className="mt-2 text-[10px] italic text-chrome-500">{detail.data.source}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="run-validation-button"
          onClick={handleRunValidation}
          disabled={validation.isPending}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          title="Uruchom solver + porównaj wyniki z wartościami referencyjnymi"
        >
          {validation.isPending ? 'Walidacja...' : 'Uruchom walidację'}
        </button>
      </div>

      {validation.error && (
        <div
          className="rounded border border-red-500 bg-red-500/10 p-3 text-xs text-red-200"
          data-testid="validation-error"
        >
          Błąd walidacji: {validation.error.message}
        </div>
      )}

      <LoadingOverlay
        isOpen={validation.isPending}
        title="Walidacja sieci referencyjnej..."
        subtitle={detail.data ? `Sieć: ${detail.data.name_pl}` : ''}
      />
    </div>
  );
}
