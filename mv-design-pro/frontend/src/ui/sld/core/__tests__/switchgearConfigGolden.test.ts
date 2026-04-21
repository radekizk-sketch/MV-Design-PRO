/**
 * Golden E2E: Config + Overrides round-trip + determinism.
 *
 * RUN #3I COMMIT 6: 3 reference topologies, 50× hash stability.
 *
 * Topologies:
 * 1. Station B: TRAFO field + PV field (PV through transformer)
 * 2. Station C: Line branch + BESS field (BESS through transformer)
 * 3. Station D: Sectionalizing with 2×T
 */

import { describe, it, expect } from 'vitest';

import type {
  SwitchgearConfigV1,
  FieldConfigV1,
  DeviceConfigV1,
  CatalogBindingV1,
  ProtectionBindingV1,
} from '../switchgearConfig';
import {
  SWITCHGEAR_CONFIG_VERSION,
  canonicalizeConfig,
  computeConfigHash,
} from '../switchgearConfig';
import { validateSwitchgearConfig } from '../validateSwitchgearConfig';
import {
  FieldRoleV1,
  PoleTypeV1,
  DeviceTypeV1,
  AparatTypeV1,
} from '../fieldDeviceContracts';
import type { GeometryOverrideItemV1 } from '../geometryOverrides';
import {
  OverrideScopeV1,
  OverrideOperationV1,
  computeOverridesHash,
  canonicalizeOverrides,
} from '../geometryOverrides';

// =============================================================================
// TOPOLOGY BUILDERS
// =============================================================================

function makeStationB_TrafoAndPV(): SwitchgearConfigV1 {
  const fields: FieldConfigV1[] = [
    { fieldId: 'B_f_trafo', poleType: PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN, fieldRole: FieldRoleV1.TRANSFORMER_SN_NN, busSectionId: 'B_bus1' },
    { fieldId: 'B_f_pv', poleType: PoleTypeV1.POLE_ZRODLA_PV_SN, fieldRole: FieldRoleV1.PV_SN, busSectionId: 'B_bus1' },
  ];
  const devices: DeviceConfigV1[] = [
    // TRAFO field
    { deviceId: 'B_cb_t', fieldId: 'B_f_trafo', deviceType: DeviceTypeV1.CB, aparatType: AparatTypeV1.WYLACZNIK },
    { deviceId: 'B_ct_t', fieldId: 'B_f_trafo', deviceType: DeviceTypeV1.CT, aparatType: AparatTypeV1.PRZEKLADNIK_PRADOWY },
    { deviceId: 'B_relay_t', fieldId: 'B_f_trafo', deviceType: DeviceTypeV1.RELAY, aparatType: AparatTypeV1.ZABEZPIECZENIE },
    { deviceId: 'B_tr_t', fieldId: 'B_f_trafo', deviceType: DeviceTypeV1.TRANSFORMER_DEVICE, aparatType: AparatTypeV1.TRANSFORMATOR },
    { deviceId: 'B_ch_t', fieldId: 'B_f_trafo', deviceType: DeviceTypeV1.CABLE_HEAD, aparatType: AparatTypeV1.GLOWICA_KABLOWA },
    // PV field (with transformer for PV/BESS rule)
    { deviceId: 'B_cb_pv', fieldId: 'B_f_pv', deviceType: DeviceTypeV1.CB, aparatType: AparatTypeV1.WYLACZNIK },
    { deviceId: 'B_ct_pv', fieldId: 'B_f_pv', deviceType: DeviceTypeV1.CT, aparatType: AparatTypeV1.PRZEKLADNIK_PRADOWY },
    { deviceId: 'B_relay_pv', fieldId: 'B_f_pv', deviceType: DeviceTypeV1.RELAY, aparatType: AparatTypeV1.ZABEZPIECZENIE },
    { deviceId: 'B_pv', fieldId: 'B_f_pv', deviceType: DeviceTypeV1.GENERATOR_PV, aparatType: AparatTypeV1.GENERATOR_PV },
    { deviceId: 'B_ch_pv', fieldId: 'B_f_pv', deviceType: DeviceTypeV1.CABLE_HEAD, aparatType: AparatTypeV1.GLOWICA_KABLOWA },
    { deviceId: 'B_tr_pv', fieldId: 'B_f_pv', deviceType: DeviceTypeV1.TRANSFORMER_DEVICE, aparatType: AparatTypeV1.TRANSFORMATOR },
  ];
  const catalogBindings: CatalogBindingV1[] = devices.map(d => ({
    deviceId: d.deviceId, catalogId: `cat_${d.deviceId}`, catalogName: `Katalog ${d.deviceId}`,
    manufacturer: null, catalogVersion: null,
  }));
  const protectionBindings: ProtectionBindingV1[] = [
    { relayDeviceId: 'B_relay_t', cbDeviceId: 'B_cb_t' },
    { relayDeviceId: 'B_relay_pv', cbDeviceId: 'B_cb_pv' },
  ];
  return { configVersion: SWITCHGEAR_CONFIG_VERSION, stationId: 'station_B', fields, devices, catalogBindings, protectionBindings };
}

