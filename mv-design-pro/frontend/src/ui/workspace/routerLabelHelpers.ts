/**
 * routerLabelHelpers — resolvery etykiet powierzchni roboczej
 * (Phase 0 #11 - jedenasta fala decompose WorkspaceSurfaceRouter).
 *
 * Pure functions do rozpoznawania nazw elementów + tytułów powierzchni.
 */

import {
  isGenericSegmentName,
  segmentPublicIdentity,
} from '../shared/publicTechnicalLabels';
import type { Branch, EnergyNetworkModel } from '../../types/enm';
import type { SelectedElement } from '../types';
import type { WorkspaceSurfaceDescriptor } from './types';
import { displayValueOrAuditTrace, publicEntityTypeLabel } from './routerDisplayHelpers';

export type NamedEnmElement = {
  id?: string | null;
  ref_id?: string | null;
  name?: string | null;
  label?: string | null;
};

export function findElementName(
  snapshot: EnergyNetworkModel | null,
  elementRef: string | null | undefined,
): string | null {
  if (!snapshot || !elementRef) return null;
  const branch = (snapshot.branches ?? []).find(
    (item) => item.ref_id === elementRef || item.id === elementRef,
  );
  if (branch) {
    return segmentPublicIdentity(snapshot, branch as Branch).displayName;
  }
  const candidates = [
    ...(snapshot.substations ?? []),
    ...(snapshot.bays ?? []),
    ...(snapshot.transformers ?? []),
    ...(snapshot.sources ?? []),
    ...(snapshot.loads ?? []),
    ...(snapshot.generators ?? []),
    ...(snapshot.measurements ?? []),
    ...(snapshot.protection_assignments ?? []),
    ...(snapshot.buses ?? []),
  ] as NamedEnmElement[];
  const found = candidates.find((item) => item.ref_id === elementRef || item.id === elementRef);
  return found?.name?.trim() || found?.label?.trim() || null;
}

export function payloadString(
  surface: WorkspaceSurfaceDescriptor,
  key: string,
): string | null {
  const value = surface.routeState.payload?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveSurfaceObjectLabel(
  surface: WorkspaceSurfaceDescriptor,
  snapshot: EnergyNetworkModel | null,
  selectedElement: SelectedElement | null,
): string {
  const selectedName = selectedElement?.id === surface.entityRef ? selectedElement.name : null;
  const routeName = payloadString(surface, 'selectedName');
  const snapshotName = findElementName(snapshot, surface.entityRef);
  const routeType = payloadString(surface, 'selectedType');
  const isSegmentSurface = surface.entityType === 'segment'
    || (typeof surface.entityRef === 'string' && /^seg\//i.test(surface.entityRef));
  const fallbackByType = routeType
    ? `Wybrany obiekt: ${routeType}`
    : surface.entityType
      ? `Wybrany układ: ${surface.entityType}`
      : 'Aktywny kontekst układu';
  const preferredName = isSegmentSurface
    ? snapshotName ?? selectedName ?? routeName ?? surface.entityRef
    : selectedName ?? routeName ?? snapshotName ?? surface.entityRef;
  const publicFallbackByType = routeType
    ? `Wybrany obiekt: ${publicEntityTypeLabel(routeType)}`
    : surface.entityType
      ? publicEntityTypeLabel(surface.entityType)
      : fallbackByType;
  return displayValueOrAuditTrace(preferredName, publicFallbackByType);
}

export function resolveSurfaceTitle(
  surface: WorkspaceSurfaceDescriptor,
  snapshot: EnergyNetworkModel | null,
  selectedElement: SelectedElement | null,
): string {
  const isSegmentSurface = surface.entityType === 'segment'
    || (typeof surface.entityRef === 'string' && /^seg\//i.test(surface.entityRef));
  if (isSegmentSurface && isGenericSegmentName(surface.titlePl)) {
    return resolveSurfaceObjectLabel(surface, snapshot, selectedElement);
  }
  return surface.titlePl;
}
