import type { Branch, EnergyNetworkModel, Substation } from '../../types/enm';
import { isTerrainSnSegment } from './enmVisibility';
import { formatStationTypeLabelPl } from './stationTypeLabels';

export function isRawTechnicalIdentifier(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\b(?:seg|gpz|stn|bay|bus|src)\/[a-z0-9/_#-]{12,}/i.test(value)
    || /\b[0-9a-f]{24,}\b/i.test(value)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(value);
}

export function publicTechnicalLabel(value: string | null | undefined, fallback: string): string {
  if (!value || isRawTechnicalIdentifier(value)) return fallback;
  return value;
}

export function isGenericStationName(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^stacja\s+(inline|terminal|branch|sectional)$/i.test(value.trim());
}

export function stationOrdinalCode(snapshot: EnergyNetworkModel, station: Substation): string {
  const fieldStations = (snapshot.substations ?? []).filter((item) =>
    String(item.station_type ?? '').toLowerCase() !== 'gpz',
  );
  const index = fieldStations.findIndex((item) =>
    item.id === station.id || item.ref_id === station.ref_id,
  );
  return `S${String(Math.max(0, index) + 1).padStart(2, '0')}`;
}

export function stationPublicIdentity(
  snapshot: EnergyNetworkModel,
  station: Substation,
): { code: string; typeLabel: string; displayName: string } {
  const code = stationOrdinalCode(snapshot, station);
  const typeLabel = formatStationTypeLabelPl(station.station_type);
  const fallback = `${code} · ${typeLabel}`;
  const displayName = isGenericStationName(station.name)
    ? fallback
    : publicTechnicalLabel(station.name, fallback);
  return { code, typeLabel, displayName };
}

export function isGenericSegmentName(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim();
  return /^odcinek\s+(?:\/?segment|sn)?$/i.test(normalized)
    || /^odcinek\s+\/?segment(?:\b|[\s-])/i.test(normalized)
    || /\b(?:do\s+punktu|za\s+punktem)\s+rozga/i.test(normalized)
    || /^segment(?:_[a-z0-9]+)*$/i.test(normalized)
    || /\/segment(?:_[lr])?$/i.test(normalized)
    || isRawTechnicalIdentifier(normalized);
}

export function segmentOrdinalCode(snapshot: EnergyNetworkModel, segment: Branch): string {
  const terrainSegments = (snapshot.branches ?? []).filter(isTerrainSnSegment);
  const index = terrainSegments.findIndex((item) =>
    item.id === segment.id || item.ref_id === segment.ref_id,
  );
  if (index >= 0) {
    return `Odcinek ${String(index + 1).padStart(2, '0')}`;
  }
  return 'Odcinek SN';
}

export function segmentPublicIdentity(
  snapshot: EnergyNetworkModel,
  segment: Branch,
): { code: string; displayName: string } {
  const code = segmentOrdinalCode(snapshot, segment);
  const displayName = isGenericSegmentName(segment.name)
    ? code
    : publicTechnicalLabel(segment.name, code);
  return { code, displayName };
}