function makeStationC_BranchAndBESS(): SwitchgearConfigV1 {
  const fields: FieldConfigV1[] = [
    { fieldId: 'C_f_branch', poleType: PoleTypeV1.POLE_LINIOWE_SN, fieldRole: FieldRoleV1.LINE_BRANCH, busSectionId: 'C_bus1' },
    { fieldId: 'C_f_bess', poleType: PoleTypeV1.POLE_ZRODLA_BESS_SN, fieldRole: FieldRoleV1.BESS_SN, busSectionId: 'C_bus1' },
  ];
  const devices: DeviceConfigV1[] = [
    { deviceId: 'C_cb_br', fieldId: 'C_f_branch', deviceType: DeviceTypeV1.CB, aparatType: AparatTypeV1.WYLACZNIK },
    { deviceId: 'C_ch_br', fieldId: 'C_f_branch', deviceType: DeviceTypeV1.CABLE_HEAD, aparatType: AparatTypeV1.GLOWICA_KABLOWA },
    { deviceId: 'C_cb_bess', fieldId: 'C_f_bess', deviceType: DeviceTypeV1.CB, aparatType: AparatTypeV1.WYLACZNIK },
    { deviceId: 'C_ct_bess', fieldId: 'C_f_bess', deviceType: DeviceTypeV1.CT, aparatType: AparatTypeV1.PRZEKLADNIK_PRADOWY },
    { deviceId: 'C_relay_bess', fieldId: 'C_f_bess', deviceType: DeviceTypeV1.RELAY, aparatType: AparatTypeV1.ZABEZPIECZENIE },
    { deviceId: 'C_bess', fieldId: 'C_f_bess', deviceType: DeviceTypeV1.GENERATOR_BESS, aparatType: AparatTypeV1.GENERATOR_BESS },
    { deviceId: 'C_ch_bess', fieldId: 'C_f_bess', deviceType: DeviceTypeV1.CABLE_HEAD, aparatType: AparatTypeV1.GLOWICA_KABLOWA },
    { deviceId: 'C_tr_bess', fieldId: 'C_f_bess', deviceType: DeviceTypeV1.TRANSFORMER_DEVICE, aparatType: AparatTypeV1.TRANSFORMATOR },
  ];
  const catalogBindings: CatalogBindingV1[] = devices.map(d => ({
    deviceId: d.deviceId, catalogId: `cat_${d.deviceId}`, catalogName: `Katalog ${d.deviceId}`,
    manufacturer: null, catalogVersion: null,
  }));
  const protectionBindings: ProtectionBindingV1[] = [
    { relayDeviceId: 'C_relay_bess', cbDeviceId: 'C_cb_bess' },
  ];
  return { configVersion: SWITCHGEAR_CONFIG_VERSION, stationId: 'station_C', fields, devices, catalogBindings, protectionBindings };
}

