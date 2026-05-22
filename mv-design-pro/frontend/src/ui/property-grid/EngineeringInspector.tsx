/**
 * @deprecated Użyj `TechCard` z `frontend/src/ui/tech-card/`.
 * Engineering Inspector jest zastępowany przez ujednoliconą rodzinę TechCard.
 * Plik pozostaje tymczasowo na potrzeby istniejących konsumentów. Usunięcie w PR-4.
 *
 * Engineering Inspector -- Section 10 Enhanced Element Inspector
 *
 * CANONICAL ALIGNMENT:
 * - docs/spec/ Section 10: Enhanced Element Inspector requirements
 * - ui_canonical_parity.md Section D: Property Grid rules
 * - wizard_screens.md Section 3: Field definitions per element type
 *
 * FEATURES:
 * - Dynamic sections based on element type (hide irrelevant sections)
 * - "Podstawowe" section (name, ref_id, status)
 * - "Typ i katalog" section (catalog type, materialization status, drift detection)
 * - "Parametry techniczne" section (element-specific fields with units)
 * - "Obliczenia i wyniki" section (power flow / SC results summary)
 * - "Zabezpieczenia" section (protection device info for CB/bay elements)
 * - Zero empty fields policy: non-editable empty = hidden, editable empty = hint
 * - Inline validation with Polish error messages and units
 * - Collapsible sections with error count badge
 *
 * INVARIANTS:
 * - No physics -- display and interpretation only
 * - Deterministic section ordering
 * - Read-only fields clearly marked
 * - 100% Polish labels
 */

