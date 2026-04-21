/**
 * P30c: Property Grid Multi-Edit Component
 *
 * CANONICAL ALIGNMENT:
 * - P30c: Multi-edit with Apply/Cancel transactions
 * - ui_canonical_parity.md § D: Property Grid ≥110% PF UX
 * - P30a: UNDO/REDO integration
 *
 * Features:
 * - Multi-select: common fields across N elements
 * - "— (różne)" placeholder for mixed values
 * - Draft state: changes buffered until Apply
 * - Apply → 1 UNDO/REDO transaction (PropertyBatchEditCommand)
 * - Cancel → discard draft, no history entry
 * - Inline validation + units
 * - Mode gating (RESULT_VIEW/CASE_CONFIG = read-only)
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { clsx } from 'clsx';
import type { PropertyField, ValidationMessage, MultiEditFieldValue } from '../types';
import { type RuntimeOperatingMode } from '../operatingMode';
import { useSelectionStore, useCanEdit, useBlockedActionMessage } from '../selection';
import { useHistoryStore } from '../history/HistoryStore';
import { PropertyBatchEditCommand, type ElementChange } from '../history/commands/PropertyBatchEditCommand';
import { ValidationSummary, ValidationIcon } from './ValidationBadge';
import { UnitLabel } from './UnitLabel';
import { validateField } from './validation';
import { SECTION_LABELS } from './field-definitions';
import {
  getCommonFields,
  formatMultiEditValue,
  isMultiEditFieldEditable,
  getMultiEditPlaceholder,
  type ElementData,
} from './multi-edit-helpers';

// =============================================================================
// Types
// =============================================================================

interface PropertyGridMultiEditProps {
  /** Elements being edited (must be same type) */
  elements: ElementData[];

  /** Callback to apply changes to backend */
  onApplyChange?: (elementId: string, fieldKey: string, value: unknown) => void | Promise<void>;
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Property Grid Multi-Edit Component.
 *
 * Edits multiple elements simultaneously with draft state and Apply/Cancel.
 */
