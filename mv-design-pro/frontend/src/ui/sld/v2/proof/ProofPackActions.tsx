/**
 * ProofPackActions — toolbar dla pakietu uzasadnień (Etap 12 z planu).
 *
 * "ProofPacksPanel z CTA per pack: 'Wygeneruj' / 'Pokaż' / 'Eksportuj'"
 *
 * Stany pack:
 * - not_generated → przycisk "Wygeneruj"
 * - generating → spinner + status
 * - generated → "Pokaż" + "Eksportuj" (dropdown 4 formaty)
 * - stale → "Pokaż (przeterminowany)" + "Wygeneruj ponownie"
 */

import { useState } from 'react';

export type ProofPackStatus = 'not_generated' | 'generating' | 'generated' | 'stale';
export type ExportFormat = 'pdf' | 'latex' | 'json' | 'docx';

interface ProofPackActionsProps {
  status: ProofPackStatus;
  onGenerate: () => Promise<void> | void;
  onShow?: () => void;
  onExport?: (format: ExportFormat) => Promise<void> | void;
  className?: string;
}

const EXPORT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF (KaTeX render)',
  latex: 'LaTeX (źródłowy)',
  json: 'JSON (do API)',
  docx: 'DOCX (Word)',
};

export function ProofPackActions({
  status,
  onGenerate,
  onShow,
  onExport,
  className,
}: ProofPackActionsProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    if (!onExport) return;
    setIsExporting(format);
    setExportOpen(false);
    try {
      await onExport(format);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}
      data-testid="proof-pack-actions"
      role="toolbar"
      aria-label="Akcje pakietu uzasadnień"
    >
      {status === 'not_generated' && (
        <button
          type="button"
          onClick={() => onGenerate()}
          className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          data-testid="proof-action-generate"
          title="Wygeneruj uzasadnienie inżynierskie z obecnych wyników"
        >
          Wygeneruj
        </button>
      )}

      {status === 'generating' && (
        <span
          className="inline-flex items-center gap-1 text-xs text-slate-600"
          data-testid="proof-action-generating"
          aria-busy="true"
        >
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" aria-hidden="true" />
          Generowanie...
        </span>
      )}

      {(status === 'generated' || status === 'stale') && (
        <>
          {onShow && (
            <button
              type="button"
              onClick={onShow}
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              data-testid="proof-action-show"
              title="Otwórz panel uzasadnień"
            >
              {status === 'stale' ? 'Pokaż (przeterminowany)' : 'Pokaż'}
            </button>
          )}

          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              disabled={!onExport || isExporting !== null}
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid="proof-action-export"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              title="Wyeksportuj uzasadnienie do wybranego formatu"
            >
              {isExporting ? `Eksport ${isExporting.toUpperCase()}...` : 'Eksportuj ▾'}
            </button>
            {exportOpen && (
              <ul
                className="absolute right-0 z-10 mt-1 w-48 rounded border border-slate-200 bg-white shadow-lg"
                role="menu"
                data-testid="proof-export-menu"
              >
                {(Object.entries(EXPORT_LABELS) as [ExportFormat, string][]).map(
                  ([format, label]) => (
                    <li key={format} role="none">
                      <button
                        type="button"
                        onClick={() => handleExport(format)}
                        className="block w-full px-3 py-1 text-left text-xs hover:bg-slate-50"
                        data-testid={`proof-export-${format}`}
                        role="menuitem"
                      >
                        {label}
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>

          {status === 'stale' && (
            <button
              type="button"
              onClick={() => onGenerate()}
              className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400"
              data-testid="proof-action-regenerate"
              title="Wygeneruj ponownie po zmianie modelu"
            >
              Wygeneruj ponownie
            </button>
          )}
        </>
      )}
    </div>
  );
}
