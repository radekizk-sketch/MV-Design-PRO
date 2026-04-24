/**
 * PowerDistributionTypes - typy danych architektury rozdzialu mocy.
 *
 * CANONICAL CONTRACT (BINDING):
 * - Immutable (readonly).
 * - Deterministic (sorted by id).
 * - 100% POLISH labels in UI.
 * - Integrates with fieldDeviceContracts.ts and switchgearConfig.ts.
 */

import type {
  FieldRoleV1,
  DeviceTypeV1,
  EmbeddingRoleV1,
  DeviceElectricalRoleV1,
  DevicePowerPathPositionV1,
} from '../sld/core/fieldDeviceContracts';

// =============================================================================
// POLE TYPE LABELS (POLISH - CANONICAL)
// =============================================================================

export const FIELD_ROLE_LABELS_PL: Record<FieldRoleV1, string> = {
  GPZ_LINE_BAY: 'Pole liniowe GPZ',
  LINE_IN: 'Pole liniowe wejsciowe',
  LINE_OUT: 'Pole liniowe wyjsciowe',
  LINE_BRANCH: 'Pole odgalezieniowe',
  TRANSFORMER_SN_NN: 'Pole transformatorowe SN/nN',
  MEASUREMENT_SN: 'Pole pomiarowe SN',
  PV_SN: 'Pole przylaczeniowe PV (SN)',
  BESS_SN: 'Pole przylaczeniowe BESS (SN)',
  FW_SN: 'Pole przylaczeniowe FW (SN)',
  COUPLER_SN: 'Pole sprzegla sekcyjnego SN',
  BUS_TIE: 'Lacznik szyn',
  MAIN_NN: 'Pole glowne nN',
  FEEDER_NN: 'Pole odplywowe nN',
  PV_NN: 'Pole zrodla PV (nN)',
  BESS_NN: 'Pole zrodla BESS (nN)',
};

export const DEVICE_TYPE_LABELS_PL: Record<DeviceTypeV1, string> = {
  CB: 'Wylacznik',
  DS: 'Rozlacznik',
  ES: 'Uziemnik',
  CT: 'Przekladnik pradowy',
  VT: 'Przekladnik napieciowy',
  RELAY: 'Zabezpieczenie',
  LOAD_SWITCH: 'Wylacznik obciazeniowy',
  FUSE: 'Bezpiecznik',
  CABLE_HEAD: 'Glowica kablowa',
  TRANSFORMER_DEVICE: 'Transformator',
  GENERATOR_PV: 'Generator PV',
  GENERATOR_BESS: 'Magazyn energii BESS',
  GENERATOR_FW: 'Generator FW',
  PCS: 'Falownik PCS',
  BATTERY: 'Bateria',
  ACB: 'Wylacznik powietrzny ACB',
};

export const EMBEDDING_ROLE_LABELS_PL: Record<EmbeddingRoleV1, string> = {
  TRUNK_LEAF: 'Stacja koncowa',
  TRUNK_INLINE: 'Stacja przelotowa',
  TRUNK_BRANCH: 'Stacja odgalezieniowa',
  LOCAL_SECTIONAL: 'Stacja sekcyjna',
};

export const ELECTRICAL_ROLE_LABELS_PL: Record<DeviceElectricalRoleV1, string> = {
  POWER_PATH: 'Tor mocy',
  MEASUREMENT: 'Pomiar',
  PROTECTION: 'Ochrona',
  TERMINATION: 'Zakonczenie',
};

export const POWER_PATH_POSITION_LABELS_PL: Record<DevicePowerPathPositionV1, string> = {
  UPSTREAM: 'Gorna (szyna)',
  MIDSTREAM: 'Srodkowa',
  DOWNSTREAM: 'Dolna (kabel)',
  OFF_PATH: 'Poza torem',
};

// =============================================================================
// BAY TEMPLATE
// =============================================================================

export interface BayTemplateDevice {
  readonly deviceType: DeviceTypeV1;
  readonly electricalRole: DeviceElectricalRoleV1;
  readonly powerPathPosition: DevicePowerPathPositionV1;
  readonly required: boolean;
  readonly labelPl: string;
}

export interface BayTemplate {
  readonly fieldRole: FieldRoleV1;
  readonly labelPl: string;
  readonly descriptionPl: string;
  readonly voltageLevelPl: string;
  readonly devices: readonly BayTemplateDevice[];
}

// =============================================================================
// STATION CONFIGURATION
// =============================================================================

export interface StationConfig {
  readonly stationId: string;
  readonly stationName: string;
  readonly embeddingRole: EmbeddingRoleV1;
  readonly fields: readonly FieldConfig[];
  readonly busSectionCount: number;
}

export interface FieldConfig {
  readonly fieldId: string;
  readonly fieldRole: FieldRoleV1;
  readonly devices: readonly DeviceConfig[];
  readonly busSectionId: string;
}

export interface DeviceConfig {
  readonly deviceId: string;
  readonly deviceType: DeviceTypeV1;
  readonly electricalRole: DeviceElectricalRoleV1;
  readonly powerPathPosition: DevicePowerPathPositionV1;
  readonly label?: string;
  readonly switchState?: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly stateTone?: 'open' | 'closed' | 'unknown' | 'fault' | 'normal';
}

// =============================================================================
// VALIDATION
// =============================================================================

export interface FieldValidationResult {
  readonly fieldId: string;
  readonly isValid: boolean;
  readonly missingDevices: readonly DeviceTypeV1[];
  readonly messagePl: string;
}