export function PropertyGridMultiEdit({
  elements,
  onApplyChange,
}: PropertyGridMultiEditProps) {
  const mode = useSelectionStore((state) => state.mode);
  const canEdit = useCanEdit();
  const blockedMessage = useBlockedActionMessage();
  const push = useHistoryStore((state) => state.push);

  // Draft state (field → new value)
  const [draftChanges, setDraftChanges] = useState<Map<string, unknown>>(new Map());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [localValidationErrors, setLocalValidationErrors] = useState<Map<string, ValidationMessage>>(new Map());

  // Check if draft has changes
  const isDirty = draftChanges.size > 0;

  // P30e: Get common fields across all elements for the current operating mode
  const commonSections = useMemo(() => {
    return getCommonFields(elements, mode);
  }, [elements, mode]);

  // Apply draft changes to field values
  const sectionsWithDraft = useMemo(() => {
    return commonSections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const draftValue = draftChanges.get(field.key);
        if (draftValue !== undefined) {
          // Use draft value (always uniform in draft)
          return {
            ...field,
            value: { kind: 'uniform' as const, value: draftValue },
            validation: localValidationErrors.get(field.key),
          };
        }

        return {
          ...field,
          validation: localValidationErrors.get(field.key),
        };
      }),
    }));
  }, [commonSections, draftChanges, localValidationErrors]);

  // Count errors
  const errorCount = Array.from(localValidationErrors.values()).filter(
    (v) => v.severity === 'ERROR'
  ).length;

  // Has blocking errors?
  const hasBlockingErrors = errorCount > 0;

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

  // Handle field change (updates draft)
  const handleFieldChange = useCallback(
    (fieldKey: string, value: unknown) => {
      if (!canEdit) return;

      // Find field definition
      const field = commonSections
        .flatMap((s) => s.fields)
        .find((f) => f.key === fieldKey);

      if (!field) return;

      // Run local validation
      const elementType = elements[0].type;
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

      // Update draft
      setDraftChanges((prev) => {
        const newMap = new Map(prev);
        newMap.set(fieldKey, value);
        return newMap;
      });
    },
    [canEdit, commonSections, elements]
  );

  // Apply changes (creates UNDO/REDO command)
  const handleApply = useCallback(async () => {
    if (!onApplyChange || !canEdit || hasBlockingErrors || !isDirty) return;

    // Build changes for command
    const changes: ElementChange[] = [];

    draftChanges.forEach((newValue, fieldKey) => {
      elements.forEach((element) => {
        const oldValue = element.data[fieldKey];
        changes.push({
          elementId: element.id,
          elementName: element.name,
          fieldKey,
          oldValue,
          newValue,
        });
      });
    });

    if (changes.length === 0) return;

    // Get field label (from first changed field)
    const firstFieldKey = Array.from(draftChanges.keys())[0];
    const firstField = commonSections
      .flatMap((s) => s.fields)
      .find((f) => f.key === firstFieldKey);

    const fieldLabel = firstField?.label ?? firstFieldKey;

    // Create and execute command
    const command = PropertyBatchEditCommand.create({
      fieldLabel,
      changes,
      applyFn: onApplyChange,
    });

    await push(command);

    // Clear draft
    setDraftChanges(new Map());
    setLocalValidationErrors(new Map());
  }, [
    onApplyChange,
    canEdit,
    hasBlockingErrors,
    isDirty,
    draftChanges,
    elements,
    commonSections,
    push,
  ]);

  // Cancel changes (discard draft)
  const handleCancel = useCallback(() => {
    setDraftChanges(new Map());
    setLocalValidationErrors(new Map());
  }, []);

  // Get mode label
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

  // Reset draft when elements change
  useEffect(() => {
    setDraftChanges(new Map());
    setLocalValidationErrors(new Map());
  }, [elements]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              SIATKA WŁAŚCIWOŚCI — EDYCJA GRUPOWA
            </h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Wybrano: <span className="font-medium">{elements.length}</span> {
                elements.length === 1 ? 'element' :
                (elements.length >= 2 && elements.length <= 4) ? 'elementy' : 'elementów'
              }
              {elements.length > 0 && ` (${elements[0].type})`}
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
            <span>🔒</span>
            <span>Tryb wyników — edycja niedostępna. Wszystkie pola są tylko do odczytu.</span>
          </div>
        </div>
      )}

      {/* Blocked message (CASE_CONFIG) */}
      {blockedMessage && mode !== 'RESULT_VIEW' && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-yellow-800">
            <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            <span>{blockedMessage}</span>
          </div>
        </div>
      )}

      {/* Draft indicator (hidden in RESULT_VIEW) */}
      {isDirty && mode !== 'RESULT_VIEW' && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-blue-800">
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              <span>Niezapisane zmiany: {draftChanges.size} {
                draftChanges.size === 1 ? 'pole' :
                (draftChanges.size >= 2 && draftChanges.size <= 4) ? 'pola' : 'pól'
              }</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleApply}
                disabled={hasBlockingErrors || !canEdit}
                className={clsx(
                  'px-3 py-1 text-xs rounded transition-colors',
                  hasBlockingErrors || !canEdit
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                )}
              >
                Zastosuj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="divide-y divide-gray-100">
        {sectionsWithDraft.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {elements.length === 0
              ? 'Nie wybrano żadnych elementów'
              : 'Brak wspólnych pól edytowalnych'}
          </div>
        ) : (
          sectionsWithDraft.map((section) => (
            <PropertySection
              key={section.id}
              section={section}
              collapsed={collapsedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              onFieldChange={handleFieldChange}
              mode={mode}
              canEdit={canEdit}
            />
          ))
        )}

        {/* Validation Summary Section */}
        {localValidationErrors.size > 0 && (
          <div>
            <button
              onClick={() => toggleSection('validation_summary')}
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-xs font-medium text-gray-700 flex items-center gap-2">
                {collapsedSections.has('validation_summary') ? '[+]' : '[-]'}{' '}
                {SECTION_LABELS.validation || 'Stan walidacji'}
                {localValidationErrors.size > 0 && (
                  <span
                    className={clsx(
                      'px-1.5 py-0.5 rounded text-xs',
                      errorCount > 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    )}
                  >
                    {localValidationErrors.size}
                  </span>
                )}
              </span>
            </button>

            {!collapsedSections.has('validation_summary') && (
              <div className="px-4 py-3">
                <ValidationSummary
                  messages={Array.from(localValidationErrors.values())}
                  title="Błędy walidacji"
                  maxVisible={10}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error indicator (footer) */}
      {errorCount > 0 && (
        <div className="bg-red-50 border-t border-red-200 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-red-700">
            <ValidationIcon severity="ERROR" />
            <span>
              {errorCount} {errorCount === 1 ? 'błąd' : 'błędów'} walidacji
            </span>
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
  section: {
    id: string;
    label: string;
    fields: PropertyField[];
  };
  collapsed: boolean;
  onToggle: () => void;
  onFieldChange: (fieldKey: string, value: unknown) => void;
  mode: RuntimeOperatingMode;
  canEdit: boolean;
}

function PropertySection({
  section,
  collapsed,
  onToggle,
  onFieldChange,
  mode,
  canEdit,
}: PropertySectionProps) {
  // Count errors
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
          {errorCount > 0 && <ValidationIcon severity="ERROR" />}
          {warningCount > 0 && errorCount === 0 && <ValidationIcon severity="WARNING" />}
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
}

function PropertyFieldRow({ field, onFieldChange, mode, canEdit }: PropertyFieldRowProps) {
  const multiEditValue = field.value as MultiEditFieldValue;

  // Determine if field is editable
  const isReadOnly =
    !isMultiEditFieldEditable(field, multiEditValue) ||
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
          <span className="text-xs font-mono text-gray-900">
            {formatMultiEditValue(multiEditValue)}
          </span>
        ) : (
          <FieldInput
            field={field}
            multiEditValue={multiEditValue}
            onChange={(value) => onFieldChange(field.key, value)}
          />
        )}

        {/* Unit (for editable fields) */}
        {!isReadOnly && field.unit && <UnitLabel unit={field.unit} compact />}

        {/* Read-only indicator */}
        {isReadOnly && field.editable && (
          <span className="text-xs text-gray-400 ml-1" title="Tylko do odczytu w tym trybie">
            🔒
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
// FieldInput Component (Multi-Edit)
// =============================================================================

interface FieldInputProps {
  field: PropertyField;
  multiEditValue: MultiEditFieldValue;
  onChange: (value: unknown) => void;
}

function FieldInput({ field, multiEditValue, onChange }: FieldInputProps) {
  // Get actual value (null if mixed)
  const actualValue =
    multiEditValue.kind === 'uniform' ? multiEditValue.value : null;

  const [localValue, setLocalValue] = useState<string>(
    actualValue !== null && actualValue !== undefined ? String(actualValue) : ''
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
          checked={Boolean(actualValue)}
          onChange={(e) => handleImmediateChange(e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
      );

    case 'enum':
      return (
        <select
          value={String(actualValue ?? '')}
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
          placeholder={getMultiEditPlaceholder(multiEditValue, field.unit)}
          className={clsx(
            'text-xs font-mono w-24 border rounded px-2 py-1 text-right focus:ring-blue-500 focus:border-blue-500',
            hasError ? 'border-red-500 bg-red-50' : 'border-gray-300',
            multiEditValue.kind === 'mixed' && 'placeholder-gray-500 italic'
          )}
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
          placeholder={getMultiEditPlaceholder(multiEditValue)}
          className={clsx(
            'text-xs w-32 border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500',
            multiEditValue.kind === 'mixed' && 'placeholder-gray-500 italic'
          )}
        />
      );
  }
}

export default PropertyGridMultiEdit;
