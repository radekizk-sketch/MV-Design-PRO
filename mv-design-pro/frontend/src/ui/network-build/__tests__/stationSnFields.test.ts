import { describe, expect, it } from 'vitest';
import type { Bay, Substation } from '../../../types/enm';
import type { FieldReadModelItem } from '../../field/useFieldReadModel';
import {
  stationReadModelSnFields,
  stationSnapshotBays,
  stationSnFieldCount,
  stationSnFieldSpecs,
} from '../stationSnFields';

const station = {
  id: 'st-1',
  ref_id: 'stn/st-1/station',
  name: 'Stacja testowa',
  station_type: 'mv_lv',
  bus_refs: ['bus-sn', 'bus-nn'],
  transformer_refs: [],
  meta: {
    field_specs: [
      { field_ref: 'st-1/sn/in', name: 'WE', bay_role: 'IN', bus_ref: 'bus-sn' },
      { field_ref: 'st-1/sn/out', name: 'WY', bay_role: 'OUT', bus_ref: 'bus-sn' },
      { field_ref: 'st-1/sn/tr', name: 'TR', bay_role: 'TR', bus_ref: 'bus-sn' },
    ],
  },
} as Substation & { meta: Record<string, unknown> };

function bay(ref: string, role: Bay['bay_role']): Bay {
  return {
    id: ref,
    ref_id: ref,
    name: ref,
    type: 'bay',
    substation_ref: station.ref_id,
    bay_role: role,
    bus_ref: 'bus-sn',
    equipment_refs: [],
  } as Bay;
}

function readModelField(ref: string): FieldReadModelItem {
  return {
    bay_id: ref,
    bay_ref: ref,
    bay_name: ref,
    canonical_model: {
      base_model: {
        substation_ref: station.ref_id,
        gpz_section_id: null,
      },
    },
  } as FieldReadModelItem;
}

describe('stationSnFields', () => {
  it('traktuje meta.field_specs jako kanoniczna liczbe pol SN stacji', () => {
    const duplicatedLegacyBays = [
      bay('st-1/legacy/in/a', 'IN'),
      bay('st-1/legacy/in/b', 'IN'),
      bay('st-1/legacy/out/a', 'OUT'),
      bay('st-1/legacy/out/b', 'OUT'),
      bay('st-1/legacy/tr/a', 'TR'),
      bay('st-1/legacy/tr/b', 'TR'),
    ];

    expect(stationSnFieldSpecs(station)).toHaveLength(3);
    expect(stationSnapshotBays(duplicatedLegacyBays, station)).toHaveLength(6);
    expect(stationSnFieldCount(station, duplicatedLegacyBays, [])).toBe(3);
  });

  it('zostawia fallback do read-modelu, gdy stacja nie ma field_specs ani legacy bays', () => {
    const stationWithoutSpecs = {
      ...station,
      meta: {},
    } as Substation & { meta: Record<string, unknown> };
    const fieldItems = Array.from({ length: 5 }, (_, index) =>
      readModelField(`field-${index + 1}`),
    );

    expect(stationReadModelSnFields(fieldItems, station.id, station.ref_id)).toHaveLength(5);
    expect(stationSnFieldCount(stationWithoutSpecs, [], fieldItems)).toBe(5);
  });
});
