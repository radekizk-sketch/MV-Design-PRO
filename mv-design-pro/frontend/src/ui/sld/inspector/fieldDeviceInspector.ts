/**
 * Field & Device Inspector — RUN #3G §4
 *
 * Pure functions to build inspector property sections from field/device data.
 *
 * CANONICAL ALIGNMENT:
 * - fieldDeviceContracts.ts: FieldV1, DeviceV1, StationBlockDetailV1
 * - switchgearRenderer.ts: SwitchgearRenderResultV1
 * - types.ts: InspectorPropertySection, InspectorPropertyField
 *
 * DETERMINISTIC: same input → same output.
 * BINDING: Polish labels only, no codenames.
 * READ-ONLY: no mutations, no side effects.
 */

import type {
  StationBlockDetailV1,
  FieldV1,
  DeviceV1,
  CatalogRefDetailV1,
} from '../core/fieldDeviceContracts';
import {
  DeviceTypeV1,
  DevicePowerPathPositionV1,
  DeviceElectricalRoleV1,
  FIELD_ROLE_TO_POLE,
  POLE_TYPE_LABELS_PL,
  DEVICE_TYPE_TO_APARAT,
  APARAT_TYPE_LABELS_PL,
  DEVICE_TO_SYMBOL,
} from '../core/fieldDeviceContracts';


import type {
  InspectorPropertySection,
  InspectorPropertyField,
} from './types';

import type {
  SwitchgearConfigValidationResultV1,
} from '../core/switchgearConfig';
import { ConfigIssueSeverity } from '../core/switchgearConfig';

import type {
  GeometryOverrideItemV1,
} from '../core/geometryOverrides';

// ---------------------------------------------------------------------------
// Polish labels for positions/roles
// ---------------------------------------------------------------------------

const POWER_PATH_POSITION_LABELS_PL: Record<string, string> = {
  [DevicePowerPathPositionV1.UPSTREAM]: 'Blisko szyny (UPSTREAM)',
  [DevicePowerPathPositionV1.MIDSTREAM]: 'Srodek toru (MIDSTREAM)',
  [DevicePowerPathPositionV1.DOWNSTREAM]: 'Blisko kabla (DOWNSTREAM)',
  [DevicePowerPathPositionV1.OFF_PATH]: 'Poza torem mocy (OFF_PATH)',
};

const ELECTRICAL_ROLE_LABELS_PL: Record<string, string> = {
  [DeviceElectricalRoleV1.POWER_PATH]: 'Tor mocy',
  [DeviceElectricalRoleV1.MEASUREMENT]: 'Pomiarowe',
  [DeviceElectricalRoleV1.PROTECTION]: 'Ochronne',
  [DeviceElectricalRoleV1.TERMINATION]: 'Koncowe',
};

// ---------------------------------------------------------------------------
// Field inspector section builder
// ---------------------------------------------------------------------------

/**
 * Build inspector sections for a field (Pole).
 *
 * Sections:
 * 1. Informacje podstawowe (basic info: role, pole type, bus section)
 * 2. Aparaty w polu (devices in field: list with status)
 * 3. Referencja katalogowa (if present)
 * 4. Zaciski pola
 */
