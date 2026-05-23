/**
 * Property Grid module exports — P12b Enhancement
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 2.4, § 3: Siatka Właściwości
 * - ui_canonical_parity.md § D: Property Grid rules
 *
 * Exports:
 * - PropertyGrid: Main component
 * - ValidationBadge, ValidationSummary, ValidationIcon: Validation display
 * - UnitLabel, ValueWithUnit: Unit display
 * - Field definitions and validation utilities
 */

// Main component
export { PropertyGrid } from './PropertyGrid';

// Validation display components
export {
  ValidationBadge,
  ValidationSummary,
  ValidationIcon,
} from './ValidationBadge';

// Unit display components
export {
  UnitLabel,
  ValueWithUnit,
} from './UnitLabel';

// Field definitions
export {
  getFieldDefinitions,
  getBusFieldDefinitions,
  getLineBranchFieldDefinitions,
  getTransformerBranchFieldDefinitions,
  getSwitchFieldDefinitions,
  getSourceFieldDefinitions,
  getLoadFieldDefinitions,
  SECTION_LABELS,
  SECTION_ORDER,
} from './field-definitions';

// Validation utilities
export {
  validateField,
  validateElement,
  getFieldValidationRules,
} from './validation';

// Re-export types from validation
export type { ValidationResult, ValidatorFn } from './validation';
