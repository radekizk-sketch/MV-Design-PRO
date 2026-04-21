/**
 * TraceCompareView — Główny widok porównania śladów obliczeń
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Porównanie Case/Run A vs B
 * - wizard_screens.md: Polish labels
 * - SYSTEM_SPEC.md: READ-ONLY display
 *
 * LAYOUT:
 * - Nagłówek: wybór A/B, zamiana, nawigacja next/prev, eksport
 * - Lewy panel: Lista diff (TraceDiffList)
 * - Środek: Widok kroku A (TraceStepView)
 * - Prawy: Widok kroku B (TraceStepView)
 *
 * FEATURES:
 * - Wybór dwóch run'ów do porównania (dropdowny)
 * - Przycisk zamiany A↔B
 * - Nawigacja: następna/poprzednia zmiana
 * - Filtrowanie (wszystkie / tylko zmiany)
 * - Eksport porównania do JSON
 * - Podświetlanie różnic w polach
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { ExtendedTrace, TraceStep } from '../../results-inspector/types';
import type { TraceComparisonResult, TraceDiffFilter, TraceDiffStep } from './types';
import { diffTraces, findNextChange, findPrevChange } from './diffTrace';
import { downloadDiffJson } from './exportDiffJson';
import { TraceDiffList } from './TraceDiffList';
import { TraceStepView } from '../TraceStepView';

// =============================================================================
// Types
// =============================================================================

interface RunOption {
  run_id: string;
  label: string;
  case_name?: string;
}

interface TraceCompareViewProps {
  /**
   * Lista dostępnych run'ów do wyboru.
   */
  availableRuns: RunOption[];

  /**
   * Funkcja do pobierania trace dla run_id.
   * Powinna zwracać ExtendedTrace lub null jeśli brak.
   */
  fetchTrace: (runId: string) => Promise<ExtendedTrace | null>;

  /**
   * Opcjonalnie: początkowy run A.
   */
  initialRunA?: string | null;

  /**
   * Opcjonalnie: początkowy run B.
   */
  initialRunB?: string | null;
}

// =============================================================================
// Sub-Components
// =============================================================================

interface RunSelectorProps {
  label: string;
  value: string | null;
  onChange: (runId: string | null) => void;
  options: RunOption[];
  disabled?: boolean;
  testId: string;
}

function RunSelector({
  label,
  value,
  onChange,
  options,
  disabled,
  testId,
}: RunSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-slate-600">{label}:</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
        data-testid={testId}
      >
        <option value="">— Wybierz —</option>
        {options.map((opt) => (
          <option key={opt.run_id} value={opt.run_id}>
            {opt.label}
            {opt.case_name && ` (${opt.case_name})`}
          </option>
        ))}
      </select>
    </div>
  );
}

interface NavigationButtonsProps {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  changesCount: number;
  currentChangeIndex: number | null;
}

function NavigationButtons({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  changesCount,
  currentChangeIndex,
}: NavigationButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="trace-diff-prev"
        title="Poprzednia zmiana"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Poprzednia
      </button>

      {changesCount > 0 && (
        <span className="text-xs text-slate-500">
          {currentChangeIndex !== null ? currentChangeIndex + 1 : '—'} / {changesCount}
        </span>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="trace-diff-next"
        title="Następna zmiana"
      >
        Następna
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
    </div>
  );
}

interface DiffSummaryProps {
  result: TraceComparisonResult;
}

function DiffSummary({ result }: DiffSummaryProps) {
  const { summary } = result;

  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="text-slate-500">
        Razem: <strong>{summary.total_steps}</strong> kroków
      </span>
      {summary.changed_count > 0 && (
        <span className="text-amber-600">
          Zmieniono: <strong>{summary.changed_count}</strong>
        </span>
      )}
      {summary.added_count > 0 && (
        <span className="text-green-600">
          Dodano: <strong>{summary.added_count}</strong>
        </span>
      )}
      {summary.removed_count > 0 && (
        <span className="text-red-600">
          Usunięto: <strong>{summary.removed_count}</strong>
        </span>
      )}
      {summary.unchanged_count === summary.total_steps && (
        <span className="text-green-600 font-medium">
          Brak różnic
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Step Detail View with Diff Highlighting
// =============================================================================

interface StepDiffViewProps {
  step: TraceStep | null;
  stepIndex: number | null;
  label: string;
  diffStep: TraceDiffStep | null;
  side: 'A' | 'B';
}

function StepDiffView({ step, stepIndex, label, diffStep, side }: StepDiffViewProps) {
  if (!step || stepIndex === null) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center p-4">
          <p className="text-sm text-slate-500">
            {diffStep?.status === 'REMOVED' && side === 'B' && 'Krok usunięty w B'}
            {diffStep?.status === 'ADDED' && side === 'A' && 'Krok dodany w B'}
            {!diffStep && 'Wybierz krok do porównania'}
          </p>
        </div>
      </div>
    );
  }

  // Podświetl zmienione pola
  const changedFields = diffStep?.field_diffs
    .filter((d) => d.is_changed)
    .map((d) => d.field) ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Nagłówek panelu */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 bg-slate-50">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {changedFields.length > 0 && (
          <span className="ml-2 text-xs text-amber-600">
            ({changedFields.length} zmian)
          </span>
        )}
      </div>

      {/* Treść kroku */}
      <div className="flex-1 overflow-y-auto">
        <TraceStepView step={step} stepIndex={stepIndex} />
      </div>
    </div>
  );
}

