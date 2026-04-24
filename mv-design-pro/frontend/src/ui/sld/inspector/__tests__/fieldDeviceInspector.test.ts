/**
 * Field & Device Inspector Tests — RUN #3G §4.
 *
 * Tests for inspector property section builders:
 * - buildFieldInspectorSections: field info, devices, catalog, terminals, fixActions
 * - buildDeviceInspectorSections: device info, parameters, bindings, catalog, fixActions
 * - resolveFieldOrDevice: elementId → field or device
 * - buildInspectorSectionsForElement: auto-resolve + build
 * - buildCatalogRefSection: catalog reference display
 * - buildResultsSection: results display with loading highlights
 *
 * BINDING: any failure blocks merge.
 */

import { describe, it, expect } from 'vitest';

import {
  buildFieldInspectorSections,
  buildDeviceInspectorSections,
  buildCatalogRefSection,
  resolveFieldOrDevice,
  buildInspectorSectionsForElement,
  buildResultsSection,
} from '../fieldDeviceInspector';

import type {
  FieldDeviceResultDataV1,
} from '../fieldDeviceInspector';

import type {
  StationBlockDetailV1,
  FieldV1,
  DeviceV1,
  BusSectionV1,
  CatalogRefDetailV1,
} from '../../core/fieldDeviceContracts';

import {
  FieldRoleV1,
  EmbeddingRoleV1,
  DeviceTypeV1,
  DeviceElectricalRoleV1,
  DevicePowerPathPositionV1,
  CatalogCategoryV1,
} from '../../core/fieldDeviceContracts';

// ---------------------------------------------------------------------------
// Test data builders (same pattern as switchgearRenderer tests)
// ---------------------------------------------------------------------------

function makeBusSection(id: string, stationId: string): BusSectionV1 {
  return { id, stationId, orderIndex: 0, catalogRef: null };
}

function makeField(
  id: string,
  stationId: string,
  busSectionId: string,
  fieldRole: FieldRoleV1,
  deviceIds: string[] = [],
): FieldV1 {
  return {
    id,
    stationId,
    busSectionId,
    fieldRole,
    terminals: {
      incomingNodeId: 'node_in_' + id,
      outgoingNodeId: 'node_out_' + id,
      branchNodeId: null,
      generatorNodeId: null,
    },
    requiredDevices: { fieldRole, requirements: [] },
    deviceIds,
    catalogRef: null,
  };
}

function makeDevice(
  id: string,
  fieldId: string,
  deviceType: DeviceTypeV1,
  electricalRole: DeviceElectricalRoleV1,
  powerPathPosition: string,
): DeviceV1 {
  return {
    id,
    fieldId,
    deviceType,
    electricalRole,
    powerPathPosition: powerPathPosition as any,
    catalogRef: null,
    logicalBindings: { boundCbId: null, ctInputIds: [] },
    parameters: {
      ctRatio: null,
      breakingCapacityKa: null,
      ratedCurrentA: null,
      relaySettings: null,
      ratedPowerMva: null,
      ukPercent: null,
      vectorGroup: null,
    },
  };
}

function makeBlock(
  blockId: string,
  fields: FieldV1[],
  devices: DeviceV1[],
): StationBlockDetailV1 {
  return {
    blockId,
    embeddingRole: EmbeddingRoleV1.TRUNK_LEAF,
    busSections: [makeBusSection('bus_01', blockId)],
    fields,
    devices,
    ports: { trunkInPort: 'port_in', trunkOutPort: null, branchPort: null },
    couplerFieldId: null,
    deviceAnchors: [],
    fixActions: [],
  };
}

function makeBlockWithFixes(
  blockId: string,
  fields: FieldV1[],
  devices: DeviceV1[],
): StationBlockDetailV1 {
  return {
    ...makeBlock(blockId, fields, devices),
    fixActions: [
      {
        code: 'field.device_missing.ct',
        message: 'Pole field_01: brak CT',
        elementId: 'field_01',
        fixHint: 'Dodaj CT',
      },
      {
        code: 'device.cb.breaking_capacity_missing',
        message: 'CB dev_cb_01: brak zdolnosci wylaczania',
        elementId: 'dev_cb_01',
        fixHint: 'Uzupelnij parametr',
      },
    ],
  };
}

