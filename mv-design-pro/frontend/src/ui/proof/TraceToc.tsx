/**
 * TraceToc — Spis treści śladu obliczeń (lewy panel)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Panel nawigacji kroków
 * - wizard_screens.md: RESULT_VIEW mode, Polish labels
 *
 * FEATURES:
 * - Lista kroków z numeracją
 * - Podświetlenie aktywnego kroku
 * - Podświetlenie wyników wyszukiwania
 * - Filtrowanie po fazie i "tylko problemy"
 * - 100% Polish UI
 *
 * NOTE: Nazwy kodowe NIGDY nie są pokazywane w UI.
 */

import { useMemo } from 'react';
import type { TraceStep } from '../results-inspector/types';
import type { TraceFilterOptions, SearchMatch } from './search/traceSearch';
import { stepMatchesSearch } from './search/traceSearch';

// =============================================================================
// Types
// =============================================================================

interface TraceTocProps {
  steps: TraceStep[];
  selectedStepIndex: number | null;
  onSelectStep: (index: number) => void;
  searchQuery: string;
  filters: TraceFilterOptions;
  searchResults: SearchMatch[];
  activeResultIndex: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Pobierz tytuł kroku do wyświetlenia.
 * Priorytet: title > description > equation_id > "Krok N"
 */
function getStepTitle(step: TraceStep, index: number): string {
  if (step.title) return step.title;
  if (step.description) return step.description;
  if (step.equation_id) return step.equation_id;
  return `Krok ${index + 1}`;
}

/**
 * Pobierz fazę kroku do wyświetlenia (jeśli istnieje).
 */
function getStepPhase(step: TraceStep): string | null {
  return step.phase ?? null;
}

/**
 * Mapuj fazę na polski label.
 */
const PHASE_LABELS: Record<string, string> = {
  INITIALIZATION: 'Inicjalizacja',
  CALCULATION: 'Obliczenia',
  AGGREGATION: 'Agregacja',
  VALIDATION: 'Walidacja',
  OUTPUT: 'Wyniki',
};

function getPhaseLabel(phase: string | null): string | null {
  if (!phase) return null;
  return PHASE_LABELS[phase] ?? phase;
}

// =============================================================================
// Component
// =============================================================================

export function TraceToc({
  steps,
  selectedStepIndex,
  onSelectStep,
  searchQuery,
  filters,
  searchResults,
  activeResultIndex,
}: TraceTocProps) {
  // Filtruj kroki używając logiki z traceSearch
  const filteredSteps = useMemo(() => {
    return steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => stepMatchesSearch(step, searchQuery, filters));
  }, [steps, searchQuery, filters]);

  // Zestaw indeksów kroków pasujących do wyszukiwania (dla podświetlenia)
  const matchedStepIndices = useMemo(() => {
    return new Set(searchResults.map((r) => r.stepIndex));
  }, [searchResults]);

  // Aktywny wynik wyszukiwania (dla mocniejszego podświetlenia)
  const activeSearchStepIndex = useMemo(() => {
    if (searchResults.length === 0) return null;
    return searchResults[activeResultIndex]?.stepIndex ?? null;
  }, [searchResults, activeResultIndex]);

  // Grupuj kroki po fazie
  const groupedSteps = useMemo(() => {
    const groups: Map<string | null, { step: TraceStep; index: number }[]> = new Map();

    for (const item of filteredSteps) {
      const phase = getStepPhase(item.step);
      if (!groups.has(phase)) {
        groups.set(phase, []);
      }
      groups.get(phase)!.push(item);
    }

    return groups;
  }, [filteredSteps]);

  if (steps.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">
        Brak kroków do wyświetlenia.
      </div>
    );
  }

  return (
    <nav
      className="h-full overflow-y-auto"
      aria-label="Spis treści śladu obliczeń"
      data-testid="trace-toc"
    >
      <div className="p-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">
          Spis kroków
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {filteredSteps.length} z {steps.length} kroków
        </p>
      </div>

      <ul className="divide-y divide-slate-100">
        {Array.from(groupedSteps.entries()).map(([phase, items]) => (
          <li key={phase ?? 'no-phase'}>
            {/* Nagłówek fazy (jeśli istnieje) */}
            {phase && (
              <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-600 uppercase tracking-wide">
                {getPhaseLabel(phase)}
              </div>
            )}

            {/* Lista kroków w fazie */}
            <ul>
              {items.map(({ step, index }) => {
                const isSelected = selectedStepIndex === index;
                const isActiveSearchResult = activeSearchStepIndex === index;
                const isSearchMatch = matchedStepIndices.has(index) && searchQuery.trim().length > 0;
                const title = getStepTitle(step, index);

                // Styl przycisku zależny od stanu
                let buttonClasses = 'w-full text-left px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500';
                let numberClasses = 'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium';

                if (isSelected) {
                  buttonClasses += ' bg-blue-50 text-blue-700 border-l-2 border-blue-600';
                  numberClasses += ' bg-blue-600 text-white';
                } else if (isActiveSearchResult) {
                  // Aktywny wynik wyszukiwania (ale nie wybrany)
                  buttonClasses += ' bg-amber-50 text-amber-800 border-l-2 border-amber-500';
                  numberClasses += ' bg-amber-500 text-white';
                } else if (isSearchMatch) {
                  // Wynik wyszukiwania (nie aktywny)
                  buttonClasses += ' bg-yellow-50 text-slate-700 hover:bg-yellow-100 border-l-2 border-yellow-300';
                  numberClasses += ' bg-yellow-400 text-slate-800';
                } else {
                  buttonClasses += ' text-slate-700 hover:bg-slate-50 border-l-2 border-transparent';
                  numberClasses += ' bg-slate-200 text-slate-600';
                }

                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => onSelectStep(index)}
                      className={buttonClasses}
                      aria-current={isSelected ? 'true' : undefined}
                      data-testid={`trace-step-${index}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={numberClasses}>
                          {index + 1}
                        </span>
                        <span className="truncate">{title}</span>
                        {/* Ikona dopasowania dla wyników wyszukiwania */}
                        {isSearchMatch && (
                          <svg
                            className="flex-shrink-0 w-3.5 h-3.5 text-amber-600"
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
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