import React, { useMemo, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import type { PropertyField, PropertySection, ValidationMessage } from '../types';
import { getFieldDefinitionsForMode } from './field-definitions';
import { validateField } from './validation';
import { UnitLabel, ValueWithUnit } from './UnitLabel';
import { ValidationIcon } from './ValidationBadge';

// =============================================================================
// Types
// =============================================================================

export interface EngineeringInspectorProps {
  elementId: string | null;
  elementType: string | null;
  elementData: Record<string, unknown> | null;
  catalogInfo?: {
    namespace: string;
    typeId: string;
    typeName: string;
    version: string;
    isMaterialized: boolean;
    hasDrift: boolean;
  } | null;
  resultsSummary?: {
    hasResults: boolean;
    loadingPct?: number;
    voltageKv?: number;
    voltagePu?: number;
    scIk3f?: number;
  } | null;
  protectionInfo?: {
    hasProtection: boolean;
    deviceType?: string;
    pickupA?: number;
    delayS?: number;
  } | null;
  onFieldChange?: (field: string, value: unknown) => void;
  onChangeCatalogType?: () => void;
  onRefreshFromCatalog?: () => void;
  onNavigateToResults?: () => void;
  onEditProtection?: () => void;
  onDeleteElement?: () => void;
}

interface FieldEditState {
  fieldKey: string;
  value: unknown;
  error: string | null;
}

// =============================================================================
// Stable empty references (for hooks when no element is selected)
// =============================================================================

const EMPTY_DATA: Record<string, unknown> = {};
const EMPTY_SECTIONS: PropertySection[] = [];

// =============================================================================
// Section IDs (deterministic order)
// =============================================================================

const ENGINEERING_SECTION_ORDER = [
  'podstawowe',
  'typ_i_katalog',
  'parametry_techniczne',
  'obliczenia_i_wyniki',
  'zabezpieczenia',
] as const;

type EngineeringSectionId = (typeof ENGINEERING_SECTION_ORDER)[number];

// =============================================================================
// Section labels (Polish)
// =============================================================================

const ENGINEERING_SECTION_LABELS: Record<EngineeringSectionId, string> = {
  podstawowe: 'Podstawowe',
  typ_i_katalog: 'Typ i katalog',
  parametry_techniczne: 'Parametry techniczne',
  obliczenia_i_wyniki: 'Obliczenia i wyniki',
  zabezpieczenia: 'Zabezpieczenia',
};

// =============================================================================
// Element types that have protection information
// =============================================================================

const PROTECTION_ELEMENT_TYPES = new Set([
  'Switch',
  'BaySN',
]);

// =============================================================================
// Field classification helpers
// =============================================================================

/**
 * Field keys that belong to "Podstawowe" section.
 */
const PODSTAWOWE_KEYS = new Set([
  'id',
  'name',
  'uuid',
  'element_type',
  'in_service',
  'lifecycle_state',
]);

/**
 * Section IDs from field-definitions that map to "Parametry techniczne".
 */
const TECHNICAL_SECTION_IDS = new Set([
  'topology',
  'type_params',
  'local_params',
  'electrical_params',
  'nameplate',
  'short_circuit',
  'power_flow',
  'oltc',
]);

// =============================================================================
// Value helpers
// =============================================================================

function isFieldEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function getEmptyHint(field: PropertyField): string {
  if (field.type === 'number') return 'Wymagana wartość liczbowa';
  if (field.type === 'enum') return 'Wybierz z listy';
  if (field.type === 'ref') return 'Wymagana referencja';
  if (field.type === 'boolean') return 'Tak/Nie';
  if (field.type === 'type_ref_with_actions') return 'Przypisz typ z katalogu';
  return 'Uzupełnij dane';
}

function formatFieldValue(value: unknown, field: PropertyField): string {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    const formatted = Number.isInteger(value)
      ? String(value)
      : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return field.unit ? `${formatted} ${field.unit}` : formatted;
  }
  return String(value);
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Collapsible section header with error count badge.
 */
interface SectionHeaderProps {
  sectionId: string;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  fieldCount: number;
  errorCount: number;
  warningCount: number;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  sectionId,
  label,
  collapsed,
  onToggle,
  fieldCount,
  errorCount,
  warningCount,
}) => {
  const totalIssues = errorCount + warningCount;

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      data-testid={`engineering-section-header-${sectionId}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{collapsed ? '\u25B8' : '\u25BE'}</span>
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {fieldCount > 0 && (
          <span className="text-xs text-gray-400">{fieldCount}</span>
        )}
        {collapsed && totalIssues > 0 && (
          <span
            className={clsx(
              'min-w-[18px] h-[18px] flex items-center justify-center text-xs font-bold rounded-full px-1',
              errorCount > 0
                ? 'bg-red-500 text-white'
                : 'bg-amber-400 text-amber-900',
            )}
          >
            {totalIssues}
          </span>
        )}
        {!collapsed && errorCount > 0 && (
          <ValidationIcon severity="ERROR" />
        )}
        {!collapsed && warningCount > 0 && errorCount === 0 && (
          <ValidationIcon severity="WARNING" />
        )}
      </div>
    </button>
  );
};

/**
 * Inline field editor.
 */
interface InlineEditorProps {
  field: PropertyField;
  value: unknown;
  error: string | null;
  onChange: (value: unknown) => void;
  onCommit: () => void;
  onCancel: () => void;
}

const InlineEditor: React.FC<InlineEditorProps> = ({
  field,
  value,
  error,
  onChange,
  onCommit,
  onCancel,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onCommit();
    if (e.key === 'Escape') onCancel();
  };

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => {
          onChange(e.target.checked);
          onCommit();
        }}
        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        autoFocus
      />
    );
  }

  if (field.type === 'enum' && field.enumOptions) {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => {
          onChange(e.target.value);
          onCommit();
        }}
        className="flex-1 text-xs border border-blue-400 rounded px-1 py-0.5 focus:ring-blue-500 focus:border-blue-500"
        autoFocus
        onKeyDown={handleKeyDown}
      >
        {field.enumOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex-1">
      <div className="flex items-center gap-1">
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => {
            const newVal =
              field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
            onChange(newVal);
          }}
          className={clsx(
            'w-full text-xs border rounded px-1 py-0.5 font-mono',
            error ? 'border-red-400 bg-red-50' : 'border-blue-400',
          )}
          autoFocus
          onKeyDown={handleKeyDown}
          onBlur={onCommit}
        />
        {field.unit && <UnitLabel unit={field.unit} compact />}
      </div>
      {error && <div className="text-xs text-red-500 mt-0.5">{error}</div>}
    </div>
  );
};

/**
 * Single property field row.
 */
interface FieldRowProps {
  field: PropertyField;
  value: unknown;
  isEditable: boolean;
  isEditing: boolean;
  editState: FieldEditState | null;
  validation: ValidationMessage | undefined;
  onStartEdit: (fieldKey: string, value: unknown) => void;
  onEdit: (fieldKey: string, value: unknown) => void;
  onCommit: (fieldKey: string, value: unknown) => void;
  onCancel: () => void;
}

const FieldRow: React.FC<FieldRowProps> = ({
  field,
  value,
  isEditable,
  isEditing,
  editState,
  validation,
  onStartEdit,
  onEdit,
  onCommit,
  onCancel,
}) => {
  const isEmpty = isFieldEmpty(value);

  return (
    <div
      className={clsx(
        'flex items-center px-3 py-1.5',
        validation?.severity === 'ERROR' && 'bg-red-50',
        validation?.severity === 'WARNING' && 'bg-amber-50',
        isEmpty && isEditable && !validation && 'bg-blue-50/30',
      )}
      data-testid={`engineering-field-${field.key}`}
    >
      {/* Label */}
      <div className="w-[45%] flex items-center gap-1">
        <span
          className={clsx(
            'text-xs',
            field.source === 'type' && 'text-gray-400',
            field.source === 'calculated' && 'text-gray-400 italic',
            field.source === 'instance' && 'text-gray-700',
          )}
        >
          {field.label}
        </span>
        {field.unit && !isEditing && (
          <span className="text-xs text-gray-400">[{field.unit}]</span>
        )}
        {!field.editable && (
          <span className="text-xs text-gray-300" title="Tylko odczyt">
            [RO]
          </span>
        )}
      </div>

      {/* Value */}
      <div className="w-[55%] flex items-center gap-1">
        {isEditing && editState ? (
          <InlineEditor
            field={field}
            value={editState.value}
            error={editState.error}
            onChange={(v) => onEdit(field.key, v)}
            onCommit={() => onCommit(field.key, editState.value)}
            onCancel={onCancel}
          />
        ) : (
          <div
            className={clsx(
              'flex-1 text-xs font-mono cursor-default',
              isEmpty && 'text-gray-400 italic',
              !isEmpty && field.source === 'calculated' && 'text-blue-700',
              !isEmpty && field.source !== 'calculated' && 'text-gray-800',
              isEditable && 'cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1',
            )}
            onClick={() => isEditable && onStartEdit(field.key, value)}
          >
            {isEmpty ? getEmptyHint(field) : formatFieldValue(value, field)}
          </div>
        )}

        {/* Validation indicator */}
        {validation && !isEditing && (
          <span
            className={clsx(
              'text-xs flex-shrink-0',
              validation.severity === 'ERROR' && 'text-red-600',
              validation.severity === 'WARNING' && 'text-amber-600',
            )}
            title={validation.message}
          >
            {validation.severity === 'ERROR' ? '\u2715' : '\u26A0'}
          </span>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Catalog Status Section
// =============================================================================

interface CatalogSectionContentProps {
  catalogInfo: NonNullable<EngineeringInspectorProps['catalogInfo']>;
  onChangeCatalogType?: () => void;
  onRefreshFromCatalog?: () => void;
}

const CatalogSectionContent: React.FC<CatalogSectionContentProps> = ({
  catalogInfo,
  onChangeCatalogType,
  onRefreshFromCatalog,
}) => {
  const { namespace, typeName, version, isMaterialized, hasDrift } = catalogInfo;

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Catalog namespace */}
      <div className="flex items-center">
        <span className="w-[45%] text-xs text-gray-600">Kategoria katalogu</span>
        <span className="w-[55%] text-xs font-mono text-gray-800">{namespace}</span>
      </div>

      {/* Type name */}
      <div className="flex items-center">
        <span className="w-[45%] text-xs text-gray-600">Typ</span>
        <span className="w-[55%] text-xs font-mono text-gray-800">{typeName}</span>
      </div>

      {/* Version */}
      <div className="flex items-center">
        <span className="w-[45%] text-xs text-gray-600">Wersja</span>
        <span className="w-[55%] text-xs font-mono text-gray-800">{version}</span>
      </div>

      {/* Materialization status */}
      <div className="flex items-center">
        <span className="w-[45%] text-xs text-gray-600">Status parametrów</span>
        <div className="w-[55%]">
          {isMaterialized && !hasDrift && (
            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Parametry wczytane
            </span>
          )}
          {isMaterialized && hasDrift && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              Rozbiez\u0307nos\u0301c\u0301 katalogu
            </span>
          )}
          {!isMaterialized && (
            <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
              Brak parametrów
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        {onChangeCatalogType && (
          <button
            onClick={onChangeCatalogType}
            data-testid="engineering-catalog-change-button"
            className={clsx(
              'px-3 py-1 text-xs rounded transition-colors',
              !isMaterialized
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : hasDrift
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
            )}
          >
            Zmień typ z katalogu
          </button>
        )}
        {isMaterialized && hasDrift && onRefreshFromCatalog && (
          <button
            onClick={onRefreshFromCatalog}
            data-testid="engineering-catalog-refresh-button"
            className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
          >
            Odśwież parametry z katalogu
          </button>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// No Catalog Assigned Placeholder
// =============================================================================

interface NoCatalogPlaceholderProps {
  onChangeCatalogType?: () => void;
}

const NoCatalogPlaceholder: React.FC<NoCatalogPlaceholderProps> = ({
  onChangeCatalogType,
}) => (
  <div className="px-3 py-2 space-y-2">
    <div className="flex items-center">
      <span className="w-[45%] text-xs text-gray-600">Status parametrów</span>
      <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded">
        <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
        Brak parametrów
      </span>
    </div>
    {onChangeCatalogType && (
      <div className="pt-1">
        <button
          onClick={onChangeCatalogType}
          data-testid="engineering-catalog-change-button"
          className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Zmień typ z katalogu
        </button>
      </div>
    )}
  </div>
);

// =============================================================================
// Results Summary Section
// =============================================================================

interface ResultsSectionContentProps {
  resultsSummary: NonNullable<EngineeringInspectorProps['resultsSummary']>;
  onNavigateToResults?: () => void;
}

const ResultsSectionContent: React.FC<ResultsSectionContentProps> = ({
  resultsSummary,
  onNavigateToResults,
}) => {
  const { loadingPct, voltageKv, voltagePu, scIk3f } = resultsSummary;

  return (
    <div className="px-3 py-2 space-y-1.5">
      {loadingPct !== undefined && (
        <div className="flex items-center">
          <span className="w-[45%] text-xs text-gray-600">Obciążenie</span>
          <div className="w-[55%] flex items-center gap-2">
            <ValueWithUnit
              value={loadingPct}
              unit="%"
              decimals={1}
              valueClassName={clsx(
                'text-xs',
                loadingPct > 100 ? 'text-red-700 font-bold' : 'text-gray-800',
              )}
            />
            {loadingPct > 100 && (
              <span className="text-xs text-red-600 font-medium">Przeciążenie</span>
            )}
          </div>
        </div>
      )}

      {voltageKv !== undefined && (
        <div className="flex items-center">
          <span className="w-[45%] text-xs text-gray-600">Napięcie</span>
          <div className="w-[55%] flex items-center gap-1">
            <ValueWithUnit
              value={voltageKv}
              unit="kV"
              decimals={2}
              valueClassName="text-xs text-gray-800"
            />
            {voltagePu !== undefined && (
              <span className="text-xs text-gray-500 ml-1">
                ({voltagePu.toFixed(3)} p.u.)
              </span>
            )}
          </div>
        </div>
      )}

      {scIk3f !== undefined && (
        <div className="flex items-center">
          <span className="w-[45%] text-xs text-gray-600">Ik" (3F)</span>
          <ValueWithUnit
            value={scIk3f}
            unit="kA"
            decimals={2}
            valueClassName="text-xs text-gray-800"
          />
        </div>
      )}

      {onNavigateToResults && (
        <div className="pt-1">
          <button
            onClick={onNavigateToResults}
            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            Przejdź do wyników
          </button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Protection Section
// =============================================================================

interface ProtectionSectionContentProps {
  protectionInfo: NonNullable<EngineeringInspectorProps['protectionInfo']>;
  onEditProtection?: () => void;
}

const ProtectionSectionContent: React.FC<ProtectionSectionContentProps> = ({
  protectionInfo,
  onEditProtection,
}) => {
  const { hasProtection, deviceType, pickupA, delayS } = protectionInfo;

  if (!hasProtection) {
    return (
      <div className="px-3 py-2">
        <div className="text-xs text-gray-400 italic">
          Brak przypisanego zabezpieczenia
        </div>
        {onEditProtection && (
          <button
            onClick={onEditProtection}
            className="mt-2 px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Konfiguruj zabezpieczenie
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-1.5">
      {deviceType !== undefined && (
        <div className="flex items-center">
          <span className="w-[45%] text-xs text-gray-600">Typ urządzenia</span>
          <span className="w-[55%] text-xs font-mono text-gray-800">{deviceType}</span>
        </div>
      )}

      {pickupA !== undefined && (
        <div className="flex items-center">
          <span className="w-[45%] text-xs text-gray-600">Próg wyzwolenia</span>
          <ValueWithUnit
            value={pickupA}
            unit="A"
            decimals={1}
            valueClassName="text-xs text-gray-800"
          />
        </div>
      )}

      {delayS !== undefined && (
        <div className="flex items-center">
          <span className="w-[45%] text-xs text-gray-600">Opóźnienie</span>
          <ValueWithUnit
            value={delayS}
            unit="s"
            decimals={2}
            valueClassName="text-xs text-gray-800"
          />
        </div>
      )}

      {onEditProtection && (
        <div className="pt-1">
          <button
            onClick={onEditProtection}
            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            Edytuj zabezpieczenie
          </button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const EngineeringInspector: React.FC<EngineeringInspectorProps> = ({
  elementId,
  elementType,
  elementData,
  catalogInfo,
  resultsSummary,
  protectionInfo,
  onFieldChange,
  onChangeCatalogType,
  onRefreshFromCatalog,
  onNavigateToResults,
  onEditProtection,
  onDeleteElement,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [editState, setEditState] = useState<FieldEditState | null>(null);
  const [localValidationErrors, setLocalValidationErrors] = useState<Map<string, ValidationMessage>>(
    new Map(),
  );

  // Use safe fallbacks so hooks always run with stable references
  const safeElementType = elementType ?? '';
  const safeElementData = elementData ?? EMPTY_DATA;

  // -------------------------------------------------------------------------
  // Derive field definitions from existing field-definitions registry
  // -------------------------------------------------------------------------
  const allSections = useMemo(
    () =>
      safeElementType
        ? getFieldDefinitionsForMode(
            safeElementType as Parameters<typeof getFieldDefinitionsForMode>[0],
            'MODEL_EDIT',
          )
        : EMPTY_SECTIONS,
    [safeElementType],
  );

  // -------------------------------------------------------------------------
  // Classify fields into engineering sections
  // -------------------------------------------------------------------------
  const podstawoweFields = useMemo(() => {
    const fields: PropertyField[] = [];
    for (const section of allSections) {
      for (const field of section.fields) {
        if (PODSTAWOWE_KEYS.has(field.key)) {
          fields.push(field);
        }
      }
    }
    return fields;
  }, [allSections]);

  const techFields = useMemo(() => {
    const fields: PropertyField[] = [];
    for (const section of allSections) {
      if (TECHNICAL_SECTION_IDS.has(section.id)) {
        fields.push(...section.fields);
      }
    }
    // Also pick up non-podstawowe fields from identification/state that are not in PODSTAWOWE_KEYS
    for (const section of allSections) {
      if (section.id === 'identification' || section.id === 'state') {
        for (const field of section.fields) {
          if (!PODSTAWOWE_KEYS.has(field.key) && !fields.some((f) => f.key === field.key)) {
            fields.push(field);
          }
        }
      }
    }
    return fields;
  }, [allSections]);

  // -------------------------------------------------------------------------
  // All fields flat list
  // -------------------------------------------------------------------------
  const allFields = useMemo(
    () => allSections.flatMap((s) => s.fields),
    [allSections],
  );

  const validationForField = useCallback(
    (fieldKey: string): ValidationMessage | undefined => {
      return localValidationErrors.get(fieldKey);
    },
    [localValidationErrors],
  );

  // -------------------------------------------------------------------------
  // Visible fields filtering (zero-empty-field policy)
  // -------------------------------------------------------------------------
  const filterVisible = useCallback(
    (fields: PropertyField[]): PropertyField[] => {
      return fields.filter((field) => {
        const value = safeElementData[field.key] ?? field.value;
        // Always show editable fields
        if (field.editable) return true;
        // Always show fields with values
        if (!isFieldEmpty(value)) return true;
        // Show fields with validation messages
        if (localValidationErrors.has(field.key)) return true;
        // Hide empty read-only
        return false;
      });
    },
    [safeElementData, localValidationErrors],
  );

  const visiblePodstawowe = useMemo(
    () => filterVisible(podstawoweFields),
    [filterVisible, podstawoweFields],
  );

  const visibleTech = useMemo(
    () => filterVisible(techFields),
    [filterVisible, techFields],
  );

  // -------------------------------------------------------------------------
  // Section visibility
  // -------------------------------------------------------------------------
  const showCatalog = useMemo(() => {
    // Show catalog section if catalogInfo provided or if element has type_ref fields
    if (catalogInfo) return true;
    return allFields.some((f) => f.type === 'type_ref_with_actions');
  }, [catalogInfo, allFields]);

  const showResults = useMemo(
    () => resultsSummary?.hasResults === true,
    [resultsSummary],
  );

  const showProtection = useMemo(() => {
    if (!protectionInfo) return false;
    return PROTECTION_ELEMENT_TYPES.has(safeElementType) || protectionInfo.hasProtection;
  }, [protectionInfo, safeElementType]);

  // -------------------------------------------------------------------------
  // Error counts per section
  // -------------------------------------------------------------------------
  const countErrors = useCallback(
    (fields: PropertyField[], severity: 'ERROR' | 'WARNING'): number => {
      return fields.filter((f) => {
        const v = localValidationErrors.get(f.key);
        return v?.severity === severity;
      }).length;
    },
    [localValidationErrors],
  );

  // -------------------------------------------------------------------------
  // Edit handlers
  // -------------------------------------------------------------------------
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const handleStartEdit = useCallback(
    (fieldKey: string, value: unknown) => {
      const field = allFields.find((f) => f.key === fieldKey);
      if (!field) return;
      const result = validateField(safeElementType, field, value);
      const error = result && !result.valid ? (result.message ?? null) : null;
      setEditState({ fieldKey, value, error });
    },
    [allFields, safeElementType],
  );

  const handleEdit = useCallback(
    (fieldKey: string, value: unknown) => {
      const field = allFields.find((f) => f.key === fieldKey);
      if (!field) return;
      const result = validateField(safeElementType, field, value);
      const error = result && !result.valid ? (result.message ?? null) : null;
      setEditState({ fieldKey, value, error });
    },
    [allFields, safeElementType],
  );

  const handleCommit = useCallback(
    (fieldKey: string, value: unknown) => {
      const field = allFields.find((f) => f.key === fieldKey);
      const result = field ? validateField(safeElementType, field, value) : null;
      const error = result && !result.valid ? (result.message ?? null) : null;

      if (error && result) {
        // Store local validation error
        setLocalValidationErrors((prev) => {
          const next = new Map(prev);
          next.set(fieldKey, {
            code: result.code ?? 'E-VAL-00',
            severity: result.severity ?? 'ERROR',
            message: error,
            field: fieldKey,
          });
          return next;
        });
      } else {
        // Clear local validation error and commit
        setLocalValidationErrors((prev) => {
          const next = new Map(prev);
          next.delete(fieldKey);
          return next;
        });
        onFieldChange?.(fieldKey, value);
      }
      setEditState(null);
    },
    [allFields, safeElementType, onFieldChange],
  );

  const handleCancel = useCallback(() => {
    setEditState(null);
  }, []);

  // -------------------------------------------------------------------------
  // Guard: nothing selected (AFTER all hooks)
  // -------------------------------------------------------------------------
  if (!elementId || !elementType || !elementData) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full bg-white text-gray-400 text-xs p-4"
        data-testid="engineering-inspector-empty"
      >
        <span className="text-2xl mb-2">{'\u2190'}</span>
        <span>Wybierz element na schemacie</span>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render field list for a section
  // -------------------------------------------------------------------------
  const renderFields = (fields: PropertyField[]) => {
    return fields.map((field) => {
      const value = elementData[field.key] ?? field.value;
      const validation = validationForField(field.key);
      const isEditing = editState?.fieldKey === field.key;
      const isEditable = field.editable;

      return (
        <FieldRow
          key={field.key}
          field={field}
          value={value}
          isEditable={isEditable}
          isEditing={isEditing}
          editState={isEditing ? editState : null}
          validation={validation}
          onStartEdit={handleStartEdit}
          onEdit={handleEdit}
          onCommit={handleCommit}
          onCancel={handleCancel}
        />
      );
    });
  };

  // -------------------------------------------------------------------------
  // Derive element display name
  // -------------------------------------------------------------------------
  const elementName = (elementData['name'] as string) ?? elementId;

  // -------------------------------------------------------------------------
  // Total validation issues
  // -------------------------------------------------------------------------
  const totalErrors = localValidationErrors.size;

  return (
    <div
      className="flex flex-col h-full bg-white"
      data-testid="engineering-inspector"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-800 truncate">
              {elementName}
            </h3>
            <span className="text-xs text-gray-500">{elementType}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {totalErrors > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded">
                {totalErrors} {totalErrors === 1 ? 'bł\u0105d' : 'bł\u0119dów'}
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">
          {elementId}
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* 1. Podstawowe */}
        {visiblePodstawowe.length > 0 && (
          <div
            className="border-b border-gray-100"
            data-testid="engineering-section-podstawowe"
          >
            <SectionHeader
              sectionId="podstawowe"
              label={ENGINEERING_SECTION_LABELS.podstawowe}
              collapsed={collapsedSections.has('podstawowe')}
              onToggle={() => toggleSection('podstawowe')}
              fieldCount={visiblePodstawowe.length}
              errorCount={countErrors(podstawoweFields, 'ERROR')}
              warningCount={countErrors(podstawoweFields, 'WARNING')}
            />
            {!collapsedSections.has('podstawowe') && (
              <div className="py-1">{renderFields(visiblePodstawowe)}</div>
            )}
          </div>
        )}

        {/* 2. Typ i katalog */}
        {showCatalog && (
          <div
            className="border-b border-gray-100"
            data-testid="engineering-section-typ_i_katalog"
          >
            <SectionHeader
              sectionId="typ_i_katalog"
              label={ENGINEERING_SECTION_LABELS.typ_i_katalog}
              collapsed={collapsedSections.has('typ_i_katalog')}
              onToggle={() => toggleSection('typ_i_katalog')}
              fieldCount={catalogInfo ? 4 : 1}
              errorCount={catalogInfo && !catalogInfo.isMaterialized ? 1 : 0}
              warningCount={catalogInfo?.hasDrift ? 1 : 0}
            />
            {!collapsedSections.has('typ_i_katalog') && (
              catalogInfo ? (
                <CatalogSectionContent
                  catalogInfo={catalogInfo}
                  onChangeCatalogType={onChangeCatalogType}
                  onRefreshFromCatalog={onRefreshFromCatalog}
                />
              ) : (
                <NoCatalogPlaceholder
                  onChangeCatalogType={onChangeCatalogType}
                />
              )
            )}
          </div>
        )}

        {/* 3. Parametry techniczne */}
        {visibleTech.length > 0 && (
          <div
            className="border-b border-gray-100"
            data-testid="engineering-section-parametry_techniczne"
          >
            <SectionHeader
              sectionId="parametry_techniczne"
              label={ENGINEERING_SECTION_LABELS.parametry_techniczne}
              collapsed={collapsedSections.has('parametry_techniczne')}
              onToggle={() => toggleSection('parametry_techniczne')}
              fieldCount={visibleTech.length}
              errorCount={countErrors(techFields, 'ERROR')}
              warningCount={countErrors(techFields, 'WARNING')}
            />
            {!collapsedSections.has('parametry_techniczne') && (
              <div className="py-1">{renderFields(visibleTech)}</div>
            )}
          </div>
        )}

        {/* 4. Obliczenia i wyniki */}
        {showResults && resultsSummary && (
          <div
            className="border-b border-gray-100"
            data-testid="engineering-section-obliczenia_i_wyniki"
          >
            <SectionHeader
              sectionId="obliczenia_i_wyniki"
              label={ENGINEERING_SECTION_LABELS.obliczenia_i_wyniki}
              collapsed={collapsedSections.has('obliczenia_i_wyniki')}
              onToggle={() => toggleSection('obliczenia_i_wyniki')}
              fieldCount={
                [resultsSummary.loadingPct, resultsSummary.voltageKv, resultsSummary.scIk3f]
                  .filter((v) => v !== undefined).length
              }
              errorCount={0}
              warningCount={
                resultsSummary.loadingPct !== undefined && resultsSummary.loadingPct > 100
                  ? 1
                  : 0
              }
            />
            {!collapsedSections.has('obliczenia_i_wyniki') && (
              <ResultsSectionContent
                resultsSummary={resultsSummary}
                onNavigateToResults={onNavigateToResults}
              />
            )}
          </div>
        )}

        {/* 5. Zabezpieczenia */}
        {showProtection && protectionInfo && (
          <div
            className="border-b border-gray-100"
            data-testid="engineering-section-zabezpieczenia"
          >
            <SectionHeader
              sectionId="zabezpieczenia"
              label={ENGINEERING_SECTION_LABELS.zabezpieczenia}
              collapsed={collapsedSections.has('zabezpieczenia')}
              onToggle={() => toggleSection('zabezpieczenia')}
              fieldCount={
                protectionInfo.hasProtection
                  ? [protectionInfo.deviceType, protectionInfo.pickupA, protectionInfo.delayS]
                      .filter((v) => v !== undefined).length
                  : 0
              }
              errorCount={0}
              warningCount={!protectionInfo.hasProtection ? 1 : 0}
            />
            {!collapsedSections.has('zabezpieczenia') && (
              <ProtectionSectionContent
                protectionInfo={protectionInfo}
                onEditProtection={onEditProtection}
              />
            )}
          </div>
        )}

        {onDeleteElement && elementId && (
          <div className="border-t border-gray-200 p-3 bg-gray-50" data-testid="engineering-delete-action">
            <button
              type="button"
              onClick={onDeleteElement}
              className="w-full px-3 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
              data-testid="engineering-delete-button"
            >
              Usuń element z modelu
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EngineeringInspector;
