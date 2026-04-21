/**
 * SLD Inspector Compare Panel — PR-SLD-08
 *
 * Panel porównania elementów w inspektorze SLD (READ-ONLY, 120% CANONICAL).
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Porównanie właściwości (120% CANONICAL)
 * - sld_rules.md § G.1: Multi-selection w inspektorze
 *
 * FEATURES:
 * - Panel boczny po PRAWEJ stronie (340-420px responsywnie)
 * - Nagłówek: „Porównanie elementów"
 * - Układ kolumnowy: A | B
 * - Wyróżnienie różnic (pogrubienie + znak ≠)
 * - Sekcje accordion DOMYŚLNIE ROZWINIĘTE
 * - 100% READ-ONLY (brak przycisków akcji)
 *
 * 100% POLISH UI - BRAK ANGLICYZMÓW
 */

import { useState, useCallback } from 'react';
import { useSldCompareSelection } from './useSldCompareSelection';
import type { ComparePropertySection, ComparePropertyField } from './types';
import { COMPARE_LABELS_PL } from './types';
import { ELEMENT_TYPE_LABELS_PL } from '../types';
import { SLD_MODE_LABELS_PL } from '../../sldModeStore';
import { formatValue, getDifferenceLabel, isDifferent } from './compareUtils';

// =============================================================================
// STAŁE
// =============================================================================

/** Szerokość panelu porównania */
const COMPARE_PANEL_WIDTH = 380;

// =============================================================================
// KOMPONENT WIERSZA PORÓWNANIA
// =============================================================================

interface CompareFieldRowProps {
  field: ComparePropertyField;
  sectionId: string;
}

/**
 * Wiersz porównania: label | valueA | valueB
 * Różnice są wyróżnione pogrubieniem i znakiem ≠
 */
function CompareFieldRow({ field, sectionId }: CompareFieldRowProps) {
  const testId = `compare-field-${sectionId}-${field.key}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const hasDiff = isDifferent(field.diffStatus);

  // Klasa dla wartości różnej
  const getDiffValueClass = (isValueDifferent: boolean) => {
    if (isValueDifferent) {
      return 'font-semibold text-slate-900';
    }
    return 'text-slate-600';
  };

  return (
    <div
      className={`grid grid-cols-[1fr_1fr_1fr] gap-2 py-2 border-b border-slate-100 last:border-b-0 ${
        hasDiff ? 'bg-amber-50/50' : ''
      }`}
      data-testid={testId}
      data-diff-status={field.diffStatus}
    >
      {/* Etykieta */}
      <dt className="text-xs text-slate-500 flex items-center gap-1 pr-2">
        <span className="truncate">{field.label}</span>
        {field.unit && <span className="text-slate-400 text-[10px]">({field.unit})</span>}
      </dt>

      {/* Wartość A */}
      <dd
        className={`text-xs font-mono text-center ${getDiffValueClass(hasDiff)}`}
        data-testid={`${testId}-value-a`}
      >
        {formatValue(field.valueA)}
        {hasDiff && field.diffStatus !== 'missing_a' && (
          <span className="ml-1 text-amber-600" title="Różnica">
            {COMPARE_LABELS_PL.diffIndicator}
          </span>
        )}
        {field.diffStatus === 'missing_a' && (
          <span className="text-slate-400 italic">—</span>
        )}
      </dd>

      {/* Wartość B */}
      <dd
        className={`text-xs font-mono text-center ${getDiffValueClass(hasDiff)}`}
        data-testid={`${testId}-value-b`}
      >
        {formatValue(field.valueB)}
        {hasDiff && field.diffStatus !== 'missing_b' && (
          <span className="ml-1 text-amber-600" title="Różnica">
            {COMPARE_LABELS_PL.diffIndicator}
          </span>
        )}
        {field.diffStatus === 'missing_b' && (
          <span className="text-slate-400 italic">—</span>
        )}
      </dd>
    </div>
  );
}

// =============================================================================
// KOMPONENT SEKCJI PORÓWNANIA
// =============================================================================

interface CompareSectionProps {
  section: ComparePropertySection;
  elementAName: string;
  elementBName: string;
  defaultExpanded?: boolean;
}

/**
 * Sekcja porównania z nagłówkiem i polami.
 * DOMYŚLNIE ROZWINIĘTA (per BINDING spec).
 */
function CompareSection({
  section,
  elementAName,
  elementBName,
  defaultExpanded = true,
}: CompareSectionProps) {
  const [expanded, setExpanded] = useState(section.collapsed !== true && defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div data-testid={`compare-section-${section.id}`}>
      {/* Nagłówek sekcji */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Zwiń' : 'Rozwiń'} sekcję ${section.label}`}
        data-testid={`compare-section-header-${section.id}`}
      >
        <span className="text-xs font-medium text-slate-700 flex items-center gap-2">
          <span className="text-slate-400">{expanded ? '[-]' : '[+]'}</span>
          {section.label}
          {section.hasDifferences && (
            <span className="text-amber-600 text-[10px] font-normal">
              ({COMPARE_LABELS_PL.diffIndicator})
            </span>
          )}
        </span>
        <span className="text-[10px] text-slate-400">
          {section.fields.length} {section.fields.length === 1 ? 'pole' : 'pól'}
        </span>
      </button>

      {/* Nagłówek kolumn A/B */}
      {expanded && (
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-1.5 bg-slate-100/50 border-b border-slate-200">
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
            Właściwość
          </div>
          <div
            className="text-[10px] font-medium text-slate-500 uppercase tracking-wide text-center truncate"
            title={elementAName}
          >
            A: {elementAName.length > 12 ? `${elementAName.slice(0, 10)}...` : elementAName}
          </div>
          <div
            className="text-[10px] font-medium text-slate-500 uppercase tracking-wide text-center truncate"
            title={elementBName}
          >
            B: {elementBName.length > 12 ? `${elementBName.slice(0, 10)}...` : elementBName}
          </div>
        </div>
      )}

      {/* Pola sekcji */}
      {expanded && (
        <dl className="px-4 py-2" data-testid={`compare-section-fields-${section.id}`}>
          {section.fields.map((field) => (
            <CompareFieldRow key={field.key} field={field} sectionId={section.id} />
          ))}
        </dl>
      )}
    </div>
  );
}