function makeCatalogRef(elementId: string): CatalogRefDetailV1 {
  return {
    elementId,
    category: CatalogCategoryV1.DEVICE,
    catalogId: 'cat_001',
    catalogVersion: 'v2.1',
    manufacturer: 'ABB',
    name: 'VD4 12kV',
    ratings: {
      breakingCapacityKa: 25,
      ratedCurrentA: 630,
      ratedPowerMva: null,
      ratedVoltageKv: 12,
      ctRatio: null,
    },
  };
}

// ===========================================================================
// buildFieldInspectorSections
// ===========================================================================

describe('buildFieldInspectorSections', () => {
  it('returns basic info section with field data', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN);
    const block = makeBlock('st1', [field], []);
    const sections = buildFieldInspectorSections(field, [], block);

    const basic = sections.find(s => s.id === 'field_basic');
    expect(basic).toBeDefined();
    expect(basic!.label).toBe('Informacje o polu');

    const fieldIdField = basic!.fields.find(f => f.key === 'field_id');
    expect(fieldIdField!.value).toBe('f1');

    const roleField = basic!.fields.find(f => f.key === 'field_role');
    expect(roleField!.value).toBe(FieldRoleV1.LINE_IN);

    const poleField = basic!.fields.find(f => f.key === 'pole_type');
    expect(poleField!.value).toBe('Pole liniowe SN');
  });

  it('lists devices in field with Polish labels', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN, ['d1', 'd2']);
    const devices = [
      makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM),
      makeDevice('d2', 'f1', DeviceTypeV1.CT, DeviceElectricalRoleV1.MEASUREMENT, DevicePowerPathPositionV1.MIDSTREAM),
    ];
    const block = makeBlock('st1', [field], devices);
    const sections = buildFieldInspectorSections(field, devices, block);

    const devSection = sections.find(s => s.id === 'field_devices');
    expect(devSection).toBeDefined();
    expect(devSection!.fields).toHaveLength(2);
    // CB → Wyłącznik
    expect(devSection!.fields.some(f => f.label === 'Wyłącznik')).toBe(true);
    // CT → Przekładnik prądowy
    expect(devSection!.fields.some(f => f.label === 'Przekładnik prądowy')).toBe(true);
  });

  it('shows "Brak aparatow" for field without devices', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN);
    const block = makeBlock('st1', [field], []);
    const sections = buildFieldInspectorSections(field, [], block);

    const devSection = sections.find(s => s.id === 'field_devices');
    expect(devSection!.fields[0].key).toBe('no_devices');
    expect(devSection!.fields[0].value).toBe('—');
  });

  it('includes terminal section when terminals present', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN);
    const block = makeBlock('st1', [field], []);
    const sections = buildFieldInspectorSections(field, [], block);

    const termSection = sections.find(s => s.id === 'field_terminals');
    expect(termSection).toBeDefined();
    expect(termSection!.collapsed).toBe(true);
    expect(termSection!.fields.length).toBeGreaterThan(0);
  });

  it('includes fixActions section when fixes exist', () => {
    const field = makeField('field_01', 'st1', 'bus_01', FieldRoleV1.LINE_IN);
    const block = makeBlockWithFixes('st1', [field], []);
    const sections = buildFieldInspectorSections(field, [], block);

    const fixSection = sections.find(s => s.id === 'field_fixactions');
    expect(fixSection).toBeDefined();
    expect(fixSection!.fields).toHaveLength(1);
    expect(fixSection!.fields[0].highlight).toBe('error');
  });

  it('omits fixActions section when no fixes for field', () => {
    const field = makeField('f_clean', 'st1', 'bus_01', FieldRoleV1.LINE_IN);
    const block = makeBlockWithFixes('st1', [field], []);
    const sections = buildFieldInspectorSections(field, [], block);

    const fixSection = sections.find(s => s.id === 'field_fixactions');
    expect(fixSection).toBeUndefined();
  });

  it('highlights devices without catalog ref as warning', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN, ['d1']);
    const devices = [
      makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM),
    ];
    const block = makeBlock('st1', [field], devices);
    const sections = buildFieldInspectorSections(field, devices, block);

    const devSection = sections.find(s => s.id === 'field_devices');
    expect(devSection!.fields[0].highlight).toBe('warning');
  });

  it('is deterministic', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN, ['d1']);
    const devices = [
      makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM),
    ];
    const block = makeBlock('st1', [field], devices);
    const s1 = buildFieldInspectorSections(field, devices, block);
    const s2 = buildFieldInspectorSections(field, devices, block);
    expect(s1).toEqual(s2);
  });
});

