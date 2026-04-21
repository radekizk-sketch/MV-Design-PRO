/**
 * FIX-03 — Results Table Component
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Deterministic sorting, filterable tables
 * - wizard_screens.md: RESULT_VIEW mode
 * - 100% Polish UI
 *
 * FEATURES:
 * - Generic table for any result type
 * - Sortable columns (click header)
 * - Row selection (for comparison)
 * - Status badges and loading indicators
 */

import { useMemo, useCallback } from 'react';
import type { ColumnDef, SortConfig, ResultStatus, Severity } from './types';
import { STATUS_COLORS, STATUS_LABELS, SEVERITY_COLORS, SEVERITY_LABELS, RESULTS_BROWSER_LABELS } from './types';

// =============================================================================
// Types
// =============================================================================

interface ResultsTableProps<T> {
  /** Table data rows */
  data: T[];
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Current sort configuration */
  sortConfig: SortConfig | null;
  /** Sort change handler */
  onSort: (config: SortConfig) => void;
  /** Row key extractor */
  getRowKey: (row: T) => string;
  /** Row selection handler (optional) */
  onRowSelect?: (row: T) => void;
  /** Currently selected row IDs */
  selectedRowIds?: string[];
  /** Row checkbox selection handler (for comparison) */
  onRowCheckboxChange?: (rowId: string) => void;
  /** Show checkboxes for row selection */
  showCheckboxes?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Test ID prefix */
  testId?: string;
}

// =============================================================================
// Helper Components
// =============================================================================

/**
 * Sort indicator arrow.
 */
function SortIndicator({ direction }: { direction: 'asc' | 'desc' }) {
  return (
    <span className="ml-1 inline-block text-xs">
      {direction === 'asc' ? 'ASC' : 'DESC'}
    </span>
  );
}

/**
 * Status badge component.
 */
