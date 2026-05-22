import type { Bay, Substation } from '../../types/enm';
import type { FieldReadModelItem } from '../field/useFieldReadModel';

type StationWithMeta = Substation & { meta?: unknown };

type FieldSpecRecord = {
  id?: unknown;
  ref_id?: unknown;
  field_ref?: unknown;
  name?: unknown;
  bay_role?: unknown;
  bus_ref?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stableFieldKey(record: FieldSpecRecord | Bay | FieldReadModelItem, fallback: string): string {
  const candidate = 'field_ref' in record
    ? readString(record.field_ref)
    : null;
  if (candidate) return candidate;

  const refId = 'ref_id' in record ? readString(record.ref_id) : null;
  if (refId) return refId;

  const id = 'id' in record ? readString(record.id) : null;
  if (id) return id;

  if ('bay_ref' in record) {
    const bayRef = readString(record.bay_ref);
    if (bayRef) return bayRef;
  }

  return fallback;
}

function dedupeByStableKey<T extends FieldSpecRecord | Bay | FieldReadModelItem>(
  records: readonly T[],
  fallbackPrefix: string,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  records.forEach((record, index) => {
    const key = stableFieldKey(record, `${fallbackPrefix}:${index}`);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(record);
  });
  return result;
}

export function stationSnFieldSpecs(station: Substation | null | undefined): FieldSpecRecord[] {
  const meta = asRecord((station as StationWithMeta | null | undefined)?.meta);
  const rawSpecs = meta?.field_specs;
  if (!Array.isArray(rawSpecs)) return [];
  return dedupeByStableKey(
    rawSpecs.filter((spec): spec is FieldSpecRecord => asRecord(spec) !== null),
    'station-field-spec',
  );
}

export function stationSnapshotBays(
  bays: readonly Bay[] | null | undefined,
  station: Substation | null | undefined,
): Bay[] {
  if (!station) return [];
  return dedupeByStableKey(
    (bays ?? []).filter((bay) => (
      bay.substation_ref === station.id || bay.substation_ref === station.ref_id
    )),
    'station-bay',
  );
}

export function stationReadModelSnFields(
  items: readonly FieldReadModelItem[],
  stationId: string | null | undefined,
  stationRef: string | null | undefined,
): FieldReadModelItem[] {
  return dedupeByStableKey(
    items.filter((item) => {
      const itemStationRef = item.canonical_model.base_model.substation_ref;
      return Boolean(
        itemStationRef
          && (itemStationRef === stationId || itemStationRef === stationRef),
      );
    }),
    'station-read-model-field',
  );
}

export function stationSnFieldCount(
  station: Substation | null | undefined,
  bays: readonly Bay[] | null | undefined,
  fieldItems: readonly FieldReadModelItem[] = [],
): number {
  const specs = stationSnFieldSpecs(station);
  if (specs.length > 0) return specs.length;

  const snapshotBays = stationSnapshotBays(bays, station);
  if (snapshotBays.length > 0) return snapshotBays.length;

  return stationReadModelSnFields(fieldItems, station?.id, station?.ref_id).length;
}
