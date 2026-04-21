import type {
  BusSectionV1,
  DeviceLogicalBindingsV1,
  DeviceParametersV1,
  DeviceV1,
  FieldV1,
  StationBlockDetailV1,
} from './fieldDeviceContracts';
import {
  DEVICE_REQUIREMENT_SETS,
  DeviceElectricalRoleV1,
  DevicePowerPathPositionV1,
  DeviceTypeV1,
  EmbeddingRoleV1,
  FieldRoleV1,
} from './fieldDeviceContracts';
import type { StationConfig } from '../../power-distribution/types';

const EMPTY_DEVICE_PARAMETERS: DeviceParametersV1 = {
  ctRatio: null,
  breakingCapacityKa: null,
  ratedCurrentA: null,
  relaySettings: null,
  ratedPowerMva: null,
  ukPercent: null,
  vectorGroup: null,
};

const EMPTY_DEVICE_BINDINGS: DeviceLogicalBindingsV1 = {
  boundCbId: null,
  ctInputIds: [],
};

function createBusSections(
  stationId: string,
  count: number,
  prefix = 'bus-section',
): readonly BusSectionV1[] {
  return Array.from({ length: Math.max(count, 1) }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    stationId,
    orderIndex: index,
    catalogRef: null,
  }));
}

function createFieldDetail(options: {
  fieldId: string;
  stationId: string;
  busSectionId: string;
  fieldRole: FieldRoleV1;
  deviceIds: readonly string[];
}): FieldV1 {
  return {
    id: options.fieldId,
    stationId: options.stationId,
    busSectionId: options.busSectionId,
    fieldRole: options.fieldRole,
    terminals: {
      incomingNodeId: null,
      outgoingNodeId: null,
      branchNodeId: null,
      generatorNodeId: null,
    },
    requiredDevices: DEVICE_REQUIREMENT_SETS[options.fieldRole],
    deviceIds: [...options.deviceIds].sort((left, right) => left.localeCompare(right)),
    catalogRef: null,
  };
}

function createDeviceDetail(options: {
  deviceId: string;
  fieldId: string;
  deviceType: DeviceTypeV1;
  electricalRole: DeviceElectricalRoleV1;
  powerPathPosition: DevicePowerPathPositionV1;
  boundCbId?: string | null;
  ctInputIds?: readonly string[];
}): DeviceV1 {
  return {
    id: options.deviceId,
    fieldId: options.fieldId,
    deviceType: options.deviceType,
    electricalRole: options.electricalRole,
    powerPathPosition: options.powerPathPosition,
    catalogRef: null,
    logicalBindings: {
      ...EMPTY_DEVICE_BINDINGS,
      boundCbId: options.boundCbId ?? null,
      ctInputIds: [...(options.ctInputIds ?? [])].sort((left, right) => left.localeCompare(right)),
    },
    parameters: EMPTY_DEVICE_PARAMETERS,
  };
}

function buildStationBlockDetail(options: {
  blockId: string;
  embeddingRole: EmbeddingRoleV1;
  busSections: readonly BusSectionV1[];
  fields: readonly FieldV1[];
  devices: readonly DeviceV1[];
  ports?: Partial<StationBlockDetailV1['ports']>;
  couplerFieldId?: string | null;
}): StationBlockDetailV1 {
  return {
    blockId: options.blockId,
    embeddingRole: options.embeddingRole,
    busSections: [...options.busSections].sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }
      return left.id.localeCompare(right.id);
    }),
    fields: [...options.fields].sort((left, right) => left.id.localeCompare(right.id)),
    devices: [...options.devices].sort((left, right) => left.id.localeCompare(right.id)),
    ports: {
      trunkInPort: options.ports?.trunkInPort ?? null,
      trunkOutPort: options.ports?.trunkOutPort ?? null,
      branchPort: options.ports?.branchPort ?? null,
    },
    couplerFieldId: options.couplerFieldId ?? null,
    deviceAnchors: [],
    fixActions: [],
  };
}

export function buildStationBlockDetailFromConfig(config: StationConfig): StationBlockDetailV1 {
  const busSections = createBusSections(config.stationId, config.busSectionCount);
  const defaultBusSectionId = busSections[0]?.id ?? 'bus-section-1';

  const fields = config.fields.map((fieldConfig) =>
    createFieldDetail({
      fieldId: fieldConfig.fieldId,
      stationId: config.stationId,
      busSectionId: fieldConfig.busSectionId || defaultBusSectionId,
      fieldRole: fieldConfig.fieldRole,
      deviceIds: fieldConfig.devices.map((device) => device.deviceId),
    }),
  );

  const devices = config.fields.flatMap((fieldConfig) =>
    fieldConfig.devices.map((deviceConfig) =>
      createDeviceDetail({
        deviceId: deviceConfig.deviceId,
        fieldId: fieldConfig.fieldId,
        deviceType: deviceConfig.deviceType,
        electricalRole: deviceConfig.electricalRole,
        powerPathPosition: deviceConfig.powerPathPosition,
      }),
    ),
  );

  const couplerField = config.fields.find(
    (field) => field.fieldRole === 'COUPLER_SN' || field.fieldRole === 'BUS_TIE',
  );

  return buildStationBlockDetail({
    blockId: config.stationId,
    embeddingRole: config.embeddingRole,
    busSections,
    fields,
    devices,
    ports: {
      trunkInPort: 'trunk-in',
      trunkOutPort: config.embeddingRole !== 'TRUNK_LEAF' ? 'trunk-out' : null,
      branchPort: config.embeddingRole === 'TRUNK_BRANCH' ? 'branch-port' : null,
    },
    couplerFieldId: config.embeddingRole === 'LOCAL_SECTIONAL' ? (couplerField?.fieldId ?? null) : null,
  });
}

export function buildStationBlockDetailForBranchRef(
  branchRef: string,
): StationBlockDetailV1 {
  const busSections = createBusSections(branchRef, 1, `${branchRef}-bus`);
  const busSectionId = busSections[0]?.id ?? `${branchRef}-bus-1`;
  const fieldId = `${branchRef}-field`;
  const devices = [
    createDeviceDetail({
      deviceId: `${branchRef}-01-ds`,
      fieldId,
      deviceType: DeviceTypeV1.DS,
      electricalRole: DeviceElectricalRoleV1.POWER_PATH,
      powerPathPosition: DevicePowerPathPositionV1.UPSTREAM,
    }),
    createDeviceDetail({
      deviceId: `${branchRef}-02-head`,
      fieldId,
      deviceType: DeviceTypeV1.CABLE_HEAD,
      electricalRole: DeviceElectricalRoleV1.TERMINATION,
      powerPathPosition: DevicePowerPathPositionV1.DOWNSTREAM,
    }),
  ];
  const fields = [
    createFieldDetail({
      fieldId,
      stationId: branchRef,
      busSectionId,
      fieldRole: FieldRoleV1.LINE_BRANCH,
      deviceIds: devices.map((device) => device.id),
    }),
  ];

  return buildStationBlockDetail({
    blockId: branchRef,
    embeddingRole: EmbeddingRoleV1.TRUNK_BRANCH,
    busSections,
    fields,
    devices,
  });
}
