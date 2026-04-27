/**
 * FIX-03 — Results Export Component
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Export functionality like Canonical
 * - wizard_screens.md: RESULT_VIEW mode
 * - 100% Polish UI
 *
 * FEATURES:
 * - CSV export (client-side, instant)
 * - Excel export (via backend API)
 * - PDF export (via backend API with print preview)
 */

import { useCallback, useState } from 'react';
import type { ExportFormat, ResultsViewMode, ColumnDef } from './types';
import { RESULTS_BROWSER_LABELS, VIEW_MODE_LABELS, EXPORT_FORMAT_LABELS } from './types';
import { exportToCSV, exportToExcel } from './api';

// =============================================================================
// Types
// =============================================================================

interface ResultsExportProps<T> {
  /** Current data to export */
  data: T[];
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Current view mode */
  viewMode: ResultsViewMode;
  /** Run ID for backend exports */
  runId: string;
  /** Project name (optional, for headers) */
  projectName?: string;
  /** Case name (optional, for headers) */
  caseName?: string;
  /** Available export formats */
  formats?: ExportFormat[];
  /** Test ID prefix */
  testId?: string;
}

// =============================================================================
// PDF Print Preview Modal
// =============================================================================

interface PrintPreviewProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  viewMode: ResultsViewMode;
  projectName?: string;
  caseName?: string;
  runId: string;
  onClose: () => void;
}

