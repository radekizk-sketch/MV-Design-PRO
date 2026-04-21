/**
 * P30c: Multi-Edit Helpers for Property Grid
 *
 * CANONICAL ALIGNMENT:
 * - P30c: Multi-edit with common fields and "— (różne)" placeholder
 * - ui_canonical_parity.md § D: Property Grid ≥110% PF UX
 *
 * Helper functions for multi-edit logic:
 * - Finding common fields across multiple elements
 * - Merging values (uniform vs mixed)
 * - Deterministic field ordering
 */

import type { PropertyField, PropertySection, ElementType, OperatingMode, MultiEditFieldValue } from '../types';
import { getFieldDefinitionsForMode } from './field-definitions';

/**
 * Element data for multi-edit.
 */
export interface ElementData {
  id: string;
  type: ElementType;
  name: string;
  data: Record<string, unknown>;
}

/**
 * Find common fields across multiple elements.
 * Only returns fields that exist in ALL elements and have the same definition.
 *
 * P30e: Now accepts operating mode to filter fields contextually.
 *
 * @param elements Array of elements with data
 * @param mode Operating mode (MODEL_EDIT | CASE_CONFIG | RESULT_VIEW)
 * @returns Array of common fields with merged values
 */
export function getCommonFields(elements: ElementData[], mode: OperatingMode = 'MODEL_EDIT'): PropertySection[] {
  if (elements.length === 0) return [];

  // Single element: return all fields for the mode
  if (elements.length === 1) {
    const sections = getFieldDefinitionsForMode(elements[0].type, mode);
    return sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
        value: elements[0].data[field.key] ?? field.value,
      })),
    }));
  }

  // Multi-edit: Find common fields
  const firstType = elements[0].type;
  const allSameType = elements.every((el) => el.type === firstType);

  if (!allSameType) {
    // Mixed types: no common fields
    return [];
  }

  // All same type: get field definitions for the mode and merge values
  const sections = getFieldDefinitionsForMode(firstType, mode);

  return sections.map((section) => ({
    ...section,
    fields: section.fields
      .map((field) => {
        // Merge values across all elements
        const mergedValue = mergeFieldValues(
          field.key,
          elements.map((el) => el.data[field.key])
        );

        return {
          ...field,
          value: mergedValue,
        };
      })
      .filter((field) => {
        // Only include fields that are editable or have uniform values
        // (don't show mixed read-only fields)
        if (field.editable) return true;

        const value = field.value as MultiEditFieldValue;
        return value.kind === 'uniform';
      }),
  })).filter((section) => section.fields.length > 0); // Remove empty sections
}

/**
 * Merge field values across multiple elements.
 * Returns uniform value if all same, otherwise "mixed" marker.
 *
 * @param fieldKey Field key
 * @param values Array of values from different elements
 * @returns MultiEditFieldValue (uniform or mixed)
 */
export function mergeFieldValues(
  _fieldKey: string,
  values: unknown[]
): MultiEditFieldValue {
  if (values.length === 0) {
    return { kind: 'uniform', value: null };
  }

  // Check if all values are the same
  const firstValue = values[0];
  const allSame = values.every((v) => deepEqual(v, firstValue));

  if (allSame) {
    return { kind: 'uniform', value: firstValue };
  }

  return { kind: 'mixed' };
}

/**
 * Deep equality check for primitive values.
 * Handles null, undefined, numbers, strings, booleans.
 *
 * @param a First value
 * @param b Second value
 * @returns true if equal
 */
function deepEqual(a: unknown, b: unknown): boolean {
  // Same reference or both null/undefined
  if (a === b) return true;

  // Null/undefined mismatch
  if (a == null || b == null) return false;

  // Type mismatch
  if (typeof a !== typeof b) return false;

  // Primitive types (number, string, boolean)
  if (typeof a !== 'object') return a === b;

  // Arrays (basic check - not needed for our use case, but for completeness)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  // Objects (basic check)
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

/**
 * Format multi-edit field value for display.
 * Returns actual value if uniform, "— (różne)" if mixed.
 *
 * @param value MultiEditFieldValue
 * @returns Display string
 */
export function formatMultiEditValue(value: MultiEditFieldValue): string {
  if (value.kind === 'mixed') {
    return '— (różne)';
  }

  const actualValue = value.value;

  if (actualValue === null || actualValue === undefined) {
    return '—';
  }

  if (typeof actualValue === 'boolean') {
    return actualValue ? 'Tak' : 'Nie';
  }

  if (typeof actualValue === 'number') {
    return actualValue.toLocaleString('pl-PL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }

  return String(actualValue);
}

/**
 * Check if a field value is editable in multi-edit mode.
 *
 * @param field PropertyField
 * @param value MultiEditFieldValue
 * @returns true if editable
 */
export function isMultiEditFieldEditable(
  field: PropertyField,
  _value: MultiEditFieldValue
): boolean {
  // Must be editable field
  if (!field.editable) return false;

  // Source must be instance (not type, calculated, or audit)
  if (field.source !== 'instance' && field.source !== undefined) return false;

  // Can edit both uniform and mixed values
  return true;
}

/**
 * Get placeholder text for multi-edit field input.
 *
 * @param value MultiEditFieldValue
 * @param unit Optional unit
 * @returns Placeholder string
 */
export function getMultiEditPlaceholder(
  value: MultiEditFieldValue,
  unit?: string
): string {
  if (value.kind === 'mixed') {
    return '— (różne)';
  }

  if (unit) {
    return `(${unit})`;
  }

  return '';
}
