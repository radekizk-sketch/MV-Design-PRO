/**
 * SnapshotHistoryModal - Modal historii zmian modelu.
 *
 * Wyswietla chronologiczna liste operacji domenowych z timestampem,
 * typem operacji, elementem docelowym i bilansem zmian.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo, type KeyboardEvent } from 'react';
import { clsx } from 'clsx';

import { useSnapshotStore } from '../topology/snapshotStore';
import { isCanonicalOpName } from '../../types/domainOps';

// =============================================================================
// Types
// =============================================================================

export interface SnapshotHistoryEntry {
  id: string;
  timestamp: string;
  operation: string;
  operationLabel?: string | null;
  elementRef: string | null;
  elementName: string | null;
  status: 'success' | 'error' | 'pending';
  createdElementIds?: string[];
  updatedElementIds?: string[];
  deletedElementIds?: string[];
}

export interface SnapshotHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// Operation labels (PL)
// =============================================================================

export const OP_LABELS: Record<string, string> = {
  add_grid_source_sn: 'Dodanie źródła zasilania SN',
  continue_trunk_segment_sn: 'Kontynuacja magistrali SN',
  insert_station_on_segment_sn: 'Wstawienie stacji na odcinku',
  start_branch_segment_sn: 'Rozpoczęcie odgałęzienia',
  insert_section_switch_sn: 'Wstawienie łącznika sekcyjnego',
  connect_secondary_ring_sn: 'Zamknięcie pierścienia / rezerwy',
  set_normal_open_point: 'Ustawienie punktu normalnie otwartego',
  add_transformer_sn_nn: 'Dodanie transformatora SN/nN',
  add_converter_source: 'Dodanie układu PV/BESS/FW',
  assign_catalog_to_element: 'Przypisanie typu katalogowego',
  update_element_parameters: 'Aktualizacja parametrów elementu',
  delete_element: 'Usunięcie elementu',
  clone_case: 'Klonowanie przypadku obliczeniowego',
  create_case: 'Utworzenie przypadku obliczeniowego',
};

function normalizeOperation(operation: string): string {
  return isCanonicalOpName(operation) ? operation : operation;
}

function resolveOperationLabel(operation: string, explicitLabel?: string | null): string {
  if (typeof explicitLabel === 'string' && explicitLabel.trim().length > 0) {
    return explicitLabel;
  }
  const normalized = normalizeOperation(operation);
  return OP_LABELS[normalized] ?? OP_LABELS[operation] ?? operation;
}

function formatChangeSummary(entry: SnapshotHistoryEntry): string {
  return `+${entry.createdElementIds?.length ?? 0} / ~${entry.updatedElementIds?.length ?? 0} / -${entry.deletedElementIds?.length ?? 0}`;
}

// =============================================================================
// Component
// =============================================================================

export function SnapshotHistoryModal({ isOpen, onClose }: SnapshotHistoryModalProps) {
  const operationHistory = useSnapshotStore(
    (state) =>
      (
        (state as unknown as { operationHistory?: SnapshotHistoryEntry[] }).operationHistory ?? []
      ) as SnapshotHistoryEntry[],
  );

  const entries = useMemo(
    () =>
      [...operationHistory]
        .map((entry) => ({
          ...entry,
          operationLabel: resolveOperationLabel(entry.operation, entry.operationLabel),
        }))
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
    [operationHistory],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[720px] max-w-[95vw] h-[500px] max-h-[85vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Historia zmian"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Historia zmian modelu</h3>
            <p className="text-[10px] text-gray-500">
              Chronologiczna lista operacji domenowych
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400"
            aria-label="Zamknij"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px]">Brak zarejestrowanych operacji</p>
              <p className="text-[10px] text-gray-300 mt-1">
                Historia pojawi się po wykonaniu pierwszej operacji domenowej
              </p>
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 sticky top-0">
                  <th className="px-4 py-1.5 text-left font-medium text-gray-500 w-6" />
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Czas</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Operacja</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Element</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Zmiany</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-1.5">
                      <span
                        className={clsx(
                          'inline-block w-2 h-2 rounded-full',
                          entry.status === 'success' && 'bg-green-500',
                          entry.status === 'error' && 'bg-red-500',
                          entry.status === 'pending' && 'bg-amber-400',
                        )}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-gray-400 font-mono text-[10px] whitespace-nowrap">
                      {entry.timestamp ? formatTimestamp(entry.timestamp) : '-'}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-gray-700">
                      {entry.operationLabel}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">
                      {entry.elementName ?? entry.elementRef ?? '-'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 font-mono text-[10px] whitespace-nowrap">
                      {formatChangeSummary(entry)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-2 border-t border-gray-100 bg-gray-50">
          <span className="text-[10px] text-gray-400">
            {entries.length} operacji
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}
