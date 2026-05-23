/**
 * Inspector Property Grid (READ-ONLY)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Property grid w stylu Canonical
 * - wizard_screens.md § 2.4: Siatka właściwości (read-only)
 *
 * FORMAT: label | value | unit
 * - Brak edycji
 * - Brak akcji
 * - Sekcje z nagłówkami
 * - Deterministyczne data-testid
 *
 * 100% POLISH UI
 */

import { useState, useCallback } from 'react';
import type { InspectorSection, InspectorField } from './types';
import { ValueProvenanceIcon } from './ValueProvenancePopover';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formatuje wartość liczbową z polskim formatowaniem.
 */
function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formatuje wartość do wyświetlenia.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

/**
 * Generuje deterministyczny testid dla pola.
 */
function getFieldTestId(sectionId: string, fieldKey: string): string {
  return `inspector-field-${sectionId}-${fieldKey}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

// =============================================================================
// PropertyRow Component
// =============================================================================

interface PropertyRowProps {
  field: InspectorField;
  sectionId: string;
}

/**
 * Pojedynczy wiersz właściwości: label | value | unit
 */
function PropertyRow({ field, sectionId }: PropertyRowProps) {
  const testId = getFieldTestId(sectionId, field.key);

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

  const getSourceIndicator = () => {
    switch (field.source) {
      case 'type':
        return '(z katalogu)';
      case 'calculated':
        return '(obliczone)';
      case 'audit':
        return '(system)';
      default:
        return null;
    }
  };

  return (
    <div
      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0"
      data-testid={testId}
    >
      {/* Label */}
      <dt className="text-xs text-slate-500 flex items-center gap-1">
        {field.label}
        {getSourceIndicator() && (
          <span className="text-slate-400 text-[10px]">{getSourceIndicator()}</span>
        )}
      </dt>

      {/* Value + Unit + Provenance */}
      <dd className={`flex items-center gap-0.5 text-xs font-mono ${getValueClass()}`}>
        {formatValue(field.value)}
        {field.unit && <span className="ml-1 text-slate-400">{field.unit}</span>}
        {(field.provenance || field.source === 'calculated' || field.source === 'type') && (
          <ValueProvenanceIcon fieldLabel={field.label} provenance={field.provenance} />
        )}
      </dd>
    </div>
  );
}

// =============================================================================
// PropertySection Component
// =============================================================================

interface PropertySectionProps {
  section: InspectorSection;
  defaultCollapsed?: boolean;
}

/**
 * Sekcja właściwości z nagłówkiem i polami.
 */
function PropertySection({ section, defaultCollapsed = false }: PropertySectionProps) {
  const [collapsed, setCollapsed] = useState(section.collapsed ?? defaultCollapsed);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <div data-testid={`inspector-section-${section.id}`}>
      {/* Section Header */}
      <button
        type="button"
        onClick={toggleCollapse}
        className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Rozwiń' : 'Zwiń'} sekcję ${section.label}`}
        data-testid={`inspector-section-header-${section.id}`}
      >
        <span className="text-xs font-medium text-slate-700 flex items-center gap-2">
          <span className="text-slate-400">{collapsed ? '[+]' : '[-]'}</span>
          {section.label}
        </span>
        <span className="text-xs text-slate-400">
          {section.fields.length} {section.fields.length === 1 ? 'pole' : 'pól'}
        </span>
      </button>

      {/* Section Fields */}
      {!collapsed && (
        <dl className="px-4 py-2" data-testid={`inspector-section-fields-${section.id}`}>
          {section.fields.map((field) => (
            <PropertyRow key={field.key} field={field} sectionId={section.id} />
          ))}
        </dl>
      )}
    </div>
  );
}

// =============================================================================
// ReadOnlyPropertyGrid Component (Main Export)
// =============================================================================

interface ReadOnlyPropertyGridProps {
  sections: InspectorSection[];
  className?: string;
}

/**
 * Read-only Property Grid dla Inspector.
 *
 * Wyświetla sekcje z polami w formacie Canonical:
 * - Nagłówek sekcji (zwijany)
 * - Pola: label | value | unit
 * - Brak edycji, brak akcji
 */
export function ReadOnlyPropertyGrid({ sections, className = '' }: ReadOnlyPropertyGridProps) {
  if (sections.length === 0) {
    return (
      <div
        className={`bg-white border border-slate-200 rounded p-4 ${className}`}
        data-testid="inspector-property-grid-empty"
      >
        <p className="text-sm text-slate-500 text-center">
          Brak właściwości do wyświetlenia.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border border-slate-200 rounded overflow-hidden ${className}`}
      data-testid="inspector-property-grid"
    >
      {sections.map((section) => (
        <PropertySection key={section.id} section={section} />
      ))}
    </div>
  );
}

export default ReadOnlyPropertyGrid;
