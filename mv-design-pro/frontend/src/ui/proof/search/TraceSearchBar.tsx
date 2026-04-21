/**
 * TraceSearchBar — Pasek wyszukiwania i filtrów śladu obliczeń
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF-like nawigacja i wyszukiwanie
 * - wizard_screens.md: RESULT_VIEW mode, Polish labels
 *
 * FEATURES:
 * - Pole wyszukiwania z ikoną
 * - Filtry po fazie i "tylko problemy"
 * - Nawigacja wyników (prev/next) z licznikiem
 * - testID dla każdego elementu
 *
 * NOTE: Nazwy kodowe NIGDY nie są pokazywane w UI.
 */

import { useCallback } from 'react';
import type { TraceFilterOptions, SearchMatch } from './traceSearch';
import { PHASE_LABELS } from './traceSearch';

// =============================================================================
// Types
// =============================================================================

interface TraceSearchBarProps {
  /** Aktualna fraza wyszukiwania */
  query: string;
  /** Handler zmiany frazy */
  onQueryChange: (query: string) => void;
  /** Aktualne filtry */
  filters: TraceFilterOptions;
  /** Handler zmiany filtrów */
  onFiltersChange: (filters: TraceFilterOptions) => void;
  /** Wyniki wyszukiwania */
  results: SearchMatch[];
  /** Indeks aktywnego wyniku */
  activeResultIndex: number;
  /** Handler nawigacji do wyniku */
  onNavigateToResult: (index: number) => void;
  /** Dostępne fazy do filtrowania */
  availablePhases: string[];
  /** Czy pokazywać filtr "tylko problemy" */
  showProblemsFilter: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function TraceSearchBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  results,
  activeResultIndex,
  onNavigateToResult,
  availablePhases,
  showProblemsFilter,
}: TraceSearchBarProps) {
  // Nawigacja prev/next
  const handlePrev = useCallback(() => {
    if (results.length === 0) return;
    const newIndex = (activeResultIndex - 1 + results.length) % results.length;
    onNavigateToResult(newIndex);
  }, [results.length, activeResultIndex, onNavigateToResult]);

  const handleNext = useCallback(() => {
    if (results.length === 0) return;
    const newIndex = (activeResultIndex + 1) % results.length;
    onNavigateToResult(newIndex);
  }, [results.length, activeResultIndex, onNavigateToResult]);

  // Zmiana fazy
  const handlePhaseChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onFiltersChange({
        ...filters,
        phase: value === '' ? null : value,
      });
    },
    [filters, onFiltersChange]
  );

  // Zmiana "tylko problemy"
  const handleProblemsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({
        ...filters,
        onlyProblems: e.target.checked,
      });
    },
    [filters, onFiltersChange]
  );

  const hasResults = results.length > 0;
  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Górny rząd: Wyszukiwarka + nawigacja */}
      <div className="flex items-center gap-3">
        {/* Pole wyszukiwania */}
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg
              className="h-4 w-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Szukaj w śladzie obliczeń..."
            aria-label="Szukaj w śladzie obliczeń"
            data-testid="trace-search-input"
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Licznik wyników i nawigacja */}
        {hasQuery && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="text-sm text-slate-600 min-w-[80px] text-center"
              data-testid="trace-search-count"
            >
              {hasResults
                ? `${activeResultIndex + 1} z ${results.length}`
                : 'Brak wyników'}
            </span>

            <button
              type="button"
              onClick={handlePrev}
              disabled={!hasResults}
              aria-label="Poprzedni wynik"
              data-testid="trace-search-prev"
              className={`
                p-1.5 rounded border transition-colors
                ${
                  hasResults
                    ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                }
              `}
            >
              <svg
                className="h-4 w-4"
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
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!hasResults}
              aria-label="Następny wynik"
              data-testid="trace-search-next"
              className={`
                p-1.5 rounded border transition-colors
                ${
                  hasResults
                    ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                }
              `}
            >
              <svg
                className="h-4 w-4"
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
        )}
      </div>

      {/* Dolny rząd: Filtry */}
      <div className="flex items-center gap-4">
        {/* Filtr po fazie */}
        {availablePhases.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="phase-filter"
              className="text-sm text-slate-600"
            >
              Faza:
            </label>
            <select
              id="phase-filter"
              value={filters.phase ?? ''}
              onChange={handlePhaseChange}
              data-testid="trace-filter-phase"
              className="rounded-md border border-slate-200 bg-white py-1.5 px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Wszystkie</option>
              {availablePhases.map((phase) => (
                <option key={phase} value={phase}>
                  {PHASE_LABELS[phase] ?? phase}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filtr "tylko problemy" */}
        {showProblemsFilter && (
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.onlyProblems}
              onChange={handleProblemsChange}
              data-testid="trace-filter-problems"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Tylko problemy
          </label>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Search Result Item (dla listy wyników)
// =============================================================================

interface SearchResultItemProps {
  /** Wynik wyszukiwania */
  match: SearchMatch;
  /** Tytuł kroku */
  stepTitle: string;
  /** Czy aktywny */
  isActive: boolean;
  /** Handler kliknięcia */
  onClick: () => void;
}

export function SearchResultItem({
  match,
  stepTitle,
  isActive,
  onClick,
}: SearchResultItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`trace-search-result-${match.stepIndex}`}
      className={`
        w-full text-left px-3 py-2 text-sm transition-colors
        ${
          isActive
            ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600'
            : 'text-slate-700 hover:bg-slate-50 border-l-2 border-transparent'
        }
      `}
    >
      <div className="flex items-center gap-2">
        <span
          className={`
            flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium
            ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}
          `}
        >
          {match.stepIndex + 1}
        </span>
        <span className="truncate">{stepTitle}</span>
      </div>
      {/* Pokaż dopasowane pole */}
      {match.matchedFields.length > 0 && (
        <div className="mt-1 ml-7 text-xs text-slate-500 truncate">
          {match.matchedFields[0].field === 'formula_latex'
            ? 'Wzór'
            : match.matchedFields[0].field === 'inputs'
              ? 'Dane wejściowe'
              : match.matchedFields[0].field === 'result'
                ? 'Wynik'
                : match.matchedFields[0].field}
        </div>
      )}
    </button>
  );
}
