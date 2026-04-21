import type { EnergyNetworkModel, Generator } from '../../types/enm';
import type { ElementType, SelectedElement } from '../types';
import { findOperationalBus, isOperationalBus } from './enmVisibility';

function matchByRef<T extends { ref_id: string; id: string; name: string }>(
  items: T[] | undefined,
  refOrId: string,
): T | null {
  return items?.find((item) => item.ref_id === refOrId || item.id === refOrId) ?? null;
}

function resolveGeneratorElementType(generator: Generator): ElementType {
  switch (generator.gen_type) {
    case 'pv_inverter':
      return 'PVInverter';
    case 'bess':
      return 'BESSInverter';
    case 'wind_inverter':
      return 'Generator';
    case 'synchronous':
      return 'Genset';
    default:
      return 'Generator';
  }
}

function isLowVoltageBusRef(snapshot: EnergyNetworkModel | null, busRef: string | null | undefined): boolean {
  if (!snapshot || typeof busRef !== 'string' || !busRef.trim()) {
    return false;
  }

  const bus = findOperationalBus(snapshot, busRef);
  return Boolean(bus && typeof bus.voltage_kv === 'number' && bus.voltage_kv > 0 && bus.voltage_kv < 1);
}

export function resolveElementTypeFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  refOrId: string | null | undefined,
): ElementType | null {
  if (!snapshot || typeof refOrId !== 'string' || !refOrId.trim()) {
    return null;
  }

  const normalizedRef = refOrId.trim();

  if (findOperationalBus(snapshot, normalizedRef)) {
    return 'Bus';
  }

  const branch = matchByRef(snapshot.branches, normalizedRef);
  if (branch) {
    return branch.type === 'cable' || branch.type === 'line_overhead' ? 'LineBranch' : 'Switch';
  }

  if (matchByRef(snapshot.transformers, normalizedRef)) {
    return 'TransformerBranch';
  }

  if (matchByRef(snapshot.sources, normalizedRef)) {
    return 'Source';
  }

  const load = matchByRef(snapshot.loads, normalizedRef);
  if (load) {
    return isLowVoltageBusRef(snapshot, load.bus_ref) ? 'LoadNN' : 'Load';
  }

  const generator = matchByRef(snapshot.generators, normalizedRef);
  if (generator) {
    return resolveGeneratorElementType(generator);
  }

  if (matchByRef(snapshot.substations, normalizedRef)) {
    return 'Station';
  }

  const bay = matchByRef(snapshot.bays, normalizedRef);
  if (bay) {
    return isLowVoltageBusRef(snapshot, bay.bus_ref) ? 'FeederNN' : 'BaySN';
  }

  const branchPoint = matchByRef(snapshot.branch_points ?? [], normalizedRef);
  if (branchPoint) {
    return branchPoint.branch_point_type === 'zksn' ? 'ZKSN' : 'BranchPole';
  }

  if (matchByRef(snapshot.corridors, normalizedRef)) {
    return 'LineBranch';
  }

  const junction = matchByRef(snapshot.junctions, normalizedRef);
  if (junction) {
    return junction.junction_type === 'NO_point' ? 'NOP' : 'Terminal';
  }

  const measurement = matchByRef(snapshot.measurements, normalizedRef);
  if (measurement) {
    return isLowVoltageBusRef(snapshot, measurement.bus_ref) ? 'MeasurementNN' : 'Measurement';
  }

  if (matchByRef(snapshot.protection_assignments, normalizedRef)) {
    return 'ProtectionAssignment';
  }

  return null;
}

export function resolveSelectedElementFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  refOrId: string | null | undefined,
  fallbackName?: string | null,
  fallbackType: ElementType = 'DescriptiveElement',
): SelectedElement | null {
  if (typeof refOrId !== 'string' || !refOrId.trim()) {
    return null;
  }

  const normalizedRef = refOrId.trim();
  const elementType = resolveElementTypeFromSnapshot(snapshot, normalizedRef);
  if (!elementType) {
    return {
      id: normalizedRef,
      type: fallbackType,
      name: fallbackName?.trim() || normalizedRef,
    };
  }

  const collections: Array<Array<{ ref_id: string; id: string; name: string }>> = [
    snapshot?.buses ?? [],
    snapshot?.branches ?? [],
    snapshot?.transformers ?? [],
    snapshot?.sources ?? [],
    snapshot?.loads ?? [],
    snapshot?.generators ?? [],
    snapshot?.substations ?? [],
    snapshot?.bays ?? [],
    snapshot?.junctions ?? [],
    snapshot?.corridors ?? [],
    snapshot?.measurements ?? [],
    snapshot?.protection_assignments ?? [],
    snapshot?.branch_points ?? [],
  ];

  for (const collection of collections) {
    const entry = matchByRef(collection, normalizedRef);
    if (entry) {
      return {
        id: normalizedRef,
        type: elementType,
        name: entry.name?.trim() || fallbackName?.trim() || normalizedRef,
      };
    }
  }

  return {
    id: normalizedRef,
    type: elementType,
    name: fallbackName?.trim() || normalizedRef,
  };
}

export function canonicalizeSelectedElement(
  snapshot: EnergyNetworkModel | null,
  element: SelectedElement | null,
): SelectedElement | null {
  if (!element) {
    return null;
  }

  if (element.type === 'Bus' && snapshot) {
    const rawBus = (snapshot.buses ?? []).find(
      (entry) => entry.ref_id === element.id || entry.id === element.id,
    );
    if (rawBus && !isOperationalBus(rawBus)) {
      return null;
    }
  }

  return resolveSelectedElementFromSnapshot(snapshot, element.id, element.name, element.type);
}