function makeStationD_Sectionalizing2T(): SwitchgearConfigV1 {
  const fields: FieldConfigV1[] = [
    { fieldId: 'D_f_t1', poleType: PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN, fieldRole: FieldRoleV1.TRANSFORMER_SN_NN, busSectionId: 'D_bus1' },
    { fieldId: 'D_f_t2', poleType: PoleTypeV1.POLE_TRANSFORMATOROWE_SN_NN, fieldRole: FieldRoleV1.TRANSFORMER_SN_NN, busSectionId: 'D_bus2' },
    { fieldId: 'D_f_coupler', poleType: PoleTypeV1.POLE_SPRZEGLOWE_SN, fieldRole: FieldRoleV1.COUPLER_SN, busSectionId: null },
  ];
  const makeTrafoDevices = (prefix: string, fieldId: string): DeviceConfigV1[] => [
    { deviceId: `${prefix}_cb`, fieldId, deviceType: DeviceTypeV1.CB, aparatType: AparatTypeV1.WYLACZNIK },
    { deviceId: `${prefix}_ct`, fieldId, deviceType: DeviceTypeV1.CT, aparatType: AparatTypeV1.PRZEKLADNIK_PRADOWY },
    { deviceId: `${prefix}_relay`, fieldId, deviceType: DeviceTypeV1.RELAY, aparatType: AparatTypeV1.ZABEZPIECZENIE },
    { deviceId: `${prefix}_tr`, fieldId, deviceType: DeviceTypeV1.TRANSFORMER_DEVICE, aparatType: AparatTypeV1.TRANSFORMATOR },
    { deviceId: `${prefix}_ch`, fieldId, deviceType: DeviceTypeV1.CABLE_HEAD, aparatType: AparatTypeV1.GLOWICA_KABLOWA },
  ];
  const devices: DeviceConfigV1[] = [
    ...makeTrafoDevices('D_t1', 'D_f_t1'),
    ...makeTrafoDevices('D_t2', 'D_f_t2'),
    { deviceId: 'D_ds_coupler', fieldId: 'D_f_coupler', deviceType: DeviceTypeV1.DS, aparatType: AparatTypeV1.ODLACZNIK },
    { deviceId: 'D_cb_coupler', fieldId: 'D_f_coupler', deviceType: DeviceTypeV1.CB, aparatType: AparatTypeV1.WYLACZNIK },
  ];
  const catalogBindings: CatalogBindingV1[] = devices.map(d => ({
    deviceId: d.deviceId, catalogId: `cat_${d.deviceId}`, catalogName: `Katalog ${d.deviceId}`,
    manufacturer: null, catalogVersion: null,
  }));
  const protectionBindings: ProtectionBindingV1[] = [
    { relayDeviceId: 'D_t1_relay', cbDeviceId: 'D_t1_cb' },
    { relayDeviceId: 'D_t2_relay', cbDeviceId: 'D_t2_cb' },
  ];
  return { configVersion: SWITCHGEAR_CONFIG_VERSION, stationId: 'station_D', fields, devices, catalogBindings, protectionBindings };
}

// =============================================================================
// GOLDEN E2E TESTS
// =============================================================================

describe('Golden E2E: Station B (TRAFO + PV)', () => {
  const config = makeStationB_TrafoAndPV();

  it('validates as OK (no blockers)', () => {
    const result = validateSwitchgearConfig(config);
    expect(result.valid).toBe(true);
    const blockers = result.issues.filter(i => i.severity === 'BLOCKER');
    expect(blockers).toHaveLength(0);
  });

  it('config hash stable 50×', () => {
    const ref = computeConfigHash(config);
    for (let i = 0; i < 50; i++) {
      expect(computeConfigHash(config)).toBe(ref);
    }
  });

  it('permutation invariance: shuffle fields+devices', () => {
    const shuffled: SwitchgearConfigV1 = {
      ...config,
      fields: [...config.fields].reverse(),
      devices: [...config.devices].reverse(),
      catalogBindings: [...config.catalogBindings].reverse(),
      protectionBindings: [...config.protectionBindings].reverse(),
    };
    expect(computeConfigHash(shuffled)).toBe(computeConfigHash(config));
  });
});