// ===========================================================================
// buildDeviceInspectorSections
// ===========================================================================

describe('buildDeviceInspectorSections', () => {
  it('returns basic info section with device data', () => {
    const device = makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM);
    const block = makeBlock('st1', [], [device]);
    const sections = buildDeviceInspectorSections(device, block);

    const basic = sections.find(s => s.id === 'device_basic');
    expect(basic).toBeDefined();
    expect(basic!.label).toBe('Informacje o aparacie');

    const typeField = basic!.fields.find(f => f.key === 'aparat_type');
    expect(typeField!.value).toBe('Wyłącznik');

    const symbolField = basic!.fields.find(f => f.key === 'symbol_type');
    expect(symbolField!.value).toBe('SYMBOL_CB');
  });

  it('shows parameters when present', () => {
    const device: DeviceV1 = {
      ...makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM),
      parameters: {
        breakingCapacityKa: 25,
        ratedCurrentA: 630,
        ctRatio: null,
        relaySettings: null,
        ratedPowerMva: null,
        ukPercent: null,
        vectorGroup: null,
      },
    };
    const block = makeBlock('st1', [], [device]);
    const sections = buildDeviceInspectorSections(device, block);

    const params = sections.find(s => s.id === 'device_parameters');
    expect(params).toBeDefined();
    expect(params!.fields.some(f => f.key === 'breaking_ka' && f.value === 25)).toBe(true);
    expect(params!.fields.some(f => f.key === 'rated_current' && f.value === 630)).toBe(true);
  });

  it('shows "Brak parametrow" when no parameters set', () => {
    const device = makeDevice('d1', 'f1', DeviceTypeV1.FUSE, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM);
    const block = makeBlock('st1', [], [device]);
    const sections = buildDeviceInspectorSections(device, block);

    const params = sections.find(s => s.id === 'device_parameters');
    expect(params!.fields[0].key).toBe('no_params');
    expect(params!.fields[0].highlight).toBe('warning');
  });

  it('shows relay binding error when relay has no boundCbId', () => {
    const device = makeDevice('d1', 'f1', DeviceTypeV1.RELAY, DeviceElectricalRoleV1.PROTECTION, DevicePowerPathPositionV1.OFF_PATH);
    const block = makeBlock('st1', [], [device]);
    const sections = buildDeviceInspectorSections(device, block);

    const bindings = sections.find(s => s.id === 'device_bindings');
    expect(bindings).toBeDefined();
    expect(bindings!.fields[0].value).toBe('BRAK — wymagane');
    expect(bindings!.fields[0].highlight).toBe('error');
  });

  it('shows relay binding when boundCbId is present', () => {
    const device: DeviceV1 = {
      ...makeDevice('d1', 'f1', DeviceTypeV1.RELAY, DeviceElectricalRoleV1.PROTECTION, DevicePowerPathPositionV1.OFF_PATH),
      logicalBindings: { boundCbId: 'cb_001', ctInputIds: ['ct_001'] },
    };
    const block = makeBlock('st1', [], [device]);
    const sections = buildDeviceInspectorSections(device, block);

    const bindings = sections.find(s => s.id === 'device_bindings');
    expect(bindings!.fields.some(f => f.key === 'bound_cb' && f.value === 'cb_001')).toBe(true);
    expect(bindings!.fields.some(f => f.key === 'ct_inputs' && f.value === 'ct_001')).toBe(true);
  });

  it('shows missing catalog ref as error', () => {
    const device = makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM);
    const block = makeBlock('st1', [], [device]);
    const sections = buildDeviceInspectorSections(device, block);

    const catalog = sections.find(s => s.id === 'device_catalog');
    expect(catalog).toBeDefined();
    expect(catalog!.fields[0].value).toBe('BRAK — wymagane');
    expect(catalog!.fields[0].highlight).toBe('error');
  });

  it('shows catalog ref details when present', () => {
    const catalogRef = makeCatalogRef('d1');
    const device: DeviceV1 = {
      ...makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM),
      catalogRef,
    };
    const block = makeBlock('st1', [], [device]);
    const sections = buildDeviceInspectorSections(device, block);

    const catalog = sections.find(s => s.id === 'device_catalog');
    expect(catalog!.fields.some(f => f.key === 'manufacturer' && f.value === 'ABB')).toBe(true);
    expect(catalog!.fields.some(f => f.key === 'catalog_name' && f.value === 'VD4 12kV')).toBe(true);
  });

  it('includes fixActions for device', () => {
    const device = makeDevice('dev_cb_01', 'field_01', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM);
    const block = makeBlockWithFixes('st1', [], [device]);
    const sections = buildDeviceInspectorSections(device, block);

    const fixSection = sections.find(s => s.id === 'device_fixactions');
    expect(fixSection).toBeDefined();
    expect(fixSection!.fields).toHaveLength(1);
  });

  it('is deterministic', () => {
    const device = makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM);
    const block = makeBlock('st1', [], [device]);
    const s1 = buildDeviceInspectorSections(device, block);
    const s2 = buildDeviceInspectorSections(device, block);
    expect(s1).toEqual(s2);
  });
});

