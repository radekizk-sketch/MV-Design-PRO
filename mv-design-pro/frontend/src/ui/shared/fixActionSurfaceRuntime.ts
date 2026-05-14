import type { CanonicalOpName } from '../../types/domainOps';
import type { EnergyNetworkModel } from '../../types/enm';
import type { FixActionSurfaceDescriptor } from '../../types/fixActionSurface';
import type { ElementType } from '../types';
import { resolveElementTypeFromSnapshot } from './selectionResolution';

function hasRefId(entity: { ref_id?: string; id?: string }, elementRef: string): boolean {
  return entity.ref_id === elementRef || entity.id === elementRef;
}

export function mapSurfaceElementType(rawType: string | null | undefined): ElementType {
  const normalized = rawType?.trim().toLowerCase();
  const map: Record<string, ElementType> = {
    bus: 'Bus',
    branch: 'LineBranch',
    linebranch: 'LineBranch',
    transformer: 'TransformerBranch',
    source: 'Source',
    load: 'Load',
    generator: 'Generator',
    substation: 'Station',
    station: 'Station',
    bay: 'BaySN',
    measurement: 'Measurement',
    protection_assignment: 'ProtectionAssignment',
    switch: 'Switch',
    branch_point: 'BranchPole',
    zksn: 'ZKSN',
    branch_pole: 'BranchPole',
  };
  return map[normalized ?? ''] ?? 'Bus';
}

export function resolveFixActionElementType(
  snapshot: EnergyNetworkModel | null,
  elementRef: string | null | undefined,
  explicitType: string | null | undefined,
): ElementType {
  if (!snapshot || !elementRef) {
    return explicitType ? mapSurfaceElementType(explicitType) : 'Bus';
  }

  const snapshotType = resolveElementTypeFromSnapshot(snapshot, elementRef);
  if (snapshotType) {
    return snapshotType;
  }

  if (explicitType) {
    return mapSurfaceElementType(explicitType);
  }

  if ((snapshot.buses ?? []).some((bus) => hasRefId(bus, elementRef))) {
    return 'Bus';
  }
  const branch = (snapshot.branches ?? []).find((item) => hasRefId(item, elementRef));
  if (branch) {
    return branch.type === 'switch' ||
      branch.type === 'breaker' ||
      branch.type === 'bus_coupler' ||
      branch.type === 'disconnector' ||
      branch.type === 'fuse'
      ? 'Switch'
      : 'LineBranch';
  }
  if ((snapshot.transformers ?? []).some((item) => hasRefId(item, elementRef))) {
    return 'TransformerBranch';
  }
  if ((snapshot.sources ?? []).some((item) => hasRefId(item, elementRef))) {
    return 'Source';
  }
  if ((snapshot.loads ?? []).some((item) => hasRefId(item, elementRef))) {
    return 'Load';
  }
  if ((snapshot.generators ?? []).some((item) => hasRefId(item, elementRef))) {
    return 'Generator';
  }
  const branchPoint = (snapshot.branch_points ?? []).find((item) => hasRefId(item, elementRef));
  if (branchPoint) {
    return branchPoint.branch_point_type === 'zksn' ? 'ZKSN' : 'BranchPole';
  }
  if ((snapshot.substations ?? []).some((item) => hasRefId(item, elementRef))) {
    return 'Station';
  }
  if ((snapshot.bays ?? []).some((item) => hasRefId(item, elementRef))) {
    return 'BaySN';
  }
  if ((snapshot.measurements ?? []).some((item) => hasRefId(item, elementRef))) {
    return 'Measurement';
  }
  if ((snapshot.protection_assignments ?? []).some((item) => hasRefId(item, elementRef))) {
    return 'ProtectionAssignment';
  }
  return 'Bus';
}

function resolveCatalogNamespaceFromBranchType(
  branchType: string,
): string | null {
  if (branchType === 'line_overhead') {
    return 'LINIA_SN';
  }
  if (branchType === 'cable') {
    return 'KABEL_SN';
  }
  return 'APARAT_SN';
}

export function resolveCatalogNamespaceFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  elementRef: string | null | undefined,
): string | null {
  if (!snapshot || !elementRef) {
    return null;
  }

  const branchPoint = (snapshot.branch_points ?? []).find((item) => hasRefId(item, elementRef));
  if (branchPoint) {
    return branchPoint.catalog_namespace ?? 'mv_branch_points';
  }

  const branch = (snapshot.branches ?? []).find((item) => hasRefId(item, elementRef));
  if (branch) {
    return branch.catalog_namespace ?? resolveCatalogNamespaceFromBranchType(branch.type);
  }

  const transformer = (snapshot.transformers ?? []).find((item) => hasRefId(item, elementRef));
  if (transformer) {
    return transformer.catalog_namespace ?? 'TRAFO_SN_NN';
  }

  const source = (snapshot.sources ?? []).find((item) => hasRefId(item, elementRef));
  if (source) {
    return source.catalog_namespace ?? 'ZRODLO_SN';
  }

  const load = (snapshot.loads ?? []).find((item) => hasRefId(item, elementRef));
  if (load) {
    return load.catalog_namespace ?? 'OBCIAZENIE';
  }

  const generator = (snapshot.generators ?? []).find((item) => hasRefId(item, elementRef));
  if (generator) {
    if (generator.catalog_namespace) {
      return generator.catalog_namespace;
    }
    if (generator.gen_type === 'pv_inverter') {
      return 'ZRODLO_NN_PV';
    }
    if (generator.gen_type === 'bess') {
      return 'ZRODLO_NN_BESS';
    }
    return 'CONVERTER';
  }

  const measurement = (snapshot.measurements ?? []).find((item) => hasRefId(item, elementRef));
  if (measurement) {
    return measurement.measurement_type === 'VT' ? 'VT' : 'CT';
  }

  const protection = (snapshot.protection_assignments ?? []).find((item) => hasRefId(item, elementRef));
  if (protection) {
    return 'ZABEZPIECZENIE';
  }

  return null;
}

export function buildFixActionOperationContext(
  surface: FixActionSurfaceDescriptor,
  snapshot: EnergyNetworkModel | null,
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    ...surface.context,
  };

  if (surface.element_ref && context.element_ref === undefined) {
    context.element_ref = surface.element_ref;
  }
  if (surface.focus_ref && context.focus_ref === undefined) {
    context.focus_ref = surface.focus_ref;
  }
  if (
    surface.operation === 'assign_catalog_to_element' &&
    context.catalog_namespace === undefined
  ) {
    const catalogNamespace = resolveCatalogNamespaceFromSnapshot(snapshot, surface.element_ref);
    if (catalogNamespace) {
      context.catalog_namespace = catalogNamespace;
    }
  }

  return context;
}

export function surfaceOpSupportsForm(
  surface: FixActionSurfaceDescriptor,
): surface is FixActionSurfaceDescriptor & { operation: CanonicalOpName } {
  return surface.kind === 'operation_form' && surface.operation !== null;
}