describe('Golden E2E: Station C (BRANCH + BESS)', () => {
  const config = makeStationC_BranchAndBESS();

  it('validates as OK (no blockers)', () => {
    const result = validateSwitchgearConfig(config);
    expect(result.valid).toBe(true);
  });

  it('config hash stable 50×', () => {
    const ref = computeConfigHash(config);
    for (let i = 0; i < 50; i++) {
      expect(computeConfigHash(config)).toBe(ref);
    }
  });
});

describe('Golden E2E: Station D (2×T sectionalizing)', () => {
  const config = makeStationD_Sectionalizing2T();

  it('validates as OK (no blockers)', () => {
    const result = validateSwitchgearConfig(config);
    expect(result.valid).toBe(true);
  });

  it('config hash stable 50×', () => {
    const ref = computeConfigHash(config);
    for (let i = 0; i < 50; i++) {
      expect(computeConfigHash(config)).toBe(ref);
    }
  });
});

// =============================================================================
// OVERRIDES GOLDEN (config + overrides = stable hash)
// =============================================================================

describe('Golden E2E: Config + Overrides combined stability', () => {
  it('config hash + overrides hash both stable after 5 drags (50×)', () => {
    const config = makeStationB_TrafoAndPV();

    // Simulate 5 drags
    const overrides = {
      overridesVersion: '1.0' as const,
      studyCaseId: 'case_1',
      snapshotHash: 'snap_1',
      items: [
        { elementId: 'B_f_trafo', scope: OverrideScopeV1.NODE, operation: OverrideOperationV1.MOVE_DELTA, payload: { dx: 10, dy: 0 } },
        { elementId: 'B_f_pv', scope: OverrideScopeV1.NODE, operation: OverrideOperationV1.MOVE_DELTA, payload: { dx: -5, dy: 15 } },
        { elementId: 'station_B', scope: OverrideScopeV1.BLOCK, operation: OverrideOperationV1.MOVE_DELTA, payload: { dx: 0, dy: 30 } },
        { elementId: 'B_cb_t', scope: OverrideScopeV1.LABEL, operation: OverrideOperationV1.MOVE_LABEL, payload: { anchorX: 5, anchorY: -3 } },
        { elementId: 'B_f_trafo', scope: OverrideScopeV1.LABEL, operation: OverrideOperationV1.MOVE_LABEL, payload: { anchorX: 0, anchorY: 10 } },
      ] as GeometryOverrideItemV1[],
    };

    const configHashRef = computeConfigHash(config);
    const overridesHashRef = computeOverridesHash(overrides);

    for (let i = 0; i < 50; i++) {
      expect(computeConfigHash(config)).toBe(configHashRef);
      expect(computeOverridesHash(overrides)).toBe(overridesHashRef);
    }
  });

  it('overrides permutation invariance (50×)', () => {
    const items: GeometryOverrideItemV1[] = [
      { elementId: 'e1', scope: OverrideScopeV1.NODE, operation: OverrideOperationV1.MOVE_DELTA, payload: { dx: 10, dy: 20 } },
      { elementId: 'e2', scope: OverrideScopeV1.NODE, operation: OverrideOperationV1.MOVE_DELTA, payload: { dx: 30, dy: 40 } },
      { elementId: 'e3', scope: OverrideScopeV1.LABEL, operation: OverrideOperationV1.MOVE_LABEL, payload: { anchorX: 5, anchorY: 5 } },
    ];

    const base = { overridesVersion: '1.0' as const, studyCaseId: 'c1', snapshotHash: 's1', items };
    const refHash = computeOverridesHash(base);

    for (let i = 0; i < 50; i++) {
      const shuffled = {
        ...base,
        items: [...items].reverse(),
      };
      expect(computeOverridesHash(shuffled)).toBe(refHash);
    }
  });
});
