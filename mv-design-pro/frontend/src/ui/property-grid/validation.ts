/**
 * Property Grid Validation Rules (Client-side Syntactic)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § D.4: Inline validation
 * - AGENTS.md: Frontend = NOT-A-SOLVER (no physics calculations)
 *
 * IMPORTANT: This module provides SYNTACTIC validation only.
 * - Range checks (> 0, ≤ max)
 * - Required fields
 * - Format validation
 *
 * NO PHYSICS CALCULATIONS are performed here.
 * Backend provides semantic/physics validation via ValidationMessage.
 */

import type { PropertyField, ValidationMessage } from '../types';

// =============================================================================
// Types
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  message?: string;
  code?: string;
  severity?: 'ERROR' | 'WARNING';
}

export type ValidatorFn = (value: unknown, field: PropertyField) => ValidationResult;

// =============================================================================
// Validation Rules Registry
// =============================================================================

/**
 * Field-specific validation rules.
 * Key format: `{elementType}.{fieldKey}` or `*.{fieldKey}` for global rules.
 */
const VALIDATION_RULES: Record<string, ValidatorFn[]> = {
  // Global rules (apply to any element type)
  '*.name': [requiredString],
  '*.voltage_kv': [requiredNumber, positiveNumber, maxValue(500)],
  '*.rated_current_a': [positiveNumber],
  '*.length_km': [positiveNumber, maxValue(1000)],

  // Bus-specific
  'Bus.voltage_kv': [requiredNumber, positiveNumber, maxValue(500)],
  'Bus.rated_current_a': [positiveNumber],

  // LineBranch-specific
  'LineBranch.length_km': [requiredNumber, positiveNumber, maxValue(500)],
  'LineBranch.from_bus_id': [requiredRef],
  'LineBranch.to_bus_id': [requiredRef],

  // TransformerBranch-specific
  'TransformerBranch.hv_bus_id': [requiredRef],
  'TransformerBranch.lv_bus_id': [requiredRef],
  'TransformerBranch.tap_position': [integerValue, rangeValue(-20, 20)],

  // Switch-specific
  'Switch.from_node_id': [requiredRef],
  'Switch.voltage_kv': [positiveNumber, maxValue(500)],
  'Switch.rated_current_a': [positiveNumber],
  'Switch.breaking_current_ka': [positiveNumber],

  // Source-specific
  'Source.bus_id': [requiredRef],
  'Source.sk_mva': [requiredNumber, positiveNumber],
  'Source.rx_ratio': [positiveNumber, maxValue(1)],
  'Source.voltage_kv': [requiredNumber, positiveNumber, maxValue(500)],

  // Load-specific
  'Load.bus_id': [requiredRef],
  'Load.p_mw': [requiredNumber], // Can be negative (generation)
  'Load.cos_phi': [rangeValue(0, 1)],
};

// =============================================================================
// Core Validators
// =============================================================================

/**
 * Required string validator.
 */
function requiredString(value: unknown): ValidationResult {
  if (value === null || value === undefined || value === '') {
    return {
      valid: false,
      message: 'Pole wymagane',
      code: 'E-REQ-01',
      severity: 'ERROR',
    };
  }
  return { valid: true };
}

/**
 * Required number validator.
 */
function requiredNumber(value: unknown): ValidationResult {
  if (value === null || value === undefined) {
    return {
      valid: false,
      message: 'Wartość wymagana',
      code: 'E-REQ-02',
      severity: 'ERROR',
    };
  }
  if (typeof value !== 'number' || isNaN(value)) {
    return {
      valid: false,
      message: 'Wymagana wartość liczbowa',
      code: 'E-TYPE-01',
      severity: 'ERROR',
    };
  }
  return { valid: true };
}

/**
 * Required reference validator.
 */
function requiredRef(value: unknown): ValidationResult {
  if (value === null || value === undefined || value === '') {
    return {
      valid: false,
      message: 'Wymagane powiązanie z obiektem',
      code: 'E-REF-01',
      severity: 'ERROR',
    };
  }
  return { valid: true };
}

