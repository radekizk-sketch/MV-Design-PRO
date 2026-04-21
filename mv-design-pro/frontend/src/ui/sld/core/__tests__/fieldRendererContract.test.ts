import { describe, expect, it } from 'vitest';

import {
  DEVICE_REQUIREMENT_SETS,
  DeviceElectricalRoleV1,
  DevicePowerPathPositionV1,
  DeviceTypeV1,
  EmbeddingRoleV1,
  FieldRoleV1,
} from '../fieldDeviceContracts';
import { computeBayLayout, mapDeviceTypeToSymbolId } from '../bayRenderer';
import { REQUIRED_DEVICES } from '../switchgearConfig';
import { BAY_TEMPLATES } from '../../../power-distribution/bayTemplates';
import { buildStationBlockDetailFromConfig } from '../canonicalFieldDetail';

describe('field renderer contract', () => {
  it('CABLE_HEAD uses dedicated cable_head symbol', () => {
    expect(mapDeviceTypeToSymbolId(DeviceTypeV1.CABLE_HEAD)).toBe('cable_head');
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
