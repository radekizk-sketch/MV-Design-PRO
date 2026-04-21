import { describe, expect, it } from 'vitest';
import {
  collectRefs,
  filterBranchRows,
  filterBusRows,
  filterShortCircuitRows,
  resolveElementName,
} from '../readOnlyPanelShared';

describe('readOnlyPanelShared', () => {
  it('zbiera referencje stacji i filtruje powiązane wiersze wyników', () => {
    const snapshot = {
      substations: [
        {
          id: 'station-1',
          ref_id: 'station-1',
          name: 'ST-01',
          bus_refs: ['bus-sn', 'bus-nn'],
          transformer_refs: ['tr-1'],
        },
      ],
      branches: [
        {
          id: 'branch-1',
          ref_id: 'branch-1',
          name: 'Linia 1',
          from_bus_ref: 'bus-sn',
          to_bus_ref: 'bus-2',
        },
      ],
      buses: [
        { id: 'bus-sn', ref_id: 'bus-sn', name: 'Szyna SN' },
        { id: 'bus-nn', ref_id: 'bus-nn', name: 'Szyna nN' },
        { id: 'bus-2', ref_id: 'bus-2', name: 'Szyna odległa' },
      ],
      transformers: [
        {
          id: 'tr-1',
          ref_id: 'tr-1',
          hv_bus_ref: 'bus-sn',
          lv_bus_ref: 'bus-nn',
        },
      ],
      sources: [],
      loads: [],
      generators: [
        {
          id: 'pv-1',
          ref_id: 'pv-1',
          bus_ref: 'bus-nn',
          station_ref: 'station-1',
        },
      ],
      bays: [
        {
          id: 'bay-1',
          ref_id: 'bay-1',
          substation_ref: 'station-1',
          bus_ref: 'bus-sn',
          equipment_refs: ['switch-1'],
        },
      ],
      branch_points: [],
    } as any;

    const refs = collectRefs(snapshot, 'station-1', 'Station');

    expect(resolveElementName(snapshot, 'station-1', 'Station')).toBe('ST-01');
    expect(refs.has('station-1')).toBe(true);
    expect(refs.has('bus-sn')).toBe(true);
    expect(refs.has('tr-1')).toBe(true);
    expect(refs.has('bay-1')).toBe(true);
    expect(refs.has('pv-1')).toBe(true);
    expect(refs.has('switch-1')).toBe(true);

    expect(filterBusRows([
      { bus_id: 'bus-sn', name: 'Szyna SN', un_kv: 15, u_kv: 14.9, u_pu: 0.993, angle_deg: 0, flags: [] },
      { bus_id: 'bus-x', name: 'Obca szyna', un_kv: 15, u_kv: 14.7, u_pu: 0.98, angle_deg: 0, flags: [] },
    ], refs)).toHaveLength(1);

    expect(filterBranchRows([
      { branch_id: 'branch-1', name: 'Linia 1', from_bus: 'bus-sn', to_bus: 'bus-2', i_a: 120, s_mva: 2.2, p_mw: 2, q_mvar: 0.5, loading_pct: 61, flags: [] },
      { branch_id: 'branch-x', name: 'Obca linia', from_bus: 'bus-x', to_bus: 'bus-y', i_a: 33, s_mva: 0.8, p_mw: 0.7, q_mvar: 0.2, loading_pct: 25, flags: [] },
    ], refs)).toHaveLength(1);

    expect(filterShortCircuitRows([
      { target_id: 'bus-sn', target_name: 'Szyna SN', ikss_ka: 6.1, ip_ka: 13.2, ith_ka: 6, sk_mva: 158, fault_type: '3F', flags: [] },
      { target_id: 'bus-x', target_name: 'Obca szyna', ikss_ka: 2.1, ip_ka: 4.8, ith_ka: 2, sk_mva: 55, fault_type: '3F', flags: [] },
    ], refs)).toHaveLength(1);
  });

  it('nie zwraca helper-busa jako user-facing nazwy elementu', () => {
    const snapshot = {
      substations: [],
      branches: [],
      buses: [
        { id: 'bus/helper/downstream', ref_id: 'bus/helper/downstream', name: 'Szyna downstream' },
      ],
      transformers: [],
      sources: [],
      loads: [],
      generators: [],
      bays: [],
      branch_points: [],
    } as any;

    expect(resolveElementName(snapshot, 'bus/helper/downstream', 'Bus')).toBe('bus/helper/downstream');
    expect(collectRefs(snapshot, 'bus/helper/downstream', 'Bus').has('bus/helper/downstream')).toBe(true);
  });
});
