/**
 * SLD Results Access Panel — §12 UX 10/10
 *
 * Panel boczny / pływający zapewniający szybki dostęp do:
 * - Podsumowania wyników dla wybranego elementu
 * - Przycisku WhiteBox (ślad obliczeń)
 * - Nawigacji do pełnych wyników
 * - Opcji eksportu
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - ui_canonical_parity.md: Industrial-grade results access
 * - SYSTEM_SPEC.md: READ-ONLY result display, Polish labels
 *
 * INVARIANTS:
 * - Read-only (no model mutations)
 * - No physics calculations
 * - All labels Polish
 * - Shows only when element selected AND results exist
 * - Deterministic rendering (same input = same output)
 *
 * 100% POLISH UI - BRAK ANGLICYZMOW
 */

import { useState, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';

// =============================================================================
// Types
// =============================================================================

/**
 * Podsumowanie wyników obliczeń dla wybranego elementu.
 * Dane z warstwy Analysis/Interpretation — bez fizyki.
 */
export interface ElementResultsSummary {
  elementId: string;
  elementType: string;
  elementName: string;
  hasLoadFlowResults: boolean;
  hasScResults: boolean;
  /** Obciążenie [%] */
  loadingPct?: number;
  /** Napięcie [kV] */
  voltageKv?: number;
  /** Napięcie [pu] */
  voltagePu?: number;
  /** Moc czynna [kW] */
  pKw?: number;
  /** Moc bierna [kvar] */
  qKvar?: number;
  /** Prąd zwarciowy początkowy Ik" [kA] */
  ikPp3f?: number;
  /** Prąd udarowy ip [kA] */
  ip3f?: number;
  /** Prąd cieplny Ith [kA] */
  ith3f?: number;
}

export interface SldResultsAccessProps {
  /** Identyfikator zaznaczonego elementu (null = brak selekcji) */
  selectedElementId: string | null;
  /** Podsumowanie wyników (null = brak wyników) */
  resultsSummary: ElementResultsSummary | null;
  /** Callback: otwórz ślad obliczeń WhiteBox */
  onShowWhiteBox?: (elementId: string) => void;
  /** Callback: nawiguj do pełnych wyników */
  onShowFullResults?: (elementId: string) => void;
  /** Callback: eksportuj wyniki w wybranym formacie */
  onExportResults?: (elementId: string, format: ExportFormat) => void;
  /** Callback: pokaż pokrycie zabezpieczeniowe */
  onShowProtectionCoverage?: (elementId: string) => void;
  /** Tryb kompaktowy (mniejszy panel) */
  compact?: boolean;
}

/**
 * Dostępne formaty eksportu.
 */
export type ExportFormat = 'PDF' | 'DOCX' | 'JSON';

// =============================================================================
// Stałe — polskie etykiety i tokeny stylów
// =============================================================================

/** Polskie etykiety typów elementów */
const ELEMENT_TYPE_BADGE_PL: Readonly<Record<string, string>> = {
  Bus: 'Szyna',
  LineBranch: 'Linia',
  TransformerBranch: 'Transformator',
  Switch: 'Łącznik',
  Source: 'Źródło',
  Load: 'Odbiornik',
  Generator: 'Generator',
  Station: 'Stacja',
  BaySN: 'Pole SN',
  Relay: 'Przekaźnik',
  ProtectionAssignment: 'Zabezpieczenie',
  Measurement: 'Pomiar',
  Terminal: 'Terminal',
  NOP: 'Punkt normalnie otwarty',
} as const;

/** Typy elementów rozdzielczych — kwalifikują się do pokrycia zabezpieczeniowego */
const SWITCHGEAR_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  'Switch',
  'BaySN',
  'Relay',
  'ProtectionAssignment',
  'MainBreakerNN',
]);

/** Polskie etykiety formatów eksportu */
const EXPORT_FORMAT_LABELS_PL: Readonly<Record<ExportFormat, string>> = {
  PDF: 'PDF',
  DOCX: 'DOCX',
  JSON: 'JSON',
} as const;

/** Szerokość panelu */
const PANEL_WIDTH = 320;

// =============================================================================
// Funkcje pomocnicze
// =============================================================================

