/**
 * Protection View Module - PR-SLD-09
 *
 * Eksporty dla widoku zabezpieczeniowego SLD.
 */

import {
  OC_CHARACTERISTIC_LABELS_PL as RAW_OC_CHARACTERISTIC_LABELS_PL,
  PROTECTION_FIELD_LABELS_PL as RAW_PROTECTION_FIELD_LABELS_PL,
  PROTECTION_SECTION_LABELS_PL as RAW_PROTECTION_SECTION_LABELS_PL,
  VERIFICATION_STATUS_LABELS_PL as RAW_VERIFICATION_STATUS_LABELS_PL,
  type OvercurrentCharacteristicType,
  type ProtectionVerificationStatus,
} from './types';

export type {
  OvercurrentCharacteristicType,
  ProtectionVerificationStatus,
  OvercurrentTimeSetting,
  OvercurrentInstantSetting,
  OvercurrentProtectionSettings,
  CurrentTransformerInfo,
  ProtectionSummary,
} from './types';

export const OC_CHARACTERISTIC_LABELS_PL = {
  ...RAW_OC_CHARACTERISTIC_LABELS_PL,
  DT: 'Stałoczasowa',
  LTI: 'Długoczasowa odwrotna (LTI)',
} satisfies Record<OvercurrentCharacteristicType, string>;

export const VERIFICATION_STATUS_LABELS_PL = {
  ...RAW_VERIFICATION_STATUS_LABELS_PL,
  SPELNIONE: 'Spełnione',
  NIESPELNIONE: 'Niespełnione',
} satisfies Record<ProtectionVerificationStatus, string>;

export const PROTECTION_FIELD_LABELS_PL = {
  ...RAW_PROTECTION_FIELD_LABELS_PL,
  instantaneous: 'Bezzwłoczna',
  ct_ratio: 'Przekładnik',
};

export const PROTECTION_SECTION_LABELS_PL = {
  ...RAW_PROTECTION_SECTION_LABELS_PL,
  overcurrent_time: 'Zabezpieczenie nadprądowe I> (51)',
  overcurrent_instant: 'Zabezpieczenie nadprądowe I>> (50)',
  transformer: 'Przekładnik',
};

export { VERIFICATION_STATUS_COLORS } from './types';

export {
  useProtectionSummary,
  useAllProtectionSummaries,
  useHasProtectionData,
  useProtectionStatistics,
  selectProtectionSummaryByElementId,
} from './useProtectionSummary';
