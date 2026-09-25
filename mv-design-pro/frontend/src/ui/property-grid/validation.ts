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
  // Karta K7c-FE: `Bus.rated_current_a` USUNIĘTE — pole nie istnieje w modelu
  // ENM `Bus` (`types/enm.ts`/`backend/src/enm/models.py::Bus`), reguła nigdy
  // się nie uruchamiała dla realnych danych (patrz `field-definitions.ts`,
  // ta sama karta usunęła fantomowe pole z sekcji `electrical_params` Bus).

  // LineBranch-specific
  'LineBranch.length_km': [requiredNumber, positiveNumber, maxValue(500)],
  // Odbiór K7c-FE: klucze zgodne z modelem ENM (`from_bus_ref`/`to_bus_ref`,
  // `hv_bus_ref`/`lv_bus_ref`, `Load.bus_ref`) — ta sama klasa co `Source.bus_ref` niżej;
  // z kluczami `*_bus_id` reguły `requiredRef` nigdy się nie uruchamiały.
  'LineBranch.from_bus_ref': [requiredRef],
  'LineBranch.to_bus_ref': [requiredRef],

  // TransformerBranch-specific
  'TransformerBranch.hv_bus_ref': [requiredRef],
  'TransformerBranch.lv_bus_ref': [requiredRef],
  'TransformerBranch.tap_position': [integerValue, rangeValue(-20, 20)],

  // Switch-specific
  'Switch.from_node_id': [requiredRef],
  'Switch.voltage_kv': [positiveNumber, maxValue(500)],
  'Switch.rated_current_a': [positiveNumber],
  'Switch.breaking_current_ka': [positiveNumber],

  // Source-specific
  // Karta K7c-FE: klucz zgodny z polem modelu ENM `Source.bus_ref` (był
  // 'Source.bus_id' — ta sama klasa fantomu co `sk_mva`/`voltage_kv` niżej;
  // patrz `field-definitions.ts::getSourceFieldDefinitions` sekcja `topology`).
  'Source.bus_ref': [requiredRef],
  // Karta K7-FE: klucz zgodny z `field-definitions.ts::getSourceFieldDefinitions`
  // (był 'Source.sk_mva', niedopasowany do klucza pola 'sk3_mva' — reguła nigdy
  // się nie uruchamiała; ten sam defekt naprawiony w komplecie, KLASA NIE INSTANCJA).
  'Source.sk3_mva': [requiredNumber, positiveNumber],
  'Source.rx_ratio': [positiveNumber, maxValue(1)],
  // Karta K7c-FE: klucz zgodny z polem modelu ENM `Source.sn_voltage_kv` (był
  // 'Source.voltage_kv' — `Source` nie ma pola `voltage_kv`, ta sama klasa
  // fantomu co `bus_ref` powyżej).
  'Source.sn_voltage_kv': [requiredNumber, positiveNumber, maxValue(500)],
  // CV-4.3 K7: dane scenariusza MIN — opcjonalne (bez `requiredNumber`), dodatnie
  // gdy podane. Spójność min <= max jest semantyczna (backend, ENMValidator
  // `sources.sk_min_exceeds_max`) — poza zakresem walidacji SYNTAKTYCZNEJ tego pliku.
  'Source.sk3_min_mva': [positiveNumber],
  'Source.ik3_min_ka': [positiveNumber],
  'Source.rx_ratio_min': [positiveNumber],
  // CV-4.3 K7c: napięcie zadane szyny bilansującej — opcjonalne, pasmo 0,8-1,2
  // p.u. (ten sam przedział co backend, `zrodlo_zwarcie.py::PASMO_U_SET_PU`,
  // i kreator, `zrodloModel.ts::PASMO_U_SET_PU`).
  'Source.u_set_pu': [rangeValue(0.8, 1.2)],

  // Load-specific
  'Load.bus_ref': [requiredRef],
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
