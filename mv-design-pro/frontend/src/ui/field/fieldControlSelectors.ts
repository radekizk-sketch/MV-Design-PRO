import type { BayPrimaryDeviceKind } from '../../types/enm';
import { deviceKindLabel } from './fieldLabels';
import type { FieldReadModelItem } from './useFieldReadModel';

export interface CanonicalFieldControlDeviceOption {
  ref_id: string;
  name: string;
  kind: BayPrimaryDeviceKind;
}

function countMeasurements(item: FieldReadModelItem) {
  const chain = item.canonical_model.base_model.measurement_chain;
  return {
    ct: chain?.ct_refs.length ?? 0,
    vt: chain?.vt_refs.length ?? 0,
  };
}

export function buildControlDeviceOptions(
  item: FieldReadModelItem | null,
): CanonicalFieldControlDeviceOption[] {
  if (!item) return [];

  return item.canonical_model.base_model.primary_devices
    .filter((device) => device.is_controllable)
    .map((device) => ({
      ref_id: device.device_ref,
      name: `${deviceKindLabel(device.kind)} / ${device.device_ref}`,
      kind: device.kind,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function measurementCountsForField(item: FieldReadModelItem | null) {
  if (!item) {
    return { ct: 0, vt: 0 };
  }
  return countMeasurements(item);
}
