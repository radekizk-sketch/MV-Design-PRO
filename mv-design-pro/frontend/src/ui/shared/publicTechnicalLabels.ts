import type { EnergyNetworkModel, Substation } from '../../types/enm';
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
