/**
 * SLD Inspector Panel — PR-SLD-07 + PR-SLD-08
 *
 * Panel boczny inspektora elementu / połączenia (READ-ONLY)
 * Z obsługą trybu porównania (PR-SLD-08)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Property grid w stylu Canonical / CANONICAL
 * - sld_rules.md § G.1: Inspector wyświetla właściwości wybranego elementu
 * - wizard_screens.md § 2.4: Inspector jako read-only property grid
 *
 * FEATURES:
 * - Panel boczny po PRAWEJ stronie (320-360px)
 * - Scroll pionowy
 * - Nagłówek: typ + identyfikator
 * - Sekcje składane (accordion), DOMYŚLNIE ROZWINIĘTE
 * - 100% READ-ONLY (brak przycisków akcji)
 * - Działa w trybach EDYCJA i WYNIKI
 * - PR-SLD-08: Tryb porównania gdy zaznaczone są 2 elementy
 *
 * 100% POLISH UI - BRAK ANGLICYZMÓW
 */

import { useState, useCallback } from 'react';
import { useSldInspectorSelection } from './useSldInspectorSelection';
import { useSldCompareSelection, SldInspectorComparePanel } from './compare';
import type {
  InspectorPropertySection,
  InspectorPropertyField,
} from './types';
import {
  ELEMENT_TYPE_LABELS_PL,
} from './types';
import { SLD_MODE_LABELS_PL } from '../sldModeStore';

// =============================================================================
// STAŁE
// =============================================================================

/** Szerokość panelu inspektora */
const INSPECTOR_WIDTH = 340;

// =============================================================================
// KOMPONENT POLA WŁAŚCIWOŚCI
// =============================================================================

interface PropertyFieldRowProps {
  field: InspectorPropertyField;
  sectionId: string;
}

/**
 * Pojedynczy wiersz właściwości: label | value | unit
 */
