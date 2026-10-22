import type { Branch, EnergyNetworkModel, Substation } from '../../types/enm';
import { isTerrainSnSegment } from './enmVisibility';
import { podpisStacjiPl } from './rodzajStacji';

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

/** Odwołanie techniczne w nazwie (ścieżka modelu, skrót, UUID) — nazwa nie nadaje się do ekranu. */
export function containsTechnicalReference(value: string): boolean {
  return /\/(?:segment|station|source|bay|bus|branch)\b/i.test(value)
    || /\b(?:do\s+punktu|za\s+punktem)\s+rozga/i.test(value)
    || /\b(?:seg|gpz|stn|bay|bus|src)\/[a-z0-9/_#-]{12,}/i.test(value)
    || /\b[0-9a-f]{24,}\b/i.test(value)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(value);
}

interface RekordStacji {
  readonly ref_id?: unknown;
  readonly id?: unknown;
  readonly station_type?: unknown;
  readonly name?: unknown;
  readonly station_code?: unknown;
  readonly code?: unknown;
}

function tekst(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * K6 (Z-11): JEDEN predykat „stacja GPZ" dla numeracji stacji terenowych — drzewo projektu,
 * kod porządkowy stacji i nagłówek inspektora liczą S01, S02… z tego samego zbioru.
 */
export function jestStacjaGpz(item: RekordStacji): boolean {
  const ref = String(item.ref_id ?? item.id ?? '');
  return ref.startsWith('gpz/') || tekst(item.station_type).toLowerCase().includes('gpz');
}

/**
 * K6 (Z-11): etykieta stacji w drzewie projektu i w nagłówku inspektora — JEDNA reguła:
 * kod stacji, potem nazwa nadana przez projektanta (bez nazw ogólnych i odwołań technicznych),
 * a bez nich numer porządkowy S01, S02… wśród stacji terenowych.
 */
export function etykietaStacjiWDrzewie(item: RekordStacji, index: number): string {
  const code = tekst(item.station_code) || tekst(item.code);
  if (code.trim()) return code.trim().toUpperCase();
  const name = tekst(item.name).trim();
  if (name && !/^stacja\s+(inline|terminal|sectional|branch)$/i.test(name) && !containsTechnicalReference(name)) {
    return name;
  }
  return `S${String(index + 1).padStart(2, '0')}`;
}

function indeksStacjiTerenowej(snapshot: EnergyNetworkModel, station: Substation): number {
  return (snapshot.substations ?? [])
    .filter((item) => !jestStacjaGpz(item))
    .findIndex((item) => item.id === station.id || item.ref_id === station.ref_id);
}

/**
 * Nazwa stacji tak jak w drzewie projektu (nagłówek inspektora, karta techniczna). GPZ nie ma
 * wiersza w sekcji stacji drzewa (pokazuje go sekcja zasilania) — jego nazwa to nazwa
 * nadana przez projektanta, a bez niej „GPZ".
 */
export function nazwaStacjiJakWDrzewie(snapshot: EnergyNetworkModel, station: Substation): string {
  if (jestStacjaGpz(station)) return publicTechnicalLabel(station.name, 'GPZ');
  return etykietaStacjiWDrzewie(station, Math.max(0, indeksStacjiTerenowej(snapshot, station)));
}

export function stationOrdinalCode(snapshot: EnergyNetworkModel, station: Substation): string {
  return `S${String(Math.max(0, indeksStacjiTerenowej(snapshot, station)) + 1).padStart(2, '0')}`;
}

export function stationPublicIdentity(
  snapshot: EnergyNetworkModel,
  station: Substation,
): { code: string; typeLabel: string; displayName: string } {
  const code = stationOrdinalCode(snapshot, station);
  // Rodzaj z JEDNEJ reguły produktu (`rodzajStacji.ts`) — nie z deklaracji `station_type`.
  const typeLabel = podpisStacjiPl(snapshot, station);
  const fallback = `${code} · ${typeLabel}`;
  const displayName = isGenericStationName(station.name)
    ? fallback
    : publicTechnicalLabel(station.name, fallback);
  return { code, typeLabel, displayName };
}

/**
 * Nazwa odcinka, którą ekran zastępuje numerem porządkowym („Odcinek 01"): brak nazwy,
 * nazwa ogólna („Odcinek", „Odcinek SN"), opis braku nadany przez backend („Odcinek bez
 * nazwy", także połówka dzielonego odcinka „Odcinek bez nazwy (2)") i połówki przy
 * punkcie rozgałęzienia. Dawne wzorce „Odcinek /segment" i „…/segment_L" zniknęły razem
 * z przyczyną — backend nie nadaje już nazwy z identyfikatora (karta #144).
 */
export function isGenericSegmentName(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim();
  return /^odcinek(?:\s+sn)?$/i.test(normalized)
    || /^odcinek\s+bez\s+nazwy(?:\s+\(\d+\))?$/i.test(normalized)
    || /\b(?:do\s+punktu|za\s+punktem)\s+rozga/i.test(normalized)
    || /^segment(?:_[a-z0-9]+)*$/i.test(normalized)
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
