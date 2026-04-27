/**
 * Case Compare View Component — P10 FULL MAX
 *
 * Comparison view for two study cases.
 * Shows configuration differences in "before → after" format.
 *
 * CONSTRAINTS:
 * - 100% read-only (no mutations)
 * - Select exactly 2 cases for comparison
 * - Polish labels throughout
 */

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import type { StudyCaseComparison } from './types';
import { CONFIG_FIELD_LABELS, RESULT_STATUS_LABELS } from './types';
import { useStudyCasesStore, useSortedCases } from './store';

// =============================================================================
// Component Props
// =============================================================================

interface CaseCompareViewProps {
  onClose?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function CaseCompareView({ onClose }: CaseCompareViewProps) {
  const cases = useSortedCases();
  const [selectedCaseA, setSelectedCaseA] = useState<string | null>(null);
  const [selectedCaseB, setSelectedCaseB] = useState<string | null>(null);
  const { compareCases, comparisonResult, isComparing, clearComparison } =
    useStudyCasesStore();

  const handleCompare = useCallback(async () => {
    if (selectedCaseA && selectedCaseB) {
      await compareCases(selectedCaseA, selectedCaseB);
    }
  }, [selectedCaseA, selectedCaseB, compareCases]);

  const handleClear = useCallback(() => {
    clearComparison();
    setSelectedCaseA(null);
    setSelectedCaseB(null);
  }, [clearComparison]);

  const canCompare = selectedCaseA && selectedCaseB && selectedCaseA !== selectedCaseB;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg h-full flex flex-col">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          PORÓWNANIE WARIANTÓW
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            title="Zamknij"
          >
            ✕
          </button>
        )}
      </div>

      {/* Case Selection */}
      <div className="p-4 border-b border-gray-200">
        <div className="grid grid-cols-2 gap-4">
          {/* Case A */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Wariant pracy A
            </label>
            <select
              value={selectedCaseA || ''}
              onChange={(e) => setSelectedCaseA(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Wybierz wariant pracy...</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === selectedCaseB}>
                  {c.name} {c.is_active ? '(aktywny)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Case B */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Wariant pracy B
            </label>
            <select
              value={selectedCaseB || ''}
              onChange={(e) => setSelectedCaseB(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Wybierz wariant pracy...</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === selectedCaseA}>
                  {c.name} {c.is_active ? '(aktywny)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Compare Button */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleCompare}
            disabled={!canCompare || isComparing}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-md',
              canCompare && !isComparing
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            )}
          >
            {isComparing ? 'Porównywanie...' : 'Porównaj przypadki'}
          </button>
          {comparisonResult && (
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              Wyczyść
            </button>
          )}
        </div>
      </div>

      {/* Comparison Result */}
      {comparisonResult ? (
        <ComparisonResultView comparison={comparisonResult} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Wybierz dwa przypadki do porównania.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Comparison Result Component
// =============================================================================

interface ComparisonResultViewProps {
  comparison: StudyCaseComparison;
}

function ComparisonResultView({ comparison }: ComparisonResultViewProps) {
  const hasDifferences = comparison.config_differences.length > 0;
  const hasStatusDifference = comparison.status_a !== comparison.status_b;

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Header */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-xs text-blue-600 font-medium">Wariant pracy A</div>
          <div className="text-sm font-semibold text-gray-900">{comparison.case_a_name}</div>
          <div className={clsx('text-xs mt-1', getStatusColor(comparison.status_a))}>
            {RESULT_STATUS_LABELS[comparison.status_a]}
          </div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-xs text-green-600 font-medium">Wariant pracy B</div>
          <div className="text-sm font-semibold text-gray-900">{comparison.case_b_name}</div>
          <div className={clsx('text-xs mt-1', getStatusColor(comparison.status_b))}>
            {RESULT_STATUS_LABELS[comparison.status_b]}
          </div>
        </div>
      </div>

      {/* Differences Table */}
      {hasDifferences ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Parametr
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-blue-600 uppercase">
                  Wariant pracy A
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-400">
                  →
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-green-600 uppercase">
                  Wariant pracy B
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {comparison.config_differences.map((diff, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-700">
                    {getFieldLabel(diff.field)}
                  </td>
                  <td className="px-4 py-2 text-gray-600 bg-blue-50/30">
                    {formatValue(diff.value_a)}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-400">→</td>
                  <td className="px-4 py-2 text-gray-600 bg-green-50/30">
                    {formatValue(diff.value_b)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2 font-bold text-green-600">OK</div>
          <div className="text-sm">Konfiguracje są identyczne.</div>
        </div>
      )}

      {/* Summary */}
      <div className="mt-4 px-4 py-3 bg-gray-50 rounded-lg text-sm text-gray-600">
        <strong>Podsumowanie:</strong>{' '}
        {hasDifferences
          ? `${comparison.config_differences.length} różnic w konfiguracji`
          : 'Brak różnic w konfiguracji'}
        {hasStatusDifference && ', różny status wyników'}
      </div>
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function getFieldLabel(field: string): string {
  return CONFIG_FIELD_LABELS[field as keyof typeof CONFIG_FIELD_LABELS] || field;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    // Format scientific notation nicely
    if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
      return value.toExponential(2);
    }
    return value.toLocaleString('pl-PL');
  }
  return String(value);
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'FRESH':
      return 'text-green-600';
    case 'OUTDATED':
      return 'text-amber-600';
    case 'NONE':
    default:
      return 'text-gray-500';
  }
}

export default CaseCompareView;
