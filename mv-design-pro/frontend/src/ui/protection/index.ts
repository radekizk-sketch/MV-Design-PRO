/**
 * Protection Library Module (P14a - READ-ONLY)
 *
 * Public exports for Protection Library browser.
 */

import {
  PROTECTION_DEVICE_KIND_LABELS as RAW_PROTECTION_DEVICE_KIND_LABELS,
  type ProtectionDeviceKind,
} from './element-assignment';
import {
  FUNCTION_CODE_LABELS_PL as RAW_FUNCTION_CODE_LABELS_PL,
  SETPOINT_BASIS_LABELS_PL as RAW_SETPOINT_BASIS_LABELS_PL,
  SETPOINT_OPERATOR_LABELS_PL as RAW_SETPOINT_OPERATOR_LABELS_PL,
  type ProtectionFunctionCode,
  type ProtectionSetpointBasis,
  type ProtectionSetpointOperator,
} from './settings-model';

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

export const PROTECTION_DEVICE_KIND_LABELS = {
  ...RAW_PROTECTION_DEVICE_KIND_LABELS,
  RELAY_OVERCURRENT: 'Przekaźnik nadprądowy',
  RELAY_DISTANCE: 'Przekaźnik odległościowy',
  RELAY_DIFFERENTIAL: 'Przekaźnik różnicowy',
  RELAY_EARTH_FAULT: 'Przekaźnik ziemnozwarciowy',
} satisfies Record<ProtectionDeviceKind, string>;

export const FUNCTION_CODE_LABELS_PL = {
  ...RAW_FUNCTION_CODE_LABELS_PL,
  UNDERVOLTAGE: 'Podnapięciowa (U<)',
  OVERVOLTAGE: 'Nadnapięciowa (U>)',
  OVERCURRENT_INST: 'Nadprądowa zwarciowa (I>>)',
  OVERCURRENT_TIME: 'Nadprądowa czasowa (I>)',
  UNDERFREQUENCY: 'Podczęstotliwościowa (f<)',
  OVERFREQUENCY: 'Nadczęstotliwościowa (f>)',
  ROCOF: 'Pochodna częstotliwości (df/dt)',
  RECLOSING: 'SPZ (Samoczynne Ponowne Załączenie)',
  DISTANCE: 'Odległościowa',
  DIFFERENTIAL: 'Różnicowa',
  DIRECTIONAL_OC: 'Kierunkowa nadprądowa',
  THERMAL: 'Przeciążeniowa termiczna',
} satisfies Record<ProtectionFunctionCode, string>;

export const SETPOINT_BASIS_LABELS_PL = {
  ...RAW_SETPOINT_BASIS_LABELS_PL,
  UN: 'Napięcie znamionowe (Un)',
  IN: 'Prąd znamionowy (In)',
  HZ: 'Częstotliwość bazowa (fn)',
  ABS: 'Wartość bezwzględna',
} satisfies Record<ProtectionSetpointBasis, string>;

export const SETPOINT_OPERATOR_LABELS_PL = {
  ...RAW_SETPOINT_OPERATOR_LABELS_PL,
  LT: 'mniejszy niż (<)',
  GT: 'większy niż (>)',
  GE: 'większy lub równy (>=)',
  LE: 'mniejszy lub równy (<=)',
  EQ: 'równy (=)',
} satisfies Record<ProtectionSetpointOperator, string>;

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
