/**
 * Element Inspector — §6 UX 10/10
 *
 * Schema-driven element inspector with ZERO empty fields.
 *
 * ZASADY:
 * - Dynamiczne pola zależne od typu elementu
 * - Walidacja w locie (inline validation)
 * - Ostrzeżenia techniczne (technical warnings)
 * - Brak placeholderów — każde pole ma wartość lub wskazówkę
 * - Schema-driven rendering z field registry
 *
 * INVARIANTS:
 * - No physics — display only
 * - Deterministic field ordering (SECTION_ORDER)
 * - Read-only fields clearly marked
 * - 100% Polish labels
 */

import React, { useMemo, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import type {
  ElementType,
  OperatingMode,
  PropertyField,
  PropertySection,
  ValidationMessage,
} from '../types';
import {
  getFieldDefinitionsForMode,
} from './field-definitions';
import { validateField } from './validation';

// =============================================================================
// Types
// =============================================================================

export interface ElementInspectorProps {
  elementId: string;
  elementType: ElementType;
  elementName: string;
  mode: OperatingMode;
  elementData: Record<string, unknown>;
  validationMessages?: ValidationMessage[];
  onFieldChange?: (fieldKey: string, value: unknown) => void;
  onAssignType?: () => void;
  onClearType?: () => void;
  onNavigateToRelated?: (elementId: string) => void;
}

interface FieldEditState {
  fieldKey: string;
  value: unknown;
  error: string | null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a field value is "empty" (needs user input).
 */
function isFieldEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * Get hint text for empty fields based on field type.
 */
function getEmptyHint(field: PropertyField): string {
  if (field.type === 'number') return 'Wymagana wartość liczbowa';
  if (field.type === 'enum') return 'Wybierz z listy';
  if (field.type === 'ref') return 'Wymagana referencja';
  if (field.type === 'boolean') return 'Tak/Nie';
  if (field.type === 'type_ref_with_actions') return 'Przypisz typ z katalogu';
  return 'Uzupełnij dane';
}

// =============================================================================
// Section Component
// =============================================================================

interface InspectorSectionProps {
  section: PropertySection;
  elementData: Record<string, unknown>;
  mode: OperatingMode;
  validationMessages: ValidationMessage[];
  editState: FieldEditState | null;
  onEdit: (fieldKey: string, value: unknown) => void;
  onCommit: (fieldKey: string, value: unknown) => void;
  onCancel: () => void;
  onAssignType?: () => void;
  onClearType?: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

const InspectorSection: React.FC<InspectorSectionProps> = ({
  section,
  elementData,
  mode,
  validationMessages,
  editState,
  onEdit,
  onCommit,
  onCancel,
  onAssignType,
  onClearType,
  collapsed,
  onToggle,
}) => {
  // Filter out empty non-editable fields (zero-empty policy)
  const visibleFields = useMemo(() => {
    return section.fields.filter((field) => {
      const value = elementData[field.key] ?? field.value;
      // Always show editable fields
      if (field.editable && mode === 'MODEL_EDIT') return true;
      // Always show fields with values
      if (!isFieldEmpty(value)) return true;
      // Show fields with validation errors
      if (validationMessages.some((v) => v.field === field.key)) return true;
      // Hide empty read-only fields
      return false;
    });
  }, [section.fields, elementData, mode, validationMessages]);

  if (visibleFields.length === 0) return null;

  const errorCount = validationMessages.filter(
    (v) =>
      v.severity === 'ERROR' &&
      section.fields.some((f) => f.key === v.field),
  ).length;

  return (
    <div className="border-b border-gray-100" data-testid={`inspector-section-${section.id}`}>
      {/* Section header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{collapsed ? '▸' : '▾'}</span>
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            {section.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">{visibleFields.length}</span>
          {errorCount > 0 && (
            <span className="w-4 h-4 flex items-center justify-center text-xs bg-red-500 text-white rounded-full">
              {errorCount}
            </span>
          )}
        </div>
      </button>

      {/* Fields */}
      {!collapsed && (
        <div className="py-1">
          {visibleFields.map((field) => {
            const value = elementData[field.key] ?? field.value;
            const validation = validationMessages.find((v) => v.field === field.key);
            const isEditing = editState?.fieldKey === field.key;
            const isEmpty = isFieldEmpty(value);
            const isEditable = field.editable && mode === 'MODEL_EDIT';

            return (
              <div
                key={field.key}
                className={clsx(
                  'flex items-center px-3 py-1.5',
                  validation?.severity === 'ERROR' && 'bg-red-50',
                  validation?.severity === 'WARNING' && 'bg-amber-50',
                  isEmpty && isEditable && 'bg-blue-50/30',
                )}
                data-testid={`inspector-field-${field.key}`}
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
                  {field.unit && (
                    <span className="text-xs text-gray-400">[{field.unit}]</span>
                  )}
                  {!field.editable && (
                    <span className="text-xs text-gray-300" title="Tylko odczyt">
                      🔒
                    </span>
                  )}
                </div>

                {/* Value */}
                <div className="w-[55%] flex items-center gap-1">
                  {isEditing ? (
                    <InlineEditor
                      field={field}
                      value={editState.value}
                      error={editState.error}
                      onChange={(v) => onEdit(field.key, v)}
                      onCommit={() => onCommit(field.key, editState.value)}
                      onCancel={onCancel}
                    />
                  ) : field.type === 'type_ref_with_actions' ? (
                    <TypeRefField
                      value={value}
                      typeRefName={
                        elementData[`${field.key}_name`] as string | null | undefined
                      }
                      onAssign={onAssignType}
                      onClear={onClearType}
                      editable={isEditable}
                    />
                  ) : (
                    <div
                      className={clsx(
                        'flex-1 text-xs font-mono cursor-default',
                        isEmpty && 'text-gray-400 italic',
                        !isEmpty && 'text-gray-800',
                      )}
                      onClick={() => isEditable && onEdit(field.key, value)}
                    >
                      {isEmpty
                        ? getEmptyHint(field)
                        : formatFieldValue(value, field)}
                    </div>
                  )}

                  {/* Validation indicator */}
                  {validation && (
                    <span
                      className={clsx(
                        'text-xs flex-shrink-0',
                        validation.severity === 'ERROR' && 'text-red-600',
                        validation.severity === 'WARNING' && 'text-amber-600',
                      )}
                      title={validation.message}
                    >
                      {validation.severity === 'ERROR' ? '✕' : '⚠'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Inline Editor
// =============================================================================

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
        className="h-4 w-4"
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
        className="flex-1 text-xs border border-blue-400 rounded px-1 py-0.5"
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
          error ? 'border-red-400' : 'border-blue-400',
        )}
        autoFocus
        onKeyDown={handleKeyDown}
        onBlur={onCommit}
      />
      {error && <div className="text-xs text-red-500 mt-0.5">{error}</div>}
    </div>
  );
};

// =============================================================================
// Type Ref Field
// =============================================================================

interface TypeRefFieldProps {
  value: unknown;
  typeRefName?: string | null;
  onAssign?: () => void;
  onClear?: () => void;
  editable: boolean;
}

const TypeRefField: React.FC<TypeRefFieldProps> = ({
  value,
  typeRefName,
  onAssign,
  onClear,
  editable,
}) => {
  if (!value) {
    return (
      <div className="flex items-center gap-1 flex-1">
        <span className="text-xs text-gray-400 italic">Typ nieprzypisany</span>
        {editable && onAssign && (
          <button
            onClick={onAssign}
            className="text-xs text-blue-600 hover:underline"
          >
            Przypisz
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-1">
      <span className="text-xs text-gray-800 font-mono">
        {typeRefName ?? String(value)}
      </span>
      {editable && (
        <div className="flex gap-1">
          {onAssign && (
            <button
              onClick={onAssign}
              className="text-xs text-blue-600 hover:underline"
            >
              Zmień
            </button>
          )}
          {onClear && (
            <button
              onClick={onClear}
              className="text-xs text-red-500 hover:underline"
            >
              Wyczyść
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Formatters
// =============================================================================

function formatFieldValue(value: unknown, field: PropertyField): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    const formatted = Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return field.unit ? `${formatted} ${field.unit}` : formatted;
  }
  return String(value);
}

// =============================================================================
// Main Component
// =============================================================================

export const ElementInspector: React.FC<ElementInspectorProps> = ({
  elementId,
  elementType,
  elementName,
  mode,
  elementData,
  validationMessages = [],
  onFieldChange,
  onAssignType,
  onClearType,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [editState, setEditState] = useState<FieldEditState | null>(null);

  // Get schema-driven field definitions
  const sections = useMemo(
    () => getFieldDefinitionsForMode(elementType, mode),
    [elementType, mode],
  );

  // Count validation errors
  const errorCount = validationMessages.filter((v) => v.severity === 'ERROR').length;
  const warningCount = validationMessages.filter((v) => v.severity === 'WARNING').length;

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

  const handleEdit = useCallback(
    (fieldKey: string, value: unknown) => {
      const field = sections
        .flatMap((s) => s.fields)
        .find((f) => f.key === fieldKey);
      const result = field ? validateField(elementType, field, value) : null;
      const error = result && !result.valid ? (result.message ?? null) : null;
      setEditState({ fieldKey, value, error });
    },
    [sections, elementType],
  );

  const handleCommit = useCallback(
    (fieldKey: string, value: unknown) => {
      const field = sections
        .flatMap((s) => s.fields)
        .find((f) => f.key === fieldKey);
      const result = field ? validateField(elementType, field, value) : null;
      const error = result && !result.valid ? (result.message ?? null) : null;
      if (!error) {
        onFieldChange?.(fieldKey, value);
      }
      setEditState(null);
    },
    [sections, onFieldChange],
  );

  const handleCancel = useCallback(() => {
    setEditState(null);
  }, []);

  return (
    <div
      className="flex flex-col h-full bg-white"
      data-testid="element-inspector"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 truncate">
              {elementName}
            </h3>
            <span className="text-xs text-gray-500">{elementType}</span>
          </div>
          <div className="flex items-center gap-1">
            {errorCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded">
                {errorCount} błędów
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                {warningCount} ostrzeżeń
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
        {sections.map((section) => (
          <InspectorSection
            key={section.id}
            section={section}
            elementData={elementData}
            mode={mode}
            validationMessages={validationMessages}
            editState={editState}
            onEdit={handleEdit}
            onCommit={handleCommit}
            onCancel={handleCancel}
            onAssignType={onAssignType}
            onClearType={onClearType}
            collapsed={collapsedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default ElementInspector;
