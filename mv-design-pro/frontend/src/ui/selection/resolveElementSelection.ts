import type { EnergyNetworkModel } from '../../types/enm';
import type { ElementType, SelectedElement } from '../types';

function findByRef<T>(
  items: T[] | undefined,
  predicate: (item: T) => boolean,
): T | undefined {
  return items?.find(predicate);
}

export function resolveElementTypeFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
): ElementType {
  if (!snapshot) return 'Bus';
  if (findByRef(snapshot.buses, (item) => item.ref_id === elementRef)) return 'Bus';
  if (findByRef(snapshot.branches, (item) => item.ref_id === elementRef)) return 'LineBranch';
  if (findByRef(snapshot.transformers, (item) => item.ref_id === elementRef)) return 'TransformerBranch';
  if (findByRef(snapshot.sources, (item) => item.ref_id === elementRef)) return 'Source';
  if (findByRef(snapshot.loads, (item) => item.ref_id === elementRef)) return 'Load';
  if (findByRef(snapshot.generators, (item) => item.ref_id === elementRef)) return 'Generator';
  if (findByRef(snapshot.substations, (item) => item.id === elementRef)) return 'Station';
  if (findByRef(snapshot.bays, (item) => item.id === elementRef)) return 'BaySN';
  if (findByRef(snapshot.branch_points, (item) => item.ref_id === elementRef)) return 'PortBranch';
  return 'Bus';
}

export function resolveElementNameFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
  fallbackName = elementRef,
): string {
  if (!snapshot) return fallbackName;

  return (
    findByRef(snapshot.buses, (item) => item.ref_id === elementRef)?.name ??
    findByRef(snapshot.branches, (item) => item.ref_id === elementRef)?.name ??
    findByRef(snapshot.transformers, (item) => item.ref_id === elementRef)?.name ??
    findByRef(snapshot.sources, (item) => item.ref_id === elementRef)?.name ??
    findByRef(snapshot.loads, (item) => item.ref_id === elementRef)?.name ??
    findByRef(snapshot.generators, (item) => item.ref_id === elementRef)?.name ??
    findByRef(snapshot.substations, (item) => item.id === elementRef)?.name ??
    findByRef(snapshot.bays, (item) => item.id === elementRef)?.name ??
    findByRef(snapshot.branch_points, (item) => item.ref_id === elementRef)?.name ??
    fallbackName
  );
}

export function resolveSelectedElementFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
  fallbackName = elementRef,
): SelectedElement {
  return {
    id: elementRef,
    type: resolveElementTypeFromSnapshot(snapshot, elementRef),
    name: resolveElementNameFromSnapshot(snapshot, elementRef, fallbackName),
  };
}
