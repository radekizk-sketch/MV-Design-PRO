/**
 * FIX-03 — Results Filters Component
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Filterable tables
 * - wizard_screens.md: RESULT_VIEW mode
 * - 100% Polish UI
 *
 * FEATURES:
 * - Search input (fuzzy text filter)
 * - Status/severity dropdown filter
 * - Value range filters (min/max)
 * - Clear filters button
 */

import { useCallback } from 'react';
import type { FilterState, ResultsViewMode } from './types';
import { RESULTS_BROWSER_LABELS, STATUS_LABELS, SEVERITY_LABELS } from './types';

// =============================================================================
// Types
// =============================================================================

interface ResultsFiltersProps {
  /** Current filter state */
  filters: FilterState;
  /** Filter change handler */
  onChange: (filters: FilterState) => void;
  /** Current view mode (determines available filters) */
  viewMode: ResultsViewMode;
  /** Test ID prefix */
  testId?: string;
}

// =============================================================================
// Filter Option Types
// =============================================================================

interface StatusOption {
  value: string;
  label: string;
}

// =============================================================================
// Status Options by View Mode
// =============================================================================

function getStatusOptions(viewMode: ResultsViewMode): StatusOption[] {
  switch (viewMode) {
    case 'bus_voltages':
    case 'branch_flows':
      return [
        { value: 'ALL', label: RESULTS_BROWSER_LABELS.filters.status_all },
        { value: 'PASS', label: STATUS_LABELS.PASS },
        { value: 'WARNING', label: STATUS_LABELS.WARNING },
        { value: 'FAIL', label: STATUS_LABELS.FAIL },
      ];

    case 'violations':
      return [
        { value: 'ALL', label: RESULTS_BROWSER_LABELS.filters.status_all },
        { value: 'HIGH', label: SEVERITY_LABELS.HIGH },
        { value: 'WARN', label: SEVERITY_LABELS.WARN },
        { value: 'INFO', label: SEVERITY_LABELS.INFO },
      ];

    case 'losses':
    case 'convergence':
    case 'white_box':
    default:
      return [];
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function ResultsFilters({
  filters,
  onChange,
  viewMode,
  testId = 'results-filters',
}: ResultsFiltersProps) {
  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...filters,
        searchQuery: e.target.value,
      });
    },
    [filters, onChange]
  );

  // Handle status filter change
  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({
        ...filters,
        statusFilter: e.target.value === 'ALL' ? undefined : e.target.value,
      });
    },
    [filters, onChange]
  );

  // Handle min value change
  const handleMinValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value ? parseFloat(e.target.value) : undefined;
      onChange({
        ...filters,
        minValue: value,
      });
    },
    [filters, onChange]
  );

  // Handle max value change
  const handleMaxValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value ? parseFloat(e.target.value) : undefined;
      onChange({
        ...filters,
        maxValue: value,
      });
    },
    [filters, onChange]
  );

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    onChange({});
  }, [onChange]);

  // Check if any filters are active
  const hasActiveFilters =
    !!filters.searchQuery ||
    !!filters.statusFilter ||
    filters.minValue !== undefined ||
    filters.maxValue !== undefined;

  // Get status options for current view
  const statusOptions = getStatusOptions(viewMode);
  const showStatusFilter = statusOptions.length > 0;

  // Show value range for numeric views
  const showValueRange = viewMode === 'bus_voltages' || viewMode === 'branch_flows';

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid={testId}>
      {/* Search input */}
      <div className="flex-1 min-w-[200px]">
        <input
          type="search"
          value={filters.searchQuery ?? ''}
          onChange={handleSearchChange}
          placeholder={RESULTS_BROWSER_LABELS.filters.search_placeholder}
          aria-label={RESULTS_BROWSER_LABELS.actions.filter}
          data-testid={`${testId}-search`}
          className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        />
      </div>

      {/* Status filter dropdown */}
      {showStatusFilter && (
        <div className="min-w-[150px]">
          <select
            value={filters.statusFilter ?? 'ALL'}
            onChange={handleStatusChange}
            aria-label="Filtr statusu"
            data-testid={`${testId}-status`}
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Value range filters */}
      {showValueRange && (
        <>
          <div className="w-24">
            <input
              type="number"
              value={filters.minValue ?? ''}
              onChange={handleMinValueChange}
              placeholder={RESULTS_BROWSER_LABELS.filters.min_value}
              aria-label={RESULTS_BROWSER_LABELS.filters.min_value}
              data-testid={`${testId}-min`}
              step="any"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            />
          </div>
          <span className="text-slate-400">—</span>
          <div className="w-24">
            <input
              type="number"
              value={filters.maxValue ?? ''}
              onChange={handleMaxValueChange}
              placeholder={RESULTS_BROWSER_LABELS.filters.max_value}
              aria-label={RESULTS_BROWSER_LABELS.filters.max_value}
              data-testid={`${testId}-max`}
              step="any"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            />
          </div>
        </>
      )}

      {/* Clear filters button */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClearFilters}
          data-testid={`${testId}-clear`}
          className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {RESULTS_BROWSER_LABELS.actions.clear_filters}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Quick Filter Buttons (Optional Enhancement)
// =============================================================================

interface QuickFilterProps {
  /** Label for the button */
  label: string;
  /** Whether this filter is active */
  isActive: boolean;
  /** Click handler */
  onClick: () => void;
  /** Badge count (optional) */
  count?: number;
  /** Badge color class */
  badgeColor?: string;
}

export function QuickFilterButton({
  label,
  isActive,
  onClick,
  count,
  badgeColor = 'bg-slate-100 text-slate-600',
}: QuickFilterProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
            isActive ? 'bg-blue-100 text-blue-700' : badgeColor
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// =============================================================================
// Violations Quick Filters
// =============================================================================

interface ViolationQuickFiltersProps {
  /** Current severity filter */
  currentFilter: string | undefined;
  /** Filter change handler */
  onChange: (severity: string | undefined) => void;
  /** Counts by severity */
  counts: { high: number; warn: number; info: number };
}

export function ViolationQuickFilters({
  currentFilter,
  onChange,
  counts,
}: ViolationQuickFiltersProps) {
  return (
    <div className="flex items-center gap-2" data-testid="violation-quick-filters">
      <span className="text-sm text-slate-500">Szybkie filtry:</span>
      <QuickFilterButton
        label="Wszystkie"
        isActive={!currentFilter}
        onClick={() => onChange(undefined)}
        count={counts.high + counts.warn + counts.info}
      />
      <QuickFilterButton
        label={SEVERITY_LABELS.HIGH}
        isActive={currentFilter === 'HIGH'}
        onClick={() => onChange('HIGH')}
        count={counts.high}
        badgeColor="bg-rose-100 text-rose-700"
      />
      <QuickFilterButton
        label={SEVERITY_LABELS.WARN}
        isActive={currentFilter === 'WARN'}
        onClick={() => onChange('WARN')}
        count={counts.warn}
        badgeColor="bg-amber-100 text-amber-700"
      />
      <QuickFilterButton
        label={SEVERITY_LABELS.INFO}
        isActive={currentFilter === 'INFO'}
        onClick={() => onChange('INFO')}
        count={counts.info}
        badgeColor="bg-slate-100 text-slate-600"
      />
    </div>
  );
}
