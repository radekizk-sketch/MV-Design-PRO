import type { EnergyNetworkModel } from '../../types/enm';
import { canonicalRoleLabel } from './fieldLabels';
import type { FieldReadModelItem } from './useFieldReadModel';

type LegacyBay = EnergyNetworkModel['bays'][number];
type LegacyBus = EnergyNetworkModel['buses'][number];
type LegacyStation = EnergyNetworkModel['substations'][number];

export interface FieldReadModelSummary {
  ref_id: string;
  id: string;
  name: string;
  bay_role: string;
  bay_role_label: string;
  station_ref: string | null;
  station_name: string;
  bus_ref: string | null;
  bus_name: string;
  gpz_section_id: string | null;
  linked_refs: string[];
  fieldItem: FieldReadModelItem;
}

export interface FieldReadModelOption {
  ref_id: string;
  name: string;
  bay_role: string;
  station_name: string;
  bus_name: string;
  ct_count: number;
  vt_count: number;
}

function addUniqueRef(target: Set<string>, value: string | null | undefined) {
  if (value && value.trim()) {
    target.add(value);
  }
}

function findLegacyBay(
  snapshot: EnergyNetworkModel | null,
  bayRef: string | null | undefined,
  bayId: string | null | undefined,
): LegacyBay | null {
  if (!snapshot) {
    return null;
  }

  return snapshot.bays.find(
    (bay) => bay.ref_id === bayRef || bay.id === bayId || bay.id === bayRef || bay.ref_id === bayId,
  ) ?? null;
}

function findStation(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null | undefined,
): LegacyStation | null {
  if (!snapshot || !stationRef) {
    return null;
  }

  return snapshot.substations.find(
    (station) => station.ref_id === stationRef || station.id === stationRef,
  ) ?? null;
}

function findBus(
  snapshot: EnergyNetworkModel | null,
  busRef: string | null | undefined,
): LegacyBus | null {
  if (!snapshot || !busRef) {
    return null;
  }

  return snapshot.buses.find((bus) => bus.ref_id === busRef || bus.id === busRef) ?? null;
}

function resolveFieldBusRef(
  fieldItem: FieldReadModelItem,
  station: LegacyStation | null,
  legacyBayBusRef: string | null | undefined,
): string | null {
  if (legacyBayBusRef) {
    return legacyBayBusRef;
  }

  const gpzSectionId = fieldItem.canonical_model.base_model.gpz_section_id ?? null;
  if (gpzSectionId && Array.isArray(station?.gpz_sections)) {
    const section = station.gpz_sections.find((item) => item.section_id === gpzSectionId);
    if (section?.bus_ref) {
      return section.bus_ref;
    }
  }

  const stationBusRefs = Array.isArray(station?.bus_refs) ? station.bus_refs : [];
  return stationBusRefs.length === 1 ? stationBusRefs[0] : null;
}

function linkedRefsForFieldItem(item: FieldReadModelItem): string[] {
  const refs = new Set<string>();
  const baseModel = item.canonical_model.base_model;

  addUniqueRef(refs, item.bay_ref);
  addUniqueRef(refs, item.bay_id);
  addUniqueRef(refs, baseModel.bay_ref);
  addUniqueRef(refs, baseModel.substation_ref);
  addUniqueRef(refs, baseModel.measurement_chain?.chain_ref);
  addUniqueRef(refs, baseModel.protection_config?.unit_ref);

  baseModel.primary_devices.forEach((device) => {
    addUniqueRef(refs, device.device_ref);
    addUniqueRef(refs, device.linked_ref);
  });
  baseModel.measurement_chain?.ct_refs.forEach((ref) => addUniqueRef(refs, ref));
  baseModel.measurement_chain?.vt_refs.forEach((ref) => addUniqueRef(refs, ref));
  baseModel.secondary_units.forEach((unit) => addUniqueRef(refs, unit.unit_ref));

  return [...refs];
}

function measurementCounts(item: FieldReadModelItem) {
  const chain = item.canonical_model.base_model.measurement_chain;
  return {
    ct: chain?.ct_refs.length ?? 0,
    vt: chain?.vt_refs.length ?? 0,
  };
}

function resolveContextFieldRef(context: Record<string, unknown> | undefined): string {
  const fieldKeys = ['field_ref', 'bay_ref', 'existing_field_ref', 'feeder_ref'];
  for (const key of fieldKeys) {
    const value = typeof context?.[key] === 'string' ? context[key].trim() : '';
    if (value) {
      return value;
    }
  }
  return '';
}

export function buildFieldReadModelSummaries(
  items: readonly FieldReadModelItem[],
  snapshot: EnergyNetworkModel | null,
): FieldReadModelSummary[] {
  return items
    .map((item) => {
      const baseModel = item.canonical_model.base_model;
      const legacyBay = findLegacyBay(snapshot, item.bay_ref, item.bay_id);
      const station = findStation(snapshot, baseModel.substation_ref);
      const busRef = resolveFieldBusRef(item, station, legacyBay?.bus_ref ?? null);
      const bus = findBus(snapshot, busRef);

      return {
        ref_id: item.bay_ref,
        id: item.bay_id,
        name: item.bay_name,
        bay_role: baseModel.bay_role,
        bay_role_label: canonicalRoleLabel(baseModel.bay_role),
        station_ref: baseModel.substation_ref ?? null,
        station_name: station?.name ?? baseModel.substation_ref ?? 'Stacja nieprzypisana',
        bus_ref: busRef,
        bus_name: bus?.name ?? busRef ?? 'Szyna nieprzypisana',
        gpz_section_id: baseModel.gpz_section_id ?? null,
        linked_refs: linkedRefsForFieldItem(item),
        fieldItem: item,
      };
    })
    .sort((left, right) => {
      const stationCompare = left.station_name.localeCompare(right.station_name);
      if (stationCompare !== 0) return stationCompare;
      const roleCompare = left.bay_role_label.localeCompare(right.bay_role_label);
      if (roleCompare !== 0) return roleCompare;
      return left.name.localeCompare(right.name);
    });
}

export function buildFieldReadModelOptions(
  items: readonly FieldReadModelItem[],
  snapshot: EnergyNetworkModel | null,
): FieldReadModelOption[] {
  return buildFieldReadModelSummaries(items, snapshot).map((record) => {
    const counts = measurementCounts(record.fieldItem);
    return {
      ref_id: record.ref_id,
      name: record.name,
      bay_role: record.bay_role_label,
      station_name: record.station_name,
      bus_name: record.bus_name,
      ct_count: counts.ct,
      vt_count: counts.vt,
    };
  });
}

export function findFieldReadModelItemByLinkedRef(
  items: readonly FieldReadModelItem[],
  refId: string | null | undefined,
): FieldReadModelItem | null {
  if (!refId) {
    return null;
  }

  return buildFieldReadModelSummaries(items, null).find((record) => (
    record.ref_id === refId
    || record.id === refId
    || record.linked_refs.includes(refId)
  ))?.fieldItem ?? null;
}

export function resolveFieldReadModelItem(
  items: readonly FieldReadModelItem[],
  context: Record<string, unknown> | undefined,
): FieldReadModelItem | null {
  const directFieldRef = resolveContextFieldRef(context);
  if (directFieldRef) {
    return findFieldReadModelItemByLinkedRef(items, directFieldRef);
  }

  const elementRef = typeof context?.element_ref === 'string' ? context.element_ref.trim() : '';
  if (elementRef) {
    return findFieldReadModelItemByLinkedRef(items, elementRef);
  }

  return null;
}