function PrintPreview<T>({
  data,
  columns,
  viewMode,
  projectName,
  caseName,
  runId,
  onClose,
}: PrintPreviewProps<T>) {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const formatDate = (isoDate: string): string => {
    try {
      return new Date(isoDate).toLocaleString('pl-PL');
    } catch {
      return isoDate;
    }
  };

  const formatCellValue = (value: unknown, column: ColumnDef<T>): string => {
    if (value === null || value === undefined) return '—';

    if (column.type === 'number' || column.type === 'percent') {
      const num = value as number;
      return num.toLocaleString('pl-PL', {
        minimumFractionDigits: column.decimals ?? 3,
        maximumFractionDigits: column.decimals ?? 3,
      });
    }

    return String(value);
  };

  return (
    <div className="fixed inset-0 z-50 bg-white" data-testid="print-preview">
      {/* Screen-only header with controls */}
      <div className="print:hidden border-b border-slate-200 bg-slate-50 px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Podgląd wydruku</h2>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePrint}
              data-testid="print-btn"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Drukuj / Zapisz PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              data-testid="close-preview-btn"
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>

      {/* Printable content */}
      <div className="p-8 print:p-0">
        {/* Print header */}
        <div className="mb-6 border-b border-slate-300 pb-4 print:mb-4 print:pb-2">
          <h1 className="text-xl font-bold text-slate-900 print:text-lg">
            MV-DESIGN PRO — {VIEW_MODE_LABELS[viewMode]}
          </h1>
          <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-slate-600 print:text-xs">
            <div>
              <span className="font-medium">Projekt:</span> {projectName ?? '—'}
            </div>
            <div>
              <span className="font-medium">Wariant pracy:</span> {caseName ?? '—'}
            </div>
            <div>
              <span className="font-medium">Data eksportu:</span> {formatDate(new Date().toISOString())}
            </div>
            <div>
              <span className="font-medium">Identyfikator uruchomienia:</span>{' '}
              <span className="font-mono">{runId.substring(0, 8)}</span>
            </div>
          </div>
        </div>

        {/* Table content */}
        <div className="overflow-x-auto">
          <table className="print-table w-full border-collapse text-sm">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-700 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.header}
                    {col.unit && <span className="ml-1 font-normal text-slate-500">[{col.unit}]</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`border border-slate-200 px-3 py-2 ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } ${col.type === 'number' || col.type === 'percent' ? 'font-mono' : ''}`}
                    >
                      {formatCellValue((row as Record<string, unknown>)[col.key], col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="mt-4 text-sm text-slate-600">
          <p>Liczba wierszy: {data.length}</p>
        </div>

        {/* Footer */}
        <div className="mt-6 text-xs text-slate-500 print:mt-4">
          <p>Wygenerowano przez MV-DESIGN PRO</p>
        </div>
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          [data-testid="print-preview"],
          [data-testid="print-preview"] * {
            visibility: visible;
          }
          [data-testid="print-preview"] {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print-table {
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// Export Dropdown Menu
// =============================================================================

interface ExportMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  formats: ExportFormat[];
  isExporting: boolean;
}

function ExportMenu({ isOpen, onClose, onExport, formats, isExporting }: ExportMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Menu */}
      <div
        className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-slate-200 bg-white py-1 shadow-lg"
        role="menu"
      >
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => onExport(format)}
            disabled={isExporting}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            role="menuitem"
          >
            <span className="w-12 font-medium">{EXPORT_FORMAT_LABELS[format]}</span>
            <span className="text-slate-400">
              {format === 'csv' && '(lokalnie)'}
              {format === 'xlsx' && '(Excel)'}
              {format === 'pdf' && '(wydruk)'}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// =============================================================================
// Main Export Component
// =============================================================================

export function ResultsExport<T>({
  data,
  columns,
  viewMode,
  runId,
  projectName,
  caseName,
  formats = ['csv', 'xlsx', 'pdf'],
  testId = 'results-export',
}: ResultsExportProps<T>) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle export action
  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setIsMenuOpen(false);
      setError(null);

      try {
        setIsExporting(true);

        switch (format) {
          case 'csv': {
            // Client-side CSV export
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const filename = `wyniki_${viewMode}_${timestamp}.csv`;
            exportToCSV(
              data as unknown as Record<string, unknown>[],
              columns.map((col) => ({ key: col.key, header: col.header })),
              filename
            );
            break;
          }

          case 'xlsx': {
            // Backend Excel export
            await exportToExcel(runId, viewMode, projectName, caseName);
            break;
          }

          case 'pdf': {
            // Show print preview
            setShowPrintPreview(true);
            break;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : RESULTS_BROWSER_LABELS.messages.export_error);
      } finally {
        setIsExporting(false);
      }
    },
    [data, columns, viewMode, runId, projectName, caseName]
  );

  // Toggle menu
  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  // Close menu
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  // Close print preview
  const closePrintPreview = useCallback(() => {
    setShowPrintPreview(false);
  }, []);

  return (
    <div className="relative" data-testid={testId}>
      {/* Export button */}
      <button
        type="button"
        onClick={toggleMenu}
        disabled={isExporting || data.length === 0}
        data-testid={`${testId}-btn`}
        className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
        aria-haspopup="true"
        aria-expanded={isMenuOpen}
      >
        {isExporting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            Eksportowanie...
          </>
        ) : (
          <>
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
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Eksportuj
          </>
        )}
      </button>

      {/* Dropdown menu */}
      <ExportMenu
        isOpen={isMenuOpen}
        onClose={closeMenu}
        onExport={handleExport}
        formats={formats}
        isExporting={isExporting}
      />

      {/* Error message */}
      {error && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-rose-500 hover:text-rose-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Print preview modal */}
      {showPrintPreview && (
        <PrintPreview
          data={data}
          columns={columns}
          viewMode={viewMode}
          projectName={projectName}
          caseName={caseName}
          runId={runId}
          onClose={closePrintPreview}
        />
      )}
    </div>
  );
}

// =============================================================================
// Compact Export Buttons (Alternative)
// =============================================================================

interface CompactExportButtonsProps {
  onExportCSV: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
  isExporting: boolean;
  disabled?: boolean;
}

export function CompactExportButtons({
  onExportCSV,
  onExportExcel,
  onExportPDF,
  isExporting,
  disabled = false,
}: CompactExportButtonsProps) {
  const buttonClass =
    'rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50';

  return (
    <div className="flex items-center gap-2" data-testid="compact-export-buttons">
      <button
        type="button"
        onClick={onExportCSV}
        disabled={isExporting || disabled}
        title={RESULTS_BROWSER_LABELS.actions.export_csv}
        className={buttonClass}
      >
        CSV
      </button>
      <button
        type="button"
        onClick={onExportExcel}
        disabled={isExporting || disabled}
        title={RESULTS_BROWSER_LABELS.actions.export_xlsx}
        className={buttonClass}
      >
        Excel
      </button>
      <button
        type="button"
        onClick={onExportPDF}
        disabled={isExporting || disabled}
        title={RESULTS_BROWSER_LABELS.actions.export_pdf}
        className={buttonClass}
      >
        PDF
      </button>
    </div>
  );
}