// =============================================================================
// KOMPONENT PUSTEGO STANU
// =============================================================================

/**
 * Wyświetlany gdy nie ma 2 elementów do porównania.
 */
function EmptyCompareState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full p-6 text-center"
      data-testid="compare-empty-state"
    >
      <div className="w-16 h-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </div>
      <h4 className="text-sm font-medium text-slate-700 mb-1">{COMPARE_LABELS_PL.selectTwoElements}</h4>
      <p className="text-xs text-slate-500">
        Przytrzymaj Ctrl i kliknij drugi element na schemacie.
      </p>
    </div>
  );
}

// =============================================================================
// GŁÓWNY KOMPONENT PANELU
// =============================================================================

export interface SldInspectorComparePanelProps {
  /** Dodatkowe klasy CSS */
  className?: string;
  /** Callback wywoływany przy zamknięciu */
  onClose?: () => void;
}

/**
 * Panel porównania elementów SLD.
 *
 * Wyświetla porównanie właściwości 2 wybranych elementów
 * w formacie kolumnowym A | B:
 * - Sekcje z nagłówkami (zwijalne, domyślnie rozwinięte)
 * - Pola: label | valueA | valueB
 * - Wyróżnienie różnic (pogrubienie + znak ≠)
 * - 100% READ-ONLY (brak edycji, brak akcji)
 *
 * @example
 * ```tsx
 * <SldInspectorComparePanel onClose={() => console.log('closed')} />
 * ```
 */
export function SldInspectorComparePanel({ className = '', onClose }: SldInspectorComparePanelProps) {
  const {
    isCompareMode,
    compareSelection,
    compareSections,
    mode,
    isResultsMode,
    closeCompare,
    totalDifferences,
  } = useSldCompareSelection();

  // Obsługa zamknięcia
  const handleClose = useCallback(() => {
    closeCompare();
    onClose?.();
  }, [closeCompare, onClose]);

  // Tytuł panelu
  const getTitle = (): string => {
    if (!isCompareMode || !compareSelection) {
      return COMPARE_LABELS_PL.title;
    }
    return COMPARE_LABELS_PL.title;
  };

  // Podtytuł z informacją o typach
  const getSubtitle = (): string | null => {
    if (!compareSelection) return null;
    if (compareSelection.sameType) {
      return `${COMPARE_LABELS_PL.sameType}: ${ELEMENT_TYPE_LABELS_PL[compareSelection.elementA.elementType]}`;
    }
    return COMPARE_LABELS_PL.differentTypes;
  };

  // Podsumowanie różnic
  const getDiffSummary = (): string => {
    if (totalDifferences === 0) {
      return COMPARE_LABELS_PL.noDifferences;
    }
    return `${totalDifferences} ${getDifferenceLabel(totalDifferences)}`;
  };

  return (
    <div
      className={`flex flex-col h-full bg-white border-l border-slate-200 ${className}`}
      style={{ width: `${COMPARE_PANEL_WIDTH}px`, minWidth: `${COMPARE_PANEL_WIDTH}px` }}
      data-testid="sld-inspector-compare-panel"
      data-compare-mode={isCompareMode}
      data-sld-mode={mode}
      data-total-differences={totalDifferences}
    >
      {/* Nagłówek */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Inspektor
          </p>
          <h3
            className="text-sm font-semibold text-slate-800 truncate"
            data-testid="compare-title"
            title={getTitle()}
          >
            {getTitle()}
          </h3>
          {getSubtitle() && (
            <p className="text-[10px] text-slate-500 mt-0.5" data-testid="compare-subtitle">
              {getSubtitle()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="ml-2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors flex-shrink-0"
          aria-label="Zamknij porównanie"
          data-testid="compare-close-button"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Znacznik trybu read-only */}
      <div className="border-b border-slate-100 bg-green-50 px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-green-700">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>{COMPARE_LABELS_PL.readOnly}</span>
          </div>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              isResultsMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-600'
            }`}
            data-testid="compare-mode-badge"
          >
            {SLD_MODE_LABELS_PL[mode]}
          </span>
        </div>
      </div>

      {/* Podsumowanie różnic */}
      {isCompareMode && compareSelection && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600">Wynik porównania:</span>
            <span
              className={`text-xs font-medium ${
                totalDifferences === 0 ? 'text-green-600' : 'text-amber-600'
              }`}
              data-testid="compare-diff-summary"
            >
              {getDiffSummary()}
            </span>
          </div>
        </div>
      )}

      {/* Zawartość */}
      <div className="flex-1 overflow-y-auto" data-testid="compare-content">
        {!isCompareMode || !compareSelection ? (
          <EmptyCompareState />
        ) : (
          <div className="divide-y divide-slate-200">
            {compareSections.map((section) => (
              <CompareSection
                key={section.id}
                section={section}
                elementAName={compareSelection.elementA.elementName}
                elementBName={compareSelection.elementB.elementName}
                defaultExpanded={true}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stopka */}
      {isCompareMode && compareSelection && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span>
              Tryb: {SLD_MODE_LABELS_PL[mode]}
            </span>
            <span>
              {compareSections.reduce((acc, s) => acc + s.fields.length, 0)} właściwości
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// EKSPORT
// =============================================================================

export default SldInspectorComparePanel;
