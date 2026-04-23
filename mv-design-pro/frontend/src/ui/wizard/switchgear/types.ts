/**
 * Switchgear Wizard Types — data model for fields and apparatus editing.
 *
 * RUN #3G §1: Kreator "Rozdzielnica: pola i aparaty" (ekrany A/B/C).
 *
 * BINDING: Polish labels, no codenames, no guessing, catalogRef required.
 */

import type { FieldRoleV1 } from '../../sld/core/fieldDeviceContracts';
import type { PoleTypeV1, AparatTypeV1 } from '../../sld/core/fieldDeviceContracts';

// ---------------------------------------------------------------------------
// Station list (Screen A)
// ---------------------------------------------------------------------------

/** Readiness status for a field/device aspect. */
export type ReadinessStatus = 'OK' | 'NIE' | 'CZESCIOWO';

/** Row in the station list table (Screen A). */
export interface StationListRowV1 {
  readonly stationId: string;
  readonly stationName: string;
  readonly stationType: string;
  readonly fieldReadiness: ReadinessStatus;
  readonly catalogReadiness: ReadinessStatus;
  readonly protectionReadiness: ReadinessStatus;
  readonly fieldCountSn: number;
  readonly fieldCountNn: number;
}

// ---------------------------------------------------------------------------
// Station edit (Screen B)
// ---------------------------------------------------------------------------

/** Summary of a single field in the station edit screen. */
export interface FieldSummaryV1 {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly poleType: PoleTypeV1;
  readonly fieldRole: FieldRoleV1;
  readonly deviceCount: number;
  readonly catalogReady: ReadinessStatus;
  readonly bindingsReady: ReadinessStatus;
  readonly overallReady: ReadinessStatus;
  readonly fixActionCount: number;
}

/** PV/BESS source entry for the generator section of Screen B. */
export interface GeneratorSourceEntryV1 {
  readonly generatorId: string;
  readonly generatorName: string;
  readonly generatorType: 'PV' | 'BESS';
  readonly connectionVariant: 'nn_side' | 'block_transformer' | null;
  readonly fieldId: string | null;
  readonly transformerRef: string | null;
  readonly stationRef: string | null;
  readonly isValid: boolean;
  readonly fixCode: string | null;
  readonly fixMessagePl: string | null;
}

/** Data model for Station Edit screen (Screen B). */
export interface StationEditDataV1 {
  readonly stationId: string;
  readonly stationName: string;
  readonly stationType: string;
  readonly fieldsSn: readonly FieldSummaryV1[];
  readonly fieldsNn: readonly FieldSummaryV1[];
  readonly generators: readonly GeneratorSourceEntryV1[];
}

// ---------------------------------------------------------------------------
// Field edit (Screen C)
// ---------------------------------------------------------------------------

/** Single apparatus entry in the field edit form. */
export interface DeviceEntryV1 {
  readonly deviceId: string;
  readonly aparatType: AparatTypeV1;
  readonly deviceType: string;
  readonly catalogRef: string | null;
  readonly catalogName: string | null;
  readonly hasParameters: boolean;
  readonly validationStatus: ReadinessStatus;
  readonly validationMessage: string | null;
}

/** Logical binding between apparatus (e.g., relay → breaker). */
export interface DeviceBindingV1 {
  readonly bindingId: string;
  readonly sourceDeviceId: string;
  readonly sourceDeviceType: string;
  readonly targetDeviceId: string;
  readonly targetDeviceType: string;
  readonly bindingType: 'RELAY_TO_CB' | 'CT_ON_POWER_PATH' | 'VT_SIDE';
  readonly isValid: boolean;
}

/** FixAction for a specific field/device issue. */
export interface FieldFixActionV1 {
  readonly code: string;
  readonly messagePl: string;
  readonly severity: 'BLOCKER' | 'WARNING' | 'INFO';
  readonly targetFieldId: string | null;
  readonly targetDeviceId: string | null;
  readonly actionType: 'ADD_DEVICE' | 'SELECT_CATALOG' | 'ADD_BINDING' | 'SET_VARIANT';
  readonly stationId: string;
  readonly wizardStep: string | null;
}

/** Data model for Field Edit screen (Screen C). */
export interface FieldEditDataV1 {
  readonly stationId: string;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly poleType: PoleTypeV1;
  readonly fieldRole: FieldRoleV1;
  readonly topologyElementId: string | null;
  readonly topologyElementType: string | null;
  readonly devices: readonly DeviceEntryV1[];
  readonly bindings: readonly DeviceBindingV1[];
  readonly fixActions: readonly FieldFixActionV1[];
}

// ---------------------------------------------------------------------------
// Catalog picker
// ---------------------------------------------------------------------------

/** Catalog entry for apparatus type selection. */
export interface CatalogEntryV1 {
  readonly catalogId: string;
  readonly manufacturer: string;
  readonly modelName: string;
  readonly aparatType: AparatTypeV1;
  readonly keyParameters: Record<string, string>;
  readonly description: string | null;
}

// ---------------------------------------------------------------------------
// Navigation & FixAction routing
// ---------------------------------------------------------------------------

/** Navigation target for FixAction deep-link. */
export interface FixActionNavigationV1 {
  readonly screen: 'STATION_LIST' | 'STATION_EDIT' | 'FIELD_EDIT';
  readonly stationId: string | null;
  readonly fieldId: string | null;
  readonly deviceId: string | null;
  readonly focusElement: string | null;
}

/** Parse a FixAction into navigation target. */
export function parseFixActionNavigation(fix: FieldFixActionV1): FixActionNavigationV1 {
  if (fix.targetFieldId && fix.targetDeviceId) {
    return {
      screen: 'FIELD_EDIT',
      stationId: fix.stationId,
      fieldId: fix.targetFieldId,
      deviceId: fix.targetDeviceId,
      focusElement: `device-${fix.targetDeviceId}`,
    };
  }
  if (fix.targetFieldId) {
    return {
      screen: 'FIELD_EDIT',
      stationId: fix.stationId,
      fieldId: fix.targetFieldId,
      deviceId: null,
      focusElement: `field-${fix.targetFieldId}`,
    };
  }
  return {
    screen: 'STATION_EDIT',
    stationId: fix.stationId,
    fieldId: null,
    deviceId: null,
    focusElement: null,
  };
}
