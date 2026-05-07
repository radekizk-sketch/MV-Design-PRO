import type { BayPrimaryDeviceKind } from '../../types/enm';
import type { FieldReadModelItem } from './useFieldReadModel';

export interface ControlDeviceOption {
  ref_id: string;
  name: string;
  kind: BayPrimaryDeviceKind;
  catalog_ref: string | null;
}

export interface FieldMeasurementCounts {
  ct: number;
  vt: number;
}

const CONTROL_DEVICE_LABELS: Partial<Record<BayPrimaryDeviceKind, string>> = {
  CB: 'wyłącznik',
  LOAD_SWITCH: 'rozłącznik',
  DS: 'odłącznik',
  FUSE: 'bezpiecznik',
};

const CONTROL_DEVICE_KINDS = new Set<BayPrimaryDeviceKind>([
  'CB',
  'LOAD_SWITCH',
  'DS',
  'FUSE',
]);

function deviceLabel(kind: BayPrimaryDeviceKind, refId: string): string {
  return `${CONTROL_DEVICE_LABELS[kind] ?? 'aparat'} ${refId}`;
}

export function buildControlDeviceOptions(
  item: FieldReadModelItem | null | undefined,
): ControlDeviceOption[] {
  const devices = item?.canonical_model.base_model.primary_devices ?? [];
  return devices
    .filter((device) => device.is_controllable || CONTROL_DEVICE_KINDS.has(device.kind))
    .map((device) => ({
      ref_id: device.device_ref,
      name: deviceLabel(device.kind, device.device_ref),
      kind: device.kind,
      catalog_ref: device.catalog_ref ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'pl'));
}

export function measurementCountsForField(
  item: FieldReadModelItem | null | undefined,
): FieldMeasurementCounts {
  const chain = item?.canonical_model.base_model.measurement_chain;
  return {
    ct: chain?.ct_refs.length ?? 0,
    vt: chain?.vt_refs.length ?? 0,
  };
}
