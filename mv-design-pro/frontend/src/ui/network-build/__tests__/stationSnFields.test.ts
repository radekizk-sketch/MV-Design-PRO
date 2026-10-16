/**
 * Karta W5-B: pola SN stacji na kartach budowy sieci = rekordy `bays` stacji na szynie SN.
 * Iloczyn cech: {pole SN, pole nN, pole ZKSN, pole innej stacji} × {liczność, lista} oraz
 * read-model pola (projekcja backendu tych samych rekordów) bez dubli `bay_ref`.
 */
import { describe, expect, it } from 'vitest';
import type { Substation } from '../../../types/enm';
import type { FieldReadModelItem } from '../../field/useFieldReadModel';
import { pole } from '../../../test/pola';
import { stationReadModelSnFields, stationSnBays, stationSnFieldCount } from '../stationSnFields';

const station = {
  id: 'st-1',
  ref_id: 'stn/st-1/station',
  name: 'Stacja testowa',
  tags: [],
  meta: {},
  station_type: 'mv_lv',
  bus_refs: ['bus-sn', 'bus-nn'],
  transformer_refs: [],
} as Substation;

const snapshot = {
  buses: [
    { ref_id: 'bus-sn', voltage_kv: 15 },
    { ref_id: 'bus-nn', voltage_kv: 0.4 },
    { ref_id: 'bus-zksn', voltage_kv: 15 },
  ],
  bays: [
    pole({ ref_id: 'st-1/sn/in', bay_role: 'IN', substation_ref: station.ref_id, bus_ref: 'bus-sn' }),
    pole({ ref_id: 'st-1/sn/out', bay_role: 'OUT', substation_ref: station.ref_id, bus_ref: 'bus-sn' }),
    pole({ ref_id: 'st-1/sn/tr', bay_role: 'TR', substation_ref: station.ref_id, bus_ref: 'bus-sn' }),
    pole({ ref_id: 'st-1/nn/odp', bay_role: 'FEEDER', substation_ref: station.ref_id, bus_ref: 'bus-nn' }),
    pole({ ref_id: 'zksn/pole/MAIN_IN', bay_role: 'IN', branch_point_ref: 'zksn', bus_ref: 'bus-zksn' }),
    pole({ ref_id: 'st-2/sn/in', bay_role: 'IN', substation_ref: 'stn/st-2/station', bus_ref: 'bus-sn' }),
  ],
};

function readModelField(ref: string): FieldReadModelItem {
  return {
    bay_id: ref,
    bay_ref: ref,
    bay_name: ref,
    canonical_model: { base_model: { substation_ref: station.ref_id, gpz_section_id: null } },
  } as FieldReadModelItem;
}

describe('stationSnFields', () => {
  it('pola SN stacji: tylko rekordy tej stacji na szynie SN (bez pól nN, ZKSN i innej stacji)', () => {
    expect(stationSnBays(snapshot, station).map((b) => b.ref_id)).toEqual(['st-1/sn/in', 'st-1/sn/out', 'st-1/sn/tr']);
    expect(stationSnFieldCount(snapshot, station)).toBe(3);
  });

  it('brak stacji albo brak rekordów = zero pól (bez zapasu z innych danych)', () => {
    expect(stationSnBays(snapshot, null)).toEqual([]);
    expect(stationSnFieldCount({ bays: [] }, station)).toBe(0);
  });

  it('read-model pola stacji: wiersze tej stacji, każde pole raz', () => {
    const fieldItems = [readModelField('f-1'), readModelField('f-2'), readModelField('f-1')];
    expect(stationReadModelSnFields(fieldItems, station.id, station.ref_id).map((f) => f.bay_ref)).toEqual(['f-1', 'f-2']);
  });
});