// =============================================================================
// Loading & Empty States
// =============================================================================

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        <p className="mt-3 text-sm text-slate-600">Ładowanie śladów obliczeń...</p>
      </div>
    </div>
  );
}

function SelectionPrompt() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <p className="text-slate-600 font-medium">Porównaj ślady obliczeń</p>
        <p className="text-sm text-slate-400 mt-1">
          Wybierz dwa przebiegi (A i B) do porównania
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function TraceCompareView({
  availableRuns,
  fetchTrace,
  initialRunA,
  initialRunB,
}: TraceCompareViewProps) {
  // Selection state
  const [runIdA, setRunIdA] = useState<string | null>(initialRunA ?? null);
  const [runIdB, setRunIdB] = useState<string | null>(initialRunB ?? null);

  // Loaded traces
  const [traceA, setTraceA] = useState<ExtendedTrace | null>(null);
  const [traceB, setTraceB] = useState<ExtendedTrace | null>(null);

  // Loading state
  const [isLoadingA, setIsLoadingA] = useState(false);
  const [isLoadingB, setIsLoadingB] = useState(false);

  // UI state
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<TraceDiffFilter>('ALL');

  // ==========================================================================
  // Load traces when selection changes
  // ==========================================================================
  useEffect(() => {
    if (!runIdA) {
      setTraceA(null);
      return;
    }

    setIsLoadingA(true);
    fetchTrace(runIdA)
      .then((trace) => {
        setTraceA(trace);
      })
      .catch((err) => {
        console.error('Błąd pobierania trace A:', err);
        setTraceA(null);
      })
      .finally(() => {
        setIsLoadingA(false);
      });
  }, [runIdA, fetchTrace]);

  useEffect(() => {
    if (!runIdB) {
      setTraceB(null);
      return;
    }

    setIsLoadingB(true);
    fetchTrace(runIdB)
      .then((trace) => {
        setTraceB(trace);
      })
      .catch((err) => {
        console.error('Błąd pobierania trace B:', err);
        setTraceB(null);
      })
      .finally(() => {
        setIsLoadingB(false);
      });
  }, [runIdB, fetchTrace]);

  // ==========================================================================
  // Compute diff
  // ==========================================================================
  const comparisonResult = useMemo(() => {
    if (!traceA || !traceB) return null;
    return diffTraces(traceA, traceB);
  }, [traceA, traceB]);

  // ==========================================================================
  // Get selected step
  // ==========================================================================
  const selectedDiffStep = useMemo(() => {
    if (selectedStepIndex === null || !comparisonResult) return null;
    return comparisonResult.steps[selectedStepIndex] ?? null;
  }, [comparisonResult, selectedStepIndex]);

  // ==========================================================================
  // Navigation
  // ==========================================================================
  const changeIndices = useMemo(() => {
    if (!comparisonResult) return [];
    return comparisonResult.steps
      .map((step, idx) => (step.status !== 'UNCHANGED' ? idx : -1))
      .filter((idx) => idx >= 0);
  }, [comparisonResult]);

  const currentChangeIndex = useMemo(() => {
    if (selectedStepIndex === null) return null;
    const idx = changeIndices.indexOf(selectedStepIndex);
    return idx >= 0 ? idx : null;
  }, [changeIndices, selectedStepIndex]);

  const handlePrevChange = useCallback(() => {
    if (!comparisonResult) return;
    const prevIdx = findPrevChange(comparisonResult.steps, selectedStepIndex ?? 0);
    if (prevIdx !== null) {
      setSelectedStepIndex(prevIdx);
    }
  }, [comparisonResult, selectedStepIndex]);

  const handleNextChange = useCallback(() => {
    if (!comparisonResult) return;
    const nextIdx = findNextChange(
      comparisonResult.steps,
      selectedStepIndex ?? -1
    );
    if (nextIdx !== null) {
      setSelectedStepIndex(nextIdx);
    }
  }, [comparisonResult, selectedStepIndex]);

  const hasPrevChange = useMemo(() => {
    if (!comparisonResult || selectedStepIndex === null) return changeIndices.length > 0;
    return findPrevChange(comparisonResult.steps, selectedStepIndex) !== null;
  }, [comparisonResult, selectedStepIndex, changeIndices]);

  const hasNextChange = useMemo(() => {
    if (!comparisonResult) return false;
    return findNextChange(comparisonResult.steps, selectedStepIndex ?? -1) !== null;
  }, [comparisonResult, selectedStepIndex]);

  // ==========================================================================
  // Handlers
  // ==========================================================================
  const handleSwapRuns = useCallback(() => {
    const tempA = runIdA;
    setRunIdA(runIdB);
    setRunIdB(tempA);
    setSelectedStepIndex(null);
  }, [runIdA, runIdB]);

  const handleExportJson = useCallback(() => {
    if (!comparisonResult) return;
    downloadDiffJson(comparisonResult);
  }, [comparisonResult]);

  const handleSelectStep = useCallback((index: number) => {
    setSelectedStepIndex(index);
  }, []);

  // ==========================================================================
  // Render
  // ==========================================================================
  const isLoading = isLoadingA || isLoadingB;
  const hasSelection = runIdA && runIdB;
  const hasComparison = comparisonResult !== null;

  return (
    <div className="flex flex-col h-full bg-slate-50" data-testid="trace-compare-view">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Porównaj ślad obliczeń
            </h2>
            <p className="text-sm text-slate-500">
              Wybierz dwa przebiegi A i B do porównania
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export JSON */}
            {hasComparison && (
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                data-testid="trace-diff-export-json"
                title="Eksportuj porównanie do JSON"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Eksportuj JSON
              </button>
            )}
            {/* Read-only badge */}
            <span className="inline-flex items-center rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              Tylko do odczytu
            </span>
          </div>
        </div>

        {/* Run selectors */}
        <div className="flex items-center gap-4 flex-wrap">
          <RunSelector
            label="A"
            value={runIdA}
            onChange={setRunIdA}
            options={availableRuns}
            disabled={isLoading}
            testId="trace-compare-select-a"
          />

          {/* Swap button */}
          <button
            type="button"
            onClick={handleSwapRuns}
            disabled={!runIdA || !runIdB || isLoading}
            className="p-1.5 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Zamień A ↔ B"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </button>

          <RunSelector
            label="B"
            value={runIdB}
            onChange={setRunIdB}
            options={availableRuns}
            disabled={isLoading}
            testId="trace-compare-select-b"
          />

          {/* Separator */}
          {hasComparison && (
            <>
              <div className="h-6 w-px bg-slate-200" />
              <NavigationButtons
                onPrev={handlePrevChange}
                onNext={handleNextChange}
                hasPrev={hasPrevChange}
                hasNext={hasNextChange}
                changesCount={changeIndices.length}
                currentChangeIndex={currentChangeIndex}
              />
            </>
          )}
        </div>

        {/* Summary */}
        {hasComparison && (
          <div className="mt-3">
            <DiffSummary result={comparisonResult} />
          </div>
        )}
      </header>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : !hasSelection ? (
        <SelectionPrompt />
      ) : !hasComparison ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-slate-500">
            Nie można wygenerować porównania. Sprawdź czy oba przebiegi mają ślad obliczeń.
          </p>
        </div>
      ) : (
        /* 3-panelowy układ */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
          {/* Lewy panel: Lista diff */}
          <div className="lg:col-span-3 border-r border-slate-200 bg-white overflow-hidden">
            <TraceDiffList
              steps={comparisonResult.steps}
              activeIndex={selectedStepIndex}
              onSelectStep={handleSelectStep}
              filter={filter}
              onFilterChange={setFilter}
            />
          </div>

          {/* Środkowy panel: Widok A */}
          <div className="lg:col-span-4 border-r border-slate-200 bg-white overflow-hidden">
            <StepDiffView
              step={selectedDiffStep?.step_a ?? null}
              stepIndex={selectedDiffStep?.index_a ?? null}
              label="Przebieg A"
              diffStep={selectedDiffStep}
              side="A"
            />
          </div>

          {/* Prawy panel: Widok B */}
          <div className="lg:col-span-5 bg-white overflow-hidden">
            <StepDiffView
              step={selectedDiffStep?.step_b ?? null}
              stepIndex={selectedDiffStep?.index_b ?? null}
              label="Przebieg B"
              diffStep={selectedDiffStep}
              side="B"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Standalone Version (with built-in trace fetching)
// =============================================================================

interface TraceComparePageProps {
  /**
   * Lista dostępnych run'ów.
   */
  availableRuns: RunOption[];

  /**
   * API base URL dla fetchowania trace.
   */
  apiBase?: string;
}

/**
 * Wersja strony z wbudowanym fetchowaniem trace.
 */
export function TraceComparePage({
  availableRuns,
  apiBase = '/api',
}: TraceComparePageProps) {
  const fetchTrace = useCallback(
    async (runId: string): Promise<ExtendedTrace | null> => {
      try {
        const response = await fetch(
          `${apiBase}/analysis-runs/${runId}/results/trace`
        );
        if (!response.ok) {
          console.error(`Błąd pobierania trace: ${response.statusText}`);
          return null;
        }
        return response.json();
      } catch (error) {
        console.error('Błąd pobierania trace:', error);
        return null;
      }
    },
    [apiBase]
  );

  return (
    <TraceCompareView
      availableRuns={availableRuns}
      fetchTrace={fetchTrace}
    />
  );
}
