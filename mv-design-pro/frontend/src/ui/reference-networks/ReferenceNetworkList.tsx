/**
 * Reference Networks List — tabela 8 sieci z badges + source citation.
 */

import { clsx } from 'clsx';

import { useReferenceNetworks } from './api';
import type { ReferenceNetworkSummary } from './types';

interface ReferenceNetworkListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ReferenceNetworkList({
  selectedId,
  onSelect,
}: ReferenceNetworkListProps): JSX.Element {
  const { data, isLoading, error } = useReferenceNetworks();

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-chrome-400" data-testid="reference-network-list-loading">
        Pobieranie listy sieci referencyjnych...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-red-400" data-testid="reference-network-list-error">
        Błąd pobierania listy: {error.message}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-sm text-chrome-400" data-testid="reference-network-list-empty">
        Brak zarejestrowanych sieci referencyjnych.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="reference-network-list">
      <h3 className="text-sm font-semibold text-chrome-200">
        Sieci referencyjne ({data.length})
      </h3>
      <ul className="space-y-1">
        {data.map((net) => (
          <NetworkRow
            key={net.id}
            network={net}
            selected={net.id === selectedId}
            onClick={() => onSelect(net.id)}
          />
        ))}
      </ul>
    </div>
  );
}

interface NetworkRowProps {
  network: ReferenceNetworkSummary;
  selected: boolean;
  onClick: () => void;
}

function NetworkRow({ network, selected, onClick }: NetworkRowProps): JSX.Element {
  return (
    <li>
      <button
        type="button"
        data-testid={`reference-network-row-${network.id}`}
        onClick={onClick}
        className={clsx(
          'w-full rounded border p-3 text-left transition-colors',
          selected
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-chrome-700 bg-chrome-900 hover:bg-chrome-800',
        )}
      >
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold text-chrome-100">{network.name_pl}</div>
          <div className="flex gap-1.5">
            {network.has_der && (
              <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-green-300">
                OZE
              </span>
            )}
            {network.is_unbalanced && (
              <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">
                ASYM
              </span>
            )}
            <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
              {network.voltage_kv} kV
            </span>
          </div>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-chrome-400">{network.description_pl}</p>
        <p className="mt-1 text-[10px] italic text-chrome-500">{network.source}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {network.supported_solvers.map((solver) => (
            <span
              key={solver}
              className="rounded bg-chrome-700 px-1.5 py-0.5 text-[9px] font-mono text-chrome-300"
            >
              {solver}
            </span>
          ))}
        </div>
      </button>
    </li>
  );
}