function PropertyFieldRow({ field, sectionId }: PropertyFieldRowProps) {
  const testId = `inspector-field-${sectionId}-${field.key}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Klasa dla wartości na podstawie highlight
  const getValueClass = () => {
    switch (field.highlight) {
      case 'error':
        return 'font-semibold text-rose-600';
      case 'warning':
        return 'text-amber-600';
      case 'primary':
        return 'font-semibold text-blue-700';
      default:
        return field.source === 'calculated' ? 'text-blue-700' : 'text-slate-800';
    }
  };

  // Wskaźnik źródła danych
  const getSourceIndicator = () => {
    switch (field.source) {
      case 'calculated':
        return '(obliczone)';
      case 'analysis':
        return '(analiza)';
      default:
        return null;
    }
  };

  // Formatuj wartość
  const formatValue = (value: string | number | boolean | null): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
    return String(value);
  };

  return (
    <div
      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0"
      data-testid={testId}
    >
      {/* Etykieta */}
      <dt className="text-xs text-slate-500 flex items-center gap-1 flex-shrink-0 max-w-[45%]">
        <span className="truncate">{field.label}</span>
        {getSourceIndicator() && (
          <span className="text-slate-400 text-[10px] whitespace-nowrap">{getSourceIndicator()}</span>
        )}
      </dt>

      {/* Wartość + Jednostka */}
      <dd className={`text-xs font-mono text-right ${getValueClass()} truncate max-w-[50%]`}>
        {formatValue(field.value)}
        {field.unit && <span className="ml-1 text-slate-400">{field.unit}</span>}
      </dd>
    </div>
  );
}

// =============================================================================
// KOMPONENT SEKCJI WŁAŚCIWOŚCI
// =============================================================================

interface PropertySectionProps {
  section: InspectorPropertySection;
  defaultExpanded?: boolean;
}

/**
 * Sekcja właściwości z nagłówkiem i polami.
 * DOMYŚLNIE ROZWINIĘTA (per BINDING spec).
 */
function PropertySection({ section, defaultExpanded = true }: PropertySectionProps) {
  const [expanded, setExpanded] = useState(section.collapsed !== true && defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div data-testid={`inspector-section-${section.id}`}>
      {/* Nagłówek sekcji */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Zwiń' : 'Rozwiń'} sekcję ${section.label}`}
        data-testid={`inspector-section-header-${section.id}`}
      >
        <span className="text-xs font-medium text-slate-700 flex items-center gap-2">
          <span className="text-slate-400">{expanded ? '[-]' : '[+]'}</span>
          {section.label}
        </span>
        <span className="text-[10px] text-slate-400">
          {section.fields.length} {section.fields.length === 1 ? 'pole' : 'pól'}
        </span>
      </button>

      {/* Pola sekcji */}
      {expanded && (
        <dl className="px-4 py-2" data-testid={`inspector-section-fields-${section.id}`}>
          {section.fields.map((field) => (
            <PropertyFieldRow key={field.key} field={field} sectionId={section.id} />
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
 * Wyświetlany gdy brak selekcji.
 */
function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full p-6 text-center"
      data-testid="inspector-empty-state"
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
            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
          />
        </svg>
      </div>
      <h4 className="text-sm font-medium text-slate-700 mb-1">Brak zaznaczenia</h4>
      <p className="text-xs text-slate-500">
        Kliknij element lub połączenie na schemacie, aby zobaczyć szczegóły.
      </p>
    </div>
  );
}

// =============================================================================
// GŁÓWNY KOMPONENT PANELU
// =============================================================================

export interface SldInspectorPanelProps {
  /** Dodatkowe klasy CSS */
  className?: string;
  /** Callback wywoływany przy zamknięciu */
  onClose?: () => void;
}

/**
 * Panel inspektora SLD.
 *
 * Wyświetla właściwości wybranego elementu lub połączenia
 * w formacie Canonical / CANONICAL:
 * - Sekcje z nagłówkami (zwijalne, domyślnie rozwinięte)
 * - Pola: label | value | unit
 * - 100% READ-ONLY (brak edycji, brak akcji)
 *
 * PR-SLD-08: Automatycznie przełącza się w tryb porównania
 * gdy zaznaczone są dokładnie 2 elementy.
 *
 * @example
 * ```tsx
 * <SldInspectorPanel onClose={() => console.log('closed')} />
 * ```
 */
export function SldInspectorPanel({ className = '', onClose }: SldInspectorPanelProps) {
  const { selection, sections, mode, isResultsMode, closeInspector } = useSldInspectorSelection();
  const { isCompareMode } = useSldCompareSelection();

  // Obsługa zamknięcia (hook must precede early return)
  const handleClose = useCallback(() => {
    closeInspector();
    onClose?.();
  }, [closeInspector, onClose]);

  // PR-SLD-08: Jeśli tryb porównania (2 elementy), renderuj panel porównania
  if (isCompareMode) {
    return <SldInspectorComparePanel className={className} onClose={onClose} />;
  }

  // Tytuł panelu
  const getTitle = (): string => {
    if (selection.type === 'none') {
      return 'Inspektor';
    }
    if (selection.type === 'element') {
      return `${ELEMENT_TYPE_LABELS_PL[selection.elementType]}: ${selection.elementName}`;
    }
    if (selection.type === 'connection') {
      return `Połączenie: ${selection.connectionId.substring(0, 8)}...`;
    }
    return 'Inspektor';
  };

  // ID elementu dla testów
  const getSelectionId = (): string | null => {
    if (selection.type === 'element') {
      return selection.elementId;
    }
    if (selection.type === 'connection') {
      return selection.connectionId;
    }
    return null;
  };

  return (
    <div
      className={`flex flex-col h-full bg-white border-l border-slate-300 shadow-lg ${className}`}
      style={{ width: `${INSPECTOR_WIDTH}px`, minWidth: `${INSPECTOR_WIDTH}px` }}
      data-testid="sld-inspector-panel"
      data-selection-id={getSelectionId()}
      data-selection-type={selection.type}
      data-sld-mode={mode}
    >
      {/* Nagłówek — CANONICAL-grade dark header */}
      <div className="flex items-center justify-between bg-slate-800 px-4 py-3 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Inspektor
          </p>
          <h3
            className="text-sm font-semibold text-slate-100 truncate"
            data-testid="inspector-title"
            title={getTitle()}
          >
            {getTitle()}
          </h3>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="ml-2 rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors flex-shrink-0"
          aria-label="Zamknij inspektor"
          data-testid="inspector-close-button"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Znacznik trybu read-only — CANONICAL-grade subtle */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="font-medium">Tylko do odczytu</span>
          </div>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
              isResultsMode ? 'bg-blue-600 text-white' : 'bg-slate-600 text-slate-100'
            }`}
            data-testid="inspector-mode-badge"
          >
            {SLD_MODE_LABELS_PL[mode]}
          </span>
        </div>
      </div>

      {/* Zawartość */}
      <div className="flex-1 overflow-y-auto" data-testid="inspector-content">
        {selection.type === 'none' ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-slate-200">
            {sections.map((section) => (
              <PropertySection key={section.id} section={section} defaultExpanded={true} />
            ))}
          </div>
        )}
      </div>

      {/* Stopka — CANONICAL-grade professional */}
      {selection.type !== 'none' && (
        <div className="border-t border-slate-200 bg-slate-100 px-4 py-2 text-[10px] text-slate-500 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              {sections.reduce((acc, s) => acc + s.fields.length, 0)} właściwości
            </span>
            <span className="font-mono text-slate-400">
              v1.0
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

export default SldInspectorPanel;