function StatusBadge({ status }: { status: ResultStatus }) {
  const colorClass = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600';
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

/**
 * Severity badge component.
 */
function SeverityBadge({ severity }: { severity: Severity }) {
  const colorClass = SEVERITY_COLORS[severity] ?? 'bg-slate-100 text-slate-600';
  const label = SEVERITY_LABELS[severity] ?? severity;

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

/**
 * Loading bar for percentage values.
 */
function LoadingBar({ value, threshold = 100 }: { value: number; threshold?: number }) {
  const percentage = Math.min(value, 150); // Cap at 150% for display
  const colorClass =
    value > threshold
      ? 'bg-rose-500'
      : value > threshold * 0.8
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 rounded-full bg-slate-200">
        <div
          className={`h-2 rounded-full ${colorClass}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className={value > threshold ? 'font-semibold text-rose-600' : ''}>
        {formatNumber(value, 1)}%
      </span>
    </div>
  );
}

// =============================================================================
// Formatting Functions
// =============================================================================

function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCellValue<T>(
  value: unknown,
  column: ColumnDef<T>,
  row: T
): React.ReactNode {
  // Custom render function
  if (column.render) {
    return column.render(value, row);
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '—';
  }

  // Type-based formatting
  switch (column.type) {
    case 'number':
      return formatNumber(value as number, column.decimals ?? 3);

    case 'percent':
      return <LoadingBar value={value as number} />;

    case 'status':
      if (typeof value === 'boolean') {
        return value ? (
          <StatusBadge status="PASS" />
        ) : (
          <StatusBadge status="FAIL" />
        );
      }
      if (value === 'INFO' || value === 'WARN' || value === 'HIGH') {
        return <SeverityBadge severity={value as Severity} />;
      }
      return <StatusBadge status={value as ResultStatus} />;

    case 'enum':
      return String(value);

    case 'string':
    default:
      return String(value);
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function ResultsTable<T>({
  data,
  columns,
  sortConfig,
  onSort,
  getRowKey,
  onRowSelect,
  selectedRowIds = [],
  onRowCheckboxChange,
  showCheckboxes = false,
  emptyMessage = RESULTS_BROWSER_LABELS.table.no_results,
  testId = 'results-table',
}: ResultsTableProps<T>) {
  // Handle column header click for sorting
  const handleHeaderClick = useCallback(
    (column: ColumnDef<T>) => {
      if (!column.sortable) return;

      const newDirection =
        sortConfig?.key === column.key && sortConfig.direction === 'asc'
          ? 'desc'
          : 'asc';

      onSort({ key: column.key, direction: newDirection });
    },
    [sortConfig, onSort]
  );

  // Handle row click
  const handleRowClick = useCallback(
    (row: T) => {
      if (onRowSelect) {
        onRowSelect(row);
      }
    },
    [onRowSelect]
  );

  // Handle checkbox change
  const handleCheckboxChange = useCallback(
    (rowId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (onRowCheckboxChange) {
        onRowCheckboxChange(rowId);
      }
    },
    [onRowCheckboxChange]
  );

  // Determine alignment class
  const getAlignClass = (align: string | undefined): string => {
    switch (align) {
      case 'right':
        return 'text-right';
      case 'center':
        return 'text-center';
      default:
        return 'text-left';
    }
  };

  // Memoize row rendering for performance
  const renderedRows = useMemo(() => {
    if (data.length === 0) {
      return (
        <tr>
          <td
            colSpan={columns.length + (showCheckboxes ? 1 : 0)}
            className="px-4 py-8 text-center text-slate-500"
          >
            {emptyMessage}
          </td>
        </tr>
      );
    }

    return data.map((row) => {
      const rowId = getRowKey(row);
      const isSelected = selectedRowIds.includes(rowId);

      return (
        <tr
          key={rowId}
          data-testid={`${testId}-row-${rowId}`}
          onClick={() => handleRowClick(row)}
          className={`border-t border-slate-100 cursor-pointer transition-colors ${
            isSelected
              ? 'bg-blue-50 hover:bg-blue-100'
              : 'hover:bg-slate-50'
          }`}
          aria-selected={isSelected}
          role="row"
        >
          {showCheckboxes && (
            <td className="w-10 px-3 py-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => handleCheckboxChange(rowId, e)}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                aria-label={`Zaznacz wiersz ${rowId}`}
              />
            </td>
          )}
          {columns.map((column) => (
            <td
              key={column.key}
              data-testid={`${testId}-cell-${column.key}-${rowId}`}
              className={`px-3 py-2 ${getAlignClass(column.align)}`}
              style={column.width ? { width: column.width } : undefined}
            >
              {formatCellValue((row as Record<string, unknown>)[column.key], column, row)}
            </td>
          ))}
        </tr>
      );
    });
  }, [
    data,
    columns,
    showCheckboxes,
    selectedRowIds,
    getRowKey,
    handleRowClick,
    handleCheckboxChange,
    emptyMessage,
    testId,
  ]);

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-sm" data-testid={testId}>
        <thead className="bg-slate-50">
          <tr data-testid={`${testId}-header`}>
            {showCheckboxes && (
              <th className="w-10 px-3 py-2">
                <span className="sr-only">Zaznaczenie</span>
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.key}
                data-testid={`${testId}-header-${column.key}`}
                onClick={() => handleHeaderClick(column)}
                className={`px-3 py-2 font-semibold text-slate-700 ${getAlignClass(column.align)} ${
                  column.sortable ? 'cursor-pointer select-none hover:bg-slate-100' : ''
                }`}
                style={column.width ? { width: column.width } : undefined}
                title={column.sortable ? RESULTS_BROWSER_LABELS.table.sort_asc : undefined}
              >
                {column.header}
                {column.unit && (
                  <span className="ml-1 font-normal text-slate-500">[{column.unit}]</span>
                )}
                {sortConfig?.key === column.key && (
                  <SortIndicator direction={sortConfig.direction} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody data-testid={`${testId}-body`}>{renderedRows}</tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Row Count Footer
// =============================================================================

interface RowCountFooterProps {
  shown: number;
  total: number;
}

export function RowCountFooter({ shown, total }: RowCountFooterProps) {
  const message = RESULTS_BROWSER_LABELS.table.rows_shown
    .replace('{shown}', String(shown))
    .replace('{total}', String(total));

  return (
    <p className="mt-2 text-xs text-slate-500" data-testid="results-row-count">
      {message}
    </p>
  );
}