// ===========================================================================
// resolveFieldOrDevice
// ===========================================================================

describe('resolveFieldOrDevice', () => {
  it('resolves field by id', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN, ['d1']);
    const devices = [makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM)];
    const block = makeBlock('st1', [field], devices);

    const result = resolveFieldOrDevice('f1', block);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('field');
    if (result!.type === 'field') {
      expect(result!.field.id).toBe('f1');
      expect(result!.devices).toHaveLength(1);
    }
  });

  it('resolves device by id', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN, ['d1']);
    const devices = [makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM)];
    const block = makeBlock('st1', [field], devices);

    const result = resolveFieldOrDevice('d1', block);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('device');
    if (result!.type === 'device') {
      expect(result!.device.id).toBe('d1');
      expect(result!.field).not.toBeNull();
      expect(result!.field!.id).toBe('f1');
    }
  });

  it('returns null for unknown elementId', () => {
    const block = makeBlock('st1', [], []);
    expect(resolveFieldOrDevice('nonexistent', block)).toBeNull();
  });

  it('field takes precedence over device with same id', () => {
    // Edge case: if somehow a field and device had the same id, field wins
    const field = makeField('shared_id', 'st1', 'bus_01', FieldRoleV1.LINE_IN);
    const block = makeBlock('st1', [field], []);
    const result = resolveFieldOrDevice('shared_id', block);
    expect(result!.type).toBe('field');
  });
});

// ===========================================================================
// buildInspectorSectionsForElement
// ===========================================================================

describe('buildInspectorSectionsForElement', () => {
  it('auto-resolves field and builds sections', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN);
    const block = makeBlock('st1', [field], []);
    const sections = buildInspectorSectionsForElement('f1', block);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.some(s => s.id === 'field_basic')).toBe(true);
  });

  it('auto-resolves device and builds sections', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN, ['d1']);
    const devices = [makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM)];
    const block = makeBlock('st1', [field], devices);
    const sections = buildInspectorSectionsForElement('d1', block);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.some(s => s.id === 'device_basic')).toBe(true);
  });

  it('returns empty for unknown elementId', () => {
    const block = makeBlock('st1', [], []);
    const sections = buildInspectorSectionsForElement('nonexistent', block);
    expect(sections).toHaveLength(0);
  });

  it('is deterministic', () => {
    const field = makeField('f1', 'st1', 'bus_01', FieldRoleV1.LINE_IN, ['d1']);
    const devices = [makeDevice('d1', 'f1', DeviceTypeV1.CB, DeviceElectricalRoleV1.POWER_PATH, DevicePowerPathPositionV1.UPSTREAM)];
    const block = makeBlock('st1', [field], devices);
    const s1 = buildInspectorSectionsForElement('d1', block);
    const s2 = buildInspectorSectionsForElement('d1', block);
    expect(s1).toEqual(s2);
  });
});

// ===========================================================================
// buildCatalogRefSection
// ===========================================================================