/**
 * Formatowanie wartości liczbowej z precyzją.
 * Deterministyczne: ten sam input = ten sam output.
 */
function formatNum(value: number | undefined, decimals: number): string {
  if (value === undefined || value === null) return '\u2014';
  return value.toFixed(decimals);
}

/**
 * Klasa CSS koloru obciążenia na podstawie progu.
 * UWAGA: progi nie stanowią obliczeń fizycznych — to wyłącznie
 * klasyfikacja wizualna warstwy prezentacji.
 */
function getLoadingColorClass(pct: number | undefined): string {
  if (pct === undefined) return 'text-slate-500';
  if (pct > 80) return 'text-rose-600 font-semibold';
  if (pct > 50) return 'text-amber-600 font-semibold';
  return 'text-emerald-600';
}

/**
 * Ikona koloru obciążenia (kulka LED).
 */
function getLoadingDotClass(pct: number | undefined): string {
  if (pct === undefined) return 'bg-slate-300';
  if (pct > 80) return 'bg-rose-500';
  if (pct > 50) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/**
 * Odchylenie napięcia od nominalnego (1.0 p.u.).
 */
function voltageDeviationLabel(pu: number | undefined): string | null {
  if (pu === undefined) return null;
  const delta = (pu - 1.0) * 100;
  if (Math.abs(delta) < 0.05) return null;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

/**
 * Klasa CSS odchylenia napięcia.
 */
function voltageDeviationClass(pu: number | undefined): string {
  if (pu === undefined) return '';
  const delta = Math.abs(pu - 1.0) * 100;
  if (delta > 10) return 'text-rose-600 font-semibold';
  if (delta > 5) return 'text-amber-600';
  return 'text-emerald-600';
}

/**
 * Rozpoznaj typ elementu jako polską etykietę badge.
 */
function getTypeBadge(elementType: string): string {
  return ELEMENT_TYPE_BADGE_PL[elementType] ?? elementType;
}

/**
 * Czy element kwalifikuje się do pokrycia zabezpieczeniowego.
 */
function isSwitchgearElement(elementType: string): boolean {
  return SWITCHGEAR_ELEMENT_TYPES.has(elementType);
}

// =============================================================================
// Podkomponenty
// =============================================================================

/**
 * Nagłówek panelu z nazwą i typem elementu.
 */
function PanelHeader({
  summary,
}: {
  summary: ElementResultsSummary;
}) {
  return (
    <div
      className="bg-slate-800 px-4 py-3 flex-shrink-0"
      data-testid="sld-results-access-header"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
        Wyniki elementu
      </p>
      <div className="flex items-center gap-2">
        <h3
          className="text-sm font-semibold text-slate-100 truncate flex-1"
          title={summary.elementName}
          data-testid="sld-results-access-element-name"
        >
          {summary.elementName}
        </h3>
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-blue-600 text-white flex-shrink-0"
          data-testid="sld-results-access-type-badge"
        >
          {getTypeBadge(summary.elementType)}
        </span>
      </div>
    </div>
  );
}

/**
 * Sekcja rozpływu mocy (Load Flow).
 */
function LoadFlowSection({
  summary,
  compact,
}: {
  summary: ElementResultsSummary;
  compact: boolean;
}) {
  if (!summary.hasLoadFlowResults) return null;

  const deviationLabel = voltageDeviationLabel(summary.voltagePu);
  const deviationCls = voltageDeviationClass(summary.voltagePu);

  return (
    <div data-testid="sld-results-access-lf-section" className="px-4 py-3 border-b border-slate-200">
      {/* Nagłówek sekcji */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Rozpływ mocy
        </h4>
      </div>

      {/* Obciążenie */}
      {summary.loadingPct !== undefined && (
        <div className="flex items-center justify-between py-1.5" data-testid="sld-results-access-loading">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className={clsx('w-2 h-2 rounded-full', getLoadingDotClass(summary.loadingPct))} />
            Obciążenie
          </span>
          <span className={clsx('text-xs font-mono', getLoadingColorClass(summary.loadingPct))}>
            {formatNum(summary.loadingPct, 1)} %
          </span>
        </div>
      )}

      {/* Napięcie */}
      {(summary.voltageKv !== undefined || summary.voltagePu !== undefined) && (
        <div className="flex items-center justify-between py-1.5" data-testid="sld-results-access-voltage">
          <span className="text-xs text-slate-500">Napięcie</span>
          <div className="flex items-center gap-2">
            {summary.voltageKv !== undefined && (
              <span className="text-xs font-mono text-slate-800">
                {formatNum(summary.voltageKv, 2)} <span className="text-slate-400">kV</span>
              </span>
            )}
            {summary.voltagePu !== undefined && (
              <span className="text-xs font-mono text-slate-600">
                ({formatNum(summary.voltagePu, 3)} <span className="text-slate-400">pu</span>)
              </span>
            )}
            {deviationLabel && (
              <span className={clsx('text-[10px] font-mono', deviationCls)}>
                {deviationLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Moc czynna / bierna */}
      {!compact && (summary.pKw !== undefined || summary.qKvar !== undefined) && (
        <div className="flex items-center justify-between py-1.5" data-testid="sld-results-access-power">
          <span className="text-xs text-slate-500">Moc</span>
          <div className="flex items-center gap-3">
            {summary.pKw !== undefined && (
              <span className="text-xs font-mono text-slate-800">
                P={formatNum(summary.pKw, 1)} <span className="text-slate-400">kW</span>
              </span>
            )}
            {summary.qKvar !== undefined && (
              <span className="text-xs font-mono text-slate-800">
                Q={formatNum(summary.qKvar, 1)} <span className="text-slate-400">kvar</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sekcja zwarcia (Short Circuit).
 */
function ShortCircuitSection({
  summary,
  compact,
}: {
  summary: ElementResultsSummary;
  compact: boolean;
}) {
  if (!summary.hasScResults) return null;

  return (
    <div data-testid="sld-results-access-sc-section" className="px-4 py-3 border-b border-slate-200">
      {/* Nagłówek sekcji */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Zwarcie 3F
        </h4>
      </div>

      {/* Ik" */}
      {summary.ikPp3f !== undefined && (
        <div className="flex items-center justify-between py-1.5" data-testid="sld-results-access-ikpp">
          <span className="text-xs text-slate-500">
            I<sub>k</sub>&quot; (3F)
          </span>
          <span className="text-xs font-mono text-slate-800 font-semibold">
            {formatNum(summary.ikPp3f, 2)} <span className="text-slate-400">kA</span>
          </span>
        </div>
      )}

      {/* ip */}
      {!compact && summary.ip3f !== undefined && (
        <div className="flex items-center justify-between py-1.5" data-testid="sld-results-access-ip">
          <span className="text-xs text-slate-500">
            i<sub>p</sub> (3F)
          </span>
          <span className="text-xs font-mono text-slate-800">
            {formatNum(summary.ip3f, 2)} <span className="text-slate-400">kA</span>
          </span>
        </div>
      )}

      {/* Ith */}
      {!compact && summary.ith3f !== undefined && (
        <div className="flex items-center justify-between py-1.5" data-testid="sld-results-access-ith">
          <span className="text-xs text-slate-500">
            I<sub>th</sub> (3F)
          </span>
          <span className="text-xs font-mono text-slate-800">
            {formatNum(summary.ith3f, 2)} <span className="text-slate-400">kA</span>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Przycisk eksportu z rozwijanym menu formatów.
 */
function ExportButton({
  elementId,
  onExportResults,
}: {
  elementId: string;
  onExportResults?: (elementId: string, format: ExportFormat) => void;
}) {
  const [open, setOpen] = useState(false);

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      onExportResults?.(elementId, format);
      setOpen(false);
    },
    [elementId, onExportResults],
  );

  const formats: ExportFormat[] = ['PDF', 'DOCX', 'JSON'];

  return (
    <div className="relative" data-testid="sld-results-access-export">
      <button
        type="button"
        onClick={handleToggle}
        className={clsx(
          'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors',
          'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50',
        )}
        aria-label="Eksportuj wyniki"
        aria-expanded={open}
        data-testid="sld-results-access-export-button"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Eksportuj wyniki
        <svg className="w-3 h-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Menu formatów */}
      {open && (
        <div
          className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50"
          data-testid="sld-results-access-export-menu"
        >
          {formats.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => handleExport(fmt)}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors first:rounded-t last:rounded-b"
              data-testid={`sld-results-access-export-${fmt.toLowerCase()}`}
            >
              {EXPORT_FORMAT_LABELS_PL[fmt]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Przyciski akcji.
 */
function ActionButtons({
  summary,
  onShowWhiteBox,
  onShowFullResults,
  onExportResults,
  onShowProtectionCoverage,
}: {
  summary: ElementResultsSummary;
  onShowWhiteBox?: (elementId: string) => void;
  onShowFullResults?: (elementId: string) => void;
  onExportResults?: (elementId: string, format: ExportFormat) => void;
  onShowProtectionCoverage?: (elementId: string) => void;
}) {
  const showProtection = isSwitchgearElement(summary.elementType);

  const handleWhiteBox = useCallback(() => {
    onShowWhiteBox?.(summary.elementId);
  }, [onShowWhiteBox, summary.elementId]);

  const handleFullResults = useCallback(() => {
    onShowFullResults?.(summary.elementId);
  }, [onShowFullResults, summary.elementId]);

  const handleProtection = useCallback(() => {
    onShowProtectionCoverage?.(summary.elementId);
  }, [onShowProtectionCoverage, summary.elementId]);

  return (
    <div className="px-4 py-3 space-y-2" data-testid="sld-results-access-actions">
      {/* WhiteBox — przycisk główny */}
      <button
        type="button"
        onClick={handleWhiteBox}
        className={clsx(
          'w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded text-xs font-semibold transition-colors',
          'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
        )}
        aria-label="Pokaz slad obliczen"
        data-testid="sld-results-access-whitebox-button"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
        Pokaz slad obliczen
      </button>

      {/* Pełne wyniki — przycisk wtórny */}
      <button
        type="button"
        onClick={handleFullResults}
        className={clsx(
          'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors',
          'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50',
        )}
        aria-label="Pelne wyniki"
        data-testid="sld-results-access-full-results-button"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        Pelne wyniki
      </button>

      {/* Pokrycie zabezpieczeniowe — tylko dla elementów rozdzielczych */}
      {showProtection && (
        <button
          type="button"
          onClick={handleProtection}
          className={clsx(
            'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors',
            'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50',
          )}
          aria-label="Pokrycie zabezpieczeniowe"
          data-testid="sld-results-access-protection-button"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          Pokrycie zabezpieczeniowe
        </button>
      )}

      {/* Eksport */}
      <ExportButton
        elementId={summary.elementId}
        onExportResults={onExportResults}
      />
    </div>
  );
}

/**
 * Stan pusty — brak wyników dla wybranego elementu.
 */
function EmptyResultsState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full p-6 text-center"
      data-testid="sld-results-access-empty-state"
    >
      <div className="w-14 h-14 mb-3 rounded-full bg-slate-100 flex items-center justify-center">
        <svg
          className="w-7 h-7 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <h4 className="text-sm font-medium text-slate-700 mb-1">
        Brak wyników
      </h4>
      <p className="text-xs text-slate-500 leading-relaxed">
        Brak wyników dla wybranego elementu. Uruchom obliczenia, aby zobaczyć wyniki.
      </p>
    </div>
  );
}

/**
 * Stan bez selekcji — żaden element nie jest wybrany.
 */
function NoSelectionState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full p-6 text-center"
      data-testid="sld-results-access-no-selection"
    >
      <div className="w-14 h-14 mb-3 rounded-full bg-slate-100 flex items-center justify-center">
        <svg
          className="w-7 h-7 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
          />
        </svg>
      </div>
      <h4 className="text-sm font-medium text-slate-700 mb-1">
        Brak zaznaczenia
      </h4>
      <p className="text-xs text-slate-500 leading-relaxed">
        Zaznacz element na schemacie, aby zobaczyć podsumowanie wyników.
      </p>
    </div>
  );
}

// =============================================================================
// Główny komponent
// =============================================================================

/**
 * SLD Results Access Panel.
 *
 * Panel boczny zapewniający szybki dostęp do wyników obliczeń
 * dla wybranego elementu na schemacie SLD:
 *
 * - Nagłówek: nazwa + typ elementu (badge)
 * - Sekcja rozpływu mocy: obciążenie %, napięcie kV/pu, moc P/Q
 * - Sekcja zwarcia: Ik", ip, Ith
 * - Przyciski akcji: WhiteBox, pełne wyniki, pokrycie zabezpieczeniowe, eksport
 * - Stan pusty: "Brak wyników dla wybranego elementu"
 *
 * UWAGA: Komponent jest w 100% READ-ONLY. Nie mutuje modelu sieci.
 * Progi kolorów (obciążenie, napięcie) to wyłącznie klasyfikacja wizualna
 * warstwy prezentacji — NIE stanowią obliczeń fizycznych.
 *
 * @example
 * ```tsx
 * <SldResultsAccess
 *   selectedElementId="bus-001"
 *   resultsSummary={summary}
 *   onShowWhiteBox={(id) => openTraceViewer(id)}
 *   onShowFullResults={(id) => navigate(`/results/${id}`)}
 *   onExportResults={(id, fmt) => exportResults(id, fmt)}
 * />
 * ```
 */
export function SldResultsAccess({
  selectedElementId,
  resultsSummary,
  onShowWhiteBox,
  onShowFullResults,
  onExportResults,
  onShowProtectionCoverage,
  compact = false,
}: SldResultsAccessProps) {
  // Określ stan renderowania
  const renderState = useMemo((): 'no-selection' | 'no-results' | 'results' => {
    if (!selectedElementId) return 'no-selection';
    if (!resultsSummary) return 'no-results';
    if (!resultsSummary.hasLoadFlowResults && !resultsSummary.hasScResults) return 'no-results';
    return 'results';
  }, [selectedElementId, resultsSummary]);

  // Liczba dostępnych typów wyników
  const resultTypesCount = useMemo((): number => {
    if (!resultsSummary) return 0;
    let count = 0;
    if (resultsSummary.hasLoadFlowResults) count += 1;
    if (resultsSummary.hasScResults) count += 1;
    return count;
  }, [resultsSummary]);

  return (
    <div
      className={clsx(
        'flex flex-col h-full bg-white border-l border-slate-300 shadow-lg',
        compact && 'text-[11px]',
      )}
      style={{ width: `${PANEL_WIDTH}px`, minWidth: `${PANEL_WIDTH}px` }}
      data-testid="sld-results-access-panel"
      data-element-id={selectedElementId ?? undefined}
      data-render-state={renderState}
    >
      {/* Wariant: brak selekcji */}
      {renderState === 'no-selection' && <NoSelectionState />}

      {/* Wariant: element wybrany, ale brak wyników */}
      {renderState === 'no-results' && <EmptyResultsState />}

      {/* Wariant: element wybrany i wyniki dostępne */}
      {renderState === 'results' && resultsSummary && (
        <>
          {/* Nagłówek */}
          <PanelHeader summary={resultsSummary} />

          {/* Znacznik: tylko do odczytu */}
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span className="font-medium">Tylko do odczytu</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {resultTypesCount} {resultTypesCount === 1 ? 'typ wyniku' : 'typy wyników'}
              </span>
            </div>
          </div>

          {/* Sekcje wyników */}
          <div className="flex-1 overflow-y-auto" data-testid="sld-results-access-content">
            {/* Rozpływ mocy */}
            <LoadFlowSection summary={resultsSummary} compact={compact} />

            {/* Zwarcie */}
            <ShortCircuitSection summary={resultsSummary} compact={compact} />
          </div>

          {/* Przyciski akcji */}
          <div className="border-t border-slate-200 flex-shrink-0">
            <ActionButtons
              summary={resultsSummary}
              onShowWhiteBox={onShowWhiteBox}
              onShowFullResults={onShowFullResults}
              onExportResults={onExportResults}
              onShowProtectionCoverage={onShowProtectionCoverage}
            />
          </div>

          {/* Stopka */}
          <div className="border-t border-slate-200 bg-slate-100 px-4 py-2 text-[10px] text-slate-500 flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                ID: {resultsSummary.elementId.substring(0, 8)}...
              </span>
              <span className="font-mono text-slate-400">
                §12
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Eksport
// =============================================================================

export default SldResultsAccess;
