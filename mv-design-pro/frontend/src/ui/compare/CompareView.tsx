/**
 * Compare View — Main Compare Cases UI
 *
 * CANONICAL ALIGNMENT:
 * - P10: Study Cases comparison (Case A vs Case B)
 * - READ-ONLY: No physics calculations
 * - UI 100% po polsku
 *
 * FEATURES:
 * - Case A / Case B dropdown selectors
 * - Compare button
 * - Tabs: Wyniki (Results) | Diagnostyka (Diagnostics)
 * - "Show only changes" filter
 */

import { useEffect } from 'react';
import { useCompareCasesStore, useHasComparison, useIsComparing } from './store';
import { useStudyCasesStore, useSortedCases } from '../study-cases/store';
import { CompareResultsTable } from './CompareResultsTable';
import { CompareDiagnostics } from './CompareDiagnostics';
import type { CompareViewTab } from './types';
import { COMPARE_TAB_LABELS } from './types';

// =============================================================================
// Case Selector Component
// =============================================================================

interface CaseSelectorProps {
  label: string;
  selectedCaseId: string | null;
  selectedCaseName: string | null;
  onChange: (caseId: string, caseName: string) => void;
  excludeCaseId?: string | null;
}

function CaseSelector({
  label,
  selectedCaseId,
  selectedCaseName,
  onChange,
  excludeCaseId,
}: CaseSelectorProps) {
  const cases = useSortedCases();
  const filteredCases = excludeCaseId
    ? cases.filter((c) => c.id !== excludeCaseId)
    : cases;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <select
        value={selectedCaseId || ''}
        onChange={(e) => {
          const selected = cases.find((c) => c.id === e.target.value);
          if (selected) {
            onChange(selected.id, selected.name);
          }
        }}
        className="rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <option value="">— Wybierz wariant pracy —</option>
        {filteredCases.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} {c.is_active ? '(aktywny)' : ''}
          </option>
        ))}
      </select>
      {selectedCaseName && (
        <p className="text-xs text-slate-500">Wybrany: {selectedCaseName}</p>
      )}
    </div>
  );
}

// =============================================================================
// Loading Spinner
// =============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <span className="ml-3 text-slate-600">Ładowanie porównania...</span>
    </div>
  );
}

// =============================================================================
// Tab Navigation
// =============================================================================

function TabNavigation() {
  const activeTab = useCompareCasesStore((s) => s.activeTab);
  const setActiveTab = useCompareCasesStore((s) => s.setActiveTab);
  const summary = useCompareCasesStore((s) => s.summary);

  const tabs: CompareViewTab[] = ['RESULTS', 'DIAGNOSTICS'];

  const getChangeCount = (tab: CompareViewTab): number => {
    if (!summary) return 0;
    if (tab === 'RESULTS') {
      return (
        summary.changed_buses +
        summary.only_in_a_buses +
        summary.only_in_b_buses +
        summary.changed_branches +
        summary.only_in_a_branches +
        summary.only_in_b_branches
      );
    }
    return summary.new_diagnostics + summary.gone_diagnostics + summary.changed_severity;
  };

  return (
    <div className="flex gap-2 border-b border-slate-200">
      {tabs.map((tab) => {
        const changeCount = getChangeCount(tab);
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {COMPARE_TAB_LABELS[tab]}
            {changeCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                {changeCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Comparison Controls
// =============================================================================

function ComparisonControls() {
  const caseAId = useCompareCasesStore((s) => s.caseAId);
  const caseBId = useCompareCasesStore((s) => s.caseBId);
  const caseAName = useCompareCasesStore((s) => s.caseAName);
  const caseBName = useCompareCasesStore((s) => s.caseBName);
  const setCaseA = useCompareCasesStore((s) => s.setCaseA);
  const setCaseB = useCompareCasesStore((s) => s.setCaseB);
  const compare = useCompareCasesStore((s) => s.compare);
  const showOnlyChanges = useCompareCasesStore((s) => s.showOnlyChanges);
  const setShowOnlyChanges = useCompareCasesStore((s) => s.setShowOnlyChanges);
  const isLoading = useIsComparing();
  const hasComparison = useHasComparison();
  const error = useCompareCasesStore((s) => s.error);

  const canCompare = caseAId && caseBId && caseAId !== caseBId && !isLoading;

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">
        Porównaj: wariant pracy A vs wariant pracy B
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <CaseSelector
          label="Wariant pracy A (bazowy)"
          selectedCaseId={caseAId}
          selectedCaseName={caseAName}
          onChange={setCaseA}
          excludeCaseId={caseBId}
        />
        <CaseSelector
          label="Wariant pracy B (porównywany)"
          selectedCaseId={caseBId}
          selectedCaseName={caseBName}
          onChange={setCaseB}
          excludeCaseId={caseAId}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={compare}
          disabled={!canCompare}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isLoading ? 'Porównuję...' : 'Porównaj'}
        </button>

        {hasComparison && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showOnlyChanges}
              onChange={(e) => setShowOnlyChanges(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Pokaż tylko różnice
          </label>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <p className="font-semibold">Błąd</p>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Summary Banner
// =============================================================================

function SummaryBanner() {
  const summary = useCompareCasesStore((s) => s.summary);
  const caseAName = useCompareCasesStore((s) => s.caseAName);
  const caseBName = useCompareCasesStore((s) => s.caseBName);

  if (!summary) return null;

  const totalChanges =
    summary.changed_buses +
    summary.only_in_a_buses +
    summary.only_in_b_buses +
    summary.changed_branches +
    summary.only_in_a_branches +
    summary.only_in_b_branches +
    summary.new_diagnostics +
    summary.gone_diagnostics +
    summary.changed_severity;

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">
            Porównanie: <strong>{caseAName}</strong> vs <strong>{caseBName}</strong>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-semibold text-slate-900">{totalChanges}</p>
            <p className="text-xs text-slate-500">łącznie zmian</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-amber-600">
              {summary.changed_buses + summary.changed_branches}
            </p>
            <p className="text-xs text-slate-500">zmienionych wartości</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-red-600">
              {summary.new_diagnostics}
            </p>
            <p className="text-xs text-slate-500">nowych problemów</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-green-600">
              {summary.gone_diagnostics}
            </p>
            <p className="text-xs text-slate-500">usuniętych problemów</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main View
// =============================================================================

export function CompareView() {
  const isLoading = useIsComparing();
  const hasComparison = useHasComparison();
  const activeTab = useCompareCasesStore((s) => s.activeTab);
  const projectId = useStudyCasesStore((s) => s.projectId);
  const loadCases = useStudyCasesStore((s) => s.loadCases);

  // Load cases on mount if project is set
  useEffect(() => {
    if (projectId) {
      loadCases(projectId);
    }
  }, [projectId, loadCases]);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Porównanie przypadków
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">
                Porównanie wyników i diagnostyki
              </h1>
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              Tylko do odczytu
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        {/* Controls */}
        <ComparisonControls />

        {/* Loading */}
        {isLoading && <LoadingSpinner />}

        {/* Results */}
        {hasComparison && !isLoading && (
          <>
            <SummaryBanner />

            <TabNavigation />

            <div className="mt-6">
              {activeTab === 'RESULTS' && <CompareResultsTable />}
              {activeTab === 'DIAGNOSTICS' && <CompareDiagnostics />}
            </div>
          </>
        )}

        {/* Empty state */}
        {!hasComparison && !isLoading && (
          <div className="rounded border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-500">
              Wybierz dwa przypadki i kliknij "Porównaj" aby zobaczyć różnice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
