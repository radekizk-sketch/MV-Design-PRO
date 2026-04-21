/**
 * TraceDiffList — Lista kroków porównania ze statusem diff
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Lista zmian z filtrowaniem
 * - wizard_screens.md: Polish labels
 * - SYSTEM_SPEC.md: READ-ONLY display
 *
 * FEATURES:
 * - Lista kroków z kolorowym statusem diff
 * - Filtrowanie (Wszystkie / Tylko zmiany / Zmienione / Dodane / Usunięte)
 * - Klik w wiersz → nawigacja do kroku
 * - Podświetlenie aktywnego wiersza
 */

import { useMemo } from 'react';
import type {
  TraceDiffStep,
  TraceDiffStatus,
  TraceDiffFilter,
} from './types';
import {
  TRACE_DIFF_STATUS_LABELS,
  TRACE_DIFF_STATUS_COLORS,
  TRACE_DIFF_STATUS_BORDER,
  TRACE_DIFF_FILTER_LABELS,
} from './types';
import { filterDiffSteps } from './diffTrace';

// =============================================================================
// Sub-Components
// =============================================================================

interface DiffStatusBadgeProps {
  status: TraceDiffStatus;
}

function DiffStatusBadge({ status }: DiffStatusBadgeProps) {
  const label = TRACE_DIFF_STATUS_LABELS[status];
  const colors = TRACE_DIFF_STATUS_COLORS[status];

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colors}`}
    >
      {label}
    </span>
  );
}

interface DiffRowProps {
  step: TraceDiffStep;
  isActive: boolean;
  onClick: () => void;
}

function DiffRow({ step, isActive, onClick }: DiffRowProps) {
  const borderColor = TRACE_DIFF_STATUS_BORDER[step.status];
  const bgColor = isActive ? 'bg-blue-50' : 'hover:bg-slate-50';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 border-l-4 ${borderColor} ${bgColor} transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset`}
      data-testid={`trace-diff-row-${step.step_key}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {step.display_step !== null && (
              <span className="text-xs font-mono text-slate-400 flex-shrink-0">
                #{step.display_step}
              </span>
            )}
            <span className="text-sm text-slate-700 truncate">
              {step.display_title}
            </span>
          </div>
          {step.phase && (
            <span className="text-xs text-slate-400 mt-0.5 block">
              {step.phase}
            </span>
          )}
        </div>
        <div className="flex-shrink-0">
          <DiffStatusBadge status={step.status} />
        </div>
      </div>
      {/* Pokaż liczbę zmienionych pól dla CHANGED */}
      {step.status === 'CHANGED' && step.field_diffs.length > 0 && (
        <div className="mt-1 text-xs text-amber-600">
          {step.field_diffs.filter((d) => d.is_changed).length} zmian(y)
        </div>
      )}
    </button>
  );
}

// =============================================================================
// Filter Bar
// =============================================================================

interface FilterBarProps {
  filter: TraceDiffFilter;
  onFilterChange: (filter: TraceDiffFilter) => void;
  totalCount: number;
  filteredCount: number;
  changesCount: number;
}

function FilterBar({
  filter,
  onFilterChange,
  totalCount,
  filteredCount,
  changesCount,
}: FilterBarProps) {
  const filters: TraceDiffFilter[] = ['ALL', 'CHANGES', 'CHANGED', 'ADDED', 'REMOVED'];

  return (
    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
      <div className="flex items-center gap-1 flex-wrap">
        {filters.map((f) => {
          const isActive = filter === f;
          const label = TRACE_DIFF_FILTER_LABELS[f];

          return (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-slate-500">
        {filteredCount} z {totalCount} kroków
        {changesCount > 0 && (
          <span className="ml-2 text-amber-600">
            ({changesCount} zmian)
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface TraceDiffListProps {
  steps: TraceDiffStep[];
  activeIndex: number | null;
  onSelectStep: (index: number) => void;
  filter: TraceDiffFilter;
  onFilterChange: (filter: TraceDiffFilter) => void;
}

export function TraceDiffList({
  steps,
  activeIndex,
  onSelectStep,
  filter,
  onFilterChange,
}: TraceDiffListProps) {
  // Filtruj kroki
  const filteredSteps = useMemo(
    () => filterDiffSteps(steps, filter),
    [steps, filter]
  );

  // Liczba zmian (nie-UNCHANGED)
  const changesCount = useMemo(
    () => steps.filter((s) => s.status !== 'UNCHANGED').length,
    [steps]
  );

  // Mapa: step_key → indeks w oryginalnej tablicy (dla nawigacji)
  const keyToOriginalIndex = useMemo(() => {
    const map = new Map<string, number>();
    steps.forEach((step, idx) => {
      map.set(step.step_key, idx);
    });
    return map;
  }, [steps]);

  if (steps.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-slate-500">Brak kroków do porównania</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filtr */}
      <FilterBar
        filter={filter}
        onFilterChange={onFilterChange}
        totalCount={steps.length}
        filteredCount={filteredSteps.length}
        changesCount={changesCount}
      />

      {/* Lista kroków */}
      <div className="flex-1 overflow-y-auto">
        {filteredSteps.length === 0 ? (
          <div className="flex items-center justify-center p-4 h-full">
            <p className="text-sm text-slate-500">
              Brak kroków pasujących do filtra
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSteps.map((step) => {
              const originalIndex = keyToOriginalIndex.get(step.step_key) ?? 0;
              const isActive = activeIndex === originalIndex;

              return (
                <DiffRow
                  key={step.step_key}
                  step={step}
                  isActive={isActive}
                  onClick={() => onSelectStep(originalIndex)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
