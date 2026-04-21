import type { ReactNode } from 'react';
import type { BayDeviceState } from '../../types/enm';
import type { DeviceConfig, FieldConfig, StationConfig } from '../power-distribution/types';
import { CanonicalFieldRenderer } from './CanonicalFieldRenderer';
import type { FieldReadModelItem } from './useFieldReadModel';

type RendererFieldRole =
  | 'LINE_IN'
  | 'LINE_OUT'
  | 'LINE_BRANCH'
  | 'TRANSFORMER_SN_NN'
  | 'MEASUREMENT_SN'
  | 'PV_SN'
  | 'BESS_SN'
  | 'FW_SN'
  | 'COUPLER_SN';

type RendererEmbeddingRole =
  | 'TRUNK_LEAF'
  | 'LOCAL_SECTIONAL';

type RendererDeviceType =
  | 'CB'
  | 'LOAD_SWITCH'
  | 'DS'
  | 'ES'
  | 'CT'
  | 'VT'
  | 'RELAY'
  | 'FUSE'
  | 'CABLE_HEAD'
  | 'TRANSFORMER_DEVICE'
  | 'GENERATOR_PV'
  | 'GENERATOR_BESS'
  | 'GENERATOR_FW'
  | 'PCS'
  | 'BATTERY';

type RendererElectricalRole =
  | 'POWER_PATH'
  | 'MEASUREMENT'
  | 'PROTECTION'
  | 'TERMINATION';

type RendererPowerPathPosition =
  | 'UPSTREAM'
  | 'MIDSTREAM'
  | 'DOWNSTREAM'
  | 'OFF_PATH';

function mapFieldRole(role: FieldReadModelItem['canonical_model']['base_model']['bay_role']): RendererFieldRole {
  switch (role) {
    case 'LINIA_IN':
      return 'LINE_IN';
    case 'LINIA_OUT':
      return 'LINE_OUT';
    case 'TRANSFORMATOROWE':
      return 'TRANSFORMER_SN_NN';
    case 'LINIA_ODG':
      return 'LINE_BRANCH';
    case 'SPRZEGLO':
      return 'COUPLER_SN';
    case 'POMIAROWE':
      return 'MEASUREMENT_SN';
    case 'PV_SN':
      return 'PV_SN';
    case 'BESS_SN':
      return 'BESS_SN';
    case 'FW_SN':
      return 'FW_SN';
    default:
      return 'LINE_OUT';
  }
}

function mapEmbeddingRole(role: FieldReadModelItem['canonical_model']['base_model']['bay_role']): RendererEmbeddingRole {
  return role === 'SPRZEGLO' ? 'LOCAL_SECTIONAL' : 'TRUNK_LEAF';
}

function mapDeviceType(kind: FieldReadModelItem['canonical_model']['base_model']['primary_devices'][number]['kind']): RendererDeviceType {
  return kind;
}

function mapElectricalRole(
  device: FieldReadModelItem['canonical_model']['base_model']['primary_devices'][number],
): RendererElectricalRole {
  switch (device.kind) {
    case 'CT':
    case 'VT':
      return 'MEASUREMENT';
    case 'CABLE_HEAD':
      return 'TERMINATION';
    case 'ES':
      return device.placement === 'GROUND_BRANCH' ? 'PROTECTION' : 'POWER_PATH';
    default:
      return 'POWER_PATH';
  }
}

function mapPowerPathPosition(
  device: FieldReadModelItem['canonical_model']['base_model']['primary_devices'][number],
  bayRole: FieldReadModelItem['canonical_model']['base_model']['bay_role'],
): RendererPowerPathPosition {
  if (bayRole === 'SPRZEGLO' && device.section_side) {
    switch (device.section_side) {
      case 'LEFT':
        return 'UPSTREAM';
      case 'CENTER':
        return 'MIDSTREAM';
      case 'RIGHT':
        return 'DOWNSTREAM';
    }
  }

  switch (device.placement) {
    case 'UPSTREAM':
      return 'UPSTREAM';
    case 'MIDSTREAM':
      return 'MIDSTREAM';
    case 'DOWNSTREAM':
      return 'DOWNSTREAM';
    case 'GROUND_BRANCH':
    case 'OFF_PATH':
    default:
      return 'OFF_PATH';
  }
}

function mapSwitchState(state: BayDeviceState | null | undefined): DeviceConfig['switchState'] {
  switch (state) {
    case 'zamkniety':
    case 'zamkniety_naped_rozbrojony':
      return 'CLOSED';
    case 'otwarty':
    case 'otwarty_naped_rozbrojony':
      return 'OPEN';
    case 'nieznany':
    case 'awaria':
    default:
      return 'UNKNOWN';
  }
}

function mapStateTone(state: BayDeviceState | null | undefined): DeviceConfig['stateTone'] {
  switch (state) {
    case 'zamkniety':
    case 'zamkniety_naped_rozbrojony':
      return 'closed';
    case 'otwarty':
    case 'otwarty_naped_rozbrojony':
      return 'open';
    case 'awaria':
      return 'fault';
    case 'nieznany':
    default:
      return 'unknown';
  }
}

