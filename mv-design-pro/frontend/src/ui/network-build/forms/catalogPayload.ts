import type { CatalogBinding, CatalogNamespace } from '../../catalog/types';
import { CANONICAL_CATALOG_VERSION } from '../../catalog/catalogBinding';
import {
  normalizeTopologicalStationKind,
  type TopologicalStationKind,
} from '../../shared/stationTypeLabels';

export type ManualSourceShortCircuitMode = 'SHORT_CIRCUIT_POWER' | 'IMPEDANCE';
export type GpzGroundingType =
  | 'isolated'
  | 'resistor_grounded'
  | 'petersen_coil'
  | 'solid_grounded';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function catalogRefFromInput(value: unknown): string | null {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['catalog_item_id', 'catalog_ref']) {
    const candidate = value[key];
    if (isNonEmptyString(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}

function namespaceFromInput(value: unknown): CatalogNamespace | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['catalog_namespace']) {
    const candidate = value[key];
    if (isNonEmptyString(candidate)) {
      return candidate.trim() as CatalogNamespace;
    }
  }

  return null;
}

function versionFromInput(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['catalog_item_version']) {
    const candidate = value[key];
    if (isNonEmptyString(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}

export function normalizeCatalogBinding(
  value: unknown,
  fallbackNamespace: CatalogNamespace | null,
  fallbackCatalogRef?: string | null,
  fallbackVersion: string = CANONICAL_CATALOG_VERSION,
): CatalogBinding | null {
  const catalogItemId = catalogRefFromInput(value) ?? (isNonEmptyString(fallbackCatalogRef) ? fallbackCatalogRef.trim() : null);
  const catalogNamespace = namespaceFromInput(value) ?? fallbackNamespace;

  if (!catalogItemId || !catalogNamespace) {
    return null;
  }

  return {
    catalog_namespace: catalogNamespace,
    catalog_item_id: catalogItemId,
    catalog_item_version: versionFromInput(value) ?? fallbackVersion,
    materialize: true,
    snapshot_mapping_version: '1.0',
  };
}

export function normalizeSegmentKind(
  kind: unknown,
): 'KABEL' | 'LINIA_NAPOWIETRZNA' {
  if (kind === 'LINIA_NAPOWIETRZNA' || kind === 'line_overhead') {
    return 'LINIA_NAPOWIETRZNA';
  }
  return 'KABEL';
}

export function normalizeSegmentNamespace(
  kind: unknown,
): CatalogNamespace {
  return normalizeSegmentKind(kind) === 'LINIA_NAPOWIETRZNA' ? 'LINIA_SN' : 'KABEL_SN';
}

export function normalizeSwitchState(value: unknown): 'open' | 'closed' {
  if (value === 'OPEN' || value === 'open' || value === 'OTWARTY') {
    return 'open';
  }
  return 'closed';
}

export function normalizeStationType(value: unknown): TopologicalStationKind {
  return normalizeTopologicalStationKind(value);
}
