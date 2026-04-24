import { describe, expect, it } from 'vitest';

import {
  DEVICE_REQUIREMENT_SETS,
  DeviceElectricalRoleV1,
  DeviceRequirementLevel,
  DevicePowerPathPositionV1,
  DeviceTypeV1,
  EmbeddingRoleV1,
  FieldDeviceFixCodes,
  FieldRoleV1,
  type FieldV1,
  validateFieldDevices,
} from '../fieldDeviceContracts';
import { computeBayLayout, mapDeviceTypeToSymbolId } from '../bayRenderer';
import { REQUIRED_DEVICES } from '../switchgearConfig';
import { BAY_TEMPLATES } from '../../../power-distribution/bayTemplates';
import { buildStationBlockDetailFromConfig } from '../canonicalFieldDetail';

function makeField(id: string, role: FieldRoleV1): FieldV1 {
  return {
    id,
    stationId: 'station-gpz',
    busSectionId: 'bus-section-1',
    fieldRole: role,
    terminals: {
      incomingNodeId: null,
      outgoingNodeId: 'feeder-1',
      branchNodeId: null,
      generatorNodeId: null,
    },
    requiredDevices: DEVICE_REQUIREMENT_SETS[role],
    deviceIds: [],
    catalogRef: null,
  };
}