/**
 * Positive number validator (> 0).
 */
function positiveNumber(value: unknown): ValidationResult {
  if (value === null || value === undefined) {
    return { valid: true }; // Let required validator handle this
  }
  if (typeof value === 'number' && value <= 0) {
    return {
      valid: false,
      message: 'Wartość musi być większa od 0',
      code: 'E-RANGE-01',
      severity: 'ERROR',
    };
  }
  return { valid: true };
}


/**
 * Integer value validator.
 */
function integerValue(value: unknown): ValidationResult {
  if (value === null || value === undefined) {
    return { valid: true };
  }
  if (typeof value === 'number' && !Number.isInteger(value)) {
    return {
      valid: false,
      message: 'Wymagana wartość całkowita',
      code: 'E-TYPE-02',
      severity: 'ERROR',
    };
  }
  return { valid: true };
}

/**
 * Maximum value validator factory.
 */
function maxValue(max: number): ValidatorFn {
  return (value: unknown): ValidationResult => {
    if (value === null || value === undefined) {
      return { valid: true };
    }
    if (typeof value === 'number' && value > max) {
      return {
        valid: false,
        message: `Wartość nie może przekraczać ${max}`,
        code: 'W-RANGE-01',
        severity: 'WARNING',
      };
    }
    return { valid: true };
  };
}

/**
 * Range value validator factory.
 */
function rangeValue(min: number, max: number): ValidatorFn {
  return (value: unknown): ValidationResult => {
    if (value === null || value === undefined) {
      return { valid: true };
    }
    if (typeof value === 'number' && (value < min || value > max)) {
      return {
        valid: false,
        message: `Wartość musi być w zakresie ${min} - ${max}`,
        code: 'E-RANGE-03',
        severity: 'ERROR',
      };
    }
    return { valid: true };
  };
}

// =============================================================================
// Validation API
// =============================================================================

/**
 * Validate a single field value.
 *
 * @param elementType - Type of the element (Bus, LineBranch, etc.)
 * @param field - Field definition
 * @param value - Current value to validate
 * @returns ValidationResult with valid flag and optional message
 */
export function validateField(
  elementType: string,
  field: PropertyField,
  value: unknown
): ValidationResult {
  // Get specific rules for this element type + field
  const specificRules = VALIDATION_RULES[`${elementType}.${field.key}`] ?? [];
  // Get global rules for this field
  const globalRules = VALIDATION_RULES[`*.${field.key}`] ?? [];

  // Combine rules (specific first, then global)
  const rules = specificRules.length > 0 ? specificRules : globalRules;

  // Run all validators
  for (const validator of rules) {
    const result = validator(value, field);
    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
}

/**
 * Validate all fields for an element.
 *
 * @param elementType - Type of the element
 * @param fields - Array of field definitions with current values
 * @returns Array of validation messages for invalid fields
 */
export function validateElement(
  elementType: string,
  fields: PropertyField[]
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  for (const field of fields) {
    // Only validate editable instance fields
    if (!field.editable || field.source !== 'instance') {
      continue;
    }

    const result = validateField(elementType, field, field.value);
    if (!result.valid && result.message) {
      messages.push({
        code: result.code ?? 'E-VAL-00',
        severity: result.severity ?? 'ERROR',
        message: result.message,
        field: field.key,
      });
    }
  }

  return messages;
}

/**
 * Get validation rules for a field (for display purposes).
 */
export function getFieldValidationRules(
  elementType: string,
  fieldKey: string
): string[] {
  const rules: string[] = [];
  const specificRules = VALIDATION_RULES[`${elementType}.${fieldKey}`];
  const globalRules = VALIDATION_RULES[`*.${fieldKey}`];

  if (specificRules || globalRules) {
    rules.push('Walidacja syntaktyczna');
  }

  return rules;
}

export default { validateField, validateElement, getFieldValidationRules };