function deviceOrderWeight(
  device: FieldReadModelItem['canonical_model']['base_model']['primary_devices'][number],
  bayRole: FieldReadModelItem['canonical_model']['base_model']['bay_role'],
): number {
  if (bayRole === 'SPRZEGLO') {
    const sectionWeight = device.section_side === 'LEFT'
      ? 0
      : device.section_side === 'CENTER'
        ? 10
        : device.section_side === 'RIGHT'
          ? 20
          : 30;
    const kindWeight = device.kind === 'CT' ? 1 : device.kind === 'ES' ? 2 : 0;
    return sectionWeight + kindWeight;
  }

  const placementWeight = device.placement === 'UPSTREAM'
    ? 0
    : device.placement === 'MIDSTREAM'
      ? 10
      : device.placement === 'DOWNSTREAM'
        ? 20
        : 30;
  const kindWeight = device.kind === 'DS'
    ? 0
    : device.kind === 'LOAD_SWITCH'
      ? 1
      : device.kind === 'CB'
        ? 2
        : device.kind === 'CT'
          ? 3
          : device.kind === 'VT'
            ? 4
            : device.kind === 'ES'
              ? 5
              : device.kind === 'CABLE_HEAD'
                ? 6
                : 7;
  return placementWeight + kindWeight;
}

function buildDeviceLabel(
  device: FieldReadModelItem['canonical_model']['base_model']['primary_devices'][number],
): string {
  const actualState = device.switch_state?.actual_state;
  if (!actualState) return device.device_ref;
  const shortState = actualState === 'zamkniety'
    ? 'Z'
    : actualState === 'otwarty'
      ? 'O'
      : actualState === 'awaria'
        ? 'A'
        : 'N';
  return `${device.device_ref} (${shortState})`;
}

export function buildBayWindowStationConfig(item: FieldReadModelItem): StationConfig {
  const baseModel = item.canonical_model.base_model;
  const bayRole = baseModel.bay_role;
  const primaryDevices = [...baseModel.primary_devices].sort((left, right) => {
    const leftWeight = deviceOrderWeight(left, bayRole);
    const rightWeight = deviceOrderWeight(right, bayRole);
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return left.device_ref.localeCompare(right.device_ref);
  });

  const devices: DeviceConfig[] = primaryDevices.map((device, index) => ({
    deviceId: `${String(index + 1).padStart(2, '0')}:${device.device_ref}`,
    deviceType: mapDeviceType(device.kind),
    electricalRole: mapElectricalRole(device),
    powerPathPosition: mapPowerPathPosition(device, bayRole),
    label: buildDeviceLabel(device),
    switchState: mapSwitchState(device.switch_state?.actual_state),
    stateTone: mapStateTone(device.switch_state?.actual_state),
  }));

  if (baseModel.protection_config) {
    devices.push({
      deviceId: `90:${baseModel.protection_config.unit_ref}`,
      deviceType: 'RELAY',
      electricalRole: 'PROTECTION',
      powerPathPosition: 'OFF_PATH',
      label: baseModel.protection_config.unit_ref,
      stateTone: 'normal',
    });
  }

  const fieldConfig: FieldConfig = {
    fieldId: baseModel.bay_ref,
    fieldRole: mapFieldRole(bayRole),
    devices,
    busSectionId: 'bus-section-1',
  };

  return {
    stationId: baseModel.bay_ref,
    stationName: item.bay_name,
    embeddingRole: mapEmbeddingRole(bayRole),
    fields: [fieldConfig],
    busSectionCount: bayRole === 'SPRZEGLO' ? 2 : 1,
  };
}

function legendItem(colorClass: string, label: string): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`} />
      <span>{label}</span>
    </div>
  );
}

export function BayWindowSchematic({ item }: { item: FieldReadModelItem }) {
  const config = buildBayWindowStationConfig(item);

  return (
    <div className="border-t border-gray-200 bg-slate-950">
      <div className="px-4 py-2 border-b border-slate-800">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          Schemat Kanoniczny
        </h4>
        <p className="mt-1 text-[11px] text-slate-400">
          Wspolny renderer pola V10 bez lokalnych skrotow symbolicznych.
        </p>
      </div>

      <div className="px-3 py-3">
        <CanonicalFieldRenderer
          config={config}
          renderContext="inspektor"
          selectedFieldId={config.fields[0]?.fieldId ?? null}
        />
      </div>

      <div className="px-4 pb-3 text-[10px] text-slate-300">
        <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Legenda</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {legendItem('bg-red-600', 'Zamkniety')}
          {legendItem('bg-green-600', 'Otwarty')}
          {legendItem('bg-amber-500', 'Stan nieznany')}
          {legendItem('bg-red-800', 'Awaria')}
        </div>
      </div>
    </div>
  );
}
