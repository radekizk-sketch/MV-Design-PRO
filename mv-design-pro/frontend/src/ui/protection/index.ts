/**
 * Protection Library Module (P14a - READ-ONLY)
 *
 * Public exports for Protection Library browser.
 */

export * from './types';
export * from './api';
export * from './sanity-types';

export type {
  ElementProtectionAssignment,
  ProtectionAssignmentAdapter,
  ProtectionDeviceKind,
  ProtectionDeviceStatus,
  ProtectionSettingsSummary,
  SldSymbolProtectionExtension,
} from './element-assignment';
export {
  PROTECTION_ASSIGNMENT_FIXTURES,
  PROTECTION_STATUS_COLORS,
  PROTECTION_STATUS_LABELS,
} from './element-assignment';

export type {
  AnsiDeviceNumber,
  ProtectionComputedUnit,
  ProtectionComputedValue,
  ProtectionFunctionCode,
  ProtectionFunctionSummary,
  ProtectionFunctionItCurve,
  ProtectionItCurvePoint,
  ProtectionSetpointBasis,
  ProtectionSetpoint,
  ProtectionSetpointOperator,
  ProtectionSetpointUnit,
  SetpointValidationError,
} from './settings-model';
export {
  FUNCTION_CODE_TO_ANSI,
  createFrequencySetpoint,
  createInMultiplierSetpoint,
  createPercentSetpoint,
  createRocofSetpoint,
  createUnMultiplierSetpoint,
  computeFromSetpoint,
  validateComputed,
  validateFunctionSummary,
  validateSetpoint,
} from './settings-model';

export { PROTECTION_DEVICE_KIND_LABELS } from './element-assignment';

export { useProtectionAssignment, useProtectionAssignments } from './useProtectionAssignment';
export { useProtectionView } from './useProtectionView';
export type { ProtectionViewHook } from './useProtectionView';
export {
  assignmentsForElement,
  fetchProtectionView,
  EMPTY_PROTECTION_VIEW,
} from './protection-view';
export type {
  ProtectionViewResponse,
  ProtectionViewAssignment,
  ProtectionViewStatus,
} from './protection-view';
export {
  useSanityChecks,
  useSanityChecksByElement,
  useFilteredSanityChecks,
  SANITY_CHECK_FIXTURES,
} from './useSanityChecks';
export { ProtectionLibraryBrowser } from './ProtectionLibraryBrowser';