describe('buildCatalogRefSection', () => {
  it('includes all catalog fields', () => {
    const catalogRef = makeCatalogRef('d1');
    const section = buildCatalogRefSection('test_catalog', 'Katalog testowy', catalogRef);

    expect(section.id).toBe('test_catalog');
    expect(section.label).toBe('Katalog testowy');
    expect(section.fields.some(f => f.key === 'catalog_id' && f.value === 'cat_001')).toBe(true);
    expect(section.fields.some(f => f.key === 'manufacturer' && f.value === 'ABB')).toBe(true);
    expect(section.fields.some(f => f.key === 'catalog_version' && f.value === 'v2.1')).toBe(true);
  });

  it('includes ratings when present', () => {
    const catalogRef = makeCatalogRef('d1');
    const section = buildCatalogRefSection('test_catalog', 'Katalog', catalogRef);

    expect(section.fields.some(f => f.key === 'cat_breaking_ka' && f.value === 25)).toBe(true);
    expect(section.fields.some(f => f.key === 'cat_rated_current' && f.value === 630)).toBe(true);
    expect(section.fields.some(f => f.key === 'cat_rated_voltage' && f.value === 12)).toBe(true);
  });

  it('omits null ratings', () => {
    const catalogRef = makeCatalogRef('d1');
    const section = buildCatalogRefSection('test_catalog', 'Katalog', catalogRef);

    // ratedPowerMva and ctRatio are null in the test fixture
    expect(section.fields.some(f => f.key === 'cat_rated_power')).toBe(false);
    expect(section.fields.some(f => f.key === 'cat_ct_ratio')).toBe(false);
  });

  it('omits manufacturer when null', () => {
    const catalogRef: CatalogRefDetailV1 = {
      ...makeCatalogRef('d1'),
      manufacturer: null,
    };
    const section = buildCatalogRefSection('test_catalog', 'Katalog', catalogRef);
    expect(section.fields.some(f => f.key === 'manufacturer')).toBe(false);
  });
});

// ===========================================================================
// buildResultsSection
// ===========================================================================

describe('buildResultsSection', () => {
  it('shows short-circuit results when present', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'd1',
      elementType: 'device',
      ikss_ka: 12.5,
      ip_ka: 25.3,
      loading_pct: null,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: null,
    };
    const section = buildResultsSection(data);
    expect(section.id).toBe('element_results');
    expect(section.fields.some(f => f.key === 'ikss' && f.value === 12.5)).toBe(true);
    expect(section.fields.some(f => f.key === 'ip' && f.value === 25.3)).toBe(true);
  });

  it('highlights overloaded element', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'd1',
      elementType: 'device',
      ikss_ka: null,
      ip_ka: null,
      loading_pct: 115,
      current_a: 720,
      rated_current_a: 630,
      breaking_capacity_ok: null,
    };
    const section = buildResultsSection(data);
    const loading = section.fields.find(f => f.key === 'loading');
    expect(loading!.highlight).toBe('error');
  });

  it('highlights warning for loading > 80%', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'd1',
      elementType: 'device',
      ikss_ka: null,
      ip_ka: null,
      loading_pct: 85,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: null,
    };
    const section = buildResultsSection(data);
    const loading = section.fields.find(f => f.key === 'loading');
    expect(loading!.highlight).toBe('warning');
  });

  it('no highlight for loading <= 80%', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'd1',
      elementType: 'device',
      ikss_ka: null,
      ip_ka: null,
      loading_pct: 60,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: null,
    };
    const section = buildResultsSection(data);
    const loading = section.fields.find(f => f.key === 'loading');
    expect(loading!.highlight).toBeUndefined();
  });

  it('shows breaking capacity error', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'd1',
      elementType: 'device',
      ikss_ka: 30,
      ip_ka: null,
      loading_pct: null,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: false,
    };
    const section = buildResultsSection(data);
    const breaking = section.fields.find(f => f.key === 'breaking_ok');
    expect(breaking!.value).toBe('NIEWYSTARCZAJĄCA');
    expect(breaking!.highlight).toBe('error');
  });

  it('shows breaking capacity OK', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'd1',
      elementType: 'device',
      ikss_ka: 12,
      ip_ka: null,
      loading_pct: null,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: true,
    };
    const section = buildResultsSection(data);
    const breaking = section.fields.find(f => f.key === 'breaking_ok');
    expect(breaking!.value).toBe('OK');
    expect(breaking!.highlight).toBeUndefined();
  });

  it('shows "Brak wynikow" when all null', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'd1',
      elementType: 'device',
      ikss_ka: null,
      ip_ka: null,
      loading_pct: null,
      current_a: null,
      rated_current_a: null,
      breaking_capacity_ok: null,
    };
    const section = buildResultsSection(data);
    expect(section.fields[0].key).toBe('no_results');
  });

  it('is deterministic', () => {
    const data: FieldDeviceResultDataV1 = {
      elementId: 'd1',
      elementType: 'device',
      ikss_ka: 12.5,
      ip_ka: 25.3,
      loading_pct: 85,
      current_a: 500,
      rated_current_a: 630,
      breaking_capacity_ok: true,
    };
    const s1 = buildResultsSection(data);
    const s2 = buildResultsSection(data);
    expect(s1).toEqual(s2);
  });
});