describe('field renderer contract', () => {
  it('CABLE_HEAD uses dedicated cable_head symbol', () => {
    expect(mapDeviceTypeToSymbolId(DeviceTypeV1.CABLE_HEAD)).toBe('cable_head');
  });

  it('GPZ_LINE_BAY has the canonical GPZ line bay apparatus contract', () => {
    const requirements = DEVICE_REQUIREMENT_SETS[FieldRoleV1.GPZ_LINE_BAY].requirements;

    expect(requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceType: DeviceTypeV1.DS,
          level: DeviceRequirementLevel.REQUIRED,
          powerPathPosition: DevicePowerPathPositionV1.UPSTREAM,
        }),
        expect.objectContaining({
          deviceType: DeviceTypeV1.CB,
          level: DeviceRequirementLevel.REQUIRED,
          powerPathPosition: DevicePowerPathPositionV1.MIDSTREAM,
        }),
        expect.objectContaining({
          deviceType: DeviceTypeV1.CT,
          level: DeviceRequirementLevel.REQUIRED,
          powerPathPosition: DevicePowerPathPositionV1.MIDSTREAM,
        }),
        expect.objectContaining({
          deviceType: DeviceTypeV1.RELAY,
          level: DeviceRequirementLevel.REQUIRED,
          powerPathPosition: DevicePowerPathPositionV1.OFF_PATH,
        }),
        expect.objectContaining({
          deviceType: DeviceTypeV1.ES,
          level: DeviceRequirementLevel.REQUIRED,
          powerPathPosition: DevicePowerPathPositionV1.OFF_PATH,
        }),
        expect.objectContaining({
          deviceType: DeviceTypeV1.CABLE_HEAD,
          level: DeviceRequirementLevel.REQUIRED,
          powerPathPosition: DevicePowerPathPositionV1.DOWNSTREAM,
        }),
      ]),
    );
    expect(REQUIRED_DEVICES[FieldRoleV1.GPZ_LINE_BAY]).toEqual(
      expect.arrayContaining([
        DeviceTypeV1.DS,
        DeviceTypeV1.CB,
        DeviceTypeV1.CT,
        DeviceTypeV1.RELAY,
        DeviceTypeV1.ES,
        DeviceTypeV1.CABLE_HEAD,
      ]),
    );
  });

  it('station line cubicle contracts are not upgraded to GPZ line bay requirements', () => {
    const lineOutRequirements = DEVICE_REQUIREMENT_SETS[FieldRoleV1.LINE_OUT].requirements;
    const ct = lineOutRequirements.find((requirement) => requirement.deviceType === DeviceTypeV1.CT);
    const relay = lineOutRequirements.find((requirement) => requirement.deviceType === DeviceTypeV1.RELAY);
    const earthingSwitch = lineOutRequirements.find((requirement) => requirement.deviceType === DeviceTypeV1.ES);

    expect(ct?.level).toBe(DeviceRequirementLevel.REQUIRED_IF);
    expect(relay?.level).toBe(DeviceRequirementLevel.OPTIONAL);
    expect(earthingSwitch?.level).toBe(DeviceRequirementLevel.OPTIONAL);
  });

  it('GPZ_LINE_BAY validation reports missing electrical apparatus explicitly', () => {
    const fixActions = validateFieldDevices(
      makeField('gpz-line-1', FieldRoleV1.GPZ_LINE_BAY),
      [],
      false,
      false,
    );

    expect(fixActions.map((action) => action.code)).toEqual(
      expect.arrayContaining([
        FieldDeviceFixCodes.FIELD_DEVICE_MISSING_DS,
        FieldDeviceFixCodes.FIELD_DEVICE_MISSING_CB,
        FieldDeviceFixCodes.FIELD_DEVICE_MISSING_CT,
        FieldDeviceFixCodes.FIELD_DEVICE_MISSING_RELAY,
        FieldDeviceFixCodes.FIELD_DEVICE_MISSING_ES,
        FieldDeviceFixCodes.FIELD_DEVICE_MISSING_CABLE_HEAD,
      ]),
    );
  });

  it('GPZ_LINE_BAY layout keeps CT in axis and relay plus earthing switch off-path', () => {
    const detail = buildStationBlockDetailFromConfig({
      stationId: 'gpz-1',
      stationName: 'GPZ 1',
      embeddingRole: EmbeddingRoleV1.TRUNK_INLINE,
      busSectionCount: 1,
      fields: [
        {
          fieldId: 'gpz-line-1',
          fieldRole: FieldRoleV1.GPZ_LINE_BAY,
          busSectionId: 'bus-section-1',
          devices: [
            {
              deviceId: 'ds-1',
              deviceType: DeviceTypeV1.DS,
              electricalRole: DeviceElectricalRoleV1.POWER_PATH,
              powerPathPosition: DevicePowerPathPositionV1.UPSTREAM,
            },
            {
              deviceId: 'cb-1',
              deviceType: DeviceTypeV1.CB,
              electricalRole: DeviceElectricalRoleV1.POWER_PATH,
              powerPathPosition: DevicePowerPathPositionV1.MIDSTREAM,
            },
            {
              deviceId: 'ct-1',
              deviceType: DeviceTypeV1.CT,
              electricalRole: DeviceElectricalRoleV1.MEASUREMENT,
              powerPathPosition: DevicePowerPathPositionV1.MIDSTREAM,
            },
            {
              deviceId: 'relay-1',
              deviceType: DeviceTypeV1.RELAY,
              electricalRole: DeviceElectricalRoleV1.PROTECTION,
              powerPathPosition: DevicePowerPathPositionV1.OFF_PATH,
            },
            {
              deviceId: 'es-1',
              deviceType: DeviceTypeV1.ES,
              electricalRole: DeviceElectricalRoleV1.POWER_PATH,
              powerPathPosition: DevicePowerPathPositionV1.OFF_PATH,
            },
            {
              deviceId: 'head-1',
              deviceType: DeviceTypeV1.CABLE_HEAD,
              electricalRole: DeviceElectricalRoleV1.TERMINATION,
              powerPathPosition: DevicePowerPathPositionV1.DOWNSTREAM,
            },
          ],
        },
      ],
    });

    const layout = computeBayLayout(detail, { x: 0, y: 0, width: 180, height: 280 });
    const bay = layout.bays[0];
    const byId = new Map(bay.devices.map((device) => [device.deviceId, device]));

    expect(byId.get('ct-1')?.layoutSlot).toBe('MAIN');
    expect(byId.get('ct-1')?.isOnPowerPath).toBe(true);
    expect(byId.get('head-1')?.symbolId).toBe('cable_head');
    expect(byId.get('head-1')?.layoutSlot).toBe('MAIN');
    expect(byId.get('relay-1')?.layoutSlot).toBe('SIDE_RIGHT');
    expect(byId.get('relay-1')?.isOnPowerPath).toBe(false);
    expect(byId.get('es-1')?.layoutSlot).toBe('SIDE_RIGHT');
    expect(byId.get('es-1')?.isOnPowerPath).toBe(false);
    expect(layout.auxiliaryConnections.some((connection) => connection.kind === 'SIDE_BRANCH')).toBe(true);
  });

  it('coupler requirements include isolators on both sides of the breaker', () => {
    const requirements = DEVICE_REQUIREMENT_SETS[FieldRoleV1.COUPLER_SN].requirements;

    expect(requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceType: DeviceTypeV1.DS,
          powerPathPosition: DevicePowerPathPositionV1.UPSTREAM,
        }),
        expect.objectContaining({
          deviceType: DeviceTypeV1.CB,
          powerPathPosition: DevicePowerPathPositionV1.MIDSTREAM,
        }),
        expect.objectContaining({
          deviceType: DeviceTypeV1.DS,
          powerPathPosition: DevicePowerPathPositionV1.DOWNSTREAM,
        }),
      ]),
    );
  });

  it('coupler requirements do not include transformer or cable head', () => {
    const deviceTypes = DEVICE_REQUIREMENT_SETS[FieldRoleV1.COUPLER_SN].requirements
      .map((requirement) => requirement.deviceType);

    expect(deviceTypes).not.toContain(DeviceTypeV1.TRANSFORMER_DEVICE);
    expect(deviceTypes).not.toContain(DeviceTypeV1.CABLE_HEAD);
    expect(REQUIRED_DEVICES[FieldRoleV1.COUPLER_SN]).not.toContain(DeviceTypeV1.TRANSFORMER_DEVICE);
    expect(REQUIRED_DEVICES[FieldRoleV1.COUPLER_SN]).not.toContain(DeviceTypeV1.CABLE_HEAD);
  });

  it('bus measurement bay requires only off-path VT as mandatory apparatus', () => {
    const requirements = DEVICE_REQUIREMENT_SETS[FieldRoleV1.MEASUREMENT_SN].requirements;
    const vt = requirements.find((requirement) => requirement.deviceType === DeviceTypeV1.VT);
    const cb = requirements.find((requirement) => requirement.deviceType === DeviceTypeV1.CB);
    const cableHead = requirements.find((requirement) => requirement.deviceType === DeviceTypeV1.CABLE_HEAD);

    expect(vt).toEqual(expect.objectContaining({
      level: DeviceRequirementLevel.REQUIRED,
      powerPathPosition: DevicePowerPathPositionV1.OFF_PATH,
    }));
    expect(cb).toBeUndefined();
    expect(cableHead?.level).toBe(DeviceRequirementLevel.OPTIONAL);
    expect(REQUIRED_DEVICES[FieldRoleV1.MEASUREMENT_SN]).toEqual([DeviceTypeV1.VT]);
  });

  it('required devices for coupler and bus tie are not a single-apparatus contract', () => {
    expect(REQUIRED_DEVICES[FieldRoleV1.COUPLER_SN]).toEqual(
      expect.arrayContaining([DeviceTypeV1.DS, DeviceTypeV1.CB]),
    );
    expect(REQUIRED_DEVICES[FieldRoleV1.BUS_TIE]).toEqual(
      expect.arrayContaining([DeviceTypeV1.DS, DeviceTypeV1.CB]),
    );
  });

  it('power-distribution templates for coupler and bus tie render multiple devices', () => {
    const couplerTemplate = BAY_TEMPLATES.get(FieldRoleV1.COUPLER_SN);
    const busTieTemplate = BAY_TEMPLATES.get(FieldRoleV1.BUS_TIE);

    expect(couplerTemplate?.devices.length).toBeGreaterThan(1);
    expect(busTieTemplate?.devices.length).toBeGreaterThan(1);
    expect(couplerTemplate?.devices.map((device) => device.deviceType)).toEqual(
      expect.arrayContaining([DeviceTypeV1.DS, DeviceTypeV1.CB]),
    );
    expect(busTieTemplate?.devices.map((device) => device.deviceType)).toEqual(
      expect.arrayContaining([DeviceTypeV1.DS, DeviceTypeV1.CB]),
    );
  });

  it('pole liniowe ma boczne odgalezienie dla urzadzenia off-path', () => {
    const detail = buildStationBlockDetailFromConfig({
      stationId: 'station-1',
      stationName: 'Station 1',
      embeddingRole: EmbeddingRoleV1.TRUNK_LEAF,
      busSectionCount: 1,
      fields: [
        {
          fieldId: 'bay-1',
          fieldRole: FieldRoleV1.LINE_OUT,
          busSectionId: 'bus-section-1',
          devices: [
            {
              deviceId: 'ds-1',
              deviceType: DeviceTypeV1.DS,
              electricalRole: DeviceElectricalRoleV1.POWER_PATH,
              powerPathPosition: DevicePowerPathPositionV1.UPSTREAM,
            },
            {
              deviceId: 'cb-1',
              deviceType: DeviceTypeV1.CB,
              electricalRole: DeviceElectricalRoleV1.POWER_PATH,
              powerPathPosition: DevicePowerPathPositionV1.MIDSTREAM,
            },
            {
              deviceId: 'head-1',
              deviceType: DeviceTypeV1.CABLE_HEAD,
              electricalRole: DeviceElectricalRoleV1.TERMINATION,
              powerPathPosition: DevicePowerPathPositionV1.DOWNSTREAM,
            },
            {
              deviceId: 'es-1',
              deviceType: DeviceTypeV1.ES,
              electricalRole: DeviceElectricalRoleV1.PROTECTION,
              powerPathPosition: DevicePowerPathPositionV1.OFF_PATH,
            },
          ],
        },
      ],
    });

    const layout = computeBayLayout(detail, { x: 0, y: 0, width: 160, height: 260 });
    const earthSwitch = layout.bays[0]?.devices.find((device) => device.deviceId === 'es-1');

    expect(earthSwitch?.layoutSlot).toBe('SIDE_RIGHT');
    expect(layout.auxiliaryConnections.some((connection) => connection.kind === 'SIDE_BRANCH')).toBe(true);
  });

  it('sprzeglo szyn tworzy dwa tapy z szyny i dolny lacznik U', () => {
    const detail = buildStationBlockDetailFromConfig({
      stationId: 'station-coupler',
      stationName: 'Station coupler',
      embeddingRole: EmbeddingRoleV1.LOCAL_SECTIONAL,
      busSectionCount: 2,
      fields: [
        {
          fieldId: 'coupler-bay',
          fieldRole: FieldRoleV1.COUPLER_SN,
          busSectionId: 'bus-section-1',
          devices: [
            {
              deviceId: 'ds-left',
              deviceType: DeviceTypeV1.DS,
              electricalRole: DeviceElectricalRoleV1.POWER_PATH,
              powerPathPosition: DevicePowerPathPositionV1.UPSTREAM,
            },
            {
              deviceId: 'cb-main',
              deviceType: DeviceTypeV1.CB,
              electricalRole: DeviceElectricalRoleV1.POWER_PATH,
              powerPathPosition: DevicePowerPathPositionV1.MIDSTREAM,
            },
            {
              deviceId: 'ds-right',
              deviceType: DeviceTypeV1.DS,
              electricalRole: DeviceElectricalRoleV1.POWER_PATH,
              powerPathPosition: DevicePowerPathPositionV1.DOWNSTREAM,
            },
          ],
        },
      ],
    });

    const layout = computeBayLayout(detail, { x: 0, y: 0, width: 220, height: 260 });
    const busTaps = layout.auxiliaryConnections.filter((connection) => connection.kind === 'BUS_TAP');
    const couplerLinks = layout.auxiliaryConnections.filter((connection) => connection.kind === 'COUPLER_LINK');

    expect(busTaps).toHaveLength(2);
    expect(couplerLinks.length).toBeGreaterThanOrEqual(3);
  });
});
