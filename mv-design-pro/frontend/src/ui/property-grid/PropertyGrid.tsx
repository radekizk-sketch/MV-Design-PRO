/**
 * Property Grid Component (PF-style) — P12b Enhancement
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 2.4, § 3: Siatka Właściwości specification
 * - ui_canonical_parity.md § D: Property Grid rules
 *
 * Features:
 * - Deterministic section and field ordering
 * - type_ref and Type params are READ-ONLY
 * - Mode gating: RESULT_VIEW = all read-only, MODEL_EDIT = instance fields editable
 * - Units displayed with values (UnitLabel component)
 * - Inline validation messages (ValidationBadge component)
 * - Validation section with all issues
 */

import { useState, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import type { ElementType, PropertyField, PropertySection as PropertySectionType, ValidationMessage } from '../types';
import { type RuntimeOperatingMode } from '../operatingMode';
import { getFieldDefinitionsForMode, SECTION_LABELS } from './field-definitions';
import { useSelectionStore, useCanEdit } from '../selection';
import { ValidationBadge, ValidationSummary, ValidationIcon } from './ValidationBadge';
import { UnitLabel, ValueWithUnit } from './UnitLabel';
import { validateField } from './validation';

// =============================================================================
// Types
// =============================================================================

interface PropertyGridProps {
  elementId: string;
  elementType: ElementType;
  elementName: string;
  elementData?: Record<string, unknown>;
  validationMessages?: ValidationMessage[];
  onFieldChange?: (fieldKey: string, value: unknown) => void;
  onAssignType?: () => void;
  onClearType?: () => void;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Property Grid Component.
 *
 * Displays element properties in deterministic, grouped sections.
 * Respects operating mode for edit/read-only state.
 */
export function PropertyGrid({
  elementId: _elementId,
  elementType,
  elementName,
  elementData = {},
  validationMessages = [],
  onFieldChange,
  onAssignType,
  onClearType,
}: PropertyGridProps) {
  const mode = useSelectionStore((state) => state.mode);
  const canEdit = useCanEdit();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [localValidationErrors, setLocalValidationErrors] = useState<Map<string, ValidationMessage>>(new Map());

  // P30e: Get field definitions for this element type and operating mode
  const sections = getFieldDefinitionsForMode(elementType, mode);

  // Merge element data into field definitions and wire callbacks
  const populatedSections = useMemo(() => {
    return sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const baseField = {
          ...field,
          value: elementData[field.key] ?? field.value,
          validation: validationMessages.find((v) => v.field === field.key) ??
                      localValidationErrors.get(field.key),
        };

        // Wire type library callbacks for type_ref_with_actions fields
        if (field.type === 'type_ref_with_actions') {
          return {
            ...baseField,
            onAssignType,
            onClearType,
            typeRefName: elementData[`${field.key}_name`] as string | null | undefined,
          };
        }

        return baseField;
      }),
    }));
  }, [sections, elementData, validationMessages, localValidationErrors, onAssignType, onClearType]);

  // Combine backend + local validation messages for summary
  const allValidationMessages = useMemo(() => {
    const localMessages = Array.from(localValidationErrors.values());
    const combined = [...validationMessages];

    // Add local messages that don't duplicate backend messages
    for (const localMsg of localMessages) {
      const isDuplicate = validationMessages.some(
        (m) => m.field === localMsg.field && m.code === localMsg.code
      );
      if (!isDuplicate) {
        combined.push(localMsg);
      }
    }

    return combined;
  }, [validationMessages, localValidationErrors]);

  // Toggle section collapse
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

  // Handle field value change with local validation
  const handleFieldChange = useCallback(
    (fieldKey: string, value: unknown) => {
      if (!onFieldChange || !canEdit) return;

      // Find field definition
      const field = sections
        .flatMap((s) => s.fields)
        .find((f) => f.key === fieldKey);

      if (field) {
        // Run local validation
        const result = validateField(elementType, { ...field, value }, value);

        setLocalValidationErrors((prev) => {
          const newMap = new Map(prev);
          if (!result.valid && result.message) {
            newMap.set(fieldKey, {
              code: result.code ?? 'E-VAL-00',
              severity: result.severity ?? 'ERROR',
              message: result.message,
              field: fieldKey,
            });
          } else {
            newMap.delete(fieldKey);
          }
          return newMap;
        });
      }

      onFieldChange(fieldKey, value);
    },
    [onFieldChange, canEdit, sections, elementType]
  );

  // Get mode label for header
  const getModeLabel = () => {
    switch (mode) {
      case 'MODEL_EDIT':
        return 'Edycja';
      case 'RESULT_VIEW':
        return 'Wyniki';
      default:
        return mode;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              SIATKA WŁAŚCIWOŚCI
            </h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Obiekt: <span className="font-medium">{elementName}</span> ({elementType})
            </p>
          </div>
          <span
            className={clsx(
              'text-xs px-2 py-1 rounded',
              mode === 'MODEL_EDIT' && 'bg-blue-100 text-blue-800',
              mode === 'RESULT_VIEW' && 'bg-green-100 text-green-800'
            )}
          >
            {getModeLabel()}
          </span>
        </div>
      </div>

      {/* P30e: Read-only message for RESULT_VIEW mode */}
      {mode === 'RESULT_VIEW' && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-green-800">
            <span className="font-bold">[RO]</span>
            <span>Tryb wyników — edycja niedostępna. Wszystkie pola sa tylko do odczytu.</span>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="divide-y divide-gray-100">
        {populatedSections.map((section) => (
          <PropertySection
            key={section.id}
            section={section}
            collapsed={collapsedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            onFieldChange={handleFieldChange}
            mode={mode}
            canEdit={canEdit}
            elementType={elementType}
          />
        ))}

        {/* Validation Summary Section */}
        <div>
          <button
            onClick={() => toggleSection('validation_summary')}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="text-xs font-medium text-gray-700 flex items-center gap-2">
              {collapsedSections.has('validation_summary') ? '[+]' : '[-]'} {SECTION_LABELS.validation || 'Stan walidacji'}
              {allValidationMessages.length > 0 && (
                <span className={clsx(
                  'px-1.5 py-0.5 rounded text-xs',
                  allValidationMessages.some((m) => m.severity === 'ERROR')
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                )}>
                  {allValidationMessages.length}
                </span>
              )}
            </span>
          </button>

          {!collapsedSections.has('validation_summary') && (
            <div className="px-4 py-3">
              <ValidationSummary
                messages={allValidationMessages}
                title="Błędy i ostrzeżenia"
                maxVisible={10}
              />
            </div>
          )}
        </div>
      </div>

      {/* Quick Error Indicator (footer) */}
      {allValidationMessages.some((m) => m.severity === 'ERROR') && (
        <div className="bg-red-50 border-t border-red-200 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-red-700">
            <ValidationIcon severity="ERROR" />
            <span>Obiekt zawiera błędy walidacji</span>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PropertySection Component
// =============================================================================

interface PropertySectionProps {
  section: PropertySectionType;
  collapsed: boolean;
  onToggle: () => void;
  onFieldChange: (fieldKey: string, value: unknown) => void;
  mode: RuntimeOperatingMode;
  canEdit: boolean;
  elementType: ElementType;
}

function PropertySection({
  section,
  collapsed,
  onToggle,
  onFieldChange,
  mode,
  canEdit,
  elementType,
}: PropertySectionProps) {
  // Count fields with validation errors in this section
  const errorCount = section.fields.filter((f) => f.validation?.severity === 'ERROR').length;
  const warningCount = section.fields.filter((f) => f.validation?.severity === 'WARNING').length;

  return (
    <div>
      {/* Section Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-medium text-gray-700 flex items-center gap-2">
          {collapsed ? '[+]' : '[-]'} {section.label}
          {errorCount > 0 && (
            <ValidationIcon severity="ERROR" />
          )}
          {warningCount > 0 && errorCount === 0 && (
            <ValidationIcon severity="WARNING" />
          )}
        </span>
        <span className="text-xs text-gray-500">
          {section.fields.length} {section.fields.length === 1 ? 'pole' : 'pól'}
        </span>
      </button>

      {/* Section Fields */}
      {!collapsed && (
        <div className="px-4 py-2 space-y-2">
          {section.fields.map((field) => (
            <PropertyFieldRow
              key={field.key}
              field={field}
              onFieldChange={onFieldChange}
              mode={mode}
              canEdit={canEdit}
              elementType={elementType}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PropertyFieldRow Component
// =============================================================================

interface PropertyFieldRowProps {
  field: PropertyField;
  onFieldChange: (fieldKey: string, value: unknown) => void;
  mode: RuntimeOperatingMode;
  canEdit: boolean;
  elementType: ElementType;
}

function PropertyFieldRow({
  field,
  onFieldChange,
  mode,
  canEdit,
  elementType,
}: PropertyFieldRowProps) {
  // Determine if field is editable
  const isReadOnly =
    !field.editable ||
    field.source === 'type' ||
    field.source === 'calculated' ||
    field.source === 'audit' ||
    mode === 'RESULT_VIEW' ||
    !canEdit;

  // Get source indicator
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

  // Format value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '—';
    }
    if (typeof value === 'boolean') {
      return value ? 'Tak' : 'Nie';
    }
    if (typeof value === 'number') {
      return value.toLocaleString('pl-PL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    }
    return String(value);
  };

  // Special rendering for type_ref_with_actions
  if (field.type === 'type_ref_with_actions') {
    const hasTypeRef = field.value !== null && field.value !== undefined && field.value !== '';
    const canModifyType = canEdit && mode === 'MODEL_EDIT';

    return (
      <div
        className={clsx(
          'py-2',
          field.validation?.severity === 'ERROR' && 'bg-red-50 -mx-2 px-2 rounded',
          field.validation?.severity === 'WARNING' && 'bg-yellow-50 -mx-2 px-2 rounded'
        )}
      >
        {/* Label */}
        <div className="mb-1">
          <span className="text-xs text-gray-600">{field.label}</span>
        </div>

        {/* Type Display */}
        <div className="text-xs mb-2">
          {hasTypeRef ? (
            <>
              <div className="font-medium text-gray-900">
                {field.typeRefName ?? String(field.value)}
              </div>
              <div className="text-xs text-gray-500 font-mono mt-0.5">
                ID: {String(field.value)}
              </div>
            </>
          ) : (
            <span className="text-gray-400 italic">Nie przypisano typu z katalogu</span>
          )}
        </div>

        {/* Action Buttons */}
        {canModifyType && (
          <div className="flex gap-2">
            <button
              onClick={field.onAssignType}
              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              {hasTypeRef ? 'Zmień typ...' : 'Przypisz typ...'}
            </button>
            {false && hasTypeRef && field.onClearType && (
              <button
                onClick={field.onClearType}
                className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Wyczyść
              </button>
            )}
          </div>
        )}

        {/* Validation Message */}
        {field.validation && (
          <div className="mt-2">
            <ValidationBadge message={field.validation} compact />
          </div>
        )}
      </div>
    );
  }

  // Standard field rendering
  return (
    <div
      className={clsx(
        'flex items-center py-1',
        field.validation?.severity === 'ERROR' && 'bg-red-50 -mx-2 px-2 rounded',
        field.validation?.severity === 'WARNING' && 'bg-yellow-50 -mx-2 px-2 rounded'
      )}
    >
      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-600">
          {field.label}
          {getSourceIndicator() && (
            <span className="text-gray-400 ml-1">{getSourceIndicator()}</span>
          )}
        </span>
      </div>

      {/* Value */}
      <div className="flex items-center gap-1">
        {isReadOnly ? (
          <>
            {field.type === 'number' && field.unit ? (
              <ValueWithUnit
                value={field.value as number | null}
                unit={field.unit}
                valueClassName={clsx(
                  'text-xs',
                  field.source === 'calculated' ? 'text-blue-700' : 'text-gray-900'
                )}
              />
            ) : (
              <span
                className={clsx(
                  'text-xs font-mono',
                  field.source === 'calculated' ? 'text-blue-700' : 'text-gray-900'
                )}
              >
                {formatValue(field.value)}
              </span>
            )}
          </>
        ) : (
          <FieldInput
            field={field}
            onChange={(value) => onFieldChange(field.key, value)}
            elementType={elementType}
          />
        )}

        {/* Unit (for editable fields without ValueWithUnit) */}
        {!isReadOnly && field.unit && (
          <UnitLabel unit={field.unit} compact />
        )}

        {/* Read-only indicator */}
        {isReadOnly && field.editable && (
          <span className="text-xs text-gray-400 ml-1" title="Tylko do odczytu w tym trybie">
            [RO]
          </span>
        )}
      </div>

      {/* Inline validation error */}
      {field.validation && (
        <div className="ml-2">
          <ValidationIcon severity={field.validation.severity} />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// FieldInput Component
// =============================================================================

interface FieldInputProps {
  field: PropertyField;
  onChange: (value: unknown) => void;
  elementType: ElementType;
}

function FieldInput({ field, onChange, elementType: _elementType }: FieldInputProps) {
  const [localValue, setLocalValue] = useState<string>(
    field.value !== null && field.value !== undefined ? String(field.value) : ''
  );
  const [hasError, setHasError] = useState(false);

  // Handle blur to validate and commit
  const handleBlur = useCallback(() => {
    let parsedValue: unknown = localValue;

    if (field.type === 'number') {
      if (localValue === '') {
        parsedValue = null;
      } else {
        const num = parseFloat(localValue.replace(',', '.'));
        if (isNaN(num)) {
          setHasError(true);
          return;
        }
        parsedValue = num;
      }
    }

    setHasError(false);
    onChange(parsedValue);
  }, [localValue, field.type, onChange]);

  // Handle immediate change for checkboxes and selects
  const handleImmediateChange = useCallback(
    (value: unknown) => {
      onChange(value);
    },
    [onChange]
  );

  switch (field.type) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={Boolean(field.value)}
          onChange={(e) => handleImmediateChange(e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
      );

    case 'enum':
      return (
        <select
          value={String(field.value ?? '')}
          onChange={(e) => handleImmediateChange(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
        >
          {field.enumOptions?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );

    case 'number':
      return (
        <input
          type="text"
          inputMode="decimal"
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
            setHasError(false);
          }}
          onBlur={handleBlur}
          className={clsx(
            'text-xs font-mono w-24 border rounded px-2 py-1 text-right focus:ring-blue-500 focus:border-blue-500',
            hasError ? 'border-red-500 bg-red-50' : 'border-gray-300'
          )}
          placeholder={field.unit ? `(${field.unit})` : undefined}
        />
      );

    case 'string':
    case 'ref':
    default:
      return (
        <input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          className="text-xs w-32 border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
        />
      );
  }
}

export default PropertyGrid;
