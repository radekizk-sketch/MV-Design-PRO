/**
 * Batch Edit Preview Dialog (P9.2)
 *
 * Canonical-style diff preview przed zatwierdzeniem zmian zbiorczych.
 *
 * Features:
 * - Lista zmian: obiekt, pole, wartość przed → po
 * - Walidacja każdej zmiany
 * - Blokada przycisku "Zastosuj" jeśli są błędy
 * - Brak auto-napraw, brak częściowego zapisu
 * - 100% polski interfejs
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';
import type { BatchEditPreview, BatchEditChange } from '../types';

// ============================================================================
// Props
// ============================================================================

interface BatchEditPreviewDialogProps {
  preview: BatchEditPreview | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function BatchEditPreviewDialog({
  preview,
  pending,
  onConfirm,
  onCancel,
}: BatchEditPreviewDialogProps) {
  // Dialog visibility
  const isOpen = preview !== null;

  // Count errors
  const errorCount = useMemo(() => {
    if (!preview) return 0;
    return preview.changes.filter((change) => !change.validation.valid).length;
  }, [preview]);

  // Disabled apply button if errors exist
  const canApply = preview && !preview.hasErrors && !pending;

  if (!isOpen || !preview) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-lg font-semibold">Podgląd zmian</h2>
          <p className="text-sm text-blue-100 mt-1">
            Sprawdź zmiany przed zatwierdzeniem
          </p>
        </div>

        {/* Operation Summary */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Operacja: {getOperationLabel(preview.operation)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Liczba elementów: {preview.changes.length}
              </p>
            </div>
            {errorCount > 0 && (
              <div className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm font-medium">
                Błędów: {errorCount}
              </div>
            )}
          </div>
        </div>

        {/* Changes List */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {preview.changes.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              Brak zmian do zastosowania
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                    Obiekt
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                    Pole
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                    Wartość przed
                  </th>
                  <th className="px-3 py-2 text-center font-medium text-gray-700 border-b border-gray-200 w-8">
                    →
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                    Wartość po
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200 w-24">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.changes.map((change, index) => (
                  <ChangeRow key={`${change.elementId}-${change.field}-${index}`} change={change} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 rounded-b-lg flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {preview.hasErrors ? (
              <span className="text-red-600 font-medium">
                Nie mozna zastosowac zmian z bledami
              </span>
            ) : (
              <span>
                Gotowe do zastosowania ({preview.changes.length} zmian)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Anuluj
            </button>
            <button
              onClick={onConfirm}
              disabled={!canApply}
              className={clsx(
                'px-4 py-2 text-sm font-medium text-white rounded',
                canApply
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-300 cursor-not-allowed'
              )}
            >
              {pending ? 'Stosowanie...' : 'Zastosuj'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Change Row Component
// ============================================================================

function ChangeRow({ change }: { change: BatchEditChange }) {
  const isValid = change.validation.valid;

  return (
    <tr
      className={clsx(
        'border-b border-gray-100 hover:bg-gray-50',
        !isValid && 'bg-red-50'
      )}
    >
      <td className="px-3 py-2 text-gray-900 font-mono text-xs">
        <div>{change.elementId}</div>
        <div className="text-gray-500 text-xs mt-0.5">{change.elementName}</div>
      </td>
      <td className="px-3 py-2 text-gray-700">{change.fieldLabel}</td>
      <td className="px-3 py-2 font-mono text-xs">
        {formatValue(change.oldValue)}
      </td>
      <td className="px-3 py-2 text-center text-gray-400">→</td>
      <td className="px-3 py-2 font-mono text-xs font-medium text-blue-700">
        {formatValue(change.newValue)}
      </td>
      <td className="px-3 py-2">
        {isValid ? (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
            OK
          </span>
        ) : (
          <span
            className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium"
            title={change.validation.error}
          >
            BŁĄD
          </span>
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getOperationLabel(operation: BatchEditPreview['operation']): string {
  switch (operation.type) {
    case 'SET_IN_SERVICE':
      return operation.value ? 'Włącz (in_service)' : 'Wyłącz (in_service)';
    case 'ASSIGN_TYPE':
      return `Przypisz typ (${operation.typeId})`;
    case 'CLEAR_TYPE':
      return 'Wyczyść typ';
    case 'SET_SWITCH_STATE':
      return operation.state === 'CLOSED' ? 'Zamknij łącznik' : 'Otwórz łącznik';
    case 'SET_PARAMETER':
      return `Zmień parametr (${operation.field})`;
    default:
      return 'Nieznana operacja';
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'TAK' : 'NIE';
  }
  if (typeof value === 'number') {
    return value.toFixed(3);
  }
  return String(value);
}

export default BatchEditPreviewDialog;