export function buildFieldInspectorSections(
  field: FieldV1,
  devices: readonly DeviceV1[],
  block: StationBlockDetailV1,
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];

  const poleType = FIELD_ROLE_TO_POLE[field.fieldRole];
  const poleLabel = POLE_TYPE_LABELS_PL[poleType];

  // 1. Basic info
  sections.push({
    id: 'field_basic',
    label: 'Informacje o polu',
    fields: [
      { key: 'field_id', label: 'Identyfikator', value: field.id },
      { key: 'station_id', label: 'Stacja', value: field.stationId },
      { key: 'field_role', label: 'Rola pola', value: field.fieldRole },
      { key: 'pole_type', label: 'Typ pola (PL)', value: poleLabel },
      { key: 'bus_section', label: 'Sekcja szyny', value: field.busSectionId },
    ],
  });

  // 2. Devices in field
  const fieldDevices = devices.filter(d => d.fieldId === field.id);
  const deviceFields: InspectorPropertyField[] = fieldDevices
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(d => {
      const aparatType = DEVICE_TYPE_TO_APARAT[d.deviceType];
      const aparatLabel = APARAT_TYPE_LABELS_PL[aparatType];
      const hasCatalog = d.catalogRef !== null;
      return {
        key: `device_${d.id}`,
        label: aparatLabel,
        value: d.id,
        source: hasCatalog ? 'instance' as const : undefined,
        highlight: hasCatalog ? undefined : ('warning' as const),
      };
    });

  sections.push({
    id: 'field_devices',
    label: `Aparaty w polu (${fieldDevices.length})`,
    fields: deviceFields.length > 0
      ? deviceFields
      : [{ key: 'no_devices', label: 'Brak aparatow', value: '—' }],
  });

  // 3. Catalog ref (if present)
  if (field.catalogRef) {
    sections.push(buildCatalogRefSection('field_catalog', 'Katalog pola', field.catalogRef));
  }

  // 4. Zaciski pola
  const terminalFields: InspectorPropertyField[] = [];
  if (field.terminals.incomingNodeId) {
    terminalFields.push({ key: 'incoming', label: 'Zacisk wejsciowy', value: field.terminals.incomingNodeId });
  }
  if (field.terminals.outgoingNodeId) {
    terminalFields.push({ key: 'outgoing', label: 'Zacisk wyjsciowy', value: field.terminals.outgoingNodeId });
  }
  if (field.terminals.branchNodeId) {
    terminalFields.push({ key: 'branch', label: 'Zacisk odgalezieniowy', value: field.terminals.branchNodeId });
  }
  if (field.terminals.generatorNodeId) {
    terminalFields.push({ key: 'generator', label: 'Zacisk generatora', value: field.terminals.generatorNodeId });
  }

  if (terminalFields.length > 0) {
    sections.push({
      id: 'field_terminals',
      label: 'Zaciski pola',
      fields: terminalFields,
      collapsed: true,
    });
  }

  // 5. FixActions for this field
  const fieldFixes = block.fixActions.filter(fa => fa.elementId === field.id);
  if (fieldFixes.length > 0) {
    sections.push({
      id: 'field_fixactions',
      label: `Problemy do rozwiazania (${fieldFixes.length})`,
      fields: fieldFixes.map((fa, idx) => ({
        key: `fix_${idx}`,
        label: fa.code,
        value: fa.message,
        highlight: 'error' as const,
      })),
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Device inspector section builder
// ---------------------------------------------------------------------------

/**
 * Build inspector sections for a device (Aparat).
 *
 * Sections:
 * 1. Informacje o aparacie (type, role, position, symbol)
 * 2. Parametry (device parameters)
 * 3. Powiazania logiczne (bindings: boundCbId, ctInputIds)
 * 4. Referencja katalogowa (if present)
 */
export function buildDeviceInspectorSections(
  device: DeviceV1,
  block: StationBlockDetailV1,
): InspectorPropertySection[] {
  const sections: InspectorPropertySection[] = [];

  const aparatType = DEVICE_TYPE_TO_APARAT[device.deviceType];
  const aparatLabel = APARAT_TYPE_LABELS_PL[aparatType];
  const symbolType = DEVICE_TO_SYMBOL[device.deviceType];

  // 1. Basic device info
  sections.push({
    id: 'device_basic',
    label: 'Informacje o aparacie',
    fields: [
      { key: 'device_id', label: 'Identyfikator', value: device.id },
      { key: 'field_id', label: 'Pole', value: device.fieldId },
      { key: 'device_type', label: 'Typ (EN)', value: device.deviceType },
      { key: 'aparat_type', label: 'Typ aparatu (PL)', value: aparatLabel },
      { key: 'symbol_type', label: 'Symbol SLD', value: symbolType },
      { key: 'electrical_role', label: 'Rola elektryczna', value: ELECTRICAL_ROLE_LABELS_PL[device.electricalRole] ?? device.electricalRole },
      { key: 'power_path_pos', label: 'Pozycja na torze', value: POWER_PATH_POSITION_LABELS_PL[device.powerPathPosition] ?? device.powerPathPosition },
    ],
  });

  // 2. Parameters
  const paramFields: InspectorPropertyField[] = [];
  const p = device.parameters;

  if (p.breakingCapacityKa !== null) {
    paramFields.push({ key: 'breaking_ka', label: 'Zdolnosc wylaczania', value: p.breakingCapacityKa, unit: 'kA', source: 'instance' });
  }
  if (p.ratedCurrentA !== null) {
    paramFields.push({ key: 'rated_current', label: 'Prad znamionowy', value: p.ratedCurrentA, unit: 'A', source: 'instance' });
  }
  if (p.ctRatio !== null) {
    paramFields.push({ key: 'ct_ratio', label: 'Przekladnia przekladnika pradowego', value: p.ctRatio, source: 'instance' });
  }
  if (p.relaySettings !== null) {
    paramFields.push({ key: 'relay_settings', label: 'Nastawy zabezpieczenia', value: p.relaySettings, source: 'instance' });
  }
  if (p.ratedPowerMva !== null) {
    paramFields.push({ key: 'rated_power', label: 'Moc znamionowa', value: p.ratedPowerMva, unit: 'MVA', source: 'instance' });
  }
  if (p.ukPercent !== null) {
    paramFields.push({ key: 'uk_percent', label: 'Napiecie zwarcia', value: p.ukPercent, unit: '%', source: 'instance' });
  }
  if (p.vectorGroup !== null) {
    paramFields.push({ key: 'vector_group', label: 'Grupa polaczen', value: p.vectorGroup, source: 'instance' });
  }

  if (paramFields.length > 0) {
    sections.push({
      id: 'device_parameters',
      label: 'Parametry',
      fields: paramFields,
    });
  } else {
    sections.push({
      id: 'device_parameters',
      label: 'Parametry',
      fields: [{ key: 'no_params', label: 'Brak parametrow', value: '—', highlight: 'warning' }],
    });
  }

  // 3. Logical bindings
  const bindingFields: InspectorPropertyField[] = [];

  if (device.logicalBindings.boundCbId !== null) {
    bindingFields.push({ key: 'bound_cb', label: 'Powiazany wylacznik', value: device.logicalBindings.boundCbId });
  } else if (device.deviceType === DeviceTypeV1.RELAY) {
    bindingFields.push({ key: 'bound_cb', label: 'Powiazany wylacznik', value: 'BRAK — wymagane', highlight: 'error' });
  }

  if (device.logicalBindings.ctInputIds.length > 0) {
    bindingFields.push({ key: 'ct_inputs', label: 'Wejscia przekladnika pradowego', value: device.logicalBindings.ctInputIds.join(', ') });
  }

  if (bindingFields.length > 0) {
    sections.push({
      id: 'device_bindings',
      label: 'Powiazania logiczne',
      fields: bindingFields,
    });
  }

  // 4. Catalog ref
  if (device.catalogRef) {
    sections.push(buildCatalogRefSection('device_catalog', 'Katalog aparatu', device.catalogRef));
  } else {
    sections.push({
      id: 'device_catalog',
      label: 'Katalog aparatu',
      fields: [{ key: 'no_catalog', label: 'Referencja katalogowa', value: 'BRAK — wymagane', highlight: 'error' }],
    });
  }

  // 5. FixActions for this device
  const deviceFixes = block.fixActions.filter(fa => fa.elementId === device.id);
  if (deviceFixes.length > 0) {
    sections.push({
      id: 'device_fixactions',
      label: `Problemy do rozwiazania (${deviceFixes.length})`,
      fields: deviceFixes.map((fa, idx) => ({
        key: `fix_${idx}`,
        label: fa.code,
        value: fa.message,
        highlight: 'error' as const,
      })),
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Catalog ref section builder (shared)
// ---------------------------------------------------------------------------

/**
 * Build catalog reference section.
 */
export function buildCatalogRefSection(
  sectionId: string,
  label: string,
  catalogRef: CatalogRefDetailV1,
): InspectorPropertySection {
  const fields: InspectorPropertyField[] = [
    { key: 'catalog_id', label: 'ID katalogowe', value: catalogRef.catalogId },
    { key: 'catalog_name', label: 'Nazwa', value: catalogRef.name },
    { key: 'catalog_category', label: 'Kategoria', value: catalogRef.category },
  ];

  if (catalogRef.manufacturer) {
    fields.push({ key: 'manufacturer', label: 'Producent', value: catalogRef.manufacturer });
  }
  if (catalogRef.catalogVersion) {
    fields.push({ key: 'catalog_version', label: 'Wersja', value: catalogRef.catalogVersion });
  }

  if (catalogRef.ratings) {
    const r = catalogRef.ratings;
    if (r.breakingCapacityKa !== null) {
      fields.push({ key: 'cat_breaking_ka', label: 'Zdolnosc wylaczania', value: r.breakingCapacityKa, unit: 'kA' });
    }
    if (r.ratedCurrentA !== null) {
      fields.push({ key: 'cat_rated_current', label: 'Prad znamionowy', value: r.ratedCurrentA, unit: 'A' });
    }
    if (r.ratedPowerMva !== null) {
      fields.push({ key: 'cat_rated_power', label: 'Moc znamionowa', value: r.ratedPowerMva, unit: 'MVA' });
    }
    if (r.ratedVoltageKv !== null) {
      fields.push({ key: 'cat_rated_voltage', label: 'Napiecie znamionowe', value: r.ratedVoltageKv, unit: 'kV' });
    }
    if (r.ctRatio !== null) {
      fields.push({ key: 'cat_ct_ratio', label: 'Przekladnia przekladnika pradowego', value: r.ctRatio });
    }
  }

  return { id: sectionId, label, fields };
}

// ---------------------------------------------------------------------------
// Element lookup: elementId → field or device
// ---------------------------------------------------------------------------

/**
 * Resolve elementId to field or device from station block.
 *
 * Returns the matching element type and data, or null.
 * DETERMINISTIC: same elementId + block → same result.
 */
export type FieldDeviceResolution =
  | { type: 'field'; field: FieldV1; devices: readonly DeviceV1[] }
  | { type: 'device'; device: DeviceV1; field: FieldV1 | null }
  | null;

export function resolveFieldOrDevice(
  elementId: string,
  block: StationBlockDetailV1,
): FieldDeviceResolution {
  // Try field first
  const field = block.fields.find(f => f.id === elementId);
  if (field) {
    const devices = block.devices.filter(d => d.fieldId === field.id);
    return { type: 'field', field, devices };
  }

  // Try device
  const device = block.devices.find(d => d.id === elementId);
  if (device) {
    const parentField = block.fields.find(f => f.id === device.fieldId) ?? null;
    return { type: 'device', device, field: parentField };
  }

  return null;
}

/**
 * Build inspector sections for an elementId (auto-resolves field vs device).
 *
 * DETERMINISTIC: same elementId + block → same sections.
 */
export function buildInspectorSectionsForElement(
  elementId: string,
  block: StationBlockDetailV1,
): InspectorPropertySection[] {
  const resolution = resolveFieldOrDevice(elementId, block);
  if (!resolution) return [];

  if (resolution.type === 'field') {
    return buildFieldInspectorSections(resolution.field, resolution.devices, block);
  }

  return buildDeviceInspectorSections(resolution.device, block);
}

// ---------------------------------------------------------------------------
// Result data integration (elementId → results)
// ---------------------------------------------------------------------------

/**
 * Inspector result data for a field/device element.
 * Read from solver results by elementId.
 */
export interface FieldDeviceResultDataV1 {
  readonly elementId: string;
  readonly elementType: 'field' | 'device';
  /** Short-circuit current [kA] (if calculated for this element) */
  readonly ikss_ka: number | null;
  /** Peak short-circuit current [kA] */
  readonly ip_ka: number | null;
  /** Loading [%] */
  readonly loading_pct: number | null;
  /** Current [A] */
  readonly current_a: number | null;
  /** Rated current [A] (from catalog) */
  readonly rated_current_a: number | null;
  /** Breaking capacity adequate */
  readonly breaking_capacity_ok: boolean | null;
}

// ---------------------------------------------------------------------------
// Geometry section builder (RUN #3I COMMIT 5)
// ---------------------------------------------------------------------------

/**
 * Build geometry overrides section for an element.
 * Shows override data (dx, dy, label position) if present.
 */
export function buildGeometrySection(
  elementId: string,
  overrides: readonly GeometryOverrideItemV1[],
): InspectorPropertySection {
  const elementOverrides = overrides.filter(o => o.elementId === elementId);

  if (elementOverrides.length === 0) {
    return {
      id: 'element_geometry',
      label: 'Geometria',
      fields: [{ key: 'no_overrides', label: 'Nadpisania geometrii', value: 'Brak (układ domyślny)' }],
    };
  }

  const fields: InspectorPropertyField[] = elementOverrides
    .sort((a, b) => a.scope.localeCompare(b.scope))
    .map((o, idx) => ({
      key: `override_${idx}`,
      label: `${o.scope} / ${o.operation}`,
      value: JSON.stringify(o.payload),
      source: 'instance' as const,
    }));

  return {
    id: 'element_geometry',
    label: `Geometria (${elementOverrides.length} nadpisań)`,
    fields,
  };
}

// ---------------------------------------------------------------------------
// Validation section builder (RUN #3I COMMIT 5)
// ---------------------------------------------------------------------------

/**
 * Build validation issues section for an element.
 * Shows config validation issues and readiness status.
 */
export function buildValidationSection(
  elementId: string,
  validationResult: SwitchgearConfigValidationResultV1 | null,
): InspectorPropertySection {
  if (!validationResult) {
    return {
      id: 'element_validation',
      label: 'Walidacje',
    fields: [{ key: 'no_validation', label: 'Stan', value: 'Uruchom walidację, aby pokazać wynik kontroli' }],
    };
  }

  const elementIssues = validationResult.issues.filter(
    i => i.elementId === elementId || i.fieldId === elementId || i.deviceId === elementId,
  );

  if (elementIssues.length === 0) {
    return {
      id: 'element_validation',
      label: 'Walidacje',
      fields: [{ key: 'valid', label: 'Stan', value: 'OK — brak problemów' }],
    };
  }

  const fields: InspectorPropertyField[] = elementIssues.map((issue, idx) => ({
    key: `issue_${idx}`,
    label: issue.code,
    value: issue.messagePl,
    highlight: issue.severity === ConfigIssueSeverity.BLOCKER ? 'error' as const : 'warning' as const,
  }));

  return {
    id: 'element_validation',
    label: `Walidacje (${elementIssues.length} problemów)`,
    fields,
  };
}

/**
 * Build results section for a field/device element.
 * Consumes solver results mapped by elementId.
 */
export function buildResultsSection(
  resultData: FieldDeviceResultDataV1,
): InspectorPropertySection {
  const fields: InspectorPropertyField[] = [];

  if (resultData.ikss_ka !== null) {
    fields.push({ key: 'ikss', label: 'Prąd zwarciowy Ik"', value: resultData.ikss_ka, unit: 'kA', source: 'calculated' });
  }
  if (resultData.ip_ka !== null) {
    fields.push({ key: 'ip', label: 'Prąd udarowy ip', value: resultData.ip_ka, unit: 'kA', source: 'calculated' });
  }
  if (resultData.current_a !== null) {
    fields.push({ key: 'current', label: 'Prąd obciążeniowy', value: resultData.current_a, unit: 'A', source: 'calculated' });
  }
  if (resultData.loading_pct !== null) {
    const highlight = resultData.loading_pct > 100 ? 'error' as const
      : resultData.loading_pct > 80 ? 'warning' as const
      : undefined;
    fields.push({ key: 'loading', label: 'Obciążenie', value: resultData.loading_pct, unit: '%', source: 'calculated', highlight });
  }
  if (resultData.rated_current_a !== null) {
    fields.push({ key: 'rated_current', label: 'Prąd znamionowy', value: resultData.rated_current_a, unit: 'A', source: 'instance' });
  }
  if (resultData.breaking_capacity_ok !== null) {
    fields.push({
      key: 'breaking_ok',
      label: 'Zdolność wyłączania',
      value: resultData.breaking_capacity_ok ? 'OK' : 'NIEWYSTARCZAJĄCA',
      highlight: resultData.breaking_capacity_ok ? undefined : 'error',
    });
  }

  if (fields.length === 0) {
    fields.push({ key: 'no_results', label: 'Wyniki', value: 'Wyniki dla tego elementu nie są jeszcze dostępne' });
  }

  return {
    id: 'element_results',
    label: 'Wyniki obliczeń',
    fields,
  };
}
